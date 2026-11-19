import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { getPublicPracticeQuizByIdAsync } from "@/modules/learning/service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const quiz = await getPublicPracticeQuizByIdAsync(id);
  if (!quiz) {
    return apiError(404, "RESOURCE_NOT_FOUND", "Kuis latihan tidak ditemukan.");
  }
  return apiOk(quiz);
}
