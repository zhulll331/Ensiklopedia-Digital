import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Compass,
  HelpCircle,
  Play,
  Sparkles,
} from "lucide-react";
import { getPublicSiteSettingsAsync } from "@/modules/admin/ops-service";
import { getPublishedStatsAsync } from "@/modules/content/service";

export const revalidate = 60;

const FEATURE_CARDS = [
  {
    title: "Bacaan Ramah Anak (Kelas III & IV SD)",
    description:
      "Cerita bergambar tentang menhir, dolmen, dan batu kenong dalam bab pendek yang mudah dipahami.",
    href: "/ensiklopedia",
    icon: BookOpen,
    iconBg: "bg-[#dcebdd]",
    iconColor: "text-[#2f6b4f]",
    accentText: "text-[#1f4d38]",
  },
  {
    title: "Peta Wilayah Aman",
    description:
      "Kenali jenis tinggalan dan perkiraan wilayah umum situs megalitik di Banyuwangi tanpa koordinat persis.",
    href: "/jelajah-situs",
    icon: Compass,
    iconBg: "bg-[#f6dfd2]",
    iconColor: "text-[#d26a3c]",
    accentText: "text-[#8f3d1b]",
  },
  {
    title: "Kuis Pendampingan",
    description:
      "Berlatih soal pengamatan secara mandiri atau masuk ke tugas kelas bersama guru tanpa login siswa.",
    href: "/kuis",
    icon: HelpCircle,
    iconBg: "bg-[#fbefcf]",
    iconColor: "text-[#8a5a00]",
    accentText: "text-[#8a5a00]",
  },
  {
    title: "Media Belajar Interaktif",
    description:
      "Video pengantar lapangan, galeri ilustrasi situs, dan glosarium istilah arkeologi ramah anak.",
    href: "/media",
    icon: Sparkles,
    iconBg: "bg-[#d8eef0]",
    iconColor: "text-[#0e6f7a]",
    accentText: "text-[#0e6f7a]",
  },
] as const;

export default async function HomePage() {
  const [stats, settings] = await Promise.all([
    getPublishedStatsAsync(),
    getPublicSiteSettingsAsync(),
  ]);
  const hasStats =
    stats.chapters_count > 0 || stats.sites_count > 0 || stats.videos_count > 0;
  const isDefaultHeroTitle =
    settings.hero_title.trim() === "Menjelajah Jejak Megalitik Banyuwangi";

  return (
    <div>
      {/* Full-bleed blended hero banner */}
      <section
        aria-labelledby="hero-heading"
        className="relative isolate overflow-hidden bg-[#1f4d38] pt-28 pb-32 sm:pt-32 sm:pb-40 lg:pt-36 lg:pb-44"
      >
        {/* Background foto atmosfer situs megalitik di sisi kanan */}
        <div
          aria-hidden="true"
          className="hero-bg-media pointer-events-none absolute inset-y-0 right-0 -z-20 w-full lg:w-[76%]"
        >
          <Image
            src="/images/hero-megalitik-banyuwangi.webp"
            alt=""
            width={1376}
            height={768}
            priority
            fetchPriority="high"
            sizes="(min-width: 1024px) 76vw, 100vw"
            className="h-full w-full object-cover object-center lg:object-[72%_center]"
          />
        </div>

        {/* Overlay gradien horizontal: hijau gelap solid di kiri ke transparan di kanan */}
        <div
          aria-hidden="true"
          className="hero-overlay-horizontal pointer-events-none absolute inset-0 -z-10"
        />

        {/* Subtle ambient glowing bokeh light orbs (tema hijau & aksen hangat) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-20 -left-16 h-80 w-80 rounded-full bg-[#4a8a68]/35 blur-3xl" />
          <div className="absolute top-24 left-[28%] h-72 w-72 rounded-full bg-[#e0a526]/20 blur-3xl" />
          <div className="absolute right-[12%] bottom-20 h-64 w-64 rounded-full bg-[#2aa3ad]/18 blur-3xl" />
        </div>

        {/* Smooth bottom fade ke warna latar halaman bagian bawah */}
        <div
          aria-hidden="true"
          className="hero-overlay-bottom pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-36 sm:h-44"
        />

        <div className="mx-auto max-w-[75rem] px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-5">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-4 py-1.5 text-sm font-bold text-[#f0f6f0] backdrop-blur-md">
              <span
                className="h-2 w-2 rounded-full bg-[#e0a526]"
                aria-hidden="true"
              />
              Selamat datang di EDMB
            </p>

            <h1 id="hero-heading" className="display-hero text-white">
              {isDefaultHeroTitle ? (
                <>
                  Menjelajah{" "}
                  <span className="text-[#e0a526]">Jejak Megalitik</span>{" "}
                  Banyuwangi
                </>
              ) : (
                settings.hero_title
              )}
            </h1>

            <p className="max-w-[62ch] text-base leading-relaxed text-[#efeae2] sm:text-lg">
              {settings.hero_subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/ensiklopedia"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#e0a526] px-6 py-3 font-extrabold text-[#1f2a24] no-underline shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition hover:bg-[#ebb63d]"
              >
                Mulai Membaca
                <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
              </Link>
              <Link
                href="/media?tab=video"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/35 bg-white/12 px-6 py-3 font-bold text-white no-underline backdrop-blur-md transition hover:bg-white/22"
              >
                <Play size={18} strokeWidth={1.75} aria-hidden="true" />
                Tonton Video
              </Link>
            </div>

            <p
              aria-hidden="true"
              className="script-slogan hidden pt-1 text-[#fbefcf] sm:block"
            >
              {settings.hero_slogan}
            </p>
          </div>
        </div>
      </section>

      {/* Konten bawah dengan transisi mulus dari hero */}
      <div className="bg-gradient-to-b from-[#e6f0e7] via-[#faf6ee]/70 to-transparent pb-8">
        <div className="mx-auto max-w-[75rem] px-4 sm:px-6 lg:px-8">
          {/* 4 Kartu Fitur Kaca yang overlap di tepi bawah hero */}
          <section
            aria-labelledby="heading-modul"
            className="relative z-20 -mt-20 sm:-mt-24 lg:-mt-28"
          >
            <h2 id="heading-modul" className="visually-hidden">
              Menu Utama Pembelajaran
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="card-feature rounded-2xl border border-white/70 bg-white/85 shadow-lg backdrop-blur-md"
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
            className="mt-10 grid items-center gap-6 rounded-[24px] border border-[#d6cec1] bg-white/90 p-6 sm:p-8 lg:grid-cols-12"
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
      </div>
    </div>
  );
}
