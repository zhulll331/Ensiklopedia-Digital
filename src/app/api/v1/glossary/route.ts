import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listGlossaryTermsAsync } from "@/modules/content/service";
import { publicGlossaryQuerySchema } from "@/modules/content/schemas";

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = publicGlossaryQuerySchema.safeParse(searchParams);

  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Filter glosarium tidak valid.");
  }

  const items = await listGlossaryTermsAsync(parsed.data);
  return apiOk({ items });
}
