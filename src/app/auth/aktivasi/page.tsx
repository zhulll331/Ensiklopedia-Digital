import Link from "next/link";
import { TeacherActivateClient } from "@/components/TeacherActivateClient";
import { isSupabaseConfigured } from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Aktivasi Akun & Kata Sandi Guru | EDMB",
  robots: { index: false, follow: false },
};

export default async function TeacherActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const authMode: "supabase" | "local_demo" = isSupabaseConfigured()
    ? "supabase"
    : "local_demo";

  let initialTeacher: { email: string; displayName: string } | null = null;
  let initialErrorCode: "expired" | "network" | "forbidden" | null =
    sp.error === "network"
      ? "network"
      : sp.error === "expired"
        ? "expired"
        : null;

  if (authMode === "supabase") {
    const supabase = await createAdultSessionSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const admin = createAdminSecretSupabaseClient();
        const profileClient = admin ?? supabase;
        const { data: profile } = await profileClient
          .schema("app")
          .from("profiles")
          .select("role, display_name, status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile?.role === "teacher" && profile.status !== "suspended") {
          initialTeacher = {
            email: user.email ?? "",
            displayName: profile.display_name ?? "Guru EDMB",
          };
          initialErrorCode = null;
        } else if (profile) {
          initialErrorCode = "forbidden";
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#d8eef0] px-3 py-1 text-xs font-bold text-[#0e6f7a]">
              Aktivasi Akun Guru • Cache no-store
            </span>
            <h1>Portal Guru EDMB</h1>
          </div>
          <Link href="/" className="btn-secondary min-h-11 text-xs">
            Beranda Publik
          </Link>
        </header>

        <TeacherActivateClient
          authMode={authMode}
          initialTeacher={initialTeacher}
          initialErrorCode={initialErrorCode}
        />
      </main>
    </div>
  );
}
