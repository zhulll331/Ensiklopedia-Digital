import { z } from "zod";
import {
  DomainError,
  mapPostgresErrorToDomainError,
} from "@/modules/learning/errors";

export const TEACHER_STATUSES = ["invited", "active", "suspended"] as const;
export type TeacherAccountStatus = (typeof TEACHER_STATUSES)[number];

export const TEACHER_STATUS_LABELS: Record<TeacherAccountStatus, string> = {
  invited: "Diundang",
  active: "Aktif",
  suspended: "Disuspensi",
};

export const SCHOOL_STATUSES = ["active", "archived"] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number];

export const SCHOOL_STATUS_LABELS: Record<SchoolStatus, string> = {
  active: "Aktif",
  archived: "Diarsipkan",
};

export const TEACHER_SCHOOL_LINK_STATUSES = ["active", "inactive"] as const;
export type TeacherSchoolLinkStatus =
  (typeof TEACHER_SCHOOL_LINK_STATUSES)[number];

export const adminTeachersQuerySchema = z.object({
  status: z.enum(TEACHER_STATUSES).optional(),
  school_id: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
});

export const adminSchoolsQuerySchema = z.object({
  status: z.enum(SCHOOL_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Skema undang guru (.strict() tanpa field `role`: peran admin tidak pernah bisa diberikan dari form ini).
 */
export const inviteTeacherSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email("Masukkan alamat email yang sah.")
      .max(160, "Alamat email maksimal 160 karakter.")
      .transform((val) => val.toLowerCase()),
    display_name: z
      .string()
      .trim()
      .min(2, "Nama tampilan guru minimal 2 karakter.")
      .max(80, "Nama tampilan guru maksimal 80 karakter."),
    school_ids: z
      .array(z.string().uuid("ID sekolah tidak valid."))
      .max(10, "Maksimal 10 sekolah awal per guru.")
      .default([]),
  })
  .strict();

export const updateTeacherSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(2, "Nama tampilan guru minimal 2 karakter.")
      .max(80, "Nama tampilan guru maksimal 80 karakter."),
  })
  .strict();

export const setTeacherStatusSchema = z
  .object({
    status: z.enum(["active", "suspended"]),
    reason: z
      .string()
      .trim()
      .max(300, "Alasan maksimal 300 karakter.")
      .optional()
      .nullable(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === "suspended" && (!val.reason || val.reason.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "Alasan suspensi minimal 5 karakter wajib diisi.",
      });
    }
  });

export const setTeacherSchoolLinkSchema = z
  .object({
    school_id: z.string().uuid("ID sekolah wajib valid."),
    status: z.enum(TEACHER_SCHOOL_LINK_STATUSES),
  })
  .strict();

export const createSchoolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nama sekolah minimal 2 karakter.")
      .max(120, "Nama sekolah maksimal 120 karakter."),
    district_label: z
      .string()
      .trim()
      .min(2, "Wilayah / kecamatan sekolah minimal 2 karakter.")
      .max(80, "Wilayah / kecamatan maksimal 80 karakter."),
  })
  .strict();

export const updateSchoolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nama sekolah minimal 2 karakter.")
      .max(120, "Nama sekolah maksimal 120 karakter."),
    district_label: z
      .string()
      .trim()
      .min(2, "Wilayah / kecamatan sekolah minimal 2 karakter.")
      .max(80, "Wilayah / kecamatan maksimal 80 karakter."),
    status: z.enum(SCHOOL_STATUSES),
  })
  .strict();

const PEOPLE_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "ACTION_NOT_ALLOWED:ADMIN_ACCOUNT_PROTECTED",
    status: 403,
    code: "ACTION_NOT_ALLOWED",
    message:
      "Akun admin tidak dapat diubah atau diberi peran admin melalui form Guru & Sekolah (05_API).",
  },
  {
    token: "VALIDATION_FAILED:SCHOOL_EXISTS",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Sekolah dengan nama dan wilayah tersebut sudah terdaftar.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SCHOOL_NAME",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Nama sekolah wajib diisi (2–120 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_DISTRICT",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Wilayah/kecamatan wajib diisi (2–80 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SCHOOL_STATUS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Status sekolah hanya boleh 'active' atau 'archived'.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SCHOOL",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Sekolah yang dipilih tidak ditemukan atau tidak aktif.",
  },
  {
    token: "VALIDATION_FAILED:SCHOOL_ARCHIVED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Tidak dapat mengaktifkan tautan ke sekolah yang sudah diarsipkan.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_DISPLAY_NAME",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Nama tampilan guru wajib diisi (2–80 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_TEACHER_STATUS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Status guru tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_LINK_STATUS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Status tautan guru–sekolah tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:REASON_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Alasan suspensi minimal 5 karakter wajib diisi.",
  },
];

export function mapAdminPeoplePostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of PEOPLE_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  return mapPostgresErrorToDomainError(error);
}
