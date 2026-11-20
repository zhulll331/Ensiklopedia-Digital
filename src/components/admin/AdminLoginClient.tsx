"use client";

import { useId, useRef, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { fetchAdminCsrfToken } from "./csrf-client";

export interface AdminLoginClientProps {
  authMode: "supabase" | "local_demo";
  localDemoAllowed: boolean;
}

function validateAdminEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Masukkan alamat email akun admin.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Format email belum sesuai, contoh: kurator@edmb.sch.id.";
  }
  return "";
}

function validateAdminPassword(value: string): string {
  if (!value) {
    return "Masukkan kata sandi akun admin.";
  }
  if (value.length < 8) {
    return "Kata sandi minimal terdiri dari 8 karakter.";
  }
  return "";
}

export function AdminLoginClient({
  authMode,
  localDemoAllowed,
}: AdminLoginClientProps) {
  const headingId = useId();
  const emailHintId = useId();
  const emailErrorId = useId();
  const passwordHintId = useId();
  const passwordErrorId = useId();
  const passwordWarningId = useId();

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function handleSupabaseSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    setSubmitError("");

    const nextEmailErr = validateAdminEmail(email);
    const nextPasswordErr = validateAdminPassword(password);
    setEmailError(nextEmailErr);
    setPasswordError(nextPasswordErr);

    if (nextEmailErr) {
      emailRef.current?.focus();
      return;
    }
    if (nextPasswordErr) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    let navigating = false;
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(
          json?.error?.message ?? "Email atau kata sandi admin tidak sesuai."
        );
        return;
      }

      setPassword("");
      const step = json?.data?.next_step;
      const dest =
        step === "mfa_enroll"
          ? "/admin/mfa/daftar"
          : step === "mfa_verify"
            ? "/admin/mfa/verifikasi"
            : "/admin";
      navigating = true;
      // Reload dokumen penuh di batas cookie autentikasi agar Server Components membaca sesi terbaru tanpa badai RSC
      window.location.assign(dest);
      return;
    } catch {
      setSubmitError("Gagal menghubungi layanan autentikasi admin.");
    } finally {
      if (!navigating) {
        setSubmitting(false);
      }
    }
  }

  async function handleDemoLogin() {
    setSubmitError("");
    setDemoLoading(true);
    let navigating = false;
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/auth/demo-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ action: "login" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(
          json?.error?.message ?? "Gagal masuk mode demo admin lokal."
        );
        return;
      }
      navigating = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload dokumen penuh di batas cookie autentikasi agar Server Components membaca sesi terbaru
      window.location.assign("/admin");
      return;
    } catch {
      setSubmitError("Gagal menyiapkan sesi pratinjau lokal.");
    } finally {
      if (!navigating) {
        setDemoLoading(false);
      }
    }
  }

  if (authMode === "local_demo") {
    return (
      <section className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
        <div className="space-y-2">
          <h2 id={headingId} className="text-lg font-bold text-[#1f2a24]">
            Masuk Mode Demo Admin Lokal
          </h2>
          <p className="max-w-[65ch] text-sm text-[#3a4640]">
            Environment Supabase belum dikonfigurasi. Mode lokal hanya menampilkan
            pratinjau daftar revisi sampel tanpa akses mutasi database produksi.
          </p>
        </div>

        {submitError ? (
          <p
            role="alert"
            className="rounded-xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"
          >
            {submitError}
          </p>
        ) : null}

        {localDemoAllowed ? (
          <button
            type="button"
            disabled={demoLoading}
            onClick={() => void handleDemoLogin()}
            className="btn-primary min-h-12 disabled:opacity-60"
          >
            <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
            {demoLoading
              ? "Memproses..."
              : "Masuk Demo Admin Lokal (Baca Sampel)"}
          </button>
        ) : (
          <p className="rounded-xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]">
            Autentikasi admin Supabase wajib dikonfigurasi di produksi.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
      <div className="space-y-2">
        <h2 id={headingId} className="text-lg font-bold text-[#1f2a24]">
          Masuk ke Portal Admin
        </h2>
        <p className="max-w-[65ch] text-sm text-[#3a4640]">
          Area ini khusus admin kurator terverifikasi dan mewajibkan verifikasi dua
          langkah (MFA) sebelum mengakses draf atau menerbitkan konten.
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
        action="/api/v1/admin/auth/login"
        aria-labelledby={headingId}
        onSubmit={handleSupabaseSubmit}
        noValidate
        className="max-w-md space-y-5"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="admin-email"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Email Admin <span aria-hidden="true">*</span>
          </label>
          <span id={emailHintId} className="text-xs text-[#5b6760]">
            Format: nama@domain-instansi.sch.id
          </span>
          <input
            ref={emailRef}
            id="admin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="next"
            required
            value={email}
            onChange={(e) => {
              const next = e.target.value;
              setEmail(next);
              setEmailTouched(true);
              setSubmitError("");
              if (emailError && !validateAdminEmail(next)) {
                setEmailError("");
                setLiveAnnouncement("");
              }
            }}
            onBlur={() => {
              if (!emailTouched && !email.trim()) return;
              setEmailTouched(true);
              const err = validateAdminEmail(email);
              setEmailError(err);
              if (err) setLiveAnnouncement(err);
            }}
            aria-invalid={emailError ? "true" : "false"}
            aria-describedby={
              emailError ? `${emailHintId} ${emailErrorId}` : emailHintId
            }
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
          <label
            htmlFor="admin-password"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Kata Sandi <span aria-hidden="true">*</span>
          </label>
          <span id={passwordHintId} className="text-xs text-[#5b6760]">
            Minimal 8 karakter. Anda dapat menempel dari pengelola sandi.
          </span>
          <div className="relative flex items-center">
            <input
              ref={passwordRef}
              id="admin-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              minLength={8}
              enterKeyHint="done"
              required
              value={password}
              onChange={(e) => {
                const next = e.target.value;
                setPassword(next);
                setPasswordTouched(true);
                setSubmitError("");
                if (passwordError && !validateAdminPassword(next)) {
                  setPasswordError("");
                  setLiveAnnouncement("");
                }
              }}
              onBlur={() => {
                if (!passwordTouched && !password) return;
                setPasswordTouched(true);
                const err = validateAdminPassword(password);
                setPasswordError(err);
                if (err) setLiveAnnouncement(err);
              }}
              aria-invalid={passwordError ? "true" : "false"}
              aria-describedby={
                passwordError
                  ? `${passwordHintId} ${passwordErrorId}`
                  : passwordHintId
              }
              className={`min-h-12 w-full rounded-xl border bg-white py-2.5 pe-14 ps-3.5 text-base text-[#1f2a24] ${
                passwordError ? "border-[#b42318]" : "border-[#b8b0a2]"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              aria-label={
                showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
              }
              aria-describedby={passwordWarningId}
              className="absolute end-0.5 inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-[#3a4640] hover:bg-[#efe9de]"
            >
              {showPassword ? (
                <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
              )}
            </button>
            <span id={passwordWarningId} className="visually-hidden">
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
            disabled={submitting}
            className="btn-primary min-h-12 disabled:opacity-60"
          >
            {submitting ? "Memeriksa kredensial..." : "Masuk Admin"}
          </button>
        </div>
      </form>
    </section>
  );
}
