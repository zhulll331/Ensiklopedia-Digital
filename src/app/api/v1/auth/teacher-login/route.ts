import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import { isRetryableSupabaseAuthError } from "@/modules/admin/auth";

const loginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128),
  })
  .strict();

export async function POST(request: NextRequest) {
  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    return apiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Supabase Auth belum dikonfigurasi pada environment ini.",
      { noStore: true }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION_FAILED", "Email dan kata sandi wajib diisi.", {
      noStore: true,
    });
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    if (isRetryableSupabaseAuthError(error)) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi sebentar.",
        { noStore: true }
      );
    }
    // Pesan umum agar tidak mengungkap apakah email tertentu terdaftar (SEC-01)
    return apiError(401, "AUTH_REQUIRED", "Email atau kata sandi tidak sesuai.", {
      noStore: true,
    });
  }

  return apiOk({ signed_in: true }, { noStore: true });
}
