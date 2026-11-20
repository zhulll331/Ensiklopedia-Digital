import { AdminSettingsClient } from "@/components/admin/AdminSettingsClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminSiteSettingsAsync } from "@/modules/admin/ops-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pengaturan Situs & Kontak Privasi | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const session = await resolveAdminSessionState();
  const overview = await getAdminSiteSettingsAsync(session);

  return (
    <AdminSettingsClient
      initialValues={overview.values}
      initialItems={overview.items}
      mode={overview.mode}
      migrationPending={overview.migrationPending}
    />
  );
}
