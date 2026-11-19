import Link from "next/link";
import { Clock, FileText, GraduationCap } from "lucide-react";
import { listPublishedResourcesAsync } from "@/modules/content/service";

export const revalidate = 60;

export const metadata = {
  title: "Ruang Guru | EDMB",
};

export default async function RuangGuruPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const params = await searchParams;
  const activeGrade =
    params.grade === "3" ? 3 : params.grade === "4" ? 4 : undefined;
  const resources = await listPublishedResourcesAsync({ grade: activeGrade });

  return (
    <div className="mx-auto max-w-[75rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-[0.08em] text-[#0e6f7a] uppercase">
            Pendampingan Kelas III &amp; IV
          </p>
          <h1>Ruang Guru &amp; LKPD</h1>
          <p className="max-w-[68ch] text-[#3a4640]">
            Panduan kegiatan kokurikuler dan LKPD terbuka untuk guru. Untuk
            membuat kelas, membuka tugas kuis, dan melihat rekap nilai privat,
            masuk ke Portal Guru.
          </p>
        </div>

        <Link href="/guru" className="btn-primary shrink-0">
          <GraduationCap size={18} strokeWidth={1.75} aria-hidden="true" />
          Masuk ke Portal Guru
        </Link>
      </header>

      <nav aria-label="Filter perangkat ajar berdasarkan kelas" className="flex flex-wrap gap-2">
        <Link
          href="/ruang-guru"
          aria-current={!activeGrade ? "page" : undefined}
          className={!activeGrade ? "btn-primary min-h-11 text-sm" : "btn-secondary min-h-11 text-sm"}
        >
          Semua Kelas
        </Link>
        <Link
          href="/ruang-guru?grade=3"
          aria-current={activeGrade === 3 ? "page" : undefined}
          className={activeGrade === 3 ? "btn-primary min-h-11 text-sm" : "btn-secondary min-h-11 text-sm"}
        >
          Kelas III
        </Link>
        <Link
          href="/ruang-guru?grade=4"
          aria-current={activeGrade === 4 ? "page" : undefined}
          className={activeGrade === 4 ? "btn-primary min-h-11 text-sm" : "btn-secondary min-h-11 text-sm"}
        >
          Kelas IV
        </Link>
      </nav>

      <div className="grid gap-6 md:grid-cols-2">
        {resources.map((item) => (
          <article
            key={item.id}
            className="space-y-4 rounded-[24px] border border-[#d6cec1] bg-white p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <span className="rounded-full bg-[#d8eef0] px-3 py-1 text-[#0e6f7a]">
                {item.type === "guide" ? "Panduan Guru" : "LKPD Siswa"} • Kelas{" "}
                {item.target_grades.join(" & ")}
              </span>
              {item.duration_minutes ? (
                <span className="inline-flex items-center gap-1 text-[#5b6760]">
                  <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
                  ±{item.duration_minutes} menit
                </span>
              ) : null}
            </div>

            <h2 className="text-lg font-bold text-[#1f2a24]">{item.title}</h2>
            <p className="text-sm text-[#3a4640]">{item.summary}</p>

            <div className="space-y-2 rounded-2xl bg-[#faf6ee] p-4 text-sm">
              <h3 className="text-sm font-bold text-[#1f2a24]">Tujuan &amp; Langkah</h3>
              <ul className="list-disc space-y-1 pl-5 text-xs text-[#3a4640]">
                {item.objectives.map((obj, idx) => (
                  <li key={idx}>{obj}</li>
                ))}
              </ul>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-[#3a4640]">
                {item.steps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between border-t border-[#efeae2] pt-3 text-xs text-[#5b6760]">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <FileText size={15} strokeWidth={1.75} aria-hidden="true" />
                {item.file_label} ({item.version_label})
              </span>
              <Link href="/unduhan" className="font-bold text-[#1f4d38] underline">
                Cek di Unduhan
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
