import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import { mapPostgresErrorToDomainError } from "@/modules/learning/errors";
import { mapLearningError } from "@/modules/learning/route-helper";

/**
 * Endpoint publikasi atomik admin (05_API.md bagian 6 & SEC-03/SEC-04).
 * Wajib sesi admin aktif + MFA (AAL2); penolakan eksplisit jika belum login atau tidak berwenang.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  const { id } = await context.params;
  const supabase = await createAdultSessionSupabaseClient();
  if (!supabase) {
    return apiError(
      401,
      "AUTH_REQUIRED",
      "Autentikasi admin diperlukan untuk memublikasikan revisi.",
      { requestId, noStore: true }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return apiError(
      401,
      "AUTH_REQUIRED",
      "Sesi admin tidak valid atau sudah berakhir.",
      { requestId, noStore: true }
    );
  }

  const { data: aal, error: mfaError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (mfaError || !aal || aal.currentLevel !== "aal2") {
    return apiError(
      403,
      "ACTION_NOT_ALLOWED",
      `Publikasi revisi ${id} memerlukan peran admin aktif dengan verifikasi MFA.`,
      { requestId, noStore: true }
    );
  }

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return apiError(400, "INVALID_REQUEST", "ID revisi tidak valid.", {
      requestId,
      noStore: true,
    });
  }

  const admin = createAdminSecretSupabaseClient();
  if (!admin) {
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
      p_actor_id: user.id,
      p_request_id: requestId,
    });

  if (rpcError) {
    const mapped = mapPostgresErrorToDomainError(rpcError);
    return mapLearningError(mapped ?? rpcError);
  }

  return apiOk({ revision_id: data }, { requestId, noStore: true });
}
