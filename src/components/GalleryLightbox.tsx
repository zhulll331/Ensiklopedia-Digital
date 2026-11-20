"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { SampleMediaItem } from "@/modules/content/sample-data";

export function GalleryLightbox({ items }: { items: readonly SampleMediaItem[] }) {
  const [selected, setSelected] = useState<SampleMediaItem | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      setSelected(null);
    };

    dialog.addEventListener("close", handleClose);

    // Fallback light-dismiss untuk browser tanpa <dialog closedby="any"> (mis. Safari)
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        );
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);

      return () => {
        dialog.removeEventListener("close", handleClose);
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

  function openLightbox(item: SampleMediaItem) {
    setSelected(item);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <figure
            key={item.id}
            className="flex flex-col overflow-hidden rounded-[20px] border border-[#d6cec1] bg-white"
          >
            <div className="relative aspect-[4/3] bg-[#faf6ee]">
              <Image
                src={item.src}
                alt={item.alt_text}
                width={item.width}
                height={item.height}
                unoptimized
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <span
                className={
                  item.badge === "Foto"
                    ? "absolute top-3 left-3 rounded-full bg-[#2f6b4f] px-3 py-1 text-xs font-bold text-white"
                    : "absolute top-3 left-3 rounded-full bg-[#fbefcf] px-3 py-1 text-xs font-bold text-[#8a5a00]"
                }
              >
                {item.badge}
              </span>
            </div>
            <figcaption className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="text-base font-bold text-[#1f2a24]">{item.title}</h3>
              <p className="text-sm text-[#3a4640]">{item.caption}</p>
              <p className="text-xs text-[#5b6760]">
                Kredit: {item.credit} • {item.license}
              </p>
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={() => openLightbox(item)}
                  className="btn-secondary min-h-11 w-full text-sm"
                >
                  Perbesar Gambar
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Native modal <dialog> tanpa role="dialog" atau aria-modal manual sesuai panduan dialog */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        {...({ closedby: "any" } as Record<string, string>)}
        className="m-auto w-[min(92vw,46rem)] rounded-[24px] border border-[#d6cec1] bg-white p-0 text-[#1f2a24] shadow-xl"
      >
        {selected ? (
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-block rounded-full bg-[#fbefcf] px-3 py-0.5 text-xs font-bold text-[#8a5a00]">
                  {selected.badge}
                </span>
                <h2 id={titleId} className="text-xl font-bold text-[#1f2a24]">
                  {selected.title}
                </h2>
              </div>
              <form method="dialog">
                <button
                  type="submit"
                  aria-label="Tutup pratinjau gambar"
                  autoFocus
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#d6cec1] bg-white text-[#1f2a24] hover:bg-[#f0f6f0]"
                >
                  <X size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </form>
            </div>

            <div className="overflow-hidden rounded-2xl bg-[#faf6ee]">
              <Image
                src={selected.src}
                alt={selected.alt_text}
                width={selected.width}
                height={selected.height}
                unoptimized
                referrerPolicy="no-referrer"
                className="h-auto max-h-[60dvh] w-full object-contain"
              />
            </div>

            <p className="text-sm text-[#3a4640]">{selected.caption}</p>
            <p className="text-xs text-[#5b6760]">
              Kredit: {selected.credit} • Lisensi: {selected.license}
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
