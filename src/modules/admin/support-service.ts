import "server-only";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/server/env";
import { createRequestId } from "@/lib/server/http";
import { logServerEvent } from "@/lib/server/logger";
import { createAdminSecretSupabaseClient } from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import {
  enrichSupportAttempts,
  mapAdminSupportPostgresError,
  type EnrichedSupportAttemptRow,
  type RawSupportAttemptRow,
} from "@/modules/admin/support-schemas";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminSupportAssignmentItem {
  id: string;
  title: string;
  state: string;
  grade: 3 | 4;
  opens_at: string;
  closes_at: string;
  class_label: string;
  academic_year: string;
  school_name: string;
  teacher_display_name: string;
  quiz_title: string;
  attempt_count: number;
  submitted_count: number;
}

export interface AdminSupportSessionRow {
  id: string;
  assignment_id: string;
  assignment_title: string;
  class_label: string;
  school_name: string;
  teacher_display_name: string;
  reason: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface AdminSupportOverviewResult {
  assignments: AdminSupportAssignmentItem[];
  sessions: AdminSupportSessionRow[];
  server_now_utc: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminSupportReadResultsPayload {
  session: AdminSupportSessionRow;
  assignment: Omit<
    AdminSupportAssignmentItem,
    "quiz_title" | "attempt_count" | "submitted_count"
  >;
  attempts: EnrichedSupportAttemptRow[];
  server_now_utc: string;
}

// Sampel non-PII untuk mode demo lokal (tanpa nama siswa di luar sesi aktif)
const DEMO_SUPPORT_ASSIGNMENTS: AdminSupportAssignmentItem[] = [
  {
    id: "asg-demo-1",
    title: "Latihan Tugas Kelas III: Mengenal Megalitik",
    state: "open",
    grade: 3,
    opens_at: "2026-04-01T00:00:00Z",
    closes_at: "2026-04-15T15:00:00Z",
    class_label: "III A",
    academic_year: "2026/2027",
    school_name: "SDN 1 Kemiren",
    teacher_display_name: "Ibu Sari",
    quiz_title: "Mengenal Megalitik Banyuwangi (Kelas III)",
    attempt_count: 3,
    submitted_count: 2,
  },
  {
    id: "asg-demo-2",
    title: "Evaluasi Pelestarian Situs Megalitik",
    state: "closed",
    grade: 4,
    opens_at: "2026-03-10T01:00:00Z",
    closes_at: "2026-03-20T12:00:00Z",
    class_label: "IV A",
    academic_year: "2026/2027",
    school_name: "SDN 1 Kemiren",
    teacher_display_name: "Ibu Sari",
    quiz_title: "Pelestarian Warisan Batu Besar (Kelas IV)",
    attempt_count: 18,
    submitted_count: 18,
  },
];

const DEMO_SUPPORT_SESSIONS: AdminSupportSessionRow[] = [
  {
    id: "sup-demo-hist-1",
    assignment_id: "asg-demo-1",
    assignment_title: "Latihan Tugas Kelas III: Mengenal Megalitik",
    class_label: "III A",
    school_name: "SDN 1 Kemiren",
    teacher_display_name: "Ibu Sari",
    reason: "Contoh riwayat dukungan teknis pengecekan kiriman bermasalah atas permintaan guru.",
    expires_at: "2026-04-02T03:15:00Z",
    revoked_at: null,
    created_at: "2026-04-02T03:00:00Z",
    is_active: false,
  },
];

function assertSupabaseSupportWriteReady(session: AdminSessionResult) {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mode demo lokal hanya menyediakan pratinjau non-PII baca-saja untuk Mode Dukungan."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Sesi admin terverifikasi MFA serta SUPABASE_ADMIN_SECRET dibutuhkan untuk Mode Dukungan."
    );
  }
  return { admin, actorId: session.userId };
}

export async function getAdminSupportOverviewAsync(
  session: AdminSessionResult
): Promise<AdminSupportOverviewResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return {
      assignments: DEMO_SUPPORT_ASSIGNMENTS,
      sessions: DEMO_SUPPORT_SESSIONS,
      server_now_utc: new Date().toISOString(),
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    return {
      assignments: [],
      sessions: [],
      server_now_utc: new Date().toISOString(),
      mode: "supabase",
      migrationPending: false,
    };
  }

  const { data, error } = await admin
    .schema("api")
    .rpc("list_admin_support_overview", {
      p_actor_id: session.userId,
    });

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return {
        assignments: [],
        sessions: [],
        server_now_utc: new Date().toISOString(),
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw mapAdminSupportPostgresError(error) ?? new Error(error.message);
  }

  const payload = (data ?? {}) as {
    assignments?: AdminSupportAssignmentItem[];
    sessions?: AdminSupportSessionRow[];
    server_now_utc?: string;
  };

  return {
    assignments: Array.isArray(payload.assignments) ? payload.assignments : [],
    sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function createSupportAccessAsync(
  session: AdminSessionResult,
  input: {
    assignment_id: string;
    reason: string;
    duration_minutes: number;
    requestId: string;
  }
): Promise<AdminSupportSessionRow & { server_now_utc: string }> {
  const { admin, actorId } = assertSupabaseSupportWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("create_support_access", {
      p_actor_id: actorId,
      p_assignment_id: input.assignment_id,
      p_reason: input.reason,
      p_duration_minutes: input.duration_minutes,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminSupportPostgresError(error) ?? new Error(error.message);
  }

  logServerEvent({
    request_id: input.requestId || createRequestId(),
    route: "/api/v1/admin/support-access",
    action: "support_access_granted",
    outcome: "success",
    status: 201,
    metadata: {
      assignment_id: input.assignment_id,
      duration_minutes: input.duration_minutes,
    },
  });

  revalidatePath("/admin/dukungan");
  return data as AdminSupportSessionRow & { server_now_utc: string };
}

export async function readSupportAccessResultsAsync(
  session: AdminSessionResult,
  input: {
    supportAccessId: string;
    requestId: string;
  }
): Promise<AdminSupportReadResultsPayload> {
  const { admin, actorId } = assertSupabaseSupportWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("read_support_access_results", {
      p_actor_id: actorId,
      p_support_access_id: input.supportAccessId,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminSupportPostgresError(error) ?? new Error(error.message);
  }

  const raw = (data ?? {}) as {
    session: AdminSupportSessionRow;
    assignment: AdminSupportReadResultsPayload["assignment"];
    attempts?: RawSupportAttemptRow[];
    server_now_utc?: string;
  };

  const attempts = enrichSupportAttempts(
    Array.isArray(raw.attempts) ? raw.attempts : []
  );

  // Log terstruktur aman: hanya ID sesi/tugas dan hitungan baris (TANPA nama atau skor siswa)
  logServerEvent({
    request_id: input.requestId || createRequestId(),
    route: "/api/v1/admin/support-access/[id]/results",
    action: "support_access_read_results",
    outcome: "success",
    status: 200,
    metadata: {
      support_access_id: input.supportAccessId,
      assignment_id: raw.assignment?.id ?? null,
      attempt_count: attempts.length,
    },
  });

  return {
    session: raw.session,
    assignment: raw.assignment,
    attempts,
    server_now_utc:
      typeof raw.server_now_utc === "string"
        ? raw.server_now_utc
        : new Date().toISOString(),
  };
}

export async function revokeSupportAccessAsync(
  session: AdminSessionResult,
  input: {
    supportAccessId: string;
    requestId: string;
  }
) {
  const { admin, actorId } = assertSupabaseSupportWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("revoke_support_access", {
      p_actor_id: actorId,
      p_support_access_id: input.supportAccessId,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminSupportPostgresError(error) ?? new Error(error.message);
  }

  logServerEvent({
    request_id: input.requestId || createRequestId(),
    route: "/api/v1/admin/support-access/[id]/revoke",
    action: "support_access_revoked",
    outcome: "success",
    status: 200,
    metadata: { support_access_id: input.supportAccessId },
  });

  revalidatePath("/admin/dukungan");
  return data;
}
