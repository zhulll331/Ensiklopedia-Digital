import { SiteExplorerClient } from "@/components/SiteExplorerClient";
import { listPublishedSitesAsync } from "@/modules/content/service";

export const revalidate = 60;

export const metadata = {
  title: "Jelajah Situs | EDMB",
};

export default async function JelajahSitusPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; grade?: string; q?: string }>;
}) {
  const params = await searchParams;
  const grade = params.grade === "3" ? 3 : params.grade === "4" ? 4 : undefined;
  const type = params.type ?? "all";
  const q = params.q ?? "";

  const sites = await listPublishedSitesAsync({ type, grade, q });

  return (
    <div className="mx-auto max-w-[75rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#8f3d1b] uppercase">
          Katalog &amp; Peta Wilayah Umum
        </p>
        <h1>Jelajah Situs Megalitik</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Untuk melindungi kelestarian cagar budaya, peta hanya menampilkan
          perkiraan wilayah umum yang telah lolos clearance lokasi (tanpa
          koordinat tepat).
        </p>
      </header>

      <search className="rounded-[24px] border border-[#d6cec1] bg-white p-5">
        <form
          action="/jelajah-situs"
          method="GET"
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <label htmlFor="cari-situs" className="block text-sm font-bold text-[#1f2a24]">
              Cari nama atau wilayah
            </label>
            <input
              id="cari-situs"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Contoh: menhir, batu kenong, barat"
              className="min-h-12 w-full rounded-[10px] border border-[#8b8378] px-3.5 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="jenis-situs" className="block text-sm font-bold text-[#1f2a24]">
              Jenis tinggalan
            </label>
            <select
              id="jenis-situs"
              name="type"
              defaultValue={type}
              className="min-h-12 rounded-[10px] border border-[#8b8378] bg-white px-3.5 text-base"
            >
              <option value="all">Semua jenis</option>
              <option value="Menhir">Menhir</option>
              <option value="Dolmen">Dolmen</option>
              <option value="Batu Kenong">Batu Kenong</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="kelas-situs" className="block text-sm font-bold text-[#1f2a24]">
              Kelas
            </label>
            <select
              id="kelas-situs"
              name="grade"
              defaultValue={grade ? String(grade) : "all"}
              className="min-h-12 rounded-[10px] border border-[#8b8378] bg-white px-3.5 text-base"
            >
              <option value="all">Kelas III &amp; IV</option>
              <option value="3">Kelas III</option>
              <option value="4">Kelas IV</option>
            </select>
          </div>

          <button type="submit" className="btn-primary min-h-12">
            Terapkan Filter
          </button>
        </form>
      </search>

      <SiteExplorerClient sites={sites} />
    </div>
  );
}
