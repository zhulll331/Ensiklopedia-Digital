import { AdminSupportClient } from "@/components/admin/AdminSupportClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminSupportOverviewAsync } from "@/modules/admin/support-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mode Dukungan Data Siswa | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminSupportPage() {
  const session = await resolveAdminSessionState();
  const overview = await getAdminSupportOverviewAsync(session);

  return (
    <AdminSupportClient
      assignments={overview.assignments}
      initialSessions={overview.sessions}
      serverNowUtc={overview.server_now_utc}
      mode={overview.mode}
      migrationPending={overview.migrationPending}
    />
  );
}
