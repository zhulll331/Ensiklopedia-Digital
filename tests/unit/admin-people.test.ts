import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSchoolSchema,
  inviteTeacherSchema,
  mapAdminPeoplePostgresError,
  setTeacherSchoolLinkSchema,
  setTeacherStatusSchema,
  updateSchoolSchema,
  updateTeacherSchema,
} from "@/modules/admin/people-schemas";

const VALID_SCHOOL_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("Manajemen Guru & Sekolah Admin (Fase 6)", () => {
  it("memvalidasi inviteTeacherSchema dan menolak pemberian field role/admin (05_API)", () => {
    const valid = inviteTeacherSchema.safeParse({
      email: "  Guru.Baru@SDN1Kemiren.sch.id ",
      display_name: "Ibu Ratna",
      school_ids: [VALID_SCHOOL_ID],
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe("guru.baru@sdn1kemiren.sch.id");
    }

    // Field asing seperti role: 'admin' wajib ditolak oleh .strict()
    const roleInjection = inviteTeacherSchema.safeParse({
      email: "guru@sdn1kemiren.sch.id",
      display_name: "Guru Uji",
      role: "admin",
    });
    expect(roleInjection.success).toBe(false);

    const updateRoleInjection = updateTeacherSchema.safeParse({
      display_name: "Guru Uji",
      role: "admin",
    });
    expect(updateRoleInjection.success).toBe(false);

    expect(
      inviteTeacherSchema.safeParse({
        email: "bukan-email",
        display_name: "Ibu Ratna",
      }).success
    ).toBe(false);
  });

  it("memvalidasi setTeacherStatusSchema, tautan sekolah, dan skema sekolah", () => {
    expect(
      setTeacherStatusSchema.safeParse({
        status: "suspended",
        reason: "ok",
      }).success
    ).toBe(false);

    expect(
      setTeacherStatusSchema.safeParse({
        status: "suspended",
        reason: "Guru sudah pindah tugas ke luar daerah.",
      }).success
    ).toBe(true);

    expect(
      setTeacherStatusSchema.safeParse({
        status: "active",
      }).success
    ).toBe(true);

    expect(
      setTeacherSchoolLinkSchema.safeParse({
        school_id: VALID_SCHOOL_ID,
        status: "inactive",
      }).success
    ).toBe(true);

    expect(
      createSchoolSchema.safeParse({
        name: "SDN 1 Kemiren",
        district_label: "Kec. Glagah, Banyuwangi",
      }).success
    ).toBe(true);

    expect(
      updateSchoolSchema.safeParse({
        name: "SDN 1 Kemiren",
        district_label: "Kec. Glagah, Banyuwangi",
        status: "archived",
      }).success
    ).toBe(true);
  });

  it("memetakan error SQL 0017 dan menjaga keutuhan proteksi akun admin serta FK kelas", () => {
    expect(
      mapAdminPeoplePostgresError({
        message: "ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED",
      })?.status
    ).toBe(403);
    expect(
      mapAdminPeoplePostgresError({
        message: "VALIDATION_FAILED:SCHOOL_EXISTS",
      })?.status
    ).toBe(409);
    expect(
      mapAdminPeoplePostgresError({
        message: "VALIDATION_FAILED:SCHOOL_ARCHIVED",
      })?.status
    ).toBe(422);

    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0017_admin_people_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    const requiredFunctions = [
      "api.create_school",
      "api.update_school",
      "api.register_teacher_profile",
      "api.update_teacher_profile",
      "api.set_teacher_status",
      "api.set_teacher_school_link",
      "api.activate_invited_teacher_self",
    ];
    for (const fn of requiredFunctions) {
      expect(sql).toContain(fn);
    }

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED");
    // Pastikan tautan guru-sekolah dan sekolah tidak pernah memakai DELETE yang mematahkan FK app.classes
    expect(sql.toLowerCase()).not.toContain("delete from app.teacher_schools");
    expect(sql.toLowerCase()).not.toContain("delete from app.schools");
  });
});
