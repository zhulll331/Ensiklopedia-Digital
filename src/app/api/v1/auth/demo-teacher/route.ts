import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/lib/server/http";
import { getServerEnv } from "@/lib/server/env";
import { DEMO_TEACHER_COOKIE_NAME } from "@/modules/learning/auth";

const demoLoginSchema = z.object({
  teacher_id: z.enum(["teacher-demo-1", "teacher-demo-2"]).optional(),
  action: z.enum(["login", "logout"]).default("login"),
});

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  const isLocalDemoAllowed =
    !(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) &&
    (process.env.NODE_ENV !== "production" || process.env.EDMB_ALLOW_LOCAL_DEMO === "1");

  if (!isLocalDemoAllowed) {
    return apiError(
      404,
      "RESOURCE_NOT_FOUND",
      "Endpoint demo tidak aktif ketika autentikasi produksi digunakan.",
      { noStore: true }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = demoLoginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Permintaan demo tidak valid.", {
      noStore: true,
    });
  }

  const cookieStore = await cookies();
  if (parsed.data.action === "logout") {
    cookieStore.delete(DEMO_TEACHER_COOKIE_NAME);
    return apiOk({ signed_in: false }, { noStore: true });
  }

  const teacherId = parsed.data.teacher_id ?? "teacher-demo-1";
  cookieStore.set(DEMO_TEACHER_COOKIE_NAME, teacherId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return apiOk({ signed_in: true, teacher_id: teacherId }, { noStore: true });
}
