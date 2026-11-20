import type { NextRequest } from "next/server";
import { apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { getAdminMaintenanceOverviewAsync } from "@/modules/admin/ops-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const overview = await getAdminMaintenanceOverviewAsync(session);
    return apiOk(
      {
        job_runs: overview.job_runs,
        queues: overview.queues,
        privacy_requests: overview.privacy_requests,
        schools: overview.schools,
        dashboard_backup_url: overview.dashboard_backup_url,
        server_now_utc: overview.server_now_utc,
        mode: overview.mode,
        migration_pending: overview.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
