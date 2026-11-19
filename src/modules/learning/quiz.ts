import { z } from "zod";

export const STUDENT_NAME_MIN = 1;
export const STUDENT_NAME_MAX = 80;
export const JOIN_CODE_LENGTH = 10;

// Karakter tanpa ambigu (menghindari 0/O, 1/I/L)
const ALLOWED_JOIN_CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;

/**
 * Menormalisasi kode tugas manual yang diketik siswa/guru:
 * menghapus spasi/tanda hubung dan mengubah ke huruf kapital.
 */
export function normalizeJoinCode(rawCode: string): string {
  return rawCode.replace(/[\s-]+/g, "").toUpperCase();
}

export function isValidJoinCodeFormat(rawCode: string): boolean {
  return ALLOWED_JOIN_CODE_REGEX.test(normalizeJoinCode(rawCode));
}

export const joinResolveSchema = z
  .object({
    join_code: z.string().trim().min(1).max(32).optional(),
    join_token: z.string().trim().min(16).max(256).optional(),
  })
  .strict()
  .refine(
    (data) => Boolean(data.join_code) !== Boolean(data.join_token),
    "Sertakan tepat satu antara join_code atau join_token."
  );

export const startGuestAttemptSchema = z
  .object({
    join_code: z.string().trim().min(1).max(32).optional(),
    join_token: z.string().trim().min(16).max(256).optional(),
    student_name: z
      .string()
      .trim()
      .min(STUDENT_NAME_MIN, "Nama wajib diisi.")
      .max(STUDENT_NAME_MAX, "Nama maksimal 80 karakter."),
    privacy_notice_version: z.string().trim().min(1).max(20),
  })
  .strict()
  .refine(
    (data) => Boolean(data.join_code) !== Boolean(data.join_token),
    "Sertakan tepat satu antara join_code atau join_token."
  );

export const answerEntrySchema = z
  .object({
    question_id: z.string().uuid(),
    selected_choice_id: z.string().uuid().nullable(),
  })
  .strict();

export const autosaveAnswersSchema = z
  .object({
    expected_revision: z.number().int().min(0),
    answers: z.array(answerEntrySchema).max(50),
  })
  .strict();

export const submitAttemptSchema = z
  .object({
    answers: z.array(answerEntrySchema).max(50),
    confirm_submit: z.literal(true),
  })
  .strict();

export interface GradingQuestion {
  question_id: string;
  correct_choice_id: string;
  valid_choice_ids: readonly string[];
}

export interface GradingResult {
  correct_count: number;
  question_count: number;
  score: number;
  graded_answers: Array<{
    question_id: string;
    selected_choice_id: string | null;
    is_correct: boolean;
  }>;
}

/**
 * Penilaian murni di server (ADR-04 & 04_DATABASE.md §6):
 * - Memakai total soal revisi yang dibekukan (`questions.length`), bukan yang dijawab.
 * - Menolak question_id duplikat, question_id asing, atau choice_id milik pertanyaan lain.
 */
export function gradeQuizAttempt(
  frozenQuestions: readonly GradingQuestion[],
  submittedAnswers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>
): GradingResult {
  if (frozenQuestions.length === 0) {
    throw new Error("Kuis tidak memiliki soal.");
  }

  const questionMap = new Map<string, GradingQuestion>();
  for (const q of frozenQuestions) {
    if (questionMap.has(q.question_id)) {
      throw new Error("Duplikasi soal pada revisi kuis.");
    }
    questionMap.set(q.question_id, q);
  }

  const answerMap = new Map<string, string | null>();
  for (const ans of submittedAnswers) {
    if (answerMap.has(ans.question_id)) {
      throw new Error("Duplikasi question_id pada jawaban.");
    }
    const question = questionMap.get(ans.question_id);
    if (!question) {
      throw new Error("question_id tidak termasuk dalam percobaan ini.");
    }
    if (
      ans.selected_choice_id !== null &&
      !question.valid_choice_ids.includes(ans.selected_choice_id)
    ) {
      throw new Error("selected_choice_id bukan milik pertanyaan terkait.");
    }
    answerMap.set(ans.question_id, ans.selected_choice_id);
  }

  let correctCount = 0;
  const gradedAnswers = frozenQuestions.map((q) => {
    const selected = answerMap.get(q.question_id) ?? null;
    const isCorrect = selected !== null && selected === q.correct_choice_id;
    if (isCorrect) {
      correctCount += 1;
    }
    return {
      question_id: q.question_id,
      selected_choice_id: selected,
      is_correct: isCorrect,
    };
  });

  const questionCount = frozenQuestions.length;
  const score = Number(((correctCount / questionCount) * 100).toFixed(2));

  return {
    correct_count: correctCount,
    question_count: questionCount,
    score,
    graded_answers: gradedAnswers,
  };
}
