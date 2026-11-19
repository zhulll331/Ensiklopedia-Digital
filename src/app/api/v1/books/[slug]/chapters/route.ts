import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/server/http";
import { listPublishedChaptersAsync } from "@/modules/content/service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  if (slug !== "ensiklopedia-megalitik-banyuwangi") {
    return apiError(404, "RESOURCE_NOT_FOUND", "Buku tidak ditemukan.");
  }

  const chapters = await listPublishedChaptersAsync();
  return apiOk({
    book_slug: slug,
    chapters,
  });
}
