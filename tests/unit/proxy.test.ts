import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { proxy } from "@/proxy";

describe("Proxy Keamanan & Propagasi Cookie Sesi Supabase", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://demo-proj.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_demo_key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("melewati refresh Supabase pada rute admin bila tidak ada cookie sb-*", async () => {
    const req = new NextRequest("http://localhost:3000/admin/masuk");
    const res = await proxy(req);

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("meneruskan cookie sesi yang diperbarui setAll ke downstream requestHeaders & response.cookies", async () => {
    createServerClientMock.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: (
              cookiesToSet: Array<{
                name: string;
                value: string;
                options?: Record<string, unknown>;
              }>
            ) => void;
          };
        }
      ) => ({
        auth: {
          getUser: async () => {
            options.cookies.setAll([
              {
                name: "sb-proj-auth-token.0",
                value: "new_chunk_0",
                options: { path: "/", httpOnly: true, sameSite: "lax" },
              },
              {
                name: "sb-proj-auth-token.1",
                value: "",
                options: { path: "/", maxAge: 0 },
              },
            ]);
            return { data: { user: { id: "admin-1" } }, error: null };
          },
        },
      })
    );

    const req = new NextRequest("http://localhost:3000/admin/guru", {
      headers: {
        cookie:
          "edmb_admin_meta=abc; sb-proj-auth-token.0=old_chunk_0; sb-proj-auth-token.1=stale_chunk_1",
      },
    });

    const res = await proxy(req);

    expect(createServerClientMock).toHaveBeenCalledTimes(1);

    const forwardedCookie = res.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwardedCookie).toContain("sb-proj-auth-token.0=new_chunk_0");
    expect(forwardedCookie).toContain("edmb_admin_meta=abc");
    expect(forwardedCookie).not.toContain("old_chunk_0");
    expect(forwardedCookie).not.toContain("sb-proj-auth-token.1=stale_chunk_1");

    const nonce = res.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    expect(res.headers.get("content-security-policy")).toContain(
      `'nonce-${nonce}'`
    );
    expect(res.headers.get("cache-control")).toContain("no-store");

    expect(res.cookies.get("sb-proj-auth-token.0")?.value).toBe("new_chunk_0");
    expect(res.cookies.get("sb-proj-auth-token.1")?.value).toBe("");
  });

  it("menjaga /tugas bebas dari panggilan auth dewasa serta mempertahankan CSP ketat dan no-referrer", async () => {
    const req = new NextRequest("http://localhost:3000/tugas", {
      headers: {
        cookie: "sb-proj-auth-token=should_be_ignored",
      },
    });

    const res = await proxy(req);

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).not.toContain("youtube-nocookie.com");
    expect(csp).not.toContain("https:");
  });

  it("menerapkan no-store, no-referrer, noindex, dan CSP nonce ketat pada /auth/aktivasi", async () => {
    const req = new NextRequest("https://ensiklopedia-digital.vercel.app/auth/aktivasi");
    const res = await proxy(req);

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");

    const nonce = res.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).not.toContain("youtube-nocookie.com");
  });
});
