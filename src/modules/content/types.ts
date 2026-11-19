import { z } from "zod";

export const contentKindSchema = z.enum([
  "book",
  "chapter",
  "site",
  "glossary",
  "video",
  "guide",
  "worksheet",
  "page",
  "news",
]);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const contentStatusSchema = z.enum([
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const reviewTypeSchema = z.enum(["language", "material", "media", "location"]);
export type ReviewType = z.infer<typeof reviewTypeSchema>;

export const publicSiteLocationSchema = z.object({
  area_label: z.string().trim().min(2).max(120),
  display_lat: z.number().min(-12).max(8),
  display_lon: z.number().min(94).max(142),
  precision_label: z.string().default("Perkiraan wilayah umum"),
  display_zoom_max: z.number().int().min(8).max(13).default(12),
});
export type PublicSiteLocation = z.infer<typeof publicSiteLocationSchema>;
