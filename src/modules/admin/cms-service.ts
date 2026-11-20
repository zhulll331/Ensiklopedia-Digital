import "server-only";
import { revalidatePath } from "next/cache";
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
  getDefaultStructuredContent,
  mapAdminCmsPostgresError,
} from "@/modules/admin/cms-schemas";
import {
  validatePublishReadiness,
  type PublishGateResult,
} from "@/modules/content/publish-gate";
import {
  SAMPLE_ADMIN_REVISIONS,
  SAMPLE_CHAPTERS,
  SAMPLE_MEDIA,
  SAMPLE_SITES,
  SAMPLE_SOURCES,
} from "@/modules/content/sample-data";
import type {
  ContentKind,
  ContentStatus,
  ReviewType,
} from "@/modules/content/types";
import { DomainError } from "@/modules/learning/errors";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminContentListItem {
  revision_id: string;
  content_id: string;
  slug: string;
  kind: ContentKind;
  version_no: number;
  title: string;
  summary: string;
  status: ContentStatus;
  is_live_published: boolean;
  sources_count: number;
  approved_reviews: ReviewType[];
  has_location_clearance: boolean;
  attached_media: Array<{
    id: string;
    scan_status: "quarantine" | "cleared" | "rejected";
    metadata_scrubbed: boolean;
  }>;
  updated_at_utc: string;
  publish_gate: PublishGateResult;
}

export interface AdminContentListResult {
  items: AdminContentListItem[];
  nextCursor: string | null;
  totalCount: number;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminSourceOption {
  id: string;
  citation_text: string;
  url: string | null;
  doi: string | null;
  accessed_at: string | null;
  source_type: string;
}

export interface AdminMediaOption {
  id: string;
  kind: string;
  storage_bucket: string;
  storage_path: string;
  visibility: "private" | "public";
  scan_status: "quarantine" | "cleared" | "rejected";
  metadata_scrubbed: boolean;
  credit: string;
  license: string;
}

export interface AdminLinkTargetOption {
  id: string;
  slug: string;
  kind: ContentKind;
  title: string;
}

export interface AdminRevisionSourceRow {
  source_id: string;
  citation_text: string;
  source_type: string;
  url: string | null;
  locator: string;
  note: string;
}

export interface AdminRevisionMediaRow {
  id?: string;
  asset_id: string;
  role: string;
  alt_text: string;
  caption: string;
  sort_order: number;
  storage_path: string;
  scan_status: "quarantine" | "cleared" | "rejected";
  metadata_scrubbed: boolean;
  asset_kind: string;
}

export interface AdminRevisionLinkRow {
  target_content_id: string;
  target_slug: string;
  target_kind: ContentKind;
  target_title: string;
  relation_type: string;
  sort_order: number;
}

export interface AdminRevisionReviewRow {
  id: string;
  review_type: ReviewType;
  reviewer_label: string;
  decision: "approved" | "changes_requested" | "rejected";
  notes: string;
  evidence_asset_id: string | null;
  reviewed_at: string;
}

export interface AdminRevisionDetail {
  mode: "supabase" | "local_demo";
  content_id: string;
  slug: string;
  kind: ContentKind;
  published_revision_id: string | null;
  archived_at: string | null;
  revision_id: string;
  version_no: number;
  title: string;
  summary: string;
  target_grades: Array<3 | 4>;
  body_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
  status: ContentStatus;
  created_at: string;
  published_at: string | null;
  sibling_revisions: Array<{
    revision_id: string;
    version_no: number;
    status: ContentStatus;
    created_at: string;
  }>;
  sources: AdminRevisionSourceRow[];
  media: AdminRevisionMediaRow[];
  links: AdminRevisionLinkRow[];
  reviews: AdminRevisionReviewRow[];
  site_location: null | {
    area_label: string;
    display_lat: number;
    display_lon: number;
    precision_label: string;
    display_zoom_max: number;
    clearance_review_id: string;
    clearance_approved: boolean;
  };
  publish_gate: PublishGateResult;
  available_sources: AdminSourceOption[];
  available_media: AdminMediaOption[];
  available_link_targets: AdminLinkTargetOption[];
}

function asObject(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

function normalizeGrades(val: unknown): Array<3 | 4> {
  if (!Array.isArray(val)) return [3, 4];
  const filtered = val.filter((g): g is 3 | 4 => g === 3 || g === 4);
  return filtered.length > 0 ? filtered : [3, 4];
}

function sanitizePostgrestNeedle(raw?: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/[%_,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function buildSampleContentList(filters?: {
  kind?: ContentKind;
  status?: ContentStatus;
  q?: string;
  cursor?: string;
  limit?: number;
}): AdminContentListResult {
  const needle = filters?.q?.trim().toLowerCase() ?? "";

  const allRows: AdminContentListItem[] = SAMPLE_ADMIN_REVISIONS.map((rev) => {
    const gate = validatePublishReadiness({
      kind: rev.kind,
      status: rev.status,
      sourcesCount: rev.sources_count,
      approvedReviewTypes: rev.approved_reviews,
      hasLocationClearance: rev.has_location_clearance,
      attachedMedia: rev.attached_media,
    });
    const chapterSummary = SAMPLE_CHAPTERS.find(
      (c) => c.revision_id === rev.revision_id
    )?.summary;
    const siteSummary = SAMPLE_SITES.find(
      (s) => s.revision_id === rev.revision_id
    )?.summary;

    return {
      ...rev,
      summary:
        chapterSummary ??
        siteSummary ??
        "Draf internal sampel untuk pratinjau alur kurasi.",
      is_live_published: rev.status === "published",
      publish_gate: gate,
    };
  }).filter((row) => {
    if (filters?.kind && row.kind !== filters.kind) return false;
    if (filters?.status && row.status !== filters.status) return false;
    if (needle) {
      return (
        row.title.toLowerCase().includes(needle) ||
        row.slug.toLowerCase().includes(needle)
      );
    }
    return true;
  });

  const offset = filters?.cursor
    ? Math.max(0, Number.parseInt(filters.cursor, 10) || 0)
    : 0;
  const limit = filters?.limit ?? 20;
  const sliced = allRows.slice(offset, offset + limit);
  const nextCursor =
    offset + limit < allRows.length ? String(offset + limit) : null;

  return {
    items: sliced,
    nextCursor,
    totalCount: allRows.length,
    mode: "local_demo",
    migrationPending: false,
  };
}

function buildSampleRevisionDetail(
  contentId: string,
  revisionId: string
): AdminRevisionDetail | null {
  const row = SAMPLE_ADMIN_REVISIONS.find(
    (r) => r.revision_id === revisionId && (!contentId || r.content_id === contentId)
  );
  if (!row) return null;

  const chapter = SAMPLE_CHAPTERS.find((c) => c.revision_id === row.revision_id);
  const site = SAMPLE_SITES.find((s) => s.revision_id === row.revision_id);

  let summary = "Draf internal sampel (mode demo lokal baca-saja).";
  let targetGrades: Array<3 | 4> = [3, 4];
  let bodyJson: Record<string, unknown> = getDefaultStructuredContent(
    row.kind
  ).body_json;
  let metadataJson: Record<string, unknown> = getDefaultStructuredContent(
    row.kind
  ).metadata_json;

  if (chapter) {
    summary = chapter.summary;
    targetGrades = chapter.target_grades;
    bodyJson = { paragraphs: chapter.paragraphs };
    metadataJson = {
      order: chapter.order,
      reading_minutes: chapter.reading_minutes,
      glossary_slugs: chapter.glossary_slugs,
      preservation_note: chapter.preservation_note,
    };
  } else if (site) {
    summary = site.summary;
    targetGrades = site.target_grades;
    bodyJson = {
      child_narration: site.child_narration,
      scientific_context: site.scientific_context,
    };
    metadataJson = {
      heritage_type: site.heritage_type,
      preservation_warning: site.preservation_warning,
    };
  } else if (row.revision_id === "rev-draft-sarkofagus-v1") {
    summary =
      "Draf entri situs sarkofagus yang masih menunggu clearance lokasi wilayah umum dan sumber rujukan.";
    targetGrades = [4];
    bodyJson = {
      child_narration: [
        "Sarkofagus adalah wadah batu besar kuno yang dipahat oleh manusia pada masa megalitik.",
      ],
      scientific_context: [
        "Menunggu verifikasi laporan survei arkeologi sebelum lolos tahap penelaahan.",
      ],
    };
    metadataJson = {
      heritage_type: "Sarkofagus",
      preservation_warning:
        "Peninggalan bersifat sangat rentan; jaga jarak aman dan jangan sentuh.",
    };
  }

  const sources: AdminRevisionSourceRow[] = (
    chapter?.sources ?? site?.sources ?? []
  ).map((s) => ({
    source_id: s.id,
    citation_text: s.citation_text,
    source_type: s.source_type,
    url: null,
    locator: s.locator,
    note: "",
  }));

  const media: AdminRevisionMediaRow[] = row.attached_media.map((m, idx) => {
    const matched = SAMPLE_MEDIA.find((sm) => sm.id === m.id);
    return {
      asset_id: m.id,
      role: idx === 0 ? "cover" : "inline",
      alt_text: matched?.alt_text ?? "Aset media dalam antrean karantina",
      caption: matched?.caption ?? "Menunggu proses scrub EXIF dan review kurator.",
      sort_order: idx,
      storage_path:
        matched?.src ?? `quarantine/sample/${m.id}.jpg`,
      scan_status: m.scan_status,
      metadata_scrubbed: m.metadata_scrubbed,
      asset_kind: matched?.kind ?? "image",
    };
  });

  const reviews: AdminRevisionReviewRow[] = row.approved_reviews.map(
    (reviewType, idx) => ({
      id: `sample-review-${row.revision_id}-${idx}`,
      review_type: reviewType,
      reviewer_label:
        reviewType === "language"
          ? "Tim Kurasi Bahasa SD (Sampel)"
          : reviewType === "material"
            ? "Kurator Arkeologi (Sampel)"
            : reviewType === "location"
              ? "Penelaah Keamanan Lokasi (Sampel)"
              : "Kurator Media (Sampel)",
      decision: "approved",
      notes: "Disetujui pada skenario data sampel lokal.",
      evidence_asset_id: null,
      reviewed_at: row.updated_at_utc,
    })
  );

  const siteLocation =
    site && row.has_location_clearance
      ? {
          ...site.location,
          clearance_review_id:
            reviews.find((r) => r.review_type === "location")?.id ??
            "sample-review-loc",
          clearance_approved: true,
        }
      : null;

  const availableSources: AdminSourceOption[] = Object.values(SAMPLE_SOURCES).map(
    (s) => ({
      id: s.id,
      citation_text: s.citation_text,
      url: null,
      doi: null,
      accessed_at: null,
      source_type: s.source_type,
    })
  );

  const availableMedia: AdminMediaOption[] = SAMPLE_MEDIA.map((m) => ({
    id: m.id,
    kind: m.kind,
    storage_bucket: "public-media",
    storage_path: m.src,
    visibility: "public",
    scan_status: m.scan_status,
    metadata_scrubbed: m.metadata_scrubbed,
    credit: m.credit,
    license: m.license,
  }));

  const availableLinkTargets: AdminLinkTargetOption[] = [
    ...SAMPLE_CHAPTERS.map((c) => ({
      id: c.id,
      slug: c.slug,
      kind: "chapter" as const,
      title: c.title,
    })),
    ...SAMPLE_SITES.map((s) => ({
      id: s.id,
      slug: s.slug,
      kind: "site" as const,
      title: s.title,
    })),
  ].filter((t) => t.id !== row.content_id);

  return {
    mode: "local_demo",
    content_id: row.content_id,
    slug: row.slug,
    kind: row.kind,
    published_revision_id: row.status === "published" ? row.revision_id : null,
    archived_at: null,
    revision_id: row.revision_id,
    version_no: row.version_no,
    title: row.title,
    summary,
    target_grades: targetGrades,
    body_json: bodyJson,
    metadata_json: metadataJson,
    status: row.status,
    created_at: row.updated_at_utc,
    published_at: row.status === "published" ? row.updated_at_utc : null,
    sibling_revisions: [
      {
        revision_id: row.revision_id,
        version_no: row.version_no,
        status: row.status,
        created_at: row.updated_at_utc,
      },
    ],
    sources,
    media,
    links: [],
    reviews,
    site_location: siteLocation,
    publish_gate: validatePublishReadiness({
      kind: row.kind,
      status: row.status,
      sourcesCount: sources.length,
      approvedReviewTypes: row.approved_reviews,
      hasLocationClearance: Boolean(siteLocation?.clearance_approved),
      attachedMedia: row.attached_media,
    }),
    available_sources: availableSources,
    available_media: availableMedia,
    available_link_targets: availableLinkTargets,
  };
}

export async function listAdminContentsAsync(
  session: AdminSessionResult,
  filters?: {
    kind?: ContentKind;
    status?: ContentStatus;
    q?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<AdminContentListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return buildSampleContentList(filters);
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client) {
    return {
      items: [],
      nextCursor: null,
      totalCount: 0,
      mode: "supabase",
      migrationPending: false,
    };
  }

  const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 50);
  const offset = filters?.cursor
    ? Math.max(0, Number.parseInt(filters.cursor, 10) || 0)
    : 0;
  const needle = sanitizePostgrestNeedle(filters?.q);

  let restrictedContentIds: string[] | null = null;
  if (filters?.kind) {
    const { data: kindItems, error: kindErr } = await client
      .schema("app")
      .from("content_items")
      .select("id")
      .eq("kind", filters.kind);

    if (kindErr) {
      if (isSupabaseSchemaNotReadyError(kindErr)) {
        return {
          items: [],
          nextCursor: null,
          totalCount: 0,
          mode: "supabase",
          migrationPending: true,
        };
      }
      throw new Error(`Gagal memfilter jenis konten admin: ${kindErr.message}`);
    }

    restrictedContentIds = (kindItems ?? []).map((i) => i.id);
    if (restrictedContentIds.length === 0) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        mode: "supabase",
        migrationPending: false,
      };
    }
  }

  let query = client
    .schema("app")
    .from("content_revisions")
    .select("id, content_id, version_no, title, summary, status, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (restrictedContentIds) {
    query = query.in("content_id", restrictedContentIds);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (needle) {
    const { data: slugMatches } = await client
      .schema("app")
      .from("content_items")
      .select("id")
      .ilike("slug", `%${needle}%`)
      .limit(100);

    const slugIds = (slugMatches ?? []).map((s) => s.id);
    if (slugIds.length > 0) {
      query = query.or(
        `title.ilike.%${needle}%,summary.ilike.%${needle}%,content_id.in.(${slugIds.join(",")})`
      );
    } else {
      query = query.or(`title.ilike.%${needle}%,summary.ilike.%${needle}%`);
    }
  }

  const { data: revisions, count, error: revErr } = await query.range(
    offset,
    offset + limit
  );

  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) {
      return {
        items: [],
        nextCursor: null,
        totalCount: 0,
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw new Error(`Gagal membaca daftar konten admin: ${revErr.message}`);
  }

  const rawRows = revisions ?? [];
  const hasMore = rawRows.length > limit;
  const pageRevs = hasMore ? rawRows.slice(0, limit) : rawRows;
  const totalCount = typeof count === "number" ? count : pageRevs.length;

  if (pageRevs.length === 0) {
    return {
      items: [],
      nextCursor: null,
      totalCount,
      mode: "supabase",
      migrationPending: false,
    };
  }

  const contentIds = Array.from(new Set(pageRevs.map((r) => r.content_id)));
  const revIds = pageRevs.map((r) => r.id);

  const [
    { data: items },
    { data: sources },
    { data: reviews },
    { data: locs },
    { data: mediaLinks },
  ] = await Promise.all([
    client
      .schema("app")
      .from("content_items")
      .select("id, slug, kind, published_revision_id")
      .in("id", contentIds),
    client
      .schema("app")
      .from("revision_sources")
      .select("revision_id")
      .in("revision_id", revIds),
    client
      .schema("app")
      .from("review_records")
      .select("id, revision_id, review_type, decision")
      .in("revision_id", revIds),
    client
      .schema("app")
      .from("site_public_locations")
      .select("revision_id, clearance_review_id")
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

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const approvedReviewIdSet = new Set(
    (reviews ?? [])
      .filter((r) => r.review_type === "location" && r.decision === "approved")
      .map((r) => `${r.revision_id}:${r.id}`)
  );
  const locClearedSet = new Set(
    (locs ?? [])
      .filter((l) =>
        approvedReviewIdSet.has(`${l.revision_id}:${l.clearance_review_id}`)
      )
      .map((l) => l.revision_id)
  );

  const mappedItems: AdminContentListItem[] = pageRevs.map((rev) => {
    const item = itemMap.get(rev.content_id);
    const kind = (item?.kind ?? "page") as ContentKind;
    const status = rev.status as ContentStatus;
    const sourcesCount = (sources ?? []).filter(
      (s) => s.revision_id === rev.id
    ).length;
    const approvedReviews = Array.from(
      new Set(
        (reviews ?? [])
          .filter((r) => r.revision_id === rev.id && r.decision === "approved")
          .map((r) => r.review_type as ReviewType)
      )
    );
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
    const hasLocationClearance = locClearedSet.has(rev.id);

    return {
      revision_id: rev.id,
      content_id: rev.content_id,
      slug: item?.slug ?? rev.content_id,
      kind,
      version_no: rev.version_no,
      title: rev.title,
      summary: rev.summary ?? "",
      status,
      is_live_published: item?.published_revision_id === rev.id,
      sources_count: sourcesCount,
      approved_reviews: approvedReviews,
      has_location_clearance: hasLocationClearance,
      attached_media: attachedMedia,
      updated_at_utc: rev.created_at,
      publish_gate: validatePublishReadiness({
        kind,
        status,
        sourcesCount,
        approvedReviewTypes: approvedReviews,
        hasLocationClearance,
        attachedMedia,
      }),
    };
  });

  return {
    items: mappedItems,
    nextCursor: hasMore ? String(offset + limit) : null,
    totalCount,
    mode: "supabase",
    migrationPending: false,
  };
}

export async function getAdminRevisionDetailAsync(
  session: AdminSessionResult,
  contentId: string,
  revisionId: string
): Promise<AdminRevisionDetail | null> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return buildSampleRevisionDetail(contentId, revisionId);
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client) return null;

  let revQuery = client
    .schema("app")
    .from("content_revisions")
    .select(
      "id, content_id, version_no, title, summary, body_json, target_grades, metadata_json, status, created_at, published_at"
    )
    .eq("id", revisionId);

  if (contentId) {
    revQuery = revQuery.eq("content_id", contentId);
  }

  const { data: rev, error: revErr } = await revQuery.maybeSingle();
  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) return null;
    throw new Error(`Gagal membaca detail revisi: ${revErr.message}`);
  }
  if (!rev) return null;

  const { data: item, error: itemErr } = await client
    .schema("app")
    .from("content_items")
    .select("id, slug, kind, published_revision_id, archived_at")
    .eq("id", rev.content_id)
    .maybeSingle();

  if (itemErr || !item) {
    return null;
  }

  const [
    { data: siblingRows },
    { data: revSourceRows },
    { data: contentMediaRows },
    { data: contentLinkRows },
    { data: reviewRows },
    { data: siteLocRow },
    { data: allSources },
    { data: allMedia },
    { data: allItems },
    { data: latestRevs },
  ] = await Promise.all([
    client
      .schema("app")
      .from("content_revisions")
      .select("id, version_no, status, created_at")
      .eq("content_id", item.id)
      .order("version_no", { ascending: false }),
    client
      .schema("app")
      .from("revision_sources")
      .select("source_id, locator, note")
      .eq("revision_id", rev.id),
    client
      .schema("app")
      .from("content_media")
      .select("id, asset_id, role, alt_text, caption, sort_order")
      .eq("revision_id", rev.id)
      .order("sort_order", { ascending: true }),
    client
      .schema("app")
      .from("content_links")
      .select("target_content_id, relation_type, sort_order")
      .eq("revision_id", rev.id)
      .order("sort_order", { ascending: true }),
    client
      .schema("app")
      .from("review_records")
      .select(
        "id, review_type, reviewer_label, decision, notes, evidence_asset_id, reviewed_at"
      )
      .eq("revision_id", rev.id)
      .order("reviewed_at", { ascending: false }),
    client
      .schema("app")
      .from("site_public_locations")
      .select(
        "area_label, display_lat, display_lon, precision_label, display_zoom_max, clearance_review_id"
      )
      .eq("revision_id", rev.id)
      .maybeSingle(),
    client
      .schema("app")
      .from("source_references")
      .select("id, citation_text, url, doi, accessed_at, source_type")
      .order("citation_text", { ascending: true })
      .limit(200),
    client
      .schema("app")
      .from("media_assets")
      .select(
        "id, kind, storage_bucket, storage_path, visibility, scan_status, metadata_scrubbed_at, credit, license"
      )
      .neq("scan_status", "rejected")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .schema("app")
      .from("content_items")
      .select("id, slug, kind")
      .neq("id", item.id)
      .order("created_at", { ascending: false })
      .limit(150),
    client
      .schema("app")
      .from("content_revisions")
      .select("content_id, title, version_no")
      .order("version_no", { ascending: false })
      .limit(300),
  ]);

  const sourceMap = new Map((allSources ?? []).map((s) => [s.id, s]));
  const mediaMap = new Map((allMedia ?? []).map((m) => [m.id, m]));
  const titleByContentId = new Map<string, string>();
  for (const r of latestRevs ?? []) {
    if (!titleByContentId.has(r.content_id)) {
      titleByContentId.set(r.content_id, r.title);
    }
  }
  const itemById = new Map((allItems ?? []).map((i) => [i.id, i]));

  const sources: AdminRevisionSourceRow[] = (revSourceRows ?? []).map((rs) => {
    const src = sourceMap.get(rs.source_id);
    return {
      source_id: rs.source_id,
      citation_text: src?.citation_text ?? rs.source_id,
      source_type: src?.source_type ?? "report",
      url: src?.url ?? null,
      locator: rs.locator ?? "",
      note: rs.note ?? "",
    };
  });

  const media: AdminRevisionMediaRow[] = (contentMediaRows ?? []).map((cm) => {
    const asset = mediaMap.get(cm.asset_id);
    return {
      id: cm.id,
      asset_id: cm.asset_id,
      role: cm.role,
      alt_text: cm.alt_text ?? "",
      caption: cm.caption ?? "",
      sort_order: cm.sort_order ?? 0,
      storage_path: asset?.storage_path ?? cm.asset_id,
      scan_status: (asset?.scan_status ?? "quarantine") as
        | "quarantine"
        | "cleared"
        | "rejected",
      metadata_scrubbed: Boolean(asset?.metadata_scrubbed_at),
      asset_kind: asset?.kind ?? "image",
    };
  });

  const links: AdminRevisionLinkRow[] = (contentLinkRows ?? []).map((cl) => {
    const targetItem = itemById.get(cl.target_content_id);
    return {
      target_content_id: cl.target_content_id,
      target_slug: targetItem?.slug ?? cl.target_content_id,
      target_kind: (targetItem?.kind ?? "page") as ContentKind,
      target_title:
        titleByContentId.get(cl.target_content_id) ??
        targetItem?.slug ??
        cl.target_content_id,
      relation_type: cl.relation_type,
      sort_order: cl.sort_order ?? 0,
    };
  });

  const reviews: AdminRevisionReviewRow[] = (reviewRows ?? []).map((rr) => ({
    id: rr.id,
    review_type: rr.review_type as ReviewType,
    reviewer_label: rr.reviewer_label,
    decision: rr.decision as "approved" | "changes_requested" | "rejected",
    notes: rr.notes ?? "",
    evidence_asset_id: rr.evidence_asset_id ?? null,
    reviewed_at: rr.reviewed_at,
  }));

  const approvedReviewTypes = Array.from(
    new Set(
      reviews
        .filter((r) => r.decision === "approved")
        .map((r) => r.review_type)
    )
  );

  const clearanceApproved = Boolean(
    siteLocRow &&
      reviews.some(
        (r) =>
          r.id === siteLocRow.clearance_review_id &&
          r.review_type === "location" &&
          r.decision === "approved"
      )
  );

  const kind = item.kind as ContentKind;
  const status = rev.status as ContentStatus;

  const publishGate = validatePublishReadiness({
    kind,
    status,
    sourcesCount: sources.length,
    approvedReviewTypes,
    hasLocationClearance: clearanceApproved,
    attachedMedia: media.map((m) => ({
      id: m.asset_id,
      scan_status: m.scan_status,
      metadata_scrubbed: m.metadata_scrubbed,
    })),
  });

  return {
    mode: "supabase",
    content_id: item.id,
    slug: item.slug,
    kind,
    published_revision_id: item.published_revision_id ?? null,
    archived_at: item.archived_at ?? null,
    revision_id: rev.id,
    version_no: rev.version_no,
    title: rev.title,
    summary: rev.summary ?? "",
    target_grades: normalizeGrades(rev.target_grades),
    body_json: asObject(rev.body_json),
    metadata_json: asObject(rev.metadata_json),
    status,
    created_at: rev.created_at,
    published_at: rev.published_at ?? null,
    sibling_revisions: (siblingRows ?? []).map((sr) => ({
      revision_id: sr.id,
      version_no: sr.version_no,
      status: sr.status as ContentStatus,
      created_at: sr.created_at,
    })),
    sources,
    media,
    links,
    reviews,
    site_location: siteLocRow
      ? {
          area_label: siteLocRow.area_label,
          display_lat: siteLocRow.display_lat,
          display_lon: siteLocRow.display_lon,
          precision_label: siteLocRow.precision_label,
          display_zoom_max: siteLocRow.display_zoom_max,
          clearance_review_id: siteLocRow.clearance_review_id,
          clearance_approved: clearanceApproved,
        }
      : null,
    publish_gate: publishGate,
    available_sources: (allSources ?? []).map((s) => ({
      id: s.id,
      citation_text: s.citation_text,
      url: s.url ?? null,
      doi: s.doi ?? null,
      accessed_at: s.accessed_at ?? null,
      source_type: s.source_type,
    })),
    available_media: (allMedia ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      storage_bucket: m.storage_bucket,
      storage_path: m.storage_path,
      visibility: m.visibility as "private" | "public",
      scan_status: m.scan_status as "quarantine" | "cleared" | "rejected",
      metadata_scrubbed: Boolean(m.metadata_scrubbed_at),
      credit: m.credit ?? "",
      license: m.license ?? "",
    })),
    available_link_targets: (allItems ?? []).map((i) => ({
      id: i.id,
      slug: i.slug,
      kind: i.kind as ContentKind,
      title: titleByContentId.get(i.id) ?? i.slug,
    })),
  };
}

export async function getAdminRevisionByIdAsync(
  session: AdminSessionResult,
  revisionId: string
): Promise<AdminRevisionDetail | null> {
  return getAdminRevisionDetailAsync(session, "", revisionId);
}

export async function listAdminSourcesAsync(
  session: AdminSessionResult
): Promise<{ items: AdminSourceOption[]; mode: "supabase" | "local_demo" }> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    return {
      mode: "local_demo",
      items: Object.values(SAMPLE_SOURCES).map((s) => ({
        id: s.id,
        citation_text: s.citation_text,
        url: null,
        doi: null,
        accessed_at: null,
        source_type: s.source_type,
      })),
    };
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client) {
    return { mode: "supabase", items: [] };
  }

  const { data, error } = await client
    .schema("app")
    .from("source_references")
    .select("id, citation_text, url, doi, accessed_at, source_type")
    .order("citation_text", { ascending: true })
    .limit(200);

  if (error) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return { mode: "supabase", items: [] };
    }
    throw new Error(`Gagal membaca rujukan sumber: ${error.message}`);
  }

  return {
    mode: "supabase",
    items: (data ?? []).map((s) => ({
      id: s.id,
      citation_text: s.citation_text,
      url: s.url ?? null,
      doi: s.doi ?? null,
      accessed_at: s.accessed_at ?? null,
      source_type: s.source_type,
    })),
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
      "Mutasi CMS memerlukan koneksi Supabase yang terkonfigurasi (mode demo lokal bersifat baca-saja)."
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

export async function createContentItemWithDraftAsync(
  session: AdminSessionResult,
  input: {
    kind: ContentKind;
    slug: string;
    title: string;
    summary: string;
    target_grades: Array<3 | 4>;
    body_json: Record<string, unknown>;
    metadata_json: Record<string, unknown>;
    requestId: string;
  }
): Promise<{ content_id: string; revision_id: string; version_no: number }> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("create_content_item_with_draft", {
      p_actor_id: actorId,
      p_kind: input.kind,
      p_slug: input.slug,
      p_title: input.title,
      p_summary: input.summary,
      p_target_grades: input.target_grades,
      p_body_json: input.body_json,
      p_metadata_json: input.metadata_json,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal membuat konten: ${error.message}`)
    );
  }

  return data as { content_id: string; revision_id: string; version_no: number };
}

export async function createNewContentRevisionAsync(
  session: AdminSessionResult,
  input: {
    contentId: string;
    sourceRevisionId?: string;
    requestId: string;
  }
): Promise<{ content_id: string; revision_id: string; version_no: number }> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("create_new_content_revision", {
      p_actor_id: actorId,
      p_content_id: input.contentId,
      p_source_revision_id: input.sourceRevisionId ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal membuat revisi baru: ${error.message}`)
    );
  }

  return data as { content_id: string; revision_id: string; version_no: number };
}

export async function updateDraftRevisionAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    title: string;
    summary: string;
    target_grades: Array<3 | 4>;
    body_json: Record<string, unknown>;
    metadata_json: Record<string, unknown>;
    sources?: Array<{ source_id: string; locator: string; note: string }>;
    media?: Array<{
      asset_id: string;
      role: string;
      alt_text: string;
      caption: string;
      sort_order: number;
    }>;
    links?: Array<{
      target_content_id: string;
      relation_type: string;
      sort_order: number;
    }>;
    requestId: string;
  }
): Promise<string> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("update_content_revision_draft", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_title: input.title,
      p_summary: input.summary,
      p_target_grades: input.target_grades,
      p_body_json: input.body_json,
      p_metadata_json: input.metadata_json,
      p_sources: input.sources ?? null,
      p_media: input.media ?? null,
      p_links: input.links ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal menyimpan draf: ${error.message}`)
    );
  }

  return String(data);
}

export async function transitionContentRevisionAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    expectedStatus: ContentStatus;
    nextStatus: ContentStatus;
    reason?: string;
    requestId: string;
  }
): Promise<{
  revision_id: string;
  content_id: string;
  from_status: ContentStatus;
  to_status: ContentStatus;
  unpublished_live: boolean;
}> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("transition_content_revision", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_expected_status: input.expectedStatus,
      p_next_status: input.nextStatus,
      p_reason: input.reason ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal mengubah status revisi: ${error.message}`)
    );
  }

  return data as {
    revision_id: string;
    content_id: string;
    from_status: ContentStatus;
    to_status: ContentStatus;
    unpublished_live: boolean;
  };
}

export async function addRevisionReviewAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    review_type: ReviewType;
    reviewer_label: string;
    decision: "approved" | "changes_requested" | "rejected";
    notes: string;
    evidence_asset_id?: string | null;
    requestId: string;
  }
): Promise<AdminRevisionReviewRow> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin.schema("api").rpc("add_revision_review", {
    p_actor_id: actorId,
    p_revision_id: input.revisionId,
    p_review_type: input.review_type,
    p_reviewer_label: input.reviewer_label,
    p_decision: input.decision,
    p_notes: input.notes,
    p_evidence_asset_id: input.evidence_asset_id ?? null,
    p_request_id: input.requestId,
  });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal mencatat validasi: ${error.message}`)
    );
  }

  return data as AdminRevisionReviewRow;
}

export async function createSourceReferenceAsync(
  session: AdminSessionResult,
  input: {
    citation_text: string;
    url?: string | null;
    doi?: string | null;
    accessed_at?: string | null;
    source_type: string;
    requestId: string;
  }
): Promise<AdminSourceOption> {
  const { admin, actorId } = requireSupabaseAdminActor(session);
  const { data, error } = await admin
    .schema("api")
    .rpc("upsert_source_reference", {
      p_actor_id: actorId,
      p_citation_text: input.citation_text,
      p_url: input.url || null,
      p_doi: input.doi || null,
      p_accessed_at: input.accessed_at || null,
      p_source_type: input.source_type,
      p_request_id: input.requestId,
    });

  if (error) {
    throw (
      mapAdminCmsPostgresError(error) ??
      new DomainError(503, "TEMPORARILY_UNAVAILABLE", `Gagal menyimpan sumber: ${error.message}`)
    );
  }

  return data as AdminSourceOption;
}

export function revalidatePublicContentPaths(slug?: string): void {
  revalidatePath("/");
  revalidatePath("/ensiklopedia");
  revalidatePath("/jelajah-situs");
  revalidatePath("/media");
  revalidatePath("/ruang-guru");
  revalidatePath("/unduhan");
  if (slug) {
    revalidatePath(`/ensiklopedia/${slug}`);
    revalidatePath(`/jelajah-situs/${slug}`);
  }
}
