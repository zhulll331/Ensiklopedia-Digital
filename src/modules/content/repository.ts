import "server-only";
import {
  SAMPLE_ADMIN_REVISIONS,
  SAMPLE_CHAPTERS,
  SAMPLE_GLOSSARY,
  SAMPLE_MEDIA,
  SAMPLE_RESOURCES,
  SAMPLE_SITES,
  SAMPLE_VIDEOS,
  type SampleAdminRevisionRow,
  type SampleChapterDetail,
  type SampleGlossaryEntry,
  type SampleMediaItem,
  type SampleResourceItem,
  type SampleSiteDetail,
  type SampleVideoItem,
} from "./sample-data";
import { validatePublishReadiness, type PublishGateResult } from "./publish-gate";
import type { ContentKind } from "./types";

export interface PublicContentSummary {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  summary: string;
  target_grades: Array<3 | 4>;
}

export interface PublicMapAreaSummary {
  slug: string;
  site_title: string;
  heritage_type: string;
  area_label: string;
  display_lat: number;
  display_lon: number;
  precision_label: string;
  display_zoom_max: number;
}

function matchesQuery(textParts: string[], q?: string): boolean {
  if (!q || !q.trim()) {
    return true;
  }
  const needle = q.trim().toLowerCase();
  return textParts.some((part) => part.toLowerCase().includes(needle));
}

export function listPublishedChapters(filters?: {
  grade?: 3 | 4;
  q?: string;
}): SampleChapterDetail[] {
  return SAMPLE_CHAPTERS.filter((c) => c.status === "published")
    .filter((c) => !filters?.grade || c.target_grades.includes(filters.grade))
    .filter((c) => matchesQuery([c.title, c.summary, ...c.paragraphs], filters?.q))
    .sort((a, b) => a.order - b.order);
}

export function getPublishedChapterBySlug(slug: string): SampleChapterDetail | null {
  return (
    SAMPLE_CHAPTERS.find((c) => c.status === "published" && c.slug === slug) ?? null
  );
}

export function listPublishedSites(filters?: {
  type?: string;
  area?: string;
  grade?: 3 | 4;
  q?: string;
}): SampleSiteDetail[] {
  return SAMPLE_SITES.filter((s) => s.status === "published")
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
      matchesQuery(
        [s.title, s.heritage_type, s.summary, s.location.area_label],
        filters?.q
      )
    );
}

export function getPublishedSiteBySlug(slug: string): SampleSiteDetail | null {
  return (
    SAMPLE_SITES.find((s) => s.status === "published" && s.slug === slug) ?? null
  );
}

export function getPublicMapAreas(): PublicMapAreaSummary[] {
  return SAMPLE_SITES.filter((s) => s.status === "published").map((s) => ({
    slug: s.slug,
    site_title: s.title,
    heritage_type: s.heritage_type,
    area_label: s.location.area_label,
    display_lat: s.location.display_lat,
    display_lon: s.location.display_lon,
    precision_label: s.location.precision_label,
    display_zoom_max: s.location.display_zoom_max,
  }));
}

export function listClearedGalleryMedia(): SampleMediaItem[] {
  return SAMPLE_MEDIA.filter(
    (m) => m.scan_status === "cleared" && m.metadata_scrubbed
  );
}

export function getMediaById(id: string): SampleMediaItem | null {
  return (
    SAMPLE_MEDIA.find(
      (m) => m.id === id && m.scan_status === "cleared" && m.metadata_scrubbed
    ) ?? null
  );
}

export function listPublishedVideos(): SampleVideoItem[] {
  return SAMPLE_VIDEOS.filter((v) => v.status === "published");
}

export function listGlossaryTerms(filters?: {
  q?: string;
  letter?: string;
}): SampleGlossaryEntry[] {
  return SAMPLE_GLOSSARY.filter((g) => g.status === "published")
    .filter((g) => !filters?.letter || g.letter === filters.letter.toUpperCase())
    .filter((g) =>
      matchesQuery([g.term, g.simple_definition, g.context_example], filters?.q)
    )
    .sort((a, b) => a.term.localeCompare(b.term, "id"));
}

export function listPublishedResources(filters?: {
  type?: "book" | "guide" | "worksheet";
  grade?: 3 | 4;
}): SampleResourceItem[] {
  return SAMPLE_RESOURCES.filter((r) => r.status === "published")
    .filter((r) => !filters?.type || r.type === filters.type)
    .filter((r) => !filters?.grade || r.target_grades.includes(filters.grade));
}

export function listPublishedContents(filters?: {
  kind?: ContentKind;
  grade?: 3 | 4;
  q?: string;
  limit?: number;
  cursor?: string;
}): { items: PublicContentSummary[]; nextCursor: string | null } {
  const allItems: PublicContentSummary[] = [
    ...listPublishedChapters().map((c) => ({
      id: c.id,
      kind: "chapter" as const,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      target_grades: c.target_grades,
    })),
    ...listPublishedSites().map((s) => ({
      id: s.id,
      kind: "site" as const,
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      target_grades: s.target_grades,
    })),
    ...listGlossaryTerms().map((g) => ({
      id: g.id,
      kind: "glossary" as const,
      slug: g.slug,
      title: g.term,
      summary: g.simple_definition,
      target_grades: [3, 4] as Array<3 | 4>,
    })),
    ...listPublishedVideos().map((v) => ({
      id: v.id,
      kind: "video" as const,
      slug: v.slug,
      title: v.title,
      summary: v.summary,
      target_grades: v.target_grades,
    })),
    ...listPublishedResources().map((r) => ({
      id: r.id,
      kind: r.type,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      target_grades: r.target_grades,
    })),
  ];

  const filtered = allItems
    .filter((item) => !filters?.kind || item.kind === filters.kind)
    .filter((item) => !filters?.grade || item.target_grades.includes(filters.grade))
    .filter((item) => matchesQuery([item.title, item.summary], filters?.q));

  const offset = filters?.cursor ? Math.max(0, Number.parseInt(filters.cursor, 10) || 0) : 0;
  const limit = filters?.limit ?? 20;
  const sliced = filtered.slice(offset, offset + limit);
  const nextCursor = offset + limit < filtered.length ? String(offset + limit) : null;

  return { items: sliced, nextCursor };
}

export function getPublicContentBySlug(slug: string) {
  const chapter = getPublishedChapterBySlug(slug);
  if (chapter) return { kind: "chapter" as const, item: chapter };

  const site = getPublishedSiteBySlug(slug);
  if (site) return { kind: "site" as const, item: site };

  const video = SAMPLE_VIDEOS.find((v) => v.status === "published" && v.slug === slug);
  if (video) return { kind: "video" as const, item: video };

  const resource = SAMPLE_RESOURCES.find(
    (r) => r.status === "published" && r.slug === slug
  );
  if (resource) return { kind: resource.type, item: resource };

  return null;
}

export function getPublishedStats() {
  return {
    chapters_count: SAMPLE_CHAPTERS.filter((c) => c.status === "published").length,
    sites_count: SAMPLE_SITES.filter((s) => s.status === "published").length,
    videos_count: SAMPLE_VIDEOS.filter((v) => v.status === "published").length,
  };
}

export function listAdminRevisions(): Array<
  SampleAdminRevisionRow & { publish_gate: PublishGateResult }
> {
  return SAMPLE_ADMIN_REVISIONS.map((rev) => ({
    ...rev,
    publish_gate: validatePublishReadiness({
      kind: rev.kind,
      status: rev.status,
      sourcesCount: rev.sources_count,
      approvedReviewTypes: rev.approved_reviews,
      hasLocationClearance: rev.has_location_clearance,
      attachedMedia: rev.attached_media,
    }),
  }));
}
