import { z } from "zod";
import { mapAdminCmsPostgresError } from "@/modules/admin/cms-schemas";
import { DomainError } from "@/modules/learning/errors";

export interface BanyuwangiAreaPreset {
  id: string;
  area_label: string;
  display_lat: number;
  display_lon: number;
  display_zoom_max: number;
  precision_label: string;
}

export const BANYUWANGI_AREA_PRESETS: readonly BanyuwangiAreaPreset[] = [
  {
    id: "barat",
    area_label: "Wilayah Barat Banyuwangi (Perkiraan Kecamatan)",
    display_lat: -8.22,
    display_lon: 114.21,
    display_zoom_max: 11,
    precision_label: "Perkiraan wilayah umum",
  },
  {
    id: "tengah",
    area_label: "Wilayah Tengah Banyuwangi (Perkiraan Kecamatan)",
    display_lat: -8.28,
    display_lon: 114.31,
    display_zoom_max: 11,
    precision_label: "Perkiraan wilayah umum",
  },
  {
    id: "selatan",
    area_label: "Wilayah Selatan Banyuwangi (Perkiraan Kecamatan)",
    display_lat: -8.42,
    display_lon: 114.27,
    display_zoom_max: 11,
    precision_label: "Perkiraan wilayah umum",
  },
  {
    id: "utara",
    area_label: "Wilayah Utara Banyuwangi (Perkiraan Kecamatan)",
    display_lat: -8.08,
    display_lon: 114.38,
    display_zoom_max: 11,
    precision_label: "Perkiraan wilayah umum",
  },
  {
    id: "timur",
    area_label: "Wilayah Timur & Pesisir Banyuwangi (Perkiraan Kecamatan)",
    display_lat: -8.24,
    display_lon: 114.37,
    display_zoom_max: 11,
    precision_label: "Perkiraan wilayah umum",
  },
] as const;

export function roundCoarseCoordinate(val: number): number {
  const rounded = Math.round(val * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export function hasAtMostTwoDecimals(val: number): boolean {
  if (!Number.isFinite(val)) return false;
  return Math.abs(val - roundCoarseCoordinate(val)) <= 1e-6;
}

export function hasAtMostTwoDecimalDigitsString(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  return /^-?\d+(?:\.\d{1,2})?$/.test(trimmed);
}

export function isWithinBanyuwangiRoughBounds(
  lat: number,
  lon: number
): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -8.8 &&
    lat <= -7.8 &&
    lon >= 113.8 &&
    lon <= 114.7
  );
}

/**
 * Proyeksi koordinat wilayah umum ke kanvas SVG skematis Banyuwangi (600x380) tanpa pin presisi.
 * Dipakai bersama oleh tampilan publik `/jelajah-situs` dan pratinjau admin `/admin/situs`.
 */
export function projectBanyuwangiSchematic(
  lat: number,
  lon: number
): { x: number; y: number } {
  const minLon = 113.95;
  const maxLon = 114.65;
  const minLat = -8.65;
  const maxLat = -7.95;
  const x = Math.min(
    540,
    Math.max(60, ((lon - minLon) / (maxLon - minLon)) * 520 + 40)
  );
  const y = Math.min(
    340,
    Math.max(50, ((maxLat - lat) / (maxLat - minLat)) * 310 + 35)
  );
  return { x, y };
}

export const upsertSiteLocationSchema = z
  .object({
    area_label: z
      .string()
      .trim()
      .min(2, "Label wilayah umum minimal 2 karakter.")
      .max(120, "Label wilayah umum maksimal 120 karakter."),
    display_lat: z
      .number({ error: "Lintang wilayah harus berupa angka." })
      .min(-12, "Lintang wilayah harus berada antara -12 dan 8.")
      .max(8, "Lintang wilayah harus berada antara -12 dan 8.")
      .refine(
        hasAtMostTwoDecimals,
        "SEC-16: Lintang publik dibatasi maksimal 2 angka di belakang koma (±1,1 km)."
      ),
    display_lon: z
      .number({ error: "Bujur wilayah harus berupa angka." })
      .min(94, "Bujur wilayah harus berada antara 94 dan 142.")
      .max(142, "Bujur wilayah harus berada antara 94 dan 142.")
      .refine(
        hasAtMostTwoDecimals,
        "SEC-16: Bujur publik dibatasi maksimal 2 angka di belakang koma (±1,1 km)."
      ),
    precision_label: z
      .string()
      .trim()
      .min(3, "Label tingkat perkiraan minimal 3 karakter.")
      .max(80, "Label tingkat perkiraan maksimal 80 karakter.")
      .default("Perkiraan wilayah umum"),
    display_zoom_max: z.coerce
      .number()
      .int("Zoom maksimal harus berupa bilangan bulat.")
      .min(8, "Zoom maksimal publik minimal 8.")
      .max(13, "SEC-16: Zoom maksimal publik dibatasi paling tinggi 13.")
      .default(11),
    clearance_review_id: z
      .string()
      .uuid("Pilih ID catatan validasi lokasi (location approved) yang sah."),
  })
  .strict();

export type UpsertSiteLocationInput = z.infer<typeof upsertSiteLocationSchema>;

const SITE_LOCATION_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "VALIDATION_FAILED:COORDINATES_TOO_PRECISE",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "SEC-16: Koordinat terlalu presisi. Gunakan maksimal 2 angka di belakang koma (±1,1 km).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_CLEARANCE_REVIEW",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Tautan clearance lokasi harus merujuk review bertipe 'location' dengan keputusan 'approved' pada revisi ini.",
  },
  {
    token: "VALIDATION_FAILED:NOT_A_SITE",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Lokasi publik hanya dapat diatur pada konten berjenis 'site'.",
  },
  {
    token: "VALIDATION_FAILED:COORDINATES_OUT_OF_RANGE",
    status: 422,
    code: "VALIDATION_FAILED",
    message:
      "Koordinat representatif berada di luar rentang wilayah Indonesia (lat -12..8, lon 94..142).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_ZOOM",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Batas zoom peta publik harus berada pada rentang 8 hingga 13.",
  },
  {
    token: "VALIDATION_FAILED:INVALID_AREA_LABEL",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Label wilayah umum wajib diisi (2–120 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_PRECISION_LABEL",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Label tingkat perkiraan wajib diisi (3–80 karakter).",
  },
  {
    token: "STATE_CONFLICT:IMMUTABLE",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Lokasi pada revisi berstatus 'Disetujui', 'Terbit', atau 'Arsip' bersifat immutable. Buat revisi baru terlebih dahulu.",
  },
];

export function mapSiteLocationPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of SITE_LOCATION_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  return mapAdminCmsPostgresError(error);
}
