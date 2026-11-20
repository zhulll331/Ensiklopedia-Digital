import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AdminMfaEnrollClient } from "@/components/admin/AdminMfaEnrollClient";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { resolveAdminSessionState } from "@/modules/admin/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pendaftaran MFA Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminMfaEnrollPage() {
  const session = await resolveAdminSessionState();
  if (session.status === "unauthenticated") {
    redirect("/admin/masuk");
  }
  if (session.status === "authenticated") {
    redirect("/admin");
  }
  if (session.status === "mfa_verify_required") {
    redirect("/admin/mfa/verifikasi");
  }
  if (session.status === "reauth_required") {
    redirect("/admin/mfa/verifikasi?reauth=1");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]">
              Langkah 2 dari 2 • Wajib MFA TOTP
            </span>
            <h1>Aktifkan MFA Admin</h1>
          </div>
          <Link href="/" className="btn-secondary min-h-11 text-xs">
            Beranda Publik
          </Link>
        </header>

        {session.status === "forbidden" ? (
          <section className="space-y-4 rounded-2xl border border-[#b42318] bg-[#fef3f2] p-5">
            <p className="flex items-center gap-2 font-bold text-[#b42318]">
              <ShieldAlert size={18} strokeWidth={1.75} aria-hidden="true" />
              Akun tidak memiliki peran admin aktif.
            </p>
            <AdminSignOutButton />
          </section>
        ) : (
          <AdminMfaEnrollClient adminEmail={session.email} />
        )}
      </main>
    </div>
  );
}
