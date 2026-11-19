import type { ContentKind, ContentStatus, ReviewType } from "./types";

export interface PublishGateInput {
  kind: ContentKind;
  status: ContentStatus;
  sourcesCount: number;
  approvedReviewTypes: readonly ReviewType[];
  hasLocationClearance: boolean;
  attachedMedia: ReadonlyArray<{
    id: string;
    scan_status: "quarantine" | "cleared" | "rejected";
    metadata_scrubbed: boolean;
  }>;
}

export interface PublishGateResult {
  ready: boolean;
  missingRequirements: string[];
}

const IMMUTABLE_STATUSES: ReadonlySet<ContentStatus> = new Set([
  "approved",
  "published",
  "archived",
]);

/**
 * ADR-05: Revisi konten yang sudah disetujui, terbit, atau diarsipkan tidak boleh diubah in-place.
 */
export function isRevisionMutable(status: ContentStatus): boolean {
  return !IMMUTABLE_STATUSES.has(status);
}

/**
 * Memeriksa seluruh syarat publikasi revisi (FR-13, SEC-16, SEC-17, SEC-18, SEC-19).
 */
export function validatePublishReadiness(input: PublishGateInput): PublishGateResult {
  const missing: string[] = [];

  if (input.status !== "approved" && input.status !== "in_review") {
    missing.push("Status revisi harus berada pada tahap penelaahan atau disetujui sebelum terbit.");
  }

  if (input.sourcesCount < 1) {
    missing.push("Minimal satu rujukan sumber ilmiah atau arsip wajib ditautkan.");
  }

  if (!input.approvedReviewTypes.includes("language")) {
    missing.push("Validasi bahasa kelas III–IV belum disetujui.");
  }

  if (!input.approvedReviewTypes.includes("material")) {
    missing.push("Validasi materi substansi oleh ahli belum disetujui.");
  }

  if (input.kind === "site") {
    if (!input.approvedReviewTypes.includes("location") || !input.hasLocationClearance) {
      missing.push("Clearance lokasi wilayah umum oleh penelaah lokasi wajib disetujui.");
    }
  }

  if (input.attachedMedia.length > 0) {
    if (!input.approvedReviewTypes.includes("media")) {
      missing.push("Validasi media belum disetujui.");
    }
    const uncleared = input.attachedMedia.some(
      (m) => m.scan_status !== "cleared" || !m.metadata_scrubbed
    );
    if (uncleared) {
      missing.push("Terdapat berkas media yang belum lolos scan atau belum dibersihkan metadata EXIF-nya.");
    }
  }

  return {
    ready: missing.length === 0,
    missingRequirements: missing,
  };
}
