import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ensurePreferredIpv4NetworkConfig,
  resilientSupabaseFetch,
} from "@/lib/node-network";

const DYNAMIC_STRICT_ROUTES = ["/tugas", "/guru", "/admin", "/auth"];

function isStrictDynamicRoute(pathname: string): boolean {
  return DYNAMIC_STRICT_ROUTES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isAdultPortalRoute(pathname: string): boolean {
  return (
    pathname === "/guru" ||
    pathname.startsWith("/guru/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

function getSafeSupabaseOrigin(): string | null {
  const raw = process.env.SUPABASE_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isStudentTaskRoute =
    pathname === "/tugas" || pathname.startsWith("/tugas/");
  const supabaseOrigin = isStudentTaskRoute ? null : getSafeSupabaseOrigin();
  const originToken = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  const requestHeaders = new Headers(request.headers);
  let cspDirectives: string[];

  if (isStrictDynamicRoute(pathname)) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    requestHeaders.set("x-nonce", nonce);
    cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' blob: data:${isAdminRoute ? " https:" : ""}`,
      `media-src 'self' blob:${isAdminRoute ? " https:" : ""}`,
      ...(isAdminRoute
        ? [
            "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://drive.google.com",
          ]
        : []),
      "font-src 'self'",
      `connect-src 'self'${isAdminRoute ? originToken : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];
  } else {
    cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https:",
      "media-src 'self' blob: https:",
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://drive.google.com",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];
  }

  if (process.env.NODE_ENV === "production" && isHttps) {
    cspDirectives.push("upgrade-insecure-requests");
  }

  const cspHeaderValue = cspDirectives.join("; ");
  requestHeaders.set("Content-Security-Policy", cspHeaderValue);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const hasSupabaseAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (
    isAdultPortalRoute(pathname) &&
    supabaseUrl &&
    supabaseKey &&
    hasSupabaseAuthCookie
  ) {
    try {
      ensurePreferredIpv4NetworkConfig();
      const accumulatedCookies = new Map<
        string,
        {
          name: string;
          value: string;
          options?: Parameters<typeof response.cookies.set>[2];
        }
      >();
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        global: { fetch: resilientSupabaseFetch },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              if (value === "" && options?.maxAge === 0) {
                request.cookies.delete(name);
              } else {
                request.cookies.set(name, value);
              }
              accumulatedCookies.set(name, { name, value, options });
            }
            // Sinkronkan header cookie agar Server Component downstream membaca token terbaru
            const updatedCookieHeader = request.cookies.toString();
            if (updatedCookieHeader) {
              requestHeaders.set("cookie", updatedCookieHeader);
            } else {
              requestHeaders.delete("cookie");
            }
            response = NextResponse.next({
              request: {
                headers: requestHeaders,
              },
            });
            for (const cookie of accumulatedCookies.values()) {
              response.cookies.set(cookie.name, cookie.value, cookie.options);
            }
          },
        },
      });
      await supabase.auth.getUser();
    } catch {
      // Pembaruan token sementara gagal tidak memutus fallback halaman auth
    }
  }

  response.headers.set("Content-Security-Policy", cspHeaderValue);

  if (isStrictDynamicRoute(pathname)) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (
    pathname === "/tugas" ||
    pathname.startsWith("/tugas/") ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  ) {
    response.headers.set("Referrer-Policy", "no-referrer");
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
