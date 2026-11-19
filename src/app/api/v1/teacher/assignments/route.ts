import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import {
  createTeacherAssignmentAsync,
  listTeacherAssignmentsAsync,
} from "@/modules/learning/service";

const createAssignmentSchema = z
  .object({
    class_id: z.string().min(1),
    quiz_revision_id: z.string().min(1),
    title: z.string().trim().min(2).max(160),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
    session_minutes: z.number().int().min(10).max(180).optional(),
    consent_confirmed: z.boolean(),
  })
  .strict();

export async function GET() {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    return apiOk(
      { items: await listTeacherAssignmentsAsync(teacherId) },
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
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Data pembuatan tugas tidak valid.", {
        noStore: true,
      });
    }

    const created = await createTeacherAssignmentAsync(teacherId, parsed.data);
    return apiOk(created, { status: 201, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
