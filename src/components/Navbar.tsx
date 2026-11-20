"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Beranda" },
  { href: "/ensiklopedia", label: "Ensiklopedia" },
  { href: "/jelajah-situs", label: "Jelajah Situs" },
  { href: "/media", label: "Media Belajar" },
  { href: "/kuis", label: "Kuis" },
  { href: "/ruang-guru", label: "Ruang Guru" },
  { href: "/tentang", label: "Tentang" },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 36);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const useHeroBlend = isHome && !scrolled && !mobileOpen;

  return (
    <header
      className={`${
        isHome ? "fixed inset-x-0" : "sticky"
      } top-3 z-40 mx-auto w-full max-w-[75rem] px-4 sm:px-6 lg:px-8`}
    >
      <div
        className={`flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-[24px] border px-4 py-2 backdrop-blur-md transition-colors duration-200 ${
          useHeroBlend
            ? "border-white/20 bg-[#1f4d38]/30 shadow-[0_8px_30px_rgba(12,34,24,0.22)]"
            : "border-white/20 bg-[#1f4d38]/92 shadow-[0_10px_30px_rgba(12,34,24,0.24)]"
        }`}
      >
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 font-bold text-white no-underline"
        >
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-sm font-extrabold text-[#fbefcf]"
            aria-hidden="true"
          >
            EM
          </span>
          <span className="font-[family-name:var(--font-jakarta)] text-base tracking-tight text-white">
            EDMB
          </span>
        </Link>

        <nav
          aria-label="Utama"
          className="hidden items-center gap-1 lg:flex"
        >
          <ul className="flex list-none items-center gap-1 p-0">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/35 bg-white/20 px-3.5 py-2 text-sm font-bold text-white no-underline shadow-sm"
                        : "inline-flex min-h-11 items-center rounded-full px-3.5 py-2 text-sm font-semibold text-white/90 no-underline transition hover:bg-white/15 hover:text-white"
                    }
                  >
                    {active ? (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[#e0a526]"
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/ensiklopedia#cari"
            aria-label="Cari materi ensiklopedia"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/12 text-white transition hover:bg-white/22"
          >
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>

          <Link
            href="/tugas"
            className="hidden min-h-11 items-center justify-center rounded-full bg-[#faf6ee] px-5 py-2 text-sm font-extrabold text-[#1f4d38] no-underline shadow-md transition hover:bg-white sm:inline-flex"
          >
            Masuk Tugas
          </Link>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile-panel"
            aria-label={mobileOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/25 bg-white/12 text-white lg:hidden"
          >
            {mobileOpen ? (
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>

        {mobileOpen ? (
          <nav
            id="nav-mobile-panel"
            aria-label="Menu seluler"
            className="w-full border-t border-white/20 pt-3 pb-2 lg:hidden"
          >
            <ul className="flex list-none flex-col gap-1 p-0">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={
                        active
                          ? "flex min-h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/20 px-4 py-2 font-bold text-white no-underline"
                          : "flex min-h-12 items-center rounded-xl px-4 py-2 font-semibold text-white/90 no-underline hover:bg-white/12 hover:text-white"
                      }
                    >
                      {active ? (
                        <span
                          className="h-2 w-2 rounded-full bg-[#e0a526]"
                          aria-hidden="true"
                        />
                      ) : null}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li className="pt-2">
                <Link
                  href="/tugas"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#faf6ee] px-5 py-2.5 text-sm font-extrabold text-[#1f4d38] no-underline shadow-md"
                >
                  Masuk Tugas
                </Link>
              </li>
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
