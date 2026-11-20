import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  extractZodFieldErrors,
  upsertQuizDraftSchema,
} from "@/modules/admin/quiz-schemas";
import {
  getAdminQuizRevisionDetailByRevIdAsync,
  upsertQuizRevisionDraftAsync,
} from "@/modules/admin/quiz-service";
import { isRevisionMutable } from "@/modules/content/publish-gate";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const { id } = await context.params;

    if (session.mode === "supabase" && !z.string().uuid().safeParse(id).success) {
      return apiError(400, "INVALID_REQUEST", "ID revisi kuis tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const detail = await getAdminQuizRevisionDetailByRevIdAsync(session, id);
    if (!detail) {
      return apiError(404, "RESOURCE_NOT_FOUND", "Revisi kuis tidak ditemukan.", {
        requestId,
        noStore: true,
      });
    }

    return apiOk(detail, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function PATCH(
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

    const existing = await getAdminQuizRevisionDetailByRevIdAsync(
      session,
      parsedId.data
    );
    if (!existing) {
      return apiError(404, "RESOURCE_NOT_FOUND", "Revisi kuis tidak ditemukan.", {
        requestId,
        noStore: true,
      });
    }

    if (!isRevisionMutable(existing.status)) {
      return apiError(
        409,
        "STATE_CONFLICT",
        "Revisi di luar status 'Draf' bersifat immutable (ADR-05). Buat revisi baru (v+1) untuk menyunting.",
        { requestId, noStore: true }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsedBody = upsertQuizDraftSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const fieldErrors = extractZodFieldErrors(parsedBody.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data perubahan draf kuis tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const result = await upsertQuizRevisionDraftAsync(session, {
      revisionId: parsedId.data,
      title: parsedBody.data.title,
      grade: parsedBody.data.grade,
      usage_mode: parsedBody.data.usage_mode,
      instructions: parsedBody.data.instructions,
      questions: parsedBody.data.questions,
      requestId,
    });

    return apiOk(result, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
