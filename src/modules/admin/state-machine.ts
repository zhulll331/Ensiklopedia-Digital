import type { ContentKind, ContentStatus } from "@/modules/content/types";

export const REVISION_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draf",
  in_review: "Penelaahan",
  approved: "Disetujui",
  published: "Terbit",
  archived: "Arsip",
};

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  chapter: "Bab Bacaan",
  site: "Situs Megalitik",
  video: "Video Belajar",
  glossary: "Glosarium",
  book: "Buku Bacaan",
  guide: "Panduan Guru",
  worksheet: "LKPD Siswa",
  page: "Halaman Statis",
  news: "Berita / Info",
};

export const REVISION_WORKFLOW_STEPS: readonly ContentStatus[] = [
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
];

/**
 * Matriks transisi status revisi non-publish.
 * Transisi `approved -> published` hanya boleh dijalankan melalui endpoint atomik `/publish`.
 */
export const ALLOWED_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "approved"],
  approved: ["draft", "archived"],
  published: ["archived"],
  archived: [],
};

export function canTransitionRevisionStatus(
  from: ContentStatus,
  to: ContentStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function requiresTransitionReason(
  from: ContentStatus,
  to: ContentStatus
): boolean {
  return (
    to === "archived" ||
    (to === "draft" && (from === "in_review" || from === "approved"))
  );
}

export function requiresReauthForTransition(
  from: ContentStatus,
  to: ContentStatus
): boolean {
  return from === "published" && to === "archived";
}

export interface TransitionActionSpec {
  nextStatus: ContentStatus;
  label: string;
  description: string;
  variant: "primary" | "secondary" | "danger";
  needsReason: boolean;
  needsDialog: boolean;
  needsReauth: boolean;
}

export function getAllowedTransitionActions(
  status: ContentStatus
): TransitionActionSpec[] {
  switch (status) {
    case "draft":
      return [
        {
          nextStatus: "in_review",
          label: "Ajukan Penelaahan",
          description:
            "Kirim draf ke antrean penelaahan kurator. Isi draf menjadi baca-saja selama ditelaah.",
          variant: "primary",
          needsReason: false,
          needsDialog: false,
          needsReauth: false,
        },
        {
          nextStatus: "archived",
          label: "Arsipkan Draf",
          description: "Pindahkan draf ini ke arsip bila tidak dilanjutkan.",
          variant: "danger",
          needsReason: true,
          needsDialog: true,
          needsReauth: false,
        },
      ];
    case "in_review":
      return [
        {
          nextStatus: "approved",
          label: "Setujui Revisi",
          description:
            "Nyatakan revisi siap masuk tahap disetujui (syarat menuju terbit).",
          variant: "primary",
          needsReason: false,
          needsDialog: false,
          needsReauth: false,
        },
        {
          nextStatus: "draft",
          label: "Minta Perubahan (Kembali ke Draf)",
          description:
            "Kembalikan revisi ke status draf disertai alasan perbaikan untuk kurator penulis.",
          variant: "secondary",
          needsReason: true,
          needsDialog: true,
          needsReauth: false,
        },
      ];
    case "approved":
      return [
        {
          nextStatus: "draft",
          label: "Kembalikan ke Draf",
          description:
            "Buka kembali revisi untuk penyuntingan (memerlukan alasan).",
          variant: "secondary",
          needsReason: true,
          needsDialog: true,
          needsReauth: false,
        },
        {
          nextStatus: "archived",
          label: "Arsipkan Revisi",
          description: "Batalkan rencana terbit dan arsipkan revisi ini.",
          variant: "danger",
          needsReason: true,
          needsDialog: true,
          needsReauth: false,
        },
      ];
    case "published":
      return [
        {
          nextStatus: "archived",
          label: "Takedown / Arsipkan Konten Terbit",
          description:
            "Tarik konten ini dari tampilan publik dan arsipkan revisi (wajib verifikasi ulang MFA terbaru).",
          variant: "danger",
          needsReason: true,
          needsDialog: true,
          needsReauth: true,
        },
      ];
    case "archived":
      return [];
  }
}

export function validateTransitionRequest(params: {
  from: ContentStatus;
  to: ContentStatus;
  reason?: string | null;
}):
  | { ok: true }
  | {
      ok: false;
      code: "STATE_CONFLICT" | "VALIDATION_FAILED";
      message: string;
    } {
  if (params.to === "published") {
    return {
      ok: false,
      code: "STATE_CONFLICT",
      message:
        "Publikasi revisi wajib dilakukan melalui endpoint /publish agar seluruh syarat gate terverifikasi.",
    };
  }

  if (!canTransitionRevisionStatus(params.from, params.to)) {
    return {
      ok: false,
      code: "STATE_CONFLICT",
      message: `Transisi status dari '${REVISION_STATUS_LABELS[params.from]}' ke '${REVISION_STATUS_LABELS[params.to]}' tidak diizinkan.`,
    };
  }

  const trimmedReason = (params.reason ?? "").trim();
  if (requiresTransitionReason(params.from, params.to) && trimmedReason.length < 5) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message:
        "Alasan transisi minimal 5 karakter wajib diisi saat mengembalikan ke draf atau mengarsipkan revisi.",
    };
  }

  return { ok: true };
}
