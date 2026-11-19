import { cookies } from "next/headers";
import { apiOk } from "@/lib/server/http";
import { generateOpaqueToken } from "@/lib/server/crypto";

const CSRF_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-edmb_csrf" : "edmb_csrf";

/**
 * Menerbitkan nonce CSRF prasesi berumur pendek (maksimum 15 menit)
 * sesuai kontrak 05_API.md bagian 2 tanpa membawa identitas anak.
 */
export async function GET() {
  const token = generateOpaqueToken(24);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const cookieStore = await cookies();

  cookieStore.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  return apiOk(
    {
      csrf_token: token,
      expires_at: expiresAt.toISOString(),
    },
    { noStore: true }
  );
}
