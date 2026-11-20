"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { RefreshCw, ShieldAlert } from "lucide-react";
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

export function AdminMfaEnrollClient({ adminEmail }: { adminEmail?: string }) {
  const headingId = useId();
  const otpHintId = useId();
  const otpErrorId = useId();
  const otpInputRef = useRef<HTMLInputElement>(null);

  const [factorId, setFactorId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loadingQr, setLoadingQr] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function requestNewFactor() {
    setLoadingQr(true);
    setLoadError("");
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/auth/mfa/enroll", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf,
        },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(
          json?.error?.message ?? "Gagal menyiapkan pendaftaran MFA TOTP."
        );
        return;
      }
      setFactorId(json.data.factor_id);
      setQrDataUrl(json.data.qr_data_url);
      setSecret(json.data.secret);
    } catch {
      setLoadError("Gagal terhubung ke layanan MFA.");
    } finally {
      setLoadingQr(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initEnroll() {
      try {
        const csrf = await fetchAdminCsrfToken();
        const res = await fetch("/api/v1/admin/auth/mfa/enroll", {
          method: "POST",
          headers: { "X-CSRF-Token": csrf },
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok) {
          setLoadError(
            json?.error?.message ?? "Gagal menyiapkan pendaftaran MFA TOTP."
          );
          return;
        }
        setFactorId(json.data.factor_id);
        setQrDataUrl(json.data.qr_data_url);
        setSecret(json.data.secret);
      } catch {
        if (active) {
          setLoadError("Gagal terhubung ke layanan MFA.");
        }
      } finally {
        if (active) {
          setLoadingQr(false);
        }
      }
    }
    void initEnroll();
    return () => {
      active = false;
    };
  }, []);

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCodeTouched(true);
    setSubmitError("");
    const err = validateOtpCode(code);
    setCodeError(err);
    if (err) {
      otpInputRef.current?.focus();
      return;
    }
    if (!factorId) {
      setSubmitError("Faktor MFA belum siap. Muat ulang kode QR terlebih dahulu.");
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
          json?.error?.message ?? "Kode verifikasi tidak valid."
        );
        return;
      }
      navigating = true;
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload dokumen penuh pada batas sesi MFA agar proxy & layout membaca cookie AAL2 terbaru
      window.location.assign("/admin");
      return;
    } catch {
      setSubmitError("Gagal memverifikasi kode OTP.");
    } finally {
      if (!navigating) {
        setVerifying(false);
      }
    }
  }

  return (
    <section className="space-y-6 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={headingId} className="text-lg font-bold text-[#1f2a24]">
            Pendaftaran Wajib MFA (Aplikasi Autentikator)
          </h2>
          <p className="max-w-[65ch] text-sm text-[#3a4640]">
            {adminEmail ? `Akun ${adminEmail} belum memiliki ` : "Akun admin belum memiliki "}
            autentikator TOTP terverifikasi. Pindai kode QR di bawah memakai Google
            Authenticator, 1Password, atau Bitwarden, lalu masukkan kode 6 digit.
          </p>
        </div>
        <AdminSignOutButton />
      </div>

      {loadError ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-[#b42318] bg-[#fef3f2] p-4 text-sm text-[#b42318]"
        >
          <p className="flex items-center gap-2 font-semibold">
            <ShieldAlert size={18} strokeWidth={1.75} aria-hidden="true" />
            {loadError}
          </p>
          <button
            type="button"
            onClick={() => void requestNewFactor()}
            className="btn-secondary min-h-11 text-xs"
          >
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            Coba Buat QR Lagi
          </button>
        </div>
      ) : loadingQr ? (
        <p className="text-sm font-semibold text-[#3a4640]">
          Menyiapkan kode QR TOTP...
        </p>
      ) : qrDataUrl ? (
        <div className="flex flex-col gap-5 rounded-2xl border border-[#d6cec1] bg-white p-5 sm:flex-row sm:items-center">
          <Image
            src={qrDataUrl}
            alt="Kode QR pendaftaran aplikasi autentikator admin EDMB"
            width={220}
            height={220}
            unoptimized
            className="rounded-xl border border-[#d6cec1] bg-white p-2"
          />
          <div className="space-y-3 text-sm text-[#3a4640]">
            <p className="font-bold text-[#1f2a24]">
              Tidak bisa memindai kamera?
            </p>
            <button
              type="button"
              aria-expanded={showSecret}
              onClick={() => setShowSecret((prev) => !prev)}
              className="btn-secondary min-h-11 text-xs"
            >
              {showSecret ? "Sembunyikan Kunci Manual" : "Tampilkan Kunci Manual"}
            </button>
            {showSecret && secret ? (
              <p className="rounded-xl bg-[#faf6ee] p-3 font-mono text-sm font-bold tracking-wider break-all text-[#1f2a24]">
                {secret}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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
        onSubmit={handleVerify}
        noValidate
        className="max-w-md space-y-5"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="admin-mfa-enroll-code"
            className="text-sm font-bold text-[#1f2a24]"
          >
            Kode Verifikasi 6 Digit <span aria-hidden="true">*</span>
          </label>
          <p id={otpHintId} className="text-xs text-[#5b6760]">
            Masukkan 6 digit angka dari aplikasi autentikator Anda.
          </p>
          <input
            ref={otpInputRef}
            id="admin-mfa-enroll-code"
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
          disabled={verifying || loadingQr || !factorId}
          className="btn-primary min-h-12 disabled:opacity-60"
        >
          {verifying ? "Memverifikasi..." : "Aktifkan MFA & Masuk"}
        </button>
      </form>
    </section>
  );
}
