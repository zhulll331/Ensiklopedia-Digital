import { describe, expect, it, vi } from "vitest";
import {
  createResilientSupabaseFetch,
  isTransientNetworkFetchError,
} from "@/lib/node-network";

describe("Resiliensi Jaringan Supabase (IPv6 NAT64 / ECONNRESET)", () => {
  it("mengenali error soket transient termasuk nested cause dan AggregateError", () => {
    const connReset = new TypeError("fetch failed", {
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    });
    const undiciSocket = new Error("socket closed", {
      cause: Object.assign(new Error("other side closed"), {
        code: "UND_ERR_SOCKET",
      }),
    });
    const agg = new AggregateError(
      [Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" })],
      "All connection attempts failed"
    );

    expect(isTransientNetworkFetchError(connReset)).toBe(true);
    expect(isTransientNetworkFetchError(undiciSocket)).toBe(true);
    expect(isTransientNetworkFetchError(agg)).toBe(true);
    expect(isTransientNetworkFetchError(new TypeError("fetch failed"))).toBe(
      true
    );

    expect(isTransientNetworkFetchError(new Error("Invalid login credentials"))).toBe(
      false
    );
    expect(isTransientNetworkFetchError({ status: 401 })).toBe(false);
    expect(isTransientNetworkFetchError(null)).toBe(false);
  });

  it("melakukan retry saat terjadi ECONNRESET pada request aman hingga berhasil", async () => {
    const econnresetErr = new TypeError("fetch failed", {
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    });
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(econnresetErr)
      .mockRejectedValueOnce(econnresetErr)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const resilientFetch = createResilientSupabaseFetch(baseFetch);
    const res = await resilientFetch("https://demo.supabase.co/auth/v1/user", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });

    expect(res.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(3);
  });

  it("tidak melakukan retry pada respons HTTP 401/4xx dari server", async () => {
    const baseFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));

    const resilientFetch = createResilientSupabaseFetch(baseFetch);
    const res = await resilientFetch("https://demo.supabase.co/auth/v1/token", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.c" }),
    });

    expect(res.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("tidak melakukan retry bila signal dibatalkan atau input/body tidak aman diulang", async () => {
    const err = new TypeError("fetch failed", {
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    });
    const controller = new AbortController();
    controller.abort();

    const baseFetchAborted = vi.fn<typeof fetch>().mockRejectedValue(err);
    const fetchAborted = createResilientSupabaseFetch(baseFetchAborted);
    await expect(
      fetchAborted("https://demo.supabase.co/auth/v1/user", {
        signal: controller.signal,
      })
    ).rejects.toThrow("fetch failed");
    expect(baseFetchAborted).toHaveBeenCalledTimes(1);

    const baseFetchFormData = vi.fn<typeof fetch>().mockRejectedValue(err);
    const fetchFormData = createResilientSupabaseFetch(baseFetchFormData);
    await expect(
      fetchFormData("https://demo.supabase.co/storage/v1/object", {
        method: "POST",
        body: new FormData(),
      })
    ).rejects.toThrow("fetch failed");
    expect(baseFetchFormData).toHaveBeenCalledTimes(1);

    const baseFetchRequest = vi.fn<typeof fetch>().mockRejectedValue(err);
    const fetchRequest = createResilientSupabaseFetch(baseFetchRequest);
    await expect(
      fetchRequest(new Request("https://demo.supabase.co/auth/v1/user"))
    ).rejects.toThrow("fetch failed");
    expect(baseFetchRequest).toHaveBeenCalledTimes(1);
  });
});
