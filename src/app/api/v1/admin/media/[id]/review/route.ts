import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { reviewMediaAssetAsync } from "@/modules/admin/media-service";
import { reviewMediaSchema } from "@/modules/admin/media-validation";
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

    const rawBody = await request.json().catch(() => null);
    const parsed = reviewMediaSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ??
          "Data keputusan pemeriksaan media tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const updated = await reviewMediaAssetAsync(session, {
      assetId: parsedId.data,
      ...parsed.data,
      requestId,
    });

    return apiOk(updated, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
