import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { getPublicContentBySlugAsync } from "@/modules/content/service";

const SAFE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (!SAFE_SLUG_REGEX.test(slug)) {
    return apiError(400, "INVALID_REQUEST", "Format slug tidak valid.");
  }

  const found = await getPublicContentBySlugAsync(slug);
  if (!found) {
    return apiError(404, "RESOURCE_NOT_FOUND", "Konten tidak ditemukan.");
  }

  return apiOk(found);
}
