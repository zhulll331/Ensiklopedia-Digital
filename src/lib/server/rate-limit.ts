import "server-only";
import type { NextRequest } from "next/server";
import { hmacSha256Hex } from "./crypto";
import { getServerEnv } from "./env";

interface BucketEntry {
  count: number;
  expiresAtMs: number;
}

const globalLimiterKey = Symbol.for("edmb.rateLimiter.v1");

function getBuckets(): Map<string, BucketEntry> {
  const g = globalThis as Record<symbol, Map<string, BucketEntry> | undefined>;
  if (!g[globalLimiterKey]) {
    g[globalLimiterKey] = new Map();
  }
  return g[globalLimiterKey];
}

export function resetRateLimitsForTests(): void {
  getBuckets().clear();
}

export function getClientIpDigest(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const rawIp = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
  const pepper = getServerEnv().JOIN_CODE_PEPPER ?? "edmb-local-dev-pepper-do-not-use-in-prod-32b";
  return hmacSha256Hex(pepper, rawIp).slice(0, 24);
}

export function consumeRateLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const buckets = getBuckets();
  const nowMs = Date.now();
  const existing = buckets.get(bucketKey);

  if (!existing || existing.expiresAtMs <= nowMs) {
    const expiresAtMs = nowMs + windowSeconds * 1000;
    buckets.set(bucketKey, { count: 1, expiresAtMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.expiresAtMs - nowMs) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: 0,
  };
}

/**
 * Ambang batas sesuai 05_API.md bagian 8 (dirancang aman untuk satu NAT kelas sekolah).
 */
export const RATE_LIMIT_POLICIES = {
  invalid_code: { limit: 10, windowSeconds: 60 },
  valid_start_ip: { limit: 300, windowSeconds: 15 * 60 },
  valid_start_assignment: { limit: 250, windowSeconds: 15 * 60 },
  autosave: { limit: 30, windowSeconds: 60 },
  submit: { limit: 10, windowSeconds: 60 },
  export: { limit: 5, windowSeconds: 60 * 60 },
  admin_login: { limit: 8, windowSeconds: 60 },
  admin_mfa: { limit: 6, windowSeconds: 60 },
  admin_upload_intent: { limit: 20, windowSeconds: 60 },
  admin_publish: { limit: 15, windowSeconds: 60 },
  admin_invite: { limit: 15, windowSeconds: 60 },
  admin_support: { limit: 10, windowSeconds: 15 * 60 },
  admin_ops: { limit: 15, windowSeconds: 15 * 60 },
  teacher_activate: { limit: 15, windowSeconds: 15 * 60 },
} as const;
