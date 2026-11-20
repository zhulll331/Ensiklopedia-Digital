import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  adminSchoolsQuerySchema,
  createSchoolSchema,
} from "@/modules/admin/people-schemas";
import {
  createSchoolAsync,
  listAdminSchoolsAsync,
} from "@/modules/admin/people-service";
import { extractZodFieldErrors } from "@/modules/admin/quiz-schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const url = new URL(request.url);
    const parsed = adminSchoolsQuerySchema.safeParse({
      status: url.searchParams.get("status") || undefined,
      q: url.searchParams.get("q") || undefined,
    });

    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Parameter filter sekolah tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const result = await listAdminSchoolsAsync(session, parsed.data);
    return apiOk(
      {
        items: result.items,
        counts: result.counts,
        mode: result.mode,
        migration_pending: result.migrationPending,
      },
      { requestId, noStore: true }
    );
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const rawBody = await request.json().catch(() => null);
    const parsed = createSchoolSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors = extractZodFieldErrors(parsed.error);
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data sekolah baru tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const created = await createSchoolAsync(session, {
      ...parsed.data,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
