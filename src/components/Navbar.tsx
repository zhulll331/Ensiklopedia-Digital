"use client";

import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-3 z-40 mx-auto w-full max-w-[75rem] px-4 sm:px-6 lg:px-8">
      <div className="glass-surface flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2.5 font-bold text-[#1f2a24] no-underline"
        >
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#2f6b4f] text-sm font-extrabold text-white"
            aria-hidden="true"
          >
            EM
          </span>
          <span className="font-[family-name:var(--font-jakarta)] text-base tracking-tight">
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
                        ? "inline-flex min-h-11 items-center rounded-full bg-[#2f6b4f] px-3.5 py-2 text-sm font-bold text-white no-underline"
                        : "inline-flex min-h-11 items-center rounded-full px-3.5 py-2 text-sm font-semibold text-[#1f2a24] no-underline hover:bg-[#dcebdd]"
                    }
                  >
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
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#d6cec1] bg-white/80 text-[#1f2a24] hover:bg-[#f0f6f0]"
          >
            <Search size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>

          <Link
            href="/tugas"
            className="btn-primary hidden text-sm sm:inline-flex"
          >
            Masuk Tugas
          </Link>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile-panel"
            aria-label={mobileOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#d6cec1] bg-white text-[#1f2a24] lg:hidden"
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
            className="w-full border-t border-[#d6cec1] pt-3 pb-2 lg:hidden"
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
                          ? "flex min-h-12 items-center rounded-xl bg-[#2f6b4f] px-4 py-2 font-bold text-white no-underline"
                          : "flex min-h-12 items-center rounded-xl px-4 py-2 font-semibold text-[#1f2a24] no-underline hover:bg-[#f0f6f0]"
                      }
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li className="pt-2">
                <Link
                  href="/tugas"
                  onClick={() => setMobileOpen(false)}
                  className="btn-primary w-full"
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
