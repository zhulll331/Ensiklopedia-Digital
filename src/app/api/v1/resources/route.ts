import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listPublishedResourcesAsync } from "@/modules/content/service";
import { publicResourceQuerySchema } from "@/modules/content/schemas";

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = publicResourceQuerySchema.safeParse(searchParams);

  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Filter perangkat ajar tidak valid.");
  }

  const { type, grade } = parsed.data;
  const items = await listPublishedResourcesAsync({
    type,
    grade: grade === 3 || grade === 4 ? grade : undefined,
  });

  return apiOk({ items });
}
