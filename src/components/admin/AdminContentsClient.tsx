"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CopyPlus,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  CONTENT_SLUG_REGEX,
  slugifyContentTitle,
} from "@/modules/admin/cms-schemas";
import type { AdminContentListItem } from "@/modules/admin/cms-service";
import {
  CONTENT_KIND_LABELS,
  REVISION_STATUS_LABELS,
} from "@/modules/admin/state-machine";
import type { ContentKind, ContentStatus } from "@/modules/content/types";

export interface AdminContentsClientProps {
  initialItems: AdminContentListItem[];
  nextCursor: string | null;
  totalCount: number;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  filters: {
    kind: string;
    status: string;
    q: string;
    cursor: string;
  };
}

const KIND_OPTIONS = Object.entries(CONTENT_KIND_LABELS) as Array<
  [ContentKind, string]
>;
const STATUS_OPTIONS = Object.entries(REVISION_STATUS_LABELS) as Array<
  [ContentStatus, string]
>;

function buildListHref(params: {
  kind?: string;
  status?: string;
  q?: string;
  cursor?: string | null;
}): string {
  const sp = new URLSearchParams();
  if (params.kind) sp.set("kind", params.kind);
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.cursor) sp.set("cursor", params.cursor);
  const qs = sp.toString();
  return qs ? `/admin/konten?${qs}` : "/admin/konten";
}

export function AdminContentsClient({
  initialItems,
  nextCursor,
  totalCount,
  mode,
  migrationPending,
  filters,
}: AdminContentsClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-caption`;
  const createHeadingId = `${baseId}-create-heading`;
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);

  const [newKind, setNewKind] = useState<ContentKind>("chapter");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [newSummary, setNewSummary] = useState("");
  const [newGrades, setNewGrades] = useState<Array<3 | 4>>([3, 4]);
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    slug?: string;
    grades?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  function openCreateDialog() {
    setNewKind("chapter");
    setNewTitle("");
    setNewSlug("");
    setSlugManuallyEdited(false);
    setNewSummary("");
    setNewGrades([3, 4]);
    setFieldErrors({});
    setSubmitError(null);
    createDialogRef.current?.showModal();
  }

  function closeCreateDialog() {
    createDialogRef.current?.close();
    setSubmitError(null);
    setFieldErrors({});
  }

  function validateTitleValue(val: string): string | undefined {
    const trimmed = val.trim();
    if (!trimmed) return "Judul konten wajib diisi.";
    if (trimmed.length > 200) return "Judul maksimal 200 karakter.";
    return undefined;
  }

  function validateSlugValue(val: string): string | undefined {
    const trimmed = val.trim().toLowerCase();
    if (trimmed.length < 2) return "Slug minimal 2 karakter.";
    if (trimmed.length > 120) return "Slug maksimal 120 karakter.";
    if (!CONTENT_SLUG_REGEX.test(trimmed)) {
      return "Slug hanya boleh huruf kecil a-z, angka 0-9, dan tanda hubung (-).";
    }
    return undefined;
  }

  function toggleGrade(grade: 3 | 4) {
    setFieldErrors((prev) => ({ ...prev, grades: undefined }));
    setNewGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const titleErr = validateTitleValue(newTitle);
    const slugErr = validateSlugValue(newSlug);
    const gradesErr =
      newGrades.length === 0 ? "Pilih minimal satu kelas sasaran." : undefined;

    if (titleErr || slugErr || gradesErr) {
      setFieldErrors({ title: titleErr, slug: slugErr, grades: gradesErr });
      if (titleErr) {
        titleInputRef.current?.focus();
      } else if (slugErr) {
        slugInputRef.current?.focus();
      }
      return;
    }

    setCreating(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/contents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          kind: newKind,
          title: newTitle.trim(),
          slug: newSlug.trim().toLowerCase(),
          summary: newSummary.trim(),
          target_grades: [...newGrades].sort((a, b) => a - b),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(
          json?.error?.message ?? "Gagal membuat item konten baru."
        );
        return;
      }

      const contentId = String(json?.data?.content_id ?? "");
      const revisionId = String(json?.data?.revision_id ?? "");
      closeCreateDialog();
      if (contentId && revisionId) {
        router.push(`/admin/konten/${contentId}/revisi/${revisionId}`);
      } else {
        router.refresh();
      }
    } catch {
      setSubmitError("Terjadi gangguan jaringan saat membuat konten baru.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCloneRevision(item: AdminContentListItem) {
    setCloneError(null);
    setCloningId(item.revision_id);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/contents/${item.content_id}/revisions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ source_revision_id: item.revision_id }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCloneError(
          json?.error?.message ?? "Gagal membuat draf revisi baru."
        );
        return;
      }
      const nextRevId = String(json?.data?.revision_id ?? "");
      if (nextRevId) {
        router.push(`/admin/konten/${item.content_id}/revisi/${nextRevId}`);
      } else {
        router.refresh();
      }
    } catch {
      setCloneError("Gagal menghubungi server untuk membuat revisi baru.");
    } finally {
      setCloningId(null);
    }
  }

  const nextCursorHref = nextCursor
    ? buildListHref({
        kind: filters.kind || undefined,
        status: filters.status || undefined,
        q: filters.q || undefined,
        cursor: nextCursor,
      })
    : null;

  const firstPageHref = buildListHref({
    kind: filters.kind || undefined,
    status: filters.status || undefined,
    q: filters.q || undefined,
  });

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            CMS Terkurasi • Fase 2
          </p>
          <h1>Daftar Konten &amp; Revisi CMS</h1>
          <p className="text-sm text-[#3a4640]">
            Menampilkan {initialItems.length} dari {totalCount} revisi
            tercatat. Semua mutasi konten dicatat otomatis ke audit log.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={mode === "local_demo"}
            aria-describedby={
              mode === "local_demo" ? `${baseId}-demo-create-note` : undefined
            }
            className="btn-primary min-h-12 text-xs disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Buat Konten Baru
          </button>
          <Link href="/admin" className="btn-secondary min-h-12 text-xs">
            Ringkasan
          </Link>
        </div>
      </header>

      {mode === "local_demo" ? (
        <div
          id={`${baseId}-demo-create-note`}
          role="status"
          className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/60 p-4 text-sm text-[#6b4400]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Anda dapat memfilter
          daftar sampel dan membuka pratinjau editor revisi. Pembuatan konten
          baru, simpan draf, serta publikasi membutuhkan koneksi Supabase
          aktif.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0012_admin_cms_rpcs.sql</code> sudah dijalankan di Supabase SQL
          Editor sebelum melakukan mutasi CMS.
        </div>
      ) : null}

      {/* Form Pencarian & Filter */}
      <search>
        <form
          method="GET"
          action="/admin/konten"
          className="grid gap-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-4">
            <label
              htmlFor={`${baseId}-filter-q`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Cari Judul atau Slug
            </label>
            <input
              id={`${baseId}-filter-q`}
              type="search"
              name="q"
              defaultValue={filters.q}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
          </div>

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-filter-kind`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Jenis Konten
            </label>
            <select
              id={`${baseId}-filter-kind`}
              name="kind"
              defaultValue={filters.kind}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Jenis</option>
              {KIND_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-filter-status`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Status Revisi
            </label>
            <select
              id={`${baseId}-filter-status`}
              name="status"
              defaultValue={filters.status}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Status</option>
              {STATUS_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <button type="submit" className="btn-primary min-h-12 flex-1 text-xs">
              Terapkan
            </button>
            <Link
              href="/admin/konten"
              className="btn-secondary min-h-12 text-xs"
            >
              Reset
            </Link>
          </div>
        </form>
      </search>

      {cloneError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-4 py-3 text-sm font-semibold text-[#b42318]"
        >
          <AlertCircle size={17} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {cloneError}</span>
        </p>
      ) : null}

      {/* Tabel Daftar Konten & Revisi */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="table-wrapper"
      >
        <table className="responsive-results-table text-left text-sm">
          <caption
            id={captionId}
            className="pb-3 text-left text-xs font-semibold text-[#5b6760]"
          >
            Daftar revisi CMS beserta status alur, gate validasi terbit (khusus
            revisi disetujui), dan tautan menuju editor revisi terstruktur.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Judul &amp; Slug
              </th>
              <th scope="col" className="py-3 pr-4">
                Jenis
              </th>
              <th scope="col" className="py-3 pr-4">
                Status
              </th>
              <th scope="col" className="py-3 pr-4">
                Gate Publikasi
              </th>
              <th scope="col" className="py-3">
                Aksi Kurator
              </th>
            </tr>
          </thead>
          <tbody>
            {initialItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#5b6760]">
                  Tidak ada revisi konten yang cocok dengan filter aktif.
                </td>
              </tr>
            ) : (
              initialItems.map((rev) => {
                const editorHref = `/admin/konten/${rev.content_id}/revisi/${rev.revision_id}`;
                return (
                  <tr
                    key={rev.revision_id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3.5 pr-4 font-normal">
                      <Link
                        href={editorHref}
                        className="font-bold text-[#1f4d38] underline hover:text-[#163829]"
                      >
                        {rev.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-[#5b6760]">
                        <code>{rev.slug}</code> • v{rev.version_no}
                        {rev.is_live_published ? (
                          <span className="ml-2 inline-block rounded bg-[#dcfce7] px-1.5 py-0.5 font-bold text-[#166534]">
                            Live Publik
                          </span>
                        ) : null}
                      </p>
                    </th>
                    <td data-label="Jenis" className="py-3.5 pr-4 text-[#3a4640]">
                      {CONTENT_KIND_LABELS[rev.kind] ?? rev.kind}
                    </td>
                    <td data-label="Status" className="py-3.5 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-1 text-xs font-bold text-[#1f2a24]">
                        {rev.status === "published" ? (
                          <CheckCircle2
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        ) : (
                          <Clock3
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        )}
                        {REVISION_STATUS_LABELS[rev.status] ?? rev.status}
                      </span>
                    </td>
                    <td data-label="Gate Publikasi" className="py-3.5 pr-4">
                      <div className="min-w-0 space-y-1">
                        {rev.status === "published" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-bold text-[#166534]">
                            <CheckCircle2
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            Terbit (Immutable)
                          </span>
                        ) : rev.publish_gate.ready ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-bold text-[#166534]">
                            <CheckCircle2
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            Siap Terbit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-1 text-xs font-bold text-[#8a5a00]">
                            <ShieldAlert
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            Belum Lolos ({rev.publish_gate.missingRequirements.length} syarat)
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Aksi Kurator" className="py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={editorHref}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#2f6b4f] bg-[#f0f6f0] px-3 py-1.5 text-xs font-bold text-[#1f4d38] no-underline hover:bg-[#e1efe2]"
                        >
                          Buka Editor
                          <ArrowRight
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        </Link>
                        {mode === "supabase" ? (
                          <button
                            type="button"
                            onClick={() => void handleCloneRevision(rev)}
                            disabled={cloningId === rev.revision_id}
                            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#d6cec1] bg-white px-3 py-1.5 text-xs font-bold text-[#1f2a24] hover:bg-[#faf6ee] disabled:opacity-55"
                          >
                            <CopyPlus
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {cloningId === rev.revision_id
                              ? "Menyalin..."
                              : "Buat Revisi Baru"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Navigasi Halaman (Cursor Pagination) */}
      {(filters.cursor || nextCursorHref) ? (
        <nav
          aria-label="Navigasi Halaman Konten"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efeae2] pt-4"
        >
          {filters.cursor ? (
            <Link href={firstPageHref} className="btn-secondary min-h-11 text-xs">
              Kembali ke Halaman Pertama
            </Link>
          ) : (
            <span />
          )}
          {nextCursorHref ? (
            <Link href={nextCursorHref} className="btn-primary min-h-11 text-xs">
              Muat Halaman Berikutnya
              <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      ) : null}

      {/* Dialog Native Buat Konten Baru */}
      <dialog
        ref={createDialogRef}
        aria-labelledby={createHeadingId}
        className="m-auto w-[min(94vw,38rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <form onSubmit={(e) => void handleCreateSubmit(e)} noValidate className="space-y-4">
          <div className="space-y-1">
            <h2 id={createHeadingId} className="text-xl font-bold text-[#1f2a24]">
              Buat Item Konten &amp; Draf v1
            </h2>
            <p className="text-sm text-[#3a4640]">
              Setelah tersimpan, Anda akan langsung diarahkan ke editor
              terstruktur untuk mengisi paragraf, sumber, dan validasi.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-create-kind`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Jenis Konten <span aria-hidden="true">*</span>
            </label>
            <select
              id={`${baseId}-create-kind`}
              name="kind"
              autoFocus
              required
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ContentKind)}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24]"
            >
              {KIND_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-create-title`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Judul Konten <span aria-hidden="true">*</span>
            </label>
            <input
              ref={titleInputRef}
              id={`${baseId}-create-title`}
              name="title"
              type="text"
              required
              maxLength={200}
              value={newTitle}
              aria-invalid={fieldErrors.title ? "true" : "false"}
              aria-describedby={
                fieldErrors.title ? `${baseId}-create-title-err` : undefined
              }
              onChange={(e) => {
                const next = e.target.value;
                setNewTitle(next);
                setFieldErrors((prev) => ({ ...prev, title: undefined }));
                if (!slugManuallyEdited) {
                  setNewSlug(slugifyContentTitle(next));
                  setFieldErrors((prev) => ({ ...prev, slug: undefined }));
                }
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  title: validateTitleValue(newTitle),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24]"
            />
            {fieldErrors.title ? (
              <p
                id={`${baseId}-create-title-err`}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#b42318]"
              >
                <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {fieldErrors.title}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-create-slug`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Slug URL <span aria-hidden="true">*</span>
            </label>
            <span
              id={`${baseId}-create-slug-hint`}
              className="text-xs text-[#5b6760]"
            >
              Huruf kecil, angka, dan tanda hubung (contoh: menhir-desa-kemiren).
            </span>
            <input
              ref={slugInputRef}
              id={`${baseId}-create-slug`}
              name="slug"
              type="text"
              required
              maxLength={120}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={newSlug}
              aria-invalid={fieldErrors.slug ? "true" : "false"}
              aria-describedby={
                fieldErrors.slug
                  ? `${baseId}-create-slug-hint ${baseId}-create-slug-err`
                  : `${baseId}-create-slug-hint`
              }
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setNewSlug(e.target.value);
                setFieldErrors((prev) => ({ ...prev, slug: undefined }));
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  slug: validateSlugValue(newSlug),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24]"
            />
            {fieldErrors.slug ? (
              <p
                id={`${baseId}-create-slug-err`}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#b42318]"
              >
                <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {fieldErrors.slug}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-create-summary`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Ringkasan Singkat
            </label>
            <textarea
              id={`${baseId}-create-summary`}
              name="summary"
              rows={2}
              maxLength={600}
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
            />
          </div>

          <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
            <legend className="px-1 text-xs font-bold text-[#1f2a24]">
              Kelas Sasaran (SD Kelas III–IV) <span aria-hidden="true">*</span>
            </legend>
            <div className="flex flex-wrap gap-5">
              {([3, 4] as const).map((grade) => (
                <div key={grade} className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-grade-${grade}`}
                    type="checkbox"
                    name="target_grades"
                    value={grade}
                    checked={newGrades.includes(grade)}
                    onChange={() => toggleGrade(grade)}
                    className="h-5 w-5 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-grade-${grade}`}
                    className="text-sm font-semibold text-[#1f2a24]"
                  >
                    Kelas {grade === 3 ? "III" : "IV"}
                  </label>
                </div>
              ))}
            </div>
            {fieldErrors.grades ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[#b42318]">
                <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {fieldErrors.grades}</span>
              </p>
            ) : null}
          </fieldset>

          {submitError ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b42318]"
            >
              <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Kesalahan: {submitError}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeCreateDialog}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary min-h-12 text-xs disabled:opacity-60"
            >
              {creating ? "Menyimpan..." : "Simpan & Buka Editor"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
