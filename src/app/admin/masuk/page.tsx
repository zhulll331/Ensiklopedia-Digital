import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AdminLoginClient } from "@/components/admin/AdminLoginClient";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { isSupabaseConfigured } from "@/lib/server/env";
import {
  isLocalAdminDemoAllowed,
  resolveAdminSessionState,
} from "@/modules/admin/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Masuk Portal Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const session = await resolveAdminSessionState();
  if (session.status === "authenticated") {
    redirect("/admin");
  }
  if (session.status === "mfa_enroll_required") {
    redirect("/admin/mfa/daftar");
  }
  if (session.status === "mfa_verify_required") {
    redirect("/admin/mfa/verifikasi");
  }
  if (session.status === "reauth_required") {
    redirect("/admin/mfa/verifikasi?reauth=1");
  }

  const authMode: "supabase" | "local_demo" = isSupabaseConfigured()
    ? "supabase"
    : "local_demo";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#fde8e6] px-3 py-1 text-xs font-bold text-[#b42318]">
              Khusus Admin • Wajib MFA • Cache no-store
            </span>
            <h1>Portal Admin EDMB</h1>
          </div>
          <Link href="/" className="btn-secondary min-h-11 text-xs">
            Beranda Publik
          </Link>
        </header>

        {session.status === "forbidden" ? (
          <section className="space-y-4 rounded-2xl border border-[#b42318] bg-[#fef3f2] p-5">
            <p className="flex items-center gap-2 font-bold text-[#b42318]">
              <ShieldAlert size={18} strokeWidth={1.75} aria-hidden="true" />
              Akun saat ini tidak memiliki peran admin aktif.
            </p>
            <AdminSignOutButton />
          </section>
        ) : (
          <AdminLoginClient
            authMode={authMode}
            localDemoAllowed={isLocalAdminDemoAllowed()}
          />
        )}
      </main>
    </div>
  );
}
