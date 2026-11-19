import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import {
  generateOpaqueToken,
  hashSha256Hex,
  hmacSha256Hex,
  neutralizeCsvCell,
} from "@/lib/server/crypto";
import { getServerEnv } from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
  createPublicSupabaseClient,
} from "@/lib/server/supabase";
import { DomainError, mapPostgresErrorToDomainError } from "./errors";
import { normalizeJoinCode } from "./quiz";
import type { PublicQuizDefinition } from "./sample-quizzes";
import type { AssignmentRecord, ClassRecord } from "./server-store";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function requirePepper(): string {
  const pepper = getServerEnv().JOIN_CODE_PEPPER;
  if (!pepper) {
    throw new DomainError(
      503,
      "INVALID_REQUEST",
      "JOIN_CODE_PEPPER belum dikonfigurasi pada server."
    );
  }
  return pepper;
}

function generateReadableJoinCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    const b = bytes[i] ?? 0;
    out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  return out;
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

export function isSupabaseSchemaNotReadyError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST106" || error.code === "42P01" || error.code === "3F000") {
    return true;
  }
  return /invalid schema|does not exist|could not find the (table|function)/i.test(
    error.message ?? ""
  );
}

function throwMappedRpcError(error: { code?: string; message?: string }): never {
  const mapped = mapPostgresErrorToDomainError(error);
  if (mapped) {
    throw mapped;
  }
  throw new Error(error.message || "Kesalahan operasi database Supabase.");
}

function extractText(jsonVal: unknown): string {
  if (typeof jsonVal === "string") return jsonVal;
  if (jsonVal && typeof jsonVal === "object" && "text" in jsonVal) {
    const t = (jsonVal as { text?: unknown }).text;
    return typeof t === "string" ? t : "";
  }
  return "";
}

/* ==================== PRACTICE QUIZZES ==================== */

export async function listPublicPracticeQuizzesSupabase(grade?: 3 | 4) {
  const client = createPublicSupabaseClient();
  if (!client) return { schemaNotReady: true, data: [] };

  const { data: quizzes, error } = await client
    .schema("app")
    .from("quizzes")
    .select("id, slug, published_revision_id")
    .is("archived_at", null)
    .not("published_revision_id", "is", null);

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) return { schemaNotReady: true, data: [] };
    throw new Error(error.message);
  }

  const revIds = (quizzes ?? [])
    .map((q) => q.published_revision_id)
    .filter((id): id is string => Boolean(id));

  if (revIds.length === 0) return { schemaNotReady: false, data: [] };

  const { data: revisions, error: revErr } = await client
    .schema("app")
    .from("quiz_revisions")
    .select("id, quiz_id, title, grade, usage_mode, instructions")
    .in("id", revIds)
    .eq("usage_mode", "practice")
    .eq("status", "published");

  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) return { schemaNotReady: true, data: [] };
    throw new Error(revErr.message);
  }

  const { data: questions } = await client
    .schema("app")
    .from("quiz_questions")
    .select("id, quiz_revision_id")
    .in("quiz_revision_id", (revisions ?? []).map((r) => r.id));

  const quizSlugMap = new Map((quizzes ?? []).map((q) => [q.id, q.slug]));
  const countMap = new Map<string, number>();
  for (const qq of questions ?? []) {
    countMap.set(qq.quiz_revision_id, (countMap.get(qq.quiz_revision_id) ?? 0) + 1);
  }

  const items = (revisions ?? [])
    .filter((r) => !grade || r.grade === grade)
    .map((r) => ({
      id: r.quiz_id,
      revision_id: r.id,
      slug: quizSlugMap.get(r.quiz_id) ?? r.quiz_id,
      title: r.title,
      grade: r.grade as 3 | 4,
      instructions: r.instructions,
      question_count: countMap.get(r.id) ?? 0,
    }));

  return { schemaNotReady: false, data: items };
}

export async function getPublicPracticeQuizByIdSupabase(
  idOrSlug: string
): Promise<{ schemaNotReady: boolean; data: PublicQuizDefinition | null }> {
  const client = createPublicSupabaseClient();
  if (!client) return { schemaNotReady: true, data: null };

  const { data: quizzes, error } = await client
    .schema("app")
    .from("quizzes")
    .select("id, slug, published_revision_id")
    .is("archived_at", null)
    .not("published_revision_id", "is", null);

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) return { schemaNotReady: true, data: null };
    throw new Error(error.message);
  }

  const target = (quizzes ?? []).find((q) => q.id === idOrSlug || q.slug === idOrSlug);
  if (!target?.published_revision_id) {
    return { schemaNotReady: false, data: null };
  }

  const { data: rev, error: revErr } = await client
    .schema("app")
    .from("quiz_revisions")
    .select("id, quiz_id, title, grade, usage_mode, instructions")
    .eq("id", target.published_revision_id)
    .eq("usage_mode", "practice")
    .eq("status", "published")
    .maybeSingle();

  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) return { schemaNotReady: true, data: null };
    throw new Error(revErr.message);
  }
  if (!rev) return { schemaNotReady: false, data: null };

  const { data: qRows } = await client
    .schema("app")
    .from("quiz_questions")
    .select("id, position, prompt_json")
    .eq("quiz_revision_id", rev.id)
    .order("position", { ascending: true });

  const qIds = (qRows ?? []).map((q) => q.id);
  const { data: cRows } =
    qIds.length > 0
      ? await client
          .schema("app")
          .from("quiz_choices")
          .select("id, question_id, position, label_json")
          .in("question_id", qIds)
          .order("position", { ascending: true })
      : { data: [] };

  const choicesByQ = new Map<string, PublicQuizDefinition["questions"][number]["choices"]>();
  for (const c of cRows ?? []) {
    const arr = choicesByQ.get(c.question_id) ?? [];
    arr.push({
      id: c.id,
      position: c.position as 1 | 2 | 3 | 4,
      label: extractText(c.label_json),
    });
    choicesByQ.set(c.question_id, arr);
  }

  return {
    schemaNotReady: false,
    data: {
      id: target.id,
      revision_id: rev.id,
      slug: target.slug,
      title: rev.title,
      grade: rev.grade as 3 | 4,
      usage_mode: "practice",
      instructions: rev.instructions,
      question_count: (qRows ?? []).length,
      questions: (qRows ?? []).map((q) => ({
        id: q.id,
        position: q.position,
        prompt: extractText(q.prompt_json),
        choices: choicesByQ.get(q.id) ?? [],
      })),
    },
  };
}

export async function checkPracticeQuizSubmissionSupabase(
  idOrSlug: string,
  answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>
) {
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("check_practice_quiz", {
    p_quiz_id_or_slug: idOrSlug,
    p_answers: answers,
  });

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return { schemaNotReady: true as const, data: null };
    }
    throwMappedRpcError(error);
  }
  return { schemaNotReady: false as const, data };
}

/* ==================== GUEST TASK FLOW ==================== */

export async function resolveGuestJoinSupabase(input: {
  join_code?: string;
  join_token?: string;
}) {
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const p_token_hash = input.join_token ? hashSha256Hex(input.join_token.trim()) : null;
  const p_code_digest = input.join_code
    ? hmacSha256Hex(requirePepper(), normalizeJoinCode(input.join_code))
    : null;

  const { data, error } = await admin.schema("api").rpc("resolve_guest_join", {
    p_token_hash,
    p_code_digest,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return {
    assignment_title: data.assignment_title,
    class_label: data.class_label,
    grade: data.grade,
    teacher_display_name: data.teacher_display_name,
    can_start: Boolean(data.can_start),
    privacy_notice_version: data.privacy_notice_version,
    privacy_notice_summary:
      "Namamu hanya dikirim kepada guru pemilik tugas untuk rekap belajar kelas dan tidak dipublikasikan.",
  };
}

export async function startGuestAttemptSupabase(input: {
  join_code?: string;
  join_token?: string;
  student_name: string;
  privacy_notice_version: string;
}) {
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const rawSessionToken = generateOpaqueToken(32);
  const sessionTokenHash = hashSha256Hex(rawSessionToken);
  const p_token_hash = input.join_token ? hashSha256Hex(input.join_token.trim()) : null;
  const p_code_digest = input.join_code
    ? hmacSha256Hex(requirePepper(), normalizeJoinCode(input.join_code))
    : null;

  const { data, error } = await admin.schema("api").rpc("start_guest_attempt", {
    p_token_hash,
    p_code_digest,
    p_student_name: input.student_name.trim(),
    p_session_token_hash: sessionTokenHash,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return {
    rawSessionToken,
    sessionExpiresAt: data.expires_at as string,
    payload: {
      attempt_id: data.attempt_id,
      assignment_title: data.assignment_title,
      state: data.state,
      expires_at: data.expires_at,
      answer_revision: data.answer_revision,
      instructions: data.instructions,
      questions: data.questions,
    },
  };
}

export async function getGuestAttemptStateSupabase(rawSessionToken: string | undefined) {
  if (!rawSessionToken) {
    throw new DomainError(401, "AUTH_REQUIRED", "Sesi pengerjaan tidak ditemukan.");
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("get_guest_attempt", {
    p_session_token_hash: hashSha256Hex(rawSessionToken),
  });

  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}

export async function autosaveGuestAnswersSupabase(
  rawSessionToken: string | undefined,
  input: {
    expected_revision: number;
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
  }
) {
  if (!rawSessionToken) {
    throw new DomainError(401, "AUTH_REQUIRED", "Sesi pengerjaan tidak ditemukan.");
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("autosave_guest_answers", {
    p_session_token_hash: hashSha256Hex(rawSessionToken),
    p_expected_revision: input.expected_revision,
    p_answers: input.answers,
  });

  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}

export async function submitGuestAttemptSupabase(
  rawSessionToken: string | undefined,
  idempotencyKey: string | undefined,
  input: {
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
    confirm_submit: true;
  }
) {
  if (!rawSessionToken) {
    throw new DomainError(401, "AUTH_REQUIRED", "Sesi pengerjaan tidak ditemukan.");
  }
  if (!idempotencyKey || idempotencyKey.trim().length < 8) {
    throw new DomainError(400, "INVALID_REQUEST", "Header Idempotency-Key wajib disertakan.");
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("submit_guest_attempt", {
    p_session_token_hash: hashSha256Hex(rawSessionToken),
    p_idempotency_key_digest: hashSha256Hex(idempotencyKey.trim()),
    p_request_hash: canonicalRequestHash(input.answers),
    p_answers: input.answers,
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return {
    receipt: data,
    newSessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

export async function getGuestResultSupabase(rawSessionToken: string | undefined) {
  if (!rawSessionToken) {
    throw new DomainError(401, "AUTH_REQUIRED", "Sesi pengerjaan tidak ditemukan.");
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("get_guest_result", {
    p_session_token_hash: hashSha256Hex(rawSessionToken),
  });

  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}

export async function endGuestSessionSupabase(rawSessionToken: string | undefined) {
  if (!rawSessionToken) return;
  const admin = createAdminSecretSupabaseClient();
  if (!admin) return;

  await admin.schema("api").rpc("end_guest_session", {
    p_session_token_hash: hashSha256Hex(rawSessionToken),
  });
}

/* ==================== TEACHER DASHBOARD (RLS via Adult Session) ==================== */

async function requireAdultClient(teacherId: string) {
  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    throw new DomainError(401, "AUTH_REQUIRED", "Autentikasi guru diperlukan.");
  }
  const { data: profile, error } = await supabase
    .schema("app")
    .from("profiles")
    .select("user_id, role, status, display_name")
    .eq("user_id", teacherId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!profile || profile.role !== "teacher" || profile.status !== "active") {
    throw new DomainError(403, "ACTION_NOT_ALLOWED", "Akun guru belum aktif.");
  }
  return supabase;
}

export async function listTeacherClassesSupabase(teacherId: string): Promise<ClassRecord[]> {
  const supabase = await requireAdultClient(teacherId);
  const { data: rows, error } = await supabase
    .schema("app")
    .from("classes")
    .select("id, teacher_id, school_id, label, grade, academic_year, archived_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const schoolIds = Array.from(new Set((rows ?? []).map((r) => r.school_id)));
  const { data: schools } =
    schoolIds.length > 0
      ? await supabase.schema("app").from("schools").select("id, name").in("id", schoolIds)
      : { data: [] };

  const schoolNameMap = new Map((schools ?? []).map((s) => [s.id, s.name]));
  return (rows ?? []).map((r) => ({
    id: r.id,
    teacher_id: r.teacher_id,
    school_id: r.school_id,
    school_name: schoolNameMap.get(r.school_id) ?? "Sekolah",
    label: r.label,
    grade: r.grade as 3 | 4,
    academic_year: r.academic_year,
    archived_at: r.archived_at,
  }));
}

export async function listTeacherSchoolsSupabase(teacherId: string) {
  const supabase = await requireAdultClient(teacherId);
  const { data, error } = await supabase
    .schema("app")
    .from("schools")
    .select("id, name, district_label")
    .eq("status", "active");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTeacherClassSupabase(
  teacherId: string,
  input: { school_id: string; label: string; grade: 3 | 4; academic_year: string }
): Promise<ClassRecord> {
  const supabase = await requireAdultClient(teacherId);
  const { data, error } = await supabase
    .schema("app")
    .from("classes")
    .insert({
      teacher_id: teacherId,
      school_id: input.school_id,
      label: input.label.trim(),
      grade: input.grade,
      academic_year: input.academic_year,
    })
    .select("id, teacher_id, school_id, label, grade, academic_year, archived_at")
    .single();

  if (error) {
    throw new DomainError(403, "ACTION_NOT_ALLOWED", "Gagal membuat kelas pada sekolah tersebut.");
  }

  return {
    ...data,
    grade: data.grade as 3 | 4,
    school_name: "Sekolah Terdaftar",
  };
}

export async function listTeacherAssignmentQuizzesSupabase(teacherId: string) {
  const supabase = await requireAdultClient(teacherId);
  const { data: quizzes, error } = await supabase
    .schema("app")
    .from("quizzes")
    .select("id, slug, published_revision_id")
    .is("archived_at", null)
    .not("published_revision_id", "is", null);

  if (error) throw new Error(error.message);
  const revIds = (quizzes ?? [])
    .map((q) => q.published_revision_id)
    .filter((id): id is string => Boolean(id));
  if (revIds.length === 0) return [];

  const { data: revs } = await supabase
    .schema("app")
    .from("quiz_revisions")
    .select("id, quiz_id, title, grade")
    .in("id", revIds)
    .eq("usage_mode", "assignment")
    .eq("status", "published");

  const assignmentRevIds = (revs ?? []).map((r) => r.id);
  const { data: questions } =
    assignmentRevIds.length > 0
      ? await supabase
          .schema("app")
          .from("quiz_questions")
          .select("id, quiz_revision_id")
          .in("quiz_revision_id", assignmentRevIds)
      : { data: [] };

  const slugMap = new Map((quizzes ?? []).map((q) => [q.id, q.slug]));
  const countMap = new Map<string, number>();
  for (const qq of questions ?? []) {
    countMap.set(qq.quiz_revision_id, (countMap.get(qq.quiz_revision_id) ?? 0) + 1);
  }

  return (revs ?? []).map((r) => ({
    id: r.quiz_id,
    revision_id: r.id,
    slug: slugMap.get(r.quiz_id) ?? r.quiz_id,
    title: r.title,
    grade: r.grade as 3 | 4,
    question_count: countMap.get(r.id) ?? 0,
  }));
}

export async function listTeacherAssignmentsSupabase(teacherId: string) {
  const supabase = await requireAdultClient(teacherId);
  const { data: rows, error } = await supabase
    .schema("app")
    .from("assignments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const classIds = Array.from(new Set((rows ?? []).map((r) => r.class_id)));
  const asgIds = (rows ?? []).map((r) => r.id);

  const [{ data: classes }, { data: attempts }] = await Promise.all([
    classIds.length > 0
      ? supabase.schema("app").from("classes").select("id, label").in("id", classIds)
      : { data: [] },
    asgIds.length > 0
      ? supabase
          .schema("app")
          .from("attempts")
          .select("assignment_id, state")
          .in("assignment_id", asgIds)
          .eq("state", "submitted")
      : { data: [] },
  ]);

  const classLabelMap = new Map((classes ?? []).map((c) => [c.id, c.label]));
  const countMap = new Map<string, number>();
  for (const att of attempts ?? []) {
    countMap.set(att.assignment_id, (countMap.get(att.assignment_id) ?? 0) + 1);
  }

  return (rows ?? []).map((a) => ({
    ...(a as AssignmentRecord),
    class_label: classLabelMap.get(a.class_id) ?? "-",
    submitted_count: countMap.get(a.id) ?? 0,
  }));
}

export async function createTeacherAssignmentSupabase(
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
) {
  const supabase = await requireAdultClient(teacherId);
  const { data: cls } = await supabase
    .schema("app")
    .from("classes")
    .select("id, grade, teacher_id")
    .eq("id", input.class_id)
    .maybeSingle();

  if (!cls || cls.teacher_id !== teacherId) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Kelas tidak ditemukan.");
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .schema("app")
    .from("assignments")
    .insert({
      class_id: cls.id,
      teacher_id: teacherId,
      grade: cls.grade,
      quiz_revision_id: input.quiz_revision_id,
      usage_mode: "assignment",
      title: input.title.trim(),
      state: "draft",
      opens_at: input.opens_at,
      closes_at: input.closes_at,
      session_minutes: input.session_minutes ?? 120,
      consent_policy_version: "1.0",
      consent_readiness_at: input.consent_confirmed ? nowIso : null,
      created_by: teacherId,
    })
    .select("*")
    .single();

  if (error) {
    throw new DomainError(422, "VALIDATION_FAILED", error.message);
  }
  return data;
}

export async function openOrRotateTeacherAssignmentSupabase(
  teacherId: string,
  assignmentId: string,
  mode: "open" | "rotate"
) {
  await requireAdultClient(teacherId);
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const rawCode = generateReadableJoinCode();
  const rawToken = generateOpaqueToken(24);

  const { data, error } = await admin.schema("api").rpc("open_or_rotate_assignment_access", {
    p_teacher_id: teacherId,
    p_assignment_id: assignmentId,
    p_mode: mode,
    p_join_token_hash: hashSha256Hex(rawToken),
    p_join_code_digest: hmacSha256Hex(requirePepper(), rawCode),
  });

  if (error) {
    throwMappedRpcError(error);
  }

  return {
    assignment: data,
    join_code: rawCode,
    join_token: rawToken,
  };
}

export async function closeTeacherAssignmentSupabase(
  teacherId: string,
  assignmentId: string
) {
  const supabase = await requireAdultClient(teacherId);
  const { data: existing } = await supabase
    .schema("app")
    .from("assignments")
    .select("id, state")
    .eq("id", assignmentId)
    .maybeSingle();

  if (!existing) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Tugas tidak ditemukan.");
  }
  if (existing.state !== "open") {
    throw new DomainError(409, "STATE_CONFLICT", "Hanya tugas terbuka yang dapat ditutup.");
  }

  const { data, error } = await supabase
    .schema("app")
    .from("assignments")
    .update({ state: "closed" })
    .eq("id", assignmentId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function revokeTeacherAssignmentSupabase(
  teacherId: string,
  assignmentId: string,
  reason: string
) {
  await requireAdultClient(teacherId);
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("revoke_assignment_sessions", {
    p_teacher_id: teacherId,
    p_assignment_id: assignmentId,
    p_reason: reason,
  });

  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}

export async function getTeacherAssignmentResultsSupabase(
  teacherId: string,
  assignmentId: string,
  filters?: { state?: string; q?: string }
) {
  const supabase = await requireAdultClient(teacherId);
  const { data: asg, error: asgErr } = await supabase
    .schema("app")
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (asgErr) throw new Error(asgErr.message);
  if (!asg) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Tugas tidak ditemukan.");
  }

  const [{ data: cls }, { data: attempts }] = await Promise.all([
    supabase.schema("app").from("classes").select("label").eq("id", asg.class_id).maybeSingle(),
    supabase
      .schema("app")
      .from("attempts")
      .select("*")
      .eq("assignment_id", asg.id)
      .order("submitted_at", { ascending: false, nullsFirst: false }),
  ]);

  const attIds = (attempts ?? []).map((a) => a.id);
  const { data: annotations } =
    attIds.length > 0
      ? await supabase
          .schema("app")
          .from("attempt_annotations")
          .select("attempt_id, kind, created_at")
          .in("attempt_id", attIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  const annMap = new Map<string, Array<{ kind: string; created_at: string }>>();
  for (const an of annotations ?? []) {
    const list = annMap.get(an.attempt_id) ?? [];
    list.push(an);
    annMap.set(an.attempt_id, list);
  }

  const nameCounts = new Map<string, number>();
  for (const att of attempts ?? []) {
    const key = String(att.corrected_name ?? att.student_name).trim().toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  const query = filters?.q?.trim().toLowerCase() ?? "";
  const submissions = (attempts ?? [])
    .filter((a) => !filters?.state || filters.state === "all" || a.state === filters.state)
    .filter((a) => {
      if (!query) return true;
      const displayName = String(a.corrected_name ?? a.student_name).toLowerCase();
      return (
        displayName.includes(query) || String(a.student_name).toLowerCase().includes(query)
      );
    })
    .map((a) => {
      const displayName = String(a.corrected_name ?? a.student_name);
      const normKey = displayName.trim().toLowerCase();
      const anns = annMap.get(a.id) ?? [];
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
        score: a.score !== null ? Number(a.score) : null,
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
      auto_purge_at: new Date(
        Date.parse(asg.closes_at) + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    },
    submissions,
  };
}

export async function annotateTeacherAttemptSupabase(
  teacherId: string,
  attemptId: string,
  input: {
    kind: "verified" | "invalidated" | "name_correction" | "note";
    reason: string;
    corrected_name?: string;
  }
) {
  await requireAdultClient(teacherId);
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("annotate_teacher_attempt", {
    p_teacher_id: teacherId,
    p_attempt_id: attemptId,
    p_kind: input.kind,
    p_reason: input.reason,
    p_corrected_name: input.corrected_name ?? null,
  });

  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}

export async function selectTeacherResultSupabase(
  teacherId: string,
  assignmentId: string,
  input: { selected_attempt_id: string; reason: string }
) {
  const supabase = await requireAdultClient(teacherId);
  const { data: att } = await supabase
    .schema("app")
    .from("attempts")
    .select("id, assignment_id, student_name, corrected_name")
    .eq("id", input.selected_attempt_id)
    .eq("assignment_id", assignmentId)
    .maybeSingle();

  if (!att) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Percobaan tidak ditemukan.");
  }

  const normDigest = hmacSha256Hex(
    requirePepper(),
    String(att.corrected_name ?? att.student_name).trim().toLowerCase()
  );

  const { error } = await supabase
    .schema("app")
    .from("result_selections")
    .upsert({
      assignment_id: assignmentId,
      normalized_name_digest: normDigest,
      selected_attempt_id: att.id,
      selected_by: teacherId,
      reason: input.reason.trim(),
      updated_at: new Date().toISOString(),
    });

  if (error) throw new Error(error.message);

  return {
    assignment_id: assignmentId,
    selected_attempt_id: att.id,
  };
}

export async function createTeacherCsvExportSupabase(
  teacherId: string,
  assignmentId: string
) {
  const data = await getTeacherAssignmentResultsSupabase(teacherId, assignmentId);
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

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
  const objectPath = `${teacherId}/${assignmentId}/${randomUUID()}.csv`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: uploadErr } = await admin.storage
    .from("exports-private")
    .upload(objectPath, Buffer.from(csvContent, "utf8"), {
      contentType: "text/csv; charset=utf-8",
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Gagal menyimpan CSV ke storage privat: ${uploadErr.message}`);
  }

  const { data: exportId, error: rpcErr } = await admin
    .schema("api")
    .rpc("create_export_job", {
      p_teacher_id: teacherId,
      p_assignment_id: assignmentId,
      p_object_path: objectPath,
      p_expires_at: expiresAt,
    });

  if (rpcErr) {
    throwMappedRpcError(rpcErr);
  }

  return {
    export_id: String(exportId),
    expires_at: expiresAt,
  };
}

export async function downloadTeacherCsvExportSupabase(
  teacherId: string,
  exportId: string
) {
  await requireAdultClient(teacherId);
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data: job, error: rpcErr } = await admin
    .schema("api")
    .rpc("get_export_job_for_teacher", {
      p_teacher_id: teacherId,
      p_export_id: exportId,
    });

  if (rpcErr) {
    throwMappedRpcError(rpcErr);
  }

  const { data: fileBlob, error: dlErr } = await admin.storage
    .from("exports-private")
    .download(job.object_path);

  if (dlErr || !fileBlob) {
    throw new DomainError(404, "RESOURCE_NOT_FOUND", "Berkas ekspor tidak ditemukan di storage.");
  }

  const csvContent = await fileBlob.text();
  return {
    id: String(job.id),
    assignment_id: String(job.assignment_id),
    csv_content: csvContent,
  };
}

export async function runRetentionPurgeSupabase() {
  const admin = createAdminSecretSupabaseClient();
  if (!admin) throw new Error("SUPABASE_ADMIN_SECRET belum dikonfigurasi.");

  const { data, error } = await admin.schema("api").rpc("run_retention_purge");
  if (error) {
    throwMappedRpcError(error);
  }
  return data;
}
