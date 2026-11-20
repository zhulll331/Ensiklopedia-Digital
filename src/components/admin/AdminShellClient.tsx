"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Menu,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { AdminSignOutButton } from "./AdminSignOutButton";

const ACTIVE_NAV_ITEMS = [
  { href: "/admin", label: "Ringkasan", icon: LayoutDashboard, exact: true },
  {
    href: "/admin/konten",
    label: "Konten & Revisi",
    icon: FileText,
    exact: false,
  },
  {
    href: "/admin/situs",
    label: "Situs & Peta Umum",
    icon: MapPin,
    exact: false,
  },
  {
    href: "/admin/media",
    label: "Media & Karantina",
    icon: ImageIcon,
    exact: false,
  },
  {
    href: "/admin/kuis",
    label: "Bank Kuis",
    icon: ClipboardList,
    exact: false,
  },
  {
    href: "/admin/guru",
    label: "Akun Guru",
    icon: Users,
    exact: false,
  },
  {
    href: "/admin/sekolah",
    label: "Sekolah",
    icon: School,
    exact: false,
  },
  {
    href: "/admin/dukungan",
    label: "Mode Dukungan",
    icon: LifeBuoy,
    exact: false,
  },
  {
    href: "/admin/pengaturan",
    label: "Pengaturan",
    icon: Settings,
    exact: false,
  },
  {
    href: "/admin/audit",
    label: "Log Audit",
    icon: ScrollText,
    exact: false,
  },
  {
    href: "/admin/pemeliharaan",
    label: "Pemeliharaan",
    icon: Wrench,
    exact: false,
  },
] as const;

export interface AdminShellClientProps {
  mode: "supabase" | "local_demo";
  displayName?: string;
  children: ReactNode;
}

export function AdminShellClient({
  mode,
  displayName,
  children,
}: AdminShellClientProps) {
  const pathname = usePathname() || "/admin";
  const rawMenuId = useId();
  const menuId = `admin-nav-${rawMenuId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  useEffect(() => {
    const menuEl = menuRef.current;
    if (!menuEl) return;

    const mq = window.matchMedia("(min-width: 64rem)");
    const supportsPopover =
      typeof HTMLElement !== "undefined" &&
      Object.hasOwn(HTMLElement.prototype, "popover");

    const syncMode = () => {
      if (mq.matches) {
        menuEl.removeAttribute("popover");
        menuEl.classList.remove("is-fallback-open");
      } else if (supportsPopover) {
        menuEl.setAttribute("popover", "auto");
      }
    };

    syncMode();
    mq.addEventListener("change", syncMode);
    return () => {
      mq.removeEventListener("change", syncMode);
    };
  }, []);

  function closeNarrowMenu() {
    setFallbackOpen(false);
    const menuEl = menuRef.current;
    if (!menuEl) return;
    if (menuEl.hasAttribute("popover") && menuEl.matches(":popover-open")) {
      menuEl.hidePopover();
    }
  }

  function handleMenuButtonClick() {
    if (
      typeof HTMLElement === "undefined" ||
      !Object.hasOwn(HTMLElement.prototype, "popover")
    ) {
      setFallbackOpen((prev) => !prev);
    }
  }

  return (
    <div className="mx-auto max-w-[75rem] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Banner Keamanan Admin Persisten */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fde8e6] px-3 py-1 text-xs font-bold text-[#b42318]">
            <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
            Wajib MFA • Cache no-store • Audit Aktif
          </span>
          <span className="text-xs font-semibold text-[#1f4d38]">
            {mode === "local_demo"
              ? "Mode Demo Lokal (Baca Sampel)"
              : `Aktif: ${displayName ?? "Admin Kurator"}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === "supabase" ? (
            <Link
              href="/admin/mfa/verifikasi?reauth=1"
              prefetch={false}
              className="btn-secondary min-h-11 text-xs"
            >
              Konfirmasi Ulang MFA
            </Link>
          ) : null}
          <Link href="/" className="btn-secondary min-h-11 text-xs">
            Beranda Publik
          </Link>
          <AdminSignOutButton />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Satu Landmark Navigasi Responsif (Sidebar di desktop, Popover di sempit) */}
        <aside className="lg:col-span-3">
          <nav aria-label="Navigasi Portal Admin">
            <button
              type="button"
              popoverTarget={menuId}
              popoverTargetAction="toggle"
              aria-controls={menuId}
              onClick={handleMenuButtonClick}
              className="admin-menu-trigger btn-secondary min-h-12 w-full justify-between text-sm lg:hidden"
            >
              <span className="inline-flex items-center gap-2">
                <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
                Menu Admin
              </span>
              <span className="text-xs text-[#5b6760]">Pilih Modul</span>
            </button>

            <div
              id={menuId}
              ref={menuRef}
              className={`admin-sidebar-menu space-y-5 rounded-2xl border border-[#d6cec1] bg-white p-4 shadow-md lg:shadow-none ${
                fallbackOpen ? "is-fallback-open" : ""
              }`}
            >
              <div className="space-y-2">
                <p className="px-2 text-xs font-bold tracking-[0.06em] text-[#5b6760] uppercase">
                  Menu Aktif
                </p>
                <ul className="flex list-none flex-col gap-1.5 p-0">
                  {ACTIVE_NAV_ITEMS.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`);
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          prefetch={false}
                          onClick={closeNarrowMenu}
                          aria-current={active ? "page" : undefined}
                          className={
                            active
                              ? "flex min-h-12 items-center gap-2.5 rounded-xl border border-[#2f6b4f] bg-[#f0f6f0] px-3 py-2 text-sm font-bold text-[#1f4d38] no-underline"
                              : "flex min-h-12 items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-[#1f2a24] no-underline hover:bg-[#faf6ee]"
                          }
                        >
                          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                          <span className="flex-1">{item.label}</span>
                          {active ? (
                            <span
                              className="h-2 w-2 rounded-full bg-[#2f6b4f]"
                              aria-hidden="true"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </nav>
        </aside>

        {/* Konten Utama + Breadcrumb */}
        <div className="min-w-0 space-y-4 lg:col-span-9">
          <AdminBreadcrumbs />
          {children}
        </div>
      </div>
    </div>
  );
}
