import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createExternalMediaLinkSchema,
  detectExternalMediaPreview,
  parseAndNormalizeExternalMediaUrl,
} from "@/modules/admin/external-media";
import { scrubImageToWebp } from "@/modules/admin/media-processor";
import {
  createUploadIntentSchema,
  detectMediaSignature,
  getMaxBytesForKind,
  inspectPdfActiveTriggers,
  mapMediaPostgresError,
  reviewMediaSchema,
} from "@/modules/admin/media-validation";

describe("Validasi Signature, EXIF Scrub, & Keamanan Media (Fase 4)", () => {
  it("mengenali magic bytes JPEG, PNG, WebP, PDF, MP4 dan menolak SVG/HTML/ZIP (SEC-19)", () => {
    expect(
      detectMediaSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))
    ).toEqual({ ok: true, mime: "image/jpeg", ext: "jpg" });

    expect(
      detectMediaSignature(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
      )
    ).toEqual({ ok: true, mime: "image/png", ext: "png" });

    const webpHeader = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectMediaSignature(webpHeader)).toEqual({
      ok: true,
      mime: "image/webp",
      ext: "webp",
    });

    const pdfHeader = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
    expect(detectMediaSignature(pdfHeader)).toEqual({
      ok: true,
      mime: "application/pdf",
      ext: "pdf",
    });

    const mp4Header = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    ]);
    expect(detectMediaSignature(mp4Header)).toEqual({
      ok: true,
      mime: "video/mp4",
      ext: "mp4",
    });

    // Penolakan SVG, XML, HTML, dan ZIP
    const svg = detectMediaSignature(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    );
    expect(svg.ok).toBe(false);
    if (!svg.ok) expect(svg.reason).toBe("forbidden_svg_or_html");

    const html = detectMediaSignature(
      new TextEncoder().encode("<!DOCTYPE html><html><script>alert(1)</script></html>")
    );
    expect(html.ok).toBe(false);
    if (!html.ok) expect(html.reason).toBe("forbidden_svg_or_html");

    const zip = detectMediaSignature(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
    );
    expect(zip.ok).toBe(false);
    if (!zip.ok) expect(zip.reason).toBe("forbidden_zip");
  });

  it("mengonversi gambar ber-EXIF menjadi WebP bersih tanpa metadata EXIF menggunakan sharp (SEC-17)", async () => {
    const jpegWithExif = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 3,
        background: { r: 31, g: 77, b: 56 },
      },
    })
      .withExif({
        IFD0: {
          Make: "TestCam",
          Copyright: "SensitiveLocationTag",
        },
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const beforeMeta = await sharp(jpegWithExif).metadata();
    expect(beforeMeta.exif).toBeDefined();

    const scrubbed = await scrubImageToWebp(jpegWithExif);
    expect(scrubbed.mime).toBe("image/webp");
    expect(scrubbed.width).toBe(32);
    expect(scrubbed.height).toBe(24);
    expect(scrubbed.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(detectMediaSignature(scrubbed.buffer)).toEqual({
      ok: true,
      mime: "image/webp",
      ext: "webp",
    });

    const afterMeta = await sharp(scrubbed.buffer).metadata();
    expect(afterMeta.format).toBe("webp");
    expect(afterMeta.exif).toBeUndefined();
  });

  it("mendeteksi token pemicu aktif berbahaya pada PDF (SEC-20)", () => {
    const riskyPdf = new TextEncoder().encode(
      "%PDF-1.7\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert(1)) >> /Launch () /EmbeddedFile () >>"
    );
    const res = inspectPdfActiveTriggers(riskyPdf);
    expect(res.blockingTriggers).toContain("/JavaScript");
    expect(res.blockingTriggers).toContain("/Launch");
    expect(res.warningTriggers).toContain("/OpenAction");
    expect(res.warningTriggers).toContain("/EmbeddedFile");

    const cleanPdf = new TextEncoder().encode(
      "%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj"
    );
    expect(inspectPdfActiveTriggers(cleanPdf)).toEqual({
      blockingTriggers: [],
      warningTriggers: [],
    });
  });

  it("memvalidasi intent unggahan, batas ukuran, dan formulir keputusan review manusia (D4)", () => {
    expect(getMaxBytesForKind("image")).toBe(10 * 1024 * 1024);
    expect(getMaxBytesForKind("pdf")).toBe(25 * 1024 * 1024);
    expect(getMaxBytesForKind("video")).toBe(50 * 1024 * 1024);
    expect(getMaxBytesForKind("video", 300 * 1024 * 1024)).toBe(250 * 1024 * 1024);

    const validIntent = createUploadIntentSchema.safeParse({
      kind: "image",
      mime: "image/jpeg",
      bytes: 120_000,
    });
    expect(validIntent.success).toBe(true);

    const svgRejected = createUploadIntentSchema.safeParse({
      kind: "illustration",
      mime: "image/svg+xml",
      bytes: 2048,
    });
    expect(svgRejected.success).toBe(false);

    const mismatchMime = createUploadIntentSchema.safeParse({
      kind: "pdf",
      mime: "image/png",
      bytes: 2048,
    });
    expect(mismatchMime.success).toBe(false);

    const validClear = reviewMediaSchema.safeParse({
      decision: "cleared",
      credit: "Tim Dokumentasi EDMB",
      license: "CC-BY-NC 4.0",
      checked_no_location_leak: true,
      checked_rights_and_credit: true,
      attested_manual_scan: false,
      notes: "",
    });
    expect(validClear.success).toBe(true);

    const missingChecklist = reviewMediaSchema.safeParse({
      decision: "cleared",
      credit: "Tim Dokumentasi EDMB",
      license: "CC-BY-NC 4.0",
      checked_no_location_leak: false,
      checked_rights_and_credit: true,
    });
    expect(missingChecklist.success).toBe(false);

    const validReject = reviewMediaSchema.safeParse({
      decision: "rejected",
      notes: "Foto menampilkan plang alamat situs",
    });
    expect(validReject.success).toBe(true);

    const shortReject = reviewMediaSchema.safeParse({
      decision: "rejected",
      notes: "no",
    });
    expect(shortReject.success).toBe(false);
  });

  it("memetakan error SQL 0014 dan menjaga konsistensi migrasi SQL karantina media", () => {
    const refPubErr = mapMediaPostgresError({
      message: "STATE_CONFLICT:REFERENCED_BY_PUBLISHED",
    });
    expect(refPubErr?.status).toBe(409);

    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0014_admin_media_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");
    expect(sql).toContain("api.create_media_upload_intent");
    expect(sql).toContain("api.finalize_media_asset");
    expect(sql).toContain("api.review_media_asset");
    expect(sql).toContain("api.cleanup_orphan_media_uploads");
    expect(sql).toContain("media_orphan_cleanup");
  });

  it("memvalidasi, menormalisasi, dan menolak SSRF pada URL media eksternal (hemat storage)", () => {
    const ytWatch = parseAndNormalizeExternalMediaUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be",
      "video"
    );
    expect(ytWatch).toEqual({
      ok: true,
      data: {
        normalizedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        provider: "youtube",
        providerLabel: "YouTube",
        mime: "video/x-youtube",
        renderMode: "iframe",
        posterUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      },
    });

    const ytShort = parseAndNormalizeExternalMediaUrl(
      "https://youtu.be/dQw4w9WgXcQ",
      "video"
    );
    expect(ytShort.ok).toBe(true);
    if (ytShort.ok) {
      expect(ytShort.data.normalizedUrl).toBe(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
      );
    }

    const ytShorts = parseAndNormalizeExternalMediaUrl(
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "video"
    );
    expect(ytShorts.ok).toBe(true);
    if (ytShorts.ok) {
      expect(ytShorts.data.normalizedUrl).toBe(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
      );
    }

    expect(
      parseAndNormalizeExternalMediaUrl("https://youtu.be/dQw4w9WgXcQ", "image").ok
    ).toBe(false);

    const vimeo = parseAndNormalizeExternalMediaUrl(
      "https://vimeo.com/123456789",
      "video"
    );
    expect(vimeo.ok).toBe(true);
    if (vimeo.ok) {
      expect(vimeo.data.normalizedUrl).toBe(
        "https://player.vimeo.com/video/123456789?dnt=1"
      );
      expect(vimeo.data.provider).toBe("vimeo");
      expect(vimeo.data.renderMode).toBe("iframe");
    }

    const gdriveVideo = parseAndNormalizeExternalMediaUrl(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing",
      "video"
    );
    expect(gdriveVideo.ok).toBe(true);
    if (gdriveVideo.ok) {
      expect(gdriveVideo.data.normalizedUrl).toBe(
        "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/preview"
      );
      expect(gdriveVideo.data.renderMode).toBe("iframe");
    }

    const gdriveImg = parseAndNormalizeExternalMediaUrl(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view",
      "image"
    );
    expect(gdriveImg.ok).toBe(true);
    if (gdriveImg.ok) {
      expect(gdriveImg.data.normalizedUrl).toBe(
        "https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQr&sz=w1600"
      );
      expect(gdriveImg.data.renderMode).toBe("image");
    }

    const mp4 = parseAndNormalizeExternalMediaUrl(
      "https://cdn.example.org/dokumenter-menhir.mp4",
      "video"
    );
    expect(mp4.ok).toBe(true);
    if (mp4.ok) {
      expect(mp4.data.renderMode).toBe("video");
      expect(mp4.data.mime).toBe("video/mp4");
    }

    const photo = parseAndNormalizeExternalMediaUrl(
      "https://cdn.example.org/foto-menhir.jpg",
      "image"
    );
    expect(photo.ok).toBe(true);
    if (photo.ok) {
      expect(photo.data.renderMode).toBe("image");
      expect(photo.data.mime).toBe("image/jpeg");
    }

    const forbiddenUrls = [
      "http://example.org/foto-menhir.jpg",
      "javascript:alert(1)",
      "https://localhost/video.mp4",
      "https://127.0.0.1/video.mp4",
      "https://192.168.1.10/foto.jpg",
      "https://intranet/foto.jpg",
      "https://example.org/gambar.svg",
      "https://example.org/halaman.html",
    ];
    for (const badUrl of forbiddenUrls) {
      expect(
        parseAndNormalizeExternalMediaUrl(badUrl, "video").ok,
        `Seharusnya menolak ${badUrl}`
      ).toBe(false);
    }

    const preview = detectExternalMediaPreview(
      "https://youtu.be/dQw4w9WgXcQ",
      "video"
    );
    expect(preview.providerLabel).toBe("YouTube");
    expect(preview.posterUrl).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
    );

    expect(
      createExternalMediaLinkSchema.safeParse({
        kind: "video",
        url: "https://youtu.be/dQw4w9WgXcQ",
        credit: "Kanal Edukasi",
        license: "YouTube Standar",
      }).success
    ).toBe(true);

    expect(
      createExternalMediaLinkSchema.safeParse({
        kind: "video",
        url: "https://127.0.0.1/internal.mp4",
      }).success
    ).toBe(false);

    const dupUrlErr = mapMediaPostgresError({
      message: "VALIDATION_FAILED:URL_ALREADY_EXISTS",
    });
    expect(dupUrlErr).not.toBeNull();

    const sql0015Path = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0015_admin_external_media_rpc.sql"
    );
    const sql0015 = fs.readFileSync(sql0015Path, "utf8");
    expect(sql0015).toContain("api.register_external_media_link");
    expect(sql0015).toContain("external-link");
    expect(sql0015).toContain("api.review_media_asset");
    expect(sql0015).toContain("security definer");
    expect(sql0015).toContain("set search_path = ''");
  });
});
