import "server-only";
import { revalidatePath } from "next/cache";
import { getServerEnv, isSupabaseConfigured } from "@/lib/server/env";
import { createRequestId } from "@/lib/server/http";
import { logServerEvent, sanitizeLogMetadata } from "@/lib/server/logger";
import {
  createAdminSecretSupabaseClient,
  createPublicSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTING_KEYS,
  mapAdminOpsPostgresError,
  normalizeAuditDateRange,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
  type PublicSiteSettingsValues,
  type SiteSettingKey,
} from "@/modules/admin/ops-schemas";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminSettingMetadataItem {
  key: SiteSettingKey;
  value: string;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface AdminSettingsOverview {
  values: PublicSiteSettingsValues;
  items: AdminSettingMetadataItem[];
  server_now_utc: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminAuditLogRow {
  id: string;
  actor_type: "admin" | "teacher" | "guest" | "system";
  actor_id: string;
  actor_display_name: string | null;
  action: string;
  target_type: string;
  target_id: string;
  request_id: string;
  outcome: "success" | "denied" | "error";
  created_at: string;
  safe_metadata: Record<string, unknown>;
}

export interface AdminAuditLogsOverview {
  logs: AdminAuditLogRow[];
  distinct_actions: string[];
  server_now_utc: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminJobRunRow {
  id: string;
  job_type: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  safe_error_code: string | null;
}

export interface AdminMaintenanceQueues {
  expired_guest_sessions: number;
  expired_export_jobs: number;
  expired_idempotency: number;
  expired_rate_limits: number;
  due_purge_attempts: number;
  active_support_sessions: number;
  quarantine_media: number;
}

export interface AdminPrivacyRequestRow {
  id: string;
  school_id: string | null;
  school_name: string | null;
  request_type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requester_channel: string;
  reference_code: string;
  summary_note: string;
  resolution_note: string;
  created_by_name: string | null;
  handled_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AdminSchoolOptionItem {
  id: string;
  name: string;
  district_label: string;
  status: string;
}

export interface AdminMaintenanceOverview {
  job_runs: AdminJobRunRow[];
  queues: AdminMaintenanceQueues;
  privacy_requests: AdminPrivacyRequestRow[];
  schools: AdminSchoolOptionItem[];
  dashboard_backup_url: string;
  server_now_utc: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

const DEMO_AUDIT_LOGS: AdminAuditLogRow[] = [
  {
    id: "aud-demo-1",
    actor_type: "admin",
    actor_id: "demo-admin-01",
    actor_display_name: "Admin Kurator Demo",
    action: "publish_content_revision",
    target_type: "content_revision",
    target_id: "rev-menhir-v1",
    request_id: "req-demo-001",
    outcome: "success",
    created_at: "2026-11-18T03:15:00Z",
    safe_metadata: { slug: "pengantar-menhir-banyuwangi", version_no: 1 },
  },
  {
    id: "aud-demo-2",
    actor_type: "admin",
    actor_id: "demo-admin-01",
    actor_display_name: "Admin Kurator Demo",
    action: "support_access_granted",
    target_type: "support_access",
    target_id: "sup-demo-hist-1",
    request_id: "req-demo-002",
    outcome: "success",
    created_at: "2026-11-18T02:40:00Z",
    safe_metadata: { duration_minutes: 15 },
  },
  {
    id: "aud-demo-3",
    actor_type: "teacher",
    actor_id: "teacher-demo-01",
    actor_display_name: "Ibu Sari",
    action: "export_assignment_csv",
    target_type: "assignment",
    target_id: "asg-demo-1",
    request_id: "req-demo-003",
    outcome: "success",
    created_at: "2026-11-17T08:10:00Z",
    safe_metadata: { row_count: 18 },
  },
  {
    id: "aud-demo-4",
    actor_type: "system",
    actor_id: "cron-retention",
    actor_display_name: null,
    action: "run_retention_purge",
    target_type: "maintenance",
    target_id: "retention_purge",
    request_id: "req-demo-004",
    outcome: "success",
    created_at: "2026-11-17T00:05:00Z",
    safe_metadata: { purged_sessions: 4, purged_attempts: 0 },
  },
];

const DEMO_JOB_RUNS: AdminJobRunRow[] = [
  {
    id: "job-demo-1",
    job_type: "retention_purge",
    status: "succeeded",
    started_at: "2026-11-19T00:05:00Z",
    finished_at: "2026-11-19T00:05:02Z",
    safe_error_code: null,
  },
  {
    id: "job-demo-2",
    job_type: "media_cleanup",
    status: "succeeded",
    started_at: "2026-11-18T18:00:00Z",
    finished_at: "2026-11-18T18:00:04Z",
    safe_error_code: null,
  },
];

const DEMO_QUEUES: AdminMaintenanceQueues = {
  expired_guest_sessions: 3,
  expired_export_jobs: 1,
  expired_idempotency: 4,
  expired_rate_limits: 2,
  due_purge_attempts: 0,
  active_support_sessions: 0,
  quarantine_media: 1,
};

const DEMO_PRIVACY_REQUESTS: AdminPrivacyRequestRow[] = [
  {
    id: "priv-demo-1",
    school_id: "sch-demo-1",
    school_name: "SDN 1 Kemiren",
    request_type: "deletion",
    status: "verified",
    requester_channel: "Surat resmi Wali Kelas III A",
    reference_code: "SRT-PRIV-2026-004",
    summary_note:
      "Permintaan penghapusan lebih awal satu entri tugas uji coba kelas III A (tanpa mencantumkan nama siswa pada log).",
    resolution_note: "Surat tugas sekolah sudah diverifikasi.",
    created_by_name: "Admin Kurator Demo",
    handled_by_name: "Admin Kurator Demo",
    created_at: "2026-11-18T04:00:00Z",
    updated_at: "2026-11-18T05:30:00Z",
    completed_at: null,
  },
];

const DEMO_SCHOOLS: AdminSchoolOptionItem[] = [
  {
    id: "sch-demo-1",
    name: "SDN 1 Kemiren",
    district_label: "Kec. Glagah",
    status: "active",
  },
  {
    id: "sch-demo-2",
    name: "SDN 4 Rogojampi",
    district_label: "Kec. Rogojampi",
    status: "active",
  },
];

function extractSettingText(valueJson: unknown): string {
  if (typeof valueJson === "string") {
    return valueJson;
  }
  if (
    valueJson &&
    typeof valueJson === "object" &&
    "value" in valueJson &&
    typeof (valueJson as { value?: unknown }).value === "string"
  ) {
    return (valueJson as { value: string }).value;
  }
  return "";
}

function mergeWithDefaultSettings(
  rows: ReadonlyArray<{ key?: string; value?: unknown; value_json?: unknown }>
): PublicSiteSettingsValues {
  const merged: PublicSiteSettingsValues = { ...DEFAULT_SITE_SETTINGS };
  for (const row of rows) {
    if (
      row.key &&
      (SITE_SETTING_KEYS as ReadonlyArray<string>).includes(row.key)
    ) {
      const key = row.key as SiteSettingKey;
      const text =
        typeof row.value === "string"
          ? row.value
          : extractSettingText(row.value_json);
      if (text.trim().length > 0) {
        merged[key] = text.trim();
      }
    }
  }
  return merged;
}

function buildDefaultSettingItems(
  values: PublicSiteSettingsValues,
  rows?: ReadonlyArray<{
    key?: string;
    updated_at?: string | null;
    updated_by_name?: string | null;
  }>
): AdminSettingMetadataItem[] {
  const metaMap = new Map<
    string,
    { updated_at: string | null; updated_by_name: string | null }
  >();
  for (const row of rows ?? []) {
    if (row.key) {
      metaMap.set(row.key, {
        updated_at: row.updated_at ?? null,
        updated_by_name: row.updated_by_name ?? null,
      });
    }
  }

  return SITE_SETTING_KEYS.map((key) => {
    const meta = metaMap.get(key);
    return {
      key,
      value: values[key],
      updated_at: meta?.updated_at ?? null,
      updated_by_name: meta?.updated_by_name ?? null,
    };
  });
}

export function resolveSupabaseBackupDashboardUrl(): string {
  const url = getServerEnv().SUPABASE_URL;
  if (!url) {
    return "https://supabase.com/dashboard";
  }
  try {
    const parsed = new URL(url);
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    if (match?.[1]) {
      return `https://supabase.com/dashboard/project/${match[1]}/database/backups/scheduled`;
    }
  } catch {
    // Abaikan URL tidak valid
  }
  return "https://supabase.com/dashboard";
}

function assertSupabaseOpsReady(session: AdminSessionResult) {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mode demo lokal hanya menyediakan pratinjau baca-saja untuk modul operasional ini."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Sesi admin terverifikasi MFA serta konfigurasi admin server diperlukan."
    );
  }
  return { admin, actorId: session.userId };
}

/**
 * Membaca pengaturan publik allowlist (6 kunci) untuk /, /tentang, dan GET /api/v1/settings/public.
 * Selalu fallback ke DEFAULT_SITE_SETTINGS bila Supabase belum diisi atau skema belum siap.
 */
export async function getPublicSiteSettingsAsync(): Promise<PublicSiteSettingsValues> {
  if (!isSupabaseConfigured()) {
    return { ...DEFAULT_SITE_SETTINGS };
  }
  try {
    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return { ...DEFAULT_SITE_SETTINGS };
    }
    const { data, error } = await supabase
      .schema("app")
      .from("site_settings")
      .select("key, value_json")
      .in("key", [...SITE_SETTING_KEYS]);

    if (error || !Array.isArray(data)) {
      return { ...DEFAULT_SITE_SETTINGS };
    }
    return mergeWithDefaultSettings(data);
  } catch {
    return { ...DEFAULT_SITE_SETTINGS };
  }
}

export async function getAdminSiteSettingsAsync(
  session: AdminSessionResult
): Promise<AdminSettingsOverview> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const values = { ...DEFAULT_SITE_SETTINGS };
    return {
      values,
      items: buildDefaultSettingItems(values),
      server_now_utc: new Date().toISOString(),
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    const values = { ...DEFAULT_SITE_SETTINGS };
    return {
      values,
      items: buildDefaultSettingItems(values),
      server_now_utc: new Date().toISOString(),
      mode: "supabase",
      migrationPending: false,
    };
  }

  const { data, error } = await admin
    .schema("api")
    .rpc("list_admin_site_settings", { p_actor_id: session.userId });

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      const values = { ...DEFAULT_SITE_SETTINGS };
      return {
        values,
        items: buildDefaultSettingItems(values),
        server_now_utc: new Date().toISOString(),
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  const payload = (data ?? {}) as {
    settings?: Array<{
      key: string;
      value: string;
      updated_at: string | null;
      updated_by_name: string | null;
    }>;
    server_now_utc?: string;
  };
  const rows = Array.isArray(payload.settings) ? payload.settings : [];
  const values = mergeWithDefaultSettings(rows);

  return {
    values,
    items: buildDefaultSettingItems(values, rows),
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function updateAdminSiteSettingsAsync(
  session: AdminSessionResult,
  input: Partial<PublicSiteSettingsValues>,
  requestId: string
): Promise<AdminSettingsOverview> {
  const { admin, actorId } = assertSupabaseOpsReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("upsert_admin_site_settings", {
      p_actor_id: actorId,
      p_settings: input,
      p_request_id: requestId,
    });

  if (error) {
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  logServerEvent({
    request_id: requestId || createRequestId(),
    route: "/api/v1/admin/settings",
    action: "update_site_settings",
    outcome: "success",
    status: 200,
    metadata: { updated_keys: Object.keys(input) },
  });

  revalidatePath("/");
  revalidatePath("/tentang");
  revalidatePath("/admin/pengaturan");
  revalidatePath("/api/v1/settings/public");

  const payload = (data ?? {}) as {
    settings?: Array<{
      key: string;
      value: string;
      updated_at: string | null;
      updated_by_name: string | null;
    }>;
    server_now_utc?: string;
  };
  const rows = Array.isArray(payload.settings) ? payload.settings : [];
  const values = mergeWithDefaultSettings(rows);

  return {
    values,
    items: buildDefaultSettingItems(values, rows),
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function listAdminAuditLogsAsync(
  session: AdminSessionResult,
  filters: {
    action?: string;
    outcome?: string;
    actor_type?: string;
    from?: string;
    to?: string;
    limit?: number;
  }
): Promise<AdminAuditLogsOverview> {
  const { fromIso, toIso } = normalizeAuditDateRange(
    filters.from ?? "",
    filters.to ?? ""
  );
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const filtered = DEMO_AUDIT_LOGS.filter((row) => {
      if (filters.action && row.action !== filters.action) return false;
      if (filters.outcome && row.outcome !== filters.outcome) return false;
      if (filters.actor_type && row.actor_type !== filters.actor_type)
        return false;
      const ms = Date.parse(row.created_at);
      if (fromIso && ms < Date.parse(fromIso)) return false;
      if (toIso && ms > Date.parse(toIso)) return false;
      return true;
    }).slice(0, limit);

    return {
      logs: filtered,
      distinct_actions: Array.from(
        new Set(DEMO_AUDIT_LOGS.map((r) => r.action))
      ).sort(),
      server_now_utc: new Date().toISOString(),
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    return {
      logs: [],
      distinct_actions: [],
      server_now_utc: new Date().toISOString(),
      mode: "supabase",
      migrationPending: false,
    };
  }

  const { data, error } = await admin.schema("api").rpc("list_admin_audit_logs", {
    p_actor_id: session.userId,
    p_action: filters.action?.trim() || null,
    p_outcome: filters.outcome?.trim() || null,
    p_actor_type: filters.actor_type?.trim() || null,
    p_from: fromIso,
    p_to: toIso,
    p_limit: limit,
  });

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return {
        logs: [],
        distinct_actions: [],
        server_now_utc: new Date().toISOString(),
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  const payload = (data ?? {}) as {
    logs?: AdminAuditLogRow[];
    distinct_actions?: string[];
    server_now_utc?: string;
  };

  const sanitizedLogs = (Array.isArray(payload.logs) ? payload.logs : []).map(
    (row) => ({
      ...row,
      safe_metadata:
        row.safe_metadata && typeof row.safe_metadata === "object"
          ? sanitizeLogMetadata(row.safe_metadata)
          : {},
    })
  );

  return {
    logs: sanitizedLogs,
    distinct_actions: Array.isArray(payload.distinct_actions)
      ? payload.distinct_actions
      : [],
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function getAdminMaintenanceOverviewAsync(
  session: AdminSessionResult
): Promise<AdminMaintenanceOverview> {
  const backupUrl = resolveSupabaseBackupDashboardUrl();

  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return {
      job_runs: DEMO_JOB_RUNS,
      queues: DEMO_QUEUES,
      privacy_requests: DEMO_PRIVACY_REQUESTS,
      schools: DEMO_SCHOOLS,
      dashboard_backup_url: backupUrl,
      server_now_utc: new Date().toISOString(),
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    return {
      job_runs: [],
      queues: {
        expired_guest_sessions: 0,
        expired_export_jobs: 0,
        expired_idempotency: 0,
        expired_rate_limits: 0,
        due_purge_attempts: 0,
        active_support_sessions: 0,
        quarantine_media: 0,
      },
      privacy_requests: [],
      schools: [],
      dashboard_backup_url: backupUrl,
      server_now_utc: new Date().toISOString(),
      mode: "supabase",
      migrationPending: false,
    };
  }

  const [maintRes, privRes] = await Promise.all([
    admin.schema("api").rpc("get_admin_maintenance_status", {
      p_actor_id: session.userId,
    }),
    admin.schema("api").rpc("list_admin_privacy_requests", {
      p_actor_id: session.userId,
      p_status: null,
    }),
  ]);

  if (maintRes.error || privRes.error) {
    const err = maintRes.error ?? privRes.error!;
    if (isSupabaseSchemaNotReadyError(err)) {
      return {
        job_runs: [],
        queues: {
          expired_guest_sessions: 0,
          expired_export_jobs: 0,
          expired_idempotency: 0,
          expired_rate_limits: 0,
          due_purge_attempts: 0,
          active_support_sessions: 0,
          quarantine_media: 0,
        },
        privacy_requests: [],
        schools: [],
        dashboard_backup_url: backupUrl,
        server_now_utc: new Date().toISOString(),
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw mapAdminOpsPostgresError(err) ?? new Error(err.message);
  }

  const maintPayload = (maintRes.data ?? {}) as {
    job_runs?: AdminJobRunRow[];
    queues?: AdminMaintenanceQueues;
    server_now_utc?: string;
  };
  const privPayload = (privRes.data ?? {}) as {
    requests?: AdminPrivacyRequestRow[];
    schools?: AdminSchoolOptionItem[];
  };

  return {
    job_runs: Array.isArray(maintPayload.job_runs) ? maintPayload.job_runs : [],
    queues: maintPayload.queues ?? {
      expired_guest_sessions: 0,
      expired_export_jobs: 0,
      expired_idempotency: 0,
      expired_rate_limits: 0,
      due_purge_attempts: 0,
      active_support_sessions: 0,
      quarantine_media: 0,
    },
    privacy_requests: Array.isArray(privPayload.requests)
      ? privPayload.requests
      : [],
    schools: Array.isArray(privPayload.schools) ? privPayload.schools : [],
    dashboard_backup_url: backupUrl,
    server_now_utc:
      typeof maintPayload.server_now_utc === "string"
        ? maintPayload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function runAdminRetentionPurgeAsync(
  session: AdminSessionResult,
  requestId: string
): Promise<{
  summary: Record<string, number>;
  server_now_utc: string;
}> {
  const { admin, actorId } = assertSupabaseOpsReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("run_admin_retention_purge", {
      p_actor_id: actorId,
      p_request_id: requestId,
    });

  if (error) {
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  const payload = (data ?? {}) as {
    summary?: Record<string, number>;
    server_now_utc?: string;
  };

  logServerEvent({
    request_id: requestId || createRequestId(),
    route: "/api/v1/admin/maintenance/retention-purge",
    action: "run_retention_purge",
    outcome: "success",
    status: 200,
    metadata: payload.summary ?? {},
  });

  revalidatePath("/admin");
  revalidatePath("/admin/pemeliharaan");
  revalidatePath("/admin/audit");

  return {
    summary: payload.summary ?? {},
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
  };
}

export async function listAdminPrivacyRequestsAsync(
  session: AdminSessionResult,
  statusFilter?: string
) {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const filtered = statusFilter
      ? DEMO_PRIVACY_REQUESTS.filter((r) => r.status === statusFilter)
      : DEMO_PRIVACY_REQUESTS;
    return {
      requests: filtered,
      schools: DEMO_SCHOOLS,
      server_now_utc: new Date().toISOString(),
      mode: "local_demo" as const,
      migrationPending: false,
    };
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    return {
      requests: [] as AdminPrivacyRequestRow[],
      schools: [] as AdminSchoolOptionItem[],
      server_now_utc: new Date().toISOString(),
      mode: "supabase" as const,
      migrationPending: false,
    };
  }

  const { data, error } = await admin
    .schema("api")
    .rpc("list_admin_privacy_requests", {
      p_actor_id: session.userId,
      p_status: statusFilter?.trim() || null,
    });

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return {
        requests: [] as AdminPrivacyRequestRow[],
        schools: [] as AdminSchoolOptionItem[],
        server_now_utc: new Date().toISOString(),
        mode: "supabase" as const,
        migrationPending: true,
      };
    }
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  const payload = (data ?? {}) as {
    requests?: AdminPrivacyRequestRow[];
    schools?: AdminSchoolOptionItem[];
    server_now_utc?: string;
  };

  return {
    requests: Array.isArray(payload.requests) ? payload.requests : [],
    schools: Array.isArray(payload.schools) ? payload.schools : [],
    server_now_utc:
      typeof payload.server_now_utc === "string"
        ? payload.server_now_utc
        : new Date().toISOString(),
    mode: "supabase" as const,
    migrationPending: false,
  };
}

export async function createPrivacyRequestAsync(
  session: AdminSessionResult,
  input: {
    school_id: string | null;
    request_type: PrivacyRequestType;
    requester_channel: string;
    reference_code: string;
    summary_note: string;
    requestId: string;
  }
): Promise<AdminPrivacyRequestRow> {
  const { admin, actorId } = assertSupabaseOpsReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("create_privacy_request", {
      p_actor_id: actorId,
      p_school_id: input.school_id,
      p_request_type: input.request_type,
      p_requester_channel: input.requester_channel,
      p_reference_code: input.reference_code,
      p_summary_note: input.summary_note,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  logServerEvent({
    request_id: input.requestId || createRequestId(),
    route: "/api/v1/admin/privacy-requests",
    action: "create_privacy_request",
    outcome: "success",
    status: 201,
    metadata: {
      request_type: input.request_type,
      school_id: input.school_id,
      reference_code: input.reference_code,
    },
  });

  revalidatePath("/admin/pemeliharaan");
  revalidatePath("/admin/audit");
  return data as AdminPrivacyRequestRow;
}

export async function updatePrivacyRequestStatusAsync(
  session: AdminSessionResult,
  input: {
    privacyRequestId: string;
    status: Exclude<PrivacyRequestStatus, "received">;
    resolution_note: string;
    requestId: string;
  }
): Promise<AdminPrivacyRequestRow> {
  const { admin, actorId } = assertSupabaseOpsReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("update_privacy_request_status", {
      p_actor_id: actorId,
      p_privacy_request_id: input.privacyRequestId,
      p_status: input.status,
      p_resolution_note: input.resolution_note,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminOpsPostgresError(error) ?? new Error(error.message);
  }

  logServerEvent({
    request_id: input.requestId || createRequestId(),
    route: "/api/v1/admin/privacy-requests/[id]",
    action: "update_privacy_request",
    outcome: "success",
    status: 200,
    metadata: {
      privacy_request_id: input.privacyRequestId,
      status: input.status,
    },
  });

  revalidatePath("/admin/pemeliharaan");
  revalidatePath("/admin/audit");
  return data as AdminPrivacyRequestRow;
}
