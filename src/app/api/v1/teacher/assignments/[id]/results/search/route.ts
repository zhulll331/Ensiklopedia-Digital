import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getAuthenticatedTeacherId } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { getTeacherAssignmentResultsAsync } from "@/modules/learning/service";

const searchResultsSchema = z
  .object({
    state: z.string().trim().max(30).optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

/**
 * Pencarian nama siswa lewat POST body (05_API.md bagian 5)
 * agar nama siswa tidak tercatat di query string URL log server.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const teacherId = await getAuthenticatedTeacherId();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = searchResultsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Parameter pencarian tidak sah.", {
        noStore: true,
      });
    }

    const data = await getTeacherAssignmentResultsAsync(teacherId, id, parsed.data);
    return apiOk(data, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
