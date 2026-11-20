import { getPublicSiteSettingsAsync } from "@/modules/admin/ops-service";

export const revalidate = 60;

export const metadata = {
  title: "Tentang & Privasi | EDMB",
};

export default async function TentangPage() {
  const settings = await getPublicSiteSettingsAsync();

  return (
    <div className="mx-auto max-w-[75rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
          Dokumentasi &amp; Etika
        </p>
        <h1>Tentang EDMB</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Ensiklopedia Digital Megalitik Banyuwangi (EDMB) disusun bersama ahli
          arkeologi, ahli bahasa, dan praktisi pendidikan dasar untuk kelas III
          dan IV SD.
        </p>
      </header>

      <section
        id="privasi"
        className="space-y-3 rounded-[24px] border border-[#d6cec1] bg-white p-6"
      >
        <h2 className="text-xl font-bold text-[#1f2a24]">
          Ringkasan Kebijakan Privasi &amp; Pelindungan Situs
        </h2>
        <p className="max-w-[68ch] text-sm font-semibold text-[#1f2a24]">
          {settings.privacy_notice_summary}
        </p>
        <ul className="max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#3a4640]">
          <li>
            Siswa mengerjakan kuis tanpa membuat akun, tanpa kata sandi, dan
            tanpa email.
          </li>
          <li>
            Pada tugas guru, nama siswa hanya digunakan untuk rekap privat guru
            pemilik tugas dan dihapus otomatis sesuai masa retensi (usulan 90
            hari setelah tugas ditutup).
          </li>
          <li>
            Koordinat presisi tinggalan megalitik tidak dipublikasikan; peta
            hanya menampilkan perkiraan wilayah umum.
          </li>
          <li>
            Pengelola resmi &amp; kontak privasi:{" "}
            <span className="font-semibold text-[#1f2a24]">
              {settings.contact_org_name}
            </span>{" "}
            /{" "}
            <span className="font-semibold text-[#1f2a24]">
              {settings.contact_email}
            </span>
            .
          </li>
        </ul>
      </section>
    </div>
  );
}
