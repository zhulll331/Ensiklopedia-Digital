import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { finalizeMediaAssetAsync } from "@/modules/admin/media-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID aset media tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const result = await finalizeMediaAssetAsync(session, {
      assetId: parsedId.data,
      requestId,
    });

    return apiOk(result, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
