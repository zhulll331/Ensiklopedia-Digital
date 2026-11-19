import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { apiOk } from "@/lib/server/http";
import {
  getGuestSessionCookie,
  GUEST_COOKIE_NAME,
  verifyOriginAndCsrf,
} from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";
import { endGuestSessionAsync } from "@/modules/learning/service";

export async function POST(request: NextRequest) {
  try {
    await verifyOriginAndCsrf(request);

    const token = await getGuestSessionCookie();
    await endGuestSessionAsync(token);

    const cookieStore = await cookies();
    cookieStore.delete(GUEST_COOKIE_NAME);

    return apiOk({ ended: true }, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
