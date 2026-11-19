import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import { getServerEnv } from "@/lib/server/env";
import { DomainError } from "./server-store";

export const GUEST_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-edmb_guest" : "edmb_guest";

export const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-edmb_csrf" : "edmb_csrf";

export const DEMO_TEACHER_COOKIE_NAME = "edmb_teacher_demo";

export async function verifyOriginAndCsrf(request: NextRequest): Promise<void> {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.host !== host) {
        throw new DomainError(403, "ACTION_NOT_ALLOWED", "Origin permintaan tidak diizinkan.");
      }
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw new DomainError(403, "ACTION_NOT_ALLOWED", "Origin tidak valid.");
    }
  }

  const headerToken = request.headers.get("x-csrf-token");
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Token keamanan CSRF tidak valid atau kedaluwarsa. Muat ulang halaman."
    );
  }
}

export async function getGuestSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_COOKIE_NAME)?.value;
}

export async function getAuthenticatedTeacherId(): Promise<string> {
  const env = getServerEnv();
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) {
    const supabase = await createAdultSessionSupabaseClient();
    if (!supabase) {
      throw new DomainError(401, "AUTH_REQUIRED", "Autentikasi guru diperlukan.");
    }
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      throw new DomainError(401, "AUTH_REQUIRED", "Sesi guru tidak valid.");
    }
    return user.id;
  }

  // Mode pengembangan/uji lokal sebelum Supabase dihubungkan: tetap mewajibkan cookie sesi guru eksplisit
  if (
    process.env.NODE_ENV === "production" &&
    process.env.EDMB_ALLOW_LOCAL_DEMO !== "1"
  ) {
    throw new DomainError(401, "AUTH_REQUIRED", "Autentikasi Supabase belum dikonfigurasi.");
  }

  const cookieStore = await cookies();
  const demoTeacherId = cookieStore.get(DEMO_TEACHER_COOKIE_NAME)?.value;
  if (demoTeacherId === "teacher-demo-1" || demoTeacherId === "teacher-demo-2") {
    return demoTeacherId;
  }

  throw new DomainError(401, "AUTH_REQUIRED", "Silakan masuk sebagai guru terlebih dahulu.");
}
