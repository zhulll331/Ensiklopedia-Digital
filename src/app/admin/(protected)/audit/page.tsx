import { AdminAuditClient } from "@/components/admin/AdminAuditClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { auditLogsQuerySchema } from "@/modules/admin/ops-schemas";
import { listAdminAuditLogsAsync } from "@/modules/admin/ops-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Log Audit Portal Admin | EDMB",
  robots: { index: false, follow: false },
};

function firstQueryParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function AdminAuditPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await resolveAdminSessionState();
  const sp = await props.searchParams;

  const rawFilters = {
    action: firstQueryParam(sp.action),
    outcome: firstQueryParam(sp.outcome),
    actor_type: firstQueryParam(sp.actor_type),
    from: firstQueryParam(sp.from),
    to: firstQueryParam(sp.to),
    limit: firstQueryParam(sp.limit) || "50",
  };

  const parsed = auditLogsQuerySchema.safeParse(rawFilters);
  const filters = parsed.success
    ? parsed.data
    : {
        action: "",
        outcome: "" as const,
        actor_type: "" as const,
        from: "",
        to: "",
        limit: 50,
      };

  const overview = await listAdminAuditLogsAsync(session, filters);

  return (
    <AdminAuditClient
      logs={overview.logs}
      distinctActions={overview.distinct_actions}
      initialFilters={filters}
      mode={overview.mode}
      migrationPending={overview.migrationPending}
    />
  );
}
