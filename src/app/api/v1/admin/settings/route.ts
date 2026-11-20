import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { recordAdminAuditSafe, requireAdminApi } from "@/modules/admin/auth";
import { updateSiteSettingsSchema } from "@/modules/admin/ops-schemas";
import {
  getAdminSiteSettingsAsync,
  updateAdminSiteSettingsAsync,
} from "@/modules/admin/ops-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const overview = await getAdminSiteSettingsAsync(session);
    return apiOk(
      {
        values: overview.values,
        items: overview.items,
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

export async function PUT(request: NextRequest) {
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
        "Terlalu banyak pembaruan pengaturan dalam waktu singkat. Coba lagi nanti.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = updateSiteSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ??
          "Data pengaturan situs tidak valid atau mengandung kunci asing.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const updated = await updateAdminSiteSettingsAsync(
      session,
      parsed.data,
      requestId
    );
    return apiOk(
      {
        values: updated.values,
        items: updated.items,
        server_now_utc: updated.server_now_utc,
        mode: updated.mode,
        migration_pending: updated.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "update_site_settings",
        targetType: "site_settings",
        targetId: "allowlist",
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
