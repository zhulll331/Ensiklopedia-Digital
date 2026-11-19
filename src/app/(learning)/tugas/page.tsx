import Link from "next/link";
import { StudentTaskClient } from "@/components/StudentTaskClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Masuk ke Tugas | EDMB",
  robots: { index: false, follow: false },
};

export default function TugasPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-10">
      <a href="#form-tugas" className="skip-link visually-hidden">
        Lewati ke area pengerjaan tugas
      </a>

      <main
        id="form-tugas"
        tabIndex={-1}
        className="glass-surface space-y-6 rounded-[24px] p-6 sm:p-8"
      >
        <header className="space-y-2">
          <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
            Tugas Kuis Siswa • Tanpa Login
          </p>
          <h1>Tugas Belajar EDMB</h1>
        </header>

        <StudentTaskClient />

        <footer className="border-t border-[#d6cec1] pt-4 text-sm">
          <Link href="/kuis" className="font-bold text-[#1f4d38] underline">
            Kembali ke halaman Kuis
          </Link>
        </footer>
      </main>
    </div>
  );
}
