import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  updateDraftRevisionSchema,
  validateStructuredContent,
} from "@/modules/admin/cms-schemas";
import {
  getAdminRevisionByIdAsync,
  updateDraftRevisionAsync,
} from "@/modules/admin/cms-service";
import { isRevisionMutable } from "@/modules/content/publish-gate";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const { id } = await context.params;

    const detail = await getAdminRevisionByIdAsync(session, id);
    if (!detail) {
      return apiError(404, "RESOURCE_NOT_FOUND", "Revisi konten tidak ditemukan.", {
        requestId,
        noStore: true,
      });
    }

    return apiOk(detail, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID revisi tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const existing = await getAdminRevisionByIdAsync(session, parsedId.data);
    if (!existing) {
      return apiError(404, "RESOURCE_NOT_FOUND", "Revisi konten tidak ditemukan.", {
        requestId,
        noStore: true,
      });
    }

    if (!isRevisionMutable(existing.status)) {
      return apiError(
        409,
        "STATE_CONFLICT",
        "Revisi berstatus non-draf bersifat immutable. Buat revisi baru (v+1) untuk menyunting.",
        { requestId, noStore: true }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsedBody = updateDraftRevisionSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsedBody.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Payload perubahan draf tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const structured = validateStructuredContent(
      existing.kind,
      parsedBody.data.body_json,
      parsedBody.data.metadata_json
    );
    if (!structured.ok) {
      return apiError(422, "VALIDATION_FAILED", structured.message, {
        requestId,
        noStore: true,
        fieldErrors: structured.fieldErrors,
      });
    }

    await updateDraftRevisionAsync(session, {
      revisionId: parsedId.data,
      title: parsedBody.data.title,
      summary: parsedBody.data.summary,
      target_grades: parsedBody.data.target_grades,
      body_json: structured.body_json,
      metadata_json: structured.metadata_json,
      sources: parsedBody.data.sources,
      media: parsedBody.data.media,
      links: parsedBody.data.links,
      requestId,
    });

    const updated = await getAdminRevisionByIdAsync(session, parsedId.data);
    return apiOk(updated, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
