import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listPublishedContentsAsync } from "@/modules/content/service";
import { publicContentQuerySchema } from "@/modules/content/schemas";

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = publicContentQuerySchema.safeParse(searchParams);

  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Parameter kueri konten tidak valid.", {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join(".") || "query", issue.message])
      ),
    });
  }

  const { kind, grade, q, cursor, limit } = parsed.data;
  const result = await listPublishedContentsAsync({
    kind,
    grade: grade === 3 || grade === 4 ? grade : undefined,
    q,
    cursor,
    limit,
  });

  return apiOk(
    {
      items: result.items,
    },
    { nextCursor: result.nextCursor }
  );
}
