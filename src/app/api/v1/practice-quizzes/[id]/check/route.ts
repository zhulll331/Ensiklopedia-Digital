import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { answerEntrySchema } from "@/modules/learning/quiz";
import { mapLearningError } from "@/modules/learning/route-helper";
import { checkPracticeQuizSubmissionAsync } from "@/modules/learning/service";

const practiceCheckSchema = z
  .object({
    answers: z.array(answerEntrySchema).max(50),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = practiceCheckSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Format jawaban latihan tidak sah.", {
        noStore: true,
      });
    }

    const result = await checkPracticeQuizSubmissionAsync(id, parsed.data.answers);
    return apiOk(result, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
