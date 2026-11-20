import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import { supportAccessIdSchema } from "@/modules/admin/support-schemas";
import { readSupportAccessResultsAsync } from "@/modules/admin/support-service";
import { DomainError } from "@/modules/learning/errors";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  let actorId: string | null = null;
  let supportId = "invalid";
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    actorId = session.userId ?? null;

    const { id } = await context.params;
    supportId = id;
    const parsedId = supportAccessIdSchema.safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID sesi dukungan tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const results = await readSupportAccessResultsAsync(session, {
      supportAccessId: parsedId.data,
      requestId,
    });

    return apiOk(results, {
      requestId,
      noStore: true,
      headers: { "Referrer-Policy": "no-referrer" },
    });
  } catch (err) {
    if (
      err instanceof DomainError &&
      (err.status === 401 || err.status === 403 || err.status === 409)
    ) {
      await recordAdminAuditSafe({
        actorId,
        action: "support_access_read_results",
        targetType: "support_access",
        targetId: supportId,
        requestId,
        outcome: "denied",
        metadata: { code: err.code },
      });
    }
    return mapLearningError(err);
  }
}
