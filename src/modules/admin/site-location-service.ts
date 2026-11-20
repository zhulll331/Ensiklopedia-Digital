import "server-only";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import {
  mapSiteLocationPostgresError,
  roundCoarseCoordinate,
  type UpsertSiteLocationInput,
} from "@/modules/admin/site-location";
import {
  validatePublishReadiness,
  type PublishGateResult,
} from "@/modules/content/publish-gate";
import {
  SAMPLE_ADMIN_REVISIONS,
  SAMPLE_SITES,
} from "@/modules/content/sample-data";
import type { ContentStatus, ReviewType } from "@/modules/content/types";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminSiteLocationReviewOption {
  id: string;
  reviewer_label: string;
  reviewed_at: string;
  notes: string;
}

export interface AdminSiteLocationRecord {
  area_label: string;
  display_lat: number;
  display_lon: number;
  precision_label: string;
  display_zoom_max: number;
  clearance_review_id: string;
}

export type SiteClearanceStatus =
  | "cleared"
  | "review_ready_no_location"
  | "needs_location_review";

export interface AdminSiteLocationItem {
  revision_id: string;
  content_id: string;
  slug: string;
  title: string;
  version_no: number;
  status: ContentStatus;
  is_live_published: boolean;
  heritage_type: string;
  site_location: AdminSiteLocationRecord | null;
  approved_location_reviews: AdminSiteLocationReviewOption[];
  clearance_status: SiteClearanceStatus;
  publish_gate: PublishGateResult;
}

export interface AdminSiteLocationListResult {
  items: AdminSiteLocationItem[];
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

function asString(val: unknown, fallback = ""): string {
  return typeof val === "string" && val.trim().length > 0 ? val : fallback;
}

function buildSampleSiteLocations(): AdminSiteLocationListResult {
  const seenRevIds = new Set<string>();
  const items: AdminSiteLocationItem[] = [];

  for (const rev of SAMPLE_ADMIN_REVISIONS) {
    if (rev.kind !== "site") continue;
    seenRevIds.add(rev.revision_id);
    const sampleSite = SAMPLE_SITES.find(
      (s) => s.revision_id === rev.revision_id
    );
    const hasLocReview = rev.approved_reviews.includes("location");
    const approvedReviews: AdminSiteLocationReviewOption[] = hasLocReview
      ? [
          {
            id: `sample-loc-rev-${rev.revision_id}`,
            reviewer_label: "Penelaah Keamanan Lokasi (Sampel)",
            reviewed_at: rev.updated_at_utc,
            notes:
              "Disetujui untuk tampilan wilayah umum tanpa koordinat presisi.",
          },
        ]
      : [];

    const siteLoc: AdminSiteLocationRecord | null =
      sampleSite && rev.has_location_clearance && approvedReviews[0]
        ? {
            area_label: sampleSite.location.area_label,
            display_lat: sampleSite.location.display_lat,
            display_lon: sampleSite.location.display_lon,
            precision_label: sampleSite.location.precision_label,
            display_zoom_max: sampleSite.location.display_zoom_max,
            clearance_review_id: approvedReviews[0].id,
          }
        : null;

    items.push({
      revision_id: rev.revision_id,
      content_id: rev.content_id,
      slug: rev.slug,
      title: rev.title,
      version_no: rev.version_no,
      status: rev.status,
      is_live_published: rev.status === "published",
      heritage_type: sampleSite?.heritage_type ?? "Sarkofagus",
      site_location: siteLoc,
      approved_location_reviews: approvedReviews,
      clearance_status: siteLoc
        ? "cleared"
        : approvedReviews.length > 0
          ? "review_ready_no_location"
          : "needs_location_review",
      publish_gate: validatePublishReadiness({
        kind: "site",
        status: rev.status,
        sourcesCount: rev.sources_count,
        approvedReviewTypes: rev.approved_reviews,
        hasLocationClearance: Boolean(siteLoc),
        attachedMedia: rev.attached_media,
      }),
    });
  }

  for (const site of SAMPLE_SITES) {
    if (seenRevIds.has(site.revision_id)) continue;
    const revId = `sample-loc-rev-${site.revision_id}`;
    items.push({
      revision_id: site.revision_id,
      content_id: site.id,
      slug: site.slug,
      title: site.title,
      version_no: 1,
      status: site.status,
      is_live_published: site.status === "published",
      heritage_type: site.heritage_type,
      site_location: {
        ...site.location,
        clearance_review_id: revId,
      },
      approved_location_reviews: [
        {
          id: revId,
          reviewer_label: "Penelaah Keamanan Lokasi (Sampel)",
          reviewed_at: "2026-11-18T00:00:00Z",
          notes: "Clearance perkiraan kecamatan pada data sampel.",
        },
      ],
      clearance_status: "cleared",
      publish_gate: validatePublishReadiness({
        kind: "site",
        status: site.status,
        sourcesCount: site.sources.length,
        approvedReviewTypes: ["language", "material", "media", "location"],
        hasLocationClearance: true,
        attachedMedia: [
          { id: site.media_id, scan_status: "cleared", metadata_scrubbed: true },
        ],
      }),
    });
  }

  return {
    items,
    mode: "local_demo",
    migrationPending: false,
  };
}

export async function listAdminSiteLocationsAsync(
  session: AdminSessionResult
): Promise<AdminSiteLocationListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return buildSampleSiteLocations();
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client) {
    return { items: [], mode: "supabase", migrationPending: false };
  }

  const { data: siteItems, error: itemErr } = await client
    .schema("app")
    .from("content_items")
    .select("id, slug, published_revision_id")
    .eq("kind", "site")
    .order("created_at", { ascending: false });

  if (itemErr) {
    if (isSupabaseSchemaNotReadyError(itemErr)) {
      return { items: [], mode: "supabase", migrationPending: true };
    }
    throw new Error(`Gagal membaca item situs admin: ${itemErr.message}`);
  }

  if (!siteItems || siteItems.length === 0) {
    return { items: [], mode: "supabase", migrationPending: false };
  }

  const contentIds = siteItems.map((i) => i.id);
  const { data: revisions, error: revErr } = await client
    .schema("app")
    .from("content_revisions")
    .select("id, content_id, version_no, title, status, metadata_json, created_at")
    .in("content_id", contentIds)
    .order("created_at", { ascending: false })
    .order("version_no", { ascending: false });

  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) {
      return { items: [], mode: "supabase", migrationPending: true };
    }
    throw new Error(`Gagal membaca revisi situs admin: ${revErr.message}`);
  }

  if (!revisions || revisions.length === 0) {
    return { items: [], mode: "supabase", migrationPending: false };
  }

  const revIds = revisions.map((r) => r.id);
  const [{ data: locs }, { data: reviews }, { data: sources }, { data: mediaLinks }] =
    await Promise.all([
      client
        .schema("app")
        .from("site_public_locations")
        .select(
          "revision_id, area_label, display_lat, display_lon, precision_label, display_zoom_max, clearance_review_id"
        )
        .in("revision_id", revIds),
      client
        .schema("app")
        .from("review_records")
        .select(
          "id, revision_id, review_type, reviewer_label, decision, notes, reviewed_at"
        )
        .in("revision_id", revIds)
        .order("reviewed_at", { ascending: false }),
      client
        .schema("app")
        .from("revision_sources")
        .select("revision_id")
        .in("revision_id", revIds),
      client
        .schema("app")
        .from("content_media")
        .select("revision_id, asset_id")
        .in("revision_id", revIds),
    ]);

  const assetIds = Array.from(new Set((mediaLinks ?? []).map((m) => m.asset_id)));
  const { data: assets } =
    assetIds.length > 0
      ? await client
          .schema("app")
          .from("media_assets")
          .select("id, scan_status, metadata_scrubbed_at")
          .in("id", assetIds)
      : { data: [] };

  const itemMap = new Map(siteItems.map((i) => [i.id, i]));
  const locMap = new Map((locs ?? []).map((l) => [l.revision_id, l]));
  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));

  const items: AdminSiteLocationItem[] = revisions.map((rev) => {
    const parent = itemMap.get(rev.content_id);
    const meta =
      rev.metadata_json && typeof rev.metadata_json === "object"
        ? (rev.metadata_json as Record<string, unknown>)
        : {};
    const revReviews = (reviews ?? []).filter((r) => r.revision_id === rev.id);
    const approvedLocationReviews: AdminSiteLocationReviewOption[] = revReviews
      .filter((r) => r.review_type === "location" && r.decision === "approved")
      .map((r) => ({
        id: r.id,
        reviewer_label: r.reviewer_label,
        reviewed_at: r.reviewed_at,
        notes: r.notes ?? "",
      }));

    const locRow = locMap.get(rev.id);
    const siteLocation: AdminSiteLocationRecord | null = locRow
      ? {
          area_label: locRow.area_label,
          display_lat: Number(locRow.display_lat),
          display_lon: Number(locRow.display_lon),
          precision_label: locRow.precision_label,
          display_zoom_max: Number(locRow.display_zoom_max),
          clearance_review_id: locRow.clearance_review_id,
        }
      : null;

    const hasValidClearance = Boolean(
      siteLocation &&
        approvedLocationReviews.some(
          (lr) => lr.id === siteLocation.clearance_review_id
        )
    );

    const clearanceStatus: SiteClearanceStatus = hasValidClearance
      ? "cleared"
      : approvedLocationReviews.length > 0
        ? "review_ready_no_location"
        : "needs_location_review";

    const approvedReviews = Array.from(
      new Set(
        revReviews
          .filter((r) => r.decision === "approved")
          .map((r) => r.review_type as ReviewType)
      )
    );
    const sourcesCount = (sources ?? []).filter(
      (s) => s.revision_id === rev.id
    ).length;
    const attachedMedia = (mediaLinks ?? [])
      .filter((m) => m.revision_id === rev.id)
      .map((m) => {
        const asset = assetMap.get(m.asset_id);
        return {
          id: m.asset_id,
          scan_status: (asset?.scan_status ?? "quarantine") as
            | "quarantine"
            | "cleared"
            | "rejected",
          metadata_scrubbed: Boolean(asset?.metadata_scrubbed_at),
        };
      });

    return {
      revision_id: rev.id,
      content_id: rev.content_id,
      slug: parent?.slug ?? rev.content_id,
      title: rev.title,
      version_no: rev.version_no,
      status: rev.status as ContentStatus,
      is_live_published: parent?.published_revision_id === rev.id,
      heritage_type: asString(meta.heritage_type, "Menhir"),
      site_location: siteLocation,
      approved_location_reviews: approvedLocationReviews,
      clearance_status: clearanceStatus,
      publish_gate: validatePublishReadiness({
        kind: "site",
        status: rev.status as ContentStatus,
        sourcesCount,
        approvedReviewTypes: approvedReviews,
        hasLocationClearance: hasValidClearance,
        attachedMedia,
      }),
    };
  });

  return {
    items,
    mode: "supabase",
    migrationPending: false,
  };
}

function requireSupabaseAdminActor(session: AdminSessionResult) {
  if (
    !isSupabaseConfigured() ||
    !isSupabaseAdminConfigured() ||
    session.mode === "local_demo" ||
    !session.userId
  ) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mutasi lokasi situs memerlukan koneksi Supabase yang terkonfigurasi (mode demo lokal bersifat baca-saja)."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin) {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Klien admin Supabase tidak tersedia."
    );
  }
  return { admin, actorId: session.userId };
}

export async function upsertSitePublicLocationAsync(
  session: AdminSessionResult,
  input: UpsertSiteLocationInput & {
    revisionId: string;
    requestId: string;
  }
): Promise<AdminSiteLocationRecord & { revision_id: string }> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("upsert_site_public_location", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_area_label: input.area_label,
      p_display_lat: roundCoarseCoordinate(input.display_lat),
      p_display_lon: roundCoarseCoordinate(input.display_lon),
      p_precision_label: input.precision_label,
      p_display_zoom_max: input.display_zoom_max,
      p_clearance_review_id: input.clearance_review_id,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapSiteLocationPostgresError(error) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal menyimpan lokasi wilayah umum: ${error.message}`
      )
    );
  }

  return data as AdminSiteLocationRecord & { revision_id: string };
}

export async function deleteSitePublicLocationAsync(
  session: AdminSessionResult,
  input: { revisionId: string; requestId: string }
): Promise<string> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("delete_site_public_location", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapSiteLocationPostgresError(error) ??
      new DomainError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        `Gagal menghapus lokasi wilayah umum: ${error.message}`
      )
    );
  }

  return String(data);
}
