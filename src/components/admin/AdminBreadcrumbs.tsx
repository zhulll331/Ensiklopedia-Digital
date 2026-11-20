"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Crumb {
  href: string;
  label: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  konten: "Konten & Revisi",
  revisi: "Editor Revisi",
  situs: "Situs & Peta Umum",
  media: "Media & Karantina",
  kuis: "Bank Kuis",
  guru: "Guru & Sekolah",
  sekolah: "Sekolah",
  dukungan: "Mode Dukungan",
  pengaturan: "Pengaturan",
  audit: "Log Audit",
  pemeliharaan: "Pemeliharaan",
};

function buildBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ href: "/admin", label: "Portal Admin" }];
  const stripped = pathname.replace(/^\/admin\/?/, "");
  if (!stripped) {
    return crumbs;
  }

  const segments = stripped.split("/").filter(Boolean);
  if (
    segments[0] === "konten" &&
    segments.length === 4 &&
    segments[2] === "revisi"
  ) {
    crumbs.push({ href: "/admin/konten", label: "Konten & Revisi" });
    crumbs.push({ href: pathname, label: "Editor Revisi" });
    return crumbs;
  }

  if (
    segments[0] === "kuis" &&
    segments.length === 4 &&
    segments[2] === "revisi"
  ) {
    crumbs.push({ href: "/admin/kuis", label: "Bank Kuis" });
    crumbs.push({ href: pathname, label: "Editor Revisi Kuis" });
    return crumbs;
  }

  let acc = "/admin";
  for (const segment of segments) {
    acc += `/${segment}`;
    const label = SEGMENT_LABELS[segment] ?? segment;
    crumbs.push({ href: acc, label });
  }
  return crumbs;
}

export function AdminBreadcrumbs() {
  const pathname = usePathname() || "/admin";
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <nav aria-label="Breadcrumbs" className="admin-breadcrumb text-sm">
      <ol>
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <li key={crumb.href}>
              <Link
                href={crumb.href}
                aria-current={isCurrent ? "page" : undefined}
                className={
                  isCurrent
                    ? "rounded px-1.5 py-0.5 font-bold text-[#1f2a24] no-underline"
                    : "rounded px-1.5 py-0.5 font-semibold text-[#1f4d38] underline hover:bg-[#f0f6f0]"
                }
              >
                {crumb.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
