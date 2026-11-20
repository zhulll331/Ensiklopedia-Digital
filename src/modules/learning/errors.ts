export type LearningErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "ACTION_NOT_ALLOWED"
  | "RESOURCE_NOT_FOUND"
  | "STATE_CONFLICT"
  | "REVISION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "TASK_UNAVAILABLE"
  | "ATTEMPT_EXPIRED"
  | "VALIDATION_FAILED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "TEMPORARILY_UNAVAILABLE";

export class DomainError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: LearningErrorCode,
    message: string
  ) {
    super(message);
  }
}

const POSTGRES_DOMAIN_ERRORS: ReadonlyArray<{
  token: LearningErrorCode;
  status: number;
  message: string;
}> = [
  {
    token: "RESOURCE_NOT_FOUND",
    status: 404,
    message: "Data atau kode tugas tidak ditemukan.",
  },
  {
    token: "TASK_UNAVAILABLE",
    status: 410,
    message: "Tugas ini sudah ditutup atau tidak tersedia.",
  },
  {
    token: "ACTION_NOT_ALLOWED",
    status: 403,
    message: "Aksi tidak diizinkan untuk akun atau tugas ini.",
  },
  {
    token: "REVISION_CONFLICT",
    status: 409,
    message: "State jawaban berubah di perangkat atau tab lain. Muat ulang state terbaru.",
  },
  {
    token: "IDEMPOTENCY_CONFLICT",
    status: 409,
    message: "Idempotency-Key sudah dipakai dengan jawaban berbeda.",
  },
  {
    token: "STATE_CONFLICT",
    status: 409,
    message: "Operasi tidak diizinkan pada status tugas/percobaan saat ini.",
  },
  {
    token: "SESSION_EXPIRED",
    status: 401,
    message: "Sesi pengerjaan sudah berakhir atau tidak sah.",
  },
  {
    token: "ATTEMPT_EXPIRED",
    status: 410,
    message: "Batas waktu sudah habis atau berkas telah kedaluwarsa.",
  },
  {
    token: "VALIDATION_FAILED",
    status: 422,
    message: "Data masukan tidak valid.",
  },
  {
    token: "INVALID_REQUEST",
    status: 400,
    message: "Permintaan tidak valid.",
  },
];

export function mapPostgresErrorToDomainError(error: {
  message?: string;
  code?: string;
}): DomainError | null {
  const msg = error.message ?? "";
  for (const spec of POSTGRES_DOMAIN_ERRORS) {
    if (msg.includes(spec.token)) {
      return new DomainError(spec.status, spec.token, spec.message);
    }
  }
  return null;
}
