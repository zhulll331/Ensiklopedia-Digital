import { apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { listTeacherAssignmentQuizzesAsync } from "@/modules/learning/service";

export async function GET() {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    return apiOk(
      { items: await listTeacherAssignmentQuizzesAsync(teacherId) },
      { noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}
