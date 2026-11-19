import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { joinResolveSchema } from "@/modules/learning/quiz";
import { DomainError } from "@/modules/learning/errors";
import { mapLearningError } from "@/modules/learning/route-helper";
import { resolveGuestJoinAsync } from "@/modules/learning/service";

export async function POST(request: NextRequest) {
  const ipDigest = getClientIpDigest(request);
  try {
    const body = await request.json().catch(() => null);
    const parsed = joinResolveSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Sertakan kode atau token tugas yang valid.", {
        noStore: true,
      });
    }

    const data = await resolveGuestJoinAsync(parsed.data);
    return apiOk(data, { noStore: true });
  } catch (err) {
    // Hanya throttle saat kode/token salah agar 1 kelas di NAT sekolah tidak terblokir
    if (err instanceof DomainError && err.status === 404) {
      const rl = consumeRateLimit(
        `invalid_code:${ipDigest}`,
        RATE_LIMIT_POLICIES.invalid_code.limit,
        RATE_LIMIT_POLICIES.invalid_code.windowSeconds
      );
      if (!rl.allowed) {
        return apiError(
          429,
          "RATE_LIMITED",
          "Terlalu banyak percobaan kode yang salah. Tunggu sebentar lalu coba lagi.",
          { noStore: true, retryAfterSeconds: rl.retryAfterSeconds }
        );
      }
    }
    return mapLearningError(err);
  }
}
