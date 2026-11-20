import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import { runAdminRetentionPurgeAsync } from "@/modules/admin/ops-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  let actorId: string | null = null;
  try {
    const session = await requireAdminApi(request, {
      requireCsrf: true,
      requireRecentReauth: true,
    });
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
        "Terlalu banyak permintaan pembersihan retensi dalam waktu singkat. Coba lagi nanti.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const result = await runAdminRetentionPurgeAsync(session, requestId);
    return apiOk(result, { requestId, noStore: true });
  } catch (err) {
    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "run_retention_purge",
        targetType: "maintenance",
        targetId: "retention_purge",
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
