import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/server/env";
import { apiOk, createRequestId } from "@/lib/server/http";
import { createAdultSessionSupabaseClient } from "@/lib/server/supabase";
import {
  clearAdminAuthCookies,
  recordAdminAuditSafe,
  resolveAdminSessionState,
} from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

export async function POST(request: NextRequest) {
  const requestId = createRequestId();
  try {
    await verifyOriginAndCsrf(request);

    let actorId: string | null = null;
    try {
      const session = await resolveAdminSessionState();
      actorId = session.userId ?? null;
    } catch {
      actorId = null;
    }

    if (isSupabaseConfigured()) {
      const supabase = await createAdultSessionSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    }

    await clearAdminAuthCookies();

    if (actorId) {
      await recordAdminAuditSafe({
        actorId,
        action: "admin_logout",
        targetType: "profile",
        targetId: actorId,
        requestId,
        outcome: "success",
      });
    }

    return apiOk({ signed_in: false }, { requestId, noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
