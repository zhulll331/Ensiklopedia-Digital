import { z } from "zod";

export const adultRoleSchema = z.enum(["teacher", "admin"]);
export type AdultRole = z.infer<typeof adultRoleSchema>;

export const profileStatusSchema = z.enum(["invited", "active", "suspended"]);
export type ProfileStatus = z.infer<typeof profileStatusSchema>;

export const gradeSchema = z.union([z.literal(3), z.literal(4)]);
export type TargetGrade = z.infer<typeof gradeSchema>;

export const createClassSchema = z.object({
  school_id: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  grade: gradeSchema,
  academic_year: z.string().regex(/^[0-9]{4}\/[0-9]{4}$/, "Format tahun ajaran harus YYYY/YYYY"),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
