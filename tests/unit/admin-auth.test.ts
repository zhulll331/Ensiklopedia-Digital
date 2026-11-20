import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetServerEnvCacheForTests } from "@/lib/server/env";
import {
  ADMIN_ABSOLUTE_TIMEOUT_MS,
  ADMIN_IDLE_TIMEOUT_MS,
  ADMIN_RECENT_REAUTH_MS,
  decodeJwtPayloadUnsafe,
  detectClockSkewSeconds,
  evaluateAdminSessionTiming,
  extractLatestMfaTimestampMs,
  extractVerifiedTotpFactors,
  isRetryableSupabaseAuthError,
  signAdminSessionMeta,
  verifyAdminSessionMeta,
} from "@/modules/admin/auth";

describe("Fondasi Akses & Sesi Admin (SEC-02, SEC-03, SEC-05)", () => {
  const originalPepper = process.env.JOIN_CODE_PEPPER;

  afterEach(() => {
    process.env.JOIN_CODE_PEPPER = originalPepper;
    resetServerEnvCacheForTests();
  });

  it("menandatangani dan memverifikasi token metadata sesi admin serta menolak manipulasi", () => {
    process.env.JOIN_CODE_PEPPER = "test-pepper-minimum-16-bytes-long";
    resetServerEnvCacheForTests();

    const meta = {
      uid: "11111111-1111-4111-8111-111111111111",
      issuedAt: 1_700_000_000_000,
      lastActiveAt: 1_700_000_100_000,
      mfaVerifiedAt: 1_700_000_050_000,
    };

    const signed = signAdminSessionMeta(meta);
    expect(verifyAdminSessionMeta(signed, meta.uid)).toEqual(meta);
    expect(verifyAdminSessionMeta(signed, "other-uid")).toBeNull();
    expect(verifyAdminSessionMeta(`${signed}tamper`, meta.uid)).toBeNull();
    expect(verifyAdminSessionMeta("invalid", meta.uid)).toBeNull();
  });

  it("menegakkan batas idle 30 menit, umur absolut 8 jam, dan reauth 10 menit", () => {
    const issuedAt = 1_000_000_000;
    const baseMeta = {
      uid: "admin-1",
      issuedAt,
      lastActiveAt: issuedAt,
      mfaVerifiedAt: issuedAt,
    };

    // Masih sah dalam 10 menit pertama
    expect(
      evaluateAdminSessionTiming(baseMeta, issuedAt + 5 * 60 * 1000, {
        requireRecentReauth: true,
      })
    ).toEqual({ ok: true });

    // > 10 menit tetapi < 30 menit: baca sah, aksi sensitif butuh reauth
    const atTwentyMin = issuedAt + ADMIN_RECENT_REAUTH_MS + 60_000;
    expect(evaluateAdminSessionTiming(baseMeta, atTwentyMin)).toEqual({
      ok: true,
    });
    expect(
      evaluateAdminSessionTiming(baseMeta, atTwentyMin, {
        requireRecentReauth: true,
      })
    ).toEqual({ ok: false, reason: "reauth_required" });

    // Melebihi idle 30 menit
    expect(
      evaluateAdminSessionTiming(
        baseMeta,
        issuedAt + ADMIN_IDLE_TIMEOUT_MS + 1000
      )
    ).toEqual({ ok: false, reason: "idle_expired" });

    // Aktivitas terbaru tetap ditolak bila melewati umur absolut 8 jam
    const activeLateMeta = {
      uid: "admin-1",
      issuedAt,
      lastActiveAt: issuedAt + ADMIN_ABSOLUTE_TIMEOUT_MS,
      mfaVerifiedAt: issuedAt + ADMIN_ABSOLUTE_TIMEOUT_MS,
    };
    expect(
      evaluateAdminSessionTiming(
        activeLateMeta,
        issuedAt + ADMIN_ABSOLUTE_TIMEOUT_MS + 1000
      )
    ).toEqual({ ok: false, reason: "absolute_expired" });
  });

  it("mengekstrak timestamp MFA terbaru dari AMREntry Supabase", () => {
    expect(
      extractLatestMfaTimestampMs([
        { method: "password", timestamp: 1_700_000_000 },
        { method: "totp", timestamp: 1_700_000_120 },
        { method: "mfa/totp", timestamp: 1_700_000_250 },
      ])
    ).toBe(1_700_000_250_000);

    expect(extractLatestMfaTimestampMs(["password"])).toBeNull();
    expect(extractLatestMfaTimestampMs(undefined)).toBeNull();
  });

  it("mengekstrak hanya faktor TOTP terverifikasi dari objek user.factors", () => {
    const factors = [
      { id: "totp-verified-1", factor_type: "totp", status: "verified" },
      { id: "totp-unverified", factor_type: "totp", status: "unverified" },
      { id: "phone-verified", factor_type: "phone", status: "verified" },
      { id: "", factor_type: "totp", status: "verified" },
      null,
    ];

    expect(extractVerifiedTotpFactors(factors)).toEqual([
      { id: "totp-verified-1" },
    ]);
    expect(extractVerifiedTotpFactors(undefined)).toEqual([]);
  });

  it("mendekode klaim payload JWT base64url secara aman dan menolak token rusak", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin-1", aal: "aal2", exp: 1_900_000_000 }),
      "utf8"
    ).toString("base64url");
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;

    expect(decodeJwtPayloadUnsafe(fakeJwt)).toEqual({
      sub: "admin-1",
      aal: "aal2",
      exp: 1_900_000_000,
    });
    expect(decodeJwtPayloadUnsafe("not-a-jwt")).toBeNull();
    expect(decodeJwtPayloadUnsafe("a.!!!.c")).toBeNull();
    expect(
      decodeJwtPayloadUnsafe(
        `a.${Buffer.from("[1,2,3]", "utf8").toString("base64url")}.c`
      )
    ).toBeNull();
  });

  it("mengidentifikasi error jaringan/5xx Supabase Auth yang aman di-retry", () => {
    expect(
      isRetryableSupabaseAuthError({
        name: "AuthRetryableFetchError",
        status: 0,
      })
    ).toBe(true);
    expect(isRetryableSupabaseAuthError({ status: 502 })).toBe(true);
    expect(isRetryableSupabaseAuthError({ status: 503 })).toBe(true);
    expect(
      isRetryableSupabaseAuthError({ name: "AuthApiError", status: 401 })
    ).toBe(false);
    expect(isRetryableSupabaseAuthError({ status: 400 })).toBe(false);
    expect(isRetryableSupabaseAuthError(null)).toBe(false);
  });

  it("mendeteksi selisih jam lokal terhadap server Supabase di atas 5 menit", () => {
    const serverNowSec = 1_780_000_000;
    const expiresInSec = 3600;
    const expiresAtSec = serverNowSec + expiresInSec;

    // Sinkron dalam 60 detik -> null
    expect(
      detectClockSkewSeconds(
        expiresAtSec,
        expiresInSec,
        (serverNowSec + 60) * 1000
      )
    ).toBeNull();

    // Jam lokal lebih cepat 2 jam (+7200 detik)
    expect(
      detectClockSkewSeconds(
        expiresAtSec,
        expiresInSec,
        (serverNowSec + 7200) * 1000
      )
    ).toBe(7200);

    // Jam lokal lebih lambat 15 menit (-900 detik)
    expect(
      detectClockSkewSeconds(
        expiresAtSec,
        expiresInSec,
        (serverNowSec - 900) * 1000
      )
    ).toBe(-900);

    expect(detectClockSkewSeconds(undefined, expiresInSec)).toBeNull();
  });
});
