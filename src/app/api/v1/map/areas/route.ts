import { apiOk } from "@/lib/server/http";
import { getPublicMapAreasAsync } from "@/modules/content/service";

export async function GET() {
  const areas = await getPublicMapAreasAsync();
  return apiOk({
    notice: "Peta hanya menampilkan perkiraan wilayah umum yang lolos clearance (SEC-16).",
    areas,
  });
}
