"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";

const STORAGE_KEY = "edmb_public_bookmarks_v1";

function readBookmarks(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * FR-16 (P1): Penanda bacaan lokal hanya untuk konten publik (tanpa nama/nilai siswa).
 */
export function LocalBookmarkButton({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    async function sync() {
      await Promise.resolve();
      if (active) {
        setSaved(readBookmarks().includes(slug));
      }
    }
    void sync();
    return () => {
      active = false;
    };
  }, [slug]);

  function toggleBookmark() {
    const current = readBookmarks();
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(next.includes(slug));
  }

  return (
    <button
      type="button"
      onClick={toggleBookmark}
      aria-pressed={saved}
      className="btn-secondary min-h-11 text-sm"
    >
      {saved ? (
        <>
          <BookmarkCheck size={18} strokeWidth={1.75} aria-hidden="true" />
          Ditandai di perangkat ini
        </>
      ) : (
        <>
          <Bookmark size={18} strokeWidth={1.75} aria-hidden="true" />
          Tandai Sudah Dibaca
        </>
      )}
    </button>
  );
}
