import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { selectTeacherResultAsync } from "@/modules/learning/service";

const selectResultSchema = z
  .object({
    selected_attempt_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
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
    const parsed = selectResultSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Pilihan attempt tidak valid.", {
        noStore: true,
      });
    }

    const res = await selectTeacherResultAsync(teacherId, id, parsed.data);
    return apiOk(res, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
