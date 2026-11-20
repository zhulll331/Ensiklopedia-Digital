import type { NextRequest } from "next/server";
import { apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { listAdminSiteLocationsAsync } from "@/modules/admin/site-location-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const result = await listAdminSiteLocationsAsync(session);
    return apiOk(
      {
        items: result.items,
        mode: result.mode,
        migration_pending: result.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
