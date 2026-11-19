import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <a href="#konten-utama" className="skip-link visually-hidden">
        Lewati ke konten utama
      </a>

      {/* Dekorasi bokeh statis sesuai desain (5).md bagian 9.2 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden"
      >
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-[#4a8a68]/25 blur-3xl" />
        <div className="absolute top-12 right-8 h-64 w-64 rounded-full bg-[#e0a526]/25 blur-3xl" />
        <div className="absolute top-52 left-1/3 h-60 w-60 rounded-full bg-[#2aa3ad]/20 blur-3xl" />
      </div>

      <Navbar />

      <main id="konten-utama" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <Footer />
    </div>
  );
}
