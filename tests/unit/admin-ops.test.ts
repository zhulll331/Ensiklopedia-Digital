import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTACT_EMAIL_PLACEHOLDER,
  DEFAULT_SITE_SETTINGS,
  auditLogsQuerySchema,
  mapAdminOpsPostgresError,
  normalizeAuditDateRange,
  privacyRequestCreateSchema,
  privacyRequestIdSchema,
  privacyRequestUpdateSchema,
  updateSiteSettingsSchema,
} from "@/modules/admin/ops-schemas";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440020";

describe("Operasional Admin: Pengaturan, Audit, Retensi, & Privasi (Fase 8)", () => {
  it("menerima enam kunci allowlist resmi pada updateSiteSettingsSchema dan menolak kunci asing", () => {
    const valid = updateSiteSettingsSchema.safeParse({
      ...DEFAULT_SITE_SETTINGS,
      contact_email: "privasi@banyuwangi.go.id",
    });
    expect(valid.success).toBe(true);

    // Placeholder bawaan juga diizinkan
    expect(
      updateSiteSettingsSchema.safeParse({
        contact_email: DEFAULT_CONTACT_EMAIL_PLACEHOLDER,
      }).success
    ).toBe(true);

    // Email rusak harus ditolak
    expect(
      updateSiteSettingsSchema.safeParse({
        contact_email: "bukan-email",
      }).success
    ).toBe(false);

    // Kunci di luar allowlist (mis. rahasia server atau sembarang key) wajib ditolak oleh .strict()
    expect(
      updateSiteSettingsSchema.safeParse({
        hero_title: "Judul Hero Baru Megalitik Banyuwangi",
        join_code_pepper: "bocor",
      }).success
    ).toBe(false);

    // Payload kosong tanpa kunci apa pun ditolak
    expect(updateSiteSettingsSchema.safeParse({}).success).toBe(false);
  });

  it("memvalidasi query filter log audit serta menormalkan rentang tanggal YYYY-MM-DD", () => {
    const valid = auditLogsQuerySchema.safeParse({
      action: "run_retention_purge",
      outcome: "success",
      actor_type: "admin",
      from: "2026-11-01",
      to: "2026-11-20",
      limit: "25",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.limit).toBe(25);
      const range = normalizeAuditDateRange(valid.data.from, valid.data.to);
      expect(range.fromIso).toBe("2026-11-01T00:00:00.000Z");
      expect(range.toIso).toBe("2026-11-20T23:59:59.999Z");
    }

    // Outcome atau actor_type di luar enum ditolak
    expect(
      auditLogsQuerySchema.safeParse({ outcome: "dropped" }).success
    ).toBe(false);
    expect(
      auditLogsQuerySchema.safeParse({ actor_type: "superuser" }).success
    ).toBe(false);
    expect(auditLogsQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it("memvalidasi pencatatan dan pembaruan Permintaan Privasi (SEC-15)", () => {
    const validCreate = privacyRequestCreateSchema.safeParse({
      school_id: VALID_UUID,
      request_type: "deletion",
      requester_channel: "  Surat resmi Kepala Sekolah  ",
      reference_code: "  SRT-PRIV-2026-011  ",
      summary_note: "Penghapusan data tugas uji coba tanpa menulis nama siswa.",
    });
    expect(validCreate.success).toBe(true);
    if (validCreate.success) {
      expect(validCreate.data.requester_channel).toBe(
        "Surat resmi Kepala Sekolah"
      );
      expect(validCreate.data.reference_code).toBe("SRT-PRIV-2026-011");
    }

    // Extra property ditolak .strict()
    expect(
      privacyRequestCreateSchema.safeParse({
        request_type: "access",
        requester_channel: "Wali Kelas",
        reference_code: "REF-001",
        student_name: "Jangan sampai lewat",
      }).success
    ).toBe(false);

    expect(
      privacyRequestUpdateSchema.safeParse({
        status: "completed",
        resolution_note: "Data percobaan sudah dihapus melalui mekanisme retensi.",
      }).success
    ).toBe(true);

    expect(
      privacyRequestUpdateSchema.safeParse({
        status: "received",
      }).success
    ).toBe(false);

    expect(privacyRequestIdSchema.safeParse(VALID_UUID).success).toBe(true);
    expect(privacyRequestIdSchema.safeParse("bukan-uuid").success).toBe(false);
  });

  it("memetakan error Postgres Fase 8 ke DomainError dengan status tepat", () => {
    const keyErr = mapAdminOpsPostgresError({
      message: "VALIDATION_FAILED:INVALID_SETTING_KEY",
    });
    expect(keyErr?.status).toBe(422);
    expect(keyErr?.code).toBe("VALIDATION_FAILED");

    const closedErr = mapAdminOpsPostgresError({
      message: "STATE_CONFLICT:PRIVACY_REQUEST_CLOSED",
    });
    expect(closedErr?.status).toBe(409);
    expect(closedErr?.code).toBe("STATE_CONFLICT");

    const deniedErr = mapAdminOpsPostgresError({
      message: "ACTION_NOT_ALLOWED",
    });
    expect(deniedErr?.status).toBe(403);
    expect(deniedErr?.code).toBe("ACTION_NOT_ALLOWED");
  });

  it("memverifikasi migrasi 0019_admin_ops_rpcs.sql mematuhi isolasi search_path, grants service_role, dan SEC-15", () => {
    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0019_admin_ops_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toMatch(/create table if not exists private\.privacy_requests/i);
    expect(sql).toMatch(
      /revoke all on table private\.privacy_requests from public, anon, authenticated, guest_api/i
    );
    expect(sql).not.toMatch(/\bdrop table\b|\btruncate table\b/i);

    const definerMatches = sql.match(/security definer/gi) ?? [];
    const searchPathMatches = sql.match(/set search_path = ''/gi) ?? [];
    const activeAdminChecks = sql.match(/private\.is_active_admin\(p_actor_id\)/gi) ?? [];
    expect(definerMatches.length).toBeGreaterThanOrEqual(8);
    expect(searchPathMatches.length).toBe(definerMatches.length);
    expect(activeAdminChecks.length).toBe(definerMatches.length);

    expect(sql).toMatch(/api\.list_admin_site_settings/i);
    expect(sql).toMatch(/api\.upsert_admin_site_settings/i);
    expect(sql).toMatch(/api\.list_admin_audit_logs/i);
    expect(sql).toMatch(/api\.get_admin_maintenance_status/i);
    expect(sql).toMatch(/api\.run_admin_retention_purge/i);
    expect(sql).toMatch(/api\.list_admin_privacy_requests/i);
    expect(sql).toMatch(/api\.create_privacy_request/i);
    expect(sql).toMatch(/api\.update_privacy_request_status/i);
    expect(sql).toMatch(/private\.run_retention_purge\(\)/i);
    expect(sql).toMatch(/private\.write_audit\(/i);

    expect(sql).toMatch(
      /grant execute on function api\.run_admin_retention_purge\(uuid, text\) to service_role/i
    );
    expect(sql).toMatch(
      /revoke all on function api\.list_admin_audit_logs\(uuid, text, text, text, timestamptz, timestamptz, integer\) from public, anon, authenticated/i
    );
  });
});
