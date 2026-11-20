import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { listAdminMediaAssetsAsync } from "@/modules/admin/media-service";
import { adminMediaQuerySchema } from "@/modules/admin/media-validation";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const url = new URL(request.url);
    const parsed = adminMediaQuerySchema.safeParse({
      status: url.searchParams.get("status") || undefined,
      kind: url.searchParams.get("kind") || undefined,
      q: url.searchParams.get("q") || undefined,
    });

    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Parameter filter media tidak valid.",
        { requestId, noStore: true }
      );
    }

    const result = await listAdminMediaAssetsAsync(session, parsed.data);
    return apiOk(
      {
        items: result.items,
        counts: result.counts,
        mode: result.mode,
        migration_pending: result.migrationPending,
        max_bytes_by_kind: result.maxBytesByKind,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
