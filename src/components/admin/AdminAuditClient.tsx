"use client";

import { useId } from "react";
import Link from "next/link";
import { AlertCircle, Filter, Lock, ScrollText, ShieldCheck } from "lucide-react";
import type { AdminAuditLogRow } from "@/modules/admin/ops-service";

export interface AdminAuditClientProps {
  logs: AdminAuditLogRow[];
  distinctActions: string[];
  initialFilters: {
    action: string;
    outcome: string;
    actor_type: string;
    from: string;
    to: string;
    limit: number;
  };
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

const KNOWN_AUDIT_ACTIONS = [
  "update_site_settings",
  "run_retention_purge",
  "create_privacy_request",
  "update_privacy_request",
  "support_access_granted",
  "support_access_read_results",
  "support_access_revoked",
  "publish_content_revision",
  "export_assignment_csv",
  "invite_teacher",
  "admin_login_success",
] as const;

function formatJakartaTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(dt)} WIB`;
}

function outcomeBadgeClass(outcome: AdminAuditLogRow["outcome"]): string {
  switch (outcome) {
    case "success":
      return "bg-[#dcfce7] text-[#166534]";
    case "denied":
      return "bg-[#fbefcf] text-[#8a5a00]";
    case "error":
      return "bg-[#fef3f2] text-[#b42318]";
  }
}

function outcomeLabel(outcome: AdminAuditLogRow["outcome"]): string {
  switch (outcome) {
    case "success":
      return "Berhasil";
    case "denied":
      return "Ditolak";
    case "error":
      return "Galat";
  }
}

function actorTypeLabel(actorType: AdminAuditLogRow["actor_type"]): string {
  switch (actorType) {
    case "admin":
      return "Admin";
    case "teacher":
      return "Guru";
    case "guest":
      return "Sesi Tamu";
    case "system":
      return "Sistem / Cron";
  }
}

function formatSafeMetadata(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 5)
    .map(([k, v]) => {
      const valStr =
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : JSON.stringify(v);
      return `${k}: ${valStr}`;
    })
    .join(" • ");
}

export function AdminAuditClient({
  logs,
  distinctActions,
  initialFilters,
  mode,
  migrationPending,
}: AdminAuditClientProps) {
  const baseId = useId();
  const isSupabaseLive = mode === "supabase";
  const allActions = Array.from(
    new Set([...KNOWN_AUDIT_ACTIONS, ...distinctActions])
  ).sort();

  const tableHeadingId = `${baseId}-table-heading`;

  return (
    <main className="space-y-8 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="space-y-1">
        <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
          Jejak Keamanan &amp; Kepatuhan (SEC-24)
        </p>
        <h1>Log Audit Portal Admin</h1>
        <p className="max-w-[65ch] text-sm text-[#3a4640]">
          Pantau aktivitas sensitif lintas sistem dengan filter tanggal, aksi,
          hasil, dan aktor. Log hanya menampilkan metadata operasional tanpa
          token rahasia maupun nama lengkap siswa.
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
            <p className="font-bold">Pratinjau Mode Demo Lokal (Data Sampel)</p>
            <p className="text-xs text-[#3a4640]">
              Menampilkan contoh catatan audit tersanitasi. Pada mode produksi
              Supabase, data berasal langsung dari <code>private.audit_logs</code>{" "}
              melalui RPC terotorisasi admin.
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
              pembacaan log audit aktif.
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
          <strong className="text-[#1f2a24]">Penyaringan PII Otomatis:</strong>{" "}
          Setiap bidang berisiko di <code>safe_metadata</code> disensor sebelum
          dikirim ke browser admin.
        </p>
      </div>

      {/* Filter Pencarian Audit dalam landmark <search> + form GET */}
      <search>
        <form
          action="/admin/audit"
          method="GET"
          aria-labelledby={`${baseId}-filter-heading`}
          className="space-y-4 rounded-2xl border border-[#efeae2] bg-[#faf6ee]/60 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-[#1f4d38]" aria-hidden="true" />
            <h2
              id={`${baseId}-filter-heading`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Filter Riwayat Audit
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-action`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Jenis Aksi
              </label>
              <select
                id={`${baseId}-action`}
                name="action"
                defaultValue={initialFilters.action}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              >
                <option value="">Semua aksi</option>
                {allActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-outcome`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Hasil
              </label>
              <select
                id={`${baseId}-outcome`}
                name="outcome"
                defaultValue={initialFilters.outcome}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              >
                <option value="">Semua hasil</option>
                <option value="success">Berhasil (success)</option>
                <option value="denied">Ditolak (denied)</option>
                <option value="error">Galat (error)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-actor`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Tipe Aktor
              </label>
              <select
                id={`${baseId}-actor`}
                name="actor_type"
                defaultValue={initialFilters.actor_type}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              >
                <option value="">Semua aktor</option>
                <option value="admin">Admin</option>
                <option value="teacher">Guru</option>
                <option value="guest">Sesi Tamu</option>
                <option value="system">Sistem / Cron</option>
              </select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-from`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Dari Tanggal (UTC)
              </label>
              <input
                id={`${baseId}-from`}
                name="from"
                type="date"
                defaultValue={initialFilters.from}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-to`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Sampai Tanggal (UTC)
              </label>
              <input
                id={`${baseId}-to`}
                name="to"
                type="date"
                defaultValue={initialFilters.to}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor={`${baseId}-limit`}
                className="block text-xs font-bold text-[#1f2a24]"
              >
                Batas Baris
              </label>
              <select
                id={`${baseId}-limit`}
                name="limit"
                defaultValue={String(initialFilters.limit)}
                className="edmb-field-control w-full rounded-xl border border-[#b9b0a2] bg-white px-3 py-2 text-sm text-[#1f2a24]"
              >
                <option value="25">25 baris terbaru</option>
                <option value="50">50 baris terbaru</option>
                <option value="100">100 baris terbaru</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" className="btn-primary min-h-11 text-sm">
              Terapkan Filter
            </button>
            <Link
              href="/admin/audit"
              prefetch={false}
              className="btn-secondary min-h-11 text-sm"
            >
              Reset
            </Link>
          </div>
        </form>
      </search>

      {/* Tabel Audit Responsif */}
      <section aria-labelledby={tableHeadingId} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={tableHeadingId} className="flex items-center gap-2 text-base font-bold text-[#1f2a24]">
            <ScrollText size={18} className="text-[#1f4d38]" aria-hidden="true" />
            Catatan Audit Terbaru ({logs.length})
          </h2>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={tableHeadingId}
          className="table-wrapper rounded-2xl border border-[#d6cec1]"
        >
          <table className="responsive-results-table text-sm">
            <thead>
              <tr className="border-b border-[#d6cec1] bg-[#faf6ee] text-left text-xs font-bold tracking-[0.04em] text-[#3a4640] uppercase">
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Hasil</th>
                <th className="px-4 py-3">Aktor</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Waktu (WIB)</th>
                <th className="px-4 py-3">Metadata Aman &amp; ID Permintaan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#efeae2]">
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-[#5b6760]"
                  >
                    Tidak ada catatan audit yang cocok dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                logs.map((row) => (
                  <tr key={row.id} className="align-top">
                    <th scope="row" className="px-4 py-3 font-bold text-[#1f2a24]">
                      <code>{row.action}</code>
                    </th>
                    <td data-label="Hasil" className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${outcomeBadgeClass(
                          row.outcome
                        )}`}
                      >
                        {outcomeLabel(row.outcome)}
                      </span>
                    </td>
                    <td data-label="Aktor" className="px-4 py-3 text-xs text-[#3a4640]">
                      <p className="font-semibold text-[#1f2a24]">
                        {row.actor_display_name ?? actorTypeLabel(row.actor_type)}
                      </p>
                      <p className="text-[#5b6760]">
                        {actorTypeLabel(row.actor_type)} •{" "}
                        <code>{row.actor_id.slice(0, 12)}</code>
                      </p>
                    </td>
                    <td data-label="Target" className="px-4 py-3 text-xs text-[#3a4640]">
                      <p className="font-semibold text-[#1f2a24]">{row.target_type}</p>
                      <p className="break-all text-[#5b6760]">
                        <code>{row.target_id}</code>
                      </p>
                    </td>
                    <td data-label="Waktu (WIB)" className="px-4 py-3 text-xs whitespace-nowrap text-[#3a4640]">
                      {formatJakartaTime(row.created_at)}
                    </td>
                    <td data-label="Metadata Aman" className="px-4 py-3 text-xs text-[#3a4640]">
                      <p className="break-words">{formatSafeMetadata(row.safe_metadata)}</p>
                      <p className="mt-0.5 text-[11px] text-[#5b6760]">
                        Req: <code>{row.request_id.slice(0, 16)}</code>
                      </p>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
