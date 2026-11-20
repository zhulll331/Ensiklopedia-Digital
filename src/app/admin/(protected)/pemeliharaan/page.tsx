import { AdminMaintenanceClient } from "@/components/admin/AdminMaintenanceClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminMaintenanceOverviewAsync } from "@/modules/admin/ops-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pemeliharaan, Retensi & Privasi | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminMaintenancePage() {
  const session = await resolveAdminSessionState();
  const overview = await getAdminMaintenanceOverviewAsync(session);

  return (
    <AdminMaintenanceClient
      initialJobRuns={overview.job_runs}
      initialQueues={overview.queues}
      initialPrivacyRequests={overview.privacy_requests}
      schools={overview.schools}
      dashboardBackupUrl={overview.dashboard_backup_url}
      mode={overview.mode}
      migrationPending={overview.migrationPending}
    />
  );
}
