import dns from "node:dns";
import net from "node:net";

const TRANSIENT_SOCKET_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

const RETRY_DELAYS_MS = [150, 350] as const;

let networkConfigured = false;

/**
 * Mengutamakan IPv4 dan memperpanjang waktu tunggu fallback family (Happy Eyeballs)
 * agar jaringan dual-stack dengan IPv6 NAT64 bermasalah tidak memutus koneksi dengan ECONNRESET.
 */
export function ensurePreferredIpv4NetworkConfig(): void {
  if (networkConfigured) {
    return;
  }
  networkConfigured = true;

  try {
    if (typeof dns.setDefaultResultOrder === "function") {
      dns.setDefaultResultOrder("ipv4first");
    }
  } catch {
    // Abaikan pada runtime yang tidak mengizinkan perubahan DNS order
  }

  try {
    if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
      net.setDefaultAutoSelectFamilyAttemptTimeout(1500);
    }
  } catch {
    // Abaikan bila runtime tidak menyediakan pengaturan Happy Eyeballs
  }
}

export function isTransientNetworkFetchError(
  error: unknown,
  visited = new Set<unknown>()
): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  if (visited.has(error)) {
    return false;
  }
  visited.add(error);

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    cause?: unknown;
    errors?: unknown;
  };

  if (
    typeof candidate.code === "string" &&
    TRANSIENT_SOCKET_CODES.has(candidate.code)
  ) {
    return true;
  }

  if (
    candidate.name === "TypeError" &&
    typeof candidate.message === "string" &&
    /fetch failed/i.test(candidate.message)
  ) {
    return true;
  }

  if (candidate.cause && isTransientNetworkFetchError(candidate.cause, visited)) {
    return true;
  }

  if (Array.isArray(candidate.errors)) {
    for (const nested of candidate.errors) {
      if (isTransientNetworkFetchError(nested, visited)) {
        return true;
      }
    }
  }

  return false;
}

function canRetryFetchCall(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): boolean {
  if (init?.signal?.aborted) {
    return false;
  }
  if (typeof input !== "string" && !(input instanceof URL)) {
    return false;
  }
  const body = init?.body;
  return body === undefined || body === null || typeof body === "string";
}

export function createResilientSupabaseFetch(
  baseFetch: typeof fetch = globalThis.fetch
): typeof fetch {
  return async function resilientFetch(input, init) {
    ensurePreferredIpv4NetworkConfig();

    const maxRetries = canRetryFetchCall(input, init)
      ? RETRY_DELAYS_MS.length
      : 0;

    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await baseFetch(input, init);
      } catch (err) {
        lastError = err;
        if (
          attempt >= maxRetries ||
          !isTransientNetworkFetchError(err) ||
          init?.signal?.aborted
        ) {
          throw err;
        }
        const delayMs = RETRY_DELAYS_MS[attempt] ?? 350;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  };
}

export const resilientSupabaseFetch: typeof fetch = createResilientSupabaseFetch();
