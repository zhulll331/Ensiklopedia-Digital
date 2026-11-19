import { listPublishedResourcesAsync } from "@/modules/content/service";

export const revalidate = 60;

export const metadata = {
  title: "Unduhan | EDMB",
};

export default async function UnduhanPage() {
  const resources = await listPublishedResourcesAsync();

  return (
    <div className="mx-auto max-w-[75rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
          Paket Bacaan &amp; Perangkat
        </p>
        <h1>Pusat Unduhan</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Daftar dokumen PDF buku digital, panduan guru, dan LKPD terkurasi
          beserta ukuran berkas dan versi revisinya.
        </p>
      </header>

      <div className="overflow-x-auto rounded-[24px] border border-[#d6cec1] bg-white p-4 sm:p-6">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="pb-3 text-left text-xs font-semibold text-[#5b6760]">
            Daftar dokumen resmi untuk pembelajaran luring terbatas (belum ada
            PDF final yang diunggah).
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">Dokumen</th>
              <th scope="col" className="py-3 pr-4">Jenis</th>
              <th scope="col" className="py-3 pr-4">Kelas</th>
              <th scope="col" className="py-3 pr-4">Versi</th>
              <th scope="col" className="py-3">Status Berkas</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((res) => (
              <tr key={res.id} className="border-b border-[#efeae2]">
                <td className="py-3.5 pr-4 font-bold text-[#1f2a24]">
                  {res.title}
                </td>
                <td className="py-3.5 pr-4 text-[#3a4640]">
                  {res.type === "guide" ? "Panduan Guru" : "LKPD"}
                </td>
                <td className="py-3.5 pr-4 text-[#3a4640]">
                  Kelas {res.target_grades.join(" & ")}
                </td>
                <td className="py-3.5 pr-4 text-[#3a4640]">
                  {res.version_label}
                </td>
                <td className="py-3.5 text-xs font-semibold text-[#8a5a00]">
                  {res.file_size_label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
