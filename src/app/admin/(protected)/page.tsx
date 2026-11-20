import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  FileEdit,
  Image as ImageIcon,
  ShieldAlert,
} from "lucide-react";
import { resolveAdminSessionState } from "@/modules/admin/auth";
import { getAdminOverviewDataAsync } from "@/modules/admin/overview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ringkasan Portal Admin | EDMB",
  robots: { index: false, follow: false },
};

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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function AdminOverviewPage() {
  const session = await resolveAdminSessionState();
  const overview = await getAdminOverviewDataAsync(session);

  // Gabungkan antrean penelaahan + revisi siap terbit secara unik
  const priorityMap = new Map<
    string,
    (typeof overview.reviewQueue)[number]
  >();
  for (const rev of overview.readyToPublish) {
    priorityMap.set(rev.revision_id, rev);
  }
  for (const rev of overview.reviewQueue) {
    priorityMap.set(rev.revision_id, rev);
  }
  const priorityRevisions = Array.from(priorityMap.values());

  const statusMetrics = [
    {
      label: "Draf",
      count: overview.statusCounts.draft,
      icon: FileEdit,
      badgeBg: "bg-[#efeae2]",
      badgeText: "text-[#1f2a24]",
    },
    {
      label: "Penelaahan",
      count: overview.statusCounts.in_review,
      icon: Eye,
      badgeBg: "bg-[#fbefcf]",
      badgeText: "text-[#8a5a00]",
    },
    {
      label: "Disetujui",
      count: overview.statusCounts.approved,
      icon: FileCheck2,
      badgeBg: "bg-[#d8eef0]",
      badgeText: "text-[#0e6f7a]",
    },
    {
      label: "Terbit",
      count: overview.statusCounts.published,
      icon: CheckCircle2,
      badgeBg: "bg-[#dcfce7]",
      badgeText: "text-[#166534]",
    },
    {
      label: "Arsip",
      count: overview.statusCounts.archived,
      icon: Archive,
      badgeBg: "bg-[#f6dfd2]",
      badgeText: "text-[#8f3d1b]",
    },
  ] as const;

  return (
    <main className="space-y-8 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Dashboard Operasional Kurasi
          </p>
          <h1>Ringkasan Portal Admin</h1>
          <p className="text-sm text-[#3a4640]">
            Pantauan cepat status revisi konten, antrean telaah, media
            karantina, dan job sistem terjadwal.
          </p>
        </div>

        <Link href="/admin/konten" className="btn-primary min-h-12 text-sm">
          Buka Konten &amp; Revisi
          <ArrowRight size={17} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </header>

      {/* Kartu Jumlah Revisi per Status */}
      <section aria-labelledby="heading-status-revisi" className="space-y-3">
        <h2
          id="heading-status-revisi"
          className="text-base font-bold text-[#1f2a24]"
        >
          Status Revisi Konten ({overview.totalRevisions} Total)
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {statusMetrics.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="space-y-2 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4"
              >
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${item.badgeBg} ${item.badgeText}`}
                >
                  <Icon size={13} strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </span>
                <p className="text-2xl font-extrabold text-[#1f2a24]">
                  {item.count}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Sorotan Antrean Operasional */}
      <section aria-labelledby="heading-sorotan-ops" className="space-y-3">
        <h2
          id="heading-sorotan-ops"
          className="text-base font-bold text-[#1f2a24]"
        >
          Sorotan Antrean Saat Ini
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#d6cec1] bg-[#fbefcf]/45 p-4">
            <p className="text-xs font-bold text-[#8a5a00] uppercase">
              Antrean Penelaahan
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
              {overview.reviewQueue.length}
            </p>
            <p className="mt-1 text-xs text-[#3a4640]">
              Revisi berstatus <code>in_review</code> menunggu keputusan kurator.
            </p>
          </div>

          <div className="rounded-2xl border border-[#2f6b4f]/30 bg-[#f0f6f0] p-4">
            <p className="text-xs font-bold text-[#1f4d38] uppercase">
              Siap Terbit (Lolos Gate)
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[#1f4d38]">
              {overview.readyToPublish.length}
            </p>
            <p className="mt-1 text-xs text-[#3a4640]">
              Revisi non-terbit yang sudah memenuhi syarat sumber &amp; review.
            </p>
          </div>

          <div className="rounded-2xl border border-[#d6cec1] bg-[#d8eef0]/45 p-4">
            <p className="text-xs font-bold text-[#0e6f7a] uppercase">
              Media di Karantina
            </p>
            <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
              {overview.quarantineMediaCount}
            </p>
            <p className="mt-1 text-xs text-[#3a4640]">
              Aset unggahan baru yang belum berstatus <code>cleared</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Tabel 1: Antrean Penelaahan & Siap Terbit */}
      <section aria-labelledby="heading-antrean-revisi" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="heading-antrean-revisi"
            className="text-base font-bold text-[#1f2a24]"
          >
            Antrean Penelaahan &amp; Revisi Siap Terbit
          </h2>
          <Link
            href="/admin/konten"
            className="text-xs font-bold text-[#1f4d38] underline"
          >
            Lihat semua revisi
          </Link>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="caption-antrean-revisi"
          className="table-wrapper"
        >
          <table className="responsive-results-table text-left text-sm">
            <caption
              id="caption-antrean-revisi"
              className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
            >
              Revisi dalam tahap penelaahan atau siap terbit untuk ditindaklanjuti
              kurator.
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">
                  Judul &amp; Slug
                </th>
                <th scope="col" className="py-3 pr-4">
                  Jenis
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="py-3 pr-4">
                  Gate Validasi
                </th>
                <th scope="col" className="py-3">
                  Kekurangan Utama
                </th>
              </tr>
            </thead>
            <tbody>
              {priorityRevisions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-[#5b6760]">
                    Tidak ada revisi yang menunggu penelaahan saat ini.
                  </td>
                </tr>
              ) : (
                priorityRevisions.map((rev) => (
                  <tr
                    key={rev.revision_id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3 pr-4 font-normal">
                      <Link
                        href={`/admin/konten/${rev.content_id}/revisi/${rev.revision_id}`}
                        className="font-bold text-[#1f4d38] underline hover:text-[#17392a]"
                      >
                        {rev.title}
                      </Link>
                      <p className="text-xs text-[#5b6760]">
                        <code>{rev.slug}</code> • v{rev.version_no}
                      </p>
                    </th>
                    <td data-label="Jenis" className="py-3 pr-4 text-[#3a4640]">
                      {rev.kind}
                    </td>
                    <td data-label="Status" className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-0.5 text-xs font-bold text-[#1f2a24]">
                        <Clock3 size={13} strokeWidth={1.75} aria-hidden="true" />
                        {rev.status}
                      </span>
                    </td>
                    <td data-label="Gate Validasi" className="py-3 pr-4">
                      {rev.publish_gate.ready ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-bold text-[#166534]">
                          <CheckCircle2
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Siap Terbit
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 text-xs font-bold text-[#8a5a00]">
                          <ShieldAlert
                            size={13}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Belum Lengkap
                        </span>
                      )}
                    </td>
                    <td
                      data-label="Kekurangan Utama"
                      className="py-3 text-xs text-[#3a4640]"
                    >
                      {rev.publish_gate.missingRequirements[0] ?? "Siap diproses"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabel 2: Media Menunggu Pemeriksaan (Karantina) */}
      <section aria-labelledby="heading-media-karantina" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="heading-media-karantina"
            className="text-base font-bold text-[#1f2a24]"
          >
            Media di Karantina
          </h2>
          <Link
            href="/admin/media"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#1f4d38] underline"
          >
            <ImageIcon size={14} strokeWidth={1.75} aria-hidden="true" />
            Kelola Media &amp; Karantina →
          </Link>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="caption-media-karantina"
          className="table-wrapper"
        >
          <table className="responsive-results-table text-left text-sm">
            <caption
              id="caption-media-karantina"
              className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
            >
              Aset media berstatus quarantine yang tidak diekspos ke halaman
              publik sebelum lolos pemeriksaan.
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">
                  Berkas / Path
                </th>
                <th scope="col" className="py-3 pr-4">
                  Jenis &amp; Ukuran
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status Scan
                </th>
                <th scope="col" className="py-3">
                  Metadata EXIF
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.quarantineMedia.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-5 text-center text-[#5b6760]">
                    Tidak ada media berstatus karantina.
                  </td>
                </tr>
              ) : (
                overview.quarantineMedia.map((asset) => (
                  <tr
                    key={asset.id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3 pr-4 font-bold text-[#1f2a24]">
                      <code className="break-all">{asset.storage_path}</code>
                    </th>
                    <td
                      data-label="Jenis & Ukuran"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      {asset.kind} ({asset.mime}) • {formatBytes(asset.bytes)}
                    </td>
                    <td data-label="Status Scan" className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 text-xs font-bold text-[#8a5a00]">
                        <ShieldAlert
                          size={13}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        {asset.scan_status}
                      </span>
                    </td>
                    <td data-label="Metadata EXIF" className="py-3 text-xs text-[#3a4640]">
                      {asset.metadata_scrubbed_at
                        ? "Sudah dibersihkan"
                        : "Menunggu pembersihan"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tabel 3: Status Job Sistem Terakhir */}
      <section aria-labelledby="heading-job-runs" className="space-y-3">
        <h2
          id="heading-job-runs"
          className="text-base font-bold text-[#1f2a24]"
        >
          Status Job Sistem Terakhir
        </h2>

        {overview.jobRunsMigrationPending ? (
          <p
            role="status"
            className="rounded-xl border border-[#8a5a00]/30 bg-[#fbefcf]/60 px-4 py-3 text-xs font-semibold text-[#8a5a00]"
          >
            Fungsi RPC ringkasan job (migrasi <code>0011_admin_overview_rpc.sql</code>)
            belum diterapkan di Supabase. Jalankan migrasi tersebut agar riwayat{" "}
            <code>private.job_runs</code> tampil di sini.
          </p>
        ) : null}

        <div
          tabIndex={0}
          role="region"
          aria-labelledby="caption-job-runs"
          className="table-wrapper"
        >
          <table className="responsive-results-table text-left text-sm">
            <caption
              id="caption-job-runs"
              className="pb-2 text-left text-xs font-semibold text-[#5b6760]"
            >
              Lima eksekusi job latar belakang terakhir pada schema privat.
            </caption>
            <thead>
              <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
                <th scope="col" className="py-3 pr-4">
                  Jenis Job
                </th>
                <th scope="col" className="py-3 pr-4">
                  Status
                </th>
                <th scope="col" className="py-3 pr-4">
                  Waktu Mulai
                </th>
                <th scope="col" className="py-3 pr-4">
                  Waktu Selesai
                </th>
                <th scope="col" className="py-3">
                  Kode Error Aman
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.recentJobRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-5 text-center text-[#5b6760]">
                    Belum ada riwayat eksekusi job yang tercatat.
                  </td>
                </tr>
              ) : (
                overview.recentJobRuns.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3 pr-4 font-bold text-[#1f2a24]">
                      <code>{job.job_type}</code>
                    </th>
                    <td data-label="Status" className="py-3 pr-4">
                      <span
                        className={
                          job.status === "succeeded"
                            ? "inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-bold text-[#166534]"
                            : job.status === "failed"
                              ? "inline-flex items-center gap-1 rounded-full bg-[#fde8e6] px-2.5 py-0.5 text-xs font-bold text-[#b42318]"
                              : "inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 text-xs font-bold text-[#8a5a00]"
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                    <td
                      data-label="Waktu Mulai"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      {formatJakartaTime(job.started_at)}
                    </td>
                    <td
                      data-label="Waktu Selesai"
                      className="py-3 pr-4 text-xs text-[#3a4640]"
                    >
                      {formatJakartaTime(job.finished_at)}
                    </td>
                    <td
                      data-label="Kode Error Aman"
                      className="py-3 text-xs text-[#3a4640]"
                    >
                      {job.safe_error_code ?? "—"}
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
