import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Compass,
  GraduationCap,
  HelpCircle,
  Play,
} from "lucide-react";
import { getPublishedStatsAsync } from "@/modules/content/service";

export const revalidate = 60;

const FEATURE_CARDS = [
  {
    title: "Buku Digital",
    description:
      "Baca cerita bergambar tentang tinggalan batu megalitik dalam bab pendek.",
    href: "/ensiklopedia",
    icon: BookOpen,
    iconBg: "bg-[#dcebdd]",
    iconColor: "text-[#2f6b4f]",
    accentText: "text-[#1f4d38]",
  },
  {
    title: "Jelajah Situs",
    description:
      "Kenali jenis tinggalan dan wilayah umum situs megalitik di Banyuwangi.",
    href: "/jelajah-situs",
    icon: Compass,
    iconBg: "bg-[#f6dfd2]",
    iconColor: "text-[#d26a3c]",
    accentText: "text-[#8f3d1b]",
  },
  {
    title: "Kuis Seru",
    description:
      "Berlatih menjawab soal pengamatan tanpa login atau masuk ke tugas gurumu.",
    href: "/kuis",
    icon: HelpCircle,
    iconBg: "bg-[#fbefcf]",
    iconColor: "text-[#8a5a00]",
    accentText: "text-[#8a5a00]",
  },
  {
    title: "Ruang Guru",
    description:
      "Panduan kokurikuler, LKPD kelas III dan IV, serta dashboard tugas kelas.",
    href: "/ruang-guru",
    icon: GraduationCap,
    iconBg: "bg-[#d8eef0]",
    iconColor: "text-[#0e6f7a]",
    accentText: "text-[#0e6f7a]",
  },
] as const;

export default async function HomePage() {
  const stats = await getPublishedStatsAsync();
  const hasStats =
    stats.chapters_count > 0 || stats.sites_count > 0 || stats.videos_count > 0;

  return (
    <div className="mx-auto max-w-[75rem] px-4 pt-8 pb-8 sm:px-6 lg:px-8">
      {/* Hero 2 kolom */}
      <section className="grid items-center gap-8 py-6 lg:grid-cols-12 lg:py-10">
        <div className="space-y-5 lg:col-span-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#d6cec1] bg-white/85 px-4 py-1.5 text-sm font-bold text-[#1f4d38]">
            <span
              className="h-2 w-2 rounded-full bg-[#2f6b4f]"
              aria-hidden="true"
            />
            Selamat datang di EDMB
          </p>

          <h1 className="display-hero text-[#1f2a24]">
            Menjelajah{" "}
            <span className="text-[#2f6b4f]">Jejak Megalitik</span> Banyuwangi
          </h1>

          <p className="max-w-[68ch] text-base leading-relaxed text-[#3a4640] sm:text-lg">
            Pelajari warisan batu leluhur di Banyuwangi melalui bacaan ramah anak
            untuk kelas III dan IV SD, peta wilayah umum yang aman, dan kuis
            pendampingan guru.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link href="/ensiklopedia" className="btn-primary">
              Mulai Membaca
              <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {stats.videos_count > 0 ? (
              <Link href="/media?tab=video" className="btn-secondary">
                <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                Tonton Video
              </Link>
            ) : null}
          </div>

          <p aria-hidden="true" className="script-slogan hidden pt-1 sm:block">
            Kenali, Jaga, Lestarikan
          </p>
        </div>

        {/* Ilustrasi hero berlabel sesuai desain (5).md bagian 9.1 */}
        <div className="lg:col-span-5">
          <figure className="glass-surface relative overflow-hidden rounded-[24px] p-6">
            <span className="absolute top-4 right-4 rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]">
              Ilustrasi
            </span>
            <Image
              src="/images/samples/ilustrasi-menhir-dolmen.svg"
              alt="Ilustrasi siluet menhir dan dolmen di alam Banyuwangi"
              width={800}
              height={600}
              priority
              unoptimized
              className="h-auto max-h-60 w-full rounded-2xl bg-[#faf6ee] object-cover"
            />
            <figcaption className="mt-3 text-xs font-semibold text-[#5b6760]">
              Ilustrasi pengantar tinggalan megalitik Banyuwangi (menhir dan
              dolmen). Konten saat ini memakai sampel non-produksi untuk uji alur.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 4 Kartu Fitur Kaca */}
      <section aria-labelledby="heading-modul" className="py-6">
        <h2 id="heading-modul" className="visually-hidden">
          Menu Utama Pembelajaran
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {FEATURE_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="glass-surface card-feature"
              >
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg} ${card.iconColor}`}
                >
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <h3 className={`text-base font-bold sm:text-lg ${card.accentText}`}>
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#3a4640]">
                  {card.description}
                </p>
                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-bold text-[#1f4d38]">
                  Buka
                  <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Tentang EDMB + Statistik Dinamis */}
      <section
        aria-labelledby="heading-tentang"
        className="mt-8 grid items-center gap-6 rounded-[24px] border border-[#d6cec1] bg-white/90 p-6 sm:p-8 lg:grid-cols-12"
      >
        <div className="lg:col-span-4">
          <figure className="relative overflow-hidden rounded-2xl bg-[#faf6ee]">
            <span className="absolute top-3 left-3 rounded-full bg-[#fbefcf] px-3 py-0.5 text-xs font-bold text-[#8a5a00]">
              Ilustrasi
            </span>
            <Image
              src="/images/samples/ilustrasi-peta-wilayah.svg"
              alt="Ilustrasi perkiraan wilayah umum Banyuwangi"
              width={800}
              height={600}
              unoptimized
              className="aspect-[4/3] w-full object-cover"
            />
          </figure>
        </div>

        <div className="space-y-3 lg:col-span-5">
          <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
            Tentang EDMB
          </p>
          <h2 id="heading-tentang" className="text-xl font-bold text-[#1f2a24]">
            Mengenal Warisan Leluhur dengan Aman
          </h2>
          <p className="text-sm leading-relaxed text-[#3a4640]">
            Disusun khusus untuk anak kelas III dan IV SD dengan pendampingan
            kurasi ahli serta perlindungan lokasi agar situs budaya tetap terjaga.
          </p>
          <Link
            href="/tentang"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1f4d38] underline"
          >
            Selengkapnya tentang metode &amp; privasi
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>

        {hasStats ? (
          <div className="grid grid-cols-3 gap-3 lg:col-span-3 lg:grid-cols-1">
            <div className="rounded-2xl bg-[#f0f6f0] p-4">
              <p className="text-2xl font-extrabold text-[#1f4d38]">
                {stats.chapters_count}
              </p>
              <p className="text-xs font-semibold text-[#3a4640]">Bab Sampel</p>
            </div>
            <div className="rounded-2xl bg-[#f6dfd2] p-4">
              <p className="text-2xl font-extrabold text-[#8f3d1b]">
                {stats.sites_count}
              </p>
              <p className="text-xs font-semibold text-[#3a4640]">Situs Umum</p>
            </div>
            <div className="rounded-2xl bg-[#fbefcf] p-4">
              <p className="text-2xl font-extrabold text-[#8a5a00]">
                {stats.videos_count}
              </p>
              <p className="text-xs font-semibold text-[#3a4640]">Video</p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Pilih Kelasmu */}
      <section
        aria-labelledby="heading-kelas"
        className="mt-8 rounded-[24px] border border-[#d6cec1] bg-white/90 p-6 sm:p-8"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-xs font-bold tracking-[0.08em] text-[#8f3d1b] uppercase">
              Pilih Kelasmu
            </p>
            <h2 id="heading-kelas" className="text-xl font-bold text-[#1f2a24]">
              Materi dan Latihan Sesuai Kelas III &amp; IV
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/ensiklopedia?grade=3" className="btn-secondary min-h-12">
              Kelas III SD
            </Link>
            <Link href="/ensiklopedia?grade=4" className="btn-secondary min-h-12">
              Kelas IV SD
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
