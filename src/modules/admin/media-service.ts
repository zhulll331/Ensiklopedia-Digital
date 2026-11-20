import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import {
  parseAndNormalizeExternalMediaUrl,
  type ExternalMediaKind,
} from "@/modules/admin/external-media";
import {
  computeSha256Hex,
  scrubImageToWebp,
} from "@/modules/admin/media-processor";
import {
  PENDING_CHECKSUM_SENTINEL,
  detectMediaSignature,
  getMaxBytesForKind,
  inspectPdfActiveTriggers,
  isImageMime,
  isMimeAllowedForKind,
  mapMediaPostgresError,
  mimeToExtension,
  type AllowedMediaMime,
  type MediaKind,
  type MediaScanStatus,
} from "@/modules/admin/media-validation";
import { SAMPLE_MEDIA } from "@/modules/content/sample-data";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminMediaAssetItem {
  id: string;
  kind: MediaKind;
  storage_bucket: string;
  storage_path: string;
  visibility: "private" | "public";
  scan_status: MediaScanStatus;
  checksum_sha256: string;
  is_finalized: boolean;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  credit: string;
  license: string;
  metadata_scrubbed_at: string | null;
  created_at: string;
  preview_url: string | null;
}

export interface AdminMediaListResult {
  items: AdminMediaAssetItem[];
  counts: Record<MediaScanStatus, number> & { total: number };
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  maxBytesByKind: Record<MediaKind, number>;
}

function getConfiguredVideoMaxBytes(): number | undefined {
  const raw = process.env.MEDIA_MAX_VIDEO_BYTES;
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getEffectiveMaxBytesMap(): Record<MediaKind, number> {
  const videoCustom = getConfiguredVideoMaxBytes();
  return {
    image: getMaxBytesForKind("image"),
    illustration: getMaxBytesForKind("illustration"),
    pdf: getMaxBytesForKind("pdf"),
    video: getMaxBytesForKind("video", videoCustom),
    evidence: getMaxBytesForKind("evidence"),
  };
}

function buildSampleMediaAssets(filters?: {
  status?: MediaScanStatus;
  kind?: MediaKind;
  q?: string;
}): AdminMediaListResult {
  const clearedSamples: AdminMediaAssetItem[] = SAMPLE_MEDIA.map((m) => ({
    id: m.id,
    kind: m.kind,
    storage_bucket: "media-public",
    storage_path: m.src,
    visibility: "public",
    scan_status: m.scan_status,
    checksum_sha256: "a".repeat(64),
    is_finalized: true,
    mime: m.src.endsWith(".svg") ? "image/svg+xml" : "image/webp",
    bytes: 64_000,
    width: m.width,
    height: m.height,
    credit: m.credit,
    license: m.license,
    metadata_scrubbed_at: "2026-11-18T00:00:00Z",
    created_at: "2026-11-18T00:00:00Z",
    preview_url: m.src,
  }));

  const quarantineSamples: AdminMediaAssetItem[] = [
    {
      id: "sample-q-1",
      kind: "image",
      storage_bucket: "media-quarantine",
      storage_path: "quarantine/sample/foto-survei-menhir-baru.jpg",
      visibility: "private",
      scan_status: "quarantine",
      checksum_sha256: "b".repeat(64),
      is_finalized: true,
      mime: "image/jpeg",
      bytes: 1_840_320,
      width: 1200,
      height: 900,
      credit: "",
      license: "",
      metadata_scrubbed_at: null,
      created_at: "2026-04-02T03:00:00Z",
      preview_url: null,
    },
    {
      id: "sample-q-2",
      kind: "pdf",
      storage_bucket: "media-quarantine",
      storage_path: "quarantine/sample/lkpd-megalitik-kelas-4-draf.pdf",
      visibility: "private",
      scan_status: "quarantine",
      checksum_sha256: "c".repeat(64),
      is_finalized: true,
      mime: "application/pdf",
      bytes: 412_800,
      width: null,
      height: null,
      credit: "",
      license: "",
      metadata_scrubbed_at: null,
      created_at: "2026-04-02T03:15:00Z",
      preview_url: null,
    },
    {
      id: "sample-q-yt",
      kind: "video",
      storage_bucket: "external-link",
      storage_path: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
      visibility: "private",
      scan_status: "quarantine",
      checksum_sha256: "d".repeat(64),
      is_finalized: true,
      mime: "video/x-youtube",
      bytes: 1,
      width: null,
      height: null,
      credit: "Kanal Edukasi Budaya (Sampel YouTube)",
      license: "Tautan YouTube Standar",
      metadata_scrubbed_at: null,
      created_at: "2026-04-02T03:20:00Z",
      preview_url: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    },
  ];

  const allItems = [...quarantineSamples, ...clearedSamples];
  const counts: Record<MediaScanStatus, number> & { total: number } = {
    quarantine: 0,
    cleared: 0,
    rejected: 0,
    total: allItems.length,
  };
  for (const item of allItems) {
    counts[item.scan_status] += 1;
  }

  const needle = filters?.q?.trim().toLowerCase() ?? "";
  const filtered = allItems.filter((item) => {
    if (filters?.status && item.scan_status !== filters.status) return false;
    if (filters?.kind && item.kind !== filters.kind) return false;
    if (needle) {
      return (
        item.storage_path.toLowerCase().includes(needle) ||
        item.credit.toLowerCase().includes(needle) ||
        item.license.toLowerCase().includes(needle)
      );
    }
    return true;
  });

  return {
    items: filtered,
    counts,
    mode: "local_demo",
    migrationPending: false,
    maxBytesByKind: getEffectiveMaxBytesMap(),
  };
}

function mapRawAssetRow(
  row: Record<string, unknown>,
  previewUrl: string | null
): AdminMediaAssetItem {
  const checksum = String(row.checksum_sha256 ?? PENDING_CHECKSUM_SENTINEL);
  return {
    id: String(row.id),
    kind: row.kind as MediaKind,
    storage_bucket: String(row.storage_bucket),
    storage_path: String(row.storage_path),
    visibility: (row.visibility === "public" ? "public" : "private") as
      | "private"
      | "public",
    scan_status: (row.scan_status ?? "quarantine") as MediaScanStatus,
    checksum_sha256: checksum,
    is_finalized: checksum !== PENDING_CHECKSUM_SENTINEL,
    mime: String(row.mime),
    bytes: Number(row.bytes ?? 0),
    width: typeof row.width === "number" ? row.width : null,
    height: typeof row.height === "number" ? row.height : null,
    credit: String(row.credit ?? ""),
    license: String(row.license ?? ""),
    metadata_scrubbed_at: row.metadata_scrubbed_at
      ? String(row.metadata_scrubbed_at)
      : null,
    created_at: String(row.created_at),
    preview_url: previewUrl,
  };
}

export async function listAdminMediaAssetsAsync(
  session: AdminSessionResult,
  filters?: {
    status?: MediaScanStatus;
    kind?: MediaKind;
    q?: string;
  }
): Promise<AdminMediaListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return buildSampleMediaAssets(filters);
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client) {
    return {
      items: [],
      counts: { quarantine: 0, cleared: 0, rejected: 0, total: 0 },
      mode: "supabase",
      migrationPending: false,
      maxBytesByKind: getEffectiveMaxBytesMap(),
    };
  }

  const { data: rawRows, error } = await client
    .schema("app")
    .from("media_assets")
    .select(
      "id, kind, storage_bucket, storage_path, visibility, scan_status, checksum_sha256, mime, bytes, width, height, credit, license, metadata_scrubbed_at, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return {
        items: [],
        counts: { quarantine: 0, cleared: 0, rejected: 0, total: 0 },
        mode: "supabase",
        migrationPending: true,
        maxBytesByKind: getEffectiveMaxBytesMap(),
      };
    }
    throw new Error(`Gagal membaca aset media admin: ${error.message}`);
  }

  const allRaw = (rawRows ?? []) as Array<Record<string, unknown>>;
  const counts: Record<MediaScanStatus, number> & { total: number } = {
    quarantine: 0,
    cleared: 0,
    rejected: 0,
    total: allRaw.length,
  };
  for (const r of allRaw) {
    const st = String(r.scan_status ?? "quarantine") as MediaScanStatus;
    if (st in counts) {
      counts[st] += 1;
    }
  }

  const needle = filters?.q?.trim().toLowerCase() ?? "";
  const filteredRaw = allRaw.filter((r) => {
    if (filters?.status && r.scan_status !== filters.status) return false;
    if (filters?.kind && r.kind !== filters.kind) return false;
    if (needle) {
      const pathStr = String(r.storage_path ?? "").toLowerCase();
      const creditStr = String(r.credit ?? "").toLowerCase();
      const licStr = String(r.license ?? "").toLowerCase();
      return (
        pathStr.includes(needle) ||
        creditStr.includes(needle) ||
        licStr.includes(needle)
      );
    }
    return true;
  });

  const adminSecret = isSupabaseAdminConfigured()
    ? createAdminSecretSupabaseClient()
    : null;

  const items = await Promise.all(
    filteredRaw.map(async (row) => {
      const bucket = String(row.storage_bucket ?? "");
      const objPath = String(row.storage_path ?? "");
      const scanStatus = String(row.scan_status ?? "quarantine");
      const visibility = String(row.visibility ?? "private");
      const checksum = String(row.checksum_sha256 ?? PENDING_CHECKSUM_SENTINEL);
      let previewUrl: string | null = null;

      if (bucket === "external-link" && scanStatus !== "rejected") {
        previewUrl = objPath;
      } else if (
        scanStatus === "cleared" &&
        visibility === "public" &&
        bucket === "media-public"
      ) {
        const { data: pub } = client.storage
          .from("media-public")
          .getPublicUrl(objPath);
        previewUrl = pub.publicUrl;
      } else if (
        adminSecret &&
        bucket === "media-quarantine" &&
        scanStatus !== "rejected" &&
        checksum !== PENDING_CHECKSUM_SENTINEL
      ) {
        const { data: signed } = await adminSecret.storage
          .from("media-quarantine")
          .createSignedUrl(objPath, 300);
        previewUrl = signed?.signedUrl ?? null;
      }

      return mapRawAssetRow(row, previewUrl);
    })
  );

  return {
    items,
    counts,
    mode: "supabase",
    migrationPending: false,
    maxBytesByKind: getEffectiveMaxBytesMap(),
  };
}

function requireSupabaseAdminActor(session: AdminSessionResult) {
  if (
    !isSupabaseConfigured() ||
    !isSupabaseAdminConfigured() ||
    session.mode === "local_demo" ||
    !session.userId
  ) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mutasi media memerlukan koneksi Supabase yang terkonfigurasi (mode demo lokal bersifat baca-saja)."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Klien admin Supabase tidak tersedia."
    );
  }
  return { admin, actorId: session.userId };
}

export async function createMediaUploadIntentAsync(
  session: AdminSessionResult,
  input: {
    kind: MediaKind;
    mime: AllowedMediaMime;
    bytes: number;
    credit?: string;
    license?: string;
    requestId: string;
  }
): Promise<{
  asset: AdminMediaAssetItem;
  signed_url: string;
  token: string;
  path: string;
  max_bytes: number;
}> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const maxBytes = getMaxBytesForKind(input.kind, getConfiguredVideoMaxBytes());
  if (input.bytes > maxBytes) {
    throw new DomainError(
      413,
      "PAYLOAD_TOO_LARGE",
      `Ukuran berkas melebihi batas maksimal ${Math.round(maxBytes / (1024 * 1024))} MB untuk jenis '${input.kind}'.`
    );
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = mimeToExtension(input.mime);
  const storagePath = `quarantine/${input.kind}/${yyyy}/${mm}/${randomUUID()}.${ext}`;

  const { data: createdRow, error: rpcErr } = await admin
    .schema("api")
    .rpc("create_media_upload_intent", {
      p_actor_id: actorId,
      p_kind: input.kind,
      p_storage_path: storagePath,
      p_mime: input.mime,
      p_bytes: input.bytes,
      p_credit: input.credit ?? "",
      p_license: input.license ?? "",
      p_request_id: input.requestId,
    });

  if (rpcErr || !createdRow) {
    throw (
      (rpcErr ? mapMediaPostgresError(rpcErr) : null) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal membuat intent unggahan media: ${rpcErr?.message ?? "unknown"}`
      )
    );
  }

  const { data: signedData, error: signErr } = await admin.storage
    .from("media-quarantine")
    .createSignedUploadUrl(storagePath);

  if (signErr || !signedData) {
    await admin
      .schema("app")
      .from("media_assets")
      .delete()
      .eq("id", String((createdRow as Record<string, unknown>).id));
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      `Gagal menyiapkan URL unggahan bertanda tangan: ${signErr?.message ?? "unknown"}`
    );
  }

  return {
    asset: mapRawAssetRow(createdRow as Record<string, unknown>, null),
    signed_url: signedData.signedUrl,
    token: signedData.token,
    path: signedData.path,
    max_bytes: maxBytes,
  };
}

export async function registerExternalMediaLinkAsync(
  session: AdminSessionResult,
  input: {
    kind: ExternalMediaKind;
    url: string;
    credit?: string;
    license?: string;
    requestId: string;
  }
): Promise<{
  asset: AdminMediaAssetItem;
  provider_label: string;
  render_mode: string;
}> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const normalized = parseAndNormalizeExternalMediaUrl(input.url, input.kind);
  if (!normalized.ok) {
    throw new DomainError(422, "VALIDATION_FAILED", normalized.message);
  }

  const checksum = computeSha256Hex(
    Buffer.from(normalized.data.normalizedUrl, "utf8")
  );

  const { data: createdRow, error: rpcErr } = await admin
    .schema("api")
    .rpc("register_external_media_link", {
      p_actor_id: actorId,
      p_kind: input.kind,
      p_external_url: normalized.data.normalizedUrl,
      p_mime: normalized.data.mime,
      p_checksum_sha256: checksum,
      p_credit: input.credit ?? "",
      p_license: input.license ?? "",
      p_request_id: input.requestId,
    });

  if (rpcErr || !createdRow) {
    throw (
      (rpcErr ? mapMediaPostgresError(rpcErr) : null) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal mendaftarkan link media eksternal: ${rpcErr?.message ?? "unknown"}`
      )
    );
  }

  return {
    asset: mapRawAssetRow(
      createdRow as Record<string, unknown>,
      normalized.data.normalizedUrl
    ),
    provider_label: normalized.data.providerLabel,
    render_mode: normalized.data.renderMode,
  };
}

export async function finalizeMediaAssetAsync(
  session: AdminSessionResult,
  input: { assetId: string; requestId: string }
): Promise<{
  asset: AdminMediaAssetItem;
  pdf_warnings: string[];
}> {
  const { admin, actorId } = requireSupabaseAdminActor(session);

  const { data: existing, error: readErr } = await admin
    .schema("app")
    .from("media_assets")
    .select(
      "id, kind, storage_bucket, storage_path, visibility, scan_status, checksum_sha256, mime, bytes"
    )
    .eq("id", input.assetId)
    .maybeSingle();

  if (readErr) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      `Gagal membaca aset media: ${readErr.message}`
    );
  }
  if (!existing) {
    throw new DomainError(
      404,
      "RESOURCE_NOT_FOUND",
      "Aset media tidak ditemukan."
    );
  }
  if (existing.scan_status !== "quarantine") {
    throw new DomainError(
      409,
      "STATE_CONFLICT",
      "Hanya aset berstatus karantina yang dapat difinalisasi."
    );
  }
  if (existing.storage_bucket === "external-link") {
    throw new DomainError(
      409,
      "STATE_CONFLICT",
      "Aset link eksternal tidak melewati proses finalisasi bucket karantina; langsung lanjutkan pemeriksaan kurator."
    );
  }

  const { data: blob, error: dlErr } = await admin.storage
    .from(existing.storage_bucket)
    .download(existing.storage_path);

  if (dlErr || !blob) {
    throw new DomainError(
      404,
      "RESOURCE_NOT_FOUND",
      "Berkas belum ditemukan di bucket karantina. Pastikan unggahan selesai sebelum finalisasi."
    );
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const kind = existing.kind as MediaKind;
  const maxBytes = getMaxBytesForKind(kind, getConfiguredVideoMaxBytes());
  if (buf.byteLength === 0 || buf.byteLength > maxBytes) {
    await admin.storage
      .from(existing.storage_bucket)
      .remove([existing.storage_path]);
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      `Ukuran berkas nyata (${buf.byteLength} byte) berada di luar batas yang diizinkan.`
    );
  }

  const sig = detectMediaSignature(buf);
  if (!sig.ok) {
    await admin.storage
      .from(existing.storage_bucket)
      .remove([existing.storage_path]);
    throw new DomainError(422, "VALIDATION_FAILED", sig.message);
  }

  if (!isMimeAllowedForKind(kind, sig.mime)) {
    await admin.storage
      .from(existing.storage_bucket)
      .remove([existing.storage_path]);
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      `Signature biner nyata (${sig.mime}) tidak cocok dengan jenis aset '${kind}'.`
    );
  }

  let finalPath = existing.storage_path;
  let finalMime: AllowedMediaMime = sig.mime;
  let finalBytes = buf.byteLength;
  let finalSha = computeSha256Hex(buf);
  let finalWidth: number | null = null;
  let finalHeight: number | null = null;
  let markScrubbed = false;
  let pdfWarnings: string[] = [];

  if (isImageMime(sig.mime)) {
    let scrubbed;
    try {
      scrubbed = await scrubImageToWebp(buf);
    } catch {
      await admin.storage
        .from(existing.storage_bucket)
        .remove([existing.storage_path]);
      throw new DomainError(
        422,
        "VALIDATION_FAILED",
        "Gambar gagal diproses ulang oleh scrubber. Pastikan berkas tidak korup."
      );
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const sanitizedPath = `quarantine/sanitized/${yyyy}/${mm}/${randomUUID()}.webp`;

    const { error: upErr } = await admin.storage
      .from("media-quarantine")
      .upload(sanitizedPath, scrubbed.buffer, {
        contentType: "image/webp",
        upsert: false,
      });

    if (upErr) {
      throw new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal menyimpan hasil pembersihan WebP: ${upErr.message}`
      );
    }

    if (existing.storage_path !== sanitizedPath) {
      await admin.storage
        .from(existing.storage_bucket)
        .remove([existing.storage_path]);
    }

    finalPath = sanitizedPath;
    finalMime = "image/webp";
    finalBytes = scrubbed.buffer.byteLength;
    finalSha = scrubbed.sha256;
    finalWidth = scrubbed.width;
    finalHeight = scrubbed.height;
    markScrubbed = true;
  } else if (sig.mime === "application/pdf") {
    const triggers = inspectPdfActiveTriggers(buf);
    if (triggers.blockingTriggers.length > 0) {
      await admin.storage
        .from(existing.storage_bucket)
        .remove([existing.storage_path]);
      throw new DomainError(
        422,
        "VALIDATION_FAILED",
        `SEC-20: PDF ditolak karena mengandung elemen aktif berbahaya (${triggers.blockingTriggers.join(", ")}).`
      );
    }
    pdfWarnings = triggers.warningTriggers;
  }

  const { data: finalizedRow, error: rpcErr } = await admin
    .schema("api")
    .rpc("finalize_media_asset", {
      p_actor_id: actorId,
      p_asset_id: input.assetId,
      p_storage_path: finalPath,
      p_mime: finalMime,
      p_bytes: finalBytes,
      p_checksum_sha256: finalSha,
      p_width: finalWidth,
      p_height: finalHeight,
      p_mark_scrubbed: markScrubbed,
      p_request_id: input.requestId,
    });

  if (rpcErr || !finalizedRow) {
    throw (
      (rpcErr ? mapMediaPostgresError(rpcErr) : null) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal memperbarui metadata karantina: ${rpcErr?.message ?? "unknown"}`
      )
    );
  }

  const { data: signedPreview } = await admin.storage
    .from("media-quarantine")
    .createSignedUrl(finalPath, 300);

  return {
    asset: mapRawAssetRow(
      finalizedRow as Record<string, unknown>,
      signedPreview?.signedUrl ?? null
    ),
    pdf_warnings: pdfWarnings,
  };
}

export async function reviewMediaAssetAsync(
  session: AdminSessionResult,
  input: {
    assetId: string;
    decision: "cleared" | "rejected";
    credit?: string;
    license?: string;
    checked_no_location_leak?: boolean;
    checked_rights_and_credit?: boolean;
    attested_manual_scan?: boolean;
    notes: string;
    requestId: string;
  }
): Promise<AdminMediaAssetItem> {
  const { admin, actorId } = requireSupabaseAdminActor(session);

  const { data: existing, error: readErr } = await admin
    .schema("app")
    .from("media_assets")
    .select(
      "id, kind, storage_bucket, storage_path, visibility, scan_status, checksum_sha256, mime, bytes, metadata_scrubbed_at"
    )
    .eq("id", input.assetId)
    .maybeSingle();

  if (readErr) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      `Gagal membaca aset media: ${readErr.message}`
    );
  }
  if (!existing) {
    throw new DomainError(
      404,
      "RESOURCE_NOT_FOUND",
      "Aset media tidak ditemukan."
    );
  }

  if (input.decision === "cleared") {
    if (existing.checksum_sha256 === PENDING_CHECKSUM_SENTINEL) {
      throw new DomainError(
        409,
        "STATE_CONFLICT",
        "Berkas belum selesai difinalisasi karantina."
      );
    }

    const kind = existing.kind as MediaKind;
    const isExternalLink = existing.storage_bucket === "external-link";
    const needsManualAttestation =
      isExternalLink ||
      kind === "pdf" ||
      kind === "video" ||
      existing.mime === "application/pdf" ||
      existing.mime === "video/mp4";

    if (needsManualAttestation && input.attested_manual_scan !== true) {
      throw new DomainError(
        422,
        "VALIDATION_FAILED",
        "Aset PDF, video, atau link eksternal memerlukan centang atestasi pemeriksaan manual (D4 / SEC-20)."
      );
    }

    if (!isExternalLink && isImageMime(existing.mime) && !existing.metadata_scrubbed_at) {
      throw new DomainError(
        422,
        "VALIDATION_FAILED",
        "Gambar belum dibersihkan metadata EXIF-nya. Jalankan finalisasi ulang lebih dulu."
      );
    }

    let targetBucket = existing.storage_bucket;
    let targetPath = existing.storage_path;
    let copiedToPublic = false;

    if (
      !isExternalLink &&
      kind !== "evidence" &&
      existing.storage_bucket === "media-quarantine"
    ) {
      const { data: blob, error: dlErr } = await admin.storage
        .from("media-quarantine")
        .download(existing.storage_path);
      if (dlErr || !blob) {
        throw new DomainError(
          404,
          "RESOURCE_NOT_FOUND",
          "Objek berkas di karantina tidak ditemukan saat dipromosikan."
        );
      }

      const now = new Date();
      const yyyy = now.getUTCFullYear();
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const ext = mimeToExtension(existing.mime as AllowedMediaMime);
      targetBucket = "media-public";
      targetPath = `public/${kind}/${yyyy}/${mm}/${randomUUID()}.${ext}`;

      const payload = Buffer.from(await blob.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from("media-public")
        .upload(targetPath, payload, {
          contentType: existing.mime,
          cacheControl: "31536000",
          upsert: false,
        });
      if (upErr) {
        throw new DomainError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          `Gagal mempromosikan media ke bucket publik: ${upErr.message}`
        );
      }
      copiedToPublic = true;
    }

    const { data: reviewedRow, error: rpcErr } = await admin
      .schema("api")
      .rpc("review_media_asset", {
        p_actor_id: actorId,
        p_asset_id: input.assetId,
        p_decision: "cleared",
        p_storage_bucket: targetBucket,
        p_storage_path: targetPath,
        p_credit: input.credit ?? "",
        p_license: input.license ?? "",
        p_mark_scrubbed: true,
        p_review_notes: input.notes ?? "",
        p_checklist: {
          checked_no_location_leak: Boolean(input.checked_no_location_leak),
          checked_rights_and_credit: Boolean(input.checked_rights_and_credit),
          attested_manual_scan: Boolean(input.attested_manual_scan),
        },
        p_request_id: input.requestId,
      });

    if (rpcErr || !reviewedRow) {
      if (copiedToPublic) {
        await admin.storage.from("media-public").remove([targetPath]);
      }
      throw (
        (rpcErr ? mapMediaPostgresError(rpcErr) : null) ??
        new DomainError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          `Gagal menyimpan keputusan persetujuan media: ${rpcErr?.message ?? "unknown"}`
        )
      );
    }

    if (copiedToPublic && existing.storage_path) {
      await admin.storage
        .from("media-quarantine")
        .remove([existing.storage_path]);
    }

    if (kind !== "evidence") {
      revalidatePath("/media");
      revalidatePath("/jelajah-situs");
    }

    const pubUrl =
      targetBucket === "external-link"
        ? targetPath
        : targetBucket === "media-public"
          ? admin.storage.from("media-public").getPublicUrl(targetPath).data
              .publicUrl
          : null;

    return mapRawAssetRow(reviewedRow as Record<string, unknown>, pubUrl);
  }

  // decision === "rejected"
  const { data: rejectedRow, error: rejErr } = await admin
    .schema("api")
    .rpc("review_media_asset", {
      p_actor_id: actorId,
      p_asset_id: input.assetId,
      p_decision: "rejected",
      p_review_notes: input.notes,
      p_checklist: {
        rejected_reason_present: true,
      },
      p_request_id: input.requestId,
    });

  if (rejErr || !rejectedRow) {
    throw (
      (rejErr ? mapMediaPostgresError(rejErr) : null) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal menolak aset media: ${rejErr?.message ?? "unknown"}`
      )
    );
  }

  if (
    existing.storage_bucket &&
    existing.storage_bucket !== "external-link" &&
    existing.storage_path
  ) {
    await admin.storage
      .from(existing.storage_bucket)
      .remove([existing.storage_path]);
  }

  return mapRawAssetRow(rejectedRow as Record<string, unknown>, null);
}

export async function cleanupOrphanMediaUploadsAsync(params: {
  actorId?: string | null;
  olderThanMinutes?: number;
  requestId: string;
}): Promise<{ deleted_count: number; deleted_storage_count: number }> {
  if (!isSupabaseConfigured() || !isSupabaseAdminConfigured()) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Koneksi admin Supabase belum terkonfigurasi."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Klien admin Supabase tidak tersedia."
    );
  }

  const { data, error } = await admin
    .schema("api")
    .rpc("cleanup_orphan_media_uploads", {
      p_actor_id: params.actorId ?? null,
      p_older_than_minutes: params.olderThanMinutes ?? 120,
      p_request_id: params.requestId,
    });

  if (error) {
    throw (
      mapMediaPostgresError(error) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal membersihkan unggahan media yatim: ${error.message}`
      )
    );
  }

  const parsed = (data ?? {}) as {
    deleted_count?: number;
    deleted_objects?: Array<{ storage_bucket: string; storage_path: string }>;
  };
  const objects = Array.isArray(parsed.deleted_objects)
    ? parsed.deleted_objects
    : [];

  let storageRemoved = 0;
  if (objects.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const obj of objects) {
      if (!obj.storage_bucket || !obj.storage_path) continue;
      const list = byBucket.get(obj.storage_bucket) ?? [];
      list.push(obj.storage_path);
      byBucket.set(obj.storage_bucket, list);
    }

    for (const [bucket, paths] of byBucket.entries()) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
      if (!rmErr) {
        storageRemoved += paths.length;
      }
    }
  }

  return {
    deleted_count: Number(parsed.deleted_count ?? 0),
    deleted_storage_count: storageRemoved,
  };
}
