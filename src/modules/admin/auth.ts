import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { hmacSha256Hex } from "@/lib/server/crypto";
import {
  getServerEnv,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import { createRequestId } from "@/lib/server/http";
import { logServerEvent } from "@/lib/server/logger";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { DomainError } from "@/modules/learning/errors";

export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ADMIN_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const ADMIN_RECENT_REAUTH_MS = 10 * 60 * 1000;

export const ADMIN_SESSION_META_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-edmb_admin_meta"
    : "edmb_admin_meta";

export const DEMO_ADMIN_COOKIE_NAME = "edmb_admin_demo";

export interface AdminSessionMeta {
  uid: string;
  issuedAt: number;
  lastActiveAt: number;
  mfaVerifiedAt?: number;
}

export type AdminSessionStatus =
  | "unauthenticated"
  | "forbidden"
  | "mfa_enroll_required"
  | "mfa_verify_required"
  | "reauth_required"
  | "authenticated";

export interface AdminSessionResult {
  status: AdminSessionStatus;
  mode: "supabase" | "local_demo";
  userId?: string;
  displayName?: string;
  email?: string;
  verifiedFactorId?: string;
  aal?: string | null;
  meta?: AdminSessionMeta;
  reason?: string;
  transientError?: boolean;
}

const DEV_ADMIN_META_FALLBACK = "edmb-local-dev-admin-meta-secret-do-not-use-prod";

function getAdminMetaSecret(): string {
  return getServerEnv().JOIN_CODE_PEPPER ?? DEV_ADMIN_META_FALLBACK;
}

export function signAdminSessionMeta(meta: AdminSessionMeta): string {
  const payload = Buffer.from(JSON.stringify(meta), "utf8").toString("base64url");
  const sig = hmacSha256Hex(getAdminMetaSecret(), payload);
  return `${payload}.${sig}`;
}

export function verifyAdminSessionMeta(
  rawToken: string | undefined,
  expectedUid: string
): AdminSessionMeta | null {
  if (!rawToken) return null;
  const dotIdx = rawToken.indexOf(".");
  if (dotIdx <= 0 || dotIdx === rawToken.length - 1) return null;
  const payload = rawToken.slice(0, dotIdx);
  const sig = rawToken.slice(dotIdx + 1);
  const expectedSig = hmacSha256Hex(getAdminMetaSecret(), payload);

  const providedBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return null;
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<AdminSessionMeta>;
    if (
      parsed.uid !== expectedUid ||
      typeof parsed.issuedAt !== "number" ||
      !Number.isFinite(parsed.issuedAt) ||
      typeof parsed.lastActiveAt !== "number" ||
      !Number.isFinite(parsed.lastActiveAt)
    ) {
      return null;
    }
    if (
      parsed.mfaVerifiedAt !== undefined &&
      (typeof parsed.mfaVerifiedAt !== "number" ||
        !Number.isFinite(parsed.mfaVerifiedAt))
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      issuedAt: parsed.issuedAt,
      lastActiveAt: parsed.lastActiveAt,
      ...(parsed.mfaVerifiedAt !== undefined
        ? { mfaVerifiedAt: parsed.mfaVerifiedAt }
        : {}),
    };
  } catch {
    return null;
  }
}

export function extractLatestMfaTimestampMs(methods: unknown): number | null {
  if (!Array.isArray(methods)) return null;
  let latest: number | null = null;
  for (const entry of methods) {
    if (!entry || typeof entry !== "object") continue;
    const method = (entry as { method?: unknown }).method;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    if (
      (method === "totp" || method === "mfa/totp" || method === "webauthn") &&
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      timestamp > 0
    ) {
      const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
      if (latest === null || ms > latest) {
        latest = ms;
      }
    }
  }
  return latest;
}

export function evaluateAdminSessionTiming(
  meta: AdminSessionMeta,
  nowMs: number,
  options?: {
    requireRecentReauth?: boolean;
    amrMfaVerifiedAtMs?: number | null;
  }
):
  | { ok: true }
  | {
      ok: false;
      reason: "idle_expired" | "absolute_expired" | "reauth_required";
    } {
  if (nowMs - meta.issuedAt > ADMIN_ABSOLUTE_TIMEOUT_MS) {
    return { ok: false, reason: "absolute_expired" };
  }
  if (nowMs - meta.lastActiveAt > ADMIN_IDLE_TIMEOUT_MS) {
    return { ok: false, reason: "idle_expired" };
  }
  if (options?.requireRecentReauth) {
    const latestMfa = Math.max(
      meta.mfaVerifiedAt ?? 0,
      options.amrMfaVerifiedAtMs ?? 0
    );
    if (latestMfa <= 0 || nowMs - latestMfa > ADMIN_RECENT_REAUTH_MS) {
      return { ok: false, reason: "reauth_required" };
    }
  }
  return { ok: true };
}

export function isLocalAdminDemoAllowed(): boolean {
  return (
    !isSupabaseConfigured() &&
    (process.env.NODE_ENV !== "production" ||
      process.env.EDMB_ALLOW_LOCAL_DEMO === "1")
  );
}

export async function setAdminSessionMetaCookie(
  meta: AdminSessionMeta
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_META_COOKIE, signAdminSessionMeta(meta), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_ABSOLUTE_TIMEOUT_MS / 1000),
  });
}

export async function clearAdminAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_META_COOKIE);
  cookieStore.delete(DEMO_ADMIN_COOKIE_NAME);
}

export async function recordAdminAuditSafe(params: {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string;
  outcome: "success" | "denied" | "error";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const requestId = params.requestId ?? createRequestId();
  logServerEvent({
    request_id: requestId,
    route: "/admin/auth",
    action: params.action,
    outcome: params.outcome,
    status: params.outcome === "success" ? 200 : params.outcome === "denied" ? 403 : 500,
    metadata: {
      target_type: params.targetType,
      target_id: params.targetId,
      ...(params.metadata ?? {}),
    },
  });

  if (!isSupabaseAdminConfigured() || !params.actorId) {
    return;
  }

  try {
    const admin = createAdminSecretSupabaseClient();
    if (!admin) return;
    await admin.schema("api").rpc("write_admin_audit", {
      p_actor_id: params.actorId,
      p_action: params.action,
      p_target_type: params.targetType,
      p_target_id: params.targetId,
      p_request_id: requestId,
      p_outcome: params.outcome,
      p_safe_metadata: params.metadata ?? {},
    });
  } catch {
    // Jangan menjatuhkan alur autentikasi apabila migrasi audit belum diterapkan
  }
}

export function extractVerifiedTotpFactors(
  factors: unknown
): Array<{ id: string }> {
  if (!Array.isArray(factors)) return [];
  const verified: Array<{ id: string }> = [];
  for (const factor of factors) {
    if (!factor || typeof factor !== "object") continue;
    const candidate = factor as {
      id?: unknown;
      status?: unknown;
      factor_type?: unknown;
    };
    if (
      candidate.status === "verified" &&
      candidate.factor_type === "totp" &&
      typeof candidate.id === "string" &&
      candidate.id.length > 0
    ) {
      verified.push({ id: candidate.id });
    }
  }
  return verified;
}

export function decodeJwtPayloadUnsafe(
  jwt: string
): Record<string, unknown> | null {
  if (typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (
    parts.length !== 3 ||
    !parts[1] ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isRetryableSupabaseAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: unknown; status?: unknown };
  if (err.name === "AuthRetryableFetchError") return true;
  if (typeof err.status === "number") {
    return err.status === 0 || err.status >= 500;
  }
  return false;
}

export function detectClockSkewSeconds(
  expiresAtSec: unknown,
  expiresInSec: unknown,
  nowMs = Date.now()
): number | null {
  if (
    typeof expiresAtSec !== "number" ||
    !Number.isFinite(expiresAtSec) ||
    expiresAtSec <= 0 ||
    typeof expiresInSec !== "number" ||
    !Number.isFinite(expiresInSec) ||
    expiresInSec <= 0
  ) {
    return null;
  }
  const estimatedServerNowSec = expiresAtSec - expiresInSec;
  const localNowSec = nowMs / 1000;
  const skewSeconds = Math.round(localNowSec - estimatedServerNowSec);
  if (Math.abs(skewSeconds) > 300) {
    return skewSeconds;
  }
  return null;
}

export function logClockSkewIfDetected(
  route: string,
  requestId: string,
  expiresAtSec: unknown,
  expiresInSec: unknown
): void {
  const skewSeconds = detectClockSkewSeconds(expiresAtSec, expiresInSec);
  if (skewSeconds !== null) {
    logServerEvent({
      request_id: requestId,
      route,
      action: "clock_skew_detected",
      outcome: "denied",
      status: 200,
      metadata: { skew_seconds: skewSeconds },
    });
  }
}

export type AdultSessionSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createAdultSessionSupabaseClient>>
>;

function formatSafeAuthErrorMeta(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {};
  const err = error as { name?: unknown; status?: unknown; code?: unknown };
  return {
    ...(typeof err.name === "string" ? { error_name: err.name } : {}),
    ...(typeof err.status === "number" ? { error_status: err.status } : {}),
    ...(typeof err.code === "string" ? { error_code: err.code } : {}),
  };
}

export async function resolveAdminSessionStateWithClient(
  supabase: AdultSessionSupabaseClient,
  options?: {
    requireRecentReauth?: boolean;
  }
): Promise<AdminSessionResult> {
  let authRes = await supabase.auth.getUser();
  if (authRes.error && isRetryableSupabaseAuthError(authRes.error)) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    authRes = await supabase.auth.getUser();
  }

  const user = authRes.data.user;
  const authError = authRes.error;
  if (authError || !user) {
    const isTransient = Boolean(
      authError && isRetryableSupabaseAuthError(authError)
    );
    logServerEvent({
      request_id: createRequestId(),
      route: "/admin/auth",
      action: "resolve_admin_session",
      outcome: isTransient ? "error" : "denied",
      status: isTransient ? 503 : 401,
      metadata: {
        stage: "get_user",
        ...(authError
          ? formatSafeAuthErrorMeta(authError)
          : { error_code: "missing_user" }),
      },
    });
    if (isTransient) {
      return {
        status: "unauthenticated",
        mode: "supabase",
        transientError: true,
        reason:
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi.",
      };
    }
    return { status: "unauthenticated", mode: "supabase" };
  }

  const nowMs = Date.now();
  const cookieStore = await cookies();
  const rawMetaCookie = cookieStore.get(ADMIN_SESSION_META_COOKIE)?.value;
  let meta: AdminSessionMeta | null = null;

  if (rawMetaCookie) {
    meta = verifyAdminSessionMeta(rawMetaCookie, user.id);
    if (!meta) {
      logServerEvent({
        request_id: createRequestId(),
        route: "/admin/auth",
        action: "resolve_admin_session",
        outcome: "denied",
        status: 401,
        metadata: { stage: "verify_meta", reason: "invalid_meta_cookie" },
      });
      return {
        status: "unauthenticated",
        mode: "supabase",
        reason: "Metadata sesi admin tidak valid.",
      };
    }
  } else {
    const signInMs = user.last_sign_in_at
      ? Date.parse(user.last_sign_in_at)
      : NaN;
    if (
      Number.isFinite(signInMs) &&
      nowMs - signInMs > ADMIN_ABSOLUTE_TIMEOUT_MS
    ) {
      logServerEvent({
        request_id: createRequestId(),
        route: "/admin/auth",
        action: "resolve_admin_session",
        outcome: "denied",
        status: 401,
        metadata: { stage: "meta_fallback", reason: "absolute_expired" },
      });
      return {
        status: "unauthenticated",
        mode: "supabase",
        reason: "Batas sesi absolut admin telah berakhir.",
      };
    }
    meta = {
      uid: user.id,
      issuedAt: Number.isFinite(signInMs) ? signInMs : nowMs,
      lastActiveAt: nowMs,
    };
  }

  const [
    { data: profile, error: profileErr },
    { data: aalData, error: aalErr },
  ] = await Promise.all([
    supabase
      .schema("app")
      .from("profiles")
      .select("user_id, role, display_name, status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  if (
    profileErr ||
    !profile ||
    profile.role !== "admin" ||
    profile.status !== "active"
  ) {
    logServerEvent({
      request_id: createRequestId(),
      route: "/admin/auth",
      action: "resolve_admin_session",
      outcome: "denied",
      status: 403,
      metadata: {
        stage: "profile_check",
        reason: profileErr ? "profile_query_error" : "not_active_admin",
        ...(profileErr ? formatSafeAuthErrorMeta(profileErr) : {}),
      },
    });
    return {
      status: "forbidden",
      mode: "supabase",
      userId: user.id,
      email: user.email,
      reason: "Akun tidak memiliki peran admin aktif.",
    };
  }

  if (aalErr || !aalData) {
    logServerEvent({
      request_id: createRequestId(),
      route: "/admin/auth",
      action: "resolve_admin_session",
      outcome: "denied",
      status: 401,
      metadata: {
        stage: "aal_check",
        reason: "aal_unavailable",
        ...(aalErr ? formatSafeAuthErrorMeta(aalErr) : {}),
      },
    });
    return {
      status: "unauthenticated",
      mode: "supabase",
      reason: "Gagal memeriksa status MFA admin.",
    };
  }

  const verifiedTotp = extractVerifiedTotpFactors(user.factors);
  const primaryFactor = verifiedTotp[0];
  const amrMfaVerifiedAtMs = extractLatestMfaTimestampMs(
    aalData.currentAuthenticationMethods
  );

  const timing = evaluateAdminSessionTiming(meta, nowMs, {
    requireRecentReauth: false,
    amrMfaVerifiedAtMs,
  });

  if (!timing.ok) {
    logServerEvent({
      request_id: createRequestId(),
      route: "/admin/auth",
      action: "resolve_admin_session",
      outcome: "denied",
      status: 401,
      metadata: { stage: "session_timing", reason: timing.reason },
    });
    return {
      status: "unauthenticated",
      mode: "supabase",
      reason:
        timing.reason === "idle_expired"
          ? "Sesi admin berakhir karena tidak aktif selama 30 menit."
          : "Batas maksimum sesi admin (8 jam) telah tercapai.",
    };
  }

  if (verifiedTotp.length === 0 || !primaryFactor) {
    return {
      status: "mfa_enroll_required",
      mode: "supabase",
      userId: user.id,
      displayName: profile.display_name,
      email: user.email,
      aal: aalData.currentLevel,
      meta,
    };
  }

  if (aalData.currentLevel !== "aal2") {
    return {
      status: "mfa_verify_required",
      mode: "supabase",
      userId: user.id,
      displayName: profile.display_name,
      email: user.email,
      verifiedFactorId: primaryFactor.id,
      aal: aalData.currentLevel,
      meta,
    };
  }

  if (options?.requireRecentReauth) {
    const reauthCheck = evaluateAdminSessionTiming(meta, nowMs, {
      requireRecentReauth: true,
      amrMfaVerifiedAtMs,
    });
    if (!reauthCheck.ok) {
      return {
        status: "reauth_required",
        mode: "supabase",
        userId: user.id,
        displayName: profile.display_name,
        email: user.email,
        verifiedFactorId: primaryFactor.id,
        aal: aalData.currentLevel,
        meta,
        reason: "Tindakan sensitif memerlukan verifikasi ulang kode MFA.",
      };
    }
  }

  return {
    status: "authenticated",
    mode: "supabase",
    userId: user.id,
    displayName: profile.display_name,
    email: user.email,
    verifiedFactorId: primaryFactor.id,
    aal: aalData.currentLevel,
    meta,
  };
}

async function resolveAdminSessionStateUncached(options?: {
  requireRecentReauth?: boolean;
}): Promise<AdminSessionResult> {
  if (!isSupabaseConfigured()) {
    if (!isLocalAdminDemoAllowed()) {
      return { status: "unauthenticated", mode: "local_demo" };
    }
    const cookieStore = await cookies();
    const demoVal = cookieStore.get(DEMO_ADMIN_COOKIE_NAME)?.value;
    if (demoVal === "admin-demo-1") {
      return {
        status: "authenticated",
        mode: "local_demo",
        userId: "admin-demo-1",
        displayName: "Admin Lokal (Pratinjau Sampel)",
        aal: "aal2",
      };
    }
    return { status: "unauthenticated", mode: "local_demo" };
  }

  const cookieStore = await cookies();
  const hasSupabaseAuthCookie = cookieStore
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasSupabaseAuthCookie) {
    return { status: "unauthenticated", mode: "supabase" };
  }

  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    return { status: "unauthenticated", mode: "supabase" };
  }

  return resolveAdminSessionStateWithClient(supabase, options);
}

const getCachedDefaultAdminSession = cache(() =>
  resolveAdminSessionStateUncached()
);

export async function resolveAdminSessionState(options?: {
  requireRecentReauth?: boolean;
  bypassCache?: boolean;
}): Promise<AdminSessionResult> {
  if (!options?.requireRecentReauth && !options?.bypassCache) {
    return getCachedDefaultAdminSession();
  }
  return resolveAdminSessionStateUncached({
    requireRecentReauth: options?.requireRecentReauth,
  });
}

export async function requireAdminPage(): Promise<
  | { forbidden: true; session: AdminSessionResult }
  | { forbidden: false; session: AdminSessionResult }
> {
  const session = await resolveAdminSessionState();
  switch (session.status) {
    case "unauthenticated":
      redirect("/admin/masuk");
    case "mfa_enroll_required":
      redirect("/admin/mfa/daftar");
    case "mfa_verify_required":
      redirect("/admin/mfa/verifikasi");
    case "reauth_required":
      redirect("/admin/mfa/verifikasi?reauth=1");
    case "forbidden":
      return { forbidden: true, session };
    case "authenticated":
      return { forbidden: false, session };
  }
}

export async function requireAdminApi(
  request: NextRequest,
  options?: { requireCsrf?: boolean; requireRecentReauth?: boolean }
): Promise<AdminSessionResult> {
  if (options?.requireCsrf ?? true) {
    await verifyOriginAndCsrf(request);
  }

  const session = await resolveAdminSessionState({
    requireRecentReauth: options?.requireRecentReauth,
    bypassCache: true,
  });

  if (session.status === "unauthenticated") {
    if (session.transientError) {
      throw new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        session.reason ??
          "Koneksi ke layanan autentikasi sedang terganggu. Silakan coba lagi."
      );
    }
    throw new DomainError(
      401,
      "AUTH_REQUIRED",
      session.reason ?? "Autentikasi admin diperlukan."
    );
  }

  if (session.status === "forbidden") {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      session.reason ?? "Akun tidak memiliki wewenang admin aktif."
    );
  }

  if (
    session.status === "mfa_enroll_required" ||
    session.status === "mfa_verify_required" ||
    session.status === "reauth_required"
  ) {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      session.status === "reauth_required"
        ? "Tindakan sensitif memerlukan verifikasi ulang kode MFA."
        : "Sesi admin wajib menyelesaikan verifikasi MFA (AAL2)."
    );
  }

  if (session.mode === "supabase" && session.meta) {
    try {
      await setAdminSessionMetaCookie({
        ...session.meta,
        lastActiveAt: Date.now(),
      });
    } catch {
      // Abaikan bila dipanggil pada konteks baca
    }
  }

  return session;
}
