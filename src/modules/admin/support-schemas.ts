import { z } from "zod";
import {
  DomainError,
  mapPostgresErrorToDomainError,
} from "@/modules/learning/errors";

export const SUPPORT_DURATION_MINUTES_MIN = 5;
export const SUPPORT_DURATION_MINUTES_MAX = 30;
export const SUPPORT_DURATION_PRESETS = [10, 15, 30] as const;

export const createSupportAccessSchema = z
  .object({
    assignment_id: z.string().uuid("ID tugas target tidak valid."),
    reason: z
      .string()
      .trim()
      .min(5, "Alasan dukungan minimal 5 karakter.")
      .max(300, "Alasan dukungan maksimal 300 karakter."),
    duration_minutes: z
      .number()
      .int("Durasi dukungan harus berupa bilangan bulat menit.")
      .min(
        SUPPORT_DURATION_MINUTES_MIN,
        `Durasi dukungan minimal ${SUPPORT_DURATION_MINUTES_MIN} menit.`
      )
      .max(
        SUPPORT_DURATION_MINUTES_MAX,
        `Durasi dukungan maksimal ${SUPPORT_DURATION_MINUTES_MAX} menit.`
      )
      .default(15),
  })
  .strict();

export const supportAccessIdSchema = z.string().uuid("ID sesi dukungan tidak valid.");

const SUPPORT_ERROR_TOKENS: ReadonlyArray<{
  token: string;
  status: number;
  code: DomainError["code"];
  message: string;
}> = [
  {
    token: "ACTION_NOT_ALLOWED:SUPPORT_OWNER_MISMATCH",
    status: 403,
    code: "ACTION_NOT_ALLOWED",
    message: "Sesi dukungan hanya dapat diakses oleh admin yang membukanya.",
  },
  {
    token: "STATE_CONFLICT:ACTIVE_SUPPORT_SESSION_EXISTS",
    status: 409,
    code: "STATE_CONFLICT",
    message:
      "Anda masih memiliki sesi dukungan aktif. Cabut atau tunggu sesi tersebut berakhir sebelum membuka tugas lain.",
  },
  {
    token: "STATE_CONFLICT:SUPPORT_REVOKED",
    status: 409,
    code: "STATE_CONFLICT",
    message: "Sesi dukungan ini sudah dicabut dan tidak lagi aktif.",
  },
  {
    token: "SESSION_EXPIRED:SUPPORT_EXPIRED",
    status: 401,
    code: "SESSION_EXPIRED",
    message: "Sesi dukungan (maksimum 30 menit) sudah kedaluwarsa.",
  },
  {
    token: "VALIDATION_FAILED:REASON_REQUIRED",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Alasan dukungan wajib diisi (5–300 karakter).",
  },
  {
    token: "VALIDATION_FAILED:INVALID_DURATION",
    status: 422,
    code: "VALIDATION_FAILED",
    message: "Durasi sesi dukungan harus antara 5 hingga 30 menit.",
  },
];

export function mapAdminSupportPostgresError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of SUPPORT_ERROR_TOKENS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.code, spec.message);
    }
  }
  return mapPostgresErrorToDomainError(error);
}

export function computeSupportRemainingSeconds(
  expiresAtIso: string,
  revokedAtIso?: string | null,
  nowMs = Date.now()
): number {
  if (revokedAtIso) {
    return 0;
  }
  const expiresMs = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}

export function formatCountdownMmSs(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export interface RawSupportAttemptRow {
  attempt_id: string;
  student_name: string;
  corrected_name: string | null;
  state: string;
  score: number | null;
  correct_count: number | null;
  question_count: number | null;
  started_at: string;
  submitted_at: string | null;
  receipt_code: string | null;
  purge_at: string;
  verification_status: string;
  annotations_count: number;
}

export interface EnrichedSupportAttemptRow extends RawSupportAttemptRow {
  display_name: string;
  duplicate_name: boolean;
}

function normalizeDisplayNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Menghitung display_name (prioritas koreksi guru) dan penanda nama ganda tanpa pernah menggabungkan kiriman.
 */
export function enrichSupportAttempts(
  rawAttempts: ReadonlyArray<RawSupportAttemptRow>
): EnrichedSupportAttemptRow[] {
  const nameCounts = new Map<string, number>();

  const computedNames = rawAttempts.map((row) => {
    const corrected = row.corrected_name?.trim() ?? "";
    const rawName = row.student_name.trim();
    const displayName = corrected || rawName;
    const key = normalizeDisplayNameKey(displayName);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    return { displayName, key };
  });

  return rawAttempts.map((row, index) => {
    const meta = computedNames[index]!;
    return {
      ...row,
      score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
      display_name: meta.displayName,
      duplicate_name: (nameCounts.get(meta.key) ?? 0) > 1,
    };
  });
}
