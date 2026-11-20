import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { transitionQuizRevisionSchema } from "@/modules/admin/quiz-schemas";
import {
  getAdminQuizRevisionDetailByRevIdAsync,
  revalidatePublicQuizPaths,
  transitionQuizRevisionAsync,
} from "@/modules/admin/quiz-service";
import {
  requiresReauthForTransition,
  validateTransitionRequest,
} from "@/modules/admin/state-machine";
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
    const parsed = transitionQuizRevisionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Parameter transisi status revisi kuis tidak valid.",
        { requestId, noStore: true }
      );
    }

    const check = validateTransitionRequest({
      from: parsed.data.expected_status,
      to: parsed.data.next_status,
      reason: parsed.data.reason,
    });
    if (!check.ok) {
      return apiError(
        check.code === "STATE_CONFLICT" ? 409 : 422,
        check.code,
        check.message,
        { requestId, noStore: true }
      );
    }

    if (
      requiresReauthForTransition(
        parsed.data.expected_status,
        parsed.data.next_status
      )
    ) {
      await requireAdminApi(request, {
        requireCsrf: false,
        requireRecentReauth: true,
      });
    }

    const existing = await getAdminQuizRevisionDetailByRevIdAsync(
      session,
      parsedId.data
    );
    const result = await transitionQuizRevisionAsync(session, {
      revisionId: parsedId.data,
      expectedStatus: parsed.data.expected_status,
      nextStatus: parsed.data.next_status,
      reason: parsed.data.reason,
      requestId,
    });

    if (result.unpublished_live) {
      revalidatePublicQuizPaths(existing?.slug);
    }

    return apiOk(result, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
