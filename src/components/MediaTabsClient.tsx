"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GalleryLightbox } from "./GalleryLightbox";
import type {
  SampleGlossaryEntry,
  SampleMediaItem,
  SampleVideoItem,
} from "@/modules/content/sample-data";

type MediaTabKey = "galeri" | "video" | "glosarium";

export function MediaTabsClient({
  gallery,
  videos,
  glossary,
  initialTab = "galeri",
}: {
  gallery: readonly SampleMediaItem[];
  videos: readonly SampleVideoItem[];
  glossary: readonly SampleGlossaryEntry[];
  initialTab?: MediaTabKey;
}) {
  const [activeTab, setActiveTab] = useState<MediaTabKey>(initialTab);
  const [letter, setLetter] = useState<string>("ALL");
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const galeriTabId = useId();
  const videoTabId = useId();
  const glosariumTabId = useId();
  const searchInputId = useId();

  const panelRefs = useRef<Record<MediaTabKey, HTMLDivElement | null>>({
    galeri: null,
    video: null,
    glosarium: null,
  });

  // Sinkronisasi tab jika browser membuka panel tersembunyi via Find-in-Page (beforematch)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleBeforeMatch = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.dataset.tabKey === "galeri") setActiveTab("galeri");
      if (target.dataset.tabKey === "video") setActiveTab("video");
      if (target.dataset.tabKey === "glosarium") setActiveTab("glosarium");
    };

    container.addEventListener("beforematch", handleBeforeMatch);
    return () => {
      container.removeEventListener("beforematch", handleBeforeMatch);
    };
  }, []);

  const tabs: Array<{ key: MediaTabKey; id: string; label: string }> = [
    { key: "galeri", id: galeriTabId, label: `Galeri (${gallery.length})` },
    { key: "video", id: videoTabId, label: `Video (${videos.length})` },
    { key: "glosarium", id: glosariumTabId, label: `Glosarium (${glossary.length})` },
  ];

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = (idx + 1) % tabs.length;
      const item = tabs[next];
      if (item) {
        setActiveTab(item.key);
        tabRefs.current[next]?.focus();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (idx - 1 + tabs.length) % tabs.length;
      const item = tabs[prev];
      if (item) {
        setActiveTab(item.key);
        tabRefs.current[prev]?.focus();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      const item = tabs[0];
      if (item) {
        setActiveTab(item.key);
        tabRefs.current[0]?.focus();
      }
    } else if (e.key === "End") {
      e.preventDefault();
      const last = tabs.length - 1;
      const item = tabs[last];
      if (item) {
        setActiveTab(item.key);
        tabRefs.current[last]?.focus();
      }
    }
  }

  const availableLetters = useMemo(() => {
    return Array.from(new Set(glossary.map((g) => g.letter))).sort();
  }, [glossary]);

  const filteredGlossary = useMemo(() => {
    const q = glossaryQuery.trim().toLowerCase();
    return glossary.filter((item) => {
      if (letter !== "ALL" && item.letter !== letter) return false;
      if (!q) return true;
      return (
        item.term.toLowerCase().includes(q) ||
        item.simple_definition.toLowerCase().includes(q) ||
        item.context_example.toLowerCase().includes(q)
      );
    });
  }, [glossary, letter, glossaryQuery]);

  return (
    <div ref={containerRef} className="space-y-6">
      <div
        role="tablist"
        aria-label="Bagian Media Belajar"
        className="flex overflow-x-auto border-b border-[#d6cec1]"
      >
        {tabs.map((tab, idx) => {
          const isSelected = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              id={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setActiveTab(tab.key)}
              onKeyDown={(e) => onTabKeyDown(e, idx)}
              className="min-h-12 flex-none px-5 py-3 text-sm font-bold text-[#1f2a24]"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel Galeri: tanpa padding/border langsung pada panel saat memakai hidden */}
      <div
        ref={(el) => {
          panelRefs.current.galeri = el;
        }}
        data-tab-key="galeri"
        role="tabpanel"
        aria-labelledby={galeriTabId}
        hidden={activeTab !== "galeri" ? ("until-found" as unknown as boolean) : undefined}
        tabIndex={activeTab === "galeri" ? 0 : undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-[#3a4640]">
            Setiap aset diberi lencana <strong>Foto</strong> atau{" "}
            <strong>Ilustrasi</strong> dan telah dibersihkan metadata
            lokasinya.
          </p>
          <GalleryLightbox items={gallery} />
        </div>
      </div>

      {/* Panel Video */}
      <div
        ref={(el) => {
          panelRefs.current.video = el;
        }}
        data-tab-key="video"
        role="tabpanel"
        aria-labelledby={videoTabId}
        hidden={activeTab !== "video" ? ("until-found" as unknown as boolean) : undefined}
        tabIndex={activeTab === "video" ? 0 : undefined}
      >
        <div className="grid gap-6 md:grid-cols-2">
          {videos.map((vid) => (
            <article
              key={vid.id}
              className="space-y-4 rounded-[24px] border border-[#d6cec1] bg-white p-5"
            >
              <div className="space-y-1">
                <span className="inline-block rounded-full bg-[#dcebdd] px-3 py-0.5 text-xs font-bold text-[#1f4d38]">
                  Durasi: {vid.duration_label} • Kelas {vid.target_grades.join(" & ")}
                </span>
                <h2 className="text-lg font-bold text-[#1f2a24]">{vid.title}</h2>
                <p className="text-sm text-[#3a4640]">{vid.summary}</p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#efeae2] bg-[#faf6ee]">
                <Image
                  src={vid.poster_src}
                  alt={vid.poster_alt}
                  width={800}
                  height={450}
                  unoptimized
                  className="aspect-video w-full object-cover"
                />
                <p className="bg-[#efeae2] px-4 py-2 text-xs font-semibold text-[#3a4640]">
                  Pemutar <code>&lt;video controls preload=&quot;none&quot;&gt;</code>{" "}
                  dengan takarir (<code>&lt;track kind=&quot;captions&quot;&gt;</code>)
                  aktif otomatis begitu berkas MP4 final diunggah.
                </p>
              </div>

              <details className="rounded-xl border border-[#d6cec1] bg-[#faf6ee] p-3">
                <summary className="min-h-10 cursor-pointer text-sm font-bold text-[#1f4d38]">
                  Baca Transkrip Teks Video
                </summary>
                <div className="mt-2 space-y-1.5 text-sm text-[#3a4640]">
                  {vid.transcript.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
      </div>

      {/* Panel Glosarium A-Z */}
      <div
        ref={(el) => {
          panelRefs.current.glosarium = el;
        }}
        data-tab-key="glosarium"
        role="tabpanel"
        aria-labelledby={glosariumTabId}
        hidden={activeTab !== "glosarium" ? ("until-found" as unknown as boolean) : undefined}
        tabIndex={activeTab === "glosarium" ? 0 : undefined}
      >
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-[20px] border border-[#d6cec1] bg-white p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label
                htmlFor={searchInputId}
                className="block text-sm font-bold text-[#1f2a24]"
              >
                Cari istilah glosarium
              </label>
              <input
                id={searchInputId}
                type="search"
                value={glossaryQuery}
                onChange={(e) => setGlossaryQuery(e.target.value)}
                placeholder="Contoh: menhir, dolmen, arkeologi"
                className="min-h-11 w-full rounded-[10px] border border-[#8b8378] px-3.5 text-base"
              />
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter huruf A sampai Z">
              <button
                type="button"
                onClick={() => setLetter("ALL")}
                aria-pressed={letter === "ALL"}
                className={
                  letter === "ALL"
                    ? "min-h-11 min-w-11 rounded-full bg-[#2f6b4f] px-3 text-sm font-bold text-white"
                    : "min-h-11 min-w-11 rounded-full border border-[#d6cec1] bg-white px-3 text-sm font-bold text-[#1f2a24]"
                }
              >
                Semua
              </button>
              {availableLetters.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLetter(l)}
                  aria-pressed={letter === l}
                  className={
                    letter === l
                      ? "min-h-11 min-w-11 rounded-full bg-[#2f6b4f] px-3 text-sm font-bold text-white"
                      : "min-h-11 min-w-11 rounded-full border border-[#d6cec1] bg-white px-3 text-sm font-bold text-[#1f2a24]"
                  }
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {filteredGlossary.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#8b8378] bg-white p-6 text-center text-sm text-[#5b6760]">
              Istilah tidak ditemukan. Coba kata kunci lain.
            </p>
          ) : (
            <dl className="grid gap-4 md:grid-cols-2">
              {filteredGlossary.map((entry) => (
                <div
                  key={entry.id}
                  id={entry.slug}
                  className="space-y-2 rounded-[20px] border border-[#d6cec1] bg-white p-5"
                >
                  <dt className="text-lg font-bold text-[#1f4d38]">
                    {entry.term}
                  </dt>
                  <dd className="m-0 space-y-2 text-sm text-[#3a4640]">
                    <p>{entry.simple_definition}</p>
                    <p className="rounded-lg bg-[#faf6ee] px-3 py-2 text-xs text-[#3a4640]">
                      <strong>Contoh kalimat:</strong> {entry.context_example}
                    </p>
                    <Link
                      href={`/ensiklopedia/${entry.related_chapter_slug}`}
                      className="inline-block text-xs font-bold text-[#1f4d38] underline"
                    >
                      Baca di bab terkait →
                    </Link>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
