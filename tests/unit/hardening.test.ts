import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sanitizeLogMetadata } from "@/lib/server/logger";
import {
  consumeRateLimit,
  RATE_LIMIT_POLICIES,
  resetRateLimitsForTests,
} from "@/lib/server/rate-limit";
import {
  createTeacherCsvExport,
  endGuestSession,
  getTeacherAssignmentResults,
  resetServerStoreForTests,
  runRetentionPurge,
  startGuestAttempt,
  submitGuestAttempt,
} from "@/modules/learning/server-store";

describe("Rate Limiter NAT Sekolah (AT-20 & 05_API §8)", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  it("mengizinkan 40 siswa serentak di satu IP NAT sekolah saat mulai tugas sah", () => {
    for (let i = 0; i < 40; i += 1) {
      const res = consumeRateLimit(
        "valid_start_ip:school-nat-digest",
        RATE_LIMIT_POLICIES.valid_start_ip.limit,
        RATE_LIMIT_POLICIES.valid_start_ip.windowSeconds
      );
      expect(res.allowed).toBe(true);
    }
  });

  it("membatasi percobaan kode salah beruntun setelah melewati ambang batas", () => {
    for (let i = 0; i < RATE_LIMIT_POLICIES.invalid_code.limit; i += 1) {
      expect(
        consumeRateLimit(
          "invalid_code:attacker",
          RATE_LIMIT_POLICIES.invalid_code.limit,
          RATE_LIMIT_POLICIES.invalid_code.windowSeconds
        ).allowed
      ).toBe(true);
    }

    const blocked = consumeRateLimit(
      "invalid_code:attacker",
      RATE_LIMIT_POLICIES.invalid_code.limit,
      RATE_LIMIT_POLICIES.invalid_code.windowSeconds
    );
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("Redaksi Log PII & Purge Retensi (SEC-24, AT-22)", () => {
  beforeEach(() => {
    resetServerStoreForTests();
  });

  it("menyensor nama siswa, cookie, token, dan jawaban pada metadata log", () => {
    const clean = sanitizeLogMetadata({
      request_id: "req-1",
      student_name: "Ani Rahayu",
      join_code: "EDMB34ABCD",
      cookie: "secret-cookie",
      answers: [{ question_id: "1", selected_choice_id: "2" }],
      nested: { authorization: "Bearer xyz", count: 5 },
    });

    expect(clean.student_name).toBe("[REDACTED]");
    expect(clean.join_code).toBe("[REDACTED]");
    expect(clean.cookie).toBe("[REDACTED]");
    expect(clean.answers).toBe("[REDACTED]");
    expect((clean.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
    expect((clean.nested as Record<string, unknown>).count).toBe(5);
  });

  it("menghapus sesi dicabut, ekspor kedaluwarsa, dan attempt yang mencapai purge_at", () => {
    const started = startGuestAttempt({
      join_code: "EDMB34ABCD",
      student_name: "Siswa Retensi",
      privacy_notice_version: "1.0",
    });
    submitGuestAttempt(started.rawSessionToken, "ret-key-001", {
      answers: [],
      confirm_submit: true,
    });
    endGuestSession(started.rawSessionToken);
    createTeacherCsvExport("teacher-demo-1", "asg-demo-1");

    // Purge pada waktu sekarang hanya menghapus sesi yang dicabut
    const immediate = runRetentionPurge(Date.now());
    expect(immediate.purged_sessions).toBe(1);
    expect(immediate.purged_attempts).toBe(0);

    // Purge 120 hari ke depan (>90 hari retensi + 7 hari masa tugas) menghapus attempt & ekspor
    const futureMs = Date.now() + 120 * 24 * 60 * 60 * 1000;
    const future = runRetentionPurge(futureMs);
    expect(future.purged_attempts).toBe(1);
    expect(future.purged_exports).toBe(1);

    const remaining = getTeacherAssignmentResults("teacher-demo-1", "asg-demo-1");
    expect(remaining.submissions).toHaveLength(0);
  });
});
