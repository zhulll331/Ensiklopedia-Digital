import type { NextRequest } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/server/env";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import {
  clearAdminAuthCookies,
  decodeJwtPayloadUnsafe,
  extractVerifiedTotpFactors,
  isRetryableSupabaseAuthError,
  logClockSkewIfDetected,
  recordAdminAuditSafe,
  setAdminSessionMetaCookie,
} from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

const adminLoginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const rl = consumeRateLimit(
      `admin_login:${ipDigest}`,
      RATE_LIMIT_POLICIES.admin_login.limit,
      RATE_LIMIT_POLICIES.admin_login.windowSeconds
    );
    if (!rl.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak percobaan masuk admin. Tunggu sebentar.",
        { requestId, noStore: true, retryAfterSeconds: rl.retryAfterSeconds }
      );
    }

    if (!isSupabaseConfigured()) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Supabase Auth belum dikonfigurasi pada environment ini.",
        { requestId, noStore: true }
      );
    }

    const supabase = await createAdultSessionSupabaseClient();
    if (!supabase) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Klien autentikasi belum tersedia.",
        { requestId, noStore: true }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = adminLoginSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Email dan kata sandi admin wajib diisi dengan benar.",
        { requestId, noStore: true }
      );
    }

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

    if (signInError || !signInData.user) {
      if (signInError && isRetryableSupabaseAuthError(signInError)) {
        await recordAdminAuditSafe({
          actorId: null,
          action: "admin_login",
          targetType: "auth",
          targetId: ipDigest,
          requestId,
          outcome: "error",
          metadata: { reason: "auth_service_unreachable" },
        });
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi sebentar.",
          { requestId, noStore: true }
        );
      }

      await recordAdminAuditSafe({
        actorId: null,
        action: "admin_login",
        targetType: "auth",
        targetId: ipDigest,
        requestId,
        outcome: "denied",
        metadata: { reason: "invalid_credentials" },
      });
      return apiError(401, "AUTH_REQUIRED", "Email atau kata sandi tidak sesuai.", {
        requestId,
        noStore: true,
      });
    }

    const userId = signInData.user.id;
    const { data: profile, error: profileErr } = await supabase
      .schema("app")
      .from("profiles")
      .select("user_id, role, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      profileErr ||
      !profile ||
      profile.role !== "admin" ||
      profile.status !== "active"
    ) {
      await supabase.auth.signOut();
      await clearAdminAuthCookies();
      await recordAdminAuditSafe({
        actorId: userId,
        action: "admin_login_denied",
        targetType: "profile",
        targetId: userId,
        requestId,
        outcome: "denied",
        metadata: { reason: "not_active_admin" },
      });
      return apiError(
        403,
        "ACTION_NOT_ALLOWED",
        "Akun ini tidak memiliki peran admin aktif.",
        { requestId, noStore: true }
      );
    }

    logClockSkewIfDetected(
      "/api/v1/admin/auth/login",
      requestId,
      signInData.session?.expires_at,
      signInData.session?.expires_in
    );

    const now = Date.now();
    await setAdminSessionMetaCookie({
      uid: userId,
      issuedAt: now,
      lastActiveAt: now,
    });

    const verifiedTotp =
      signInData.user.factors !== undefined
        ? extractVerifiedTotpFactors(signInData.user.factors)
        : ((await supabase.auth.mfa.listFactors()).data?.totp ?? []);

    const hasVerifiedTotp = verifiedTotp.length > 0;
    const jwtPayload = decodeJwtPayloadUnsafe(
      signInData.session?.access_token ?? ""
    );
    const currentLevel =
      typeof jwtPayload?.aal === "string"
        ? jwtPayload.aal
        : ((await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data
            ?.currentLevel ?? null);

    const nextStep = !hasVerifiedTotp
      ? "mfa_enroll"
      : currentLevel === "aal2"
        ? "authenticated"
        : "mfa_verify";

    await recordAdminAuditSafe({
      actorId: userId,
      action: "admin_login_password",
      targetType: "profile",
      targetId: userId,
      requestId,
      outcome: "success",
      metadata: { next_step: nextStep },
    });

    return apiOk(
      {
        signed_in: true,
        next_step: nextStep,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
