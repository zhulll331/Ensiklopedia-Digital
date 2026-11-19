import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { openOrRotateTeacherAssignmentAsync } from "@/modules/learning/service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const opened = await openOrRotateTeacherAssignmentAsync(teacherId, id, "open");
    return apiOk(opened, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
