import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_ADMIN_SECRET: z.string().min(1).optional(),
  GUEST_DATABASE_URL: z.string().min(1).optional(),
  JOIN_CODE_PEPPER: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  SMTP_FROM: z.string().email().optional(),
  ERROR_TRACKER_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function resetServerEnvCacheForTests(): void {
  cachedEnv = null;
}

export function getServerEnv(): ServerEnv {
  if (cachedEnv && process.env.NODE_ENV !== "test") {
    return cachedEnv;
  }
  const parsed = serverEnvSchema.safeParse({
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || "http://localhost:3000",
    SUPABASE_URL: process.env.SUPABASE_URL || undefined,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || undefined,
    SUPABASE_ADMIN_SECRET: process.env.SUPABASE_ADMIN_SECRET || undefined,
    GUEST_DATABASE_URL: process.env.GUEST_DATABASE_URL || undefined,
    JOIN_CODE_PEPPER: process.env.JOIN_CODE_PEPPER || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    SMTP_FROM: process.env.SMTP_FROM || undefined,
    ERROR_TRACKER_DSN: process.env.ERROR_TRACKER_DSN || undefined,
  });

  if (!parsed.success) {
    throw new Error("Konfigurasi environment server tidak valid.");
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function isSupabaseConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

export function isSupabaseAdminConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ADMIN_SECRET);
}
