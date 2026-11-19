import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { revokeTeacherAssignmentAsync } from "@/modules/learning/service";

const revokeSchema = z
  .object({
    reason: z.string().trim().min(5).max(300),
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
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Alasan pencabutan wajib diisi.", {
        noStore: true,
      });
    }

    const revoked = await revokeTeacherAssignmentAsync(teacherId, id, parsed.data.reason);
    return apiOk(revoked, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
