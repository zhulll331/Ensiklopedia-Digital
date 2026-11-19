import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { closeTeacherAssignmentAsync } from "@/modules/learning/service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const closed = await closeTeacherAssignmentAsync(teacherId, id);
    return apiOk(closed, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
