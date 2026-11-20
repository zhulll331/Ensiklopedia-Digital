"use client";

import { useId, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminSignOutButton } from "./AdminSignOutButton";
import { fetchAdminCsrfToken } from "./csrf-client";

function validateOtpCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Masukkan 6 digit kode dari aplikasi autentikator.";
  }
  if (!/^\d{6}$/.test(trimmed)) {
    return "Kode OTP harus tepat 6 digit angka.";
  }
  return "";
}

export function AdminMfaVerifyClient({
  factorId,
  adminEmail,
  isReauth,
}: {
  factorId: string;
  adminEmail?: string;
  isReauth: boolean;
}) {
  const headingId = useId();
  const otpHintId = useId();
  const otpErrorId = useId();
  const otpInputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCodeTouched(true);
    setSubmitError("");
    const err = validateOtpCode(code);
    setCodeError(err);
    if (err) {
      otpInputRef.current?.focus();
      return;
    }

    setVerifying(true);
    let navigating = false;
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          factor_id: factorId,
          code: code.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(
          json?.error?.message ?? "Kode verifikasi MFA tidak sesuai."
        );
        return;
      }
      navigating = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload dokumen penuh pada batas sesi MFA agar proxy & layout membaca cookie AAL2 terbaru
      window.location.assign("/admin");
      return;
    } catch {
      setSubmitError("Gagal memverifikasi kode MFA.");
    } finally {
      if (!navigating) {
        setVerifying(false);
      }
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={headingId} className="text-lg font-bold text-[#1f2a24]">
            {isReauth
              ? "Konfirmasi Ulang MFA untuk Aksi Sensitif"
              : "Verifikasi Langkah Kedua (MFA)"}
          </h2>
          <p className="max-w-[65ch] text-sm text-[#3a4640]">
            {isReauth
              ? "Untuk menerbitkan revisi atau tindakan sensitif lain, masukkan kembali kode 6 digit terbaru dari autentikator."
              : `Masukkan kode 6 digit dari aplikasi autentikator${adminEmail ? ` untuk akun ${adminEmail}` : ""}.`}
          </p>
        </div>
        <AdminSignOutButton />
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
        action="/api/v1/admin/auth/mfa/verify"
        aria-labelledby={headingId}
        onSubmit={handleSubmit}
        noValidate
        className="max-w-md space-y-5"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="admin-mfa-verify-code"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Kode OTP Autentikator <span aria-hidden="true">*</span>
          </label>
          <p id={otpHintId} className="text-xs text-[#5b6760]">
            Masukkan 6 digit angka yang tampil di aplikasi autentikator Anda.
          </p>
          <input
            ref={otpInputRef}
            id="admin-mfa-verify-code"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            enterKeyHint="done"
            required
            value={code}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(next);
              setCodeTouched(true);
              setSubmitError("");
              if (codeError && !validateOtpCode(next)) {
                setCodeError("");
                setLiveAnnouncement("");
              }
            }}
            onBlur={() => {
              if (!codeTouched && !code) return;
              setCodeTouched(true);
              const err = validateOtpCode(code);
              setCodeError(err);
              if (err) setLiveAnnouncement(err);
            }}
            aria-invalid={codeError ? "true" : "false"}
            aria-describedby={
              codeError ? `${otpHintId} ${otpErrorId}` : otpHintId
            }
            className={`min-h-12 w-full rounded-xl border bg-white px-4 py-2 font-mono text-xl tracking-[0.35em] text-[#1f2a24] ${
              codeError ? "border-[#b42318]" : "border-[#b8b0a2]"
            }`}
          />
          {codeError ? (
            <p id={otpErrorId} className="text-sm font-semibold text-[#b42318]">
              {codeError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="btn-primary min-h-12 disabled:opacity-60"
        >
          <ShieldCheck size={18} strokeWidth={1.75} aria-hidden="true" />
          {verifying ? "Memverifikasi..." : "Verifikasi & Lanjutkan"}
        </button>
      </form>
    </section>
  );
}
