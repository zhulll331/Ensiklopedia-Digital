import { z } from "zod";
import { contentKindSchema, contentStatusSchema, reviewTypeSchema } from "./types";

export const publicContentQuerySchema = z.object({
  kind: contentKindSchema.optional(),
  grade: z.coerce.number().int().refine((v) => v === 3 || v === 4, "Grade harus 3 atau 4").optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicSiteQuerySchema = z.object({
  type: z.string().trim().max(60).optional(),
  area: z.string().trim().max(80).optional(),
  grade: z.coerce.number().int().refine((v) => v === 3 || v === 4).optional(),
  q: z.string().trim().max(100).optional(),
});

export const publicGlossaryQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  letter: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]$/, "Huruf harus A-Z")
    .optional(),
});

export const publicResourceQuerySchema = z.object({
  type: z.enum(["book", "guide", "worksheet"]).optional(),
  grade: z.coerce.number().int().refine((v) => v === 3 || v === 4).optional(),
});

export const reviewDecisionSchema = z.enum(["approved", "changes_requested", "rejected"]);

export const createReviewRecordSchema = z
  .object({
    review_type: reviewTypeSchema,
    reviewer_label: z.string().trim().min(2).max(120),
    decision: reviewDecisionSchema,
    notes: z.string().trim().max(1000).default(""),
  })
  .strict();

export const publishRevisionSchema = z
  .object({
    confirm_publish: z.literal(true),
  })
  .strict();

export type PublicContentKind = z.infer<typeof contentKindSchema>;
export type ContentRevisionStatus = z.infer<typeof contentStatusSchema>;
