import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { annotateTeacherAttemptAsync } from "@/modules/learning/service";

const annotationSchema = z
  .object({
    kind: z.enum(["verified", "invalidated", "name_correction", "note"]),
    reason: z.string().trim().min(3).max(300),
    corrected_name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = annotationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Data anotasi tidak valid.", {
        noStore: true,
      });
    }

    const created = await annotateTeacherAttemptAsync(teacherId, id, parsed.data);
    return apiOk(created, { status: 201, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
