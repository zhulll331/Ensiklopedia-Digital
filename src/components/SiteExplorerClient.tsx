"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, ShieldAlert } from "lucide-react";
import type { SampleSiteDetail } from "@/modules/content/sample-data";

export function SiteExplorerClient({
  sites,
}: {
  sites: readonly SampleSiteDetail[];
}) {
  const [view, setView] = useState<"list" | "map">("list");
  const [selectedSlug, setSelectedSlug] = useState<string>(sites[0]?.slug ?? "");
  const listTabId = useId();
  const mapTabId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const nextIdx =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1
            : index === 0
              ? 1
              : 0;
      setView(nextIdx === 0 ? "list" : "map");
      tabRefs.current[nextIdx]?.focus();
    }
  }

  const activeSite = sites.find((s) => s.slug === selectedSlug) ?? sites[0] ?? null;

  // Proyeksi koordinat wilayah umum ke kanvas SVG skematis Banyuwangi (tanpa pin presisi)
  function projectToSchematic(lat: number, lon: number) {
    const minLon = 113.95;
    const maxLon = 114.65;
    const minLat = -8.65;
    const maxLat = -7.95;
    const x = Math.min(540, Math.max(60, ((lon - minLon) / (maxLon - minLon)) * 520 + 40));
    const y = Math.min(340, Math.max(50, ((maxLat - lat) / (maxLat - minLat)) * 310 + 35));
    return { x, y };
  }

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Mode tampilan situs megalitik"
        className="flex border-b border-[#d6cec1]"
      >
        <button
          ref={(el) => {
            tabRefs.current[0] = el;
          }}
          id={listTabId}
          type="button"
          role="tab"
          aria-selected={view === "list"}
          tabIndex={view === "list" ? 0 : -1}
          onClick={() => setView("list")}
          onKeyDown={(e) => handleTabKeyDown(e, 0)}
          className="min-h-12 px-5 py-3 text-sm font-bold text-[#1f2a24]"
        >
          Daftar Situs ({sites.length})
        </button>
        <button
          ref={(el) => {
            tabRefs.current[1] = el;
          }}
          id={mapTabId}
          type="button"
          role="tab"
          aria-selected={view === "map"}
          tabIndex={view === "map" ? 0 : -1}
          onClick={() => setView("map")}
          onKeyDown={(e) => handleTabKeyDown(e, 1)}
          className="min-h-12 px-5 py-3 text-sm font-bold text-[#1f2a24]"
        >
          Peta Wilayah Umum
        </button>
      </div>

      {/* Panel Daftar */}
      <div
        role="tabpanel"
        aria-labelledby={listTabId}
        hidden={view !== "list"}
        tabIndex={view === "list" ? 0 : undefined}
      >
        {sites.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#8b8378] bg-white p-8 text-center">
            <p className="text-sm font-semibold text-[#3a4640]">
              Belum ada materi untuk filter ini. Coba pilih kelas atau jenis lain.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {sites.map((site) => (
              <article
                key={site.id}
                className="flex flex-col rounded-[24px] border border-[#d6cec1] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[#f6dfd2] px-3 py-1 text-xs font-bold text-[#8f3d1b]">
                    {site.heritage_type}
                  </span>
                  <span className="text-xs font-semibold text-[#5b6760]">
                    Kelas {site.target_grades.join(" & ")}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-bold text-[#1f2a24]">
                  {site.title}
                </h2>
                <p className="mt-2 text-sm text-[#3a4640]">{site.summary}</p>

                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1f4d38]">
                  <MapPin size={15} strokeWidth={1.75} aria-hidden="true" />
                  {site.location.area_label}
                </p>

                <div className="mt-auto pt-4">
                  <Link
                    href={`/jelajah-situs/${site.slug}`}
                    className="btn-secondary min-h-11 w-full text-sm"
                  >
                    Baca Detail Situs
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Panel Peta Wilayah Umum (SEC-16: tanpa koordinat tepat / pin presisi / rute navigasi) */}
      <div
        role="tabpanel"
        aria-labelledby={mapTabId}
        hidden={view !== "map"}
        tabIndex={view === "map" ? 0 : undefined}
      >
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-3 rounded-[24px] border border-[#d6cec1] bg-white p-5 lg:col-span-7">
            <div className="flex items-start gap-2 rounded-xl bg-[#fbefcf] px-4 py-3 text-xs font-semibold text-[#8a5a00]">
              <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>
                Lokasi ditampilkan sebagai perkiraan wilayah umum untuk
                melindungi peninggalan. Tidak tersedia koordinat tepat maupun
                rute navigasi.
              </span>
            </div>

            <svg
              viewBox="0 0 600 380"
              role="img"
              aria-label="Peta skematis perkiraan wilayah umum Banyuwangi"
              className="h-auto w-full rounded-2xl border border-[#efeae2] bg-[#d8eef0]"
            >
              {/* Siluet skematis daratan Banyuwangi */}
              <path
                d="M110 70 Q280 40 430 95 L490 210 Q450 320 340 345 L170 325 Q95 245 110 70 Z"
                fill="#f0f6f0"
                stroke="#4a8a68"
                strokeWidth="3"
              />
              {sites.map((site) => {
                const { x, y } = projectToSchematic(
                  site.location.display_lat,
                  site.location.display_lon
                );
                const isSelected = activeSite?.slug === site.slug;
                return (
                  <g key={site.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 42 : 34}
                      fill={isSelected ? "rgba(210, 106, 60, 0.34)" : "rgba(47, 107, 79, 0.22)"}
                      stroke={isSelected ? "#8f3d1b" : "#1f4d38"}
                      strokeWidth={isSelected ? 3 : 2}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fill="#1f2a24"
                    >
                      {site.heritage_type}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="text-xs text-[#5b6760]">
              Atribusi: Peta wilayah skematis internal EDMB (bebas pelacak pihak
              ketiga; tile peta berlisensi akan dihubungkan opsional sesuai
              keputusan pengelola).
            </p>
          </div>

          {/* Fallback daftar wilayah yang dapat diakses keyboard & pembaca layar */}
          <div className="space-y-3 rounded-[24px] border border-[#d6cec1] bg-white p-5 lg:col-span-5">
            <h2 className="text-base font-bold text-[#1f2a24]">
              Daftar Perkiraan Wilayah Umum
            </h2>
            <ul className="flex list-none flex-col gap-2.5 p-0">
              {sites.map((site) => {
                const isSelected = activeSite?.slug === site.slug;
                return (
                  <li key={site.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlug(site.slug)}
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "w-full rounded-xl border-2 border-[#2f6b4f] bg-[#f0f6f0] p-3 text-start"
                          : "w-full rounded-xl border border-[#d6cec1] bg-white p-3 text-start hover:bg-[#faf6ee]"
                      }
                    >
                      <span className="block text-sm font-bold text-[#1f2a24]">
                        {site.location.area_label}
                      </span>
                      <span className="block text-xs text-[#3a4640]">
                        {site.title} • {site.location.precision_label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {activeSite ? (
              <div className="border-t border-[#efeae2] pt-3">
                <Link
                  href={`/jelajah-situs/${activeSite.slug}`}
                  className="btn-primary min-h-11 w-full text-sm"
                >
                  Buka Detail {activeSite.heritage_type}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
