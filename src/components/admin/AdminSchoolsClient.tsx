"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  PencilLine,
  Plus,
  Users,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  SCHOOL_STATUSES,
  SCHOOL_STATUS_LABELS,
  type SchoolStatus,
} from "@/modules/admin/people-schemas";
import type { AdminSchoolRow } from "@/modules/admin/people-service";

export interface AdminSchoolsClientProps {
  items: AdminSchoolRow[];
  counts: {
    total: number;
    active: number;
    archived: number;
  };
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  filters: {
    status: string;
    q: string;
  };
}

export function AdminSchoolsClient({
  items,
  counts,
  mode,
  migrationPending,
  filters,
}: AdminSchoolsClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-schools-caption`;
  const isSupabaseLive = mode === "supabase";

  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const districtInputRef = useRef<HTMLInputElement>(null);

  const [editingSchool, setEditingSchool] = useState<AdminSchoolRow | null>(
    null
  );
  const [schoolName, setSchoolName] = useState("");
  const [districtLabel, setDistrictLabel] = useState("");
  const [schoolStatus, setSchoolStatus] = useState<SchoolStatus>("active");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    district?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pageMessage, setPageMessage] = useState<string | null>(null);

  function validateName(val: string): string | undefined {
    const t = val.trim();
    if (t.length < 2) return "Nama sekolah minimal 2 karakter.";
    if (t.length > 120) return "Nama sekolah maksimal 120 karakter.";
    return undefined;
  }

  function validateDistrict(val: string): string | undefined {
    const t = val.trim();
    if (t.length < 2) return "Wilayah / kecamatan minimal 2 karakter.";
    if (t.length > 80) return "Wilayah / kecamatan maksimal 80 karakter.";
    return undefined;
  }

  function openCreateDialog() {
    setEditingSchool(null);
    setSchoolName("");
    setDistrictLabel("");
    setSchoolStatus("active");
    setFieldErrors({});
    setSubmitError(null);
    dialogRef.current?.showModal();
  }

  function openEditDialog(school: AdminSchoolRow) {
    setEditingSchool(school);
    setSchoolName(school.name);
    setDistrictLabel(school.district_label);
    setSchoolStatus(school.status);
    setFieldErrors({});
    setSubmitError(null);
    dialogRef.current?.showModal();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setSubmitError(null);
    setPageMessage(null);

    const nameErr = validateName(schoolName);
    const distErr = validateDistrict(districtLabel);
    if (nameErr || distErr) {
      setFieldErrors({ name: nameErr, district: distErr });
      if (nameErr) nameInputRef.current?.focus();
      else if (distErr) districtInputRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const endpoint = editingSchool
        ? `/api/v1/admin/schools/${editingSchool.id}`
        : "/api/v1/admin/schools";
      const method = editingSchool ? "PATCH" : "POST";
      const body = editingSchool
        ? {
            name: schoolName.trim(),
            district_label: districtLabel.trim(),
            status: schoolStatus,
          }
        : {
            name: schoolName.trim(),
            district_label: districtLabel.trim(),
          };

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(json?.error?.message ?? "Gagal menyimpan data sekolah.");
        return;
      }

      dialogRef.current?.close();
      setPageMessage(
        editingSchool
          ? `Data sekolah '${schoolName.trim()}' berhasil diperbarui.`
          : `Sekolah baru '${schoolName.trim()}' berhasil ditambahkan.`
      );
      router.refresh();
    } catch {
      setSubmitError("Terjadi gangguan jaringan saat menyimpan data sekolah.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Direktori Satuan Pendidikan • Fase 6
          </p>
          <h1>Daftar Sekolah Terdaftar</h1>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Kelola sekolah mitra di Kabupaten Banyuwangi yang dipakai untuk
            tautan guru dan pembuatan kelas. Arsip sekolah menjaga keutuhan
            histori kelas yang sudah ada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/guru"
            prefetch={false}
            className="btn-secondary min-h-12 text-xs"
          >
            <Users size={15} strokeWidth={1.75} aria-hidden="true" />
            Kelola Akun Guru
          </Link>
          <button
            type="button"
            onClick={openCreateDialog}
            disabled={!isSupabaseLive}
            className="btn-primary min-h-12 text-xs disabled:opacity-55"
          >
            <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
            Tambah Sekolah
          </button>
        </div>
      </header>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Menampilkan sampel 3
          sekolah Banyuwangi beserta status aktif/arsip. Penambahan &amp;
          perubahan aktif ketika Supabase terkonfigurasi.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0017_admin_people_rpcs.sql</code> sudah dijalankan di Supabase
          SQL Editor.
        </div>
      ) : null}

      {/* Kartu Ringkasan Sekolah */}
      <section
        aria-label="Ringkasan Status Sekolah"
        className="grid grid-cols-3 gap-3"
      >
        <div className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <p className="text-xs font-bold text-[#5b6760] uppercase">Total</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2f6b4f]/25 bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold text-[#1f4d38] uppercase">Aktif</p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f4d38]">
            {counts.active}
          </p>
        </div>
        <div className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/45 p-4">
          <p className="text-xs font-bold text-[#8a5a00] uppercase">
            Diarsipkan
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.archived}
          </p>
        </div>
      </section>

      {pageMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-4 py-3 text-xs font-bold text-[#166534]"
        >
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{pageMessage}</span>
        </p>
      ) : null}

      {/* Pencarian & Filter */}
      <search>
        <form
          method="GET"
          action="/admin/sekolah"
          className="grid gap-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-6">
            <label
              htmlFor={`${baseId}-flt-q`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Cari Nama Sekolah atau Kecamatan
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

          <div className="flex flex-col gap-1 lg:col-span-4">
            <label
              htmlFor={`${baseId}-flt-status`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Status Sekolah
            </label>
            <select
              id={`${baseId}-flt-status`}
              name="status"
              defaultValue={filters.status}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Status</option>
              {SCHOOL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {SCHOOL_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <button type="submit" className="btn-primary min-h-12 flex-1 text-xs">
              Terapkan
            </button>
            <Link
              href="/admin/sekolah"
              prefetch={false}
              className="btn-secondary min-h-12 text-xs"
            >
              Reset
            </Link>
          </div>
        </form>
      </search>

      {/* Tabel Sekolah */}
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
            Daftar sekolah yang dapat ditautkan ke akun guru beserta jumlah guru
            tertaut aktif.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Nama Sekolah &amp; Wilayah
              </th>
              <th scope="col" className="py-3 pr-4">
                Status
              </th>
              <th scope="col" className="py-3 pr-4">
                Guru Tertaut Aktif
              </th>
              <th scope="col" className="py-3">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[#5b6760]">
                  Tidak ada sekolah yang sesuai filter saat ini.
                </td>
              </tr>
            ) : (
              items.map((school) => (
                <tr
                  key={school.id}
                  className="border-b border-[#efeae2] align-top"
                >
                  <th scope="row" className="py-3.5 pr-4 font-normal">
                    <p className="font-bold text-[#1f2a24]">{school.name}</p>
                    <p className="text-xs text-[#5b6760]">
                      {school.district_label}
                    </p>
                  </th>
                  <td data-label="Status" className="py-3.5 pr-4 text-xs">
                    {school.status === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 font-bold text-[#166534]">
                        <CheckCircle2
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {SCHOOL_STATUS_LABELS.active}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-0.5 font-bold text-[#5b6760]">
                        <Archive
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {SCHOOL_STATUS_LABELS.archived}
                      </span>
                    )}
                  </td>
                  <td
                    data-label="Guru Tertaut Aktif"
                    className="py-3.5 pr-4 text-xs font-bold text-[#1f2a24]"
                  >
                    {school.active_teacher_count} guru
                  </td>
                  <td data-label="Aksi" className="py-3.5">
                    <button
                      type="button"
                      disabled={!isSupabaseLive}
                      onClick={() => openEditDialog(school)}
                      className="btn-secondary min-h-11 text-xs disabled:opacity-55"
                    >
                      <PencilLine
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Ubah / Arsipkan
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog Native Tambah / Sunting Sekolah */}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${baseId}-school-dialog-title`}
        className="m-auto w-[min(94vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <form
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
          className="space-y-4"
        >
          <h2
            id={`${baseId}-school-dialog-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            {editingSchool ? "Perbarui Data Sekolah" : "Tambah Sekolah Baru"}
          </h2>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-sch-name`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Nama Sekolah <span aria-hidden="true">*</span>
            </label>
            <input
              ref={nameInputRef}
              id={`${baseId}-sch-name`}
              name="name"
              type="text"
              autoFocus
              required
              maxLength={120}
              value={schoolName}
              aria-invalid={fieldErrors.name ? "true" : "false"}
              aria-describedby={
                fieldErrors.name ? `${baseId}-sch-name-err` : undefined
              }
              onChange={(e) => {
                setSchoolName(e.target.value);
                if (fieldErrors.name) {
                  setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  name: validateName(schoolName),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {fieldErrors.name ? (
              <p
                id={`${baseId}-sch-name-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-sch-dist`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Kecamatan / Wilayah <span aria-hidden="true">*</span>
            </label>
            <span
              id={`${baseId}-sch-dist-hint`}
              className="text-[11px] text-[#5b6760]"
            >
              Contoh: Kec. Glagah, Banyuwangi
            </span>
            <input
              ref={districtInputRef}
              id={`${baseId}-sch-dist`}
              name="district_label"
              type="text"
              required
              maxLength={80}
              value={districtLabel}
              aria-invalid={fieldErrors.district ? "true" : "false"}
              aria-describedby={
                fieldErrors.district
                  ? `${baseId}-sch-dist-hint ${baseId}-sch-dist-err`
                  : `${baseId}-sch-dist-hint`
              }
              onChange={(e) => {
                setDistrictLabel(e.target.value);
                if (fieldErrors.district) {
                  setFieldErrors((prev) => ({ ...prev, district: undefined }));
                }
              }}
              onBlur={() =>
                setFieldErrors((prev) => ({
                  ...prev,
                  district: validateDistrict(districtLabel),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {fieldErrors.district ? (
              <p
                id={`${baseId}-sch-dist-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {fieldErrors.district}
              </p>
            ) : null}
          </div>

          {editingSchool ? (
            <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
              <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                Status Sekolah
              </legend>
              <div className="flex gap-4">
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-sch-st-active`}
                    type="radio"
                    name="school_status"
                    checked={schoolStatus === "active"}
                    onChange={() => setSchoolStatus("active")}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-sch-st-active`}
                    className="text-xs font-bold text-[#166534]"
                  >
                    Aktif
                  </label>
                </div>
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-sch-st-arch`}
                    type="radio"
                    name="school_status"
                    checked={schoolStatus === "archived"}
                    onChange={() => setSchoolStatus("archived")}
                    className="h-4 w-4 accent-[#8a5a00]"
                  />
                  <label
                    htmlFor={`${baseId}-sch-st-arch`}
                    className="text-xs font-bold text-[#5b6760]"
                  >
                    Diarsipkan (cegah tautan baru)
                  </label>
                </div>
              </div>
            </fieldset>
          ) : null}

          {submitError ? (
            <p
              role="alert"
              className="flex items-center gap-1.5 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
              <span>Kesalahan: {submitError}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary min-h-12 text-xs disabled:opacity-55"
            >
              {saving ? "Menyimpan..." : "Simpan Sekolah"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
