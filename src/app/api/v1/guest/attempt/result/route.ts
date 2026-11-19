import { apiOk } from "@/lib/server/http";
import { getGuestSessionCookie } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { getGuestResultAsync } from "@/modules/learning/service";

export async function GET() {
  try {
    const token = await getGuestSessionCookie();
    const result = await getGuestResultAsync(token);
    return apiOk(result, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
