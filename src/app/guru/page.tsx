import Link from "next/link";
import { TeacherDashboardClient } from "@/components/TeacherDashboardClient";
import { isSupabaseConfigured } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portal Guru | EDMB",
  robots: { index: false, follow: false },
};

export default function GuruDashboardPage() {
  const authMode: "supabase" | "local_demo" = isSupabaseConfigured()
    ? "supabase"
    : "local_demo";

  return (
    <div className="mx-auto max-w-[75rem] space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#d8eef0] px-3 py-1 text-xs font-bold text-[#0e6f7a]">
              Data privat • Cache no-store
            </span>
            <h1>Portal Guru</h1>
          </div>
          <Link href="/" className="btn-secondary">
            Beranda Publik
          </Link>
        </header>

        <TeacherDashboardClient authMode={authMode} />
      </main>
    </div>
  );
}
