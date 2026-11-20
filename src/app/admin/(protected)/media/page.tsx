import { AdminMediaClient } from "@/components/admin/AdminMediaClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { listAdminMediaAssetsAsync } from "@/modules/admin/media-service";
import { adminMediaQuerySchema } from "@/modules/admin/media-validation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Media & Karantina Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (key: string): string | undefined => {
    const val = sp[key];
    return typeof val === "string" ? val : undefined;
  };

  const parsed = adminMediaQuerySchema.safeParse({
    status: pick("status") || undefined,
    kind: pick("kind") || undefined,
    q: pick("q") || undefined,
  });

  const filters = parsed.success ? parsed.data : {};
  const session = await resolveAdminSessionState();
  const result = await listAdminMediaAssetsAsync(session, filters);

  return (
    <AdminMediaClient
      items={result.items}
      counts={result.counts}
      mode={result.mode}
      migrationPending={result.migrationPending}
      maxBytesByKind={result.maxBytesByKind}
      filters={{
        status: filters.status ?? "",
        kind: filters.kind ?? "",
        q: filters.q ?? "",
      }}
    />
  );
}
