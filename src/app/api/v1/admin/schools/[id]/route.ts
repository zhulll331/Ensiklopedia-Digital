import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { updateSchoolSchema } from "@/modules/admin/people-schemas";
import { updateSchoolAsync } from "@/modules/admin/people-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID sekolah tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = updateSchoolSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data pembaruan sekolah tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const updated = await updateSchoolAsync(session, {
      schoolId: parsedId.data,
      ...parsed.data,
      requestId,
    });

    return apiOk(updated, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
