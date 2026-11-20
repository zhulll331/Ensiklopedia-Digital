import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { createSupportAccessSchema } from "@/modules/admin/support-schemas";
import {
  createSupportAccessAsync,
  getAdminSupportOverviewAsync,
} from "@/modules/admin/support-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const overview = await getAdminSupportOverviewAsync(session);
    return apiOk(
      {
        assignments: overview.assignments,
        sessions: overview.sessions,
        server_now_utc: overview.server_now_utc,
        mode: overview.mode,
        migration_pending: overview.migrationPending,
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
    const session = await requireAdminApi(request, {
      requireCsrf: true,
      requireRecentReauth: true,
    });
    actorId = session.userId ?? null;

    const rateKey = `admin-support:${actorId ?? getClientIpDigest(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      RATE_LIMIT_POLICIES.admin_support.limit,
      RATE_LIMIT_POLICIES.admin_support.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak permintaan Mode Dukungan dalam waktu singkat. Coba lagi nanti.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = createSupportAccessSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ??
          "Data pembukaan Mode Dukungan tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const grant = await createSupportAccessAsync(session, {
      ...parsed.data,
      requestId,
    });

    return apiOk(grant, { status: 201, requestId, noStore: true });
  } catch (err) {
    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "support_access_granted",
        targetType: "support_access",
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
