import type { NextRequest } from "next/server";
import { hashSha256Hex } from "@/lib/server/crypto";
import { apiError, apiOk } from "@/lib/server/http";
import {
  consumeRateLimit,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import {
  getGuestSessionCookie,
  verifyOriginAndCsrf,
} from "@/modules/learning/auth";
import { autosaveAnswersSchema } from "@/modules/learning/quiz";
import { mapLearningError } from "@/modules/learning/route-helper";
import { autosaveGuestAnswersAsync } from "@/modules/learning/service";

export async function PUT(request: NextRequest) {
  try {
    await verifyOriginAndCsrf(request);

    const token = await getGuestSessionCookie();
    if (token) {
      const rl = consumeRateLimit(
        `autosave:${hashSha256Hex(token).slice(0, 16)}`,
        RATE_LIMIT_POLICIES.autosave.limit,
        RATE_LIMIT_POLICIES.autosave.windowSeconds
      );
      if (!rl.allowed) {
        return apiError(429, "RATE_LIMITED", "Terlalu sering menyimpan jawaban.", {
          noStore: true,
          retryAfterSeconds: rl.retryAfterSeconds,
        });
      }
    }

    const body = await request.json().catch(() => null);
    const parsed = autosaveAnswersSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Payload simpan jawaban tidak sah.", {
        noStore: true,
      });
    }

    const saved = await autosaveGuestAnswersAsync(token, parsed.data);
    return apiOk(saved, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
