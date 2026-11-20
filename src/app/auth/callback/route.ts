import { NextResponse, type NextRequest } from "next/server";
import { createRequestId } from "@/lib/server/http";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import { isRetryableSupabaseAuthError } from "@/modules/admin/auth";

const ALLOWED_REDIRECT_PREFIXES = ["/guru", "/admin", "/auth/aktivasi"];
const ALLOWED_OTP_TYPES = ["invite", "magiclink", "recovery", "email"] as const;
type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

const CALLBACK_SECURITY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;

function getSafeNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/guru";
  }
  const allowed = ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => rawNext === prefix || rawNext.startsWith(`${prefix}/`)
  );
  return allowed ? rawNext : "/guru";
}

function isAllowedOtpType(rawType: string | null): rawType is AllowedOtpType {
  return Boolean(
    rawType && (ALLOWED_OTP_TYPES as readonly string[]).includes(rawType)
  );
}

/**
 * Callback autentikasi Supabase Auth dewasa (SEC-01 & 03_ARSITEKTUR §9).
 * Mendukung PKCE `code`, email link `token_hash` + `type`, serta fallback implicit `#access_token` ke `/auth/aktivasi`.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  // Tautan implicit default Supabase (#access_token=...&type=invite) hanya bisa dibaca di browser klien
  if (!code && !(tokenHash && isAllowedOtpType(otpType))) {
    const activationUrl = new URL("/auth/aktivasi", origin);
    activationUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(activationUrl, {
      headers: CALLBACK_SECURITY_HEADERS,
    });
  }

  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/guru?auth=unconfigured", origin), {
      headers: CALLBACK_SECURITY_HEADERS,
    });
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const reason = isRetryableSupabaseAuthError(error) ? "network" : "expired";
      return NextResponse.redirect(
        new URL(`/auth/aktivasi?error=${reason}`, origin),
        { headers: CALLBACK_SECURITY_HEADERS }
      );
    }
  } else if (tokenHash && isAllowedOtpType(otpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) {
      const reason = isRetryableSupabaseAuthError(error) ? "network" : "expired";
      return NextResponse.redirect(
        new URL(`/auth/aktivasi?error=${reason}`, origin),
        { headers: CALLBACK_SECURITY_HEADERS }
      );
    }
  }

  // Aktifkan profil guru berstatus 'invited' menjadi 'active' setelah tautan undangan diterima
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const admin = createAdminSecretSupabaseClient();
    if (user?.id && admin) {
      await admin.schema("api").rpc("activate_invited_teacher_self", {
        p_user_id: user.id,
        p_request_id: createRequestId(),
      });
    }
  } catch {
    // Abaikan apabila migrasi 0017 belum dijalankan agar login admin/guru tetap lancar
  }

  const destination =
    otpType === "invite" || otpType === "recovery" || nextPath === "/auth/aktivasi"
      ? "/auth/aktivasi"
      : nextPath;

  return NextResponse.redirect(new URL(destination, origin), {
    headers: CALLBACK_SECURITY_HEADERS,
  });
}
