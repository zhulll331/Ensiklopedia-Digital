"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";

export interface TeacherActivateClientProps {
  authMode: "supabase" | "local_demo";
  initialTeacher: {
    email: string;
    displayName: string;
  } | null;
  initialErrorCode: "expired" | "network" | "forbidden" | null;
}

function getInitialErrorMessage(
  code: TeacherActivateClientProps["initialErrorCode"]
): string {
  switch (code) {
    case "expired":
      return "Tautan undangan sudah kedaluwarsa atau pernah digunakan sebelumnya. Minta admin sekolah mengirim ulang undangan guru.";
    case "network":
      return "Koneksi ke layanan autentikasi sedang terganggu saat memverifikasi undangan. Muat ulang halaman ini sebentar lagi.";
    case "forbidden":
      return "Akun pada sesi ini tidak dapat diaktifkan sebagai guru aktif (bukan akun guru atau sedang disuspensi).";
    default:
      return "";
  }
}

function validateNewPassword(value: string): string {
  if (!value) {
    return "Masukkan kata sandi baru untuk akun guru Anda.";
  }
  if (value.length < 8) {
    return "Kata sandi minimal 8 karakter.";
  }
  if (value.length > 128) {
    return "Kata sandi maksimal 128 karakter.";
  }
  return "";
}

function validateConfirmPassword(password: string, confirm: string): string {
  if (!confirm) {
    return "Ulangi kata sandi baru Anda untuk memastikan tidak salah ketik.";
  }
  if (confirm !== password) {
    return "Konfirmasi kata sandi tidak sama dengan kata sandi baru.";
  }
  return "";
}

export function TeacherActivateClient({
  authMode,
  initialTeacher,
  initialErrorCode,
}: TeacherActivateClientProps) {
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"checking" | "set_password" | "error">(
    initialTeacher
      ? "set_password"
      : initialErrorCode
        ? "error"
        : "checking"
  );
  const [teacherEmail, setTeacherEmail] = useState(
    initialTeacher?.email ?? ""
  );
  const [teacherName, setTeacherName] = useState(
    initialTeacher?.displayName ?? ""
  );
  const [fatalError, setFatalError] = useState(
    getInitialErrorMessage(initialErrorCode)
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authMode !== "supabase" || initialTeacher || initialErrorCode) {
      return;
    }

    let active = true;

    async function acceptImplicitInviteFromHash() {
      await Promise.resolve();
      if (!active || typeof window === "undefined") return;

      const rawHash = window.location.hash;
      const hashParams = new URLSearchParams(rawHash.replace(/^#/, ""));

      // Segera bersihkan fragment token dari address bar dan history browser
      if (rawHash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      }

      const hashError = hashParams.get("error") || hashParams.get("error_code");
      if (hashError) {
        setFatalError(
          "Tautan undangan tidak valid atau sudah kedaluwarsa. Minta admin sekolah mengirim ulang undangan guru."
        );
        setStep("error");
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setFatalError(
          "Tautan undangan tidak ditemukan atau sesi aktivasi sudah berakhir. Buka langsung tautan undangan terbaru dari email Anda."
        );
        setStep("error");
        return;
      }

      try {
        const csrf = await fetchAdminCsrfToken();
        const res = await fetch("/api/v1/auth/accept-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!active) return;

        if (!res.ok) {
          setFatalError(
            json?.error?.message ??
              "Gagal memverifikasi undangan guru. Silakan minta undangan baru dari admin."
          );
          setStep("error");
          return;
        }

        setTeacherEmail(String(json?.data?.email ?? ""));
        setTeacherName(String(json?.data?.display_name ?? "Guru EDMB"));
        setStep("set_password");
      } catch {
        if (!active) return;
        setFatalError(
          "Gagal terhubung ke server saat memverifikasi undangan guru."
        );
        setStep("error");
      }
    }

    void acceptImplicitInviteFromHash();

    return () => {
      active = false;
    };
  }, [authMode, initialTeacher, initialErrorCode]);

  if (authMode === "local_demo") {
    return (
      <section className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
        <h2 className="text-lg font-bold text-[#1f2a24]">
          Mode Demo Lokal Aktif
        </h2>
        <p className="max-w-[65ch] text-sm text-[#3a4640]">
          Aktivasi undangan email hanya berjalan ketika proyek terhubung ke
          Supabase Auth. Gunakan tombol masuk demo di Portal Guru untuk uji lokal.
        </p>
        <Link href="/guru" prefetch={false} className="btn-primary min-h-12 text-sm">
          Buka Portal Guru
        </Link>
      </section>
    );
  }

  if (step === "checking") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="space-y-2 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6"
      >
        <p className="text-base font-bold text-[#1f2a24]">
          Memverifikasi tautan undangan guru...
        </p>
        <p className="text-sm text-[#3a4640]">
          Mohon tunggu sebentar sementara akun Anda diaktifkan secara aman.
        </p>
      </section>
    );
  }

  if (step === "error") {
    return (
      <section
        role="alert"
        className="space-y-4 rounded-2xl border border-[#b42318]/40 bg-[#fef3f2] p-6"
      >
        <div className="flex items-start gap-2.5 text-[#b42318]">
          <AlertCircle size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-bold">Aktivasi Undangan Belum Berhasil</h2>
            <p className="text-sm leading-relaxed text-[#7a1b14]">
              {fatalError}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/guru" prefetch={false} className="btn-primary min-h-12 text-xs">
            Ke Halaman Masuk Guru
          </Link>
          <Link href="/" className="btn-secondary min-h-12 text-xs">
            Beranda Publik
          </Link>
        </div>
      </section>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordTouched(true);
    setConfirmTouched(true);
    setSubmitError("");

    const pwdErr = validateNewPassword(password);
    const cfmErr = validateConfirmPassword(password, confirmPassword);
    setPasswordError(pwdErr);
    setConfirmError(cfmErr);

    if (pwdErr) {
      setLiveAnnouncement(pwdErr);
      passwordInputRef.current?.focus();
      return;
    }
    if (cfmErr) {
      setLiveAnnouncement(cfmErr);
      confirmInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    let navigating = false;
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/auth/set-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ??
          "Gagal menyimpan kata sandi. Periksa kembali isian Anda.";
        setSubmitError(msg);
        setLiveAnnouncement(msg);
        return;
      }

      setPassword("");
      setConfirmPassword("");
      navigating = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload dokumen penuh agar sesi guru baru terbaca bersih di /guru
      window.location.assign("/guru");
      return;
    } catch {
      setSubmitError("Terjadi gangguan jaringan saat menyimpan kata sandi.");
    } finally {
      if (!navigating) {
        setSubmitting(false);
      }
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
      <div className="flex items-start gap-3 rounded-xl border border-[#2f6b4f]/30 bg-[#f0f6f0] p-4 text-sm text-[#1f4d38]">
        <CheckCircle2
          size={19}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5">
          <p className="font-bold">
            Akun Guru Aktif{teacherName ? `: ${teacherName}` : ""}
          </p>
          <p className="text-xs text-[#3a4640]">
            Atur kata sandi sekarang agar Anda dapat masuk ke Portal Guru
            kapan saja menggunakan email dan kata sandi tersebut.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <h2
          id="teacher-activate-heading"
          className="flex items-center gap-2 text-lg font-bold text-[#1f2a24]"
        >
          <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
          Atur Kata Sandi Awal Guru
        </h2>
        <p className="max-w-[65ch] text-sm text-[#3a4640]">
          Kata sandi disimpan terenkripsi oleh Supabase Auth. Minimal 8 karakter.
        </p>
      </div>

      <div aria-live="polite" className="visually-hidden">
        {liveAnnouncement}
      </div>

      {submitError ? (
        <p
          role="alert"
          className="max-w-md rounded-xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"
        >
          {submitError}
        </p>
      ) : null}

      <form
        method="POST"
        action="/api/v1/auth/set-password"
        aria-labelledby="teacher-activate-heading"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        className="max-w-md space-y-5"
      >
        {teacherEmail ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="teacher-activate-email"
              className="text-sm font-bold text-[#1f2a24]"
            >
              Email Akun Guru
            </label>
            <input
              id="teacher-activate-email"
              name="email"
              type="email"
              autoComplete="username"
              spellCheck={false}
              readOnly
              value={teacherEmail}
              className="min-h-12 w-full rounded-xl border border-[#d6cec1] bg-[#efeae2] px-3.5 py-2.5 text-base font-medium text-[#3a4640]"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="teacher-activate-password"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Kata Sandi Baru <span aria-hidden="true">*</span>
          </label>
          <span
            id="teacher-activate-pwd-hint"
            className="text-xs text-[#5b6760]"
          >
            Minimal 8 karakter kombinasi huruf dan angka. Boleh menempel dari
            pengelola sandi.
          </span>
          <div className="relative flex items-center">
            <input
              ref={passwordInputRef}
              id="teacher-activate-password"
              name="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              enterKeyHint="next"
              required
              value={password}
              onChange={(e) => {
                const next = e.target.value;
                setPassword(next);
                setPasswordTouched(true);
                setSubmitError("");
                if (passwordError && !validateNewPassword(next)) {
                  setPasswordError("");
                  setLiveAnnouncement("");
                }
                if (confirmError && confirmPassword === next) {
                  setConfirmError("");
                }
              }}
              onBlur={() => {
                if (!passwordTouched && !password) return;
                setPasswordTouched(true);
                const err = validateNewPassword(password);
                setPasswordError(err);
                if (err) setLiveAnnouncement(err);
              }}
              aria-invalid={passwordError ? "true" : "false"}
              aria-describedby={
                passwordError
                  ? "teacher-activate-pwd-hint teacher-activate-pwd-err"
                  : "teacher-activate-pwd-hint"
              }
              className={`min-h-12 w-full rounded-xl border bg-white py-2.5 pe-14 ps-3.5 text-base text-[#1f2a24] ${
                passwordError ? "border-[#b42318]" : "border-[#767676]"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              aria-describedby="teacher-activate-pwd-warning"
              className="absolute end-0.5 inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[#3a4640] hover:bg-[#efe9de]"
            >
              {showPassword ? (
                <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <span id="teacher-activate-pwd-warning" className="visually-hidden">
              Peringatan: menampilkan teks akan memperlihatkan kata sandi di
              layar.
            </span>
          </div>
          {passwordError ? (
            <p
              id="teacher-activate-pwd-err"
              className="text-sm font-semibold text-[#b42318]"
            >
              {passwordError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="teacher-activate-confirm-password"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Ulangi Kata Sandi Baru <span aria-hidden="true">*</span>
          </label>
          <input
            ref={confirmInputRef}
            id="teacher-activate-confirm-password"
            name="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            enterKeyHint="done"
            required
            value={confirmPassword}
            onChange={(e) => {
              const next = e.target.value;
              setConfirmPassword(next);
              setConfirmTouched(true);
              setSubmitError("");
              if (confirmError && !validateConfirmPassword(password, next)) {
                setConfirmError("");
                setLiveAnnouncement("");
              }
            }}
            onBlur={() => {
              if (!confirmTouched && !confirmPassword) return;
              setConfirmTouched(true);
              const err = validateConfirmPassword(password, confirmPassword);
              setConfirmError(err);
              if (err) setLiveAnnouncement(err);
            }}
            aria-invalid={confirmError ? "true" : "false"}
            aria-describedby={
              confirmError ? "teacher-activate-cfm-err" : undefined
            }
            className={`min-h-12 w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-[#1f2a24] ${
              confirmError ? "border-[#b42318]" : "border-[#767676]"
            }`}
          />
          {confirmError ? (
            <p
              id="teacher-activate-cfm-err"
              className="text-sm font-semibold text-[#b42318]"
            >
              {confirmError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary min-h-12 disabled:opacity-60"
          >
            {submitting
              ? "Menyimpan kata sandi..."
              : "Simpan Kata Sandi & Masuk Portal Guru"}
          </button>
          <Link
            href="/guru"
            prefetch={false}
            className="btn-secondary min-h-12 text-xs"
          >
            Lewati dulu, buka Portal Guru
          </Link>
        </div>
      </form>
    </section>
  );
}
