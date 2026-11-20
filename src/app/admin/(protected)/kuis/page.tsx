import { AdminQuizzesClient } from "@/components/admin/AdminQuizzesClient";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { adminQuizzesQuerySchema } from "@/modules/admin/quiz-schemas";
import { listAdminQuizzesAsync } from "@/modules/admin/quiz-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bank Kuis Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (key: string): string | undefined => {
    const val = sp[key];
    return typeof val === "string" ? val : undefined;
  };

  const parsed = adminQuizzesQuerySchema.safeParse({
    grade: pick("grade") || undefined,
    usage_mode: pick("usage_mode") || undefined,
    status: pick("status") || undefined,
    q: pick("q") || undefined,
  });

  const filters = parsed.success ? parsed.data : {};
  const session = await resolveAdminSessionState();
  const result = await listAdminQuizzesAsync(session, filters);

  return (
    <AdminQuizzesClient
      items={result.items}
      counts={result.counts}
      mode={result.mode}
      migrationPending={result.migrationPending}
      filters={{
        grade: filters.grade ?? "",
        usage_mode: filters.usage_mode ?? "",
        status: filters.status ?? "",
        q: filters.q ?? "",
      }}
    />
  );
}
