import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { supportAccessIdSchema } from "@/modules/admin/support-schemas";
import { revokeSupportAccessAsync } from "@/modules/admin/support-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = supportAccessIdSchema.safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID sesi dukungan tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const revoked = await revokeSupportAccessAsync(session, {
      supportAccessId: parsedId.data,
      requestId,
    });

    return apiOk(revoked, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
