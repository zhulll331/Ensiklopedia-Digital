import { z } from "zod";
import { CONTENT_SLUG_REGEX } from "@/modules/admin/cms-schemas";
import { contentStatusSchema, type ContentStatus } from "@/modules/content/types";
import {
  DomainError,
  mapPostgresErrorToDomainError,
} from "@/modules/learning/errors";

export const QUIZ_USAGE_MODES = ["practice", "assignment"] as const;
export type QuizUsageMode = (typeof QUIZ_USAGE_MODES)[number];

export const QUIZ_USAGE_MODE_LABELS: Record<QuizUsageMode, string> = {
  practice: "Latihan Mandiri (Publik)",
  assignment: "Tugas Kelas (Portal Guru)",
};

export const QUIZ_REVIEW_TYPES = ["language", "material", "media"] as const;
export type QuizReviewType = (typeof QUIZ_REVIEW_TYPES)[number];

export const QUIZ_REVIEW_TYPE_LABELS: Record<QuizReviewType, string> = {
  language: "Bahasa (Ramah Anak SD III–IV)",
  material: "Materi Sejarah & Arkeologi",
  media: "Media & Ilustrasi Soal",
};

export const QUIZ_REVIEW_DECISIONS = [
  "approved",
  "changes_requested",
  "rejected",
] as const;
export type QuizReviewDecision = (typeof QUIZ_REVIEW_DECISIONS)[number];

export const QUIZ_MAX_QUESTIONS = 50;

export const adminQuizzesQuerySchema = z.object({
  grade: z.enum(["3", "4"]).optional(),
  usage_mode: z.enum(QUIZ_USAGE_MODES).optional(),
  status: contentStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

export const createQuizSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, "Slug kuis minimal 2 karakter.")
      .max(120)
      .regex(
        CONTENT_SLUG_REGEX,
        "Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung."
      ),
    title: z
      .string()
      .trim()
      .min(2, "Judul kuis minimal 2 karakter.")
      .max(160, "Judul kuis maksimal 160 karakter."),
    grade: z.union([z.literal(3), z.literal(4)]),
    usage_mode: z.enum(QUIZ_USAGE_MODES),
    instructions: z.string().trim().max(1000).default(""),
  })
  .strict();

export const createQuizRevisionSchema = z
  .object({
    source_revision_id: z.string().uuid().optional().nullable(),
  })
  .strict();

export const quizDraftChoiceSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Teks pilihan jawaban wajib diisi.")
      .max(300, "Teks pilihan jawaban maksimal 300 karakter."),
  })
  .strict();

export const quizQuestionSourceInputSchema = z
  .object({
    source_id: z.string().uuid("ID sumber referensi tidak valid."),
    locator: z.string().trim().max(120).default(""),
  })
  .strict();

export const quizDraftQuestionSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(3, "Teks pertanyaan minimal 3 karakter.")
      .max(1000, "Teks pertanyaan maksimal 1000 karakter."),
    media_asset_id: z.string().uuid().optional().nullable(),
    choices: z
      .array(quizDraftChoiceSchema)
      .min(2, "Setiap soal wajib memiliki minimal 2 pilihan jawaban.")
      .max(4, "Setiap soal maksimal memiliki 4 pilihan jawaban."),
    correct_choice_position: z.coerce
      .number()
      .int()
      .min(1, "Pilih salah satu jawaban sebagai kunci jawaban.")
      .max(4),
    explanation: z
      .string()
      .trim()
      .max(1000, "Pembahasan soal maksimal 1000 karakter.")
      .default(""),
    sources: z.array(quizQuestionSourceInputSchema).max(10).default([]),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.correct_choice_position > val.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["correct_choice_position"],
        message: "Nomor kunci jawaban melebihi jumlah pilihan pada soal ini.",
      });
    }
  });

export const upsertQuizDraftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Judul kuis minimal 2 karakter.")
      .max(160, "Judul kuis maksimal 160 karakter."),
    grade: z.union([z.literal(3), z.literal(4)]),
    usage_mode: z.enum(QUIZ_USAGE_MODES),
    instructions: z.string().trim().max(1000).default(""),
    questions: z
      .array(quizDraftQuestionSchema)
      .max(QUIZ_MAX_QUESTIONS, "Maksimal 50 soal dalam satu revisi kuis."),
  })
  .strict();

export const createQuizReviewSchema = z
  .object({
    review_type: z.enum(QUIZ_REVIEW_TYPES),
    reviewer_label: z
      .string()
      .trim()
      .min(2, "Nama atau label penelaah minimal 2 karakter.")
      .max(120, "Nama atau label penelaah maksimal 120 karakter."),
    decision: z.enum(QUIZ_REVIEW_DECISIONS),
    evidence_asset_id: z.string().uuid().optional().nullable(),
  })
  .strict();

export const transitionQuizRevisionSchema = z
  .object({
    expected_status: contentStatusSchema,
    next_status: contentStatusSchema,
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const publishQuizRevisionSchema = z
  .object({
    confirm_publish: z.literal(true),
  })
  .strict();

export interface QuizPublishCheckItem {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface QuizPublishGateResult {
  ready: boolean;
  checks: QuizPublishCheckItem[];
}

export interface QuizPublishGateInput {
  status: ContentStatus;
  questions: ReadonlyArray<{
    choices_count: number;
    has_valid_answer_key: boolean;
    media_asset: {
      scan_status: "quarantine" | "cleared" | "rejected";
      metadata_scrubbed: boolean;
    } | null;
  }>;
  approved_reviews: ReadonlyArray<QuizReviewType>;
}

/**
 * Evaluasi gate kesiapan terbit kuis (harus paritas 1-ke-1 dengan RPC `api.publish_quiz_revision`).
 */
export function evaluateQuizPublishGate(
  input: QuizPublishGateInput
): QuizPublishGateResult {
  const questionCount = input.questions.length;
  const statusApproved = input.status === "approved";
  const countOk = questionCount >= 1 && questionCount <= QUIZ_MAX_QUESTIONS;
  const choicesOk =
    questionCount > 0 &&
    input.questions.every((q) => q.choices_count >= 2 && q.choices_count <= 4);
  const keysOk =
    questionCount > 0 && input.questions.every((q) => q.has_valid_answer_key);

  const reviewSet = new Set(input.approved_reviews);
  const langOk = reviewSet.has("language");
  const materialOk = reviewSet.has("material");

  const mediaItems = input.questions
    .map((q) => q.media_asset)
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const hasMedia = mediaItems.length > 0;
  const allMediaCleared =
    !hasMedia ||
    mediaItems.every((m) => m.scan_status === "cleared" && m.metadata_scrubbed);
  const mediaReviewOk = !hasMedia || reviewSet.has("media");

  const checks: QuizPublishCheckItem[] = [
    {
      key: "status_approved",
      label: "Status revisi sudah 'Disetujui' (approved)",
      ok: statusApproved,
    },
    {
      key: "question_count",
      label: "Jumlah soal 1–50 butir (rekomendasi editorial 5–10 soal)",
      ok: countOk,
      detail: `${questionCount} soal`,
    },
    {
      key: "choices_count",
      label: "Setiap soal memiliki 2–4 pilihan jawaban",
      ok: choicesOk,
    },
    {
      key: "answer_keys",
      label: "Setiap soal memiliki tepat 1 kunci jawaban sah (schema private)",
      ok: keysOk,
    },
    {
      key: "reviews_language_material",
      label: "Validasi bahasa dan materi disetujui penelaah",
      ok: langOk && materialOk,
    },
    {
      key: "media_cleared",
      label: hasMedia
        ? "Seluruh lampiran media soal lolos karantina (cleared & EXIF bersih)"
        : "Tanpa lampiran media pada soal",
      ok: allMediaCleared,
    },
    {
      key: "media_review",
      label: hasMedia
        ? "Validasi penelaah media disetujui"
        : "Tidak memerlukan validasi media tambahan",
      ok: mediaReviewOk,
    },
  ];

  return {
    ready: checks.every((c) => c.ok),
    checks,
  };
}

export function normalizeQuestionPrompt(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PracticePromptIndexEntry {
  quiz_id: string;
  quiz_slug: string;
  quiz_title: string;
  prompt: string;
}

export interface QuizPracticeOverlapWarning {
  position: number;
  prompt: string;
  matched_quiz_slug: string;
  matched_quiz_title: string;
}

/**
 * Deteksi soal pada kuis mode 'assignment' yang identik atau hampir sama dengan kuis 'practice'.
 */
export function detectPracticePromptOverlap(
  assignmentQuestions: ReadonlyArray<{ position: number; prompt: string }>,
  practicePrompts: readonly PracticePromptIndexEntry[]
): QuizPracticeOverlapWarning[] {
  const byNormalized = new Map<string, PracticePromptIndexEntry>();
  for (const entry of practicePrompts) {
    const norm = normalizeQuestionPrompt(entry.prompt);
    if (norm.length >= 12 && !byNormalized.has(norm)) {
      byNormalized.set(norm, entry);
    }
  }

  const warnings: QuizPracticeOverlapWarning[] = [];
  for (const q of assignmentQuestions) {
    const norm = normalizeQuestionPrompt(q.prompt);
    if (norm.length < 12) continue;

    const exact = byNormalized.get(norm);
    if (exact) {
      warnings.push({
        position: q.position,
        prompt: q.prompt,
        matched_quiz_slug: exact.quiz_slug,
        matched_quiz_title: exact.quiz_title,
      });
    }
  }

  return warnings;
}

const QUIZ_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "VALIDATION_FAILED:SLUG_EXISTS",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Slug kuis sudah digunakan kuis lain. Pilih slug yang unik.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SLUG",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Format slug hanya boleh huruf kecil, angka, dan tanda hubung (2–120 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_TITLE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Judul kuis wajib diisi (2–160 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_GRADE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Kelas kuis hanya boleh 3 atau 4.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_USAGE_MODE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Mode kuis hanya boleh 'practice' atau 'assignment'.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_INSTRUCTIONS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Petunjuk pengerjaan maksimal 1000 karakter.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_QUESTIONS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Struktur daftar soal tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:QUESTIONS_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Kuis wajib memiliki minimal 1 butir soal sebelum diterbitkan.",
  },
  {
    token: "VALIDATION_FAILED:TOO_MANY_QUESTIONS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Jumlah soal maksimal adalah 50 butir per revisi kuis.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_QUESTION_PROMPT",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Setiap pertanyaan wajib sepanjang 3–1000 karakter.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_EXPLANATION",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Pembahasan soal maksimal 1000 karakter.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_CHOICES_COUNT",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Setiap soal wajib memiliki tepat 2 hingga 4 pilihan jawaban.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_CHOICE_LABEL",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Setiap pilihan jawaban wajib diisi (1–300 karakter).",
  },
  {
    token: "VALIDATION_FAILED:ANSWER_KEY_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Setiap soal wajib memiliki tepat 1 kunci jawaban sah yang menunjuk salah satu pilihan.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SOURCE_ID",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Sumber referensi soal yang dipilih tidak ditemukan.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_MEDIA",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Aset media lampiran soal tidak ditemukan.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_REVIEW_TYPE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Jenis validasi kuis harus Bahasa, Materi, atau Media.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_DECISION",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Keputusan validasi kuis tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_REVIEWER",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Label/nama penelaah minimal 2 karakter.",
  },
  {
    token: "VALIDATION_FAILED:REVIEWS_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Validasi bahasa dan materi wajib sama-sama berstatus 'Disetujui' sebelum terbit.",
  },
  {
    token: "VALIDATION_FAILED:MEDIA_NOT_CLEARED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Terdapat soal dengan media yang belum lolos karantina (cleared) dan bersih EXIF.",
  },
  {
    token: "VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Revisi kuis dengan lampiran media wajib memiliki validasi media berstatus 'Disetujui'.",
  },
  {
    token: "VALIDATION_FAILED:REASON_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Alasan perubahan/arsip minimal 5 karakter wajib diisi.",
  },
  {
    token: "STATE_CONFLICT:IMMUTABLE",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Revisi di luar status 'Draf' bersifat immutable (ADR-05). Buat revisi baru (v+1) untuk menyunting.",
  },
  {
    token: "STATE_CONFLICT:LOCKED_BY_ASSIGNMENT",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Revisi kuis ini sudah dipakai pada tugas guru sehingga tidak dapat diubah lagi.",
  },
  {
    token: "STATE_CONFLICT:STATUS_MISMATCH",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Status revisi sudah berubah oleh admin lain. Muat ulang halaman sebelum melanjutkan.",
  },
  {
    token: "STATE_CONFLICT:USE_PUBLISH_ENDPOINT",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Publikasi kuis hanya boleh melalui endpoint /publish.",
  },
  {
    token: "STATE_CONFLICT:INVALID_TRANSITION",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Transisi status revisi kuis tidak diizinkan.",
  },
  {
    token: "STATE_CONFLICT:REQUIRES_APPROVED",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Kuis hanya boleh diterbitkan apabila status revisi sudah 'Disetujui'.",
  },
];

export function extractZodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".") || "root"] = issue.message;
  }
  return fieldErrors;
}

export function mapAdminQuizPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of QUIZ_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  if (error.code === "23505" && msg.includes("slug")) {
    return new DomainError(
      409,
      "STATE_CONFLICT",
      "Slug kuis sudah digunakan kuis lain."
    );
  }
  return mapPostgresErrorToDomainError(error);
}
