import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listPublicPracticeQuizzesAsync } from "@/modules/learning/service";

export async function GET(request: NextRequest) {
  const gradeParam = request.nextUrl.searchParams.get("grade");
  if (gradeParam && gradeParam !== "3" && gradeParam !== "4") {
    return apiError(400, "INVALID_REQUEST", "Parameter grade harus 3 atau 4.");
  }
  const grade = gradeParam === "3" ? 3 : gradeParam === "4" ? 4 : undefined;
  return apiOk({ items: await listPublicPracticeQuizzesAsync(grade) });
}
