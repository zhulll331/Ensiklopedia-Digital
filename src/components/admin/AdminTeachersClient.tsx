"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  School,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  TEACHER_STATUSES,
  TEACHER_STATUS_LABELS,
} from "@/modules/admin/people-schemas";
import type {
  AdminSchoolRow,
  AdminTeacherRow,
} from "@/modules/admin/people-service";

export interface AdminTeachersClientProps {
  items: AdminTeacherRow[];
  counts: {
    total: number;
    active: number;
    invited: number;
    suspended: number;
  };
  schools: AdminSchoolRow[];
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  filters: {
    status: string;
    school_id: string;
    q: string;
  };
}

export function AdminTeachersClient({
  items,
  counts,
  schools,
  mode,
  migrationPending,
  filters,
}: AdminTeachersClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-teachers-caption`;
  const isSupabaseLive = mode === "supabase";

  const activeSchools = schools.filter((s) => s.status === "active");

  // Banner umpan balik halaman
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  // Dialog 1: Undang Guru Baru
  const inviteDialogRef = useRef<HTMLDialogElement>(null);
  const inviteEmailRef = useRef<HTMLInputElement>(null);
  const inviteNameRef = useRef<HTMLInputElement>(null);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invSchoolIds, setInvSchoolIds] = useState<string[]>([]);
  const [invErrors, setInvErrors] = useState<{
    email?: string;
    name?: string;
  }>({});
  const [invSubmitErr, setInvSubmitErr] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Dialog 2: Kelola Profil & Tautan Sekolah Guru
  const manageDialogRef = useRef<HTMLDialogElement>(null);
  const manageNameRef = useRef<HTMLInputElement>(null);
  const [manageTarget, setManageTarget] = useState<AdminTeacherRow | null>(
    null
  );
  const [manageName, setManageName] = useState("");
  const [manageNameErr, setManageNameErr] = useState<string | null>(null);
  const [manageErr, setManageErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [togglingSchoolId, setTogglingSchoolId] = useState<string | null>(null);

  // Dialog 3: Konfirmasi Suspensi / Aktivasi Guru
  const statusDialogRef = useRef<HTMLDialogElement>(null);
  const statusReasonRef = useRef<HTMLTextAreaElement>(null);
  const [statusTarget, setStatusTarget] = useState<AdminTeacherRow | null>(
    null
  );
  const [nextStatus, setNextStatus] = useState<"active" | "suspended">(
    "suspended"
  );
  const [statusReason, setStatusReason] = useState("");
  const [statusReasonErr, setStatusReasonErr] = useState<string | null>(null);
  const [statusSubmitErr, setStatusSubmitErr] = useState<string | null>(null);
  const [statusNeedsReauth, setStatusNeedsReauth] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  function validateEmail(val: string): string | undefined {
    const trimmed = val.trim();
    if (!trimmed) return "Alamat email guru wajib diisi.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return "Masukkan alamat email yang sah (contoh: nama@sekolah.sch.id).";
    }
    return undefined;
  }

  function validateDisplayName(val: string): string | undefined {
    const trimmed = val.trim();
    if (trimmed.length < 2) return "Nama tampilan minimal 2 karakter.";
    if (trimmed.length > 80) return "Nama tampilan maksimal 80 karakter.";
    return undefined;
  }

  function openInviteDialog() {
    setInvEmail("");
    setInvName("");
    setInvSchoolIds(activeSchools[0] ? [activeSchools[0].id] : []);
    setInvErrors({});
    setInvSubmitErr(null);
    inviteDialogRef.current?.showModal();
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setInvSubmitErr(null);
    setPageMessage(null);
    setPageError(null);

    const emailErr = validateEmail(invEmail);
    const nameErr = validateDisplayName(invName);
    if (emailErr || nameErr) {
      setInvErrors({ email: emailErr, name: nameErr });
      if (emailErr) inviteEmailRef.current?.focus();
      else if (nameErr) inviteNameRef.current?.focus();
      return;
    }

    setInviting(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/teachers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          email: invEmail.trim().toLowerCase(),
          display_name: invName.trim(),
          school_ids: invSchoolIds,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setInvSubmitErr(
          json?.error?.message ?? "Gagal mengirim undangan guru."
        );
        return;
      }

      const inviteSent = Boolean(json?.data?.invite_sent);
      inviteDialogRef.current?.close();
      setPageMessage(
        inviteSent
          ? `Undangan guru untuk ${invName.trim()} dikirim ke email (redirect ke /auth/callback?next=/auth/aktivasi).`
          : `Profil guru ${invName.trim()} terdaftar/diperbarui tanpa mengirim ulang email.`
      );
      router.refresh();
    } catch {
      setInvSubmitErr("Terjadi gangguan jaringan saat mengirim undangan.");
    } finally {
      setInviting(false);
    }
  }

  function openManageDialog(teacher: AdminTeacherRow) {
    setManageTarget(teacher);
    setManageName(teacher.display_name);
    setManageNameErr(null);
    setManageErr(null);
    manageDialogRef.current?.showModal();
  }

  async function handleSaveTeacherProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manageTarget || !isSupabaseLive) return;
    setManageErr(null);

    const nameErr = validateDisplayName(manageName);
    if (nameErr) {
      setManageNameErr(nameErr);
      manageNameRef.current?.focus();
      return;
    }

    setSavingProfile(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(`/api/v1/admin/teachers/${manageTarget.user_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ display_name: manageName.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setManageErr(json?.error?.message ?? "Gagal memperbarui profil guru.");
        return;
      }

      setManageTarget((prev) =>
        prev ? { ...prev, display_name: manageName.trim() } : prev
      );
      setPageMessage("Nama tampilan guru berhasil diperbarui.");
      router.refresh();
    } catch {
      setManageErr("Terjadi gangguan jaringan saat menyimpan profil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleToggleSchoolLink(
    teacher: AdminTeacherRow,
    school: AdminSchoolRow,
    targetLinkStatus: "active" | "inactive"
  ) {
    if (!isSupabaseLive) return;
    setManageErr(null);
    setTogglingSchoolId(school.id);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/teachers/${teacher.user_id}/schools`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            school_id: school.id,
            status: targetLinkStatus,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setManageErr(
          json?.error?.message ?? "Gagal mengubah tautan sekolah guru."
        );
        return;
      }

      setManageTarget((prev) => {
        if (!prev) return prev;
        const exists = prev.schools.some((s) => s.school_id === school.id);
        const updatedSchools = exists
          ? prev.schools.map((s) =>
              s.school_id === school.id
                ? { ...s, link_status: targetLinkStatus }
                : s
            )
          : [
              ...prev.schools,
              {
                school_id: school.id,
                school_name: school.name,
                district_label: school.district_label,
                link_status: targetLinkStatus,
                school_status: school.status,
              },
            ];
        return { ...prev, schools: updatedSchools };
      });
      setPageMessage(
        `Tautan ${teacher.display_name} ↔ ${school.name} disetel menjadi '${targetLinkStatus === "active" ? "Aktif" : "Nonaktif"}'.`
      );
      router.refresh();
    } catch {
      setManageErr("Terjadi gangguan jaringan saat memperbarui tautan sekolah.");
    } finally {
      setTogglingSchoolId(null);
    }
  }

  function openStatusDialog(
    teacher: AdminTeacherRow,
    target: "active" | "suspended"
  ) {
    setStatusTarget(teacher);
    setNextStatus(target);
    setStatusReason("");
    setStatusReasonErr(null);
    setStatusSubmitErr(null);
    setStatusNeedsReauth(false);
    statusDialogRef.current?.showModal();
  }

  async function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusTarget || !isSupabaseLive) return;
    setStatusSubmitErr(null);
    setStatusNeedsReauth(false);

    if (nextStatus === "suspended" && statusReason.trim().length < 5) {
      setStatusReasonErr("Alasan suspensi minimal 5 karakter wajib diisi.");
      statusReasonRef.current?.focus();
      return;
    }

    setUpdatingStatus(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/teachers/${statusTarget.user_id}/status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            status: nextStatus,
            reason: statusReason.trim() || undefined,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal mengubah status akun guru.";
        setStatusSubmitErr(msg);
        setStatusNeedsReauth(
          res.status === 403 && /verifikasi ulang/i.test(msg)
        );
        return;
      }

      const authBanSynced = json?.data?.auth_ban_synced !== false;
      statusDialogRef.current?.close();
      setPageMessage(
        nextStatus === "suspended"
          ? authBanSynced
            ? `Akun ${statusTarget.display_name} disuspensi dan diblokir seketika dari Supabase Auth & RLS.`
            : `Akun ${statusTarget.display_name} disuspensi di RLS, namun sinkronisasi ban Auth perlu diperiksa ulang.`
          : `Akun ${statusTarget.display_name} diaktifkan kembali dan dapat masuk ke Portal Guru.`
      );
      router.refresh();
    } catch {
      setStatusSubmitErr("Terjadi gangguan jaringan saat mengubah status akun.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Identitas Pendidik &amp; Sekolah • Fase 6
          </p>
          <h1>Manajemen Akun Guru</h1>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Undang guru baru melalui tautan email aman Supabase Auth, kelola
            tautan sekolah, dan terapkan suspensi seketika.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/sekolah"
            prefetch={false}
            className="btn-secondary min-h-12 text-xs"
          >
            <School size={15} strokeWidth={1.75} aria-hidden="true" />
            Daftar Sekolah
          </Link>
          <button
            type="button"
            onClick={openInviteDialog}
            disabled={!isSupabaseLive}
            className="btn-primary min-h-12 text-xs disabled:opacity-55"
          >
            <UserPlus size={15} strokeWidth={1.75} aria-hidden="true" />
            Undang Guru Baru
          </button>
        </div>
      </header>

      {/* Banner Kebijakan Keamanan 05_API */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/65 p-4 text-xs text-[#6b4400]">
        <ShieldAlert
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-bold text-[#1f2a24]">
            Pemisahan Wewenang Akun (05_API §6 • SEC-02 / SEC-03)
          </p>
          <p>
            <strong>Peran admin tidak dapat diberikan melalui form ini.</strong>{" "}
            Semua akun yang diundang otomatis berkedudukan sebagai{" "}
            <code>teacher</code> dengan redirect ke{" "}
            <code>/auth/callback?next=/auth/aktivasi</code>. Penambahan akun admin hanya
            dilakukan operator lewat skrip CLI terpisah. Suspensi guru berlaku
            seketika pada RLS serta sesi Auth.
          </p>
        </div>
      </div>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Menampilkan sampel 4
          akun guru (aktif, diundang, dan disuspensi) beserta tautan sekolah
          Banyuwangi. Undangan email, ubah profil, dan suspensi aktif ketika
          Supabase terkonfigurasi.
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

      {/* Kartu Ringkasan Akun Guru */}
      <section
        aria-label="Ringkasan Status Akun Guru"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <p className="text-xs font-bold text-[#5b6760] uppercase">
            Total Guru
          </p>
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
            Diundang
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.invited}
          </p>
        </div>
        <div className="rounded-2xl border border-[#b42318]/25 bg-[#fde8e6]/60 p-4">
          <p className="text-xs font-bold text-[#b42318] uppercase">
            Disuspensi
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#b42318]">
            {counts.suspended}
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

      {pageError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-4 py-3 text-xs font-bold text-[#b42318]"
        >
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {pageError}</span>
        </p>
      ) : null}

      {/* Pencarian & Filter */}
      <search>
        <form
          method="GET"
          action="/admin/guru"
          className="grid gap-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-4">
            <label
              htmlFor={`${baseId}-flt-q`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Cari Nama atau Email Guru
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

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-flt-status`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Status Akun
            </label>
            <select
              id={`${baseId}-flt-status`}
              name="status"
              defaultValue={filters.status}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Status</option>
              {TEACHER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {TEACHER_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-flt-school`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Sekolah Tertaut
            </label>
            <select
              id={`${baseId}-flt-school`}
              name="school_id"
              defaultValue={filters.school_id}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Sekolah</option>
              {schools.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <button type="submit" className="btn-primary min-h-12 flex-1 text-xs">
              Terapkan
            </button>
            <Link
              href="/admin/guru"
              prefetch={false}
              className="btn-secondary min-h-12 text-xs"
            >
              Reset
            </Link>
          </div>
        </form>
      </search>

      {/* Tabel Daftar Guru */}
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
            Daftar akun pendidik terundang dan aktif beserta sekolah yang
            ditautkan serta kontrol status akses.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Nama &amp; Email
              </th>
              <th scope="col" className="py-3 pr-4">
                Status Akun
              </th>
              <th scope="col" className="py-3 pr-4">
                Sekolah Tertaut
              </th>
              <th scope="col" className="py-3">
                Aksi Admin
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[#5b6760]">
                  Tidak ada akun guru yang sesuai filter saat ini.
                </td>
              </tr>
            ) : (
              items.map((teacher) => (
                <tr
                  key={teacher.user_id}
                  className="border-b border-[#efeae2] align-top"
                >
                  <th scope="row" className="py-3.5 pr-4 font-normal">
                    <p className="font-bold text-[#1f2a24]">
                      {teacher.display_name}
                    </p>
                    <p className="text-xs text-[#5b6760]">
                      {teacher.email ?? teacher.user_id}
                    </p>
                  </th>
                  <td data-label="Status Akun" className="py-3.5 pr-4 text-xs">
                    {teacher.status === "active" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 font-bold text-[#166534]">
                        <CheckCircle2
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {TEACHER_STATUS_LABELS.active}
                      </span>
                    ) : teacher.status === "invited" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 font-bold text-[#8a5a00]">
                        <Clock3
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {TEACHER_STATUS_LABELS.invited}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fde8e6] px-2.5 py-0.5 font-bold text-[#b42318]">
                        <Ban
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {TEACHER_STATUS_LABELS.suspended}
                      </span>
                    )}
                  </td>
                  <td
                    data-label="Sekolah Tertaut"
                    className="py-3.5 pr-4 text-xs text-[#3a4640]"
                  >
                    {teacher.schools.length === 0 ? (
                      <span className="text-[#8a5a00]">Belum ditautkan</span>
                    ) : (
                      <ul className="list-none space-y-1 p-0">
                        {teacher.schools.map((sc) => (
                          <li key={sc.school_id}>
                            <span className="font-semibold text-[#1f2a24]">
                              {sc.school_name}
                            </span>{" "}
                            <span className="text-[11px] text-[#5b6760]">
                              (
                              {sc.link_status === "active"
                                ? "Tautan Aktif"
                                : "Nonaktif"}
                              )
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Aksi Admin" className="py-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!isSupabaseLive}
                        onClick={() => openManageDialog(teacher)}
                        className="btn-secondary min-h-11 text-xs disabled:opacity-55"
                      >
                        Profil &amp; Sekolah
                      </button>

                      {teacher.status === "suspended" ? (
                        <button
                          type="button"
                          disabled={!isSupabaseLive}
                          onClick={() => openStatusDialog(teacher, "active")}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#2f6b4f] bg-[#f0f6f0] px-3.5 py-1.5 text-xs font-bold text-[#1f4d38] disabled:opacity-55"
                        >
                          <UserCheck
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Aktifkan
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isSupabaseLive}
                          onClick={() => openStatusDialog(teacher, "suspended")}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#b42318]/40 bg-[#fde8e6] px-3.5 py-1.5 text-xs font-bold text-[#b42318] disabled:opacity-55"
                        >
                          <UserX
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Suspensi
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog Native 1: Undang Guru Baru */}
      <dialog
        ref={inviteDialogRef}
        aria-labelledby={`${baseId}-invite-title`}
        className="m-auto w-[min(94vw,36rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <form
          onSubmit={(e) => void handleInviteSubmit(e)}
          noValidate
          className="space-y-4"
        >
          <h2
            id={`${baseId}-invite-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            Undang Guru Baru ke Portal EDMB
          </h2>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-inv-email`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Alamat Email Guru <span aria-hidden="true">*</span>
            </label>
            <span
              id={`${baseId}-inv-email-hint`}
              className="text-[11px] text-[#5b6760]"
            >
              Tautan undangan dikirim ke email ini menuju{" "}
              <code>/auth/callback?next=/auth/aktivasi</code>.
            </span>
            <input
              ref={inviteEmailRef}
              id={`${baseId}-inv-email`}
              name="email"
              type="email"
              autoFocus
              required
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              value={invEmail}
              aria-invalid={invErrors.email ? "true" : "false"}
              aria-describedby={
                invErrors.email
                  ? `${baseId}-inv-email-hint ${baseId}-inv-email-err`
                  : `${baseId}-inv-email-hint`
              }
              onChange={(e) => {
                setInvEmail(e.target.value);
                if (invErrors.email) {
                  setInvErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              onBlur={() =>
                setInvErrors((prev) => ({
                  ...prev,
                  email: validateEmail(invEmail),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {invErrors.email ? (
              <p
                id={`${baseId}-inv-email-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {invErrors.email}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-inv-name`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Nama Tampilan Guru <span aria-hidden="true">*</span>
            </label>
            <input
              ref={inviteNameRef}
              id={`${baseId}-inv-name`}
              name="display_name"
              type="text"
              required
              maxLength={80}
              value={invName}
              aria-invalid={invErrors.name ? "true" : "false"}
              aria-describedby={
                invErrors.name ? `${baseId}-inv-name-err` : undefined
              }
              onChange={(e) => {
                setInvName(e.target.value);
                if (invErrors.name) {
                  setInvErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              onBlur={() =>
                setInvErrors((prev) => ({
                  ...prev,
                  name: validateDisplayName(invName),
                }))
              }
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {invErrors.name ? (
              <p
                id={`${baseId}-inv-name-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {invErrors.name}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] bg-[#faf6ee] p-3">
            <legend className="px-1 text-xs font-bold text-[#1f2a24]">
              Tautan Sekolah Awal (Aktif)
            </legend>
            {activeSchools.length === 0 ? (
              <p className="text-xs text-[#5b6760]">
                Belum ada sekolah berstatus aktif. Tambahkan sekolah terlebih
                dahulu bila perlu.
              </p>
            ) : (
              <div className="space-y-2">
                {activeSchools.map((sc) => {
                  const chkId = `${baseId}-inv-sc-${sc.id}`;
                  const checked = invSchoolIds.includes(sc.id);
                  return (
                    <div key={sc.id} className="flex items-start gap-2">
                      <input
                        id={chkId}
                        type="checkbox"
                        name="school_ids"
                        value={sc.id}
                        checked={checked}
                        onChange={(e) =>
                          setInvSchoolIds((prev) =>
                            e.target.checked
                              ? [...prev, sc.id]
                              : prev.filter((id) => id !== sc.id)
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[#1f4d38]"
                      />
                      <label
                        htmlFor={chkId}
                        className="cursor-pointer text-xs font-semibold text-[#1f2a24]"
                      >
                        {sc.name} ({sc.district_label})
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          {invSubmitErr ? (
            <p
              role="alert"
              className="rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              Kesalahan: {invSubmitErr}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => inviteDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={inviting}
              className="btn-primary min-h-12 text-xs disabled:opacity-55"
            >
              {inviting ? "Mengirim Undangan..." : "Kirim Undangan Guru"}
            </button>
          </div>
        </form>
      </dialog>

      {/* Dialog Native 2: Kelola Profil & Tautan Sekolah Guru */}
      <dialog
        ref={manageDialogRef}
        aria-labelledby={`${baseId}-manage-title`}
        className="m-auto w-[min(94vw,38rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        {manageTarget ? (
          <div className="space-y-5">
            <div className="space-y-1">
              <h2
                id={`${baseId}-manage-title`}
                className="text-lg font-bold text-[#1f2a24]"
              >
                Kelola Profil &amp; Sekolah Guru
              </h2>
              <p className="text-xs text-[#5b6760]">
                {manageTarget.email ?? manageTarget.user_id}
              </p>
            </div>

            <form
              onSubmit={(e) => void handleSaveTeacherProfile(e)}
              noValidate
              className="space-y-3 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-mng-name`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Nama Tampilan Guru <span aria-hidden="true">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={manageNameRef}
                    id={`${baseId}-mng-name`}
                    name="display_name"
                    type="text"
                    autoFocus
                    required
                    maxLength={80}
                    value={manageName}
                    aria-invalid={manageNameErr ? "true" : "false"}
                    aria-describedby={
                      manageNameErr ? `${baseId}-mng-name-err` : undefined
                    }
                    onChange={(e) => {
                      setManageName(e.target.value);
                      if (manageNameErr) setManageNameErr(null);
                    }}
                    className="edmb-field-control min-w-[12rem] flex-1 rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                  />
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="btn-primary min-h-12 text-xs disabled:opacity-55"
                  >
                    {savingProfile ? "Menyimpan..." : "Simpan Nama"}
                  </button>
                </div>
                {manageNameErr ? (
                  <p
                    id={`${baseId}-mng-name-err`}
                    className="text-xs font-semibold text-[#b42318]"
                  >
                    Kesalahan: {manageNameErr}
                  </p>
                ) : null}
              </div>
            </form>

            <div className="space-y-2">
              <h3 className="text-xs font-bold text-[#1f2a24] uppercase">
                Tautan Sekolah Guru (Non-Destruktif)
              </h3>
              <ul className="list-none space-y-2 p-0">
                {schools.map((sc) => {
                  const link = manageTarget.schools.find(
                    (s) => s.school_id === sc.id
                  );
                  const isLinkedActive = link?.link_status === "active";
                  return (
                    <li
                      key={sc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d6cec1] bg-white px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-bold text-[#1f2a24]">{sc.name}</p>
                        <p className="text-[11px] text-[#5b6760]">
                          {sc.district_label} •{" "}
                          {sc.status === "archived"
                            ? "Sekolah Diarsipkan"
                            : isLinkedActive
                              ? "Tautan Aktif"
                              : "Tidak Tertaut / Nonaktif"}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={
                          togglingSchoolId === sc.id ||
                          (!isLinkedActive && sc.status === "archived")
                        }
                        onClick={() =>
                          void handleToggleSchoolLink(
                            manageTarget,
                            sc,
                            isLinkedActive ? "inactive" : "active"
                          )
                        }
                        className={
                          isLinkedActive
                            ? "btn-secondary min-h-10 text-xs"
                            : "btn-primary min-h-10 text-xs disabled:opacity-45"
                        }
                      >
                        {togglingSchoolId === sc.id
                          ? "..."
                          : isLinkedActive
                            ? "Nonaktifkan"
                            : "Aktifkan Tautan"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {manageErr ? (
              <p
                role="alert"
                className="rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {manageErr}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => manageDialogRef.current?.close()}
                className="btn-secondary min-h-12 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        ) : null}
      </dialog>

      {/* Dialog Native 3: Konfirmasi Suspensi / Aktivasi Guru */}
      <dialog
        ref={statusDialogRef}
        aria-labelledby={`${baseId}-status-title`}
        className="m-auto w-[min(94vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        {statusTarget ? (
          <form
            onSubmit={(e) => void handleStatusSubmit(e)}
            noValidate
            className="space-y-4"
          >
            <h2
              id={`${baseId}-status-title`}
              className="text-lg font-bold text-[#1f2a24]"
            >
              {nextStatus === "suspended"
                ? `Suspensi Akun ${statusTarget.display_name}?`
                : `Aktifkan Kembali Akun ${statusTarget.display_name}?`}
            </h2>
            <p className="text-sm text-[#3a4640]">
              {nextStatus === "suspended"
                ? "Akun guru ini akan langsung ditolak di seluruh Portal Guru (RLS + pemblokiran sesi Auth). Tindakan ini memerlukan verifikasi ulang MFA terbaru."
                : "Guru akan diizinkan masuk kembali ke Portal Guru sesuai tautan sekolah yang aktif."}
            </p>

            {nextStatus === "suspended" ? (
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-status-reason`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Alasan Suspensi (Wajib minimal 5 karakter){" "}
                  <span aria-hidden="true">*</span>
                </label>
                <textarea
                  ref={statusReasonRef}
                  id={`${baseId}-status-reason`}
                  name="reason"
                  rows={2}
                  required
                  value={statusReason}
                  aria-invalid={statusReasonErr ? "true" : "false"}
                  aria-describedby={
                    statusReasonErr ? `${baseId}-status-reason-err` : undefined
                  }
                  onChange={(e) => {
                    setStatusReason(e.target.value);
                    if (statusReasonErr) setStatusReasonErr(null);
                  }}
                  className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
                />
                {statusReasonErr ? (
                  <p
                    id={`${baseId}-status-reason-err`}
                    className="text-xs font-semibold text-[#b42318]"
                  >
                    Kesalahan: {statusReasonErr}
                  </p>
                ) : null}
              </div>
            ) : null}

            {statusSubmitErr ? (
              <div
                role="alert"
                className="space-y-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
              >
                <p>Kesalahan: {statusSubmitErr}</p>
                {statusNeedsReauth ? (
                  <Link
                    href="/admin/mfa/verifikasi?reauth=1"
                    className="inline-flex items-center gap-1 font-bold text-[#1f4d38] underline"
                  >
                    Verifikasi Ulang MFA Sekarang
                    <ExternalLink
                      size={13}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => statusDialogRef.current?.close()}
                className="btn-secondary min-h-12 text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={updatingStatus}
                className={
                  nextStatus === "suspended"
                    ? "inline-flex min-h-12 items-center justify-center rounded-full bg-[#b42318] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#912018] disabled:opacity-60"
                    : "btn-primary min-h-12 text-xs disabled:opacity-60"
                }
              >
                {updatingStatus
                  ? "Memproses..."
                  : nextStatus === "suspended"
                    ? "Konfirmasi Suspensi"
                    : "Aktifkan Guru"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </main>
  );
}
