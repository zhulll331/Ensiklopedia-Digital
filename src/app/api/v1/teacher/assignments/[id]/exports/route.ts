import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import {
  consumeRateLimit,
  RATE_LIMIT_POLICIES,
} from "@/lib/server/rate-limit";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { createTeacherCsvExportAsync } from "@/modules/learning/service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const rl = consumeRateLimit(
      `export:${teacherId}`,
      RATE_LIMIT_POLICIES.export.limit,
      RATE_LIMIT_POLICIES.export.windowSeconds
    );
    if (!rl.allowed) {
      return apiError(
        429,
        "RATE_LIMITED",
        "Batas pembuatan ekspor CSV per jam tercapai.",
        { noStore: true, retryAfterSeconds: rl.retryAfterSeconds }
      );
    }

    const { id } = await context.params;
    const job = await createTeacherCsvExportAsync(teacherId, id);
    return apiOk(job, { status: 201, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
