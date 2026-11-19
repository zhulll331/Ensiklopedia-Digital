import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hashSha256Hex } from "@/lib/server/crypto";
import { apiError, apiOk } from "@/lib/server/http";
import {
  consumeRateLimit,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import {
  getGuestSessionCookie,
  GUEST_COOKIE_NAME,
  verifyOriginAndCsrf,
} from "@/modules/learning/auth";
import { submitAttemptSchema } from "@/modules/learning/quiz";
import { mapLearningError } from "@/modules/learning/route-helper";
import { submitGuestAttemptAsync } from "@/modules/learning/service";

export async function POST(request: NextRequest) {
  try {
    await verifyOriginAndCsrf(request);

    const token = await getGuestSessionCookie();
    if (token) {
      const rl = consumeRateLimit(
        `submit:${hashSha256Hex(token).slice(0, 16)}`,
        RATE_LIMIT_POLICIES.submit.limit,
        RATE_LIMIT_POLICIES.submit.windowSeconds
      );
      if (!rl.allowed) {
        return apiError(
          429,
          "RATE_LIMITED",
          "Terlalu banyak percobaan kirim dalam satu menit. Tunggu sebentar.",
          { noStore: true, retryAfterSeconds: rl.retryAfterSeconds }
        );
      }
    }

    const body = await request.json().catch(() => null);
    const parsed = submitAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Konfirmasi dan daftar jawaban wajib valid.", {
        noStore: true,
      });
    }

    const idempotencyKey = request.headers.get("idempotency-key") ?? undefined;
    const { receipt, newSessionExpiresAt } = await submitGuestAttemptAsync(
      token,
      idempotencyKey,
      parsed.data
    );

    if (token) {
      const cookieStore = await cookies();
      cookieStore.set(GUEST_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(newSessionExpiresAt),
      });
    }

    return apiOk(receipt, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
