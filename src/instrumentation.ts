export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensurePreferredIpv4NetworkConfig } = await import(
      "@/lib/node-network"
    );
    ensurePreferredIpv4NetworkConfig();
  }
}
