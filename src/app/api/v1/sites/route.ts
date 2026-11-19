import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listPublishedSitesAsync } from "@/modules/content/service";
import { publicSiteQuerySchema } from "@/modules/content/schemas";

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = publicSiteQuerySchema.safeParse(searchParams);

  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Parameter pencarian situs tidak valid.");
  }

  const { type, area, grade, q } = parsed.data;
  const items = await listPublishedSitesAsync({
    type,
    area,
    grade: grade === 3 || grade === 4 ? grade : undefined,
    q,
  });

  return apiOk({ items });
}
