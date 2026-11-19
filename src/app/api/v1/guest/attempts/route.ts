import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import {
  GUEST_COOKIE_NAME,
  verifyOriginAndCsrf,
} from "@/modules/learning/auth";
import { startGuestAttemptSchema } from "@/modules/learning/quiz";
import { mapLearningError } from "@/modules/learning/route-helper";
import { startGuestAttemptAsync } from "@/modules/learning/service";

export async function POST(request: NextRequest) {
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const ipLimit = consumeRateLimit(
      `valid_start_ip:${ipDigest}`,
      RATE_LIMIT_POLICIES.valid_start_ip.limit,
      RATE_LIMIT_POLICIES.valid_start_ip.windowSeconds
    );
    if (!ipLimit.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Permintaan mulai tugas sedang padat. Coba lagi beberapa saat.",
        { noStore: true, retryAfterSeconds: ipLimit.retryAfterSeconds }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = startGuestAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Periksa kembali nama dan kode tugas.", {
        noStore: true,
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message])
        ),
      });
    }

    const started = await startGuestAttemptAsync(parsed.data);
    const cookieStore = await cookies();
    cookieStore.set(GUEST_COOKIE_NAME, started.rawSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(started.sessionExpiresAt),
    });

    return apiOk(started.payload, { status: 201, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
