import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { setTeacherSchoolLinkSchema } from "@/modules/admin/people-schemas";
import { setTeacherSchoolLinkAsync } from "@/modules/admin/people-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID guru tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = setTeacherSchoolLinkSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data tautan sekolah tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const updated = await setTeacherSchoolLinkAsync(session, {
      teacherId: parsedId.data,
      schoolId: parsed.data.school_id,
      status: parsed.data.status,
      requestId,
    });

    return apiOk(updated, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
