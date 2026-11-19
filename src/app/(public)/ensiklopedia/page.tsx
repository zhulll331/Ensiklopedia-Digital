import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { listPublishedChaptersAsync } from "@/modules/content/service";

export const revalidate = 60;

export const metadata = {
  title: "Ensiklopedia Buku Digital | EDMB",
};

export default async function EnsiklopediaPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; q?: string }>;
}) {
  const params = await searchParams;
  const activeGrade =
    params.grade === "3" ? 3 : params.grade === "4" ? 4 : undefined;
  const query = params.q ?? "";
  const chapters = await listPublishedChaptersAsync({
    grade: activeGrade,
    q: query,
  });

  return (
    <div className="mx-auto max-w-[75rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
          Buku Digital • Sampel Pengembangan
        </p>
        <h1>Ensiklopedia Megalitik Banyuwangi</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Bacaan berbab untuk siswa kelas III dan IV SD. Bab di bawah memakai
          data sampel non-produksi untuk menguji alur membaca dan pencarian.
        </p>
      </header>

      <search id="cari" className="rounded-[24px] border border-[#d6cec1] bg-white p-5">
        <form
          action="/ensiklopedia"
          method="GET"
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <label htmlFor="cari-materi" className="block text-sm font-bold text-[#1f2a24]">
              Cari judul atau kata kunci
            </label>
            <input
              id="cari-materi"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Contoh: menhir, dolmen, menjaga"
              className="min-h-12 w-full rounded-[10px] border border-[#8b8378] bg-white px-3.5 text-base text-[#1f2a24]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-kelas" className="block text-sm font-bold text-[#1f2a24]">
              Sasaran kelas
            </label>
            <select
              id="filter-kelas"
              name="grade"
              defaultValue={activeGrade ? String(activeGrade) : "all"}
              className="min-h-12 rounded-[10px] border border-[#8b8378] bg-white px-3.5 text-base text-[#1f2a24]"
            >
              <option value="all">Semua (Kelas III &amp; IV)</option>
              <option value="3">Kelas III</option>
              <option value="4">Kelas IV</option>
            </select>
          </div>

          <button type="submit" className="btn-primary min-h-12">
            Cari Materi
          </button>
        </form>
      </search>

      {chapters.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-[#8b8378] bg-white/80 p-8 text-center">
          <h2 className="text-lg font-bold text-[#1f2a24]">
            Belum ada materi untuk filter ini
          </h2>
          <p className="mx-auto mt-2 max-w-[60ch] text-sm text-[#5b6760]">
            Coba hapus kata kunci pencarian atau pilih semua kelas.
          </p>
          <div className="mt-5">
            <Link href="/ensiklopedia" className="btn-secondary">
              Tampilkan Semua Bab
            </Link>
          </div>
        </section>
      ) : (
        <section aria-label="Daftar bab buku digital" className="grid gap-5 md:grid-cols-3">
          {chapters.map((chap) => (
            <article
              key={chap.id}
              className="flex flex-col rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold">
                <span className="rounded-full bg-[#dcebdd] px-3 py-1 text-[#1f4d38]">
                  Kelas {chap.target_grades.join(" & ")}
                </span>
                <span className="inline-flex items-center gap-1 text-[#5b6760]">
                  <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
                  {chap.reading_minutes} menit
                </span>
              </div>

              <h2 className="mt-3 text-lg font-bold text-[#1f2a24]">
                {chap.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#3a4640]">
                {chap.summary}
              </p>

              <div className="mt-auto pt-5">
                <Link
                  href={`/ensiklopedia/${chap.slug}`}
                  className="btn-primary min-h-11 w-full text-sm"
                >
                  <BookOpen size={17} strokeWidth={1.75} aria-hidden="true" />
                  Baca Bab {chap.order}
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
