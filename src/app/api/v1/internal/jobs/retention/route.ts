import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiOk, createRequestId } from "@/lib/server/http";
import { getServerEnv } from "@/lib/server/env";
import { logServerEvent } from "@/lib/server/logger";
import { runRetentionPurgeAsync } from "@/modules/learning/service";

function isAuthorizedCron(authHeader: string | null, expectedSecret: string): boolean {
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

/**
 * Job retensi terjadwal (05_API.md bagian 6 & AT-22).
 * Membutuhkan header Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  const secret = getServerEnv().CRON_SECRET;

  if (!secret || !isAuthorizedCron(request.headers.get("authorization"), secret)) {
    logServerEvent({
      request_id: requestId,
      route: "/api/v1/internal/jobs/retention",
      action: "retention_purge",
      outcome: "denied",
      status: 401,
    });
    return apiError(401, "AUTH_REQUIRED", "Kredensial job internal tidak valid.", {
      requestId,
      noStore: true,
    });
  }

  const summary = await runRetentionPurgeAsync();
  logServerEvent({
    request_id: requestId,
    route: "/api/v1/internal/jobs/retention",
    action: "retention_purge",
    outcome: "success",
    status: 200,
    metadata: summary,
  });

  return apiOk(summary, { requestId, noStore: true });
}
