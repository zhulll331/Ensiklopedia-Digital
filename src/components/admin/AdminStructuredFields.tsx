"use client";

import { useId } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import type { ContentKind } from "@/modules/content/types";

interface StringListEditorProps {
  label: string;
  items: string[];
  canEdit: boolean;
  onChange: (next: string[]) => void;
  addLabel: string;
  helperText?: string;
  multiline?: boolean;
}

function StringListEditor({
  label,
  items,
  canEdit,
  onChange,
  addLabel,
  helperText,
  multiline = true,
}: StringListEditorProps) {
  const baseId = useId();
  const safeItems = items.length > 0 ? items : [""];

  function updateAt(idx: number, val: string) {
    const next = [...safeItems];
    next[idx] = val;
    onChange(next);
  }

  function removeAt(idx: number) {
    if (safeItems.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(safeItems.filter((_, i) => i !== idx));
  }

  function addItem() {
    onChange([...safeItems, ""]);
  }

  return (
    <fieldset className="space-y-2 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/50 p-4">
      <legend className="px-1 text-sm font-bold text-[#1f2a24]">{label}</legend>
      {helperText ? (
        <p className="text-xs text-[#5b6760]">{helperText}</p>
      ) : null}

      <div className="space-y-3">
        {safeItems.map((text, idx) => {
          const inputId = `${baseId}-item-${idx}`;
          return (
            <div key={inputId} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={inputId}
                  className="text-xs font-bold text-[#3a4640]"
                >
                  {label} #{idx + 1}
                </label>
                {canEdit && safeItems.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#d6cec1] bg-white px-2.5 py-1 text-xs font-semibold text-[#b42318] hover:bg-[#fde8e6]"
                  >
                    <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                    Hapus
                  </button>
                ) : null}
              </div>

              {multiline ? (
                <textarea
                  id={inputId}
                  rows={3}
                  disabled={!canEdit}
                  value={text}
                  onChange={(e) => updateAt(idx, e.target.value)}
                  className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea] disabled:text-[#3a4640]"
                />
              ) : (
                <input
                  id={inputId}
                  type="text"
                  disabled={!canEdit}
                  value={text}
                  onChange={(e) => updateAt(idx, e.target.value)}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea] disabled:text-[#3a4640]"
                />
              )}
            </div>
          );
        })}
      </div>

      {canEdit ? (
        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#2f6b4f] bg-white px-3.5 py-1.5 text-xs font-bold text-[#1f4d38] hover:bg-[#f0f6f0]"
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
          {addLabel}
        </button>
      ) : null}
    </fieldset>
  );
}

function asStringArray(val: unknown): string[] {
  return Array.isArray(val)
    ? val.filter((v): v is string => typeof v === "string")
    : [];
}

function asString(val: unknown, fallback = ""): string {
  return typeof val === "string" ? val : fallback;
}

function asPositiveInt(val: unknown, fallback: number): number {
  const n = typeof val === "number" ? val : Number(val);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : fallback;
}

export interface AdminStructuredFieldsProps {
  revisionId?: string;
  kind: ContentKind;
  bodyJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
  canEdit: boolean;
  onChangeBody: (next: Record<string, unknown>) => void;
  onChangeMeta: (next: Record<string, unknown>) => void;
  siteLocation?: null | {
    area_label: string;
    display_lat: number;
    display_lon: number;
    precision_label: string;
    display_zoom_max: number;
    clearance_approved: boolean;
  };
}

export function AdminStructuredFields({
  revisionId,
  kind,
  bodyJson,
  metadataJson,
  canEdit,
  onChangeBody,
  onChangeMeta,
  siteLocation,
}: AdminStructuredFieldsProps) {
  const baseId = useId();

  if (kind === "chapter") {
    const paragraphs = asStringArray(bodyJson.paragraphs);
    const glossarySlugs = asStringArray(metadataJson.glossary_slugs).join(", ");
    const order = asPositiveInt(metadataJson.order, 1);
    const readingMinutes = asPositiveInt(metadataJson.reading_minutes, 4);
    const preservationNote = asString(metadataJson.preservation_note);

    return (
      <div className="space-y-4">
        <StringListEditor
          label="Paragraf Bacaan Bab"
          items={paragraphs}
          canEdit={canEdit}
          onChange={(next) => onChangeBody({ ...bodyJson, paragraphs: next })}
          addLabel="Tambah Paragraf"
          helperText="Tulis paragraf pendek yang ramah dibaca siswa SD kelas III–IV."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-chap-order`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Urutan Bab
            </label>
            <input
              id={`${baseId}-chap-order`}
              type="text"
              inputMode="numeric"
              disabled={!canEdit}
              value={String(order)}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                onChangeMeta({
                  ...metadataJson,
                  order: digits ? Number.parseInt(digits, 10) : 1,
                });
              }}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-chap-minutes`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Estimasi Durasi Baca (menit)
            </label>
            <input
              id={`${baseId}-chap-minutes`}
              type="text"
              inputMode="numeric"
              disabled={!canEdit}
              value={String(readingMinutes)}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                onChangeMeta({
                  ...metadataJson,
                  reading_minutes: digits ? Number.parseInt(digits, 10) : 4,
                });
              }}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-chap-glossary`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Slug Istilah Glosarium Terkait
          </label>
          <span className="text-xs text-[#5b6760]">
            Pisahkan dengan tanda koma (contoh: megalitik, menhir, dolmen).
          </span>
          <input
            id={`${baseId}-chap-glossary`}
            type="text"
            disabled={!canEdit}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={glossarySlugs}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                glossary_slugs: e.target.value
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-chap-note`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Catatan Pelestarian untuk Siswa
          </label>
          <textarea
            id={`${baseId}-chap-note`}
            rows={2}
            disabled={!canEdit}
            value={preservationNote}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                preservation_note: e.target.value,
              })
            }
            className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>
      </div>
    );
  }

  if (kind === "site") {
    const childNarration = asStringArray(bodyJson.child_narration);
    const scientificContext = asStringArray(bodyJson.scientific_context);
    const heritageType = asString(metadataJson.heritage_type, "Menhir");
    const preservationWarning = asString(metadataJson.preservation_warning);

    return (
      <div className="space-y-4">
        <StringListEditor
          label="Narasi Ramah Anak"
          items={childNarration}
          canEdit={canEdit}
          onChange={(next) =>
            onChangeBody({ ...bodyJson, child_narration: next })
          }
          addLabel="Tambah Paragraf Narasi"
        />

        <StringListEditor
          label="Konteks Ilmiah Kurator"
          items={scientificContext}
          canEdit={canEdit}
          onChange={(next) =>
            onChangeBody({ ...bodyJson, scientific_context: next })
          }
          addLabel="Tambah Poin Konteks Ilmiah"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-site-type`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Jenis Tinggalan Situs
            </label>
            <input
              id={`${baseId}-site-type`}
              type="text"
              disabled={!canEdit}
              value={heritageType}
              onChange={(e) =>
                onChangeMeta({ ...metadataJson, heritage_type: e.target.value })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-[#d6cec1] bg-[#faf6ee] p-3 text-xs text-[#3a4640]">
            <p className="font-bold text-[#1f2a24]">Status Lokasi Publik (SEC-16)</p>
            {siteLocation ? (
              <p>
                {siteLocation.area_label} (Zoom maks {siteLocation.display_zoom_max}
                ) •{" "}
                <strong>
                  {siteLocation.clearance_approved
                    ? "Clearance lokasi disetujui"
                    : "Menunggu persetujuan review lokasi"}
                </strong>
              </p>
            ) : (
              <p>
                Belum memiliki data wilayah umum di{" "}
                <code>site_public_locations</code>. Atur perkiraan wilayah
                umum (maks 2 desimal) dan clearance lokasi sebelum diterbitkan.
              </p>
            )}
            <Link
              href={revisionId ? `/admin/situs?revision=${revisionId}` : "/admin/situs"}
              className="inline-flex font-bold text-[#1f4d38] underline"
            >
              Kelola Lokasi &amp; Clearance di Situs &amp; Peta Umum →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-site-warning`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Peringatan Pelestarian Situs
          </label>
          <textarea
            id={`${baseId}-site-warning`}
            rows={2}
            disabled={!canEdit}
            value={preservationWarning}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                preservation_warning: e.target.value,
              })
            }
            className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>
      </div>
    );
  }

  if (kind === "video") {
    const transcript = asStringArray(bodyJson.transcript);
    const durationLabel = asString(metadataJson.duration_label, "02:00");
    const posterSrc = asString(
      metadataJson.poster_src,
      "/images/samples/ilustrasi-menhir-dolmen.svg"
    );
    const posterAlt = asString(metadataJson.poster_alt);
    const videoUrl = asString(metadataJson.video_url);
    const captionsAvailable = Boolean(metadataJson.captions_available);

    return (
      <div className="space-y-4">
        <StringListEditor
          label="Transkrip Teks Video"
          items={transcript}
          canEdit={canEdit}
          onChange={(next) => onChangeBody({ ...bodyJson, transcript: next })}
          addLabel="Tambah Baris Transkrip"
          multiline={false}
          helperText="Awali setiap baris dengan penanda waktu seperti [00:00]."
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-vid-external-url`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Link Video Eksternal (YouTube / Vimeo / Drive / MP4 HTTPS, Opsional)
          </label>
          <span className="text-xs text-[#5b6760]">
            Isi bila video tidak diunggah ke Supabase Storage (hemat kuota
            storage; URL YouTube otomatis dinormalisasi ke embed bebas pelacak).
          </span>
          <input
            id={`${baseId}-vid-external-url`}
            type="url"
            disabled={!canEdit}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={videoUrl}
            onChange={(e) =>
              onChangeMeta({ ...metadataJson, video_url: e.target.value })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-vid-duration`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Label Durasi Video
            </label>
            <input
              id={`${baseId}-vid-duration`}
              type="text"
              disabled={!canEdit}
              value={durationLabel}
              onChange={(e) =>
                onChangeMeta({ ...metadataJson, duration_label: e.target.value })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-vid-poster-src`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Path Gambar Poster Video
            </label>
            <input
              id={`${baseId}-vid-poster-src`}
              type="text"
              disabled={!canEdit}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={posterSrc}
              onChange={(e) =>
                onChangeMeta({ ...metadataJson, poster_src: e.target.value })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-vid-poster-alt`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Teks Alternatif (Alt) Poster
          </label>
          <input
            id={`${baseId}-vid-poster-alt`}
            type="text"
            disabled={!canEdit}
            value={posterAlt}
            onChange={(e) =>
              onChangeMeta({ ...metadataJson, poster_alt: e.target.value })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="inline-flex items-center gap-2">
          <input
            id={`${baseId}-vid-captions`}
            type="checkbox"
            disabled={!canEdit}
            checked={captionsAvailable}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                captions_available: e.target.checked,
              })
            }
            className="h-5 w-5 accent-[#1f4d38]"
          />
          <label
            htmlFor={`${baseId}-vid-captions`}
            className="text-sm font-semibold text-[#1f2a24]"
          >
            Takarir (captions) tersedia untuk video ini
          </label>
        </div>
      </div>
    );
  }

  if (kind === "glossary") {
    const definition = asString(bodyJson.definition);
    const contextExample = asString(bodyJson.context_example);
    const relatedChapterSlug = asString(metadataJson.related_chapter_slug);

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-gl-def`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Definisi Sederhana Istilah
          </label>
          <textarea
            id={`${baseId}-gl-def`}
            rows={3}
            disabled={!canEdit}
            value={definition}
            onChange={(e) =>
              onChangeBody({ ...bodyJson, definition: e.target.value })
            }
            className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-gl-ctx`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Contoh Kalimat Kontekstual
          </label>
          <textarea
            id={`${baseId}-gl-ctx`}
            rows={2}
            disabled={!canEdit}
            value={contextExample}
            onChange={(e) =>
              onChangeBody({ ...bodyJson, context_example: e.target.value })
            }
            className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-gl-rel`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Slug Bab Bacaan Terkait
          </label>
          <input
            id={`${baseId}-gl-rel`}
            type="text"
            disabled={!canEdit}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={relatedChapterSlug}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                related_chapter_slug: e.target.value,
              })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>
      </div>
    );
  }

  if (kind === "book" || kind === "guide" || kind === "worksheet") {
    const objectives = asStringArray(bodyJson.objectives);
    const steps = asStringArray(bodyJson.steps);
    const durationMinutes =
      typeof metadataJson.duration_minutes === "number"
        ? String(metadataJson.duration_minutes)
        : "";
    const fileLabel = asString(metadataJson.file_label, "Dokumen PDF");
    const fileSizeLabel = asString(
      metadataJson.file_size_label,
      "Belum diunggah"
    );
    const versionLabel = asString(metadataJson.version_label, "Draf 0.1");

    return (
      <div className="space-y-4">
        <StringListEditor
          label="Tujuan Pembelajaran"
          items={objectives}
          canEdit={canEdit}
          onChange={(next) => onChangeBody({ ...bodyJson, objectives: next })}
          addLabel="Tambah Tujuan"
        />

        <StringListEditor
          label="Langkah Aktivitas / Penggunaan"
          items={steps}
          canEdit={canEdit}
          onChange={(next) => onChangeBody({ ...bodyJson, steps: next })}
          addLabel="Tambah Langkah"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-res-duration`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Durasi Kegiatan (menit)
            </label>
            <input
              id={`${baseId}-res-duration`}
              type="text"
              inputMode="numeric"
              disabled={!canEdit}
              value={durationMinutes}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                onChangeMeta({
                  ...metadataJson,
                  duration_minutes: digits ? Number.parseInt(digits, 10) : null,
                });
              }}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-res-version`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Label Versi Berkas
            </label>
            <input
              id={`${baseId}-res-version`}
              type="text"
              disabled={!canEdit}
              value={versionLabel}
              onChange={(e) =>
                onChangeMeta({ ...metadataJson, version_label: e.target.value })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-res-file-label`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Label Unduhan Berkas
            </label>
            <input
              id={`${baseId}-res-file-label`}
              type="text"
              disabled={!canEdit}
              value={fileLabel}
              onChange={(e) =>
                onChangeMeta({ ...metadataJson, file_label: e.target.value })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-res-size`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Label Ukuran Berkas
            </label>
            <input
              id={`${baseId}-res-size`}
              type="text"
              disabled={!canEdit}
              value={fileSizeLabel}
              onChange={(e) =>
                onChangeMeta({
                  ...metadataJson,
                  file_size_label: e.target.value,
                })
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>
        </div>
      </div>
    );
  }

  // page | news
  const paragraphs = asStringArray(bodyJson.paragraphs);
  const sectionLabel = asString(metadataJson.section_label);
  const publishedDateLabel = asString(metadataJson.published_date_label);

  return (
    <div className="space-y-4">
      <StringListEditor
        label="Paragraf Isi Halaman / Info"
        items={paragraphs}
        canEdit={canEdit}
        onChange={(next) => onChangeBody({ ...bodyJson, paragraphs: next })}
        addLabel="Tambah Paragraf"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-ed-section`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Label Bagian (Opsional)
          </label>
          <input
            id={`${baseId}-ed-section`}
            type="text"
            disabled={!canEdit}
            value={sectionLabel}
            onChange={(e) =>
              onChangeMeta({ ...metadataJson, section_label: e.target.value })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${baseId}-ed-date`}
            className="text-sm font-bold text-[#1f2a24]"
          >
            Label Tanggal Info (Opsional)
          </label>
          <input
            id={`${baseId}-ed-date`}
            type="text"
            disabled={!canEdit}
            value={publishedDateLabel}
            onChange={(e) =>
              onChangeMeta({
                ...metadataJson,
                published_date_label: e.target.value,
              })
            }
            className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
          />
        </div>
      </div>
    </div>
  );
}
