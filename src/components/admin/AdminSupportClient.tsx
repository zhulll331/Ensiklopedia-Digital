"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  Lock,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  SUPPORT_DURATION_PRESETS,
  computeSupportRemainingSeconds,
  formatCountdownMmSs,
} from "@/modules/admin/support-schemas";
import type {
  AdminSupportAssignmentItem,
  AdminSupportReadResultsPayload,
  AdminSupportSessionRow,
} from "@/modules/admin/support-service";

export interface AdminSupportClientProps {
  assignments: AdminSupportAssignmentItem[];
  initialSessions: AdminSupportSessionRow[];
  serverNowUtc: string;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

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

export function AdminSupportClient({
  assignments,
  initialSessions,
  serverNowUtc,
  mode,
  migrationPending,
}: AdminSupportClientProps) {
  const router = useRouter();
  const baseId = useId();
  const isSupabaseLive = mode === "supabase";

  const confirmOpenDialogRef = useRef<HTMLDialogElement>(null);
  const confirmRevokeDialogRef = useRef<HTMLDialogElement>(null);
  const assignmentSelectRef = useRef<HTMLSelectElement>(null);
  const reasonTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [sessions, setSessions] =
    useState<AdminSupportSessionRow[]>(initialSessions);
  const activeSession = sessions.find((s) => s.is_active) ?? null;
  const activeSessionId = activeSession?.id ?? null;
  const activeExpiresAt = activeSession?.expires_at ?? null;
  const activeRevokedAt = activeSession?.revoked_at ?? null;

  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (!activeSession) return 0;
    const baseMs = Date.parse(serverNowUtc);
    return Number.isFinite(baseMs)
      ? computeSupportRemainingSeconds(
          activeSession.expires_at,
          activeSession.revoked_at,
          baseMs
        )
      : 0;
  });

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(
    assignments[0]?.id ?? ""
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(15);
  const [reason, setReason] = useState("");
  const [assignmentTouched, setAssignmentTouched] = useState(false);
  const [reasonTouched, setReasonTouched] = useState(false);
  const [assignmentErr, setAssignmentErr] = useState<string | null>(null);
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const [loadedResults, setLoadedResults] =
    useState<AdminSupportReadResultsPayload | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsErr, setResultsErr] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);

  // Sinkronkan offset jam server dan jalankan hitung mundur aman di klien
  useEffect(() => {
    const parsedServerMs = Date.parse(serverNowUtc);
    if (!Number.isFinite(parsedServerMs)) return;
    const timer = window.setTimeout(() => {
      setClockOffsetMs(parsedServerMs - Date.now());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [serverNowUtc]);

  useEffect(() => {
    if (!activeSessionId || !activeExpiresAt) {
      return;
    }

    const syncTick = () => {
      const rem = computeSupportRemainingSeconds(
        activeExpiresAt,
        activeRevokedAt,
        Date.now() + clockOffsetMs
      );
      setRemainingSeconds(rem);
      if (rem <= 0) {
        setLoadedResults(null);
        setSessions((prev) =>
          prev.map((row) =>
            row.id === activeSessionId ? { ...row, is_active: false } : row
          )
        );
      }
    };

    const initialTimer = window.setTimeout(syncTick, 0);
    const intervalId = window.setInterval(syncTick, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [activeSessionId, activeExpiresAt, activeRevokedAt, clockOffsetMs]);

  function validateAssignment(val: string): string | null {
    if (!val.trim()) {
      return "Pilih satu tugas sasaran yang membutuhkan dukungan.";
    }
    return null;
  }

  function validateReason(val: string): string | null {
    const trimmed = val.trim();
    if (trimmed.length < 5) {
      return "Alasan akses dukungan minimal 5 karakter wajib diisi.";
    }
    if (trimmed.length > 300) {
      return "Alasan akses dukungan maksimal 300 karakter.";
    }
    return null;
  }

  function handleRequestOpenDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setSubmitErr(null);
    setNeedsReauth(false);
    setPageMessage(null);
    setAssignmentTouched(true);
    setReasonTouched(true);

    const aErr = validateAssignment(selectedAssignmentId);
    const rErr = validateReason(reason);
    setAssignmentErr(aErr);
    setReasonErr(rErr);

    if (aErr) {
      setLiveAnnouncement(aErr);
      assignmentSelectRef.current?.focus();
      return;
    }
    if (rErr) {
      setLiveAnnouncement(rErr);
      reasonTextareaRef.current?.focus();
      return;
    }

    confirmOpenDialogRef.current?.showModal();
  }

  async function handleConfirmCreateSession() {
    if (!isSupabaseLive) return;
    setSubmitErr(null);
    setNeedsReauth(false);
    setCreating(true);

    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/support-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          assignment_id: selectedAssignmentId,
          reason: reason.trim(),
          duration_minutes: durationMinutes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal membuka sesi Mode Dukungan.";
        setSubmitErr(msg);
        setNeedsReauth(res.status === 403 && /verifikasi ulang/i.test(msg));
        confirmOpenDialogRef.current?.close();
        return;
      }

      const created = json?.data as
        | (AdminSupportSessionRow & { server_now_utc?: string })
        | undefined;
      if (created) {
        if (created.server_now_utc) {
          const parsed = Date.parse(created.server_now_utc);
          if (Number.isFinite(parsed)) {
            setClockOffsetMs(parsed - Date.now());
          }
        }
        setSessions((prev) => [created, ...prev]);
        setRemainingSeconds(
          computeSupportRemainingSeconds(
            created.expires_at,
            created.revoked_at,
            created.server_now_utc ? Date.parse(created.server_now_utc) : Date.now()
          )
        );
      }

      confirmOpenDialogRef.current?.close();
      setReason("");
      setReasonTouched(false);
      setReasonErr(null);
      setPageMessage(
        "Sesi Mode Dukungan aktif dibuka dan tercatat di log audit. Klik 'Muat Hasil Terbatas' untuk membaca kiriman tugas ini."
      );
      router.refresh();
    } catch {
      confirmOpenDialogRef.current?.close();
      setSubmitErr("Terjadi gangguan jaringan saat membuka Mode Dukungan.");
    } finally {
      setCreating(false);
    }
  }

  async function handleLoadLimitedResults(sessionId: string) {
    if (!isSupabaseLive) return;
    setResultsErr(null);
    setLoadingResults(true);
    try {
      const res = await fetch(
        `/api/v1/admin/support-access/${sessionId}/results`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setResultsErr(
          json?.error?.message ??
            "Gagal memuat hasil kiriman terbatas untuk sesi dukungan ini."
        );
        if (res.status === 401 || res.status === 409) {
          setLoadedResults(null);
          setSessions((prev) =>
            prev.map((row) =>
              row.id === sessionId ? { ...row, is_active: false } : row
            )
          );
        }
        return;
      }
      setLoadedResults(json?.data as AdminSupportReadResultsPayload);
    } catch {
      setResultsErr(
        "Terjadi gangguan jaringan saat membaca hasil terbatas Mode Dukungan."
      );
    } finally {
      setLoadingResults(false);
    }
  }

  async function handleConfirmRevokeSession() {
    if (!isSupabaseLive || !activeSession) return;
    setRevoking(true);
    setResultsErr(null);
    setSubmitErr(null);

    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/support-access/${activeSession.id}/revoke`,
        {
          method: "POST",
          headers: {
            "X-CSRF-Token": csrf,
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitErr(
          json?.error?.message ?? "Gagal mencabut sesi Mode Dukungan."
        );
        confirmRevokeDialogRef.current?.close();
        return;
      }

      const revokedAt =
        String(json?.data?.revoked_at ?? "") || new Date().toISOString();
      setSessions((prev) =>
        prev.map((row) =>
          row.id === activeSession.id
            ? { ...row, revoked_at: revokedAt, is_active: false }
            : row
        )
      );
      setRemainingSeconds(0);
      setLoadedResults(null);
      confirmRevokeDialogRef.current?.close();
      setPageMessage(
        "Sesi Mode Dukungan dicabut seketika dan tampilan data siswa telah ditutup."
      );
      router.refresh();
    } catch {
      confirmRevokeDialogRef.current?.close();
      setSubmitErr("Terjadi gangguan jaringan saat mencabut sesi dukungan.");
    } finally {
      setRevoking(false);
    }
  }

  const selectedAssignment = assignments.find(
    (a) => a.id === selectedAssignmentId
  );

  const assignmentCaptionId = `${baseId}-asg-caption`;
  const resultsCaptionId = `${baseId}-res-caption`;
  const historyCaptionId = `${baseId}-hist-caption`;
  const asgSelectId = `${baseId}-asg-select`;
  const asgErrId = `${baseId}-asg-err`;
  const reasonId = `${baseId}-reason`;
  const reasonHintId = `${baseId}-reason-hint`;
  const reasonErrId = `${baseId}-reason-err`;
  const openDialogTitleId = `${baseId}-open-dlg-title`;
  const revokeDialogTitleId = `${baseId}-revoke-dlg-title`;

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <div aria-live="polite" className="visually-hidden">
        {liveAnnouncement}
      </div>

      <header className="space-y-1">
        <p className="text-xs font-bold tracking-[0.06em] text-[#b42318] uppercase">
          Akses Data Anak Terkontrol • Fase 7 (SEC-25)
        </p>
        <h1>Mode Dukungan Data Siswa</h1>
        <p className="max-w-[70ch] text-sm text-[#3a4640]">
          Admin tidak memiliki akses umum ke nama dan nilai siswa. Mode
          Dukungan hanya dibuka sementara (maksimum 30 menit) untuk{" "}
          <strong>satu tugas tertentu</strong> dengan verifikasi ulang MFA,
          alasan wajib, dan pencatatan audit pada setiap pembacaan.
        </p>
      </header>

      {/* Banner Keamanan SEC-25 / SEC-15 */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/65 p-4 text-xs text-[#6b4400]">
        <Lock
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-bold text-[#1f2a24]">
            Perlindungan Data Anak &amp; Tanpa Ekspor Massal (SEC-15 / SEC-25)
          </p>
          <p>
            Daftar tugas di bawah hanya menampilkan metadata non-PII. Nama
            siswa hanya ditampilkan di dalam sesi dukungan aktif dan otomatis
            hilang saat waktu habis atau sesi dicabut. Jangan menyalin nama
            siswa ke kolom alasan ataupun log.
          </p>
        </div>
      </div>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Non-PII Baca-Saja):</strong> Menampilkan
          sampel daftar tugas dan riwayat dukungan kedaluwarsa tanpa memuat
          nama siswa. Pembukaan sesi dukungan aktif membutuhkan Supabase Auth
          + MFA serta konfigurasi kredensial server admin.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0018_admin_support_rpcs.sql</code> sudah dijalankan di Supabase
          SQL Editor.
        </div>
      ) : null}

      {/* Banner Merah Persisten Saat Sesi Dukungan Aktif */}
      {activeSession ? (
        <section
          role="status"
          aria-label="Status Mode Dukungan Aktif"
          className="space-y-4 rounded-2xl border-2 border-[#b42318] bg-[#fde8e6] p-5 text-[#7a1b14]"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert
                size={22}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-[#b42318]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-base font-extrabold text-[#b42318]">
                  Mode dukungan aktif — diaudit
                </p>
                <p className="text-sm font-semibold text-[#1f2a24]">
                  Tugas sasaran: {activeSession.assignment_title} (Kelas{" "}
                  {activeSession.class_label} • {activeSession.school_name})
                </p>
                <p className="text-xs text-[#3a4640]">
                  Guru pengampu: {activeSession.teacher_display_name} • Alasan:{" "}
                  {activeSession.reason}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#b42318]/40 bg-white px-4 py-2 text-right">
              <p className="text-[11px] font-bold tracking-wide text-[#b42318] uppercase">
                Sisa Waktu Akses
              </p>
              <p
                className="font-mono text-2xl font-extrabold text-[#b42318]"
                aria-live="off"
              >
                {formatCountdownMmSs(remainingSeconds)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!isSupabaseLive || loadingResults}
              onClick={() => void handleLoadLimitedResults(activeSession.id)}
              className="btn-primary min-h-12 text-xs disabled:opacity-60"
            >
              <Eye size={15} strokeWidth={1.75} aria-hidden="true" />
              {loadingResults
                ? "Memuat kiriman terbatas..."
                : loadedResults
                  ? "Segarkan Hasil Terbatas (Diaudit)"
                  : "Muat Hasil Terbatas (Diaudit)"}
            </button>

            <button
              type="button"
              disabled={!isSupabaseLive || revoking}
              onClick={() => confirmRevokeDialogRef.current?.showModal()}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b42318] bg-[#b42318] px-4 py-2 text-xs font-bold text-white hover:bg-[#8f1c13] disabled:opacity-60"
            >
              <ShieldOff size={15} strokeWidth={1.75} aria-hidden="true" />
              Cabut Akses Dukungan
            </button>
          </div>
        </section>
      ) : null}

      {pageMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-4 py-3 text-xs font-bold text-[#166534]"
        >
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{pageMessage}</span>
        </p>
      ) : null}

      {resultsErr ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/40 bg-[#fef3f2] px-4 py-3 text-xs font-semibold text-[#b42318]"
        >
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {resultsErr}</span>
        </p>
      ) : null}

      {/* Hasil Kiriman Terbatas (hanya tampil dalam Mode Dukungan Aktif) */}
      {activeSession && loadedResults ? (
        <section
          aria-label="Hasil Kiriman Terbatas Mode Dukungan"
          className="space-y-3 rounded-2xl border border-[#b42318]/35 bg-[#faf6ee] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#1f2a24]">
                Kiriman Siswa Terbatas — {loadedResults.assignment.title}
              </h2>
              <p className="text-xs text-[#3a4640]">
                {loadedResults.attempts.length} baris kiriman • Ekspor massal/CSV
                dinonaktifkan demi perlindungan data anak (SEC-25).
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-[#fde8e6] px-3 py-1 text-xs font-bold text-[#b42318]">
              <Clock3 size={13} strokeWidth={1.75} aria-hidden="true" />
              Kedaluwarsa: {formatJakartaTime(loadedResults.session.expires_at)}
            </span>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={resultsCaptionId}
            className="table-wrapper rounded-xl border border-[#d6cec1] bg-white p-2"
          >
            <table className="responsive-results-table text-left text-sm">
              <caption
                id={resultsCaptionId}
                className="px-2 pb-2 text-left text-xs font-semibold text-[#5b6760]"
              >
                Daftar kiriman tugas terbatas yang dibuka melalui Mode Dukungan
                berbatas waktu (tanpa penggabungan nama ganda).
              </caption>
              <thead>
                <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                  <th scope="col" className="px-2 py-3">
                    Nama Kiriman
                  </th>
                  <th scope="col" className="px-2 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-3">
                    Nilai &amp; Benar
                  </th>
                  <th scope="col" className="px-2 py-3">
                    Verifikasi
                  </th>
                  <th scope="col" className="px-2 py-3">
                    Waktu Kirim &amp; Purge
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadedResults.attempts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-6 text-center text-[#5b6760]"
                    >
                      Belum ada kiriman siswa pada tugas ini.
                    </td>
                  </tr>
                ) : (
                  loadedResults.attempts.map((att) => (
                    <tr
                      key={att.attempt_id}
                      className="border-b border-[#efeae2] align-top"
                    >
                      <th scope="row" className="px-2 py-3 font-normal">
                        <p className="font-bold text-[#1f2a24]">
                          {att.display_name}
                        </p>
                        {att.corrected_name ? (
                          <p className="text-[11px] text-[#5b6760]">
                            Isian awal: {att.student_name}
                          </p>
                        ) : null}
                        {att.duplicate_name ? (
                          <span className="mt-1 inline-block rounded-full bg-[#fbefcf] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">
                            Nama sama
                          </span>
                        ) : null}
                      </th>
                      <td data-label="Status" className="px-2 py-3 text-xs">
                        <span className="inline-block rounded-full bg-[#efeae2] px-2.5 py-0.5 font-bold text-[#1f2a24]">
                          {att.state}
                        </span>
                      </td>
                      <td
                        data-label="Nilai & Benar"
                        className="px-2 py-3 text-xs text-[#1f2a24]"
                      >
                        {att.score !== null ? (
                          <>
                            <span className="font-bold">{att.score}</span> (
                            {att.correct_count ?? 0}/{att.question_count ?? 0})
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        data-label="Verifikasi"
                        className="px-2 py-3 text-xs text-[#3a4640]"
                      >
                        {att.verification_status} ({att.annotations_count}{" "}
                        catatan)
                      </td>
                      <td
                        data-label="Waktu Kirim & Purge"
                        className="px-2 py-3 text-xs text-[#3a4640]"
                      >
                        <p>Kirim: {formatJakartaTime(att.submitted_at)}</p>
                        <p className="text-[11px] text-[#5b6760]">
                          Kode bukti: {att.receipt_code ?? "—"} • Hapus otomatis:{" "}
                          {formatJakartaTime(att.purge_at)}
                        </p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Form Buka Sesi Mode Dukungan (nonaktif bila sudah ada sesi aktif) */}
      <section
        aria-labelledby={`${baseId}-open-heading`}
        className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-5"
      >
        <div className="space-y-1">
          <h2
            id={`${baseId}-open-heading`}
            className="text-base font-bold text-[#1f2a24]"
          >
            Buka Sesi Dukungan Baru
          </h2>
          <p className="text-xs text-[#3a4640]">
            Wajib memilih 1 tugas, alasan yang jelas (≥ 5 karakter), durasi
            maksimum 30 menit, serta konfirmasi ulang MFA (≤ 10 menit terakhir).
          </p>
        </div>

        {submitErr ? (
          <div
            role="alert"
            className="space-y-2 rounded-xl border border-[#b42318]/40 bg-[#fef3f2] p-3 text-xs font-semibold text-[#b42318]"
          >
            <p>Kesalahan: {submitErr}</p>
            {needsReauth ? (
              <Link
                href="/admin/mfa/verifikasi?reauth=1"
                prefetch={false}
                className="inline-flex items-center gap-1 font-bold text-[#1f4d38] underline"
              >
                Verifikasi Ulang MFA Sekarang
                <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={handleRequestOpenDialog}
          noValidate
          aria-labelledby={`${baseId}-open-heading`}
          className="grid gap-4 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-6">
            <label
              htmlFor={asgSelectId}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Pilih Tugas Sasaran (1 Tugas) <span aria-hidden="true">*</span>
            </label>
            <select
              ref={assignmentSelectRef}
              id={asgSelectId}
              name="assignment_id"
              required
              disabled={!isSupabaseLive || Boolean(activeSession)}
              value={selectedAssignmentId}
              aria-invalid={assignmentErr ? "true" : "false"}
              aria-describedby={assignmentErr ? asgErrId : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedAssignmentId(next);
                setAssignmentTouched(true);
                if (assignmentErr && !validateAssignment(next)) {
                  setAssignmentErr(null);
                }
              }}
              onBlur={() => {
                if (!assignmentTouched && !selectedAssignmentId) return;
                setAssignmentTouched(true);
                setAssignmentErr(validateAssignment(selectedAssignmentId));
              }}
              className={`min-h-12 w-full rounded-xl border bg-white px-3 py-2 text-sm text-[#1f2a24] ${
                assignmentErr ? "border-[#b42318]" : "border-[#767676]"
              }`}
            >
              {assignments.length === 0 ? (
                <option value="">Belum ada tugas tersedia</option>
              ) : (
                assignments.map((asg) => (
                  <option key={asg.id} value={asg.id}>
                    {asg.title} — Kelas {asg.class_label} ({asg.school_name} •{" "}
                    {asg.submitted_count}/{asg.attempt_count} kiriman)
                  </option>
                ))
              )}
            </select>
            {assignmentErr ? (
              <p
                id={asgErrId}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {assignmentErr}
              </p>
            ) : null}
          </div>

          <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] bg-white p-3 lg:col-span-6">
            <legend className="px-1 text-xs font-bold text-[#1f2a24]">
              Batas Durasi Akses (Maks. 30 Menit)
            </legend>
            <div className="flex flex-wrap gap-4">
              {SUPPORT_DURATION_PRESETS.map((mins) => (
                <div key={mins} className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-dur-${mins}`}
                    type="radio"
                    name="duration_minutes"
                    disabled={!isSupabaseLive || Boolean(activeSession)}
                    checked={durationMinutes === mins}
                    onChange={() => setDurationMinutes(mins)}
                    className="h-4 w-4 accent-[#b42318]"
                  />
                  <label
                    htmlFor={`${baseId}-dur-${mins}`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    {mins} menit
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1 lg:col-span-12">
            <label
              htmlFor={reasonId}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Alasan Dukungan Teknis <span aria-hidden="true">*</span>
            </label>
            <span id={reasonHintId} className="text-[11px] text-[#5b6760]">
              Minimal 5 karakter (contoh: &ldquo;Menindaklanjuti laporan guru
              terkait error saat pengiriman kuis kelas III A&rdquo;). Jangan
              tulis nama siswa di alasan.
            </span>
            <textarea
              ref={reasonTextareaRef}
              id={reasonId}
              name="reason"
              rows={3}
              required
              minLength={5}
              maxLength={300}
              disabled={!isSupabaseLive || Boolean(activeSession)}
              value={reason}
              aria-invalid={reasonErr ? "true" : "false"}
              aria-describedby={
                reasonErr ? `${reasonHintId} ${reasonErrId}` : reasonHintId
              }
              onChange={(e) => {
                const next = e.target.value;
                setReason(next);
                setReasonTouched(true);
                if (reasonErr && !validateReason(next)) {
                  setReasonErr(null);
                }
              }}
              onBlur={() => {
                if (!reasonTouched && !reason.trim()) return;
                setReasonTouched(true);
                const err = validateReason(reason);
                setReasonErr(err);
                if (err) setLiveAnnouncement(err);
              }}
              className={`w-full rounded-xl border bg-white p-3 text-sm text-[#1f2a24] ${
                reasonErr ? "border-[#b42318]" : "border-[#767676]"
              }`}
            />
            {reasonErr ? (
              <p
                id={reasonErrId}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {reasonErr}
              </p>
            ) : null}
          </div>

          <div className="lg:col-span-12">
            <button
              type="submit"
              disabled={
                !isSupabaseLive ||
                Boolean(activeSession) ||
                creating ||
                assignments.length === 0
              }
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b42318] bg-[#b42318] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#8f1c13] disabled:opacity-55"
            >
              <ShieldAlert size={15} strokeWidth={1.75} aria-hidden="true" />
              {activeSession
                ? "Cabut sesi aktif terlebih dahulu"
                : "Buka Mode Dukungan"}
            </button>
          </div>
        </form>
      </section>

      {/* Tabel Tugas Non-PII */}
      <section aria-labelledby={`${baseId}-asg-heading`} className="space-y-3">
        <h2
          id={`${baseId}-asg-heading`}
          className="text-base font-bold text-[#1f2a24]"
        >
          Ringkasan Tugas Sekolah (Tanpa Data Siswa)
        </h2>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={assignmentCaptionId}
          className="table-wrapper"
        >
          <table className="responsive-results-table text-left text-sm">
            <caption
              id={assignmentCaptionId}
              className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
            >
              Daftar tugas yang tersedia untuk dukungan teknis (hanya hitungan
              agregat non-PII).
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">
                  Judul Tugas &amp; Kuis
                </th>
                <th scope="col" className="py-3 pr-4">
                  Kelas &amp; Sekolah
                </th>
                <th scope="col" className="py-3 pr-4">
                  Guru Pengampu
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="py-3">
                  Jumlah Kiriman
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#5b6760]">
                    Belum ada tugas kelas pada sistem.
                  </td>
                </tr>
              ) : (
                assignments.map((asg) => (
                  <tr
                    key={asg.id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <p className="font-bold text-[#1f2a24]">{asg.title}</p>
                      <p className="text-xs text-[#5b6760]">
                        {asg.quiz_title} • Kelas {asg.grade}
                      </p>
                    </th>
                    <td
                      data-label="Kelas & Sekolah"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      <p className="font-semibold text-[#1f2a24]">
                        {asg.class_label} ({asg.academic_year})
                      </p>
                      <p>{asg.school_name}</p>
                    </td>
                    <td
                      data-label="Guru Pengampu"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      {asg.teacher_display_name}
                    </td>
                    <td data-label="Status" className="py-3 pr-4 text-xs">
                      <span className="inline-block rounded-full bg-[#efeae2] px-2.5 py-0.5 font-bold text-[#1f2a24]">
                        {asg.state}
                      </span>
                    </td>
                    <td
                      data-label="Jumlah Kiriman"
                      className="py-3 text-xs font-bold text-[#1f2a24]"
                    >
                      {asg.submitted_count} terkirim / {asg.attempt_count} total
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabel Riwayat Sesi Dukungan */}
      <section aria-labelledby={`${baseId}-hist-heading`} className="space-y-3">
        <h2
          id={`${baseId}-hist-heading`}
          className="text-base font-bold text-[#1f2a24]"
        >
          Riwayat Akses Mode Dukungan Anda
        </h2>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={historyCaptionId}
          className="table-wrapper"
        >
          <table className="responsive-results-table text-left text-sm">
            <caption
              id={historyCaptionId}
              className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
            >
              Catatan pembukaan, pencabutan, dan masa kedaluwarsa sesi Mode
              Dukungan akun admin saat ini.
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">
                  Tugas Sasaran
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status Sesi
                </th>
                <th scope="col" className="py-3 pr-4">
                  Alasan
                </th>
                <th scope="col" className="py-3">
                  Dibuka &amp; Batas Waktu
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[#5b6760]">
                    Belum ada riwayat sesi Mode Dukungan.
                  </td>
                </tr>
              ) : (
                sessions.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <p className="font-bold text-[#1f2a24]">
                        {row.assignment_title}
                      </p>
                      <p className="text-xs text-[#5b6760]">
                        {row.class_label} • {row.school_name}
                      </p>
                    </th>
                    <td data-label="Status Sesi" className="py-3 pr-4 text-xs">
                      {row.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fde8e6] px-2.5 py-0.5 font-bold text-[#b42318]">
                          <ShieldAlert
                            size={12}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Aktif
                        </span>
                      ) : row.revoked_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 font-bold text-[#8a5a00]">
                          Dicabut
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-0.5 font-bold text-[#5b6760]">
                          Kedaluwarsa
                        </span>
                      )}
                    </td>
                    <td
                      data-label="Alasan"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      {row.reason}
                    </td>
                    <td
                      data-label="Dibuka & Batas Waktu"
                      className="py-3 text-xs text-[#3a4640]"
                    >
                      <p>Dibuka: {formatJakartaTime(row.created_at)}</p>
                      <p className="text-[11px] text-[#5b6760]">
                        Berakhir: {formatJakartaTime(row.expires_at)}
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dialog Native 1: Konfirmasi Buka Mode Dukungan (fokus aman di tombol Batal) */}
      <dialog
        ref={confirmOpenDialogRef}
        aria-labelledby={openDialogTitleId}
        className="m-auto w-[min(94vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <div className="space-y-4">
          <h2 id={openDialogTitleId} className="text-lg font-bold text-[#b42318]">
            Konfirmasi Aktifkan Mode Dukungan?
          </h2>
          <p className="text-sm text-[#3a4640]">
            Anda akan membuka akses baca terbatas data siswa untuk tugas{" "}
            <strong>{selectedAssignment?.title ?? "terpilih"}</strong> selama{" "}
            <strong>{durationMinutes} menit</strong>. Tindakan ini dicatat di{" "}
            <code>private.audit_logs</code>.
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              disabled={creating}
              onClick={() => confirmOpenDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleConfirmCreateSession()}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b42318] bg-[#b42318] px-4 py-2 text-xs font-bold text-white hover:bg-[#8f1c13] disabled:opacity-60"
            >
              {creating ? "Mengaktifkan..." : "Aktifkan & Catat Audit"}
            </button>
          </div>
        </div>
      </dialog>

      {/* Dialog Native 2: Konfirmasi Cabut Sesi Dukungan (fokus aman di tombol Batal) */}
      <dialog
        ref={confirmRevokeDialogRef}
        aria-labelledby={revokeDialogTitleId}
        className="m-auto w-[min(94vw,32rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <div className="space-y-4">
          <h2
            id={revokeDialogTitleId}
            className="text-lg font-bold text-[#b42318]"
          >
            Cabut Sesi Mode Dukungan Sekarang?
          </h2>
          <p className="text-sm text-[#3a4640]">
            Akses baca data kiriman siswa akan dihentikan seketika dan tampilan
            hasil di layar dibersihkan.
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              disabled={revoking}
              onClick={() => confirmRevokeDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={revoking}
              onClick={() => void handleConfirmRevokeSession()}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#b42318] bg-[#b42318] px-4 py-2 text-xs font-bold text-white hover:bg-[#8f1c13] disabled:opacity-60"
            >
              {revoking ? "Mencabut..." : "Ya, Cabut Sekarang"}
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
