import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  createQuizReviewSchema,
  extractZodFieldErrors,
} from "@/modules/admin/quiz-schemas";
import { addQuizRevisionReviewAsync } from "@/modules/admin/quiz-service";
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
      return apiError(400, "INVALID_REQUEST", "ID revisi kuis tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = createQuizReviewSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data catatan validasi kuis tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const created = await addQuizRevisionReviewAsync(session, {
      revisionId: parsedId.data,
      review_type: parsed.data.review_type,
      reviewer_label: parsed.data.reviewer_label,
      decision: parsed.data.decision,
      evidence_asset_id: parsed.data.evidence_asset_id,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
