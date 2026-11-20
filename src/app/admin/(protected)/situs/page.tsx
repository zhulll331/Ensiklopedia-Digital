import { AdminSitesClient } from "@/components/admin/AdminSitesClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { listAdminSiteLocationsAsync } from "@/modules/admin/site-location-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Situs & Peta Umum Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminSitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const requestedRevision =
    typeof sp.revision === "string" ? sp.revision : null;

  const session = await resolveAdminSessionState();
  const result = await listAdminSiteLocationsAsync(session);

  return (
    <AdminSitesClient
      key={requestedRevision ?? "default"}
      items={result.items}
      initialRevisionId={requestedRevision}
      mode={result.mode}
      migrationPending={result.migrationPending}
    />
  );
}
