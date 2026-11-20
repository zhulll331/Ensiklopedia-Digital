import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { auditLogsQuerySchema } from "@/modules/admin/ops-schemas";
import { listAdminAuditLogsAsync } from "@/modules/admin/ops-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const sp = request.nextUrl.searchParams;

    const parsed = auditLogsQuerySchema.safeParse({
      action: sp.get("action") ?? "",
      outcome: sp.get("outcome") ?? "",
      actor_type: sp.get("actor_type") ?? "",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      limit: sp.get("limit") ?? "50",
    });

    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Parameter filter log audit tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const overview = await listAdminAuditLogsAsync(session, parsed.data);
    return apiOk(
      {
        logs: overview.logs,
        distinct_actions: overview.distinct_actions,
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
