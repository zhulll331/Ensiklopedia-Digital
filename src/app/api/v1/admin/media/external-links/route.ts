import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { requireAdminApi } from "@/modules/admin/auth";
import { createExternalMediaLinkSchema } from "@/modules/admin/external-media";
import { registerExternalMediaLinkAsync } from "@/modules/admin/media-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });

    const rateKey = `admin-upload-intent:${session.userId ?? getClientIpDigest(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      RATE_LIMIT_POLICIES.admin_upload_intent.limit,
      RATE_LIMIT_POLICIES.admin_upload_intent.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak permintaan pendaftaran media dalam waktu singkat.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = createExternalMediaLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data tautan media eksternal tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const result = await registerExternalMediaLinkAsync(session, {
      ...parsed.data,
      requestId,
    });

    return apiOk(result, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
