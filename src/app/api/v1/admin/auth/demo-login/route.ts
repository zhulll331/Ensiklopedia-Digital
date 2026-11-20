import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import {
  DEMO_ADMIN_COOKIE_NAME,
  isLocalAdminDemoAllowed,
} from "@/modules/admin/auth";
import { verifyOriginAndCsrf } from "@/modules/learning/auth";
import { mapLearningError } from "@/modules/learning/route-helper";

const demoAdminSchema = z
  .object({
    action: z.enum(["login", "logout"]).default("login"),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    await verifyOriginAndCsrf(request);

    if (!isLocalAdminDemoAllowed()) {
      return apiError(
        404,
        "RESOURCE_NOT_FOUND",
        "Endpoint demo tidak aktif ketika autentikasi produksi digunakan.",
        { noStore: true }
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = demoAdminSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Permintaan demo tidak valid.", {
        noStore: true,
      });
    }

    const cookieStore = await cookies();
    if (parsed.data.action === "logout") {
      cookieStore.delete(DEMO_ADMIN_COOKIE_NAME);
      return apiOk({ signed_in: false }, { noStore: true });
    }

    cookieStore.set(DEMO_ADMIN_COOKIE_NAME, "admin-demo-1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    return apiOk({ signed_in: true, mode: "local_demo" }, { noStore: true });
  } catch (err) {
    return mapLearningError(err);
  }
}
