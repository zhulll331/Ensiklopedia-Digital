import { z } from "zod";
import { parseAndNormalizeExternalMediaUrl } from "@/modules/admin/external-media";
import { createReviewRecordSchema } from "@/modules/content/schemas";
import {
  contentKindSchema,
  contentStatusSchema,
  type ContentKind,
} from "@/modules/content/types";
import {
  DomainError,
  mapPostgresErrorToDomainError,
} from "@/modules/learning/errors";

export const CONTENT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyContentTitle(rawTitle: string): string {
  return rawTitle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export const targetGradesSchema = z
  .array(z.union([z.literal(3), z.literal(4)]))
  .min(1, "Pilih minimal satu kelas sasaran (Kelas III atau IV).")
  .max(2)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b) as Array<3 | 4>);

export const sourceTypeSchema = z.enum([
  "book",
  "journal",
  "report",
  "archive",
  "expert_note",
  "regulation",
]);

export const contentMediaRoleSchema = z.enum([
  "hero",
  "cover",
  "inline",
  "gallery",
  "poster",
  "caption_vtt",
  "download",
]);

export const contentRelationTypeSchema = z.enum([
  "book_chapter",
  "related_glossary",
  "related_worksheet",
  "related_site",
  "related_quiz",
]);

const nonEmptyLineSchema = z.string().trim().min(1).max(3000);
const shortSlugOrEmptySchema = z
  .string()
  .trim()
  .max(120)
  .refine(
    (v) => v === "" || CONTENT_SLUG_REGEX.test(v),
    "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung."
  );

const chapterBodySchema = z
  .object({
    paragraphs: z
      .array(nonEmptyLineSchema)
      .min(1, "Bab bacaan minimal memiliki 1 paragraf.")
      .max(50),
  })
  .strict();

const chapterMetadataSchema = z
  .object({
    order: z.coerce.number().int().min(1).max(999).default(1),
    reading_minutes: z.coerce.number().int().min(1).max(60).default(4),
    glossary_slugs: z
      .array(z.string().trim().regex(CONTENT_SLUG_REGEX, "Format slug glosarium tidak valid."))
      .max(30)
      .default([]),
    preservation_note: z.string().trim().max(500).default(""),
  })
  .strict();

const siteBodySchema = z
  .object({
    child_narration: z
      .array(nonEmptyLineSchema)
      .min(1, "Narasi ramah anak untuk situs minimal memiliki 1 paragraf.")
      .max(30),
    scientific_context: z.array(nonEmptyLineSchema).max(30).default([]),
  })
  .strict();

const siteMetadataSchema = z
  .object({
    heritage_type: z
      .string()
      .trim()
      .min(2, "Jenis peninggalan minimal 2 karakter.")
      .max(60)
      .default("Menhir"),
    preservation_warning: z.string().trim().max(500).default(""),
  })
  .strict();

const videoBodySchema = z
  .object({
    transcript: z.array(nonEmptyLineSchema).max(120).default([]),
  })
  .strict();

const safeAssetPathSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) =>
      v === "" ||
      (v.startsWith("/") && !v.startsWith("//")) ||
      v.startsWith("https://"),
    "Path poster harus berupa rute lokal '/' atau URL 'https://'."
  );

const optionalExternalVideoUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .default("")
  .superRefine((v, ctx) => {
    if (!v) return;
    const res = parseAndNormalizeExternalMediaUrl(v, "video");
    if (!res.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: res.message,
      });
    }
  })
  .transform((v) => {
    if (!v) return "";
    const res = parseAndNormalizeExternalMediaUrl(v, "video");
    return res.ok ? res.data.normalizedUrl : v;
  });

const videoMetadataSchema = z
  .object({
    duration_label: z.string().trim().min(1).max(40).default("02:00"),
    poster_src: safeAssetPathSchema.default(
      "/images/samples/ilustrasi-menhir-dolmen.svg"
    ),
    poster_alt: z.string().trim().max(300).default(""),
    captions_available: z.boolean().default(false),
    video_url: optionalExternalVideoUrlSchema,
  })
  .strict();

const glossaryBodySchema = z
  .object({
    definition: z
      .string()
      .trim()
      .min(3, "Definisi istilah minimal 3 karakter.")
      .max(1200),
    context_example: z.string().trim().max(600).default(""),
  })
  .strict();

const glossaryMetadataSchema = z
  .object({
    related_chapter_slug: shortSlugOrEmptySchema.default(""),
  })
  .strict();

const resourceBodySchema = z
  .object({
    objectives: z
      .array(nonEmptyLineSchema)
      .min(1, "Minimal cantumkan 1 tujuan belajar.")
      .max(20),
    steps: z.array(nonEmptyLineSchema).max(30).default([]),
  })
  .strict();

const resourceMetadataSchema = z
  .object({
    duration_minutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(300)
      .nullable()
      .optional(),
    file_label: z.string().trim().max(120).default("Dokumen PDF"),
    file_size_label: z.string().trim().max(60).default("Belum diunggah"),
    version_label: z.string().trim().max(40).default("Draf 0.1"),
  })
  .strict();

const editorialBodySchema = z
  .object({
    paragraphs: z
      .array(nonEmptyLineSchema)
      .min(1, "Konten minimal memiliki 1 paragraf.")
      .max(60),
  })
  .strict();

const editorialMetadataSchema = z
  .object({
    section_label: z.string().trim().max(80).optional().default(""),
    published_date_label: z.string().trim().max(60).optional().default(""),
  })
  .strict();

export function getStructuredSchemasForKind(kind: ContentKind): {
  bodySchema: z.ZodType<Record<string, unknown>>;
  metadataSchema: z.ZodType<Record<string, unknown>>;
} {
  switch (kind) {
    case "chapter":
      return { bodySchema: chapterBodySchema, metadataSchema: chapterMetadataSchema };
    case "site":
      return { bodySchema: siteBodySchema, metadataSchema: siteMetadataSchema };
    case "video":
      return { bodySchema: videoBodySchema, metadataSchema: videoMetadataSchema };
    case "glossary":
      return { bodySchema: glossaryBodySchema, metadataSchema: glossaryMetadataSchema };
    case "book":
    case "guide":
    case "worksheet":
      return { bodySchema: resourceBodySchema, metadataSchema: resourceMetadataSchema };
    case "page":
    case "news":
      return {
        bodySchema: editorialBodySchema,
        metadataSchema: editorialMetadataSchema,
      };
  }
}

export function getDefaultStructuredContent(
  kind: ContentKind,
  summarySeed?: string
): {
  body_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
} {
  const starterText =
    summarySeed && summarySeed.trim().length > 0
      ? summarySeed.trim()
      : "Isi draf awal sedang disusun oleh tim kurator EDMB.";

  switch (kind) {
    case "chapter":
      return {
        body_json: { paragraphs: [starterText] },
        metadata_json: {
          order: 1,
          reading_minutes: 4,
          glossary_slugs: [],
          preservation_note:
            "Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret.",
        },
      };
    case "site":
      return {
        body_json: {
          child_narration: [starterText],
          scientific_context: [],
        },
        metadata_json: {
          heritage_type: "Menhir",
          preservation_warning:
            "Jaga jarak aman; jangan menyentuh, memindahkan, atau mencoret peninggalan.",
        },
      };
    case "video":
      return {
        body_json: { transcript: ["[00:00] Pengantar materi video."] },
        metadata_json: {
          duration_label: "02:00",
          poster_src: "/images/samples/ilustrasi-menhir-dolmen.svg",
          poster_alt: "Poster ilustrasi pengantar materi megalitik",
          captions_available: false,
          video_url: "",
        },
      };
    case "glossary":
      return {
        body_json: {
          definition: starterText,
          context_example: "",
        },
        metadata_json: { related_chapter_slug: "" },
      };
    case "book":
    case "guide":
    case "worksheet":
      return {
        body_json: {
          objectives: ["Siswa mengenal ciri dasar peninggalan megalitik Banyuwangi."],
          steps: [],
        },
        metadata_json: {
          duration_minutes: 40,
          file_label: "Dokumen PDF (draf)",
          file_size_label: "Belum diunggah",
          version_label: "Draf 0.1",
        },
      };
    case "page":
    case "news":
      return {
        body_json: { paragraphs: [starterText] },
        metadata_json: { section_label: "", published_date_label: "" },
      };
  }
}

export function validateStructuredContent(
  kind: ContentKind,
  bodyJson: unknown,
  metadataJson: unknown
):
  | {
      ok: true;
      body_json: Record<string, unknown>;
      metadata_json: Record<string, unknown>;
    }
  | { ok: false; fieldErrors: Record<string, string>; message: string } {
  const { bodySchema, metadataSchema } = getStructuredSchemasForKind(kind);
  const parsedBody = bodySchema.safeParse(bodyJson);
  const parsedMeta = metadataSchema.safeParse(metadataJson);

  if (parsedBody.success && parsedMeta.success) {
    return {
      ok: true,
      body_json: parsedBody.data,
      metadata_json: parsedMeta.data,
    };
  }

  const fieldErrors: Record<string, string> = {};
  if (!parsedBody.success) {
    for (const issue of parsedBody.error.issues) {
      const key = `body_json.${issue.path.join(".") || "root"}`;
      fieldErrors[key] = issue.message;
    }
  }
  if (!parsedMeta.success) {
    for (const issue of parsedMeta.error.issues) {
      const key = `metadata_json.${issue.path.join(".") || "root"}`;
      fieldErrors[key] = issue.message;
    }
  }

  return {
    ok: false,
    fieldErrors,
    message:
      Object.values(fieldErrors)[0] ??
      "Struktur konten atau metadata tidak sesuai jenis konten.",
  };
}

export const adminContentsQuerySchema = z.object({
  kind: contentKindSchema.optional(),
  status: contentStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().trim().max(240).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createContentItemSchema = z
  .object({
    kind: contentKindSchema,
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, "Slug minimal 2 karakter.")
      .max(120, "Slug maksimal 120 karakter.")
      .regex(
        CONTENT_SLUG_REGEX,
        "Slug hanya boleh huruf kecil a-z, angka 0-9, dan tanda hubung."
      ),
    title: z
      .string()
      .trim()
      .min(1, "Judul konten wajib diisi.")
      .max(200, "Judul maksimal 200 karakter."),
    summary: z.string().trim().max(600, "Ringkasan maksimal 600 karakter.").default(""),
    target_grades: targetGradesSchema.default([3, 4]),
    body_json: z.record(z.string(), z.unknown()).optional(),
    metadata_json: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const createRevisionCloneSchema = z
  .object({
    source_revision_id: z.string().uuid().optional(),
  })
  .strict();

export const draftSourceInputSchema = z
  .object({
    source_id: z.string().uuid("ID sumber tidak valid."),
    locator: z.string().trim().max(160).default(""),
    note: z.string().trim().max(500).default(""),
  })
  .strict();

export const draftMediaInputSchema = z
  .object({
    asset_id: z.string().uuid("ID aset media tidak valid."),
    role: contentMediaRoleSchema,
    alt_text: z.string().trim().max(300).default(""),
    caption: z.string().trim().max(400).default(""),
    sort_order: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict();

export const draftLinkInputSchema = z
  .object({
    target_content_id: z.string().uuid("ID konten tujuan tidak valid."),
    relation_type: contentRelationTypeSchema,
    sort_order: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict();

export const updateDraftRevisionSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Judul revisi wajib diisi.")
      .max(200, "Judul maksimal 200 karakter."),
    summary: z.string().trim().max(600, "Ringkasan maksimal 600 karakter.").default(""),
    target_grades: targetGradesSchema,
    body_json: z.record(z.string(), z.unknown()),
    metadata_json: z.record(z.string(), z.unknown()),
    sources: z.array(draftSourceInputSchema).max(30).optional(),
    media: z.array(draftMediaInputSchema).max(30).optional(),
    links: z.array(draftLinkInputSchema).max(30).optional(),
  })
  .strict();

export const transitionRevisionSchema = z
  .object({
    expected_status: contentStatusSchema,
    next_status: contentStatusSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const createSourceReferenceSchema = z
  .object({
    citation_text: z
      .string()
      .trim()
      .min(3, "Teks sitasi sumber minimal 3 karakter.")
      .max(500, "Teks sitasi sumber maksimal 500 karakter."),
    url: z
      .string()
      .trim()
      .max(400)
      .refine(
        (v) => v === "" || /^https?:\/\/.+/.test(v),
        "URL sumber harus diawali http:// atau https://"
      )
      .optional()
      .nullable(),
    doi: z.string().trim().max(120).optional().nullable(),
    accessed_at: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
        "Tanggal akses harus berformat YYYY-MM-DD."
      )
      .optional()
      .nullable(),
    source_type: sourceTypeSchema.default("report"),
  })
  .strict();

export const createAdminReviewSchema = createReviewRecordSchema
  .extend({
    evidence_asset_id: z.string().uuid().optional().nullable(),
  })
  .strict();

const CMS_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "VALIDATION_FAILED:SLUG_EXISTS",
    status: 409,
    code: "VALIDATION_FAILED",
    message: "Slug konten sudah dipakai item lain. Gunakan slug yang unik.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SLUG",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Format slug hanya boleh huruf kecil, angka, dan tanda hubung (2–120 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_TITLE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Judul konten wajib diisi (maksimal 200 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_GRADES",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Kelas sasaran hanya boleh memuat kelas 3 dan/atau 4.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SOURCE_ID",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Salah satu rujukan sumber yang dipilih tidak ditemukan.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_MEDIA",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Aset media atau peran media tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_CONTENT_LINK",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Tautan konten tujuan tidak valid atau menunjuk ke konten sendiri.",
  },
  {
    token: "VALIDATION_FAILED:SOURCE_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Minimal satu rujukan sumber ilmiah atau arsip wajib ditautkan sebelum terbit.",
  },
  {
    token: "VALIDATION_FAILED:REVIEWS_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Validasi bahasa dan materi wajib sama-sama berstatus disetujui sebelum terbit.",
  },
  {
    token: "VALIDATION_FAILED:LOCATION_CLEARANCE_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Clearance lokasi wilayah umum oleh penelaah lokasi wajib disetujui untuk konten situs.",
  },
  {
    token: "VALIDATION_FAILED:MEDIA_NOT_CLEARED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Terdapat aset media tertaut yang belum lolos scan (cleared) atau belum dibersihkan EXIF-nya.",
  },
  {
    token: "VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Revisi yang menautkan media wajib memiliki catatan validasi media disetujui.",
  },
  {
    token: "VALIDATION_FAILED:REASON_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Alasan transisi minimal 5 karakter wajib diisi.",
  },
  {
    token: "STATE_CONFLICT:REQUIRES_APPROVED",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Hanya revisi berstatus 'Disetujui' (approved) yang dapat diterbitkan ke publik.",
  },
  {
    token: "STATE_CONFLICT:IMMUTABLE",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Revisi di luar status 'Draf' bersifat immutable (tidak dapat diubah langsung). Buat revisi baru (v+1) untuk menyunting.",
  },
  {
    token: "STATE_CONFLICT:STATUS_MISMATCH",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Status revisi sudah berubah oleh kurator lain. Muat ulang halaman untuk melihat status terbaru.",
  },
  {
    token: "STATE_CONFLICT:USE_PUBLISH_ENDPOINT",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Gunakan tombol Terbitkan Revisi (/publish) untuk memublikasikan konten.",
  },
  {
    token: "STATE_CONFLICT:INVALID_TRANSITION",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Transisi status revisi ini tidak diizinkan oleh alur kerja CMS.",
  },
];

export function mapAdminCmsPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of CMS_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  if (error.code === "23505" && msg.includes("slug")) {
    return new DomainError(
      409,
      "VALIDATION_FAILED",
      "Slug konten sudah dipakai item lain."
    );
  }
  return mapPostgresErrorToDomainError(error);
}
