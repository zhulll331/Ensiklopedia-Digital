import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { requireAdminApi } from "@/modules/admin/auth";
import { cleanupOrphanMediaUploadsAsync } from "@/modules/admin/media-service";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    const session = await requireAdminApi(request, { requireCsrf: true });
    if (session.mode === "local_demo" || !session.userId) {
      return apiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Pembersihan unggahan yatim memerlukan koneksi Supabase aktif.",
        { requestId, noStore: true }
      );
    }

    const summary = await cleanupOrphanMediaUploadsAsync({
      actorId: session.userId,
      olderThanMinutes: 120,
      requestId,
    });

    return apiOk(summary, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
