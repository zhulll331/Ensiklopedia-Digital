import { AdminContentsClient } from "@/components/admin/AdminContentsClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { adminContentsQuerySchema } from "@/modules/admin/cms-schemas";
import { listAdminContentsAsync } from "@/modules/admin/cms-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Konten & Revisi Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminContentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (key: string): string | undefined => {
    const val = sp[key];
    return typeof val === "string" ? val : undefined;
  };

  const parsed = adminContentsQuerySchema.safeParse({
    kind: pick("kind") || undefined,
    status: pick("status") || undefined,
    q: pick("q") || undefined,
    cursor: pick("cursor") || undefined,
  });

  const filters = parsed.success ? parsed.data : { limit: 20 };
  const session = await resolveAdminSessionState();
  const result = await listAdminContentsAsync(session, filters);

  return (
    <AdminContentsClient
      initialItems={result.items}
      nextCursor={result.nextCursor}
      totalCount={result.totalCount}
      mode={result.mode}
      migrationPending={result.migrationPending}
      filters={{
        kind: filters.kind ?? "",
        status: filters.status ?? "",
        q: filters.q ?? "",
        cursor: filters.cursor ?? "",
      }}
    />
  );
}
