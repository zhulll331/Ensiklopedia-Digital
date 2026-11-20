import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSupportRemainingSeconds,
  createSupportAccessSchema,
  enrichSupportAttempts,
  formatCountdownMmSs,
  mapAdminSupportPostgresError,
} from "@/modules/admin/support-schemas";

const VALID_ASSIGNMENT_ID = "550e8400-e29b-41d4-a716-446655440010";

describe("Mode Dukungan Data Siswa Admin (Fase 7 • SEC-25)", () => {
  it("memvalidasi createSupportAccessSchema (durasi <= 30 menit, alasan >= 5, dan .strict())", () => {
    const valid = createSupportAccessSchema.safeParse({
      assignment_id: VALID_ASSIGNMENT_ID,
      reason: "  Guru melaporkan siswa gagal melihat konfirmasi pengiriman  ",
      duration_minutes: 15,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.reason).toBe(
        "Guru melaporkan siswa gagal melihat konfirmasi pengiriman"
      );
    }

    // Alasan terlalu singkat (< 5 karakter)
    expect(
      createSupportAccessSchema.safeParse({
        assignment_id: VALID_ASSIGNMENT_ID,
        reason: "cek",
        duration_minutes: 10,
      }).success
    ).toBe(false);

    // Durasi > 30 menit atau < 5 menit harus ditolak (kontrak 05_API / SEC-25)
    expect(
      createSupportAccessSchema.safeParse({
        assignment_id: VALID_ASSIGNMENT_ID,
        reason: "Pengecekan teknis tugas",
        duration_minutes: 31,
      }).success
    ).toBe(false);

    expect(
      createSupportAccessSchema.safeParse({
        assignment_id: VALID_ASSIGNMENT_ID,
        reason: "Pengecekan teknis tugas",
        duration_minutes: 4,
      }).success
    ).toBe(false);

    // Unknown field ditolak oleh .strict()
    expect(
      createSupportAccessSchema.safeParse({
        assignment_id: VALID_ASSIGNMENT_ID,
        reason: "Pengecekan teknis tugas",
        duration_minutes: 15,
        admin_id: "override-actor",
      }).success
    ).toBe(false);
  });

  it("menghitung hitung mundur MM:SS serta menandai nama ganda tanpa menggabungkan kiriman", () => {
    const nowMs = Date.parse("2026-11-20T09:00:00Z");
    const expiresIn12m05s = "2026-11-20T09:12:05Z";

    expect(computeSupportRemainingSeconds(expiresIn12m05s, null, nowMs)).toBe(725);
    expect(formatCountdownMmSs(725)).toBe("12:05");
    expect(formatCountdownMmSs(0)).toBe("00:00");
    expect(
      computeSupportRemainingSeconds(
        expiresIn12m05s,
        "2026-11-20T09:01:00Z",
        nowMs
      )
    ).toBe(0);

    const enriched = enrichSupportAttempts([
      {
        attempt_id: "att-1",
        student_name: "Ani Rahayu",
        corrected_name: null,
        state: "submitted",
        score: 80,
        correct_count: 4,
        question_count: 5,
        started_at: "2026-11-20T08:00:00Z",
        submitted_at: "2026-11-20T08:10:00Z",
        receipt_code: "EDMB-01",
        purge_at: "2027-02-20T00:00:00Z",
        verification_status: "verified",
        annotations_count: 1,
      },
      {
        attempt_id: "att-2",
        student_name: "Ani",
        corrected_name: "  ani   rahayu ",
        state: "submitted",
        score: 100,
        correct_count: 5,
        question_count: 5,
        started_at: "2026-11-20T08:02:00Z",
        submitted_at: "2026-11-20T08:12:00Z",
        receipt_code: "EDMB-02",
        purge_at: "2027-02-20T00:00:00Z",
        verification_status: "unverified",
        annotations_count: 0,
      },
      {
        attempt_id: "att-3",
        student_name: "Budi",
        corrected_name: null,
        state: "in_progress",
        score: null,
        correct_count: null,
        question_count: null,
        started_at: "2026-11-20T08:15:00Z",
        submitted_at: null,
        receipt_code: null,
        purge_at: "2027-02-20T00:00:00Z",
        verification_status: "unverified",
        annotations_count: 0,
      },
    ]);

    expect(enriched).toHaveLength(3);
    expect(enriched[0]?.display_name).toBe("Ani Rahayu");
    expect(enriched[0]?.duplicate_name).toBe(true);
    expect(enriched[1]?.display_name).toBe("ani   rahayu");
    expect(enriched[1]?.duplicate_name).toBe(true);
    expect(enriched[2]?.duplicate_name).toBe(false);
  });

  it("memetakan error SQL 0018 dan mengaudit keamanan migrasi 0018_admin_support_rpcs.sql", () => {
    expect(
      mapAdminSupportPostgresError({
        message: "ACTION_NOT_ALLOWED:SUPPORT_OWNER_MISMATCH",
      })?.status
    ).toBe(403);
    expect(
      mapAdminSupportPostgresError({
        message: "STATE_CONFLICT:ACTIVE_SUPPORT_SESSION_EXISTS",
      })?.status
    ).toBe(409);
    expect(
      mapAdminSupportPostgresError({
        message: "STATE_CONFLICT:SUPPORT_REVOKED",
      })?.status
    ).toBe(409);
    expect(
      mapAdminSupportPostgresError({
        message: "SESSION_EXPIRED:SUPPORT_EXPIRED",
      })?.status
    ).toBe(401);
    expect(
      mapAdminSupportPostgresError({
        message: "VALIDATION_FAILED:INVALID_DURATION",
      })?.status
    ).toBe(422);

    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0018_admin_support_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    const requiredFunctions = [
      "api.list_admin_support_overview",
      "api.create_support_access",
      "api.read_support_access_results",
      "api.revoke_support_access",
    ];
    for (const fn of requiredFunctions) {
      expect(sql).toContain(fn);
    }

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("v_grant.admin_id <> p_actor_id");
    expect(sql).toContain("private.write_audit");
    expect(sql).toContain("support_access_granted");
    expect(sql).toContain("support_access_read_results");
    expect(sql).toContain("support_access_revoked");
    // Pastikan migrasi tidak pernah membuka SELECT langsung pada app.attempts untuk admin
    expect(sql.toLowerCase()).not.toContain("create policy");
    expect(sql.toLowerCase()).not.toContain("grant select on app.attempts");
  });
});
