import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { createSourceReferenceSchema } from "@/modules/admin/cms-schemas";
import {
  createSourceReferenceAsync,
  listAdminSourcesAsync,
} from "@/modules/admin/cms-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const data = await listAdminSourcesAsync(session);
    return apiOk(data, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const rawBody = await request.json().catch(() => null);
    const parsed = createSourceReferenceSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data sumber rujukan tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const created = await createSourceReferenceAsync(session, {
      citation_text: parsed.data.citation_text,
      url: parsed.data.url ?? null,
      doi: parsed.data.doi ?? null,
      accessed_at: parsed.data.accessed_at ?? null,
      source_type: parsed.data.source_type,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
