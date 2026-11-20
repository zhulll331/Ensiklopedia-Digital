import { z } from "zod";

export const EXTERNAL_MEDIA_KINDS = [
  "image",
  "illustration",
  "video",
  "pdf",
] as const;
export type ExternalMediaKind = (typeof EXTERNAL_MEDIA_KINDS)[number];

export type ExternalMediaProvider =
  | "youtube"
  | "vimeo"
  | "gdrive"
  | "direct_video"
  | "external_link"
  | "external_image"
  | "external_pdf";

export type ExternalMediaRenderMode = "iframe" | "video" | "image" | "link";

export interface NormalizedExternalMedia {
  normalizedUrl: string;
  provider: ExternalMediaProvider;
  providerLabel: string;
  mime: string;
  renderMode: ExternalMediaRenderMode;
  posterUrl: string | null;
}

const DISALLOWED_PATH_SUFFIXES = [
  ".svg",
  ".svgz",
  ".html",
  ".htm",
  ".xhtml",
  ".xml",
  ".zip",
  ".rar",
  ".7z",
  ".exe",
  ".bat",
  ".sh",
];

function isPrivateOrForbiddenHostname(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    return true;
  }

  // IPv6 loopback, unspecified, link-local, unique-local, atau IPv4-mapped
  if (host.includes(":")) {
    if (
      host === "::" ||
      host === "::1" ||
      host.startsWith("fe80:") ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("::ffff:")
    ) {
      return true;
    }
    return false;
  }

  // Hostname wajib memuat titik (mencegah host intranet satu kata)
  if (!host.includes(".")) {
    return true;
  }

  // Cek IPv4 privat / loopback / link-local / CGNAT
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    const c = Number(ipv4Match[3]);
    const d = Number(ipv4Match[4]);
    if (
      [a, b, c, d].some((oct) => !Number.isInteger(oct) || oct < 0 || oct > 255)
    ) {
      return true;
    }
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }

  return false;
}

function extractYouTubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;

  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com"
  ) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") {
      candidate = url.searchParams.get("v");
    } else if (
      segments[0] === "embed" ||
      segments[0] === "shorts" ||
      segments[0] === "live"
    ) {
      candidate = segments[1] ?? null;
    }
  } else {
    return null;
  }

  if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) {
    return candidate;
  }
  return null;
}

function isYouTubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "youtu.be" ||
    host === "www.youtu.be" ||
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "www.youtube-nocookie.com"
  );
}

function extractVimeoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (
    host !== "vimeo.com" &&
    host !== "www.vimeo.com" &&
    host !== "player.vimeo.com"
  ) {
    return null;
  }
  const match = url.pathname.match(
    /^\/(?:video\/|channels\/[^/]+\/)?(\d{5,15})(?:\/|$)/
  );
  return match?.[1] ?? null;
}

function extractGoogleDriveId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (host !== "drive.google.com") return null;

  const fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,80})/);
  if (fileMatch?.[1]) {
    return fileMatch[1];
  }

  const idParam = url.searchParams.get("id");
  if (idParam && /^[A-Za-z0-9_-]{10,80}$/.test(idParam)) {
    return idParam;
  }

  return null;
}

export function parseAndNormalizeExternalMediaUrl(
  rawUrl: string,
  kind: ExternalMediaKind
):
  | { ok: true; data: NormalizedExternalMedia }
  | { ok: false; message: string } {
  const trimmed = rawUrl.trim();
  if (trimmed.length < 12 || trimmed.length > 1000) {
    return {
      ok: false,
      message: "URL eksternal harus sepanjang 12 hingga 1000 karakter.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      message: "Format URL tidak valid. Contoh: https://youtu.be/...",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      message:
        "Demi keamanan siswa, link media eksternal wajib menggunakan HTTPS (https://).",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "URL tidak boleh menyertakan kredensial akun.",
    };
  }

  if (parsed.port && parsed.port !== "443") {
    return {
      ok: false,
      message: "Port jaringan non-standar pada URL media tidak diizinkan.",
    };
  }

  if (isPrivateOrForbiddenHostname(parsed.hostname)) {
    return {
      ok: false,
      message:
        "SEC-22: Host lokal atau alamat IP privat/internal tidak diizinkan sebagai link media.",
    };
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (DISALLOWED_PATH_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix))) {
    return {
      ok: false,
      message:
        "SEC-19: Berkas SVG, HTML, XML, arsip ZIP, atau executable tidak diizinkan.",
    };
  }

  // Deteksi YouTube
  if (isYouTubeHost(parsed.hostname)) {
    const ytId = extractYouTubeId(parsed);
    if (!ytId) {
      return {
        ok: false,
        message:
          "URL YouTube tidak memuat ID video yang sah (watch?v=, youtu.be/, atau shorts/).",
      };
    }
    if (kind !== "video") {
      return {
        ok: false,
        message: "Tautan YouTube harus didaftarkan dengan jenis aset 'video'.",
      };
    }
    return {
      ok: true,
      data: {
        normalizedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
        provider: "youtube",
        providerLabel: "YouTube",
        mime: "video/x-youtube",
        renderMode: "iframe",
        posterUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      },
    };
  }

  // Deteksi Vimeo
  const vimeoId = extractVimeoId(parsed);
  if (vimeoId) {
    if (kind !== "video") {
      return {
        ok: false,
        message: "Tautan Vimeo harus didaftarkan dengan jenis aset 'video'.",
      };
    }
    return {
      ok: true,
      data: {
        normalizedUrl: `https://player.vimeo.com/video/${vimeoId}?dnt=1`,
        provider: "vimeo",
        providerLabel: "Vimeo",
        mime: "video/x-vimeo",
        renderMode: "iframe",
        posterUrl: null,
      },
    };
  }

  // Deteksi Google Drive
  if (parsed.hostname.toLowerCase() === "drive.google.com") {
    const driveId = extractGoogleDriveId(parsed);
    if (!driveId) {
      return {
        ok: false,
        message:
          "Tautan Google Drive tidak memuat ID berkas yang sah (/file/d/{id} atau ?id=).",
      };
    }
    if (kind === "image" || kind === "illustration") {
      return {
        ok: true,
        data: {
          normalizedUrl: `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600`,
          provider: "gdrive",
          providerLabel: "Google Drive",
          mime: "image/x-external",
          renderMode: "image",
          posterUrl: null,
        },
      };
    }
    if (kind === "video") {
      return {
        ok: true,
        data: {
          normalizedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
          provider: "gdrive",
          providerLabel: "Google Drive",
          mime: "video/x-external",
          renderMode: "iframe",
          posterUrl: null,
        },
      };
    }
    return {
      ok: true,
      data: {
        normalizedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
        provider: "gdrive",
        providerLabel: "Google Drive",
        mime: "application/pdf",
        renderMode: "link",
        posterUrl: null,
      },
    };
  }

  // Video HTTPS lainnya (MP4/WebM langsung atau link platform lain)
  if (kind === "video") {
    if (lowerPath.endsWith(".mp4") || lowerPath.endsWith(".webm")) {
      return {
        ok: true,
        data: {
          normalizedUrl: parsed.toString(),
          provider: "direct_video",
          providerLabel: "Video HTTPS Langsung",
          mime: lowerPath.endsWith(".webm") ? "video/webm" : "video/mp4",
          renderMode: "video",
          posterUrl: null,
        },
      };
    }
    return {
      ok: true,
      data: {
        normalizedUrl: parsed.toString(),
        provider: "external_link",
        providerLabel: "Tautan Video Eksternal",
        mime: "video/x-external",
        renderMode: "link",
        posterUrl: null,
      },
    };
  }

  // Foto / Ilustrasi HTTPS eksternal umum
  if (kind === "image" || kind === "illustration") {
    const inferredMime = lowerPath.endsWith(".png")
      ? "image/png"
      : lowerPath.endsWith(".webp")
        ? "image/webp"
        : lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")
          ? "image/jpeg"
          : "image/x-external";

    return {
      ok: true,
      data: {
        normalizedUrl: parsed.toString(),
        provider: "external_image",
        providerLabel: "URL Gambar HTTPS",
        mime: inferredMime,
        renderMode: "image",
        posterUrl: null,
      },
    };
  }

  // PDF HTTPS eksternal
  return {
    ok: true,
    data: {
      normalizedUrl: parsed.toString(),
      provider: "external_pdf",
      providerLabel: "Tautan Dokumen PDF HTTPS",
      mime: "application/pdf",
      renderMode: "link",
      posterUrl: null,
    },
  };
}

export function detectExternalMediaPreview(
  url: string,
  kind: string
): NormalizedExternalMedia {
  const safeKind: ExternalMediaKind =
    kind === "image" || kind === "illustration" || kind === "pdf"
      ? kind
      : "video";
  const parsed = parseAndNormalizeExternalMediaUrl(url, safeKind);
  if (parsed.ok) {
    return parsed.data;
  }
  return {
    normalizedUrl: url,
    provider: "external_link",
    providerLabel: "Tautan Eksternal",
    mime: "application/octet-stream",
    renderMode: "link",
    posterUrl: null,
  };
}

export const createExternalMediaLinkSchema = z
  .object({
    kind: z.enum(EXTERNAL_MEDIA_KINDS),
    url: z.string().trim().min(12, "URL media minimal 12 karakter.").max(1000),
    credit: z.string().trim().max(160).default(""),
    license: z.string().trim().max(160).default(""),
  })
  .strict()
  .superRefine((val, ctx) => {
    const res = parseAndNormalizeExternalMediaUrl(val.url, val.kind);
    if (!res.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: res.message,
      });
    }
  });
