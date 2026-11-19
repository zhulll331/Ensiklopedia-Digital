import { apiOk } from "@/lib/server/http";
import { getGuestSessionCookie } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { getGuestAttemptStateAsync } from "@/modules/learning/service";

export async function GET() {
  try {
    const token = await getGuestSessionCookie();
    const state = await getGuestAttemptStateAsync(token);
    return apiOk(state, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
