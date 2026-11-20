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

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Kata sandi minimal 8 karakter.")
      .max(128, "Kata sandi maksimal 128 karakter."),
  })
  .strict();

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    const ipDigest = getClientIpDigest(request);
    const rate = consumeRateLimit(
      `teacher_set_password:${ipDigest}`,
      RATE_LIMIT_POLICIES.teacher_activate.limit,
      RATE_LIMIT_POLICIES.teacher_activate.windowSeconds
    );
    if (!rate.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Terlalu banyak percobaan pengaturan kata sandi. Tunggu beberapa menit.",
        { requestId, noStore: true, retryAfterSeconds: rate.retryAfterSeconds }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        parsed.error.issues[0]?.message ?? "Kata sandi tidak memenuhi syarat.",
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      if (isRetryableSupabaseAuthError(userError)) {
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi.",
          { requestId, noStore: true }
        );
      }
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Sesi aktivasi guru tidak ditemukan atau sudah berakhir. Buka kembali tautan undangan.",
        { requestId, noStore: true }
      );
    }

    if (!user) {
      return apiError(
        401,
        "AUTH_REQUIRED",
        "Sesi aktivasi guru tidak ditemukan atau sudah berakhir. Buka kembali tautan undangan.",
        { requestId, noStore: true }
      );
    }

    const admin = createAdminSecretSupabaseClient();
    const profileClient = admin ?? supabase;
    const { data: profile, error: profileErr } = await profileClient
      .schema("app")
      .from("profiles")
      .select("user_id, role, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr || !profile || profile.role !== "teacher") {
      return apiError(
        403,
        "ACTION_NOT_ALLOWED",
        "Pengaturan kata sandi ini hanya diizinkan untuk akun guru.",
        { requestId, noStore: true }
      );
    }

    if (profile.status === "suspended") {
      return apiError(
        403,
        "ACTION_NOT_ALLOWED",
        "Akun guru ini sedang disuspensi. Hubungi admin sekolah.",
        { requestId, noStore: true }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });

    if (updateError) {
      if (isRetryableSupabaseAuthError(updateError)) {
        return apiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi.",
          { requestId, noStore: true }
        );
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Kata sandi gagal disimpan. Pastikan minimal 8 karakter yang kuat.",
        { requestId, noStore: true }
      );
    }

    if (admin) {
      try {
        await admin.schema("api").rpc("activate_invited_teacher_self", {
          p_user_id: user.id,
          p_request_id: requestId,
        });
      } catch {
        // Idempoten: lanjutkan ke Portal Guru bila profil sudah aktif atau migrasi tertunda
      }
    }

    return apiOk({ password_set: true, next: "/guru" }, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
