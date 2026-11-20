import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  consumeRateLimit,
  getClientIpDigest,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import { isRetryableSupabaseAuthError } from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

const acceptInviteSchema = z
  .object({
    access_token: z.string().trim().min(20).max(8192),
    refresh_token: z.string().trim().min(6).max(4096),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const rate = consumeRateLimit(
      `teacher_activate:${ipDigest}`,
      RATE_LIMIT_POLICIES.teacher_activate.limit,
      RATE_LIMIT_POLICIES.teacher_activate.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak percobaan aktivasi tautan undangan. Tunggu beberapa menit.",
        { requestId, noStore: true, retryAfterSeconds: rate.retryAfterSeconds }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = acceptInviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Token undangan pada tautan tidak lengkap atau tidak valid.",
        { requestId, noStore: true }
      );
    }

    const supabase = await createAdultSessionSupabaseClient();
    if (!supabase) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Layanan autentikasi Supabase belum dikonfigurasi.",
        { requestId, noStore: true }
      );
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: parsed.data.access_token,
      refresh_token: parsed.data.refresh_token,
    });

    if (sessionError) {
      if (isRetryableSupabaseAuthError(sessionError)) {
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba muat ulang.",
          { requestId, noStore: true }
        );
      }
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta admin mengirim ulang undangan.",
        { requestId, noStore: true }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      if (isRetryableSupabaseAuthError(userError)) {
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba muat ulang.",
          { requestId, noStore: true }
        );
      }
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta admin mengirim ulang undangan.",
        { requestId, noStore: true }
      );
    }

    if (!user) {
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta admin mengirim ulang undangan.",
        { requestId, noStore: true }
      );
    }

    const admin = createAdminSecretSupabaseClient();
    const profileClient = admin ?? supabase;
    const { data: profile, error: profileErr } = await profileClient
      .schema("app")
      .from("profiles")
      .select("user_id, role, display_name, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile || profile.role !== "teacher") {
      await supabase.auth.signOut().catch(() => {});
      return apiError(
        403,
        "ACTION_NOT_ALLOWED",
        "Tautan aktivasi ini hanya berlaku untuk akun guru yang terdaftar.",
        { requestId, noStore: true }
      );
    }

    if (profile.status === "suspended") {
      await supabase.auth.signOut().catch(() => {});
      return apiError(
        403,
        "ACTION_NOT_ALLOWED",
        "Akun guru ini sedang disuspensi. Hubungi admin sekolah untuk informasi lanjut.",
        { requestId, noStore: true }
      );
    }

    if (profile.status === "invited" && admin) {
      try {
        await admin.schema("api").rpc("activate_invited_teacher_self", {
          p_user_id: user.id,
          p_request_id: requestId,
        });
      } catch {
        // Abaikan bila migrasi 0017 belum dijalankan agar guru tetap dapat mengatur kata sandi
      }
    }

    return apiOk(
      {
        activated: true,
        email: user.email ?? null,
        display_name: profile.display_name,
        status: "active",
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
