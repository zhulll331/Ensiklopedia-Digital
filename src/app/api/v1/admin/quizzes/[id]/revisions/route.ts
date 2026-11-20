import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { createQuizRevisionSchema } from "@/modules/admin/quiz-schemas";
import { createNewQuizRevisionAsync } from "@/modules/admin/quiz-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedQuizId = z.string().uuid().safeParse(id);
    if (!parsedQuizId.success) {
      return apiError(400, "INVALID_REQUEST", "ID kuis tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsedBody = createQuizRevisionSchema.safeParse(rawBody ?? {});
    if (!parsedBody.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Parameter sumber revisi kuis tidak valid.",
        { requestId, noStore: true }
      );
    }

    const created = await createNewQuizRevisionAsync(session, {
      quizId: parsedQuizId.data,
      sourceRevisionId: parsedBody.data.source_revision_id,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
