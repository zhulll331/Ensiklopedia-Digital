import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import {
  PRIVACY_REQUEST_STATUSES,
  privacyRequestCreateSchema,
} from "@/modules/admin/ops-schemas";
import {
  createPrivacyRequestAsync,
  listAdminPrivacyRequestsAsync,
} from "@/modules/admin/ops-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const rawStatus = request.nextUrl.searchParams.get("status")?.trim() ?? "";
    if (
      rawStatus &&
      !(PRIVACY_REQUEST_STATUSES as ReadonlyArray<string>).includes(rawStatus)
    ) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Filter status permintaan privasi tidak valid.",
        { requestId, noStore: true }
      );
    }

    const data = await listAdminPrivacyRequestsAsync(session, rawStatus);
    return apiOk(
      {
        requests: data.requests,
        schools: data.schools,
        server_now_utc: data.server_now_utc,
        mode: data.mode,
        migration_pending: data.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  let actorId: string | null = null;
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    actorId = session.userId ?? null;

    const rateKey = `admin-ops:${actorId ?? getClientIpDigest(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      RATE_LIMIT_POLICIES.admin_ops.limit,
      RATE_LIMIT_POLICIES.admin_ops.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak pencatatan permintaan privasi dalam waktu singkat.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = privacyRequestCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ??
          "Data pencatatan permintaan privasi tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const created = await createPrivacyRequestAsync(session, {
      ...parsed.data,
      requestId,
    });
    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "create_privacy_request",
        targetType: "privacy_request",
        targetId: "new",
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
