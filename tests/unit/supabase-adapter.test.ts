import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  resetServerEnvCacheForTests,
} from "@/lib/server/env";
import { DomainError, mapPostgresErrorToDomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

describe("Adapter Supabase: pemetaan error RPC & deteksi konfigurasi", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalPubKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalAdminSecret = process.env.SUPABASE_ADMIN_SECRET;

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_PUBLISHABLE_KEY = originalPubKey;
    process.env.SUPABASE_ADMIN_SECRET = originalAdminSecret;
    resetServerEnvCacheForTests();
  });

  it("memetakan token error Postgres RPC menjadi DomainError dengan status HTTP tepat", () => {
    const cases: Array<{ message: string; expectedStatus: number; expectedCode: string }> = [
      { message: "RESOURCE_NOT_FOUND", expectedStatus: 404, expectedCode: "RESOURCE_NOT_FOUND" },
      { message: "TASK_UNAVAILABLE", expectedStatus: 410, expectedCode: "TASK_UNAVAILABLE" },
      { message: "ACTION_NOT_ALLOWED", expectedStatus: 403, expectedCode: "ACTION_NOT_ALLOWED" },
      { message: "REVISION_CONFLICT", expectedStatus: 409, expectedCode: "REVISION_CONFLICT" },
      { message: "IDEMPOTENCY_CONFLICT", expectedStatus: 409, expectedCode: "IDEMPOTENCY_CONFLICT" },
      { message: "STATE_CONFLICT", expectedStatus: 409, expectedCode: "STATE_CONFLICT" },
      { message: "SESSION_EXPIRED", expectedStatus: 401, expectedCode: "SESSION_EXPIRED" },
      { message: "ATTEMPT_EXPIRED", expectedStatus: 410, expectedCode: "ATTEMPT_EXPIRED" },
      { message: "VALIDATION_FAILED", expectedStatus: 422, expectedCode: "VALIDATION_FAILED" },
      {
        message: "VALIDATION_FAILED:SOURCE_REQUIRED",
        expectedStatus: 422,
        expectedCode: "VALIDATION_FAILED",
      },
      { message: "INVALID_REQUEST", expectedStatus: 400, expectedCode: "INVALID_REQUEST" },
    ];

    for (const c of cases) {
      const mapped = mapPostgresErrorToDomainError({ message: c.message });
      expect(mapped).toBeInstanceOf(DomainError);
      expect(mapped?.status).toBe(c.expectedStatus);
      expect(mapped?.code).toBe(c.expectedCode);
    }

    expect(mapPostgresErrorToDomainError({ message: "deadlock detected" })).toBeNull();
  });

  it("mendeteksi error schema/tabel belum siap dengan benar", () => {
    expect(isSupabaseSchemaNotReadyError({ code: "PGRST106", message: "Invalid schema: app" })).toBe(true);
    expect(isSupabaseSchemaNotReadyError({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isSupabaseSchemaNotReadyError({ code: "3F000", message: "schema app does not exist" })).toBe(true);
    expect(
      isSupabaseSchemaNotReadyError({ message: "Could not find the function api.check_practice_quiz" })
    ).toBe(true);
    expect(isSupabaseSchemaNotReadyError({ message: "RESOURCE_NOT_FOUND" })).toBe(false);
    expect(isSupabaseSchemaNotReadyError(null)).toBe(false);
  });

  it("mendeteksi status konfigurasi Supabase dan admin secret secara akurat", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ADMIN_SECRET;
    resetServerEnvCacheForTests();
    expect(isSupabaseConfigured()).toBe(false);
    expect(isSupabaseAdminConfigured()).toBe(false);

    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    resetServerEnvCacheForTests();
    expect(isSupabaseConfigured()).toBe(true);
    expect(isSupabaseAdminConfigured()).toBe(false);

    process.env.SUPABASE_ADMIN_SECRET = "sb_secret_test";
    resetServerEnvCacheForTests();
    expect(isSupabaseAdminConfigured()).toBe(true);
  });
});
