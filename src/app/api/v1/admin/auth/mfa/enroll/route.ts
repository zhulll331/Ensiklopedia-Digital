import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import {
  recordAdminAuditSafe,
  resolveAdminSessionStateWithClient,
} from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const rl = consumeRateLimit(
      `admin_mfa_enroll:${ipDigest}`,
      RATE_LIMIT_POLICIES.admin_mfa.limit,
      RATE_LIMIT_POLICIES.admin_mfa.windowSeconds
    );
    if (!rl.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak permintaan pendaftaran MFA. Tunggu sebentar.",
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
      return apiError(401, "AUTH_REQUIRED", "Masuk admin terlebih dahulu.", {
        requestId,
        noStore: true,
      });
    }
    if (session.status === "forbidden") {
      return apiError(403, "ACTION_NOT_ALLOWED", "Akun tidak berwenang.", {
        requestId,
        noStore: true,
      });
    }
    if (session.status !== "mfa_enroll_required") {
      return apiError(
        409,
        "STATE_CONFLICT",
        "Faktor MFA TOTP sudah terdaftar pada akun ini.",
        { requestId, noStore: true }
      );
    }

    const { data: factorList } = await supabase.auth.mfa.listFactors();
    const unverifiedTotp = (factorList?.all ?? []).filter(
      (f) => f.factor_type === "totp" && f.status === "unverified"
    );
    for (const stale of unverifiedTotp) {
      await supabase.auth.mfa.unenroll({ factorId: stale.id });
    }

    const { data: enrolled, error: enrollError } =
      await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "EDMB Banyuwangi",
        friendlyName: "EDMB Admin Authenticator",
      });

    if (enrollError || !enrolled) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Gagal membuat faktor autentikasi TOTP.",
        { requestId, noStore: true }
      );
    }

    const qrDataUrl = await QRCode.toDataURL(enrolled.totp.uri, {
      width: 220,
      margin: 2,
    });

    await recordAdminAuditSafe({
      actorId: session.userId ?? null,
      action: "admin_mfa_enroll_started",
      targetType: "mfa_factor",
      targetId: enrolled.id,
      requestId,
      outcome: "success",
    });

    return apiOk(
      {
        factor_id: enrolled.id,
        qr_data_url: qrDataUrl,
        secret: enrolled.totp.secret,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
