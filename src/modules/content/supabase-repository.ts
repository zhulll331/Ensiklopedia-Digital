import "server-only";
import {
  createAdminSecretSupabaseClient,
  createPublicSupabaseClient,
} from "@/lib/server/supabase";
import { validatePublishReadiness } from "./publish-gate";
import type {
  PublicContentSummary,
  PublicMapAreaSummary,
} from "./repository";
import type {
  SampleAdminRevisionRow,
  SampleChapterDetail,
  SampleGlossaryEntry,
  SampleMediaItem,
  SampleResourceItem,
  SampleSiteDetail,
  SampleSource,
  SampleVideoItem,
} from "./sample-data";
import type { ContentKind, ContentStatus, ReviewType } from "./types";

export interface SupabaseReadResult<T> {
  schemaNotReady: boolean;
  data: T;
}

function isSchemaNotReadyError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST106" || error.code === "42P01" || error.code === "3F000") {
    return true;
  }
  const msg = error.message ?? "";
  return /invalid schema|does not exist|could not find the table/i.test(msg);
}

interface JoinedPublishedItemRow {
  id: string;
  kind: ContentKind;
  slug: string;
  published_revision_id: string | null;
  revision: {
    id: string;
    title: string;
    summary: string;
    body_json: Record<string, unknown>;
    target_grades: number[];
    metadata_json: Record<string, unknown>;
    status: ContentStatus;
    published_at: string | null;
  } | null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asGrades(value: number[] | null | undefined): Array<3 | 4> {
  if (!Array.isArray(value)) return [3, 4];
  const filtered = value.filter((g): g is 3 | 4 => g === 3 || g === 4);
  return filtered.length > 0 ? filtered : [3, 4];
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function fetchPublishedItemsByKinds(
  kinds: readonly ContentKind[]
): Promise<SupabaseReadResult<JoinedPublishedItemRow[]>> {
  const client = createPublicSupabaseClient();
  if (!client) {
    return { schemaNotReady: true, data: [] };
  }

  const { data: items, error: itemsErr } = await client
    .schema("app")
    .from("content_items")
    .select("id, kind, slug, published_revision_id")
    .in("kind", [...kinds])
    .is("archived_at", null)
    .not("published_revision_id", "is", null);

  if (itemsErr) {
    if (isSchemaNotReadyError(itemsErr)) {
      return { schemaNotReady: true, data: [] };
    }
    throw new Error(`Gagal membaca konten publik Supabase: ${itemsErr.message}`);
  }

  const revIds = (items ?? [])
    .map((item) => item.published_revision_id)
    .filter((id): id is string => typeof id === "string");

  if (revIds.length === 0) {
    return { schemaNotReady: false, data: [] };
  }

  const { data: revs, error: revErr } = await client
    .schema("app")
    .from("content_revisions")
    .select("id, title, summary, body_json, target_grades, metadata_json, status, published_at")
    .in("id", revIds)
    .eq("status", "published");

  if (revErr) {
    if (isSchemaNotReadyError(revErr)) {
      return { schemaNotReady: true, data: [] };
    }
    throw new Error(`Gagal membaca revisi publik Supabase: ${revErr.message}`);
  }

  const revMap = new Map((revs ?? []).map((r) => [r.id, r]));
  const joined: JoinedPublishedItemRow[] = (items ?? []).map((item) => ({
    id: item.id,
    kind: item.kind as ContentKind,
    slug: item.slug,
    published_revision_id: item.published_revision_id,
    revision: item.published_revision_id
      ? (revMap.get(item.published_revision_id) as JoinedPublishedItemRow["revision"]) ?? null
      : null,
  }));

  return {
    schemaNotReady: false,
    data: joined.filter((j) => j.revision !== null),
  };
}

async function fetchRevisionSources(revisionIds: string[]): Promise<Map<string, SampleSource[]>> {
  const out = new Map<string, SampleSource[]>();
  if (revisionIds.length === 0) return out;
  const client = createPublicSupabaseClient();
  if (!client) return out;

  const { data: links } = await client
    .schema("app")
    .from("revision_sources")
    .select("revision_id, locator, source_id")
    .in("revision_id", revisionIds);

  const sourceIds = Array.from(
    new Set((links ?? []).map((l) => l.source_id).filter(Boolean))
  );
  if (sourceIds.length === 0) return out;

  const { data: refs } = await client
    .schema("app")
    .from("source_references")
    .select("id, citation_text, source_type")
    .in("id", sourceIds);

  const refMap = new Map((refs ?? []).map((r) => [r.id, r]));
  for (const link of links ?? []) {
    const src = refMap.get(link.source_id);
    if (!src) continue;
    const list = out.get(link.revision_id) ?? [];
    list.push({
      id: src.id,
      citation_text: src.citation_text,
      source_type: src.source_type as SampleSource["source_type"],
      locator: link.locator ?? "",
    });
    out.set(link.revision_id, list);
  }
  return out;
}

function matchesQuery(parts: string[], q?: string): boolean {
  if (!q || !q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return parts.some((p) => p.toLowerCase().includes(needle));
}

export async function listPublishedChaptersSupabase(filters?: {
  grade?: 3 | 4;
  q?: string;
}): Promise<SupabaseReadResult<SampleChapterDetail[]>> {
  const res = await fetchPublishedItemsByKinds(["chapter"]);
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };

  const revIds = res.data.map((r) => r.revision!.id);
  const sourcesMap = await fetchRevisionSources(revIds);

  const chapters: SampleChapterDetail[] = res.data
    .map((row, idx) => {
      const rev = row.revision!;
      const body = rev.body_json ?? {};
      const meta = rev.metadata_json ?? {};
      return {
        id: row.id,
        revision_id: rev.id,
        slug: row.slug,
        order: asNumber(meta.order, idx + 1),
        title: rev.title,
        summary: rev.summary,
        reading_minutes: asNumber(meta.reading_minutes, 4),
        target_grades: asGrades(rev.target_grades),
        paragraphs: asStringArray(body.paragraphs),
        glossary_slugs: asStringArray(meta.glossary_slugs),
        preservation_note: asString(
          meta.preservation_note,
          "Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret."
        ),
        sources: sourcesMap.get(rev.id) ?? [],
        status: "published" as const,
        is_sample_seed: true as const,
      };
    })
    .filter((c) => !filters?.grade || c.target_grades.includes(filters.grade))
    .filter((c) => matchesQuery([c.title, c.summary, ...c.paragraphs], filters?.q))
    .sort((a, b) => a.order - b.order);

  return { schemaNotReady: false, data: chapters };
}

export async function getPublishedChapterBySlugSupabase(
  slug: string
): Promise<SupabaseReadResult<SampleChapterDetail | null>> {
  const res = await listPublishedChaptersSupabase();
  if (res.schemaNotReady) return { schemaNotReady: true, data: null };
  return {
    schemaNotReady: false,
    data: res.data.find((c) => c.slug === slug) ?? null,
  };
}

export async function listPublishedSitesSupabase(filters?: {
  type?: string;
  area?: string;
  grade?: 3 | 4;
  q?: string;
}): Promise<SupabaseReadResult<SampleSiteDetail[]>> {
  const res = await fetchPublishedItemsByKinds(["site"]);
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };
  const client = createPublicSupabaseClient();
  if (!client || res.data.length === 0) {
    return { schemaNotReady: false, data: [] };
  }

  const revIds = res.data.map((r) => r.revision!.id);
  const [{ data: locs }, { data: mediaLinks }, sourcesMap] = await Promise.all([
    client
      .schema("app")
      .from("site_public_locations")
      .select("revision_id, area_label, display_lat, display_lon, precision_label, display_zoom_max")
      .in("revision_id", revIds),
    client
      .schema("app")
      .from("content_media")
      .select("revision_id, asset_id, sort_order")
      .in("revision_id", revIds)
      .order("sort_order", { ascending: true }),
    fetchRevisionSources(revIds),
  ]);

  const locMap = new Map((locs ?? []).map((l) => [l.revision_id, l]));
  const mediaMap = new Map<string, string>();
  for (const ml of mediaLinks ?? []) {
    if (!mediaMap.has(ml.revision_id)) {
      mediaMap.set(ml.revision_id, ml.asset_id);
    }
  }

  const sites: SampleSiteDetail[] = res.data
    .filter((row) => locMap.has(row.revision!.id))
    .map((row) => {
      const rev = row.revision!;
      const body = rev.body_json ?? {};
      const meta = rev.metadata_json ?? {};
      const loc = locMap.get(rev.id)!;
      const heritageType = asString(meta.heritage_type, "Menhir") as SampleSiteDetail["heritage_type"];

      return {
        id: row.id,
        revision_id: rev.id,
        slug: row.slug,
        title: rev.title,
        heritage_type: heritageType,
        summary: rev.summary,
        child_narration: asStringArray(body.child_narration),
        scientific_context: asStringArray(body.scientific_context),
        target_grades: asGrades(rev.target_grades),
        preservation_warning: asString(
          meta.preservation_warning,
          "Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret."
        ),
        location: {
          area_label: loc.area_label,
          display_lat: loc.display_lat,
          display_lon: loc.display_lon,
          precision_label: loc.precision_label,
          display_zoom_max: loc.display_zoom_max,
        },
        media_id: mediaMap.get(rev.id) ?? "",
        sources: sourcesMap.get(rev.id) ?? [],
        status: "published" as const,
        is_sample_seed: true as const,
      };
    })
    .filter(
      (s) =>
        !filters?.type ||
        filters.type === "all" ||
        s.heritage_type.toLowerCase() === filters.type.toLowerCase()
    )
    .filter(
      (s) =>
        !filters?.area ||
        filters.area === "all" ||
        s.location.area_label.toLowerCase().includes(filters.area.toLowerCase())
    )
    .filter((s) => !filters?.grade || s.target_grades.includes(filters.grade))
    .filter((s) =>
      matchesQuery([s.title, s.heritage_type, s.summary, s.location.area_label], filters?.q)
    );

  return { schemaNotReady: false, data: sites };
}

export async function getPublishedSiteBySlugSupabase(
  slug: string
): Promise<SupabaseReadResult<SampleSiteDetail | null>> {
  const res = await listPublishedSitesSupabase();
  if (res.schemaNotReady) return { schemaNotReady: true, data: null };
  return {
    schemaNotReady: false,
    data: res.data.find((s) => s.slug === slug) ?? null,
  };
}

export async function getPublicMapAreasSupabase(): Promise<
  SupabaseReadResult<PublicMapAreaSummary[]>
> {
  const res = await listPublishedSitesSupabase();
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };
  return {
    schemaNotReady: false,
    data: res.data.map((s) => ({
      slug: s.slug,
      site_title: s.title,
      heritage_type: s.heritage_type,
      area_label: s.location.area_label,
      display_lat: s.location.display_lat,
      display_lon: s.location.display_lon,
      precision_label: s.location.precision_label,
      display_zoom_max: s.location.display_zoom_max,
    })),
  };
}

export async function listClearedGalleryMediaSupabase(): Promise<
  SupabaseReadResult<SampleMediaItem[]>
> {
  const client = createPublicSupabaseClient();
  if (!client) return { schemaNotReady: true, data: [] };

  const { data: assets, error } = await client
    .schema("app")
    .from("media_assets")
    .select("id, kind, storage_bucket, storage_path, scan_status, width, height, credit, license, metadata_scrubbed_at")
    .eq("visibility", "public")
    .eq("scan_status", "cleared")
    .not("metadata_scrubbed_at", "is", null)
    .in("kind", ["image", "illustration"]);

  if (error) {
    if (isSchemaNotReadyError(error)) return { schemaNotReady: true, data: [] };
    throw new Error(`Gagal membaca media galeri Supabase: ${error.message}`);
  }

  const ids = (assets ?? []).map((a) => a.id);
  const { data: links } =
    ids.length > 0
      ? await client
          .schema("app")
          .from("content_media")
          .select("asset_id, alt_text, caption")
          .in("asset_id", ids)
      : { data: [] };

  const metaMap = new Map((links ?? []).map((l) => [l.asset_id, l]));
  const items: SampleMediaItem[] = (assets ?? []).map((a) => {
    const link = metaMap.get(a.id);
    const { data: pubUrl } = client.storage
      .from(a.storage_bucket)
      .getPublicUrl(a.storage_path);
    return {
      id: a.id,
      title: link?.caption || "Media Terkurasi",
      badge: a.kind === "illustration" ? "Ilustrasi" : "Foto",
      kind: a.kind as "image" | "illustration",
      src: pubUrl.publicUrl,
      alt_text: link?.alt_text || "Media situs megalitik Banyuwangi",
      caption: link?.caption || "",
      credit: a.credit || "Tim EDMB",
      license: a.license || "Internal EDMB",
      scan_status: "cleared",
      metadata_scrubbed: true,
      width: a.width ?? 800,
      height: a.height ?? 600,
    };
  });

  return { schemaNotReady: false, data: items };
}

export async function getMediaByIdSupabase(
  id: string
): Promise<SupabaseReadResult<SampleMediaItem | null>> {
  const res = await listClearedGalleryMediaSupabase();
  if (res.schemaNotReady) return { schemaNotReady: true, data: null };
  return {
    schemaNotReady: false,
    data: res.data.find((m) => m.id === id) ?? null,
  };
}

export async function listPublishedVideosSupabase(): Promise<
  SupabaseReadResult<SampleVideoItem[]>
> {
  const res = await fetchPublishedItemsByKinds(["video"]);
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };

  const videos: SampleVideoItem[] = res.data.map((row) => {
    const rev = row.revision!;
    const body = rev.body_json ?? {};
    const meta = rev.metadata_json ?? {};
    return {
      id: row.id,
      slug: row.slug,
      title: rev.title,
      summary: rev.summary,
      duration_label: asString(meta.duration_label, "02:00"),
      target_grades: asGrades(rev.target_grades),
      poster_src: asString(meta.poster_src, "/images/samples/ilustrasi-menhir-dolmen.svg"),
      poster_alt: asString(meta.poster_alt, rev.title),
      transcript: asStringArray(body.transcript),
      captions_available: Boolean(meta.captions_available),
      status: "published" as const,
    };
  });

  return { schemaNotReady: false, data: videos };
}

export async function listGlossaryTermsSupabase(filters?: {
  q?: string;
  letter?: string;
}): Promise<SupabaseReadResult<SampleGlossaryEntry[]>> {
  const res = await fetchPublishedItemsByKinds(["glossary"]);
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };

  const entries: SampleGlossaryEntry[] = res.data
    .map((row) => {
      const rev = row.revision!;
      const body = rev.body_json ?? {};
      const meta = rev.metadata_json ?? {};
      const term = rev.title.trim();
      return {
        id: row.id,
        slug: row.slug,
        term,
        letter: (term[0] ?? "A").toUpperCase(),
        simple_definition: rev.summary || asString(body.definition),
        context_example: asString(body.context_example),
        related_chapter_slug: asString(meta.related_chapter_slug, "mengenal-zaman-batu-besar"),
        status: "published" as const,
      };
    })
    .filter((g) => !filters?.letter || g.letter === filters.letter.toUpperCase())
    .filter((g) => matchesQuery([g.term, g.simple_definition, g.context_example], filters?.q))
    .sort((a, b) => a.term.localeCompare(b.term, "id"));

  return { schemaNotReady: false, data: entries };
}

export async function listPublishedResourcesSupabase(filters?: {
  type?: "book" | "guide" | "worksheet";
  grade?: 3 | 4;
}): Promise<SupabaseReadResult<SampleResourceItem[]>> {
  const res = await fetchPublishedItemsByKinds(["book", "guide", "worksheet"]);
  if (res.schemaNotReady) return { schemaNotReady: true, data: [] };

  const items: SampleResourceItem[] = res.data
    .map((row) => {
      const rev = row.revision!;
      const body = rev.body_json ?? {};
      const meta = rev.metadata_json ?? {};
      return {
        id: row.id,
        slug: row.slug,
        type: row.kind as "book" | "guide" | "worksheet",
        title: rev.title,
        summary: rev.summary,
        target_grades: asGrades(rev.target_grades),
        duration_minutes: typeof meta.duration_minutes === "number" ? meta.duration_minutes : undefined,
        objectives: asStringArray(body.objectives),
        steps: asStringArray(body.steps),
        file_label: asString(meta.file_label, "Dokumen PDF"),
        file_size_label: asString(meta.file_size_label, "Belum diunggah"),
        version_label: asString(meta.version_label, `v${rev.id.slice(0, 6)}`),
        updated_at_utc: rev.published_at ?? new Date().toISOString(),
        status: "published" as const,
      };
    })
    .filter((r) => !filters?.type || r.type === filters.type)
    .filter((r) => !filters?.grade || r.target_grades.includes(filters.grade));

  return { schemaNotReady: false, data: items };
}

export async function listPublishedContentsSupabase(filters?: {
  kind?: ContentKind;
  grade?: 3 | 4;
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<SupabaseReadResult<{ items: PublicContentSummary[]; nextCursor: string | null }>> {
  const kinds: ContentKind[] = filters?.kind
    ? [filters.kind]
    : ["book", "chapter", "site", "glossary", "video", "guide", "worksheet"];

  const res = await fetchPublishedItemsByKinds(kinds);
  if (res.schemaNotReady) {
    return { schemaNotReady: true, data: { items: [], nextCursor: null } };
  }

  const mapped: PublicContentSummary[] = res.data
    .map((row) => {
      const rev = row.revision!;
      return {
        id: row.id,
        kind: row.kind,
        slug: row.slug,
        title: rev.title,
        summary: rev.summary,
        target_grades: asGrades(rev.target_grades),
      };
    })
    .filter((item) => !filters?.grade || item.target_grades.includes(filters.grade))
    .filter((item) => matchesQuery([item.title, item.summary], filters?.q));

  const offset = filters?.cursor ? Math.max(0, Number.parseInt(filters.cursor, 10) || 0) : 0;
  const limit = filters?.limit ?? 20;
  const sliced = mapped.slice(offset, offset + limit);
  const nextCursor = offset + limit < mapped.length ? String(offset + limit) : null;

  return { schemaNotReady: false, data: { items: sliced, nextCursor } };
}

export async function getPublishedStatsSupabase(): Promise<
  SupabaseReadResult<{ chapters_count: number; sites_count: number; videos_count: number }>
> {
  const res = await fetchPublishedItemsByKinds(["chapter", "site", "video"]);
  if (res.schemaNotReady) {
    return {
      schemaNotReady: true,
      data: { chapters_count: 0, sites_count: 0, videos_count: 0 },
    };
  }
  return {
    schemaNotReady: false,
    data: {
      chapters_count: res.data.filter((r) => r.kind === "chapter").length,
      sites_count: res.data.filter((r) => r.kind === "site").length,
      videos_count: res.data.filter((r) => r.kind === "video").length,
    },
  };
}

export async function listAdminRevisionsSupabase(): Promise<
  SupabaseReadResult<Array<SampleAdminRevisionRow & { publish_gate: ReturnType<typeof validatePublishReadiness> }>>
> {
  const admin = createAdminSecretSupabaseClient();
  if (!admin) return { schemaNotReady: true, data: [] };

  const { data: revisions, error } = await admin
    .schema("app")
    .from("content_revisions")
    .select("id, content_id, version_no, title, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isSchemaNotReadyError(error)) return { schemaNotReady: true, data: [] };
    throw new Error(`Gagal membaca revisi admin: ${error.message}`);
  }

  const contentIds = Array.from(new Set((revisions ?? []).map((r) => r.content_id)));
  const revIds = (revisions ?? []).map((r) => r.id);

  if (revIds.length === 0) {
    return { schemaNotReady: false, data: [] };
  }

  const [{ data: items }, { data: sources }, { data: reviews }, { data: locs }, { data: mediaLinks }] =
    await Promise.all([
      admin.schema("app").from("content_items").select("id, slug, kind").in("id", contentIds),
      admin.schema("app").from("revision_sources").select("revision_id").in("revision_id", revIds),
      admin
        .schema("app")
        .from("review_records")
        .select("revision_id, review_type, decision")
        .in("revision_id", revIds),
      admin
        .schema("app")
        .from("site_public_locations")
        .select("revision_id")
        .in("revision_id", revIds),
      admin
        .schema("app")
        .from("content_media")
        .select("revision_id, asset_id")
        .in("revision_id", revIds),
    ]);

  const assetIds = Array.from(new Set((mediaLinks ?? []).map((m) => m.asset_id)));
  const { data: assets } =
    assetIds.length > 0
      ? await admin
          .schema("app")
          .from("media_assets")
          .select("id, scan_status, metadata_scrubbed_at")
          .in("id", assetIds)
      : { data: [] };

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  const assetMap = new Map((assets ?? []).map((a) => [a.id, a]));
  const locSet = new Set((locs ?? []).map((l) => l.revision_id));

  const rows = (revisions ?? []).map((rev) => {
    const item = itemMap.get(rev.content_id);
    const kind = (item?.kind ?? "page") as ContentKind;
    const status = rev.status as ContentStatus;
    const sourcesCount = (sources ?? []).filter((s) => s.revision_id === rev.id).length;
    const approvedReviews = (reviews ?? [])
      .filter((r) => r.revision_id === rev.id && r.decision === "approved")
      .map((r) => r.review_type as ReviewType);

    const attachedMedia = (mediaLinks ?? [])
      .filter((m) => m.revision_id === rev.id)
      .map((m) => {
        const asset = assetMap.get(m.asset_id);
        return {
          id: m.asset_id,
          scan_status: (asset?.scan_status ?? "quarantine") as "quarantine" | "cleared" | "rejected",
          metadata_scrubbed: Boolean(asset?.metadata_scrubbed_at),
        };
      });

    return {
      revision_id: rev.id,
      content_id: rev.content_id,
      slug: item?.slug ?? rev.content_id,
      kind,
      version_no: rev.version_no,
      title: rev.title,
      status,
      sources_count: sourcesCount,
      approved_reviews: approvedReviews,
      has_location_clearance: locSet.has(rev.id),
      attached_media: attachedMedia,
      updated_at_utc: rev.created_at,
      publish_gate: validatePublishReadiness({
        kind,
        status,
        sourcesCount,
        approvedReviewTypes: approvedReviews,
        hasLocationClearance: locSet.has(rev.id),
        attachedMedia,
      }),
    };
  });

  return { schemaNotReady: false, data: rows };
}
