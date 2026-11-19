import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isRevisionMutable,
  validatePublishReadiness,
} from "@/modules/content/publish-gate";
import {
  getPublicMapAreas,
  listPublishedContents,
  listPublishedSites,
} from "@/modules/content/repository";

describe("Publish Gate CMS (FR-13, ADR-05, SEC-16..18)", () => {
  it("menolak publikasi jika sumber rujukan atau review bahasa/materi belum lengkap", () => {
    const res = validatePublishReadiness({
      kind: "chapter",
      status: "in_review",
      sourcesCount: 0,
      approvedReviewTypes: ["language"],
      hasLocationClearance: false,
      attachedMedia: [],
    });

    expect(res.ready).toBe(false);
    expect(res.missingRequirements.length).toBeGreaterThanOrEqual(2);
  });

  it("mewajibkan clearance lokasi wilayah umum untuk konten jenis site", () => {
    const res = validatePublishReadiness({
      kind: "site",
      status: "approved",
      sourcesCount: 1,
      approvedReviewTypes: ["language", "material"],
      hasLocationClearance: false,
      attachedMedia: [],
    });

    expect(res.ready).toBe(false);
    expect(res.missingRequirements.some((m) => m.includes("Clearance lokasi"))).toBe(
      true
    );
  });

  it("menolak publikasi bila ada media karantina atau belum dibersihkan EXIF", () => {
    const res = validatePublishReadiness({
      kind: "site",
      status: "approved",
      sourcesCount: 1,
      approvedReviewTypes: ["language", "material", "media", "location"],
      hasLocationClearance: true,
      attachedMedia: [
        { id: "m-1", scan_status: "quarantine", metadata_scrubbed: false },
      ],
    });

    expect(res.ready).toBe(false);
    expect(res.missingRequirements.some((m) => m.includes("scan"))).toBe(true);
  });

  it("meloloskan revisi bila seluruh gate terpenuhi dan menjaga revisi terbit immutable", () => {
    const res = validatePublishReadiness({
      kind: "site",
      status: "approved",
      sourcesCount: 1,
      approvedReviewTypes: ["language", "material", "media", "location"],
      hasLocationClearance: true,
      attachedMedia: [
        { id: "m-1", scan_status: "cleared", metadata_scrubbed: true },
      ],
    });

    expect(res.ready).toBe(true);
    expect(isRevisionMutable("draft")).toBe(true);
    expect(isRevisionMutable("published")).toBe(false);
    expect(isRevisionMutable("approved")).toBe(false);
  });
});

describe("Isolasi Draf & Proyeksi Peta Umum (SEC-16)", () => {
  it("tidak membocorkan draf internal ke daftar konten publik", () => {
    const { items } = listPublishedContents({ q: "Sarkofagus" });
    expect(items).toHaveLength(0);
  });

  it("memfilter situs berdasarkan kelas dan hanya mengembalikan perkiraan wilayah umum", () => {
    const grade3Sites = listPublishedSites({ grade: 3 });
    expect(grade3Sites.length).toBeGreaterThan(0);
    expect(grade3Sites.every((s) => s.target_grades.includes(3))).toBe(true);

    const areas = getPublicMapAreas();
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      expect(area.precision_label).toBe("Perkiraan wilayah umum");
      expect(area.display_zoom_max).toBeLessThanOrEqual(13);
    }
  });
});
