import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import {
  getServerEnv,
  resetServerEnvCacheForTests,
} from "@/lib/server/env";
import { GET as authCallbackGet } from "@/app/auth/callback/route";

describe("Resolusi PUBLIC_APP_URL & Callback Undangan Guru", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetServerEnvCacheForTests();
  });

  it("memprioritaskan PUBLIC_APP_URL lalu fallback otomatis ke VERCEL_PROJECT_PRODUCTION_URL dan VERCEL_URL", () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ensiklopedia-digital.vercel.app";
    process.env.VERCEL_URL = "ensiklopedia-digital-git-preview.vercel.app";
    resetServerEnvCacheForTests();
    expect(getServerEnv().PUBLIC_APP_URL).toBe(
      "https://ensiklopedia-digital.vercel.app"
    );

    process.env.PUBLIC_APP_URL = "https://portal.edmb.sch.id";
    resetServerEnvCacheForTests();
    expect(getServerEnv().PUBLIC_APP_URL).toBe("https://portal.edmb.sch.id");

    delete process.env.PUBLIC_APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "ensiklopedia-digital-git-preview.vercel.app";
    resetServerEnvCacheForTests();
    expect(getServerEnv().PUBLIC_APP_URL).toBe(
      "https://ensiklopedia-digital-git-preview.vercel.app"
    );

    delete process.env.VERCEL_URL;
    resetServerEnvCacheForTests();
    expect(getServerEnv().PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("meneruskan tautan implicit tanpa code/token_hash ke /auth/aktivasi dengan header no-store & no-referrer dan menolak open redirect", async () => {
    const req = new NextRequest(
      "https://ensiklopedia-digital.vercel.app/auth/callback?next=//evil.example/phish"
    );
    const res = await authCallbackGet(req);

    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("location")).toBe(
      "https://ensiklopedia-digital.vercel.app/auth/aktivasi?next=%2Fguru"
    );
  });
});
