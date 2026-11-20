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
  ShieldCheck,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  CONTENT_SLUG_REGEX,
  slugifyContentTitle,
} from "@/modules/admin/cms-schemas";
import {
  QUIZ_USAGE_MODES,
  QUIZ_USAGE_MODE_LABELS,
  type QuizUsageMode,
} from "@/modules/admin/quiz-schemas";
import type {
  AdminQuizListRow,
  AdminQuizSummaryCounts,
} from "@/modules/admin/quiz-service";
import { REVISION_STATUS_LABELS } from "@/modules/admin/state-machine";
import type { ContentStatus } from "@/modules/content/types";

export interface AdminQuizzesClientProps {
  items: AdminQuizListRow[];
  counts: AdminQuizSummaryCounts;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  filters: {
    grade: string;
    usage_mode: string;
    status: string;
    q: string;
  };
}

const STATUS_OPTIONS = Object.entries(REVISION_STATUS_LABELS) as Array<
  [ContentStatus, string]
>;

export function AdminQuizzesClient({
  items,
  counts,
  mode,
  migrationPending,
  filters,
}: AdminQuizzesClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-quiz-caption`;
  const createDialogRef = useRef<HTMLDialogElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);

  const isSupabaseLive = mode === "supabase";

  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [newGrade, setNewGrade] = useState<3 | 4>(3);
  const [newUsageMode, setNewUsageMode] = useState<QuizUsageMode>("practice");
  const [newInstructions, setNewInstructions] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    title?: string;
    slug?: string;
  }>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloningQuizId, setCloningQuizId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function validateTitle(val: string): string | undefined {
    const trimmed = val.trim();
    if (trimmed.length < 2) return "Judul kuis minimal 2 karakter.";
    if (trimmed.length > 160) return "Judul kuis maksimal 160 karakter.";
    return undefined;
  }

  function validateSlug(val: string): string | undefined {
    const trimmed = val.trim();
    if (trimmed.length < 2) return "Slug kuis minimal 2 karakter.";
    if (!CONTENT_SLUG_REGEX.test(trimmed)) {
      return "Slug hanya boleh huruf kecil, angka, dan tanda hubung.";
    }
    return undefined;
  }

  function openCreateDialog() {
    setNewTitle("");
    setNewSlug("");
    setSlugEdited(false);
    setNewGrade(3);
    setNewUsageMode("practice");
    setNewInstructions("");
    setFieldErrors({});
    setCreateError(null);
    createDialogRef.current?.showModal();
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setCreateError(null);

    const titleErr = validateTitle(newTitle);
    const slugErr = validateSlug(newSlug);
    if (titleErr || slugErr) {
      setFieldErrors({ title: titleErr, slug: slugErr });
      if (titleErr) titleInputRef.current?.focus();
      else if (slugErr) slugInputRef.current?.focus();
      return;
    }

    setCreating(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/quizzes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          slug: newSlug.trim(),
          grade: newGrade,
          usage_mode: newUsageMode,
          instructions: newInstructions.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(
          json?.error?.message ?? "Gagal membuat paket kuis baru."
        );
        return;
      }

      const quizId = String(json?.data?.quiz_id ?? "");
      const revId = String(json?.data?.revision_id ?? "");
      createDialogRef.current?.close();
      if (quizId && revId) {
        router.push(`/admin/kuis/${quizId}/revisi/${revId}`);
      } else {
        router.refresh();
      }
    } catch {
      setCreateError("Terjadi gangguan jaringan saat membuat kuis baru.");
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateNewRevision(row: AdminQuizListRow) {
    if (!isSupabaseLive) return;
    setActionError(null);
    setCloningQuizId(row.revision_id);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(`/api/v1/admin/quizzes/${row.quiz_id}/revisions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ source_revision_id: row.revision_id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ?? "Gagal membuat revisi baru dari kuis."
        );
        return;
      }

      const nextRevId = String(json?.data?.revision_id ?? "");
      if (nextRevId) {
        router.push(`/admin/kuis/${row.quiz_id}/revisi/${nextRevId}`);
      } else {
        router.refresh();
      }
    } catch {
      setActionError("Terjadi gangguan jaringan saat membuat revisi baru.");
    } finally {
      setCloningQuizId(null);
    }
  }

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Kurasi Soal &amp; Kunci Privat • Fase 5
          </p>
          <h1>Bank Kuis &amp; Validasi Soal</h1>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Susun bank soal kelas III–IV, simpan kunci jawaban secara terpisah
            di schema privat (SEC-08), dan terbitkan paket kuis ke latihan
            publik serta Portal Guru.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          disabled={!isSupabaseLive}
          className="btn-primary min-h-12 text-xs disabled:opacity-55"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          Buat Kuis Baru
        </button>
      </header>

      <div className="flex items-start gap-2.5 rounded-2xl border border-[#2f6b4f]/30 bg-[#f0f6f0] p-4 text-xs text-[#1f4d38]">
        <ShieldCheck
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <p className="font-semibold">
          Kunci jawaban dan pembahasan disimpan di{" "}
          <code>private.quiz_answer_keys</code> dan hanya dimuat di balik sesi
          admin aktif MFA dengan header <code>no-store</code> (SEC-08). Kuis
          mode <strong>Tugas Kelas</strong> yang diterbitkan otomatis mengisi
          daftar &ldquo;Kuis Tervalidasi&rdquo; pada{" "}
          <Link href="/guru" className="underline">
            Portal Guru
          </Link>
          .
        </p>
      </div>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Menampilkan sampel kuis
          latihan, kuis tugas guru, dan 1 draf kuis kelas IV (termasuk deteksi
          kemiripan soal latihan → tugas). Penambahan dan pengeditan aktif
          ketika Supabase terkonfigurasi.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0016_admin_quiz_rpcs.sql</code> sudah dijalankan di Supabase
          SQL Editor.
        </div>
      ) : null}

      {/* Kartu Ringkasan Bank Kuis */}
      <section
        aria-label="Ringkasan Status Bank Kuis"
        className="grid grid-cols-2 gap-3 sm:grid-cols-5"
      >
        <div className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <p className="text-xs font-bold text-[#5b6760] uppercase">Total</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2f6b4f]/25 bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold text-[#1f4d38] uppercase">Latihan</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f4d38]">
            {counts.practice}
          </p>
        </div>
        <div className="rounded-2xl border border-[#0e6f7a]/25 bg-[#d8eef0]/50 p-4">
          <p className="text-xs font-bold text-[#0e6f7a] uppercase">
            Tugas Guru
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#0e6f7a]">
            {counts.assignment}
          </p>
        </div>
        <div className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/45 p-4">
          <p className="text-xs font-bold text-[#8a5a00] uppercase">
            Draf &amp; Telaah
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.draft + counts.in_review + counts.approved}
          </p>
        </div>
        <div className="rounded-2xl border border-[#166534]/25 bg-[#dcfce7]/55 p-4">
          <p className="text-xs font-bold text-[#166534] uppercase">Terbit</p>
          <p className="mt-1 text-2xl font-extrabold text-[#166534]">
            {counts.published}
          </p>
        </div>
      </section>

      {actionError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-4 py-3 text-xs font-bold text-[#b42318]"
        >
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {actionError}</span>
        </p>
      ) : null}

      {/* Filter Bank Kuis */}
      <search>
        <form
          method="GET"
          action="/admin/kuis"
          className="grid gap-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-4">
            <label
              htmlFor={`${baseId}-flt-q`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Cari Judul atau Slug Kuis
            </label>
            <input
              id={`${baseId}-flt-q`}
              type="search"
              name="q"
              defaultValue={filters.q}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
          </div>

          <div className="flex flex-col gap-1 lg:col-span-2">
            <label
              htmlFor={`${baseId}-flt-grade`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Kelas
            </label>
            <select
              id={`${baseId}-flt-grade`}
              name="grade"
              defaultValue={filters.grade}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Kelas</option>
              <option value="3">Kelas III</option>
              <option value="4">Kelas IV</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-2">
            <label
              htmlFor={`${baseId}-flt-mode`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Mode Kuis
            </label>
            <select
              id={`${baseId}-flt-mode`}
              name="usage_mode"
              defaultValue={filters.usage_mode}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Mode</option>
              {QUIZ_USAGE_MODES.map((m) => (
                <option key={m} value={m}>
                  {m === "practice" ? "Latihan Publik" : "Tugas Guru"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-2">
            <label
              htmlFor={`${baseId}-flt-status`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Status
            </label>
            <select
              id={`${baseId}-flt-status`}
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
            <Link href="/admin/kuis" className="btn-secondary min-h-12 text-xs">
              Reset
            </Link>
          </div>
        </form>
      </search>

      {/* Tabel Daftar Revisi Kuis */}
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
            Daftar revisi paket kuis latihan dan tugas guru beserta jumlah
            butir soal dan status kesiapan publikasi.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Judul &amp; Slug
              </th>
              <th scope="col" className="py-3 pr-4">
                Kelas &amp; Mode
              </th>
              <th scope="col" className="py-3 pr-4">
                Status &amp; Soal
              </th>
              <th scope="col" className="py-3 pr-4">
                Gate Publikasi
              </th>
              <th scope="col" className="py-3">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#5b6760]">
                  Tidak ada paket kuis yang cocok dengan filter saat ini.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const pendingChecks = row.publish_gate.checks.filter(
                  (c) => !c.ok
                ).length;
                return (
                  <tr
                    key={row.revision_id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3.5 pr-4 font-normal">
                      <p className="font-bold text-[#1f2a24]">
                        {row.title}{" "}
                        <span className="ml-1 inline-block rounded-full bg-[#efeae2] px-2 py-0.5 text-[11px] font-bold">
                          v{row.version_no}
                        </span>
                      </p>
                      <code className="text-xs text-[#5b6760]">{row.slug}</code>
                    </th>
                    <td
                      data-label="Kelas & Mode"
                      className="py-3.5 pr-4 text-xs text-[#3a4640]"
                    >
                      <p className="font-bold text-[#1f2a24]">
                        Kelas {row.grade === 3 ? "III" : "IV"}
                      </p>
                      <p>{QUIZ_USAGE_MODE_LABELS[row.usage_mode]}</p>
                    </td>
                    <td data-label="Status & Soal" className="py-3.5 pr-4 text-xs">
                      {row.status === "published" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 font-bold text-[#166534]">
                          <CheckCircle2
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          {REVISION_STATUS_LABELS[row.status]}
                          {row.is_live_published ? " (Aktif)" : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 font-bold text-[#8a5a00]">
                          <Clock3
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          {REVISION_STATUS_LABELS[row.status]}
                        </span>
                      )}
                      <p className="mt-1 text-[#3a4640]">
                        {row.question_count} butir soal
                      </p>
                    </td>
                    <td
                      data-label="Gate Publikasi"
                      className="py-3.5 pr-4 text-xs"
                    >
                      {row.publish_gate.ready ? (
                        <span className="font-bold text-[#166534]">
                          Siap Terbit
                        </span>
                      ) : (
                        <span className="font-semibold text-[#8a5a00]">
                          {pendingChecks} syarat belum terpenuhi
                        </span>
                      )}
                    </td>
                    <td data-label="Aksi" className="py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/kuis/${row.quiz_id}/revisi/${row.revision_id}`}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#2f6b4f] bg-[#f0f6f0] px-3.5 py-1.5 text-xs font-bold text-[#1f4d38] no-underline hover:bg-[#e1efe2]"
                        >
                          Buka Editor
                          <ArrowRight
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                        </Link>
                        {isSupabaseLive ? (
                          <button
                            type="button"
                            disabled={cloningQuizId === row.revision_id}
                            onClick={() => void handleCreateNewRevision(row)}
                            className="btn-secondary min-h-11 text-xs disabled:opacity-55"
                          >
                            <CopyPlus
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {cloningQuizId === row.revision_id
                              ? "Menyalin..."
                              : "Revisi Baru"}
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

      {/* Dialog Native Pembuatan Kuis Baru */}
      <dialog
        ref={createDialogRef}
        aria-labelledby={`${baseId}-create-dialog-title`}
        className="m-auto w-[min(94vw,36rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <form
          onSubmit={(e) => void handleCreateSubmit(e)}
          noValidate
          className="space-y-4"
        >
          <h2
            id={`${baseId}-create-dialog-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            Buat Paket Kuis Baru (Draf v1)
          </h2>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-new-title`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Judul Kuis <span aria-hidden="true">*</span>
            </label>
            <input
              ref={titleInputRef}
              id={`${baseId}-new-title`}
              name="title"
              type="text"
              autoFocus
              required
              maxLength={160}
              value={newTitle}
              aria-invalid={fieldErrors.title ? "true" : "false"}
              aria-describedby={
                fieldErrors.title ? `${baseId}-new-title-err` : undefined
              }
              onChange={(e) => {
                const next = e.target.value;
                setNewTitle(next);
                setFieldErrors((prev) => ({ ...prev, title: undefined }));
                if (!slugEdited) {
                  setNewSlug(slugifyContentTitle(next));
                  setFieldErrors((prev) => ({ ...prev, slug: undefined }));
                }
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  title: validateTitle(newTitle),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {fieldErrors.title ? (
              <p
                id={`${baseId}-new-title-err`}
                className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
              >
                <AlertCircle size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {fieldErrors.title}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-new-slug`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Slug URL <span aria-hidden="true">*</span>
            </label>
            <span id={`${baseId}-new-slug-hint`} className="text-[11px] text-[#5b6760]">
              Huruf kecil, angka, dan tanda hubung (contoh: kuis-kenong-kelas-4).
            </span>
            <input
              ref={slugInputRef}
              id={`${baseId}-new-slug`}
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
                  ? `${baseId}-new-slug-hint ${baseId}-new-slug-err`
                  : `${baseId}-new-slug-hint`
              }
              onChange={(e) => {
                setSlugEdited(true);
                setNewSlug(e.target.value);
                setFieldErrors((prev) => ({ ...prev, slug: undefined }));
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  slug: validateSlug(newSlug),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {fieldErrors.slug ? (
              <p
                id={`${baseId}-new-slug-err`}
                className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
              >
                <AlertCircle size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {fieldErrors.slug}</span>
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
              <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                Kelas Sasaran <span aria-hidden="true">*</span>
              </legend>
              <div className="flex gap-4">
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-new-grade-3`}
                    type="radio"
                    name="grade"
                    checked={newGrade === 3}
                    onChange={() => setNewGrade(3)}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-new-grade-3`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Kelas III
                  </label>
                </div>
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-new-grade-4`}
                    type="radio"
                    name="grade"
                    checked={newGrade === 4}
                    onChange={() => setNewGrade(4)}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-new-grade-4`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Kelas IV
                  </label>
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
              <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                Mode Penggunaan <span aria-hidden="true">*</span>
              </legend>
              <div className="flex flex-col gap-1.5">
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-new-mode-practice`}
                    type="radio"
                    name="usage_mode"
                    checked={newUsageMode === "practice"}
                    onChange={() => setNewUsageMode("practice")}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-new-mode-practice`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Latihan Mandiri (Publik)
                  </label>
                </div>
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-new-mode-assignment`}
                    type="radio"
                    name="usage_mode"
                    checked={newUsageMode === "assignment"}
                    onChange={() => setNewUsageMode("assignment")}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-new-mode-assignment`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Tugas Kelas (Portal Guru)
                  </label>
                </div>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-new-inst`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Petunjuk Pengerjaan Siswa (Opsional)
            </label>
            <textarea
              id={`${baseId}-new-inst`}
              name="instructions"
              rows={2}
              maxLength={1000}
              value={newInstructions}
              onChange={(e) => setNewInstructions(e.target.value)}
              className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
            />
          </div>

          {createError ? (
            <p
              role="alert"
              className="rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              Kesalahan: {createError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => createDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={creating}
              className="btn-primary min-h-12 text-xs disabled:opacity-55"
            >
              {creating ? "Membuat..." : "Simpan & Buka Editor"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
