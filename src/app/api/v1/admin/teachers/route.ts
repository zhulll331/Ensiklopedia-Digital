import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  adminTeachersQuerySchema,
  inviteTeacherSchema,
} from "@/modules/admin/people-schemas";
import {
  inviteTeacherAsync,
  listAdminTeachersAsync,
} from "@/modules/admin/people-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const url = new URL(request.url);
    const parsed = adminTeachersQuerySchema.safeParse({
      status: url.searchParams.get("status") || undefined,
      school_id: url.searchParams.get("school_id") || undefined,
      q: url.searchParams.get("q") || undefined,
    });

    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Parameter filter guru tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const result = await listAdminTeachersAsync(session, parsed.data);
    return apiOk(
      {
        items: result.items,
        counts: result.counts,
        schools: result.schools,
        mode: result.mode,
        migration_pending: result.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });

    const rateKey = `admin-invite:${session.userId ?? getClientIpDigest(request)}`;
    const rate = consumeRateLimit(
      rateKey,
      RATE_LIMIT_POLICIES.admin_invite.limit,
      RATE_LIMIT_POLICIES.admin_invite.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak undangan guru dikirim dalam waktu singkat.",
        {
          requestId,
          noStore: true,
          retryAfterSeconds: rate.retryAfterSeconds,
        }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = inviteTeacherSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data undangan guru tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const created = await inviteTeacherAsync(session, {
      ...parsed.data,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
