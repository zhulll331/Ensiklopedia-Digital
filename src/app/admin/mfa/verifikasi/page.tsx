import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { AdminMfaVerifyClient } from "@/components/admin/AdminMfaVerifyClient";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { resolveAdminSessionState } from "@/modules/admin/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verifikasi MFA Admin | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminMfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ reauth?: string }>;
}) {
  const params = await searchParams;
  const wantReauth = params.reauth === "1";

  const session = await resolveAdminSessionState({
    requireRecentReauth: wantReauth,
  });

  if (session.status === "unauthenticated") {
    redirect("/admin/masuk");
  }
  if (session.status === "mfa_enroll_required") {
    redirect("/admin/mfa/daftar");
  }
  if (session.status === "authenticated" && !wantReauth) {
    redirect("/admin");
  }

  if (session.status !== "forbidden" && !session.verifiedFactorId) {
    redirect("/admin/mfa/daftar");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]">
              Keamanan AAL2 • Cache no-store
            </span>
            <h1>Verifikasi Autentikator</h1>
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
          <AdminMfaVerifyClient
            factorId={session.verifiedFactorId!}
            adminEmail={session.email}
            isReauth={wantReauth || session.status === "reauth_required"}
          />
        )}
      </main>
    </div>
  );
}
