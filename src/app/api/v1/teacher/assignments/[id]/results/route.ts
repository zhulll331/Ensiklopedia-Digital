import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { getTeacherAssignmentResultsAsync } from "@/modules/learning/service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const state = request.nextUrl.searchParams.get("state") ?? undefined;
    const data = await getTeacherAssignmentResultsAsync(teacherId, id, { state });
    return apiOk(data, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
