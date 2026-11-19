import Link from "next/link";
import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { listAdminRevisionsAsync } from "@/modules/content/service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin & Kurasi | EDMB",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const revisions = await listAdminRevisionsAsync();

  return (
    <div className="mx-auto max-w-[75rem] space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[#fde8e6] px-3 py-1 text-xs font-bold text-[#b42318]">
              Wajib MFA • Cache no-store • Audit Aktif
            </span>
            <h1>Portal Admin &amp; Kurasi CMS</h1>
          </div>
          <Link href="/" className="btn-secondary">
            Beranda Publik
          </Link>
        </header>

        <section className="rounded-2xl bg-[#faf6ee] p-4 text-sm text-[#3a4640]">
          <strong>Alur Publikasi Revisi:</strong> Draf → Penelaahan → Disetujui
          → Terbit → Arsip. Mutasi melalui{" "}
          <code>POST /api/v1/admin/revisions/&#123;id&#125;/publish</code>{" "}
          terkunci sampai sesi admin ber-MFA terverifikasi dan seluruh syarat
          validasi terpenuhi.
        </section>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="pb-3 text-left text-xs font-semibold text-[#5b6760]">
              Pratinjau status revisi CMS (termasuk draf internal yang tidak
              terekspos ke publik).
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">Judul &amp; Slug</th>
                <th scope="col" className="py-3 pr-4">Jenis</th>
                <th scope="col" className="py-3 pr-4">Status</th>
                <th scope="col" className="py-3 pr-4">Gate Validasi</th>
                <th scope="col" className="py-3">Catatan Kekurangan</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((rev) => (
                <tr key={rev.revision_id} className="border-b border-[#efeae2] align-top">
                  <td className="py-3.5 pr-4">
                    <p className="font-bold text-[#1f2a24]">{rev.title}</p>
                    <p className="text-xs text-[#5b6760]">
                      <code>{rev.slug}</code> • v{rev.version_no}
                    </p>
                  </td>
                  <td className="py-3.5 pr-4 text-[#3a4640]">{rev.kind}</td>
                  <td className="py-3.5 pr-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-1 text-xs font-bold text-[#1f2a24]">
                      {rev.status === "published" ? (
                        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <Clock3 size={14} strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {rev.status}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">
                    {rev.status === "published" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-bold text-[#166534]">
                        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        Terbit (Immutable)
                      </span>
                    ) : rev.publish_gate.ready ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-bold text-[#166534]">
                        Siap Terbit
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-1 text-xs font-bold text-[#8a5a00]">
                        <ShieldAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                        Belum Lolos Gate
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 text-xs text-[#3a4640]">
                    {rev.publish_gate.missingRequirements.length === 0 ? (
                      "—"
                    ) : (
                      <ul className="list-disc space-y-1 pl-4">
                        {rev.publish_gate.missingRequirements.map((msg, idx) => (
                          <li key={idx}>{msg}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
