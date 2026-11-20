import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import {
  isRetryableSupabaseAuthError,
  recordAdminAuditSafe,
  resolveAdminSessionStateWithClient,
  setAdminSessionMetaCookie,
} from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

const mfaVerifySchema = z
  .object({
    factor_id: z.string().uuid(),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Kode verifikasi harus 6 digit angka."),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const rl = consumeRateLimit(
      `admin_mfa_verify:${ipDigest}`,
      RATE_LIMIT_POLICIES.admin_mfa.limit,
      RATE_LIMIT_POLICIES.admin_mfa.windowSeconds
    );
    if (!rl.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak percobaan kode MFA. Tunggu sebentar.",
        { requestId, noStore: true, retryAfterSeconds: rl.retryAfterSeconds }
      );
    }

    const supabase = await createAdultSessionSupabaseClient();
    if (!supabase) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Layanan autentikasi tidak tersedia.",
        { requestId, noStore: true }
      );
    }

    const session = await resolveAdminSessionStateWithClient(supabase);
    if (session.status === "unauthenticated") {
      if (session.transientError) {
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          session.reason ??
            "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi.",
          { requestId, noStore: true }
        );
      }
      return apiError(401, "AUTH_REQUIRED", "Sesi admin tidak ditemukan.", {
        requestId,
        noStore: true,
      });
    }
    if (session.status === "forbidden" || !session.userId) {
      return apiError(403, "ACTION_NOT_ALLOWED", "Akun tidak berwenang.", {
        requestId,
        noStore: true,
      });
    }

    const body = await request.json().catch(() => null);
    const parsed = mfaVerifySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Masukkan kode OTP 6 digit yang valid.",
        { requestId, noStore: true }
      );
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: parsed.data.factor_id,
      code: parsed.data.code,
    });

    if (verifyError) {
      if (isRetryableSupabaseAuthError(verifyError)) {
        await recordAdminAuditSafe({
          actorId: session.userId,
          action: "admin_mfa_verify",
          targetType: "mfa_factor",
          targetId: parsed.data.factor_id,
          requestId,
          outcome: "error",
          metadata: { reason: "mfa_service_unreachable" },
        });
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan verifikasi MFA sedang terganggu. Silakan coba lagi.",
          { requestId, noStore: true }
        );
      }

      await recordAdminAuditSafe({
        actorId: session.userId,
        action: "admin_mfa_verify",
        targetType: "mfa_factor",
        targetId: parsed.data.factor_id,
        requestId,
        outcome: "denied",
        metadata: { reason: "invalid_otp" },
      });
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Kode OTP tidak sesuai atau sudah kedaluwarsa. Periksa waktu perangkat Anda.",
        { requestId, noStore: true }
      );
    }

    const now = Date.now();
    await setAdminSessionMetaCookie({
      uid: session.userId,
      issuedAt: session.meta?.issuedAt ?? now,
      lastActiveAt: now,
      mfaVerifiedAt: now,
    });

    await recordAdminAuditSafe({
      actorId: session.userId,
      action: "mfa_verified",
      targetType: "mfa_factor",
      targetId: parsed.data.factor_id,
      requestId,
      outcome: "success",
    });

    return apiOk({ verified: true, aal: "aal2" }, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
