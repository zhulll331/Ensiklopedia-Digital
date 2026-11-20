import { z } from "zod";
import { mapAdminCmsPostgresError } from "@/modules/admin/cms-schemas";
import { DomainError } from "@/modules/learning/errors";

export const MEDIA_KINDS = [
  "image",
  "illustration",
  "pdf",
  "video",
  "evidence",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ALLOWED_MEDIA_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
] as const;
export type AllowedMediaMime = (typeof ALLOWED_MEDIA_MIMES)[number];

export const MEDIA_SCAN_STATUSES = [
  "quarantine",
  "cleared",
  "rejected",
] as const;
export type MediaScanStatus = (typeof MEDIA_SCAN_STATUSES)[number];

export const PENDING_CHECKSUM_SENTINEL = "0".repeat(64);

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  image: "Foto Situs / Lapangan",
  illustration: "Ilustrasi Edukatif",
  pdf: "Dokumen PDF (Panduan/LKPD)",
  video: "Video Belajar (MP4)",
  evidence: "Bukti Telaah Privat",
};

export const MEDIA_SCAN_LABELS: Record<MediaScanStatus, string> = {
  quarantine: "Karantina",
  cleared: "Bersih (Cleared)",
  rejected: "Ditolak (Rejected)",
};

export const KIND_ALLOWED_MIMES: Record<MediaKind, readonly AllowedMediaMime[]> =
  {
    image: ["image/jpeg", "image/png", "image/webp"],
    illustration: ["image/jpeg", "image/png", "image/webp"],
    pdf: ["application/pdf"],
    video: ["video/mp4"],
    evidence: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
  };

export const DEFAULT_MAX_BYTES_BY_KIND: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024, // 10 MB (SEC-19)
  illustration: 10 * 1024 * 1024, // 10 MB (SEC-19)
  pdf: 25 * 1024 * 1024, // 25 MB (SEC-19)
  video: 50 * 1024 * 1024, // 50 MB default bucket limit (naik s.d. 250 MB via env)
  evidence: 15 * 1024 * 1024,
};

export function getMaxBytesForKind(
  kind: MediaKind,
  customVideoMaxBytes?: number
): number {
  if (
    kind === "video" &&
    typeof customVideoMaxBytes === "number" &&
    Number.isFinite(customVideoMaxBytes) &&
    customVideoMaxBytes > 0
  ) {
    return Math.min(customVideoMaxBytes, 250 * 1024 * 1024);
  }
  return DEFAULT_MAX_BYTES_BY_KIND[kind];
}

export function isMimeAllowedForKind(
  kind: MediaKind,
  mime: string
): mime is AllowedMediaMime {
  const normalized = mime.trim().toLowerCase();
  return (KIND_ALLOWED_MIMES[kind] as readonly string[]).includes(normalized);
}

export function isImageMime(mime: string): boolean {
  const m = mime.trim().toLowerCase();
  return m === "image/jpeg" || m === "image/png" || m === "image/webp";
}

export function mimeToExtension(mime: AllowedMediaMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "video/mp4":
      return "mp4";
  }
}

export type SignatureDetectionResult =
  | { ok: true; mime: AllowedMediaMime; ext: string }
  | {
      ok: false;
      reason: "forbidden_svg_or_html" | "forbidden_zip" | "unknown_signature";
      message: string;
    };

function readAsciiSlice(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  const limit = Math.min(bytes.length, end);
  for (let i = start; i < limit; i += 1) {
    out += String.fromCharCode(bytes[i] ?? 0);
  }
  return out;
}

export function detectMediaSignature(
  bytes: Uint8Array
): SignatureDetectionResult {
  if (bytes.length < 4) {
    return {
      ok: false,
      reason: "unknown_signature",
      message: "Berkas terlalu kecil atau rusak untuk dikenali.",
    };
  }

  // Tolak eksplisit SVG, HTML, XML, atau skrip (SEC-19)
  const headText = readAsciiSlice(bytes, 0, 512)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (
    headText.startsWith("<svg") ||
    headText.startsWith("<?xml") ||
    headText.startsWith("<!doctype html") ||
    headText.startsWith("<html") ||
    headText.startsWith("<script") ||
    headText.includes("<svg")
  ) {
    return {
      ok: false,
      reason: "forbidden_svg_or_html",
      message: "SEC-19: Berkas SVG, XML, atau HTML dilarang diunggah ke media.",
    };
  }

  // Tolak arsip ZIP / DOCX / JAR (SEC-19)
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06)
  ) {
    return {
      ok: false,
      reason: "forbidden_zip",
      message: "SEC-19: Berkas arsip ZIP tidak diizinkan.",
    };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ok: true, mime: "image/jpeg", ext: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ok: true, mime: "image/png", ext: "png" };
  }

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    readAsciiSlice(bytes, 0, 4) === "RIFF" &&
    readAsciiSlice(bytes, 8, 12) === "WEBP"
  ) {
    return { ok: true, mime: "image/webp", ext: "webp" };
  }

  // PDF: %PDF-
  if (bytes.length >= 5 && readAsciiSlice(bytes, 0, 16).includes("%PDF-")) {
    return { ok: true, mime: "application/pdf", ext: "pdf" };
  }

  // MP4: ....ftyp
  if (bytes.length >= 12 && readAsciiSlice(bytes, 4, 8) === "ftyp") {
    return { ok: true, mime: "video/mp4", ext: "mp4" };
  }

  return {
    ok: false,
    reason: "unknown_signature",
    message:
      "Signature biner berkas tidak sesuai dengan format JPEG, PNG, WebP, PDF, atau MP4.",
  };
}

export interface PdfInspectionResult {
  blockingTriggers: string[];
  warningTriggers: string[];
}

/**
 * Inspeksi ringan pemicu aktif PDF (SEC-20 / D4):
 * Memblokir skrip/peluncur otomatis (`/JavaScript`, `/JS`, `/Launch`) serta menandai peringatan untuk pemeriksaan manual.
 */
export function inspectPdfActiveTriggers(
  bytes: Uint8Array
): PdfInspectionResult {
  const slice = bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024));
  let text = "";
  for (let i = 0; i < slice.length; i += 1) {
    text += String.fromCharCode(slice[i] ?? 0);
  }

  const blockingTriggers: string[] = [];
  const warningTriggers: string[] = [];

  if (/\/JavaScript\b/.test(text) || /\/JS(?=\s|\[|<|\(|\/)/.test(text)) {
    blockingTriggers.push("/JavaScript");
  }
  if (/\/Launch\b/.test(text)) {
    blockingTriggers.push("/Launch");
  }
  if (/\/OpenAction\b/.test(text)) {
    warningTriggers.push("/OpenAction");
  }
  if (/\/EmbeddedFile\b/.test(text)) {
    warningTriggers.push("/EmbeddedFile");
  }

  return { blockingTriggers, warningTriggers };
}

export const mediaKindSchema = z.enum(MEDIA_KINDS);
export const mediaScanStatusSchema = z.enum(MEDIA_SCAN_STATUSES);

export const adminMediaQuerySchema = z.object({
  status: mediaScanStatusSchema.optional(),
  kind: mediaKindSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const createUploadIntentSchema = z
  .object({
    kind: mediaKindSchema,
    mime: z
      .string()
      .trim()
      .toLowerCase()
      .refine(
        (m): m is AllowedMediaMime =>
          (ALLOWED_MEDIA_MIMES as readonly string[]).includes(m),
        "SEC-19: Tipe MIME tidak diizinkan. Gunakan JPEG, PNG, WebP, PDF, atau MP4."
      ),
    bytes: z.coerce
      .number()
      .int("Ukuran berkas harus bilangan bulat.")
      .positive("Ukuran berkas wajib lebih besar dari 0 byte."),
    credit: z.string().trim().max(160).default(""),
    license: z.string().trim().max(160).default(""),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!isMimeAllowedForKind(val.kind, val.mime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mime"],
        message: `Tipe MIME ${val.mime} tidak cocok untuk jenis aset '${val.kind}'.`,
      });
    }
  });

export const reviewMediaSchema = z
  .object({
    decision: z.enum(["cleared", "rejected"]),
    credit: z.string().trim().max(160).optional(),
    license: z.string().trim().max(160).optional(),
    checked_no_location_leak: z.boolean().optional(),
    checked_rights_and_credit: z.boolean().optional(),
    attested_manual_scan: z.boolean().optional(),
    notes: z.string().trim().max(500).default(""),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.decision === "cleared") {
      if ((val.credit ?? "").trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["credit"],
          message: "Kredit sumber/fotografer minimal 2 karakter wajib diisi.",
        });
      }
      if ((val.license ?? "").trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["license"],
          message: "Informasi lisensi media minimal 2 karakter wajib diisi.",
        });
      }
      if (val.checked_no_location_leak !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checked_no_location_leak"],
          message:
            "Wajib mencentang konfirmasi bebas petunjuk lokasi/landmark sensitif (SEC-17).",
        });
      }
      if (val.checked_rights_and_credit !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["checked_rights_and_credit"],
          message:
            "Wajib mencentang konfirmasi hak cipta, kredit, dan lisensi media.",
        });
      }
    } else if (val.notes.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Alasan penolakan media minimal 5 karakter wajib diisi.",
      });
    }
  });

const MEDIA_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "STATE_CONFLICT:NOT_IN_QUARANTINE",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Aset media tidak berada pada status karantina.",
  },
  {
    token: "STATE_CONFLICT:ALREADY_REJECTED",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Aset media yang sudah ditolak tidak dapat dibersihkan ulang.",
  },
  {
    token: "STATE_CONFLICT:NOT_FINALIZED",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Berkas belum melewati proses finalisasi karantina. Jalankan finalisasi terlebih dahulu.",
  },
  {
    token: "STATE_CONFLICT:REFERENCED_BY_PUBLISHED",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Media sedang dipakai pada revisi konten yang terbit; lakukan takedown konten terkait lebih dulu.",
  },
  {
    token: "VALIDATION_FAILED:CREDIT_LICENSE_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Kredit dan lisensi media wajib diisi sebelum status disetujui.",
  },
  {
    token: "VALIDATION_FAILED:SCRUB_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Metadata media belum dibersihkan atau atestasi pemeriksaan manual belum dikonfirmasi.",
  },
  {
    token: "VALIDATION_FAILED:UNSUPPORTED_MIME",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Tipe MIME berkas tidak termasuk allowlist yang diizinkan (SEC-19).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_STORAGE_PATH",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Path atau tautan penyimpanan aset media tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:URL_ALREADY_EXISTS",
    status: 409,
    code: "VALIDATION_FAILED",
    message: "Link media eksternal ini sudah pernah didaftarkan sebelumnya.",
  },
];

export function mapMediaPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of MEDIA_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  return mapAdminCmsPostgresError(error);
}
