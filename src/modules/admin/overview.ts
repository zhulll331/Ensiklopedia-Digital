import "server-only";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import type { PublishGateResult } from "@/modules/content/publish-gate";
import type { SampleAdminRevisionRow } from "@/modules/content/sample-data";
import { listAdminRevisionsAsync } from "@/modules/content/service";
import type { ContentStatus } from "@/modules/content/types";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export type AdminRevisionSummaryRow = SampleAdminRevisionRow & {
  publish_gate: PublishGateResult;
};

export interface AdminQuarantineMediaRow {
  id: string;
  kind: string;
  storage_path: string;
  mime: string;
  bytes: number;
  scan_status: "quarantine" | "cleared" | "rejected";
  metadata_scrubbed_at: string | null;
  created_at: string;
}

export interface AdminJobRunRow {
  id: string;
  job_type: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  safe_error_code: string | null;
}

export interface AdminOverviewData {
  statusCounts: Record<ContentStatus, number>;
  reviewQueue: AdminRevisionSummaryRow[];
  readyToPublish: AdminRevisionSummaryRow[];
  quarantineMedia: AdminQuarantineMediaRow[];
  quarantineMediaCount: number;
  recentJobRuns: AdminJobRunRow[];
  jobRunsMigrationPending: boolean;
  totalRevisions: number;
}

const SAMPLE_QUARANTINE_MEDIA: AdminQuarantineMediaRow[] = [
  {
    id: "sample-q-1",
    kind: "image",
    storage_path: "quarantine/sample/foto-survei-menhir-baru.jpg",
    mime: "image/jpeg",
    bytes: 1_840_320,
    scan_status: "quarantine",
    metadata_scrubbed_at: null,
    created_at: "2026-04-02T03:00:00Z",
  },
];

const SAMPLE_JOB_RUNS: AdminJobRunRow[] = [
  {
    id: "sample-job-1",
    job_type: "retention_purge",
    status: "succeeded",
    started_at: "2026-04-02T01:00:00Z",
    finished_at: "2026-04-02T01:00:03Z",
    safe_error_code: null,
  },
];

export function summarizeAdminOverview(
  revisions: readonly AdminRevisionSummaryRow[],
  quarantineMedia: readonly AdminQuarantineMediaRow[],
  recentJobRuns: readonly AdminJobRunRow[],
  jobRunsMigrationPending: boolean,
  totalQuarantineCount?: number
): AdminOverviewData {
  const statusCounts: Record<ContentStatus, number> = {
    draft: 0,
    in_review: 0,
    approved: 0,
    published: 0,
    archived: 0,
  };

  for (const rev of revisions) {
    statusCounts[rev.status] += 1;
  }

  const reviewQueue = revisions.filter((rev) => rev.status === "in_review");
  const readyToPublish = revisions.filter(
    (rev) =>
      rev.status !== "published" &&
      rev.status !== "archived" &&
      rev.publish_gate.ready
  );

  return {
    statusCounts,
    reviewQueue,
    readyToPublish,
    quarantineMedia: [...quarantineMedia],
    quarantineMediaCount: totalQuarantineCount ?? quarantineMedia.length,
    recentJobRuns: [...recentJobRuns],
    jobRunsMigrationPending,
    totalRevisions: revisions.length,
  };
}

export async function getAdminOverviewDataAsync(
  session: AdminSessionResult
): Promise<AdminOverviewData> {
  const revisions = await listAdminRevisionsAsync();

  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return summarizeAdminOverview(
      revisions,
      SAMPLE_QUARANTINE_MEDIA,
      SAMPLE_JOB_RUNS,
      false
    );
  }

  let quarantineMedia: AdminQuarantineMediaRow[] = [];
  let totalQuarantineCount = 0;

  const adultClient = await createAdultSessionSupabaseClient();
  if (adultClient) {
    const { data, count, error } = await adultClient
      .schema("app")
      .from("media_assets")
      .select(
        "id, kind, storage_path, mime, bytes, scan_status, metadata_scrubbed_at, created_at",
        { count: "exact" }
      )
      .eq("scan_status", "quarantine")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      quarantineMedia = data.map((row) => ({
        id: String(row.id),
        kind: String(row.kind),
        storage_path: String(row.storage_path),
        mime: String(row.mime),
        bytes: Number(row.bytes ?? 0),
        scan_status: row.scan_status as "quarantine" | "cleared" | "rejected",
        metadata_scrubbed_at: row.metadata_scrubbed_at
          ? String(row.metadata_scrubbed_at)
          : null,
        created_at: String(row.created_at),
      }));
      totalQuarantineCount = typeof count === "number" ? count : quarantineMedia.length;
    } else if (error && !isSupabaseSchemaNotReadyError(error)) {
      quarantineMedia = [];
      totalQuarantineCount = 0;
    }
  }

  let recentJobRuns: AdminJobRunRow[] = [];
  let jobRunsMigrationPending = false;

  if (isSupabaseAdminConfigured() && session.userId) {
    const adminSecretClient = createAdminSecretSupabaseClient();
    if (adminSecretClient) {
      const { data: jobData, error: jobErr } = await adminSecretClient
        .schema("api")
        .rpc("get_admin_recent_job_runs", {
          p_actor_id: session.userId,
          p_limit: 5,
        });

      if (jobErr) {
        if (isSupabaseSchemaNotReadyError(jobErr)) {
          jobRunsMigrationPending = true;
        }
      } else if (Array.isArray(jobData)) {
        recentJobRuns = jobData.map((row) => ({
          id: String((row as Record<string, unknown>).id ?? ""),
          job_type: String((row as Record<string, unknown>).job_type ?? ""),
          status: ((row as Record<string, unknown>).status ?? "succeeded") as
            | "running"
            | "succeeded"
            | "failed",
          started_at: String((row as Record<string, unknown>).started_at ?? ""),
          finished_at: (row as Record<string, unknown>).finished_at
            ? String((row as Record<string, unknown>).finished_at)
            : null,
          safe_error_code: (row as Record<string, unknown>).safe_error_code
            ? String((row as Record<string, unknown>).safe_error_code)
            : null,
        }));
      }
    }
  }

  return summarizeAdminOverview(
    revisions,
    quarantineMedia,
    recentJobRuns,
    jobRunsMigrationPending,
    totalQuarantineCount
  );
}
