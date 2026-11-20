import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getServerEnv } from "@/lib/server/env";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { logServerEvent } from "@/lib/server/logger";
import { cleanupOrphanMediaUploadsAsync } from "@/modules/admin/media-service";

function isAuthorizedCron(
  authHeader: string | null,
  expectedSecret: string
): boolean {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(authHeader.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const secret = getServerEnv().CRON_SECRET;

  if (!secret || !isAuthorizedCron(request.headers.get("authorization"), secret)) {
    logServerEvent({
      request_id: requestId,
      route: "/api/v1/internal/jobs/media-cleanup",
      action: "media_orphan_cleanup",
      outcome: "denied",
      status: 401,
    });
    return apiError(401, "AUTH_REQUIRED", "Kredensial job internal tidak valid.", {
      requestId,
      noStore: true,
    });
  }

  try {
    const summary = await cleanupOrphanMediaUploadsAsync({
      actorId: null,
      olderThanMinutes: 120,
      requestId,
    });
    logServerEvent({
      request_id: requestId,
      route: "/api/v1/internal/jobs/media-cleanup",
      action: "media_orphan_cleanup",
      outcome: "success",
      status: 200,
      metadata: summary,
    });

    return apiOk(summary, { requestId, noStore: true });
  } catch {
    return apiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Job pembersihan media yatim gagal dijalankan.",
      { requestId, noStore: true }
    );
  }
}
