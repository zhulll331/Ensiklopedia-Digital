import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { createAdminSecretSupabaseClient } from "@/lib/server/supabase";
import { requireAdminApi } from "@/modules/admin/auth";
import { mapAdminCmsPostgresError } from "@/modules/admin/cms-schemas";
import {
  getAdminRevisionByIdAsync,
  revalidatePublicContentPaths,
} from "@/modules/admin/cms-service";
import { publishRevisionSchema } from "@/modules/content/schemas";
import { mapLearningError } from "@/modules/learning/route-helper";

/**
 * Endpoint publikasi atomik admin (05_API.md bagian 6 & SEC-03/SEC-04).
 * Wajib sesi admin aktif + MFA (AAL2) + recent reauth + CSRF; ditolak bila tidak berwenang.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, {
      requireCsrf: true,
      requireRecentReauth: true,
    });

    const { id } = await context.params;
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return apiError(400, "INVALID_REQUEST", "ID revisi tidak valid.", {
        requestId,
        noStore: true,
      });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = publishRevisionSchema.safeParse(body);
    if (!parsedBody.success) {
      return apiError(
        422,
        "VALIDATION_FAILED",
        "Konfirmasi publikasi eksplisit wajib dikirim.",
        { requestId, noStore: true }
      );
    }

    const admin = createAdminSecretSupabaseClient();
    if (!admin || !session.userId) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Layanan publikasi admin belum dikonfigurasi.",
        { requestId, noStore: true }
      );
    }

    const { data, error: rpcError } = await admin
      .schema("api")
      .rpc("publish_content_revision", {
        p_revision_id: parsedId.data,
        p_actor_id: session.userId,
        p_request_id: requestId,
      });

    if (rpcError) {
      const mapped = mapAdminCmsPostgresError(rpcError);
      return mapLearningError(mapped ?? rpcError);
    }

    const publishedRev = await getAdminRevisionByIdAsync(session, parsedId.data);
    revalidatePublicContentPaths(publishedRev?.slug);

    return apiOk({ revision_id: data }, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
