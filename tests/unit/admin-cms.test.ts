import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createContentItemSchema,
  getDefaultStructuredContent,
  mapAdminCmsPostgresError,
  slugifyContentTitle,
  validateStructuredContent,
} from "@/modules/admin/cms-schemas";
import {
  canTransitionRevisionStatus,
  getAllowedTransitionActions,
  requiresReauthForTransition,
  requiresTransitionReason,
  validateTransitionRequest,
} from "@/modules/admin/state-machine";
import { validatePublishReadiness } from "@/modules/content/publish-gate";
import type { ContentKind } from "@/modules/content/types";

describe("State Machine Revisi CMS Admin (Fase 2)", () => {
  it("mengizinkan transisi resmi dan menolak jalur ilegal atau bypass publish", () => {
    expect(canTransitionRevisionStatus("draft", "in_review")).toBe(true);
    expect(canTransitionRevisionStatus("draft", "archived")).toBe(true);
    expect(canTransitionRevisionStatus("in_review", "approved")).toBe(true);
    expect(canTransitionRevisionStatus("in_review", "draft")).toBe(true);
    expect(canTransitionRevisionStatus("approved", "draft")).toBe(true);
    expect(canTransitionRevisionStatus("approved", "archived")).toBe(true);
    expect(canTransitionRevisionStatus("published", "archived")).toBe(true);

    // Dilarang: lompat, mundur dari published ke draft, atau mutasi dari archived
    expect(canTransitionRevisionStatus("draft", "approved")).toBe(false);
    expect(canTransitionRevisionStatus("published", "draft")).toBe(false);
    expect(canTransitionRevisionStatus("archived", "draft")).toBe(false);

    const publishBypass = validateTransitionRequest({
      from: "approved",
      to: "published",
    });
    expect(publishBypass.ok).toBe(false);
    if (!publishBypass.ok) {
      expect(publishBypass.code).toBe("STATE_CONFLICT");
    }
  });

  it("mewajibkan alasan >= 5 karakter untuk pengembalian ke draf atau arsip, serta reauth saat takedown live", () => {
    expect(requiresTransitionReason("draft", "in_review")).toBe(false);
    expect(requiresTransitionReason("in_review", "approved")).toBe(false);
    expect(requiresTransitionReason("in_review", "draft")).toBe(true);
    expect(requiresTransitionReason("published", "archived")).toBe(true);

    expect(requiresReauthForTransition("published", "archived")).toBe(true);
    expect(requiresReauthForTransition("draft", "archived")).toBe(false);

    const missingReason = validateTransitionRequest({
      from: "in_review",
      to: "draft",
      reason: "oke",
    });
    expect(missingReason.ok).toBe(false);
    if (!missingReason.ok) {
      expect(missingReason.code).toBe("VALIDATION_FAILED");
    }

    const validReason = validateTransitionRequest({
      from: "published",
      to: "archived",
      reason: "Revisi ulang koordinat & naskah bahasa",
    });
    expect(validReason.ok).toBe(true);

    expect(getAllowedTransitionActions("published").map((a) => a.nextStatus)).toEqual([
      "archived",
    ]);
    expect(getAllowedTransitionActions("archived")).toEqual([]);
  });
});

describe("Skema Terstruktur per Jenis Konten & Error Mapper (D5)", () => {
  const ALL_KINDS: ContentKind[] = [
    "chapter",
    "site",
    "video",
    "glossary",
    "book",
    "guide",
    "worksheet",
    "page",
    "news",
  ];

  it("default konten terstruktur selalu lolos validasi untuk semua 9 jenis konten", () => {
    for (const kind of ALL_KINDS) {
      const def = getDefaultStructuredContent(kind, "Ringkasan uji materi");
      const check = validateStructuredContent(kind, def.body_json, def.metadata_json);
      expect(check.ok, `Default gagal untuk jenis ${kind}`).toBe(true);
    }
  });

  it("menolak properti HTML bebas/tak dikenal pada body_json dan slug tidak valid", () => {
    const badBody = validateStructuredContent(
      "chapter",
      { paragraphs: ["Paragraf valid"], raw_html: "<script>alert(1)</script>" },
      { order: 1, reading_minutes: 4, glossary_slugs: [], preservation_note: "" }
    );
    expect(badBody.ok).toBe(false);

    const badCreate = createContentItemSchema.safeParse({
      kind: "chapter",
      slug: "Slug Salah!",
      title: "Bab Uji",
      summary: "",
      target_grades: [3],
    });
    expect(badCreate.success).toBe(false);

    expect(slugifyContentTitle("Menhir & Dolmen: Desa Kemiren!")).toBe(
      "menhir-dolmen-desa-kemiren"
    );
  });

  it("memetakan kode error CMS SQL spesifik menjadi DomainError informatif", () => {
    const immutableErr = mapAdminCmsPostgresError({
      message: "STATE_CONFLICT:IMMUTABLE",
    });
    expect(immutableErr?.status).toBe(409);
    expect(immutableErr?.code).toBe("STATE_CONFLICT");

    const mediaReviewErr = mapAdminCmsPostgresError({
      message: "VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED",
    });
    expect(mediaReviewErr?.status).toBe(422);
    expect(mediaReviewErr?.message).toContain("validasi media");

    const dupSlugErr = mapAdminCmsPostgresError({
      code: "23505",
      message: 'duplicate key value violates unique constraint "content_items_slug_key"',
    });
    expect(dupSlugErr?.status).toBe(409);
  });
});

describe("Paritas Gate Publikasi SQL <-> TypeScript (D3)", () => {
  it("0012_admin_cms_rpcs.sql dan validatePublishReadiness sama-sama mengunci hanya status approved + media review", () => {
    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0012_admin_cms_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    expect(sql).toContain("if v_status <> 'approved' then");
    expect(sql).toContain("STATE_CONFLICT:REQUIRES_APPROVED");
    expect(sql).toContain("VALIDATION_FAILED:SOURCE_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:REVIEWS_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:LOCATION_CLEARANCE_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:MEDIA_NOT_CLEARED");
    expect(sql).toContain("VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED");

    const missingMediaReview = validatePublishReadiness({
      kind: "chapter",
      status: "approved",
      sourcesCount: 1,
      approvedReviewTypes: ["language", "material"],
      hasLocationClearance: false,
      attachedMedia: [{ id: "m1", scan_status: "cleared", metadata_scrubbed: true }],
    });
    expect(missingMediaReview.ready).toBe(false);
    expect(
      missingMediaReview.missingRequirements.some((m) =>
        m.toLowerCase().includes("media")
      )
    ).toBe(true);
  });
});
