import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import {
  privacyRequestIdSchema,
  privacyRequestUpdateSchema,
} from "@/modules/admin/ops-schemas";
import { updatePrivacyRequestStatusAsync } from "@/modules/admin/ops-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  let actorId: string | null = null;
  let targetId = "unknown";
  try {
    const session = await requireAdminApi(request, {
      requireCsrf: true,
      requireRecentReauth: true,
    });
    actorId = session.userId ?? null;

    const { id } = await context.params;
    const parsedId = privacyRequestIdSchema.safeParse(id);
    if (!parsedId.success) {
      return apiError(
        400,
        "INVALID_REQUEST",
        "ID permintaan privasi tidak valid.",
        { requestId, noStore: true }
      );
    }
    targetId = parsedId.data;

    const rawBody = await request.json().catch(() => null);
    const parsed = privacyRequestUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ??
          "Data pembaruan status permintaan privasi tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const updated = await updatePrivacyRequestStatusAsync(session, {
      privacyRequestId: parsedId.data,
      status: parsed.data.status,
      resolution_note: parsed.data.resolution_note,
      requestId,
    });

    return apiOk(updated, { requestId, noStore: true });
  } catch (err) {
    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "update_privacy_request",
        targetType: "privacy_request",
        targetId,
        requestId,
        outcome: "denied",
        metadata: {
          reason: err instanceof Error ? err.message.slice(0, 120) : "denied",
        },
      });
    }
    return mapLearningError(err);
  }
}
