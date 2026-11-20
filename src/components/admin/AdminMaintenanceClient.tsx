"use client";

import {
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  DatabaseBackup,
  ExternalLink,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  privacyRequestCreateSchema,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from "@/modules/admin/ops-schemas";
import type {
  AdminJobRunRow,
  AdminMaintenanceQueues,
  AdminPrivacyRequestRow,
  AdminSchoolOptionItem,
} from "@/modules/admin/ops-service";

export interface AdminMaintenanceClientProps {
  initialJobRuns: AdminJobRunRow[];
  initialQueues: AdminMaintenanceQueues;
  initialPrivacyRequests: AdminPrivacyRequestRow[];
  schools: AdminSchoolOptionItem[];
  dashboardBackupUrl: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

const REQUEST_TYPE_OPTIONS: ReadonlyArray<{
  value: PrivacyRequestType;
  label: string;
  description: string;
}> = [
  {
    value: "access",
    label: "Akses Data",
    description: "Permintaan salinan informasi atau verifikasi keberadaan data tugas.",
  },
  {
    value: "correction",
    label: "Koreksi",
    description: "Perbaikan atau klarifikasi penulisan administratif dari pihak sekolah.",
  },
  {
    value: "deletion",
    label: "Penghapusan Dini",
    description: "Penghapusan lebih awal sebelum batas retensi 90 hari.",
  },
];

const UPDATE_STATUS_OPTIONS: ReadonlyArray<{
  value: Exclude<PrivacyRequestStatus, "received">;
  label: string;
}> = [
  { value: "verified", label: "Terverifikasi (Verified)" },
  { value: "completed", label: "Selesai Ditindaklanjuti (Completed)" },
  { value: "rejected", label: "Ditolak / Tidak Memenuhi Syarat (Rejected)" },
];

function formatJakartaTime(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(dt)} WIB`;
}

function jobStatusBadge(status: AdminJobRunRow["status"]): {
  label: string;
  classes: string;
} {
  switch (status) {
    case "succeeded":
      return { label: "Berhasil", classes: "bg-[#dcfce7] text-[#166534]" };
    case "running":
      return { label: "Berjalan", classes: "bg-[#d8eef0] text-[#0e6f7a]" };
    case "failed":
      return { label: "Gagal", classes: "bg-[#fef3f2] text-[#b42318]" };
  }
}

function privacyStatusBadge(status: PrivacyRequestStatus): {
  label: string;
  classes: string;
} {
  switch (status) {
    case "received":
      return { label: "Diterima", classes: "bg-[#efeae2] text-[#1f2a24]" };
    case "verified":
      return { label: "Terverifikasi", classes: "bg-[#d8eef0] text-[#0e6f7a]" };
    case "completed":
      return { label: "Selesai", classes: "bg-[#dcfce7] text-[#166534]" };
    case "rejected":
      return { label: "Ditolak", classes: "bg-[#f6dfd2] text-[#8f3d1b]" };
  }
}

function requestTypeLabel(type: PrivacyRequestType): string {
  switch (type) {
    case "access":
      return "Akses Data";
    case "correction":
      return "Koreksi";
    case "deletion":
      return "Penghapusan Dini";
  }
}

export function AdminMaintenanceClient({
  initialJobRuns,
  initialQueues,
  initialPrivacyRequests,
  schools,
  dashboardBackupUrl,
  mode,
  migrationPending,
}: AdminMaintenanceClientProps) {
  const router = useRouter();
  const baseId = useId();
  const isSupabaseLive = mode === "supabase";

  const confirmPurgeDialogRef = useRef<HTMLDialogElement>(null);
  const updatePrivacyDialogRef = useRef<HTMLDialogElement>(null);
  const channelInputRef = useRef<HTMLInputElement>(null);
  const refCodeInputRef = useRef<HTMLInputElement>(null);
  const summaryTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [queues, setQueues] = useState<AdminMaintenanceQueues>(initialQueues);
  const [privacyRequests, setPrivacyRequests] = useState<
    AdminPrivacyRequestRow[]
  >(initialPrivacyRequests);

  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeReauthNeeded, setPurgeReauthNeeded] = useState(false);
  const [purgeResultMessage, setPurgeResultMessage] = useState<string | null>(
    null
  );

  // Form Permintaan Privasi Baru
  const [schoolId, setSchoolId] = useState<string>("");
  const [requestType, setRequestType] = useState<PrivacyRequestType>("deletion");
  const [requesterChannel, setRequesterChannel] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [summaryNote, setSummaryNote] = useState("");
  const [touched, setTouched] = useState<{
    requester_channel?: boolean;
    reference_code?: boolean;
    summary_note?: boolean;
  }>({});
  const [formErrors, setFormErrors] = useState<{
    requester_channel?: string;
    reference_code?: string;
    summary_note?: string;
  }>({});
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // Dialog Tindak Lanjut Permintaan Privasi
  const [selectedRequest, setSelectedRequest] =
    useState<AdminPrivacyRequestRow | null>(null);
  const [targetStatus, setTargetStatus] =
    useState<Exclude<PrivacyRequestStatus, "received">>("verified");
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateReauthNeeded, setUpdateReauthNeeded] = useState(false);

  const queueCards = [
    {
      label: "Percobaan Jatuh Tempo Retensi",
      count: queues.due_purge_attempts,
      hint: "purge_at <= saat ini",
      tone:
        queues.due_purge_attempts > 0
          ? "bg-[#fbefcf] text-[#8a5a00]"
          : "bg-[#f0f6f0] text-[#1f4d38]",
    },
    {
      label: "Sesi Tamu Kedaluwarsa",
      count: queues.expired_guest_sessions,
      hint: "token sesi siap dibersihkan",
      tone: "bg-[#efeae2] text-[#1f2a24]",
    },
    {
      label: "Job Ekspor Kedaluwarsa",
      count: queues.expired_export_jobs,
      hint: "arsip sementara habis masa",
      tone: "bg-[#efeae2] text-[#1f2a24]",
    },
    {
      label: "Media Dalam Karantina",
      count: queues.quarantine_media,
      hint: "kelola di Media & Karantina",
      tone:
        queues.quarantine_media > 0
          ? "bg-[#fbefcf] text-[#8a5a00]"
          : "bg-[#efeae2] text-[#1f2a24]",
    },
    {
      label: "Sesi Dukungan Aktif",
      count: queues.active_support_sessions,
      hint: "maks. 30 menit / sesi",
      tone: "bg-[#d8eef0] text-[#0e6f7a]",
    },
  ] as const;

  async function handleConfirmPurge() {
    if (!isSupabaseLive) return;
    setPurgeError(null);
    setPurgeReauthNeeded(false);
    setPurgeResultMessage(null);
    setPurging(true);

    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/maintenance/retention-purge", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf,
        },
      });
      const json = await res.json().catch(() => null);
      confirmPurgeDialogRef.current?.close();

      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal menjalankan pembersihan retensi.";
        setPurgeError(msg);
        setPurgeReauthNeeded(res.status === 403 && /verifikasi ulang/i.test(msg));
        setLiveAnnouncement(msg);
        return;
      }

      const sum = (json?.data?.summary ?? {}) as Record<string, number>;
      setQueues((prev) => ({
        ...prev,
        expired_guest_sessions: 0,
        expired_export_jobs: 0,
        expired_idempotency: 0,
        expired_rate_limits: 0,
        due_purge_attempts: 0,
      }));
      const msg = `Pembersihan retensi selesai: ${sum.purged_attempts ?? 0} percobaan kedaluwarsa, ${sum.purged_sessions ?? 0} sesi tamu, ${sum.purged_exports ?? 0} ekspor, ${sum.purged_idempotency ?? 0} idempotency, ${sum.purged_rate_limits ?? 0} rate-limit dihapus.`;
      setPurgeResultMessage(msg);
      setLiveAnnouncement(msg);
      router.refresh();
    } catch {
      confirmPurgeDialogRef.current?.close();
      const msg = "Koneksi terganggu saat menjalankan pembersihan retensi.";
      setPurgeError(msg);
      setLiveAnnouncement(msg);
    } finally {
      setPurging(false);
    }
  }

  function validatePrivacyField(
    field: "requester_channel" | "reference_code" | "summary_note",
    val: string
  ): string | undefined {
    const trimmed = val.trim();
    if (field === "requester_channel") {
      if (trimmed.length < 2) return "Kanal pemohon minimal 2 karakter.";
      if (trimmed.length > 120) return "Kanal pemohon maksimal 120 karakter.";
    }
    if (field === "reference_code") {
      if (trimmed.length < 2) return "Kode referensi minimal 2 karakter.";
      if (trimmed.length > 80) return "Kode referensi maksimal 80 karakter.";
    }
    if (field === "summary_note" && trimmed.length > 400) {
      return "Catatan ringkas maksimal 400 karakter.";
    }
    return undefined;
  }

  async function handleCreatePrivacyRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setCreateError(null);
    setCreateSuccess(null);

    const nextTouched = {
      requester_channel: true,
      reference_code: true,
      summary_note: true,
    };
    setTouched(nextTouched);

    const parsed = privacyRequestCreateSchema.safeParse({
      school_id: schoolId || null,
      request_type: requestType,
      requester_channel: requesterChannel,
      reference_code: referenceCode,
      summary_note: summaryNote,
    });

    if (!parsed.success) {
      const nextErrs: {
        requester_channel?: string;
        reference_code?: string;
        summary_note?: string;
      } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "requester_channel" ||
          key === "reference_code" ||
          key === "summary_note"
        ) {
          if (!nextErrs[key]) nextErrs[key] = issue.message;
        }
      }
      setFormErrors(nextErrs);
      const summary =
        nextErrs.requester_channel ??
        nextErrs.reference_code ??
        nextErrs.summary_note ??
        "Periksa kembali formulir pencatatan permintaan privasi.";
      setLiveAnnouncement(summary);
      if (nextErrs.requester_channel) channelInputRef.current?.focus();
      else if (nextErrs.reference_code) refCodeInputRef.current?.focus();
      else if (nextErrs.summary_note) summaryTextareaRef.current?.focus();
      return;
    }

    setCreatingRequest(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/privacy-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal mencatat permintaan privasi.";
        setCreateError(msg);
        setLiveAnnouncement(msg);
        return;
      }

      const created = json?.data as AdminPrivacyRequestRow | undefined;
      if (created) {
        setPrivacyRequests((prev) => [created, ...prev]);
      }
      setRequesterChannel("");
      setReferenceCode("");
      setSummaryNote("");
      setTouched({});
      setFormErrors({});
      const okMsg =
        "Permintaan privasi dicatat dengan kode referensi administratif dan diaudit tanpa nama siswa.";
      setCreateSuccess(okMsg);
      setLiveAnnouncement(okMsg);
      router.refresh();
    } catch {
      const msg = "Gagal terhubung ke server saat mencatat permintaan privasi.";
      setCreateError(msg);
      setLiveAnnouncement(msg);
    } finally {
      setCreatingRequest(false);
    }
  }

  function openUpdateDialog(reqRow: AdminPrivacyRequestRow) {
    setSelectedRequest(reqRow);
    setTargetStatus(reqRow.status === "verified" ? "completed" : "verified");
    setResolutionNote(reqRow.resolution_note || "");
    setUpdateError(null);
    setUpdateReauthNeeded(false);
    updatePrivacyDialogRef.current?.showModal();
  }

  async function handleConfirmUpdateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive || !selectedRequest) return;
    setUpdateError(null);
    setUpdateReauthNeeded(false);
    setUpdatingStatus(true);

    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/privacy-requests/${selectedRequest.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            status: targetStatus,
            resolution_note: resolutionNote.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal memperbarui status permintaan privasi.";
        setUpdateError(msg);
        setUpdateReauthNeeded(
          res.status === 403 && /verifikasi ulang/i.test(msg)
        );
        return;
      }

      const updated = json?.data as AdminPrivacyRequestRow | undefined;
      if (updated) {
        setPrivacyRequests((prev) =>
          prev.map((row) => (row.id === updated.id ? updated : row))
        );
      }
      updatePrivacyDialogRef.current?.close();
      setLiveAnnouncement("Status permintaan privasi berhasil diperbarui.");
      router.refresh();
    } catch {
      setUpdateError(
        "Koneksi terganggu saat memperbarui status permintaan privasi."
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  const jobsHeadingId = `${baseId}-jobs-heading`;
  const privacyListHeadingId = `${baseId}-privacy-list-heading`;
  const privacyFormHeadingId = `${baseId}-privacy-form-heading`;
  const purgeDialogHeadingId = `${baseId}-purge-dialog-title`;
  const updateDialogHeadingId = `${baseId}-update-dialog-title`;

  return (
    <main className="space-y-8 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <div className="visually-hidden" aria-live="polite">
        {liveAnnouncement}
      </div>

      <header className="space-y-1">
        <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
          Operasional, Retensi &amp; Kepatuhan Anak (Fase 8)
        </p>
        <h1>Pemeliharaan, Retensi &amp; Permintaan Privasi</h1>
        <p className="max-w-[68ch] text-sm text-[#3a4640]">
          Pantau eksekusi job terjadwal, jalankan pembersihan data kedaluwarsa,
          periksa daftar kesiapan cadangan platform, serta kelola permintaan
          privasi anak sesuai prinsip minimalisasi data (SEC-15).
        </p>
      </header>

      {!isSupabaseLive ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-[#e0a526] bg-[#fbefcf] px-4 py-3 text-sm text-[#1f2a24]">
          <Lock
            size={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-[#8a5a00]"
            aria-hidden="true"
          />
          <div>
            <p className="font-bold">Pratinjau Mode Demo Lokal (Baca-Saja)</p>
            <p className="text-xs text-[#3a4640]">
              Data antrean, riwayat job, dan contoh permintaan privasi di bawah
              adalah sampel non-PII. Eksekusi pembersihan dan pembaruan status
              aktif saat terhubung ke Supabase dengan MFA baru.
            </p>
          </div>
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Migrasi Database Fase 8 Belum Diterapkan</p>
            <p className="text-xs">
              Jalankan file migrasi{" "}
              <code>supabase/migrations/0019_admin_ops_rpcs.sql</code> agar
              pemantauan job, pembersihan retensi, dan tabel permintaan privasi
              aktif.
            </p>
          </div>
        </div>
      ) : null}

      {/* Bagian 1: Ringkasan Antrean & Aksi Pembersihan Retensi */}
      <section aria-labelledby={`${baseId}-queues-heading`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id={`${baseId}-queues-heading`}
            className="text-base font-bold text-[#1f2a24]"
          >
            Antrean Pembersihan &amp; Status Retensi
          </h2>

          <button
            type="button"
            disabled={!isSupabaseLive || purging || migrationPending}
            onClick={() => confirmPurgeDialogRef.current?.showModal()}
            className="btn-primary min-h-11 gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            {purging ? "Membersihkan..." : "Jalankan Pembersihan Retensi"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {queueCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/60 p-4"
            >
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${card.tone}`}
              >
                {card.hint}
              </span>
              <p className="mt-2 text-2xl font-extrabold text-[#1f2a24]">
                {card.count}
              </p>
              <p className="text-xs font-semibold text-[#3a4640]">
                {card.label}
              </p>
            </div>
          ))}
        </div>

        {purgeError ? (
          <div
            role="alert"
            className="space-y-2 rounded-2xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]"
          >
            <p className="font-semibold">{purgeError}</p>
            {purgeReauthNeeded ? (
              <Link
                href="/admin/mfa/verifikasi?reauth=1&next=/admin/pemeliharaan"
                prefetch={false}
                className="btn-secondary min-h-10 text-xs"
              >
                Verifikasi Ulang MFA Sekarang
              </Link>
            ) : null}
          </div>
        ) : null}

        {purgeResultMessage ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-2xl border border-[#2f6b4f] bg-[#f0f6f0] px-4 py-3 text-sm font-semibold text-[#1f4d38]"
          >
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{purgeResultMessage}</span>
          </div>
        ) : null}
      </section>

      {/* Bagian 2: Riwayat Job Sistem & Checklist Backup Manual */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section
          aria-labelledby={jobsHeadingId}
          className="space-y-3 lg:col-span-7"
        >
          <h2 id={jobsHeadingId} className="text-base font-bold text-[#1f2a24]">
            Riwayat Job Sistem ({initialJobRuns.length})
          </h2>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={jobsHeadingId}
            className="table-wrapper rounded-2xl border border-[#d6cec1]"
          >
            <table className="responsive-results-table text-sm">
              <thead>
                <tr className="border-b border-[#d6cec1] bg-[#faf6ee] text-left text-xs font-bold tracking-[0.04em] text-[#3a4640] uppercase">
                  <th className="px-4 py-3">Jenis Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Mulai (WIB)</th>
                  <th className="px-4 py-3">Selesai (WIB)</th>
                  <th className="px-4 py-3">Kode Galat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeae2]">
                {initialJobRuns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-[#5b6760]"
                    >
                      Belum ada catatan eksekusi job terjadwal di{" "}
                      <code>private.job_runs</code>.
                    </td>
                  </tr>
                ) : (
                  initialJobRuns.map((job) => {
                    const badge = jobStatusBadge(job.status);
                    return (
                      <tr key={job.id}>
                        <th
                          scope="row"
                          className="px-4 py-3 font-bold text-[#1f2a24]"
                        >
                          <code>{job.job_type}</code>
                        </th>
                        <td data-label="Status" className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td
                          data-label="Mulai (WIB)"
                          className="px-4 py-3 text-xs whitespace-nowrap text-[#3a4640]"
                        >
                          {formatJakartaTime(job.started_at)}
                        </td>
                        <td
                          data-label="Selesai (WIB)"
                          className="px-4 py-3 text-xs whitespace-nowrap text-[#3a4640]"
                        >
                          {formatJakartaTime(job.finished_at)}
                        </td>
                        <td
                          data-label="Kode Galat"
                          className="px-4 py-3 text-xs text-[#3a4640]"
                        >
                          {job.safe_error_code ? (
                            <code>{job.safe_error_code}</code>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Daftar Periksa Backup Manual */}
        <section
          aria-labelledby={`${baseId}-backup-heading`}
          className="space-y-3 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/60 p-5 lg:col-span-5"
        >
          <div className="flex items-center gap-2">
            <DatabaseBackup
              size={18}
              strokeWidth={1.75}
              className="text-[#1f4d38]"
              aria-hidden="true"
            />
            <h2
              id={`${baseId}-backup-heading`}
              className="text-base font-bold text-[#1f2a24]"
            >
              Kesiapan Cadangan (Backup Platform)
            </h2>
          </div>

          <p className="text-xs text-[#3a4640]">
            Status cadangan otomatis tidak dibaca langsung dari aplikasi.
            Pastikan administrator infrastruktur memverifikasi hal berikut di
            dashboard penyedia database:
          </p>

          <ul className="list-disc space-y-2 pl-5 text-xs text-[#1f2a24]">
            <li>
              <strong>Cadangan Harian / PITR:</strong> Jadwal snapshot harian
              aktif dan tersimpan di luar instans utama.
            </li>
            <li>
              <strong>Uji Pemulihan (Restore Drill):</strong> Uji coba restore ke
              proyek staging dilakukan minimal 1x per semester.
            </li>
            <li>
              <strong>Jadwal Cron Internal:</strong> Endpoint pembersihan retensi
              dan pembersihan media yatim berjalan dengan header otorisasi job
              terjadwal.
            </li>
          </ul>

          <div className="pt-2">
            <a
              href={dashboardBackupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary min-h-11 gap-1.5 text-xs"
            >
              Buka Pengaturan Backup Supabase
              <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>

      {/* Bagian 3: Alur Permintaan Privasi Anak (SEC-15) */}
      <section
        aria-labelledby={privacyFormHeadingId}
        className="space-y-6 border-t border-[#efeae2] pt-6"
      >
        <div className="space-y-1">
          <h2
            id={privacyFormHeadingId}
            className="text-lg font-bold text-[#1f2a24]"
          >
            Alur Permintaan Privasi Anak (SEC-15)
          </h2>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Catat dan tindak lanjuti permintaan akses, koreksi, atau penghapusan
            dini yang masuk melalui kanal pengelola resmi.
          </p>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl border border-[#b42318]/40 bg-[#fef3f2] px-4 py-3 text-xs text-[#1f2a24]">
          <ShieldAlert
            size={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-[#b42318]"
            aria-hidden="true"
          />
          <p>
            <strong className="text-[#b42318]">
              Larangan Menyalin Nama Siswa ke Log:
            </strong>{" "}
            Gunakan kode surat atau referensi tiket kelas/sekolah saja. Jangan
            menulis nama lengkap siswa atau jawaban kuis pada kolom catatan maupun
            referensi agar jejak audit tetap mematuhi prinsip privasi anak.
          </p>
        </div>

        {createError ? (
          <div
            role="alert"
            className="rounded-2xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"
          >
            {createError}
          </div>
        ) : null}

        {createSuccess ? (
          <div
            role="status"
            className="rounded-2xl border border-[#2f6b4f] bg-[#f0f6f0] px-4 py-3 text-sm font-semibold text-[#1f4d38]"
          >
            {createSuccess}
          </div>
        ) : null}

        <form
          noValidate
          aria-labelledby={privacyFormHeadingId}
          onSubmit={handleCreatePrivacyRequest}
          className="space-y-4 rounded-2xl border border-[#efeae2] bg-[#faf6ee]/50 p-5"
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-[#1f2a24]">
              Jenis Permintaan Privasi <span aria-hidden="true">*</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {REQUEST_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[#d6cec1] bg-white p-3 hover:border-[#2f6b4f]"
                >
                  <input
                    type="radio"
                    name="request_type"
                    value={opt.value}
                    checked={requestType === opt.value}
                    disabled={!isSupabaseLive || creatingRequest}
                    onChange={() => setRequestType(opt.value)}
                    className="mt-1 h-4 w-4 accent-[#2f6b4f]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[#1f2a24]">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-[#5b6760]">
                      {opt.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-school`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Sekolah Terkait (Opsional)
              </label>
              <select
                id={`${baseId}-school`}
                name="school_id"
                disabled={!isSupabaseLive || creatingRequest}
                value={schoolId}
                onChange={(e) => setSchoolId(e.target.value)}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              >
                <option value="">Lintas sekolah / umum</option>
                {schools.map((sch) => (
                  <option key={sch.id} value={sch.id}>
                    {sch.name} ({sch.district_label})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-channel`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Kanal / Pihak Pemohon <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${baseId}-channel`}
                name="requester_channel"
                type="text"
                ref={channelInputRef}
                required
                minLength={2}
                maxLength={120}
                disabled={!isSupabaseLive || creatingRequest}
                value={requesterChannel}
                onChange={(e) => {
                  const next = e.target.value;
                  setRequesterChannel(next);
                  if (formErrors.requester_channel) {
                    setFormErrors((prev) => ({
                      ...prev,
                      requester_channel: validatePrivacyField(
                        "requester_channel",
                        next
                      ),
                    }));
                  }
                }}
                onBlur={() => {
                  setTouched((prev) => ({ ...prev, requester_channel: true }));
                  setFormErrors((prev) => ({
                    ...prev,
                    requester_channel: validatePrivacyField(
                      "requester_channel",
                      requesterChannel
                    ),
                  }));
                }}
                aria-invalid={
                  touched.requester_channel && formErrors.requester_channel
                    ? "true"
                    : "false"
                }
                aria-describedby={
                  touched.requester_channel && formErrors.requester_channel
                    ? `${baseId}-channel-help ${baseId}-channel-err`
                    : `${baseId}-channel-help`
                }
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              />
              <p id={`${baseId}-channel-help`} className="text-[11px] text-[#5b6760]">
                Contoh: Surat resmi Wali Kelas / Orang Tua via Kepala Sekolah.
              </p>
              {touched.requester_channel && formErrors.requester_channel ? (
                <p
                  id={`${baseId}-channel-err`}
                  className="text-xs font-semibold text-[#b42318]"
                >
                  {formErrors.requester_channel}
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-refcode`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Kode Referensi Surat / Tiket <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${baseId}-refcode`}
                name="reference_code"
                type="text"
                ref={refCodeInputRef}
                required
                minLength={2}
                maxLength={80}
                spellCheck={false}
                autoCapitalize="none"
                disabled={!isSupabaseLive || creatingRequest}
                value={referenceCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setReferenceCode(next);
                  if (formErrors.reference_code) {
                    setFormErrors((prev) => ({
                      ...prev,
                      reference_code: validatePrivacyField(
                        "reference_code",
                        next
                      ),
                    }));
                  }
                }}
                onBlur={() => {
                  setTouched((prev) => ({ ...prev, reference_code: true }));
                  setFormErrors((prev) => ({
                    ...prev,
                    reference_code: validatePrivacyField(
                      "reference_code",
                      referenceCode
                    ),
                  }));
                }}
                aria-invalid={
                  touched.reference_code && formErrors.reference_code
                    ? "true"
                    : "false"
                }
                aria-describedby={
                  touched.reference_code && formErrors.reference_code
                    ? `${baseId}-refcode-help ${baseId}-refcode-err`
                    : `${baseId}-refcode-help`
                }
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              />
              <p id={`${baseId}-refcode-help`} className="text-[11px] text-[#5b6760]">
                Nomor arsip atau tiket tanpa nama anak (mis. SRT-PRIV-2026-005).
              </p>
              {touched.reference_code && formErrors.reference_code ? (
                <p
                  id={`${baseId}-refcode-err`}
                  className="text-xs font-semibold text-[#b42318]"
                >
                  {formErrors.reference_code}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`${baseId}-summary-note`}
              className="block text-xs font-bold text-[#1f2a24]"
            >
              Catatan Administratif Ringkas (Non-PII, Opsional)
            </label>
            <textarea
              id={`${baseId}-summary-note`}
              name="summary_note"
              ref={summaryTextareaRef}
              rows={2}
              maxLength={400}
              disabled={!isSupabaseLive || creatingRequest}
              value={summaryNote}
              onChange={(e) => setSummaryNote(e.target.value)}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, summary_note: true }));
                setFormErrors((prev) => ({
                  ...prev,
                  summary_note: validatePrivacyField(
                    "summary_note",
                    summaryNote
                  ),
                }));
              }}
              aria-invalid={
                touched.summary_note && formErrors.summary_note ? "true" : "false"
              }
              aria-describedby={
                touched.summary_note && formErrors.summary_note
                  ? `${baseId}-note-err`
                  : undefined
              }
              className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
            {touched.summary_note && formErrors.summary_note ? (
              <p
                id={`${baseId}-note-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                {formErrors.summary_note}
              </p>
            ) : null}
          </div>

          <div>
            <button
              type="submit"
              disabled={!isSupabaseLive || creatingRequest || migrationPending}
              className="btn-primary min-h-11 gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play size={15} strokeWidth={1.75} aria-hidden="true" />
              {creatingRequest
                ? "Mencatat..."
                : "Catat Permintaan Privasi Baru"}
            </button>
          </div>
        </form>

        {/* Tabel Daftar Permintaan Privasi */}
        <div className="space-y-3">
          <h3
            id={privacyListHeadingId}
            className="text-base font-bold text-[#1f2a24]"
          >
            Daftar Permintaan Privasi ({privacyRequests.length})
          </h3>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={privacyListHeadingId}
            className="table-wrapper rounded-2xl border border-[#d6cec1]"
          >
            <table className="responsive-results-table text-sm">
              <thead>
                <tr className="border-b border-[#d6cec1] bg-[#faf6ee] text-left text-xs font-bold tracking-[0.04em] text-[#3a4640] uppercase">
                  <th className="px-4 py-3">Referensi</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Kanal &amp; Sekolah</th>
                  <th className="px-4 py-3">Catatan</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efeae2]">
                {privacyRequests.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-sm text-[#5b6760]"
                    >
                      Belum ada permintaan privasi yang tercatat.
                    </td>
                  </tr>
                ) : (
                  privacyRequests.map((reqRow) => {
                    const badge = privacyStatusBadge(reqRow.status);
                    const isClosed =
                      reqRow.status === "completed" ||
                      reqRow.status === "rejected";
                    return (
                      <tr key={reqRow.id} className="align-top">
                        <th
                          scope="row"
                          className="px-4 py-3 font-bold text-[#1f2a24]"
                        >
                          <p>{reqRow.reference_code}</p>
                          <p className="text-[11px] font-normal text-[#5b6760]">
                            {formatJakartaTime(reqRow.created_at)}
                          </p>
                        </th>
                        <td data-label="Jenis" className="px-4 py-3 text-xs font-semibold text-[#1f2a24]">
                          {requestTypeLabel(reqRow.request_type)}
                        </td>
                        <td data-label="Status" className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td data-label="Kanal & Sekolah" className="px-4 py-3 text-xs text-[#3a4640]">
                          <p className="font-semibold text-[#1f2a24]">
                            {reqRow.requester_channel}
                          </p>
                          <p className="text-[#5b6760]">
                            {reqRow.school_name ?? "Lintas sekolah / umum"}
                          </p>
                        </td>
                        <td data-label="Catatan" className="px-4 py-3 text-xs text-[#3a4640]">
                          <p>{reqRow.summary_note || "—"}</p>
                          {reqRow.resolution_note ? (
                            <p className="mt-1 font-semibold text-[#1f4d38]">
                              Tindak lanjut: {reqRow.resolution_note}
                            </p>
                          ) : null}
                        </td>
                        <td data-label="Aksi" className="px-4 py-3">
                          {isClosed ? (
                            <span className="text-xs font-semibold text-[#5b6760]">
                              Selesai pada{" "}
                              {formatJakartaTime(reqRow.completed_at)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!isSupabaseLive}
                              onClick={() => openUpdateDialog(reqRow)}
                              className="btn-secondary min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Tindak Lanjuti
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Dialog Konfirmasi Destruktif: Jalankan Pembersihan Retensi */}
      <dialog
        ref={confirmPurgeDialogRef}
        aria-labelledby={purgeDialogHeadingId}
        onClose={(e) => {
          e.currentTarget.returnValue = "";
        }}
        className="m-auto w-[min(92vw,32rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 text-[#1f2a24] shadow-xl"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              size={22}
              className="mt-0.5 shrink-0 text-[#b42318]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h2
                id={purgeDialogHeadingId}
                className="text-lg font-extrabold text-[#1f2a24]"
              >
                Jalankan Pembersihan Retensi Sekarang?
              </h2>
              <p className="text-sm text-[#3a4640]">
                Tindakan ini memanggil <code>private.run_retention_purge()</code>{" "}
                untuk menghapus permanen sesi tamu kedaluwarsa, job ekspor habis
                masa, catatan idempotensi, penghitung batas laju lama, dan
                percobaan siswa yang sudah melewati <code>purge_at</code>.
              </p>
            </div>
          </div>

          <p className="rounded-xl bg-[#faf6ee] px-3.5 py-2.5 text-xs text-[#3a4640]">
            Aksi sensitif ini memerlukan sesi MFA terverifikasi dalam 10 menit
            terakhir dan langsung dicatat di log audit.
          </p>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              disabled={purging}
              onClick={() => confirmPurgeDialogRef.current?.close("cancel")}
              className="btn-secondary min-h-11 text-sm"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={purging}
              onClick={handleConfirmPurge}
              className="btn-primary min-h-11 text-sm"
            >
              {purging ? "Memproses..." : "Ya, Bersihkan Data Kedaluwarsa"}
            </button>
          </div>
        </div>
      </dialog>

      {/* Dialog Tindak Lanjut Permintaan Privasi */}
      <dialog
        ref={updatePrivacyDialogRef}
        aria-labelledby={updateDialogHeadingId}
        onClose={(e) => {
          e.currentTarget.returnValue = "";
        }}
        className="m-auto w-[min(92vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 text-[#1f2a24] shadow-xl"
      >
        <form onSubmit={handleConfirmUpdateStatus} className="space-y-4">
          <div className="space-y-1">
            <h2
              id={updateDialogHeadingId}
              className="text-lg font-extrabold text-[#1f2a24]"
            >
              Tindak Lanjuti Permintaan Privasi
            </h2>
            {selectedRequest ? (
              <p className="text-xs text-[#3a4640]">
                Referensi: <strong>{selectedRequest.reference_code}</strong> •{" "}
                {requestTypeLabel(selectedRequest.request_type)} •{" "}
                {selectedRequest.requester_channel}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-[#1f2a24]">
              Pilih Status Berikutnya
            </legend>
            <div className="space-y-1.5">
              {UPDATE_STATUS_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#d6cec1] px-3 py-2 text-sm hover:bg-[#faf6ee]"
                >
                  <input
                    type="radio"
                    name="privacy_next_status"
                    value={opt.value}
                    checked={targetStatus === opt.value}
                    onChange={() => setTargetStatus(opt.value)}
                    className="h-4 w-4 accent-[#2f6b4f]"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label
              htmlFor={`${baseId}-resolution-note`}
              className="block text-xs font-bold text-[#1f2a24]"
            >
              Catatan Tindak Lanjut (Non-PII)
            </label>
            <textarea
              id={`${baseId}-resolution-note`}
              name="resolution_note"
              rows={3}
              maxLength={400}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
          </div>

          {updateError ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[#b42318] bg-[#fef3f2] px-3.5 py-2.5 text-xs font-semibold text-[#b42318]"
            >
              <p>{updateError}</p>
              {updateReauthNeeded ? (
                <Link
                  href="/admin/mfa/verifikasi?reauth=1&next=/admin/pemeliharaan"
                  prefetch={false}
                  className="btn-secondary min-h-10 text-xs"
                >
                  Verifikasi Ulang MFA
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              disabled={updatingStatus}
              onClick={() => updatePrivacyDialogRef.current?.close("cancel")}
              className="btn-secondary min-h-11 text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={updatingStatus}
              className="btn-primary min-h-11 text-sm"
            >
              {updatingStatus ? "Menyimpan..." : "Simpan Status Permintaan"}
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
