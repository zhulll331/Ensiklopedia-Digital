import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { upsertSiteLocationSchema } from "@/modules/admin/site-location";
import {
  deleteSitePublicLocationAsync,
  upsertSitePublicLocationAsync,
} from "@/modules/admin/site-location-service";
import { mapLearningError } from "@/modules/learning/route-helper";

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
      return apiError(400, "INVALID_REQUEST", "ID revisi situs tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = upsertSiteLocationSchema.safeParse(rawBody);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data lokasi wilayah umum tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const saved = await upsertSitePublicLocationAsync(session, {
      revisionId: parsedId.data,
      ...parsed.data,
      requestId,
    });

    return apiOk(saved, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID revisi situs tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const deletedId = await deleteSitePublicLocationAsync(session, {
      revisionId: parsedId.data,
      requestId,
    });

    return apiOk({ deleted_revision_id: deletedId }, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
