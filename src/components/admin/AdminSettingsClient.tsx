"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Lock,
  Save,
  ShieldCheck,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  DEFAULT_CONTACT_EMAIL_PLACEHOLDER,
  DEFAULT_SITE_SETTINGS,
  SITE_SETTING_FIELDS,
  SITE_SETTING_KEYS,
  updateSiteSettingsSchema,
  type PublicSiteSettingsValues,
  type SiteSettingKey,
} from "@/modules/admin/ops-schemas";
import type { AdminSettingMetadataItem } from "@/modules/admin/ops-service";

export interface AdminSettingsClientProps {
  initialValues: PublicSiteSettingsValues;
  initialItems: AdminSettingMetadataItem[];
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

function formatJakartaTime(iso: string | null): string {
  if (!iso) return "Bawaan sistem";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Bawaan sistem";
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(dt)} WIB`;
}

export function AdminSettingsClient({
  initialValues,
  initialItems,
  mode,
  migrationPending,
}: AdminSettingsClientProps) {
  const router = useRouter();
  const baseId = useId();
  const isSupabaseLive = mode === "supabase";

  const [values, setValues] = useState<PublicSiteSettingsValues>(initialValues);
  const [items, setItems] = useState<AdminSettingMetadataItem[]>(initialItems);
  const [touched, setTouched] = useState<Partial<Record<SiteSettingKey, boolean>>>(
    {}
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<SiteSettingKey, string>>
  >({});
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputRefs = useRef<
    Partial<Record<SiteSettingKey, HTMLInputElement | HTMLTextAreaElement | null>>
  >({});

  function validateSingleField(key: SiteSettingKey, rawValue: string): string | null {
    const parsed = updateSiteSettingsSchema.safeParse({ [key]: rawValue });
    if (parsed.success) return null;
    const issue = parsed.error.issues.find(
      (i) => i.path[0] === key || i.path.length === 0
    );
    return issue?.message ?? "Isi pengaturan belum memenuhi syarat.";
  }

  function handleChange(key: SiteSettingKey, nextValue: string) {
    setValues((prev) => ({ ...prev, [key]: nextValue }));
    setSubmitSuccess(null);
    if (fieldErrors[key]) {
      const err = validateSingleField(key, nextValue);
      setFieldErrors((prev) => {
        const copy = { ...prev };
        if (err) copy[key] = err;
        else delete copy[key];
        return copy;
      });
    }
  }

  function handleBlur(key: SiteSettingKey) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const err = validateSingleField(key, values[key]);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      if (err) copy[key] = err;
      else delete copy[key];
      return copy;
    });
    if (err) {
      const fieldMeta = SITE_SETTING_FIELDS.find((f) => f.key === key);
      setLiveAnnouncement(`${fieldMeta?.label ?? key}: ${err}`);
    }
  }

  function handleResetDefaults() {
    setValues({ ...DEFAULT_SITE_SETTINGS });
    setFieldErrors({});
    setSubmitError(null);
    setSubmitSuccess(
      "Nilai formulir dikembalikan ke teks bawaan sistem (belum disimpan ke database)."
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;

    setSubmitError(null);
    setSubmitSuccess(null);

    const parsed = updateSiteSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Partial<Record<SiteSettingKey, string>> = {};
      const nextTouched: Partial<Record<SiteSettingKey, boolean>> = { ...touched };
      let firstInvalidKey: SiteSettingKey | null = null;

      for (const issue of parsed.error.issues) {
        const pathKey = issue.path[0];
        if (
          typeof pathKey === "string" &&
          (SITE_SETTING_KEYS as ReadonlyArray<string>).includes(pathKey)
        ) {
          const typedKey = pathKey as SiteSettingKey;
          if (!nextErrors[typedKey]) {
            nextErrors[typedKey] = issue.message;
          }
          nextTouched[typedKey] = true;
          if (!firstInvalidKey) {
            firstInvalidKey = typedKey;
          }
        }
      }

      setTouched(nextTouched);
      setFieldErrors(nextErrors);
      const summary =
        (firstInvalidKey ? nextErrors[firstInvalidKey] : null) ??
        "Periksa kembali kolom pengaturan yang ditandai merah.";
      setSubmitError(summary);
      setLiveAnnouncement(summary);
      if (firstInvalidKey) {
        inputRefs.current[firstInvalidKey]?.focus();
      }
      return;
    }

    setSaving(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(parsed.data),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal menyimpan pengaturan situs.";
        setSubmitError(msg);
        setLiveAnnouncement(msg);
        if (json?.error?.field_errors) {
          setFieldErrors(json.error.field_errors);
        }
        return;
      }

      if (json?.data?.values) {
        setValues(json.data.values);
      }
      if (Array.isArray(json?.data?.items)) {
        setItems(json.data.items);
      }
      setFieldErrors({});
      setSubmitSuccess(
        "Pengaturan allowlist publik berhasil disimpan dan langsung disinkronkan ke Beranda, Tentang, dan API pengaturan publik."
      );
      setLiveAnnouncement("Pengaturan situs berhasil disimpan.");
      router.refresh();
    } catch {
      const msg = "Gagal terhubung ke server saat menyimpan pengaturan.";
      setSubmitError(msg);
      setLiveAnnouncement(msg);
    } finally {
      setSaving(false);
    }
  }

  const heroFields = SITE_SETTING_FIELDS.filter((f) => f.group === "hero");
  const privacyFields = SITE_SETTING_FIELDS.filter((f) => f.group === "privacy");

  const metaByKey = new Map(items.map((item) => [item.key, item]));

  return (
    <main className="space-y-8 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <div className="visually-hidden" aria-live="polite">
        {liveAnnouncement}
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Pengaturan Publik Allowlist (Fase 8)
          </p>
          <h1 id={`${baseId}-heading`}>Pengaturan Situs &amp; Kontak Privasi</h1>
          <p className="max-w-[65ch] text-sm text-[#3a4640]">
            Kelola enam bidang konfigurasi publik resmi yang diizinkan
            (`hero_title`, `hero_subtitle`, `hero_slogan`, `contact_org_name`,
            `contact_email`, dan `privacy_notice_summary`). Kunci rahasia dan
            parameter keamanan server tidak pernah diekspos di halaman ini.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="btn-secondary min-h-11 gap-1.5 text-xs"
          >
            Lihat Beranda
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/tentang"
            className="btn-secondary min-h-11 gap-1.5 text-xs"
          >
            Lihat Tentang &amp; Privasi
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
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
              Anda dapat meninjau enam bidang pengaturan allowlist EDMB.
              Penyimpanan permanen aktif saat aplikasi terhubung ke Supabase
              dengan sesi admin terverifikasi MFA dan konfigurasi admin server.
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
              <code>supabase/migrations/0019_admin_ops_rpcs.sql</code> pada
              Supabase SQL Editor agar pengaturan dapat dibaca dan disimpan.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-2.5 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] px-4 py-3 text-xs text-[#3a4640]">
        <ShieldCheck
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-[#2f6b4f]"
          aria-hidden="true"
        />
        <p>
          <strong className="text-[#1f2a24]">Validasi Allowlist Ketat:</strong>{" "}
          Endpoint <code>PUT /api/v1/admin/settings</code> menolak kunci asing
          di luar enam bidang resmi ini serta mewajibkan token CSRF dan pencatatan
          audit otomatis.
        </p>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-[#b42318] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      ) : null}

      {submitSuccess ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-[#2f6b4f] bg-[#f0f6f0] px-4 py-3 text-sm font-semibold text-[#1f4d38]"
        >
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{submitSuccess}</span>
        </div>
      ) : null}

      <form
        noValidate
        aria-labelledby={`${baseId}-heading`}
        onSubmit={handleSubmit}
        className="space-y-8"
      >
        {/* Kelompok 1: Identitas Hero Beranda */}
        <fieldset className="space-y-4 rounded-2xl border border-[#efeae2] bg-[#faf6ee]/50 p-5">
          <legend className="px-2 text-sm font-extrabold text-[#1f2a24]">
            Identitas Hero Beranda
          </legend>

          {heroFields.map((field) => {
            const inputId = `${baseId}-${field.key}`;
            const helpId = `${baseId}-${field.key}-help`;
            const errId = `${baseId}-${field.key}-err`;
            const err = touched[field.key] || fieldErrors[field.key]
              ? fieldErrors[field.key] ?? null
              : null;
            const meta = metaByKey.get(field.key);
            const currentValue = values[field.key];

            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label
                    htmlFor={inputId}
                    className="block text-sm font-bold text-[#1f2a24]"
                  >
                    {field.label} <span aria-hidden="true">*</span>
                  </label>
                  <span className="text-xs text-[#5b6760]">
                    {currentValue.trim().length}/{field.maxLength} karakter
                  </span>
                </div>

                {field.multiline ? (
                  <textarea
                    id={inputId}
                    name={field.key}
                    ref={(el) => {
                      inputRefs.current[field.key] = el;
                    }}
                    rows={3}
                    maxLength={field.maxLength}
                    required
                    disabled={!isSupabaseLive || saving}
                    value={currentValue}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    aria-invalid={err ? "true" : "false"}
                    aria-describedby={err ? `${helpId} ${errId}` : helpId}
                    className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3.5 py-2.5 text-[#1f2a24] disabled:bg-[#f5f2eb] disabled:text-[#5b6760]"
                  />
                ) : (
                  <input
                    id={inputId}
                    name={field.key}
                    type="text"
                    ref={(el) => {
                      inputRefs.current[field.key] = el;
                    }}
                    maxLength={field.maxLength}
                    required
                    disabled={!isSupabaseLive || saving}
                    value={currentValue}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    aria-invalid={err ? "true" : "false"}
                    aria-describedby={err ? `${helpId} ${errId}` : helpId}
                    className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3.5 py-2.5 text-[#1f2a24] disabled:bg-[#f5f2eb] disabled:text-[#5b6760]"
                  />
                )}

                <p id={helpId} className="text-xs text-[#5b6760]">
                  {field.helpText}{" "}
                  <span className="text-[#3a4640]">
                    • Terakhir diperbarui: {formatJakartaTime(meta?.updated_at ?? null)}
                    {meta?.updated_by_name ? ` oleh ${meta.updated_by_name}` : ""}
                  </span>
                </p>

                {err ? (
                  <p id={errId} className="text-xs font-semibold text-[#b42318]">
                    {err}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {/* Kelompok 2: Kontak Resmi & Pemberitahuan Privasi */}
        <fieldset className="space-y-4 rounded-2xl border border-[#efeae2] bg-[#faf6ee]/50 p-5">
          <legend className="px-2 text-sm font-extrabold text-[#1f2a24]">
            Pengelola Resmi &amp; Informasi Privasi Publik
          </legend>

          {privacyFields.map((field) => {
            const inputId = `${baseId}-${field.key}`;
            const helpId = `${baseId}-${field.key}-help`;
            const errId = `${baseId}-${field.key}-err`;
            const err = touched[field.key] || fieldErrors[field.key]
              ? fieldErrors[field.key] ?? null
              : null;
            const meta = metaByKey.get(field.key);
            const currentValue = values[field.key];
            const isEmail = field.key === "contact_email";

            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label
                    htmlFor={inputId}
                    className="block text-sm font-bold text-[#1f2a24]"
                  >
                    {field.label} <span aria-hidden="true">*</span>
                  </label>
                  <span className="text-xs text-[#5b6760]">
                    {currentValue.trim().length}/{field.maxLength} karakter
                  </span>
                </div>

                {field.multiline ? (
                  <textarea
                    id={inputId}
                    name={field.key}
                    ref={(el) => {
                      inputRefs.current[field.key] = el;
                    }}
                    rows={4}
                    maxLength={field.maxLength}
                    required
                    disabled={!isSupabaseLive || saving}
                    value={currentValue}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    aria-invalid={err ? "true" : "false"}
                    aria-describedby={err ? `${helpId} ${errId}` : helpId}
                    className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3.5 py-2.5 text-[#1f2a24] disabled:bg-[#f5f2eb] disabled:text-[#5b6760]"
                  />
                ) : (
                  <input
                    id={inputId}
                    name={field.key}
                    type={
                      isEmail && currentValue !== DEFAULT_CONTACT_EMAIL_PLACEHOLDER
                        ? "email"
                        : "text"
                    }
                    autoComplete={isEmail ? "email" : "organization"}
                    spellCheck={isEmail ? false : undefined}
                    autoCapitalize={isEmail ? "none" : undefined}
                    ref={(el) => {
                      inputRefs.current[field.key] = el;
                    }}
                    maxLength={field.maxLength}
                    required
                    disabled={!isSupabaseLive || saving}
                    value={currentValue}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    onBlur={() => handleBlur(field.key)}
                    aria-invalid={err ? "true" : "false"}
                    aria-describedby={err ? `${helpId} ${errId}` : helpId}
                    className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3.5 py-2.5 text-[#1f2a24] disabled:bg-[#f5f2eb] disabled:text-[#5b6760]"
                  />
                )}

                <p id={helpId} className="text-xs text-[#5b6760]">
                  {field.helpText}{" "}
                  <span className="text-[#3a4640]">
                    • Terakhir diperbarui: {formatJakartaTime(meta?.updated_at ?? null)}
                    {meta?.updated_by_name ? ` oleh ${meta.updated_by_name}` : ""}
                  </span>
                </p>

                {err ? (
                  <p id={errId} className="text-xs font-semibold text-[#b42318]">
                    {err}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={!isSupabaseLive || saving}
            onClick={handleResetDefaults}
            className="btn-secondary min-h-12 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Isi Ulang Teks Bawaan
          </button>

          <button
            type="submit"
            disabled={!isSupabaseLive || saving}
            className="btn-primary min-h-12 gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={17} strokeWidth={1.75} aria-hidden="true" />
            {saving ? "Menyimpan..." : "Simpan Pengaturan Situs"}
          </button>
        </div>
      </form>
    </main>
  );
}
