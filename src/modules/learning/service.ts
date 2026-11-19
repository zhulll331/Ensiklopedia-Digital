import "server-only";
import { isSupabaseConfigured } from "@/lib/server/env";
import * as localStore from "./server-store";
import * as supaStore from "./supabase-store";

export async function listPublicPracticeQuizzesAsync(grade?: 3 | 4) {
  if (!isSupabaseConfigured()) {
    return localStore.listPublicPracticeQuizzes(grade);
  }
  const remote = await supaStore.listPublicPracticeQuizzesSupabase(grade);
  if (!remote.schemaNotReady) {
    return remote.data;
  }
  if (process.env.NODE_ENV !== "production") {
    return localStore.listPublicPracticeQuizzes(grade);
  }
  return remote.data;
}

export async function getPublicPracticeQuizByIdAsync(idOrSlug: string) {
  if (!isSupabaseConfigured()) {
    return localStore.getPublicPracticeQuizById(idOrSlug);
  }
  const remote = await supaStore.getPublicPracticeQuizByIdSupabase(idOrSlug);
  if (!remote.schemaNotReady) {
    return remote.data;
  }
  if (process.env.NODE_ENV !== "production") {
    return localStore.getPublicPracticeQuizById(idOrSlug);
  }
  return remote.data;
}

export async function checkPracticeQuizSubmissionAsync(
  idOrSlug: string,
  answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>
) {
  if (!isSupabaseConfigured()) {
    return localStore.checkPracticeQuizSubmission(idOrSlug, answers);
  }
  const remote = await supaStore.checkPracticeQuizSubmissionSupabase(idOrSlug, answers);
  if (!remote.schemaNotReady) {
    return remote.data;
  }
  if (process.env.NODE_ENV !== "production") {
    return localStore.checkPracticeQuizSubmission(idOrSlug, answers);
  }
  throw new Error("Schema API Supabase belum siap.");
}

export async function resolveGuestJoinAsync(input: {
  join_code?: string;
  join_token?: string;
}) {
  if (!isSupabaseConfigured()) {
    return localStore.resolveGuestJoin(input);
  }
  return supaStore.resolveGuestJoinSupabase(input);
}

export async function startGuestAttemptAsync(input: {
  join_code?: string;
  join_token?: string;
  student_name: string;
  privacy_notice_version: string;
}) {
  if (!isSupabaseConfigured()) {
    return localStore.startGuestAttempt(input);
  }
  return supaStore.startGuestAttemptSupabase(input);
}

export async function getGuestAttemptStateAsync(rawSessionToken: string | undefined) {
  if (!isSupabaseConfigured()) {
    return localStore.getGuestAttemptState(rawSessionToken);
  }
  return supaStore.getGuestAttemptStateSupabase(rawSessionToken);
}

export async function autosaveGuestAnswersAsync(
  rawSessionToken: string | undefined,
  input: {
    expected_revision: number;
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
  }
) {
  if (!isSupabaseConfigured()) {
    return localStore.autosaveGuestAnswers(rawSessionToken, input);
  }
  return supaStore.autosaveGuestAnswersSupabase(rawSessionToken, input);
}

export async function submitGuestAttemptAsync(
  rawSessionToken: string | undefined,
  idempotencyKey: string | undefined,
  input: {
    answers: ReadonlyArray<{ question_id: string; selected_choice_id: string | null }>;
    confirm_submit: true;
  }
) {
  if (!isSupabaseConfigured()) {
    return localStore.submitGuestAttempt(rawSessionToken, idempotencyKey, input);
  }
  return supaStore.submitGuestAttemptSupabase(rawSessionToken, idempotencyKey, input);
}

export async function getGuestResultAsync(rawSessionToken: string | undefined) {
  if (!isSupabaseConfigured()) {
    return localStore.getGuestResult(rawSessionToken);
  }
  return supaStore.getGuestResultSupabase(rawSessionToken);
}

export async function endGuestSessionAsync(rawSessionToken: string | undefined) {
  if (!isSupabaseConfigured()) {
    localStore.endGuestSession(rawSessionToken);
    return;
  }
  await supaStore.endGuestSessionSupabase(rawSessionToken);
}

export async function listTeacherClassesAsync(teacherId: string) {
  if (!isSupabaseConfigured()) {
    return localStore.listTeacherClasses(teacherId);
  }
  return supaStore.listTeacherClassesSupabase(teacherId);
}

export async function listTeacherSchoolsAsync(teacherId: string) {
  if (!isSupabaseConfigured()) {
    return localStore.listTeacherSchools(teacherId);
  }
  return supaStore.listTeacherSchoolsSupabase(teacherId);
}

export async function createTeacherClassAsync(
  teacherId: string,
  input: { school_id: string; label: string; grade: 3 | 4; academic_year: string }
) {
  if (!isSupabaseConfigured()) {
    return localStore.createTeacherClass(teacherId, input);
  }
  return supaStore.createTeacherClassSupabase(teacherId, input);
}

export async function listTeacherAssignmentQuizzesAsync(teacherId: string) {
  if (!isSupabaseConfigured()) {
    return localStore.listTeacherAssignmentQuizzes();
  }
  return supaStore.listTeacherAssignmentQuizzesSupabase(teacherId);
}

export async function listTeacherAssignmentsAsync(teacherId: string) {
  if (!isSupabaseConfigured()) {
    return localStore.listTeacherAssignments(teacherId);
  }
  return supaStore.listTeacherAssignmentsSupabase(teacherId);
}

export async function createTeacherAssignmentAsync(
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
  if (!isSupabaseConfigured()) {
    return localStore.createTeacherAssignment(teacherId, input);
  }
  return supaStore.createTeacherAssignmentSupabase(teacherId, input);
}

export async function openOrRotateTeacherAssignmentAsync(
  teacherId: string,
  assignmentId: string,
  mode: "open" | "rotate"
) {
  if (!isSupabaseConfigured()) {
    return localStore.openOrRotateTeacherAssignment(teacherId, assignmentId, mode);
  }
  return supaStore.openOrRotateTeacherAssignmentSupabase(teacherId, assignmentId, mode);
}

export async function closeTeacherAssignmentAsync(
  teacherId: string,
  assignmentId: string
) {
  if (!isSupabaseConfigured()) {
    return localStore.closeTeacherAssignment(teacherId, assignmentId);
  }
  return supaStore.closeTeacherAssignmentSupabase(teacherId, assignmentId);
}

export async function revokeTeacherAssignmentAsync(
  teacherId: string,
  assignmentId: string,
  reason: string
) {
  if (!isSupabaseConfigured()) {
    return localStore.revokeTeacherAssignment(teacherId, assignmentId, reason);
  }
  return supaStore.revokeTeacherAssignmentSupabase(teacherId, assignmentId, reason);
}

export async function getTeacherAssignmentResultsAsync(
  teacherId: string,
  assignmentId: string,
  filters?: { state?: string; q?: string }
) {
  if (!isSupabaseConfigured()) {
    return localStore.getTeacherAssignmentResults(teacherId, assignmentId, filters);
  }
  return supaStore.getTeacherAssignmentResultsSupabase(teacherId, assignmentId, filters);
}

export async function annotateTeacherAttemptAsync(
  teacherId: string,
  attemptId: string,
  input: {
    kind: "verified" | "invalidated" | "name_correction" | "note";
    reason: string;
    corrected_name?: string;
  }
) {
  if (!isSupabaseConfigured()) {
    return localStore.annotateTeacherAttempt(teacherId, attemptId, input);
  }
  return supaStore.annotateTeacherAttemptSupabase(teacherId, attemptId, input);
}

export async function selectTeacherResultAsync(
  teacherId: string,
  assignmentId: string,
  input: { selected_attempt_id: string; reason: string }
) {
  if (!isSupabaseConfigured()) {
    return localStore.selectTeacherResult(teacherId, assignmentId, input);
  }
  return supaStore.selectTeacherResultSupabase(teacherId, assignmentId, input);
}

export async function createTeacherCsvExportAsync(
  teacherId: string,
  assignmentId: string
) {
  if (!isSupabaseConfigured()) {
    return localStore.createTeacherCsvExport(teacherId, assignmentId);
  }
  return supaStore.createTeacherCsvExportSupabase(teacherId, assignmentId);
}

export async function downloadTeacherCsvExportAsync(
  teacherId: string,
  exportId: string
) {
  if (!isSupabaseConfigured()) {
    return localStore.downloadTeacherCsvExport(teacherId, exportId);
  }
  return supaStore.downloadTeacherCsvExportSupabase(teacherId, exportId);
}

export async function runRetentionPurgeAsync() {
  if (!isSupabaseConfigured()) {
    return localStore.runRetentionPurge();
  }
  return supaStore.runRetentionPurgeSupabase();
}
