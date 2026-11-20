import { AdminTeachersClient } from "@/components/admin/AdminTeachersClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { adminTeachersQuerySchema } from "@/modules/admin/people-schemas";
import { listAdminTeachersAsync } from "@/modules/admin/people-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manajemen Akun Guru | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminTeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (key: string): string | undefined => {
    const val = sp[key];
    return typeof val === "string" ? val : undefined;
  };

  const parsed = adminTeachersQuerySchema.safeParse({
    status: pick("status") || undefined,
    school_id: pick("school_id") || undefined,
    q: pick("q") || undefined,
  });

  const filters = parsed.success ? parsed.data : {};
  const session = await resolveAdminSessionState();
  const result = await listAdminTeachersAsync(session, filters);

  return (
    <AdminTeachersClient
      items={result.items}
      counts={result.counts}
      schools={result.schools}
      mode={result.mode}
      migrationPending={result.migrationPending}
      filters={{
        status: filters.status ?? "",
        school_id: filters.school_id ?? "",
        q: filters.q ?? "",
      }}
    />
  );
}
