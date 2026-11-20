import "server-only";
import { isSupabaseConfigured } from "@/lib/server/env";
import { logServerEvent } from "@/lib/server/logger";
import * as localRepo from "./repository";
import type { PublicContentSummary, PublicMapAreaSummary } from "./repository";
import * as supaRepo from "./supabase-repository";
import type {
  SampleAdminRevisionRow,
  SampleChapterDetail,
  SampleGlossaryEntry,
  SampleMediaItem,
  SampleResourceItem,
  SampleSiteDetail,
  SampleVideoItem,
} from "./sample-data";
import type { ContentKind } from "./types";

async function withSupabaseFallback<T>(
  opName: string,
  remoteFn: () => Promise<supaRepo.SupabaseReadResult<T>>,
  localFallback: () => T
): Promise<T> {
  if (!isSupabaseConfigured()) {
    return localFallback();
  }

  const remote = await remoteFn();
  if (!remote.schemaNotReady) {
    return remote.data;
  }

  if (process.env.NODE_ENV !== "production") {
    logServerEvent({
      request_id: "boot",
      route: "content-service",
      action: opName,
      outcome: "denied",
      status: 200,
      metadata: {
        reason: "schema_not_ready_fallback_to_local_sample",
      },
    });
    return localFallback();
  }

  return remote.data;
}

export async function listPublishedChaptersAsync(filters?: {
  grade?: 3 | 4;
  q?: string;
}): Promise<SampleChapterDetail[]> {
  return withSupabaseFallback(
    "listPublishedChapters",
    () => supaRepo.listPublishedChaptersSupabase(filters),
    () => localRepo.listPublishedChapters(filters)
  );
}

export async function getPublishedChapterBySlugAsync(
  slug: string
): Promise<SampleChapterDetail | null> {
  return withSupabaseFallback(
    "getPublishedChapterBySlug",
    () => supaRepo.getPublishedChapterBySlugSupabase(slug),
    () => localRepo.getPublishedChapterBySlug(slug)
  );
}

export async function listPublishedSitesAsync(filters?: {
  type?: string;
  area?: string;
  grade?: 3 | 4;
  q?: string;
}): Promise<SampleSiteDetail[]> {
  return withSupabaseFallback(
    "listPublishedSites",
    () => supaRepo.listPublishedSitesSupabase(filters),
    () => localRepo.listPublishedSites(filters)
  );
}

export async function getPublishedSiteBySlugAsync(
  slug: string
): Promise<SampleSiteDetail | null> {
  return withSupabaseFallback(
    "getPublishedSiteBySlug",
    () => supaRepo.getPublishedSiteBySlugSupabase(slug),
    () => localRepo.getPublishedSiteBySlug(slug)
  );
}

export async function getPublicMapAreasAsync(): Promise<PublicMapAreaSummary[]> {
  return withSupabaseFallback(
    "getPublicMapAreas",
    () => supaRepo.getPublicMapAreasSupabase(),
    () => localRepo.getPublicMapAreas()
  );
}

export async function listClearedGalleryMediaAsync(): Promise<SampleMediaItem[]> {
  return withSupabaseFallback(
    "listClearedGalleryMedia",
    () => supaRepo.listClearedGalleryMediaSupabase(),
    () => localRepo.listClearedGalleryMedia()
  );
}

export async function getMediaByIdAsync(id: string): Promise<SampleMediaItem | null> {
  return withSupabaseFallback(
    "getMediaById",
    () => supaRepo.getMediaByIdSupabase(id),
    () => localRepo.getMediaById(id)
  );
}

export async function listPublishedVideosAsync(): Promise<SampleVideoItem[]> {
  return withSupabaseFallback(
    "listPublishedVideos",
    () => supaRepo.listPublishedVideosSupabase(),
    () => localRepo.listPublishedVideos()
  );
}

export async function listGlossaryTermsAsync(filters?: {
  q?: string;
  letter?: string;
}): Promise<SampleGlossaryEntry[]> {
  return withSupabaseFallback(
    "listGlossaryTerms",
    () => supaRepo.listGlossaryTermsSupabase(filters),
    () => localRepo.listGlossaryTerms(filters)
  );
}

export async function listPublishedResourcesAsync(filters?: {
  type?: "book" | "guide" | "worksheet";
  grade?: 3 | 4;
}): Promise<SampleResourceItem[]> {
  return withSupabaseFallback(
    "listPublishedResources",
    () => supaRepo.listPublishedResourcesSupabase(filters),
    () => localRepo.listPublishedResources(filters)
  );
}

export async function listPublishedContentsAsync(filters?: {
  kind?: ContentKind;
  grade?: 3 | 4;
  q?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: PublicContentSummary[]; nextCursor: string | null }> {
  return withSupabaseFallback(
    "listPublishedContents",
    () => supaRepo.listPublishedContentsSupabase(filters),
    () => localRepo.listPublishedContents(filters)
  );
}

export async function getPublicContentBySlugAsync(slug: string) {
  if (!isSupabaseConfigured()) {
    return localRepo.getPublicContentBySlug(slug);
  }
  const chapter = await getPublishedChapterBySlugAsync(slug);
  if (chapter) return { kind: "chapter" as const, item: chapter };

  const site = await getPublishedSiteBySlugAsync(slug);
  if (site) return { kind: "site" as const, item: site };

  const videos = await listPublishedVideosAsync();
  const video = videos.find((v) => v.slug === slug);
  if (video) return { kind: "video" as const, item: video };

  const resources = await listPublishedResourcesAsync();
  const resource = resources.find((r) => r.slug === slug);
  if (resource) return { kind: resource.type, item: resource };

  return null;
}

export async function getPublishedStatsAsync() {
  return withSupabaseFallback(
    "getPublishedStats",
    () => supaRepo.getPublishedStatsSupabase(),
    () => localRepo.getPublishedStats()
  );
}

export async function listAdminRevisionsAsync(): Promise<
  Array<SampleAdminRevisionRow & { publish_gate: ReturnType<typeof localRepo.listAdminRevisions>[number]["publish_gate"] }>
> {
  if (!isSupabaseConfigured()) {
    return localRepo.listAdminRevisions();
  }
  const remote = await supaRepo.listAdminRevisionsSupabase();
  if (!remote.schemaNotReady) {
    return remote.data;
  }
  if (process.env.NODE_ENV !== "production") {
    return localRepo.listAdminRevisions();
  }
  return remote.data;
}
