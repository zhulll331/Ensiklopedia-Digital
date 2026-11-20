import { z } from "zod";
import {
  DomainError,
  mapPostgresErrorToDomainError,
} from "@/modules/learning/errors";

export const SITE_SETTING_KEYS = [
  "hero_title",
  "hero_subtitle",
  "hero_slogan",
  "contact_email",
  "contact_org_name",
  "privacy_notice_summary",
] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export type PublicSiteSettingsValues = Record<SiteSettingKey, string>;

export const DEFAULT_CONTACT_EMAIL_PLACEHOLDER =
  "[Email Kontak Privasi — belum diisi]";
export const DEFAULT_CONTACT_ORG_PLACEHOLDER =
  "[Nama Pengelola Resmi — belum diisi]";

export const DEFAULT_SITE_SETTINGS: PublicSiteSettingsValues = {
  hero_title: "Menjelajah Jejak Megalitik Banyuwangi",
  hero_subtitle:
    "Pelajari warisan batu leluhur di Banyuwangi melalui bacaan ramah anak untuk kelas III dan IV SD, peta wilayah umum yang aman, dan kuis pendampingan guru.",
  hero_slogan: "Kenali, Jaga, Lestarikan",
  contact_org_name: DEFAULT_CONTACT_ORG_PLACEHOLDER,
  contact_email: DEFAULT_CONTACT_EMAIL_PLACEHOLDER,
  privacy_notice_summary:
    "Siswa mengerjakan kuis tanpa akun atau kata sandi. Nama siswa pada tugas guru hanya dipakai untuk rekap privat guru pemilik tugas dan dihapus otomatis sesuai masa retensi 90 hari setelah tugas ditutup.",
};

export interface SiteSettingFieldMeta {
  key: SiteSettingKey;
  group: "hero" | "privacy";
  label: string;
  helpText: string;
  maxLength: number;
  multiline: boolean;
}

export const SITE_SETTING_FIELDS: ReadonlyArray<SiteSettingFieldMeta> = [
  {
    key: "hero_title",
    group: "hero",
    label: "Judul Utama Hero",
    helpText: "Ditampilkan pada tajuk utama beranda dan pengaturan publik (10–120 karakter).",
    maxLength: 120,
    multiline: false,
  },
  {
    key: "hero_subtitle",
    group: "hero",
    label: "Subjudul Pengantar Hero",
    helpText: "Penjelasan singkat sasaran kelas III–IV SD pada beranda (15–320 karakter).",
    maxLength: 320,
    multiline: true,
  },
  {
    key: "hero_slogan",
    group: "hero",
    label: "Slogan Kampanye",
    helpText: "Kalimat slogan pendek di bagian bawah hero beranda (3–80 karakter).",
    maxLength: 80,
    multiline: false,
  },
  {
    key: "contact_org_name",
    group: "privacy",
    label: "Nama Pengelola Resmi",
    helpText: "Instansi/pengelola resmi yang tercantum di halaman Tentang & Privasi (3–120 karakter).",
    maxLength: 120,
    multiline: false,
  },
  {
    key: "contact_email",
    group: "privacy",
    label: "Email Kontak Privasi",
    helpText: "Email resmi untuk permintaan akses, koreksi, atau penghapusan data anak (contoh: privasi@instansi.go.id).",
    maxLength: 120,
    multiline: false,
  },
  {
    key: "privacy_notice_summary",
    group: "privacy",
    label: "Ringkasan Pemberitahuan Privasi",
    helpText: "Pemberitahuan publik singkat tentang retensi & perlindungan data siswa (20–500 karakter).",
    maxLength: 500,
    multiline: true,
  },
];

const emailOrPlaceholderSchema = z
  .string()
  .trim()
  .max(120, "Email kontak privasi maksimal 120 karakter.")
  .refine(
    (value) =>
      value === DEFAULT_CONTACT_EMAIL_PLACEHOLDER ||
      z.string().email().safeParse(value).success,
    "Masukkan alamat email kontak privasi yang valid (misalnya privasi@sekolah.sch.id)."
  );

export const updateSiteSettingsSchema = z
  .object({
    hero_title: z
      .string()
      .trim()
      .min(10, "Judul hero minimal 10 karakter.")
      .max(120, "Judul hero maksimal 120 karakter.")
      .optional(),
    hero_subtitle: z
      .string()
      .trim()
      .min(15, "Subjudul hero minimal 15 karakter.")
      .max(320, "Subjudul hero maksimal 320 karakter.")
      .optional(),
    hero_slogan: z
      .string()
      .trim()
      .min(3, "Slogan hero minimal 3 karakter.")
      .max(80, "Slogan hero maksimal 80 karakter.")
      .optional(),
    contact_org_name: z
      .string()
      .trim()
      .min(3, "Nama pengelola resmi minimal 3 karakter.")
      .max(120, "Nama pengelola resmi maksimal 120 karakter.")
      .optional(),
    contact_email: emailOrPlaceholderSchema.optional(),
    privacy_notice_summary: z
      .string()
      .trim()
      .min(20, "Ringkasan pemberitahuan privasi minimal 20 karakter.")
      .max(500, "Ringkasan pemberitahuan privasi maksimal 500 karakter.")
      .optional(),
  })
  .strict()
  .refine(
    (data) => Object.values(data).some((v) => typeof v === "string"),
    "Pilih minimal satu bidang pengaturan allowlist untuk disimpan."
  );

export const AUDIT_OUTCOMES = ["success", "denied", "error"] as const;
export const AUDIT_ACTOR_TYPES = ["admin", "teacher", "guest", "system"] as const;

const safeDateInputSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      if (!value) return true;
      return !Number.isNaN(Date.parse(value));
    },
    "Format tanggal filter audit tidak valid."
  );

export const auditLogsQuerySchema = z
  .object({
    action: z
      .string()
      .trim()
      .regex(/^[a-z0-9_.-]{0,80}$/, "Filter aksi tidak valid.")
      .optional()
      .default(""),
    outcome: z.enum(["", ...AUDIT_OUTCOMES]).optional().default(""),
    actor_type: z.enum(["", ...AUDIT_ACTOR_TYPES]).optional().default(""),
    from: safeDateInputSchema.optional().default(""),
    to: safeDateInputSchema.optional().default(""),
    limit: z.coerce
      .number()
      .int("Batas baris audit harus bilangan bulat.")
      .min(1, "Batas baris minimal 1.")
      .max(100, "Batas baris maksimal 100.")
      .optional()
      .default(50),
  })
  .strict();

export function normalizeAuditDateRange(
  fromRaw: string,
  toRaw: string
): { fromIso: string | null; toIso: string | null } {
  const fromTrim = fromRaw.trim();
  const toTrim = toRaw.trim();

  let fromIso: string | null = null;
  if (fromTrim) {
    fromIso = /^\d{4}-\d{2}-\d{2}$/.test(fromTrim)
      ? `${fromTrim}T00:00:00.000Z`
      : new Date(fromTrim).toISOString();
  }

  let toIso: string | null = null;
  if (toTrim) {
    toIso = /^\d{4}-\d{2}-\d{2}$/.test(toTrim)
      ? `${toTrim}T23:59:59.999Z`
      : new Date(toTrim).toISOString();
  }

  return { fromIso, toIso };
}

export const PRIVACY_REQUEST_TYPES = [
  "access",
  "correction",
  "deletion",
] as const;

export const PRIVACY_REQUEST_STATUSES = [
  "received",
  "verified",
  "completed",
  "rejected",
] as const;

export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export const privacyRequestCreateSchema = z
  .object({
    school_id: z
      .string()
      .uuid("ID sekolah target tidak valid.")
      .nullable()
      .optional()
      .default(null),
    request_type: z.enum(PRIVACY_REQUEST_TYPES, {
      error: "Pilih jenis permintaan privasi: akses, koreksi, atau penghapusan.",
    }),
    requester_channel: z
      .string()
      .trim()
      .min(2, "Kanal pemohon minimal 2 karakter.")
      .max(120, "Kanal pemohon maksimal 120 karakter."),
    reference_code: z
      .string()
      .trim()
      .min(2, "Kode referensi surat/tiket minimal 2 karakter.")
      .max(80, "Kode referensi surat/tiket maksimal 80 karakter."),
    summary_note: z
      .string()
      .trim()
      .max(400, "Catatan ringkas maksimal 400 karakter.")
      .optional()
      .default(""),
  })
  .strict();

export const privacyRequestUpdateSchema = z
  .object({
    status: z.enum(["verified", "completed", "rejected"], {
      error: "Status target harus verified, completed, atau rejected.",
    }),
    resolution_note: z
      .string()
      .trim()
      .max(400, "Catatan tindak lanjut maksimal 400 karakter.")
      .optional()
      .default(""),
  })
  .strict();

export const privacyRequestIdSchema = z
  .string()
  .uuid("ID permintaan privasi tidak valid.");

const OPS_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "VALIDATION_FAILED:INVALID_SETTING_KEY",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Kunci pengaturan tidak termasuk daftar allowlist resmi EDMB.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_SETTING_VALUE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Nilai pengaturan harus berupa teks yang valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_OUTCOME",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Filter status hasil audit tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_ACTOR_TYPE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Filter tipe aktor audit tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_REQUEST_TYPE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Jenis permintaan privasi tidak valid.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_STATUS",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Status permintaan privasi tidak valid.",
  },
  {
    token: "STATE_CONFLICT:PRIVACY_REQUEST_CLOSED",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Permintaan privasi yang sudah selesai atau ditolak tidak dapat diubah kembali.",
  },
];

export function mapAdminOpsPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of OPS_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  return mapPostgresErrorToDomainError(error);
}
