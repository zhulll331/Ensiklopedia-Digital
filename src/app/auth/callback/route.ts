import { NextResponse, type NextRequest } from "next/server";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";

const ALLOWED_REDIRECT_PREFIXES = ["/guru", "/admin"];

function getSafeNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return "/guru";
  }
  const allowed = ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => rawNext === prefix || rawNext.startsWith(`${prefix}/`)
  );
  return allowed ? rawNext : "/guru";
}

/**
 * Callback autentikasi Supabase Auth dewasa (SEC-01 & 03_ARSITEKTUR §9).
 * Redirect dibatasi allowlist jalur internal agar tidak terjadi open redirect.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/guru?auth=invalid", origin), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/guru?auth=unconfigured", origin), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/guru?auth=failed", origin), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  return NextResponse.redirect(new URL(nextPath, origin), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
