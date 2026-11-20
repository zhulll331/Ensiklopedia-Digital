import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  ensurePreferredIpv4NetworkConfig,
  resilientSupabaseFetch,
} from "@/lib/node-network";
import { getServerEnv } from "./env";

/**
 * Client publik read-only untuk konten terbitan (tidak membawa session dewasa).
 */
export function createPublicSupabaseClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }
  ensurePreferredIpv4NetworkConfig();
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: resilientSupabaseFetch },
  });
}

/**
 * Client BFF/server berbasis cookie pengguna dewasa (guru/admin) agar RLS berjalan sesuai auth.uid().
 */
export async function createAdultSessionSupabaseClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }
  ensurePreferredIpv4NetworkConfig();
  const cookieStore = await cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: resilientSupabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Dipanggil dari Server Component read-only; mutasi cookie ditangani oleh Route Handler / Proxy.
        }
      },
    },
  });
}

/**
 * Client berhak istimewa (service-role) khusus operasi admin/job yang memang membutuhkannya.
 * Dilarang dipakai sebagai client umum dashboard guru.
 */
export function createAdminSecretSupabaseClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_ADMIN_SECRET) {
    return null;
  }
  ensurePreferredIpv4NetworkConfig();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ADMIN_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: resilientSupabaseFetch },
  });
}
