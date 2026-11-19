import { apiOk } from "@/lib/server/http";
import { isSupabaseConfigured } from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createPublicSupabaseClient,
} from "@/lib/server/supabase";

const REQUIRED_BUCKETS = [
  "media-public",
  "media-quarantine",
  "exports-private",
] as const;

export async function GET() {
  const configured = isSupabaseConfigured();
  let appReady = false;
  let apiReady = false;
  let storageBucketsReady = false;

  if (configured) {
    try {
      const admin = createAdminSecretSupabaseClient();
      const readClient = admin ?? createPublicSupabaseClient();

      if (readClient) {
        const appCheck = await readClient
          .schema("app")
          .from("site_settings")
          .select("key")
          .limit(1);
        appReady = !appCheck.error;
      }

      if (admin) {
        const [apiCheck, bucketsRes] = await Promise.all([
          admin.schema("api").rpc("resolve_guest_join", { p_code_digest: "0000" }),
          admin.storage.listBuckets(),
        ]);

        apiReady =
          !apiCheck.error ||
          (!/Invalid schema/i.test(apiCheck.error.message) &&
            !/schema.*does not exist/i.test(apiCheck.error.message) &&
            !/Could not find the function/i.test(apiCheck.error.message));

        if (!bucketsRes.error) {
          const names = new Set((bucketsRes.data ?? []).map((b) => b.name));
          storageBucketsReady = REQUIRED_BUCKETS.every((name) => names.has(name));
        }
      }
    } catch {
      // Tetap kembalikan status ringkas tanpa melempar error ke endpoint health
    }
  }

  return apiOk(
    {
      status: "ok",
      service: "edmb-web",
      database_configured: configured,
      auth_mode: configured ? "supabase" : "local_demo",
      schemas_ready: {
        app: appReady,
        api: apiReady,
      },
      storage_buckets_ready: storageBucketsReady,
      timestamp_utc: new Date().toISOString(),
    },
    { noStore: true }
  );
}
