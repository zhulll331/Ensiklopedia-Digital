import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { summarizeAdminOverview } from "@/modules/admin/overview";
import type { SampleAdminRevisionRow } from "@/modules/content/sample-data";
import type { PublishGateResult } from "@/modules/content/publish-gate";

type RevInput = SampleAdminRevisionRow & { publish_gate: PublishGateResult };

function makeRev(
  id: string,
  status: SampleAdminRevisionRow["status"],
  ready: boolean
): RevInput {
  return {
    revision_id: id,
    content_id: `c-${id}`,
    slug: `slug-${id}`,
    kind: "chapter",
    version_no: 1,
    title: `Judul ${id}`,
    status,
    sources_count: ready ? 1 : 0,
    approved_reviews: ready ? ["language", "material"] : [],
    has_location_clearance: false,
    attached_media: [],
    updated_at_utc: "2026-04-02T00:00:00Z",
    publish_gate: {
      ready,
      missingRequirements: ready ? [] : ["Butuh sumber"],
    },
  };
}

describe("Ringkasan Dashboard Admin (Fase 1)", () => {
  it("menghitung revisi per status, antrean review, siap terbit, dan karantina media", () => {
    const revisions: RevInput[] = [
      makeRev("1", "draft", false),
      makeRev("2", "in_review", false),
      makeRev("3", "in_review", true),
      makeRev("4", "approved", true),
      makeRev("5", "published", true),
      makeRev("6", "archived", false),
    ];

    const summary = summarizeAdminOverview(
      revisions,
      [
        {
          id: "m-1",
          kind: "image",
          storage_path: "quarantine/a.jpg",
          mime: "image/jpeg",
          bytes: 1024,
          scan_status: "quarantine",
          metadata_scrubbed_at: null,
          created_at: "2026-04-02T00:00:00Z",
        },
      ],
      [],
      true,
      4
    );

    expect(summary.totalRevisions).toBe(6);
    expect(summary.statusCounts).toEqual({
      draft: 1,
      in_review: 2,
      approved: 1,
      published: 1,
      archived: 1,
    });
    expect(summary.reviewQueue.map((r) => r.revision_id)).toEqual(["2", "3"]);
    expect(summary.readyToPublish.map((r) => r.revision_id)).toEqual(["3", "4"]);
    expect(summary.quarantineMediaCount).toBe(4);
    expect(summary.quarantineMedia).toHaveLength(1);
    expect(summary.jobRunsMigrationPending).toBe(true);
  });
});
