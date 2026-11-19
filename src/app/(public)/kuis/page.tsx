import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listPublicPracticeQuizzesAsync } from "@/modules/learning/service";

export const revalidate = 60;

export const metadata = {
  title: "Kuis & Latihan | EDMB",
};

export default async function KuisPage() {
  const practiceQuizzes = await listPublicPracticeQuizzesAsync();

  return (
    <div className="mx-auto max-w-[75rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.08em] text-[#8a5a00] uppercase">
          Evaluasi Formatif
        </p>
        <h1>Pilih Jenis Kuis</h1>
        <p className="max-w-[68ch] text-[#3a4640]">
          Kamu bisa berlatih sendiri tanpa nama atau mengerjakan tugas kelas
          menggunakan kode 10 karakter dari gurumu.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="glass-surface space-y-4 rounded-[24px] p-6">
          <span className="inline-block rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]">
            Latihan — nilai tidak disimpan
          </span>
          <h2 className="text-xl font-bold text-[#1f2a24]">Latihan Umum</h2>
          <p className="text-sm text-[#3a4640]">
            Cocok untuk belajar mandiri. Tidak perlu menulis nama dan langsung
            melihat pembahasan setelah selesai.
          </p>

          <ul className="flex list-none flex-col gap-3 p-0 pt-2">
            {practiceQuizzes.map((q) => (
              <li
                key={q.id}
                className="flex flex-col gap-3 rounded-2xl border border-[#d6cec1] bg-white p-4"
              >
                <div>
                  <p className="text-xs font-bold text-[#1f4d38]">
                    Kelas {q.grade} • {q.question_count} soal
                  </p>
                  <h3 className="text-base font-bold text-[#1f2a24]">{q.title}</h3>
                </div>
                <Link
                  href={`/kuis/latihan/${q.slug}`}
                  className="btn-secondary min-h-11 text-sm"
                >
                  Mulai Latihan
                  <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-surface space-y-4 rounded-[24px] p-6">
          <span className="inline-block rounded-full bg-[#dcebdd] px-3 py-1 text-xs font-bold text-[#1f4d38]">
            Tugas Guru — tanpa login siswa
          </span>
          <h2 className="text-xl font-bold text-[#1f2a24]">
            Masuk Tugas Kelas
          </h2>
          <p className="text-sm text-[#3a4640]">
            Sudah punya kode tugas 10 karakter atau tautan QR dari gurumu?
            Masuk di sini lalu tulis namamu agar nilai masuk ke dashboard guru.
          </p>
          <p className="rounded-xl bg-white/90 px-3.5 py-2.5 text-xs text-[#3a4640]">
            Kode sampel untuk mencoba alur lokal: <code>EDMB34ABCD</code>
          </p>
          <div>
            <Link href="/tugas" className="btn-primary">
              Masukkan Kode Tugas
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
