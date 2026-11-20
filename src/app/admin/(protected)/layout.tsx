import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { AdminShellClient } from "@/components/admin/AdminShellClient";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { requireAdminPage } from "@/modules/admin/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const auth = await requireAdminPage();

  if (auth.forbidden) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12 sm:px-6">
        <main className="space-y-4 rounded-[24px] border border-[#b42318] bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldAlert
              size={24}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-[#b42318]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h1>Akses Ditolak (403)</h1>
              <p className="text-sm text-[#3a4640]">
                Akun yang sedang masuk tidak memiliki peran{" "}
                <strong>admin aktif</strong>. Draf konten dan fungsi publikasi
                dikunci pada sisi server dan database.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <AdminSignOutButton />
            <Link href="/" className="btn-secondary min-h-11 text-xs">
              Beranda Publik
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <AdminShellClient
      mode={auth.session.mode}
      displayName={auth.session.displayName}
    >
      {children}
    </AdminShellClient>
  );
}
