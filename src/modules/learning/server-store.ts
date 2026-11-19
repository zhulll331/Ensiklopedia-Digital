import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import {
  generateOpaqueToken,
  hashSha256Hex,
  hmacSha256Hex,
  neutralizeCsvCell,
} from "@/lib/server/crypto";
import { getServerEnv } from "@/lib/server/env";
import { DomainError } from "./errors";
import {
  gradeQuizAttempt,
  normalizeJoinCode,
  type GradingQuestion,
} from "./quiz";
import {
  SAMPLE_ASSIGNMENT_QUIZZES,
  SAMPLE_PRACTICE_QUIZZES,
  type PublicQuizDefinition,
} from "./sample-quizzes";

const DEV_PEPPER_FALLBACK = "edmb-local-dev-pepper-do-not-use-in-prod-32b";

function getPepper(): string {
  return getServerEnv().JOIN_CODE_PEPPER ?? DEV_PEPPER_FALLBACK;
}

// Kunci jawaban & pembahasan hanya berada di modul server-only (ADR-04 & SEC-08)
const ANSWER_KEY_MAP = new Map<
  string,
  { correct_choice_id: string; explanation: string }
>([
  // Practice Kelas 3
  ["10000000-0000-4000-8000-000000000001", { correct_choice_id: "c1000000-0000-4000-8000-000000000001", explanation: "'Mega' berarti besar dan 'lithos' berarti batu." }],
  ["10000000-0000-4000-8000-000000000002", { correct_choice_id: "c2000000-0000-4000-8000-000000000002", explanation: "Menhir adalah batu tunggal yang berdiri tegak." }],
  ["10000000-0000-4000-8000-000000000003", { correct_choice_id: "c3000000-0000-4000-8000-000000000001", explanation: "Dolmen tersusun menyerupai meja dari lempengan batu datar." }],
  ["10000000-0000-4000-8000-000000000004", { correct_choice_id: "c4000000-0000-4000-8000-000000000001", explanation: "Bentuk tonjolan di atas batu silinder mirip alat musik kenong." }],
  ["10000000-0000-4000-8000-000000000005", { correct_choice_id: "c5000000-0000-4000-8000-000000000003", explanation: "Kita menjaga peninggalan dengan tidak menyentuh, memindahkan, atau mencoretnya." }],
  // Assignment Kelas 3
  ["20000000-0000-4000-8000-000000000001", { correct_choice_id: "d1000000-0000-4000-8000-000000000001", explanation: "Tradisi batu besar disebut megalitik." }],
  ["20000000-0000-4000-8000-000000000002", { correct_choice_id: "d2000000-0000-4000-8000-000000000002", explanation: "Menhir berdiri tegak sedangkan dolmen berbentuk meja batu." }],
  ["20000000-0000-4000-8000-000000000003", { correct_choice_id: "d3000000-0000-4000-8000-000000000001", explanation: "Arkeologi meneliti peninggalan manusia masa lalu." }],
  ["20000000-0000-4000-8000-000000000004", { correct_choice_id: "d4000000-0000-4000-8000-000000000002", explanation: "Peta wilayah umum melindungi situs dari vandalisme." }],
  ["20000000-0000-4000-8000-000000000005", { correct_choice_id: "d5000000-0000-4000-8000-000000000003", explanation: "Segera laporkan kerusakan kepada guru atau pengelola." }],
  // Assignment Kelas 4
  ["30000000-0000-4000-8000-000000000001", { correct_choice_id: "e1000000-0000-4000-8000-000000000002", explanation: "Posisi asli benda membantu ahli membaca konteks sejarah." }],
  ["30000000-0000-4000-8000-000000000002", { correct_choice_id: "e2000000-0000-4000-8000-000000000002", explanation: "Batu kenong memiliki tonjolan bulat di bagian atas." }],
  ["30000000-0000-4000-8000-000000000003", { correct_choice_id: "e3000000-0000-4000-8000-000000000001", explanation: "Dolmen ditopang oleh beberapa batu penyangga." }],
  ["30000000-0000-4000-8000-000000000004", { correct_choice_id: "e4000000-0000-4000-8000-000000000001", explanation: "Menjaga warisan agar lestari disebut pelestarian." }],
  ["30000000-0000-4000-8000-000000000005", { correct_choice_id: "e5000000-0000-4000-8000-000000000003", explanation: "Dilarang duduk atau mencoret permukaan peninggalan batu." }],
]);

export interface TeacherProfile {
  user_id: string;
  display_name: string;
  role: "teacher";
  status: "active" | "suspended";
  school_ids: string[];
}

export interface ClassRecord {
  id: string;
  teacher_id: string;
  school_id: string;
  school_name: string;
  label: string;
  grade: 3 | 4;
  academic_year: string;
  archived_at: string | null;
}

export type AssignmentState = "draft" | "open" | "closed" | "revoked" | "archived";

export interface AssignmentRecord {
  id: string;
  class_id: string;
  teacher_id: string;
  grade: 3 | 4;
  quiz_revision_id: string;
  title: string;
  state: AssignmentState;
  opens_at: string;
  closes_at: string;
  session_minutes: number;
  consent_policy_version: string;
  consent_readiness_at: string | null;
  created_at: string;
}

export interface AssignmentAccessRecord {
  assignment_id: string;
  join_token_hash: string;
  join_code_digest: string;
  generation: number;
  rotated_at: string;
}

export interface AttemptAnswerRecord {
  question_id: string;
  selected_choice_id: string | null;
  is_correct: boolean | null;
  updated_at: string;
}

export interface AttemptRecord {
  id: string;
  assignment_id: string;
  quiz_revision_id: string;
  student_name: string;
  corrected_name: string | null;
  state: "in_progress" | "submitted" | "expired" | "cancelled";
  answer_revision: number;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  correct_count: number | null;
  question_count: number;
  score: number | null;
  receipt_code: string | null;
  purge_at: string;
  answers: Map<string, AttemptAnswerRecord>;
}

export interface GuestSessionRecord {
  id: string;
  attempt_id: string;
  token_hash: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AnnotationRecord {
  id: string;
  attempt_id: string;
  actor_id: string;
  kind: "verified" | "invalidated" | "name_correction" | "note";
  reason: string;
  created_at: string;
}

interface IdempotencyEntry {
  request_hash: string;
  response_json: SubmitReceipt;
  expires_at: string;
}

export interface SubmitReceipt {
  attempt_id: string;
  state: "submitted";
  submitted_at: string;
  correct_count: number;
  question_count: number;
  score: number;
  explanations_available: boolean;
  receipt_code: string;
}

export interface ExportJobRecord {
  id: string;
  requested_by: string;
  assignment_id: string;
  csv_content: string;
  created_at: string;
  expires_at: string;
}

export { DomainError };

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateReadableJoinCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    const b = bytes[i] ?? 0;
    out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out;
}

function generateReceiptCode(): string {
  const bytes = randomBytes(4);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function buildGradingQuestions(quiz: PublicQuizDefinition): GradingQuestion[] {
  return quiz.questions.map((q) => {
    const key = ANSWER_KEY_MAP.get(q.id);
    if (!key) {
      throw new Error(`Kunci soal ${q.id} tidak ditemukan di server.`);
    }
    return {
      question_id: q.id,
      correct_choice_id: key.correct_choice_id,
      valid_choice_ids: q.choices.map((c) => c.id),
    };
  });
}

function findQuizByRevisionId(revisionId: string): PublicQuizDefinition | null {
  return (
    SAMPLE_ASSIGNMENT_QUIZZES.find((q) => q.revision_id === revisionId) ??
    SAMPLE_PRACTICE_QUIZZES.find((q) => q.revision_id === revisionId) ??
    null
  );
}

// State server-only tunggal untuk pratinjau lokal & pengujian terintegrasi
const globalStoreKey = Symbol.for("edmb.learning.serverStore.v1");

interface StoreState {
  teachers: Map<string, TeacherProfile>;
  schools: Map<string, { id: string; name: string; district_label: string }>;
  classes: Map<string, ClassRecord>;
  assignments: Map<string, AssignmentRecord>;
  accessByAssignment: Map<string, AssignmentAccessRecord>;
  attempts: Map<string, AttemptRecord>;
  guestSessions: Map<string, GuestSessionRecord>;
  idempotency: Map<string, IdempotencyEntry>;
  annotations: Map<string, AnnotationRecord[]>;
  resultSelections: Map<string, { selected_attempt_id: string; reason: string }>;
  exports: Map<string, ExportJobRecord>;
  csrfNonces: Map<string, number>;
}

const DEMO_SCHOOL_ID = "550e8400-e29b-41d4-a716-446655440001";

function createInitialStore(): StoreState {
  const schools = new Map([
    [
      DEMO_SCHOOL_ID,
      {
        id: DEMO_SCHOOL_ID,
        name: "SDN Contoh Banyuwangi 01",
        district_label: "Kecamatan Banyuwangi",
      },
    ],
  ]);

  const teachers = new Map<string, TeacherProfile>([
    [
      "teacher-demo-1",
      {
        user_id: "teacher-demo-1",
        display_name: "Ibu Sari (Guru Contoh)",
        role: "teacher",
        status: "active",
        school_ids: [DEMO_SCHOOL_ID],
      },
    ],
    [
      "teacher-demo-2",
      {
        user_id: "teacher-demo-2",
        display_name: "Bapak Budi (Guru Lain)",
        role: "teacher",
        status: "active",
        school_ids: [DEMO_SCHOOL_ID],
      },
    ],
  ]);

  const classId1 = "cl-demo-3a";
  const classes = new Map<string, ClassRecord>([
    [
      classId1,
      {
        id: classId1,
        teacher_id: "teacher-demo-1",
        school_id: DEMO_SCHOOL_ID,
        school_name: "SDN Contoh Banyuwangi 01",
        label: "III A",
        grade: 3,
        academic_year: "2026/2027",
        archived_at: null,
      },
    ],
  ]);

  const now = Date.now();
  const assignId1 = "asg-demo-1";
  const opensAt = new Date(now - 60 * 60 * 1000).toISOString();
  const closesAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  const assignments = new Map<string, AssignmentRecord>([
    [
      assignId1,
      {
        id: assignId1,
        class_id: classId1,
        teacher_id: "teacher-demo-1",
        grade: 3,
        quiz_revision_id: "qrev-assign-3-v1",
        title: "Tugas Pengenalan Megalitik (Sampel)",
        state: "open",
        opens_at: opensAt,
        closes_at: closesAt,
        session_minutes: 120,
        consent_policy_version: "1.0",
        consent_readiness_at: opensAt,
        created_at: opensAt,
      },
    ],
  ]);

  // Kode sampel siap coba lokal: EDMB34ABCD
  const defaultCode = "EDMB34ABCD";
  const defaultToken = "edmb-demo-link-token-32bytes-safe-001";
  const accessByAssignment = new Map<string, AssignmentAccessRecord>([
    [
      assignId1,
      {
        assignment_id: assignId1,
        join_token_hash: hashSha256Hex(defaultToken),
        join_code_digest: hmacSha256Hex(getPepper(), defaultCode),
        generation: 1,
        rotated_at: opensAt,
      },
    ],
  ]);

  return {
    teachers,
    schools,
    classes,
    assignments,
    accessByAssignment,
    attempts: new Map(),
    guestSessions: new Map(),
    idempotency: new Map(),
    annotations: new Map(),
    resultSelections: new Map(),
    exports: new Map(),
    csrfNonces: new Map(),
  };
}

function getStore(): StoreState {
  const g = globalThis as Record<symbol, StoreState | undefined>;
  if (!g[globalStoreKey]) {
    g[globalStoreKey] = createInitialStore();
  }
  return g[globalStoreKey];
}

export function resetServerStoreForTests(): void {
  const g = globalThis as Record<symbol, StoreState | undefined>;
  g[globalStoreKey] = createInitialStore();
}

/* ==================== PRACTICE QUIZZES (FR-08) ==================== */

export function listPublicPracticeQuizzes(grade?: 3 | 4) {
  return SAMPLE_PRACTICE_QUIZZES.filter((q) => !grade || q.grade === grade).map(
    ({ id, revision_id, slug, title, grade: qGrade, instructions, question_count }) => ({
      id,
      revision_id,
      slug,
      title,
      grade: qGrade,
      instructions,
      question_count,
    })
  );
}

export function getPublicPracticeQuizById(idOrSlug: string): PublicQuizDefinition | null {
  return (
    SAMPLE_PRACTICE_QUIZZES.find((q) => q.id === idOrSlug || q.slug === idOrSlug) ??
    null
  );
}

export function checkPracticeQuizSubmission(
  idOrSlug: string,
  answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>
) {
  const quiz = getPublicPracticeQuizById(idOrSlug);
  if (!quiz) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Kuis latihan tidak ditemukan.");
  }

  let graded;
  try {
    graded = gradeQuizAttempt(buildGradingQuestions(quiz), answers);
  } catch (err) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      err instanceof Error ? err.message : "Jawaban tidak valid."
    );
  }

  return {
    quiz_id: quiz.id,
    revision_id: quiz.revision_id,
    correct_count: graded.correct_count,
    question_count: graded.question_count,
    score: graded.score,
    items: graded.graded_answers.map((ans) => {
      const key = ANSWER_KEY_MAP.get(ans.question_id);
      return {
        question_id: ans.question_id,
        selected_choice_id: ans.selected_choice_id,
        correct_choice_id: key?.correct_choice_id ?? null,
        is_correct: ans.is_correct,
        explanation: key?.explanation ?? "",
      };
    }),
  };
}

/* ==================== GUEST TASK FLOW (FR-11, SEC-06..10) ==================== */

function findAssignmentByCredential(input: {
  join_code?: string;
  join_token?: string;
}): AssignmentRecord {
  const store = getStore();
  let matchedAssignmentId: string | null = null;

  if (input.join_token) {
    const tokenHash = hashSha256Hex(input.join_token.trim());
    for (const acc of store.accessByAssignment.values()) {
      if (acc.join_token_hash === tokenHash) {
        matchedAssignmentId = acc.assignment_id;
        break;
      }
    }
  } else if (input.join_code) {
    const normalized = normalizeJoinCode(input.join_code);
    const digest = hmacSha256Hex(getPepper(), normalized);
    for (const acc of store.accessByAssignment.values()) {
      if (acc.join_code_digest === digest) {
        matchedAssignmentId = acc.assignment_id;
        break;
      }
    }
  }

  if (!matchedAssignmentId) {
    throw new DomainError(
      404,
      "RESOURCE_NOT_FOUND",
      "Kode tidak ditemukan. Periksa lagi atau tanya gurumu."
    );
  }

  const assignment = store.assignments.get(matchedAssignmentId);
  if (!assignment) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Tugas tidak ditemukan.");
  }

  return assignment;
}

function assertAssignmentJoinable(assignment: AssignmentRecord): void {
  const nowMs = Date.now();
  if (assignment.state !== "open") {
    throw new DomainError(
      410,
      "TASK_UNAVAILABLE",
      "Tugas ini sudah ditutup. Beri tahu gurumu ya."
    );
  }
  if (!assignment.consent_readiness_at) {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Tugas belum siap dibuka karena konfirmasi kesiapan persetujuan kelas belum dilengkapi guru."
    );
  }
  const opensMs = Date.parse(assignment.opens_at);
  const closesMs = Date.parse(assignment.closes_at);
  if (nowMs < opensMs || nowMs >= closesMs) {
    throw new DomainError(
      410,
      "TASK_UNAVAILABLE",
      "Tugas ini belum dibuka atau waktunya sudah berakhir."
    );
  }
}

export function resolveGuestJoin(input: {
  join_code?: string;
  join_token?: string;
}) {
  const store = getStore();
  const assignment = findAssignmentByCredential(input);
  assertAssignmentJoinable(assignment);

  const cls = store.classes.get(assignment.class_id);
  const teacher = store.teachers.get(assignment.teacher_id);
  if (!cls || !teacher || teacher.status !== "active") {
    throw new DomainError(410, "TASK_UNAVAILABLE", "Tugas sedang tidak tersedia.");
  }

  return {
    assignment_title: assignment.title,
    class_label: cls.label,
    grade: cls.grade,
    teacher_display_name: teacher.display_name,
    can_start: true,
    privacy_notice_version: assignment.consent_policy_version,
    privacy_notice_summary:
      "Namamu hanya dikirim kepada guru pemilik tugas untuk rekap belajar kelas dan tidak dipublikasikan.",
  };
}

export function startGuestAttempt(input: {
  join_code?: string;
  join_token?: string;
  student_name: string;
  privacy_notice_version: string;
}) {
  const store = getStore();
  const assignment = findAssignmentByCredential(input);
  assertAssignmentJoinable(assignment);

  const quiz = findQuizByRevisionId(assignment.quiz_revision_id);
  if (!quiz) {
    throw new DomainError(410, "TASK_UNAVAILABLE", "Versi kuis tugas tidak tersedia.");
  }

  const nowMs = Date.now();
  const closesMs = Date.parse(assignment.closes_at);
  const sessionExpiresMs = Math.min(
    nowMs + assignment.session_minutes * 60 * 1000,
    closesMs
  );
  const purgeAt = new Date(closesMs + 90 * 24 * 60 * 60 * 1000).toISOString();

  const attemptId = randomUUID();
  const attempt: AttemptRecord = {
    id: attemptId,
    assignment_id: assignment.id,
    quiz_revision_id: assignment.quiz_revision_id,
    student_name: input.student_name.trim(),
    corrected_name: null,
    state: "in_progress",
    answer_revision: 0,
    started_at: new Date(nowMs).toISOString(),
    expires_at: new Date(sessionExpiresMs).toISOString(),
    submitted_at: null,
    correct_count: null,
    question_count: quiz.questions.length,
    score: null,
    receipt_code: null,
    purge_at: purgeAt,
    answers: new Map(),
  };

  const rawSessionToken = generateOpaqueToken(32);
  const session: GuestSessionRecord = {
    id: randomUUID(),
    attempt_id: attemptId,
    token_hash: hashSha256Hex(rawSessionToken),
    issued_at: new Date(nowMs).toISOString(),
    expires_at: attempt.expires_at,
    revoked_at: null,
  };

  store.attempts.set(attemptId, attempt);
  store.guestSessions.set(session.token_hash, session);

  return {
    rawSessionToken,
    sessionExpiresAt: session.expires_at,
    payload: {
      attempt_id: attempt.id,
      assignment_title: assignment.title,
      state: attempt.state,
      expires_at: attempt.expires_at,
      answer_revision: attempt.answer_revision,
      instructions: quiz.instructions,
      questions: quiz.questions,
    },
  };
}

function resolveActiveGuestSession(rawSessionToken: string | undefined): {
  session: GuestSessionRecord;
  attempt: AttemptRecord;
  assignment: AssignmentRecord;
  quiz: PublicQuizDefinition;
} {
  if (!rawSessionToken) {
    throw new DomainError(401, "AUTH_REQUIRED", "Sesi pengerjaan tidak ditemukan.");
  }

  const store = getStore();
  const tokenHash = hashSha256Hex(rawSessionToken);
  const session = store.guestSessions.get(tokenHash);
  if (!session || session.revoked_at) {
    throw new DomainError(401, "SESSION_EXPIRED", "Sesi sudah berakhir.");
  }

  if (Date.now() > Date.parse(session.expires_at)) {
    throw new DomainError(401, "SESSION_EXPIRED", "Masa sesi sudah habis.");
  }

  const attempt = store.attempts.get(session.attempt_id);
  if (!attempt) {
    throw new DomainError(401, "SESSION_EXPIRED", "Percobaan tidak ditemukan.");
  }

  const assignment = store.assignments.get(attempt.assignment_id);
  if (!assignment) {
    throw new DomainError(410, "TASK_UNAVAILABLE", "Tugas tidak tersedia.");
  }

  if (assignment.state === "revoked") {
    attempt.state = "cancelled";
    throw new DomainError(410, "TASK_UNAVAILABLE", "Tugas ini telah dicabut oleh guru.");
  }

  const quiz = findQuizByRevisionId(attempt.quiz_revision_id);
  if (!quiz) {
    throw new DomainError(410, "TASK_UNAVAILABLE", "Versi kuis tidak ditemukan.");
  }

  return { session, attempt, assignment, quiz };
}

export function getGuestAttemptState(rawSessionToken: string | undefined) {
  const { attempt, assignment, quiz } = resolveActiveGuestSession(rawSessionToken);
  if (attempt.state === "in_progress" && Date.now() > Date.parse(attempt.expires_at)) {
    attempt.state = "expired";
  }

  return {
    attempt_id: attempt.id,
    assignment_title: assignment.title,
    state: attempt.state,
    answer_revision: attempt.answer_revision,
    expires_at: attempt.expires_at,
    instructions: quiz.instructions,
    questions: quiz.questions,
    answers: Array.from(attempt.answers.values()).map((a) => ({
      question_id: a.question_id,
      selected_choice_id: a.selected_choice_id,
    })),
  };
}

export function autosaveGuestAnswers(
  rawSessionToken: string | undefined,
  input: {
    expected_revision: number;
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
  }
) {
  const { attempt, quiz } = resolveActiveGuestSession(rawSessionToken);

  if (attempt.state !== "in_progress") {
    throw new DomainError(
      409,
      "STATE_CONFLICT",
      "Jawaban tidak dapat diubah karena percobaan sudah selesai."
    );
  }

  if (Date.now() > Date.parse(attempt.expires_at)) {
    attempt.state = "expired";
    throw new DomainError(410, "ATTEMPT_EXPIRED", "Waktu pengerjaan sudah habis.");
  }

  if (input.expected_revision !== attempt.answer_revision) {
    throw new DomainError(
      409,
      "REVISION_CONFLICT",
      "State jawaban berubah di perangkat atau tab lain. Muat ulang state terbaru."
    );
  }

  // Validasi soal & pilihan milik attempt sebelum menyimpan
  try {
    gradeQuizAttempt(buildGradingQuestions(quiz), input.answers);
  } catch (err) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      err instanceof Error ? err.message : "Format jawaban tidak sah."
    );
  }

  const nowIso = new Date().toISOString();
  for (const ans of input.answers) {
    attempt.answers.set(ans.question_id, {
      question_id: ans.question_id,
      selected_choice_id: ans.selected_choice_id,
      is_correct: null,
      updated_at: nowIso,
    });
  }
  attempt.answer_revision += 1;

  return {
    attempt_id: attempt.id,
    answer_revision: attempt.answer_revision,
    saved_at: nowIso,
  };
}

function canonicalRequestHash(
  answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>
): string {
  const sorted = [...answers]
    .sort((a, b) => a.question_id.localeCompare(b.question_id))
    .map((a) => `${a.question_id}:${a.selected_choice_id ?? "null"}`)
    .join("|");
  return hashSha256Hex(sorted);
}

export function submitGuestAttempt(
  rawSessionToken: string | undefined,
  idempotencyKey: string | undefined,
  input: {
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
    confirm_submit: true;
  }
): { receipt: SubmitReceipt; newSessionExpiresAt: string } {
  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    throw new DomainError(400, "INVALID_REQUEST", "Header Idempotency-Key wajib disertakan.");
  }

  const store = getStore();
  const { session, attempt, assignment, quiz } = resolveActiveGuestSession(rawSessionToken);
  const reqHash = canonicalRequestHash(input.answers);
  const scopeKey = `${attempt.id}:submit:${hashSha256Hex(idempotencyKey.trim())}`;

  // 1. Cek idempotency atau state submitted SEBELUM deadline (04_DATABASE §9 & 05_API §4.4)
  const existingIdem = store.idempotency.get(scopeKey);
  if (existingIdem) {
    if (existingIdem.request_hash !== reqHash) {
      throw new DomainError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key sudah dipakai dengan jawaban berbeda."
      );
    }
    return {
      receipt: {
        ...existingIdem.response_json,
        explanations_available: Date.now() >= Date.parse(assignment.closes_at),
      },
      newSessionExpiresAt: session.expires_at,
    };
  }

  if (attempt.state === "submitted" && attempt.submitted_at && attempt.receipt_code) {
    const finalReceipt: SubmitReceipt = {
      attempt_id: attempt.id,
      state: "submitted",
      submitted_at: attempt.submitted_at,
      correct_count: attempt.correct_count ?? 0,
      question_count: attempt.question_count,
      score: attempt.score ?? 0,
      explanations_available: Date.now() >= Date.parse(assignment.closes_at),
      receipt_code: attempt.receipt_code,
    };
    return {
      receipt: finalReceipt,
      newSessionExpiresAt: session.expires_at,
    };
  }

  // 2. Submit pertama: cek tenggat & state in_progress
  if (attempt.state !== "in_progress") {
    throw new DomainError(409, "STATE_CONFLICT", "Percobaan tidak berada pada state aktif.");
  }

  const nowMs = Date.now();
  if (nowMs > Date.parse(attempt.expires_at)) {
    attempt.state = "expired";
    throw new DomainError(410, "ATTEMPT_EXPIRED", "Batas waktu pengerjaan telah lewat.");
  }

  let graded;
  try {
    graded = gradeQuizAttempt(buildGradingQuestions(quiz), input.answers);
  } catch (err) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      err instanceof Error ? err.message : "Jawaban tidak sah."
    );
  }

  const nowIso = new Date(nowMs).toISOString();
  for (const ga of graded.graded_answers) {
    attempt.answers.set(ga.question_id, {
      question_id: ga.question_id,
      selected_choice_id: ga.selected_choice_id,
      is_correct: ga.is_correct,
      updated_at: nowIso,
    });
  }

  attempt.state = "submitted";
  attempt.submitted_at = nowIso;
  attempt.correct_count = graded.correct_count;
  attempt.question_count = graded.question_count;
  attempt.score = graded.score;
  attempt.receipt_code = generateReceiptCode();

  // Perpanjang sesi baca hasil maks 30 menit dari submitted_at (05_API §4.4)
  const readSessionExpires = new Date(nowMs + 30 * 60 * 1000).toISOString();
  session.expires_at = readSessionExpires;

  const receipt: SubmitReceipt = {
    attempt_id: attempt.id,
    state: "submitted",
    submitted_at: nowIso,
    correct_count: graded.correct_count,
    question_count: graded.question_count,
    score: graded.score,
    explanations_available: nowMs >= Date.parse(assignment.closes_at),
    receipt_code: attempt.receipt_code,
  };

  store.idempotency.set(scopeKey, {
    request_hash: reqHash,
    response_json: receipt,
    expires_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
  });

  return { receipt, newSessionExpiresAt: readSessionExpires };
}

export function getGuestResult(rawSessionToken: string | undefined) {
  const { attempt, assignment, quiz } = resolveActiveGuestSession(rawSessionToken);
  if (attempt.state !== "submitted" || !attempt.submitted_at || !attempt.receipt_code) {
    throw new DomainError(409, "STATE_CONFLICT", "Hasil belum tersedia sebelum dikirim.");
  }

  const explanationsAvailable = Date.now() >= Date.parse(assignment.closes_at);

  return {
    attempt_id: attempt.id,
    assignment_title: assignment.title,
    state: "submitted" as const,
    submitted_at: attempt.submitted_at,
    correct_count: attempt.correct_count ?? 0,
    question_count: attempt.question_count,
    score: attempt.score ?? 0,
    receipt_code: attempt.receipt_code,
    explanations_available: explanationsAvailable,
    explanations: explanationsAvailable
      ? quiz.questions.map((q) => ({
          question_id: q.id,
          prompt: q.prompt,
          is_correct: attempt.answers.get(q.id)?.is_correct ?? false,
          explanation: ANSWER_KEY_MAP.get(q.id)?.explanation ?? "",
        }))
      : [],
  };
}

export function endGuestSession(rawSessionToken: string | undefined): void {
  if (!rawSessionToken) return;
  const store = getStore();
  const session = store.guestSessions.get(hashSha256Hex(rawSessionToken));
  if (session) {
    session.revoked_at = new Date().toISOString();
  }
}

/* ==================== TEACHER DASHBOARD & EXPORTS (FR-10, FR-12) ==================== */

function requireActiveTeacher(teacherId: string): TeacherProfile {
  const teacher = getStore().teachers.get(teacherId);
  if (!teacher || teacher.status !== "active") {
    throw new DomainError(403, "ACTION_NOT_ALLOWED", "Akun guru tidak aktif.");
  }
  return teacher;
}

function requireOwnedClass(teacherId: string, classId: string): ClassRecord {
  requireActiveTeacher(teacherId);
  const cls = getStore().classes.get(classId);
  if (!cls || cls.teacher_id !== teacherId) {
    // 404 tanpa membocorkan keberadaan resource guru lain (05_API §7)
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Kelas tidak ditemukan.");
  }
  return cls;
}

function requireOwnedAssignment(teacherId: string, assignmentId: string): AssignmentRecord {
  requireActiveTeacher(teacherId);
  const asg = getStore().assignments.get(assignmentId);
  if (!asg || asg.teacher_id !== teacherId) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Tugas tidak ditemukan.");
  }
  return asg;
}

export function listTeacherClasses(teacherId: string) {
  requireActiveTeacher(teacherId);
  return Array.from(getStore().classes.values()).filter(
    (c) => c.teacher_id === teacherId
  );
}

export function listTeacherSchools(teacherId: string) {
  const teacher = requireActiveTeacher(teacherId);
  const store = getStore();
  return teacher.school_ids
    .map((id) => store.schools.get(id))
    .filter((s): s is { id: string; name: string; district_label: string } => Boolean(s));
}

export function createTeacherClass(
  teacherId: string,
  input: { school_id: string; label: string; grade: 3 | 4; academic_year: string }
): ClassRecord {
  const teacher = requireActiveTeacher(teacherId);
  if (!teacher.school_ids.includes(input.school_id)) {
    throw new DomainError(403, "ACTION_NOT_ALLOWED", "Sekolah tidak terdaftar untuk guru ini.");
  }
  const school = getStore().schools.get(input.school_id);
  if (!school) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Sekolah tidak ditemukan.");
  }

  const cls: ClassRecord = {
    id: randomUUID(),
    teacher_id: teacherId,
    school_id: school.id,
    school_name: school.name,
    label: input.label.trim(),
    grade: input.grade,
    academic_year: input.academic_year,
    archived_at: null,
  };
  getStore().classes.set(cls.id, cls);
  return cls;
}

export function listTeacherAssignmentQuizzes() {
  return SAMPLE_ASSIGNMENT_QUIZZES.map(
    ({ id, revision_id, slug, title, grade, question_count }) => ({
      id,
      revision_id,
      slug,
      title,
      grade,
      question_count,
    })
  );
}

export function listTeacherAssignments(teacherId: string) {
  requireActiveTeacher(teacherId);
  const store = getStore();
  return Array.from(store.assignments.values())
    .filter((a) => a.teacher_id === teacherId)
    .map((a) => {
      const cls = store.classes.get(a.class_id);
      const submittedCount = Array.from(store.attempts.values()).filter(
        (att) => att.assignment_id === a.id && att.state === "submitted"
      ).length;
      return {
        ...a,
        class_label: cls?.label ?? "-",
        submitted_count: submittedCount,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function createTeacherAssignment(
  teacherId: string,
  input: {
    class_id: string;
    quiz_revision_id: string;
    title: string;
    opens_at: string;
    closes_at: string;
    session_minutes?: number;
    consent_confirmed: boolean;
  }
): AssignmentRecord {
  const cls = requireOwnedClass(teacherId, input.class_id);
  const quiz = SAMPLE_ASSIGNMENT_QUIZZES.find(
    (q) => q.revision_id === input.quiz_revision_id
  );
  if (!quiz) {
    throw new DomainError(422, "VALIDATION_FAILED", "Revisi kuis tugas tidak ditemukan.");
  }
  if (quiz.grade !== cls.grade) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      "Kelas dan versi kuis harus memiliki jenjang kelas yang sama (III atau IV)."
    );
  }
  if (Date.parse(input.closes_at) <= Date.parse(input.opens_at)) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      "Waktu tutup tugas harus lebih lambat dari waktu buka."
    );
  }

  const nowIso = new Date().toISOString();
  const assignment: AssignmentRecord = {
    id: randomUUID(),
    class_id: cls.id,
    teacher_id: teacherId,
    grade: cls.grade,
    quiz_revision_id: quiz.revision_id,
    title: input.title.trim(),
    state: "draft",
    opens_at: input.opens_at,
    closes_at: input.closes_at,
    session_minutes: input.session_minutes ?? 120,
    consent_policy_version: "1.0",
    consent_readiness_at: input.consent_confirmed ? nowIso : null,
    created_at: nowIso,
  };
  getStore().assignments.set(assignment.id, assignment);
  return assignment;
}

export function openOrRotateTeacherAssignment(
  teacherId: string,
  assignmentId: string,
  mode: "open" | "rotate"
) {
  const asg = requireOwnedAssignment(teacherId, assignmentId);
  if (asg.state === "revoked" || asg.state === "archived") {
    throw new DomainError(409, "STATE_CONFLICT", "Tugas yang dicabut tidak dapat dibuka ulang.");
  }
  if (!asg.consent_readiness_at) {
    throw new DomainError(
      422,
      "VALIDATION_FAILED",
      "Konfirmasi kesiapan persetujuan orang tua/wali kelas wajib tercatat sebelum tugas dibuka."
    );
  }
  if (mode === "rotate" && asg.state !== "open") {
    throw new DomainError(409, "STATE_CONFLICT", "Hanya tugas aktif yang dapat dirotasi aksesnya.");
  }

  const rawCode = generateReadableJoinCode();
  const rawToken = generateOpaqueToken(24);
  const store = getStore();
  const prev = store.accessByAssignment.get(asg.id);

  store.accessByAssignment.set(asg.id, {
    assignment_id: asg.id,
    join_token_hash: hashSha256Hex(rawToken),
    join_code_digest: hmacSha256Hex(getPepper(), rawCode),
    generation: (prev?.generation ?? 0) + 1,
    rotated_at: new Date().toISOString(),
  });

  asg.state = "open";

  return {
    assignment: asg,
    join_code: rawCode,
    join_token: rawToken,
  };
}

export function closeTeacherAssignment(teacherId: string, assignmentId: string) {
  const asg = requireOwnedAssignment(teacherId, assignmentId);
  if (asg.state !== "open") {
    throw new DomainError(409, "STATE_CONFLICT", "Hanya tugas terbuka yang dapat ditutup.");
  }
  asg.state = "closed";
  return asg;
}

export function revokeTeacherAssignment(
  teacherId: string,
  assignmentId: string,
  reason: string
) {
  if (reason.trim().length < 5) {
    throw new DomainError(422, "VALIDATION_FAILED", "Alasan pencabutan wajib diisi minimal 5 karakter.");
  }
  const asg = requireOwnedAssignment(teacherId, assignmentId);
  asg.state = "revoked";

  const store = getStore();
  const nowIso = new Date().toISOString();
  for (const att of store.attempts.values()) {
    if (att.assignment_id === asg.id && att.state === "in_progress") {
      att.state = "cancelled";
    }
  }
  for (const sess of store.guestSessions.values()) {
    const att = store.attempts.get(sess.attempt_id);
    if (att?.assignment_id === asg.id && !sess.revoked_at) {
      sess.revoked_at = nowIso;
    }
  }
  return asg;
}

export function getTeacherAssignmentResults(
  teacherId: string,
  assignmentId: string,
  filters?: { state?: string; q?: string }
) {
  const asg = requireOwnedAssignment(teacherId, assignmentId);
  const store = getStore();
  const cls = store.classes.get(asg.class_id);

  const allAttempts = Array.from(store.attempts.values()).filter(
    (a) => a.assignment_id === asg.id
  );

  // Deteksi nama ganda per tugas (tanpa menggabungkan baris - desain (5).md §7)
  const nameCounts = new Map<string, number>();
  for (const att of allAttempts) {
    const key = (att.corrected_name ?? att.student_name).trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const query = filters?.q?.trim().toLowerCase() ?? "";

  const rows = allAttempts
    .filter((a) => !filters?.state || filters.state === "all" || a.state === filters.state)
    .filter((a) => {
      if (!query) return true;
      const displayName = (a.corrected_name ?? a.student_name).toLowerCase();
      return (
        displayName.includes(query) || a.student_name.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => (b.submitted_at ?? b.started_at).localeCompare(a.submitted_at ?? a.started_at))
    .map((a) => {
      const displayName = a.corrected_name ?? a.student_name;
      const normKey = displayName.trim().toLowerCase();
      const anns = store.annotations.get(a.id) ?? [];
      const latestVerification =
        [...anns]
          .reverse()
          .find((an) => an.kind === "verified" || an.kind === "invalidated")?.kind ??
        "unverified";
      return {
        attempt_id: a.id,
        student_name: a.student_name,
        corrected_name: a.corrected_name,
        display_name: displayName,
        duplicate_name: (nameCounts.get(normKey) ?? 0) > 1,
        state: a.state,
        score: a.score,
        correct_count: a.correct_count,
        question_count: a.question_count,
        started_at: a.started_at,
        submitted_at: a.submitted_at,
        receipt_code: a.receipt_code,
        verification_status: latestVerification,
        annotations_count: anns.length,
        purge_at: a.purge_at,
      };
    });

  return {
    assignment: {
      ...asg,
      class_label: cls?.label ?? "-",
      auto_purge_at: new Date(Date.parse(asg.closes_at) + 90 * 24 * 60 * 60 * 1000).toISOString(),
    },
    submissions: rows,
  };
}

export function annotateTeacherAttempt(
  teacherId: string,
  attemptId: string,
  input: {
    kind: "verified" | "invalidated" | "name_correction" | "note";
    reason: string;
    corrected_name?: string;
  }
) {
  const store = getStore();
  const attempt = store.attempts.get(attemptId);
  if (!attempt) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Percobaan tidak ditemukan.");
  }
  requireOwnedAssignment(teacherId, attempt.assignment_id);

  if (input.kind === "name_correction") {
    if (!input.corrected_name || input.corrected_name.trim().length < 1) {
      throw new DomainError(422, "VALIDATION_FAILED", "Nama koreksi wajib diisi.");
    }
    attempt.corrected_name = input.corrected_name.trim().slice(0, 80);
  }

  const record: AnnotationRecord = {
    id: randomUUID(),
    attempt_id: attempt.id,
    actor_id: teacherId,
    kind: input.kind,
    reason: input.reason.trim(),
    created_at: new Date().toISOString(),
  };

  const list = store.annotations.get(attempt.id) ?? [];
  list.push(record);
  store.annotations.set(attempt.id, list);

  return record;
}

export function selectTeacherResult(
  teacherId: string,
  assignmentId: string,
  input: { selected_attempt_id: string; reason: string }
) {
  const asg = requireOwnedAssignment(teacherId, assignmentId);
  const store = getStore();
  const attempt = store.attempts.get(input.selected_attempt_id);
  if (!attempt || attempt.assignment_id !== asg.id) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Percobaan tidak ditemukan pada tugas ini.");
  }

  const normDigest = hmacSha256Hex(
    getPepper(),
    (attempt.corrected_name ?? attempt.student_name).trim().toLowerCase()
  );

  store.resultSelections.set(`${asg.id}:${normDigest}`, {
    selected_attempt_id: attempt.id,
    reason: input.reason.trim(),
  });

  return {
    assignment_id: asg.id,
    selected_attempt_id: attempt.id,
  };
}

export function createTeacherCsvExport(teacherId: string, assignmentId: string) {
  const data = getTeacherAssignmentResults(teacherId, assignmentId);
  const header = [
    "Nama Kiriman",
    "Nama Awal",
    "Status",
    "Benar",
    "Total Soal",
    "Nilai",
    "Waktu Kirim (UTC)",
    "Verifikasi",
    "Kode Konfirmasi",
  ]
    .map(neutralizeCsvCell)
    .join(",");

  const lines = data.submissions.map((row) =>
    [
      row.display_name,
      row.student_name,
      row.state,
      row.correct_count ?? "",
      row.question_count,
      row.score ?? "",
      row.submitted_at ?? "",
      row.verification_status,
      row.receipt_code ?? "",
    ]
      .map(neutralizeCsvCell)
      .join(",")
  );

  const csvContent = "\uFEFF" + [header, ...lines].join("\r\n");
  const nowMs = Date.now();
  const job: ExportJobRecord = {
    id: randomUUID(),
    requested_by: teacherId,
    assignment_id: assignmentId,
    csv_content: csvContent,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
  };

  getStore().exports.set(job.id, job);
  return {
    export_id: job.id,
    expires_at: job.expires_at,
  };
}

export function downloadTeacherCsvExport(teacherId: string, exportId: string) {
  requireActiveTeacher(teacherId);
  const job = getStore().exports.get(exportId);
  if (!job || job.requested_by !== teacherId) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Ekspor tidak ditemukan.");
  }
  if (Date.now() > Date.parse(job.expires_at)) {
    throw new DomainError(410, "ATTEMPT_EXPIRED", "Berkas ekspor sudah kedaluwarsa.");
  }
  return job;
}

/**
 * Job retensi idempoten (AT-22, 06_KEAMANAN_DAN_PRIVASI.md §6):
 * menghapus sesi habis/dicabut, idempotency kedaluwarsa, ekspor kedaluwarsa,
 * serta attempt yang melewati purge_at beserta anotasi/seleksi terkaitnya.
 */
export function runRetentionPurge(nowMs = Date.now()) {
  const store = getStore();
  let purgedSessions = 0;
  let purgedIdempotency = 0;
  let purgedExports = 0;
  let purgedAttempts = 0;

  for (const [tokenHash, sess] of store.guestSessions.entries()) {
    if (sess.revoked_at !== null || Date.parse(sess.expires_at) <= nowMs) {
      store.guestSessions.delete(tokenHash);
      purgedSessions += 1;
    }
  }

  for (const [key, rec] of store.idempotency.entries()) {
    if (Date.parse(rec.expires_at) <= nowMs) {
      store.idempotency.delete(key);
      purgedIdempotency += 1;
    }
  }

  for (const [id, exp] of store.exports.entries()) {
    if (Date.parse(exp.expires_at) <= nowMs) {
      store.exports.delete(id);
      purgedExports += 1;
    }
  }

  const purgedAttemptIds = new Set<string>();
  for (const [attemptId, att] of store.attempts.entries()) {
    if (Date.parse(att.purge_at) <= nowMs) {
      store.attempts.delete(attemptId);
      store.annotations.delete(attemptId);
      purgedAttemptIds.add(attemptId);
      purgedAttempts += 1;
    }
  }

  for (const [selKey, sel] of store.resultSelections.entries()) {
    if (purgedAttemptIds.has(sel.selected_attempt_id)) {
      store.resultSelections.delete(selKey);
    }
  }

  return {
    purged_sessions: purgedSessions,
    purged_idempotency: purgedIdempotency,
    purged_exports: purgedExports,
    purged_attempts: purgedAttempts,
  };
}

