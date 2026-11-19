"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
  Download,
  Eye,
  EyeOff,
  LogOut,
  PlusCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

export interface TeacherDashboardClientProps {
  authMode?: "supabase" | "local_demo";
}

function validateTeacherEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Masukkan alamat email akun guru.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Format email belum sesuai, contoh: guru@sekolah.sch.id.";
  }
  return "";
}

function validateTeacherPassword(value: string): string {
  if (!value) {
    return "Masukkan kata sandi akun guru.";
  }
  if (value.length < 8) {
    return "Kata sandi minimal 8 karakter.";
  }
  return "";
}

interface SchoolOption {
  id: string;
  name: string;
  district_label: string;
}

interface ClassRow {
  id: string;
  label: string;
  grade: 3 | 4;
  academic_year: string;
  school_name: string;
}

interface QuizOption {
  id: string;
  revision_id: string;
  title: string;
  grade: 3 | 4;
  question_count: number;
}

interface AssignmentRow {
  id: string;
  class_id: string;
  class_label: string;
  grade: 3 | 4;
  title: string;
  state: "draft" | "open" | "closed" | "revoked" | "archived";
  opens_at: string;
  closes_at: string;
  submitted_count: number;
}

interface SubmissionRow {
  attempt_id: string;
  student_name: string;
  corrected_name: string | null;
  display_name: string;
  duplicate_name: boolean;
  state: string;
  score: number | null;
  correct_count: number | null;
  question_count: number;
  submitted_at: string | null;
  receipt_code: string | null;
  verification_status: string;
  purge_at: string;
}

interface ActiveAccessCredentials {
  assignment_id: string;
  join_code: string;
  join_token: string;
  qr_data_url: string;
}

function formatJakartaTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function TeacherDashboardClient({
  authMode = "local_demo",
}: TeacherDashboardClientProps) {
  const tableCaptionId = useId();
  const revokeDialogTitleId = useId();
  const revokeDialogRef = useRef<HTMLDialogElement>(null);
  const loginHeadingId = useId();
  const emailInputId = useId();
  const emailErrorId = useId();
  const passwordInputId = useId();
  const passwordErrorId = useId();
  const passwordToggleWarningId = useId();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [authState, setAuthState] = useState<"loading" | "unauthenticated" | "authenticated">("loading");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loginSubmitError, setLoginSubmitError] = useState("");
  const [liveErrorAnnouncement, setLiveErrorAnnouncement] = useState("");
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [quizzes, setQuizzes] = useState<QuizOption[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>("");
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [autoPurgeAt, setAutoPurgeAt] = useState<string>("");
  const [nameQuery, setNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("baru saja");
  const [accessCreds, setAccessCreds] = useState<ActiveAccessCredentials | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");

  // Form buat kelas
  const [classLabel, setClassLabel] = useState("");
  const [classGrade, setClassGrade] = useState<3 | 4>(3);
  const [academicYear, setAcademicYear] = useState("2026/2027");

  // Form buat tugas
  const [newAsgClassId, setNewAsgClassId] = useState("");
  const [newAsgQuizRevId, setNewAsgQuizRevId] = useState("");
  const [newAsgTitle, setNewAsgTitle] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);

  // Dialog cabut tugas
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeTargetId, setRevokeTargetId] = useState("");

  const loadWorkspace = useCallback(async () => {
    try {
      const clsRes = await fetch("/api/v1/teacher/classes", { cache: "no-store" });
      if (clsRes.status === 401 || clsRes.status === 403) {
        if (clsRes.status === 403) {
          const errJson = await clsRes.json().catch(() => null);
          const msg =
            errJson?.error?.message ??
            "Akun ini belum terdaftar sebagai guru aktif.";
          setLoginSubmitError(msg);
          setFeedbackMsg(msg);
        }
        setAuthState("unauthenticated");
        return;
      }
      if (!clsRes.ok) return;

      const [clsJson, quizRes, asgRes] = await Promise.all([
        clsRes.json(),
        fetch("/api/v1/teacher/quizzes", { cache: "no-store" }),
        fetch("/api/v1/teacher/assignments", { cache: "no-store" }),
      ]);

      const clsList: ClassRow[] = clsJson.data.classes ?? [];
      const schList: SchoolOption[] = clsJson.data.schools ?? [];
      const quizJson = await quizRes.json().catch(() => null);
      const asgJson = await asgRes.json().catch(() => null);
      const quizList: QuizOption[] = quizRes.ok ? (quizJson?.data?.items ?? []) : [];
      const asgList: AssignmentRow[] = asgRes.ok ? (asgJson?.data?.items ?? []) : [];

      if (!quizRes.ok || !asgRes.ok) {
        const errMessage =
          (!quizRes.ok && quizJson?.error?.message) ||
          (!asgRes.ok && asgJson?.error?.message) ||
          "Sebagian data portal guru gagal dimuat. Coba muat ulang.";
        setFeedbackMsg(errMessage);
      }

      setClasses(clsList);
      setSchools(schList);
      setQuizzes(quizList);
      setAssignments(asgList);
      setNewAsgClassId((prev) => prev || clsList[0]?.id || "");
      setSelectedAssignmentId((prev) => prev || asgList[0]?.id || "");
      setAuthState("authenticated");
    } catch {
      setAuthState("unauthenticated");
    }
  }, []);

  const loadResults = useCallback(
    async (assignmentId: string, q: string, stateFilter: string) => {
      if (!assignmentId) return;
      try {
        const res = await fetch(
          `/api/v1/teacher/assignments/${assignmentId}/results/search`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: q || undefined, state: stateFilter }),
            cache: "no-store",
          }
        );
        if (!res.ok) return;
        const json = await res.json();
        setSubmissions(json.data.submissions ?? []);
        setAutoPurgeAt(json.data.assignment?.auto_purge_at ?? "");
        setLastUpdatedLabel(
          new Intl.DateTimeFormat("id-ID", {
            timeStyle: "medium",
            timeZone: "Asia/Jakarta",
          }).format(new Date())
        );
      } catch {
        // Biarkan polling berikutnya mencoba lagi
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    async function initWorkspace() {
      await Promise.resolve();
      if (active) {
        await loadWorkspace();
      }
    }
    void initWorkspace();
    return () => {
      active = false;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (authState !== "authenticated" || !selectedAssignmentId) return;
    let active = true;
    async function syncResults() {
      await Promise.resolve();
      if (active) {
        await loadResults(selectedAssignmentId, nameQuery, statusFilter);
      }
    }
    void syncResults();

    // Polling ~15 detik saat tab aktif (03_ARSITEKTUR §6)
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadResults(selectedAssignmentId, nameQuery, statusFilter);
      }
    }, 15_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [authState, selectedAssignmentId, nameQuery, statusFilter, loadResults]);

  async function handleSupabaseLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    setLoginSubmitError("");
    setFeedbackMsg("");

    const nextEmailError = validateTeacherEmail(loginEmail);
    const nextPasswordError = validateTeacherPassword(loginPassword);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError) {
      emailInputRef.current?.focus();
      return;
    }
    if (nextPasswordError) {
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmittingLogin(true);
    try {
      const res = await fetch("/api/v1/auth/teacher-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
      });
      if (res.ok) {
        setLoginPassword("");
        setPasswordTouched(false);
        await loadWorkspace();
      } else {
        const json = await res.json().catch(() => null);
        setLoginSubmitError(
          json?.error?.message ?? "Email atau kata sandi tidak sesuai."
        );
      }
    } catch {
      setLoginSubmitError("Gagal menghubungi layanan autentikasi. Coba lagi.");
    } finally {
      setIsSubmittingLogin(false);
    }
  }

  async function handleDemoLogin(teacherId: "teacher-demo-1" | "teacher-demo-2") {
    const res = await fetch("/api/v1/auth/demo-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", teacher_id: teacherId }),
    });
    if (res.ok) {
      await loadWorkspace();
    } else {
      const json = await res.json().catch(() => null);
      setFeedbackMsg(json?.error?.message ?? "Gagal masuk sesi guru.");
    }
  }

  async function handleLogout() {
    if (authMode === "supabase") {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } else {
      await fetch("/api/v1/auth/demo-teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    }
    setAuthState("unauthenticated");
    setSubmissions([]);
    setAssignments([]);
    setClasses([]);
    setAccessCreds(null);
    setFeedbackMsg("");
    setLoginSubmitError("");
    setEmailError("");
    setPasswordError("");
  }

  async function handleCreateClass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const schoolId = schools[0]?.id;
    if (!schoolId || !classLabel.trim()) return;

    const res = await fetch("/api/v1/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: schoolId,
        label: classLabel.trim(),
        grade: classGrade,
        academic_year: academicYear,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg(json?.error?.message ?? "Gagal membuat kelas.");
      return;
    }
    setClassLabel("");
    setFeedbackMsg(`Kelas ${json.data.label} berhasil ditambahkan.`);
    await loadWorkspace();
  }

  async function handleCreateAssignment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newAsgClassId || !newAsgQuizRevId || !newAsgTitle.trim()) {
      setFeedbackMsg("Lengkapi kelas, kuis, dan judul tugas.");
      return;
    }

    const now = Date.now();
    const res = await fetch("/api/v1/teacher/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_id: newAsgClassId,
        quiz_revision_id: newAsgQuizRevId,
        title: newAsgTitle.trim(),
        opens_at: new Date(now - 60_000).toISOString(),
        closes_at: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
        session_minutes: 120,
        consent_confirmed: consentChecked,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg(json?.error?.message ?? "Gagal membuat tugas.");
      return;
    }
    setNewAsgTitle("");
    setSelectedAssignmentId(json.data.id);
    setFeedbackMsg("Tugas dibuat sebagai draf. Klik Buka / Rotasi Kode untuk membagikan ke siswa.");
    await loadWorkspace();
  }

  async function handleOpenOrRotate(assignmentId: string, action: "open" | "rotate-access") {
    const res = await fetch(`/api/v1/teacher/assignments/${assignmentId}/${action}`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg(json?.error?.message ?? "Gagal membuka/merotasi akses tugas.");
      return;
    }

    const joinUrl = `${window.location.origin}/tugas#t=${json.data.join_token}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 180, margin: 1 });
    setAccessCreds({
      assignment_id: assignmentId,
      join_code: json.data.join_code,
      join_token: json.data.join_token,
      qr_data_url: qrDataUrl,
    });
    setFeedbackMsg(`Kode akses baru aktif: ${json.data.join_code}`);
    await loadWorkspace();
  }

  async function handleCloseAssignment(assignmentId: string) {
    const res = await fetch(`/api/v1/teacher/assignments/${assignmentId}/close`, {
      method: "POST",
    });
    if (res.ok) {
      setFeedbackMsg("Tugas ditutup. Siswa tidak dapat memulai sesi baru.");
      await loadWorkspace();
    }
  }

  async function handleConfirmRevoke(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch(`/api/v1/teacher/assignments/${revokeTargetId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: revokeReason }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg(json?.error?.message ?? "Gagal mencabut tugas.");
      return;
    }
    revokeDialogRef.current?.close();
    setRevokeReason("");
    setFeedbackMsg("Tugas berhasil dicabut dan sesi aktif dibatalkan.");
    await loadWorkspace();
    await loadResults(selectedAssignmentId, nameQuery, statusFilter);
  }

  async function handleAnnotate(
    attemptId: string,
    kind: "verified" | "invalidated"
  ) {
    const res = await fetch(`/api/v1/teacher/attempts/${attemptId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        reason:
          kind === "verified"
            ? "Diverifikasi sesuai daftar hadir kelas"
            : "Ditandai tidak sah oleh guru pendamping",
      }),
    });
    if (res.ok) {
      await loadResults(selectedAssignmentId, nameQuery, statusFilter);
    }
  }

  async function handleExportCsv() {
    if (!selectedAssignmentId) return;
    const res = await fetch(
      `/api/v1/teacher/assignments/${selectedAssignmentId}/exports`,
      { method: "POST" }
    );
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg(json?.error?.message ?? "Gagal membuat ekspor CSV.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = `/api/v1/teacher/exports/${json.data.export_id}/download`;
    anchor.download = `rekap-tugas-${selectedAssignmentId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setFeedbackMsg(
      "Berkas CSV privat diunduh. Simpan di perangkat aman dan hapus jika tidak lagi diperlukan."
    );
  }

  if (authState === "loading") {
    return <p className="text-sm font-semibold text-[#3a4640]">Memuat portal guru...</p>;
  }

  if (authState === "unauthenticated") {
    if (authMode === "supabase") {
      return (
        <section className="space-y-5 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
          <div className="space-y-2">
            <h2 id={loginHeadingId} className="text-lg font-bold text-[#1f2a24]">
              Masuk sebagai Guru
            </h2>
            <p className="max-w-[65ch] text-sm text-[#3a4640]">
              Untuk melindungi privasi nama dan nilai siswa, masuk menggunakan akun
              guru terdaftar untuk mengelola kelas dan rekap tugas milik Anda.
            </p>
          </div>

          <div aria-live="polite" className="sr-only">
            {liveErrorAnnouncement}
          </div>

          {loginSubmitError ? (
            <p
              role="alert"
              className="max-w-md rounded-xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"
            >
              {loginSubmitError}
            </p>
          ) : null}

          <form
            method="POST"
            action="/api/v1/auth/teacher-login"
            aria-labelledby={loginHeadingId}
            onSubmit={handleSupabaseLogin}
            noValidate
            className="max-w-md space-y-5"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={emailInputId} className="text-sm font-bold text-[#1f2a24]">
                Email Guru <span aria-hidden="true">*</span>
              </label>
              <input
                ref={emailInputRef}
                id={emailInputId}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="next"
                required
                value={loginEmail}
                onChange={(e) => {
                  const next = e.target.value;
                  setLoginEmail(next);
                  setEmailTouched(true);
                  setLoginSubmitError("");
                  if (emailError && !validateTeacherEmail(next)) {
                    setEmailError("");
                    setLiveErrorAnnouncement("");
                  }
                }}
                onBlur={() => {
                  if (!emailTouched && !loginEmail.trim()) return;
                  setEmailTouched(true);
                  const err = validateTeacherEmail(loginEmail);
                  setEmailError(err);
                  if (err) {
                    setLiveErrorAnnouncement(err);
                  }
                }}
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? emailErrorId : undefined}
                className={`min-h-12 w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-[#1f2a24] ${
                  emailError ? "border-[#b42318]" : "border-[#b8b0a2]"
                }`}
              />
              {emailError ? (
                <p id={emailErrorId} className="text-sm font-semibold text-[#b42318]">
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={passwordInputId} className="text-sm font-bold text-[#1f2a24]">
                Kata Sandi <span aria-hidden="true">*</span>
              </label>
              <div className="relative flex items-center">
                <input
                  ref={passwordInputRef}
                  id={passwordInputId}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  minLength={8}
                  enterKeyHint="done"
                  required
                  value={loginPassword}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLoginPassword(next);
                    setPasswordTouched(true);
                    setLoginSubmitError("");
                    if (passwordError && !validateTeacherPassword(next)) {
                      setPasswordError("");
                      setLiveErrorAnnouncement("");
                    }
                  }}
                  onBlur={() => {
                    if (!passwordTouched && !loginPassword) return;
                    setPasswordTouched(true);
                    const err = validateTeacherPassword(loginPassword);
                    setPasswordError(err);
                    if (err) {
                      setLiveErrorAnnouncement(err);
                    }
                  }}
                  aria-invalid={passwordError ? "true" : "false"}
                  aria-describedby={passwordError ? passwordErrorId : undefined}
                  className={`min-h-12 w-full rounded-xl border bg-white py-2.5 pe-14 ps-3.5 text-base text-[#1f2a24] ${
                    passwordError ? "border-[#b42318]" : "border-[#b8b0a2]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-describedby={passwordToggleWarningId}
                  className="absolute end-0.5 inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[#3a4640] hover:bg-[#efe9de]"
                >
                  {showPassword ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
                <span id={passwordToggleWarningId} className="sr-only">
                  Peringatan: menampilkan teks akan memperlihatkan kata sandi di layar.
                </span>
              </div>
              {passwordError ? (
                <p id={passwordErrorId} className="text-sm font-semibold text-[#b42318]">
                  {passwordError}
                </p>
              ) : null}
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmittingLogin}
                className="btn-primary min-h-12 disabled:opacity-60"
              >
                {isSubmittingLogin ? "Memproses masuk..." : "Masuk ke Portal Guru"}
              </button>
            </div>
          </form>
        </section>
      );
    }

    return (
      <section className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
        <h2 className="text-lg font-bold text-[#1f2a24]">Masuk sebagai Guru</h2>
        <p className="max-w-[65ch] text-sm text-[#3a4640]">
          Untuk melindungi privasi nama dan nilai siswa, hanya guru terautentikasi
          yang dapat mengakses kelas dan rekap nilainya sendiri.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleDemoLogin("teacher-demo-1")}
            className="btn-primary"
          >
            Masuk Lokal: Ibu Sari (Guru Contoh)
          </button>
          <button
            type="button"
            onClick={() => handleDemoLogin("teacher-demo-2")}
            className="btn-secondary"
          >
            Masuk Lokal: Bapak Budi (Uji Isolasi Lintas Guru)
          </button>
        </div>
        {feedbackMsg ? (
          <p className="text-sm font-semibold text-[#b42318]">{feedbackMsg}</p>
        ) : null}
      </section>
    );
  }

  const selectedClassObj = classes.find((c) => c.id === newAsgClassId);
  const filteredQuizzes = selectedClassObj
    ? quizzes.filter((q) => q.grade === selectedClassObj.grade)
    : quizzes;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f0f6f0] px-4 py-3">
        <p className="text-sm font-semibold text-[#1f4d38]">
          Sesi guru aktif • Seluruh rekap bersifat privat per pemilik kelas
        </p>
        <button type="button" onClick={handleLogout} className="btn-secondary min-h-10 text-xs">
          <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          Keluar Guru
        </button>
      </div>

      {feedbackMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[#2f6b4f] bg-[#dcfce7] px-4 py-3 text-sm font-semibold text-[#166534]"
        >
          {feedbackMsg}
        </p>
      ) : null}

      {/* Bagian Kelas & Buat Tugas */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-[20px] border border-[#d6cec1] bg-[#faf6ee] p-5">
          <h2 className="text-lg font-bold text-[#1f2a24]">1. Kelas Saya</h2>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {classes.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-[#d6cec1] bg-white px-3.5 py-2 text-sm font-bold text-[#1f2a24]"
              >
                {c.label} (Kelas {c.grade}) • {c.academic_year}
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreateClass} className="flex flex-wrap items-end gap-2 pt-2">
            <div className="min-w-28 flex-1 space-y-1">
              <label htmlFor="cls-label" className="block text-xs font-bold">
                Label Kelas
              </label>
              <input
                id="cls-label"
                type="text"
                value={classLabel}
                onChange={(e) => setClassLabel(e.target.value)}
                placeholder="Mis. IV B"
                required
                className="min-h-11 w-full rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cls-grade" className="block text-xs font-bold">
                Kelas
              </label>
              <select
                id="cls-grade"
                value={classGrade}
                onChange={(e) => setClassGrade(Number(e.target.value) === 4 ? 4 : 3)}
                className="min-h-11 rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
              >
                <option value={3}>Kelas III</option>
                <option value={4}>Kelas IV</option>
              </select>
            </div>
            <div className="w-28 space-y-1">
              <label htmlFor="cls-year" className="block text-xs font-bold">
                Tahun Ajaran
              </label>
              <input
                id="cls-year"
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="min-h-11 w-full rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
              />
            </div>
            <button type="submit" className="btn-secondary min-h-11 text-sm">
              <PlusCircle size={16} strokeWidth={1.75} aria-hidden="true" />
              Buat Kelas
            </button>
          </form>
        </section>

        <section className="space-y-4 rounded-[20px] border border-[#d6cec1] bg-[#faf6ee] p-5">
          <h2 className="text-lg font-bold text-[#1f2a24]">2. Buat Tugas Kuis</h2>
          <form onSubmit={handleCreateAssignment} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="asg-class" className="block text-xs font-bold">
                  Pilih Kelas
                </label>
                <select
                  id="asg-class"
                  value={newAsgClassId}
                  onChange={(e) => {
                    setNewAsgClassId(e.target.value);
                    setNewAsgQuizRevId("");
                  }}
                  className="min-h-11 w-full rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} (Kelas {c.grade})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="asg-quiz" className="block text-xs font-bold">
                  Kuis Tervalidasi (Sesuai Kelas)
                </label>
                <select
                  id="asg-quiz"
                  value={newAsgQuizRevId}
                  onChange={(e) => setNewAsgQuizRevId(e.target.value)}
                  required
                  className="min-h-11 w-full rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
                >
                  <option value="">-- Pilih kuis --</option>
                  {filteredQuizzes.map((q) => (
                    <option key={q.revision_id} value={q.revision_id}>
                      {q.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="asg-title" className="block text-xs font-bold">
                Judul Tugas
              </label>
              <input
                id="asg-title"
                type="text"
                value={newAsgTitle}
                onChange={(e) => setNewAsgTitle(e.target.value)}
                placeholder="Mis. Kuis Harian Bab 2"
                required
                className="min-h-11 w-full rounded-[10px] border border-[#8b8378] bg-white px-3 text-sm"
              />
            </div>

            <label className="flex items-start gap-2.5 text-xs text-[#1f2a24]">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Kesiapan administrasi persetujuan orang tua/wali kelas sudah
                tersedia di sekolah (SEC-12).
              </span>
            </label>

            <button type="submit" className="btn-primary min-h-11 text-sm">
              Simpan Draf Tugas
            </button>
          </form>
        </section>
      </div>

      {/* Daftar Tugas & Akses QR Lokal */}
      <section className="space-y-4 rounded-[20px] border border-[#d6cec1] bg-white p-5">
        <h2 className="text-lg font-bold text-[#1f2a24]">3. Daftar Tugas &amp; Kode Akses</h2>

        {assignments.length === 0 ? (
          <p className="text-sm text-[#5b6760]">Belum ada tugas di akun guru ini.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {assignments.map((asg) => {
              const isSelected = selectedAssignmentId === asg.id;
              return (
                <article
                  key={asg.id}
                  className={
                    isSelected
                      ? "space-y-3 rounded-2xl border-2 border-[#2f6b4f] bg-[#f0f6f0] p-4"
                      : "space-y-3 rounded-2xl border border-[#d6cec1] bg-white p-4"
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[#1f4d38]">
                      {asg.class_label} • Status: {asg.state}
                    </span>
                    <span className="text-xs font-bold text-[#5b6760]">
                      {asg.submitted_count} kiriman
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#1f2a24]">{asg.title}</h3>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentId(asg.id)}
                      className="btn-secondary min-h-10 px-3 py-1.5 text-xs"
                    >
                      Lihat Rekap
                    </button>

                    {asg.state === "draft" ? (
                      <button
                        type="button"
                        onClick={() => void handleOpenOrRotate(asg.id, "open")}
                        className="btn-primary min-h-10 px-3 py-1.5 text-xs"
                      >
                        Buka Tugas &amp; Buat QR
                      </button>
                    ) : null}

                    {asg.state === "open" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleOpenOrRotate(asg.id, "rotate-access")}
                          className="btn-secondary min-h-10 px-3 py-1.5 text-xs"
                        >
                          Rotasi Kode/QR
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCloseAssignment(asg.id)}
                          className="btn-secondary min-h-10 px-3 py-1.5 text-xs"
                        >
                          Tutup
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRevokeTargetId(asg.id);
                            revokeDialogRef.current?.showModal();
                          }}
                          className="inline-flex min-h-10 items-center rounded-full bg-[#b42318] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Cabut
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {accessCreds ? (
          <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-[#2f6b4f] bg-[#faf6ee] p-4 sm:flex-row sm:items-center">
            <Image
              src={accessCreds.qr_data_url}
              alt={`Kode QR lokal untuk kode tugas ${accessCreds.join_code}`}
              width={180}
              height={180}
              unoptimized
              className="rounded-xl border border-[#d6cec1] bg-white p-2"
            />
            <div className="space-y-1 text-sm">
              <p className="text-xs font-bold text-[#1f4d38] uppercase">
                Akses Baru Dibuat (QR Lokal)
              </p>
              <p className="text-xl font-extrabold tracking-widest text-[#1f2a24]">
                {accessCreds.join_code}
              </p>
              <p className="text-xs text-[#3a4640]">
                Simpan kode/QR ini sekarang; database hanya menyimpan digest dan
                tidak menampilkan ulang token mentah di sesi lain.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {/* Rekap Nilai Privat */}
      {selectedAssignmentId ? (
        <section className="space-y-4 rounded-[20px] border border-[#d6cec1] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#1f2a24]">
                4. Rekap Kiriman Siswa (Data Privat)
              </h2>
              <p className="text-xs text-[#5b6760]">
                Diperbarui otomatis pukul {lastUpdatedLabel} WIB •{" "}
                {autoPurgeAt
                  ? `Data hasil dihapus otomatis pada ${formatJakartaTime(autoPurgeAt)}`
                  : null}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadResults(selectedAssignmentId, nameQuery, statusFilter)}
                className="btn-secondary min-h-10 text-xs"
              >
                <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
                Segarkan
              </button>
              <button
                type="button"
                onClick={() => void handleExportCsv()}
                className="btn-primary min-h-10 text-xs"
              >
                <Download size={15} strokeWidth={1.75} aria-hidden="true" />
                Ekspor CSV Privat
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="cari-nama-kiriman" className="visually-hidden">
                Cari nama kiriman
              </label>
              <input
                id="cari-nama-kiriman"
                type="search"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Cari nama kiriman (pencarian privat via POST)..."
                className="min-h-11 w-full rounded-[10px] border border-[#8b8378] px-3.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="filter-status-kiriman" className="visually-hidden">
                Filter status kiriman
              </label>
              <select
                id="filter-status-kiriman"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-h-11 rounded-[10px] border border-[#8b8378] bg-white px-3.5 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="submitted">Terkirim</option>
                <option value="in_progress">Sedang Mengerjakan</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </div>
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-labelledby={tableCaptionId}
            className="table-wrapper"
          >
            <table className="responsive-results-table text-sm">
              <caption
                id={tableCaptionId}
                className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
              >
                Setiap baris mewakili satu kiriman pengerjaan. Nama ganda tidak
                digabung otomatis.
              </caption>
              <thead>
                <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                  <th scope="col" className="py-3 pr-4">Nama Kiriman</th>
                  <th scope="col" className="py-3 pr-4">Status</th>
                  <th scope="col" className="py-3 pr-4">Nilai</th>
                  <th scope="col" className="py-3 pr-4">Benar</th>
                  <th scope="col" className="py-3 pr-4">Waktu Kirim</th>
                  <th scope="col" className="py-3">Verifikasi</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[#5b6760]">
                      Belum ada kiriman untuk tugas ini.
                    </td>
                  </tr>
                ) : (
                  submissions.map((row) => (
                    <tr key={row.attempt_id} className="border-b border-[#efeae2]">
                      <th scope="row" className="py-3 pr-4 font-bold text-[#1f2a24]">
                        <span>{row.display_name}</span>
                        {row.duplicate_name ? (
                          <span className="ml-2 inline-block rounded-full bg-[#fbefcf] px-2 py-0.5 text-[11px] font-bold text-[#8a5a00]">
                            Nama sama
                          </span>
                        ) : null}
                      </th>
                      <td data-label="Status" className="py-3 pr-4 text-[#3a4640]">
                        {row.state}
                      </td>
                      <td data-label="Nilai" className="py-3 pr-4 font-bold text-[#1f4d38]">
                        {row.score ?? "—"}
                      </td>
                      <td data-label="Benar" className="py-3 pr-4 text-[#3a4640]">
                        {row.correct_count !== null
                          ? `${row.correct_count}/${row.question_count}`
                          : "—"}
                      </td>
                      <td data-label="Waktu Kirim" className="py-3 pr-4 text-xs text-[#3a4640]">
                        {formatJakartaTime(row.submitted_at)}
                      </td>
                      <td data-label="Verifikasi" className="py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#efeae2] px-2 py-0.5 text-xs font-bold">
                            {row.verification_status}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleAnnotate(row.attempt_id, "verified")}
                            className="rounded-lg border border-[#2f6b4f] px-2 py-1 text-xs font-bold text-[#1f4d38]"
                          >
                            Sah
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleAnnotate(row.attempt_id, "invalidated")}
                            className="rounded-lg border border-[#b42318] px-2 py-1 text-xs font-bold text-[#b42318]"
                          >
                            Tidak Sah
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Dialog konfirmasi cabut tugas sesuai desain (5).md & dialog guide */}
      <dialog
        ref={revokeDialogRef}
        aria-labelledby={revokeDialogTitleId}
        className="m-auto w-[min(92vw,30rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 text-[#1f2a24] shadow-xl"
      >
        <div className="flex items-start gap-3">
          <ShieldAlert size={22} strokeWidth={1.75} className="shrink-0 text-[#b42318]" aria-hidden="true" />
          <div className="space-y-1">
            <h2 id={revokeDialogTitleId} className="text-lg font-bold">
              Cabut Tugas Ini?
            </h2>
            <p className="text-sm text-[#3a4640]">
              Seluruh sesi aktif siswa akan dibatalkan dan kode tidak lagi dapat
              digunakan.
            </p>
          </div>
        </div>

        <form onSubmit={handleConfirmRevoke} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="revoke-reason" className="block text-xs font-bold">
              Alasan pencabutan (wajib, min 5 karakter)
            </label>
            <input
              id="revoke-reason"
              type="text"
              required
              minLength={5}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Mis. Kode tersebar di luar kelas"
              className="min-h-11 w-full rounded-[10px] border border-[#8b8378] px-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              autoFocus
              onClick={() => revokeDialogRef.current?.close()}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center rounded-full bg-[#b42318] px-5 font-bold text-white"
            >
              Ya, Cabut Tugas
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
