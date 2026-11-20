import { AdminSchoolsClient } from "@/components/admin/AdminSchoolsClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { adminSchoolsQuerySchema } from "@/modules/admin/people-schemas";
import { listAdminSchoolsAsync } from "@/modules/admin/people-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Daftar Sekolah | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (key: string): string | undefined => {
    const val = sp[key];
    return typeof val === "string" ? val : undefined;
  };

  const parsed = adminSchoolsQuerySchema.safeParse({
    status: pick("status") || undefined,
    q: pick("q") || undefined,
  });

  const filters = parsed.success ? parsed.data : {};
  const session = await resolveAdminSessionState();
  const result = await listAdminSchoolsAsync(session, filters);

  return (
    <AdminSchoolsClient
      items={result.items}
      counts={result.counts}
      mode={result.mode}
      migrationPending={result.migrationPending}
      filters={{
        status: filters.status ?? "",
        q: filters.q ?? "",
      }}
    />
  );
}
