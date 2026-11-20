import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { requireAdminApi } from "@/modules/admin/auth";
import { publishQuizRevisionSchema } from "@/modules/admin/quiz-schemas";
import { publishQuizRevisionAsync } from "@/modules/admin/quiz-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, {
      requireCsrf: true,
      requireRecentReauth: true,
    });

    const rateKey = `admin-publish:${session.userId ?? getClientIpDigest(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      RATE_LIMIT_POLICIES.admin_publish.limit,
      RATE_LIMIT_POLICIES.admin_publish.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak permintaan publikasi dalam waktu singkat.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID revisi kuis tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = publishQuizRevisionSchema.safeParse(rawBody);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Konfirmasi publikasi eksplisit wajib dikirim.",
        { requestId, noStore: true }
      );
    }

    const published = await publishQuizRevisionAsync(session, {
      revisionId: parsedId.data,
      requestId,
    });

    return apiOk(published, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
