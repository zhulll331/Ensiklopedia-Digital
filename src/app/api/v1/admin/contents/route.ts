import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import {
  adminContentsQuerySchema,
  createContentItemSchema,
  getDefaultStructuredContent,
  validateStructuredContent,
} from "@/modules/admin/cms-schemas";
import {
  createContentItemWithDraftAsync,
  listAdminContentsAsync,
} from "@/modules/admin/cms-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: false });
    const url = new URL(request.url);
    const parsed = adminContentsQuerySchema.safeParse({
      kind: url.searchParams.get("kind") || undefined,
      status: url.searchParams.get("status") || undefined,
      q: url.searchParams.get("q") || undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return apiError(422, "VALIDATION_FAILED", "Parameter filter tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const result = await listAdminContentsAsync(session, parsed.data);
    return apiOk(
      {
        items: result.items,
        total_count: result.totalCount,
        mode: result.mode,
        migration_pending: result.migrationPending,
      },
      {
        requestId,
        nextCursor: result.nextCursor,
        noStore: true,
      }
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
    const parsed = createContentItemSchema.safeParse(rawBody);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join(".") || "root"] = issue.message;
      }
      return apiError(
        422,
        "VALIDATION_FAILED",
        Object.values(fieldErrors)[0] ?? "Data konten baru tidak valid.",
        { requestId, noStore: true, fieldErrors }
      );
    }

    const defaults = getDefaultStructuredContent(
      parsed.data.kind,
      parsed.data.summary
    );
    const structured = validateStructuredContent(
      parsed.data.kind,
      parsed.data.body_json ?? defaults.body_json,
      parsed.data.metadata_json ?? defaults.metadata_json
    );

    if (!structured.ok) {
      return apiError(422, "VALIDATION_FAILED", structured.message, {
        requestId,
        noStore: true,
        fieldErrors: structured.fieldErrors,
      });
    }

    const created = await createContentItemWithDraftAsync(session, {
      kind: parsed.data.kind,
      slug: parsed.data.slug,
      title: parsed.data.title,
      summary: parsed.data.summary,
      target_grades: parsed.data.target_grades,
      body_json: structured.body_json,
      metadata_json: structured.metadata_json,
      requestId,
    });

    return apiOk(created, { status: 201, requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
