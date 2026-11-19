import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { createClassSchema } from "@/modules/identity/types";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import {
  createTeacherClassAsync,
  listTeacherClassesAsync,
  listTeacherSchoolsAsync,
} from "@/modules/learning/service";

export async function GET() {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const [classes, schools] = await Promise.all([
      listTeacherClassesAsync(teacherId),
      listTeacherSchoolsAsync(teacherId),
    ]);
    return apiOk(
      {
        classes,
        schools,
      },
      { noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const body = await request.json().catch(() => null);
    const parsed = createClassSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Data kelas tidak valid.", {
        noStore: true,
      });
    }

    const created = await createTeacherClassAsync(teacherId, parsed.data);
    return apiOk(created, { status: 201, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
