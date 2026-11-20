"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  EXTERNAL_MEDIA_KINDS,
  detectExternalMediaPreview,
  parseAndNormalizeExternalMediaUrl,
  type ExternalMediaKind,
} from "@/modules/admin/external-media";
import type { AdminMediaAssetItem } from "@/modules/admin/media-service";
import {
  KIND_ALLOWED_MIMES,
  MEDIA_KINDS,
  MEDIA_KIND_LABELS,
  MEDIA_SCAN_LABELS,
  MEDIA_SCAN_STATUSES,
  isMimeAllowedForKind,
  type MediaKind,
  type MediaScanStatus,
} from "@/modules/admin/media-validation";

export interface AdminMediaClientProps {
  items: AdminMediaAssetItem[];
  counts: Record<MediaScanStatus, number> & { total: number };
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
  maxBytesByKind: Record<MediaKind, number>;
  filters: {
    status: string;
    kind: string;
    q: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatAssetSize(asset: AdminMediaAssetItem): string {
  if (asset.storage_bucket === "external-link") {
    return "0 B (Link Eksternal)";
  }
  return formatBytes(asset.bytes);
}

function needsManualAttestation(asset: AdminMediaAssetItem): boolean {
  return (
    asset.storage_bucket === "external-link" ||
    asset.kind === "pdf" ||
    asset.kind === "video" ||
    asset.mime === "application/pdf" ||
    asset.mime === "video/mp4"
  );
}

export function AdminMediaClient({
  items,
  counts,
  mode,
  migrationPending,
  maxBytesByKind,
  filters,
}: AdminMediaClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-media-caption`;
  const isSupabaseLive = mode === "supabase";

  // Mode intake: unggah ke Storage vs simpan link eksternal hemat storage
  const [intakeMode, setIntakeMode] = useState<"upload" | "external">("upload");

  // State unggahan 3 langkah
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<MediaKind>("image");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCredit, setUploadCredit] = useState("");
  const [uploadLicense, setUploadLicense] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // State pendaftaran tautan eksternal (YouTube / Vimeo / Drive / foto HTTPS)
  const extUrlInputRef = useRef<HTMLInputElement>(null);
  const [extKind, setExtKind] = useState<ExternalMediaKind>("video");
  const [extUrl, setExtUrl] = useState("");
  const [extCredit, setExtCredit] = useState("");
  const [extLicense, setExtLicense] = useState("");
  const [extUrlError, setExtUrlError] = useState<string | null>(null);
  const [extSubmitError, setExtSubmitError] = useState<string | null>(null);
  const [extSubmitting, setExtSubmitting] = useState(false);

  // State pembersihan yatim & finalisasi ulang
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  // State dialog pemeriksaan manusia (SEC-17 / D4)
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const creditInputRef = useRef<HTMLInputElement>(null);
  const licenseInputRef = useRef<HTMLInputElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [reviewTarget, setReviewTarget] = useState<AdminMediaAssetItem | null>(
    null
  );
  const [previewExternalInDialog, setPreviewExternalInDialog] = useState(false);
  const [decision, setDecision] = useState<"cleared" | "rejected">("cleared");
  const [revCredit, setRevCredit] = useState("");
  const [revLicense, setRevLicense] = useState("");
  const [checkedNoLocation, setCheckedNoLocation] = useState(false);
  const [checkedRights, setCheckedRights] = useState(false);
  const [attestedManual, setAttestedManual] = useState(false);
  const [revNotes, setRevNotes] = useState("");
  const [reviewFieldErrors, setReviewFieldErrors] = useState<{
    credit?: string;
    license?: string;
    checklist?: string;
    notes?: string;
  }>({});
  const [reviewSubmitError, setReviewSubmitError] = useState<string | null>(
    null
  );
  const [submittingReview, setSubmittingReview] = useState(false);

  const uploadLimitMb = Math.round(
    (maxBytesByKind[uploadKind] ?? 10 * 1024 * 1024) / (1024 * 1024)
  );

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setUploadError(null);
    setActionMessage(null);

    if (!selectedFile) {
      setUploadError("Pilih berkas media terlebih dahulu sebelum mengunggah.");
      fileInputRef.current?.focus();
      return;
    }

    const mime = selectedFile.type.toLowerCase();
    if (!isMimeAllowedForKind(uploadKind, mime)) {
      setUploadError(
        `Tipe berkas '${mime || "tidak dikenali"}' tidak diizinkan untuk jenis '${MEDIA_KIND_LABELS[uploadKind]}' (SEC-19).`
      );
      return;
    }

    const maxAllowed = maxBytesByKind[uploadKind];
    if (selectedFile.size <= 0 || selectedFile.size > maxAllowed) {
      setUploadError(
        `Ukuran berkas (${formatBytes(selectedFile.size)}) melebihi batas maksimal ${uploadLimitMb} MB.`
      );
      return;
    }

    setUploading(true);
    try {
      setUploadProgress("Langkah 1/3: Meminta URL unggahan bertanda tangan...");
      const csrf = await fetchAdminCsrfToken();
      const intentRes = await fetch("/api/v1/admin/media/upload-intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          kind: uploadKind,
          mime,
          bytes: selectedFile.size,
          credit: uploadCredit.trim(),
          license: uploadLicense.trim(),
        }),
      });
      const intentJson = await intentRes.json().catch(() => null);
      if (!intentRes.ok) {
        setUploadError(
          intentJson?.error?.message ?? "Gagal menyiapkan intent unggahan."
        );
        setUploadProgress(null);
        return;
      }

      const assetId = String(intentJson?.data?.asset?.id ?? "");
      const signedUrl = String(intentJson?.data?.signed_url ?? "");
      if (!assetId || !signedUrl) {
        setUploadError("Respon signed upload tidak lengkap.");
        setUploadProgress(null);
        return;
      }

      setUploadProgress("Langkah 2/3: Mengunggah berkas ke bucket karantina...");
      const putRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mime,
        },
        body: selectedFile,
      });

      if (!putRes.ok) {
        setUploadError(
          "Gagal mengunggah berkas langsung ke bucket karantina Supabase."
        );
        setUploadProgress(null);
        return;
      }

      setUploadProgress(
        "Langkah 3/3: Memverifikasi signature biner & menghapus EXIF/GPS..."
      );
      const csrfFinal = await fetchAdminCsrfToken();
      const finRes = await fetch(`/api/v1/admin/media/${assetId}/finalize`, {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrfFinal,
        },
      });
      const finJson = await finRes.json().catch(() => null);
      if (!finRes.ok) {
        setUploadError(
          finJson?.error?.message ??
            "Finalisasi karantina gagal; berkas tidak lolos verifikasi."
        );
        setUploadProgress(null);
        router.refresh();
        return;
      }

      const warnings: string[] = Array.isArray(finJson?.data?.pdf_warnings)
        ? finJson.data.pdf_warnings
        : [];
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadCredit("");
      setUploadLicense("");
      setUploadProgress(null);
      setActionMessage(
        warnings.length > 0
          ? `Berkas difinalisasi ke karantina dengan peringatan PDF (${warnings.join(", ")}). Lakukan pemeriksaan manual sebelum menyetujui.`
          : "Berkas berhasil masuk karantina, lolos pemeriksaan signature, dan siap diperiksa kurator."
      );
      router.refresh();
    } catch {
      setUploadError("Terjadi gangguan jaringan saat proses unggah media.");
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleExternalLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive) return;
    setExtSubmitError(null);
    setActionMessage(null);

    const parsed = parseAndNormalizeExternalMediaUrl(extUrl, extKind);
    if (!parsed.ok) {
      setExtUrlError(parsed.message);
      extUrlInputRef.current?.focus();
      return;
    }

    setExtUrlError(null);
    setExtSubmitting(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/media/external-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          kind: extKind,
          url: extUrl.trim(),
          credit: extCredit.trim(),
          license: extLicense.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json?.error?.message ?? "Gagal mendaftarkan tautan media eksternal.";
        if (json?.error?.fieldErrors?.url) {
          setExtUrlError(String(json.error.fieldErrors.url));
          extUrlInputRef.current?.focus();
        } else {
          setExtSubmitError(msg);
        }
        return;
      }

      setExtUrl("");
      setExtCredit("");
      setExtLicense("");
      setExtUrlError(null);
      setActionMessage(
        `Link eksternal (${parsed.data.providerLabel}) berhasil masuk karantina dengan 0 B konsumsi Storage. Lakukan pemeriksaan manual sebelum publikasi.`
      );
      router.refresh();
    } catch {
      setExtSubmitError(
        "Terjadi gangguan jaringan saat menyimpan tautan eksternal."
      );
    } finally {
      setExtSubmitting(false);
    }
  }

  async function handleFinalizeExisting(asset: AdminMediaAssetItem) {
    if (!isSupabaseLive) return;
    setActionError(null);
    setActionMessage(null);
    setFinalizingId(asset.id);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(`/api/v1/admin/media/${asset.id}/finalize`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ?? "Finalisasi aset karantina gagal."
        );
        return;
      }
      setActionMessage("Aset berhasil difinalisasi di karantina.");
      router.refresh();
    } catch {
      setActionError("Terjadi gangguan jaringan saat finalisasi aset.");
    } finally {
      setFinalizingId(null);
    }
  }

  async function handleCleanupOrphans() {
    if (!isSupabaseLive) return;
    setActionError(null);
    setActionMessage(null);
    setCleaningOrphans(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/media/cleanup", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ?? "Gagal membersihkan unggahan yatim."
        );
        return;
      }
      const deletedCount = Number(json?.data?.deleted_count ?? 0);
      setActionMessage(
        `Pembersihan selesai: ${deletedCount} unggahan karantina yatim (>2 jam) dihapus.`
      );
      router.refresh();
    } catch {
      setActionError("Terjadi gangguan jaringan saat membersihkan yatim.");
    } finally {
      setCleaningOrphans(false);
    }
  }

  function openReviewDialog(asset: AdminMediaAssetItem) {
    setReviewTarget(asset);
    setPreviewExternalInDialog(false);
    setDecision("cleared");
    setRevCredit(asset.credit);
    setRevLicense(
      asset.license ||
        (asset.storage_bucket === "external-link"
          ? "Tautan Resmi / Izin Tayang"
          : "Internal EDMB / CC-BY-NC")
    );
    setCheckedNoLocation(false);
    setCheckedRights(false);
    setAttestedManual(false);
    setRevNotes("");
    setReviewFieldErrors({});
    setReviewSubmitError(null);
    reviewDialogRef.current?.showModal();
  }

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewTarget || !isSupabaseLive) return;
    setReviewSubmitError(null);

    if (decision === "cleared") {
      const creditErr =
        revCredit.trim().length < 2
          ? "Kredit fotografer/sumber minimal 2 karakter wajib diisi."
          : undefined;
      const licenseErr =
        revLicense.trim().length < 2
          ? "Informasi lisensi media minimal 2 karakter wajib diisi."
          : undefined;
      const needsManual = needsManualAttestation(reviewTarget);
      const checklistErr =
        !checkedNoLocation ||
        !checkedRights ||
        (needsManual && !attestedManual)
          ? needsManual
            ? "Centang seluruh kotak pemeriksaan termasuk atestasi manual tautan eksternal/PDF/video (D4)."
            : "Centang seluruh kotak pemeriksaan SEC-17 sebelum meloloskan media."
          : undefined;

      if (creditErr || licenseErr || checklistErr) {
        setReviewFieldErrors({
          credit: creditErr,
          license: licenseErr,
          checklist: checklistErr,
        });
        if (creditErr) creditInputRef.current?.focus();
        else if (licenseErr) licenseInputRef.current?.focus();
        return;
      }
    } else if (revNotes.trim().length < 5) {
      setReviewFieldErrors({
        notes: "Alasan penolakan minimal 5 karakter wajib diisi.",
      });
      notesTextareaRef.current?.focus();
      return;
    }

    setSubmittingReview(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const payload =
        decision === "cleared"
          ? {
              decision: "cleared" as const,
              credit: revCredit.trim(),
              license: revLicense.trim(),
              checked_no_location_leak: checkedNoLocation,
              checked_rights_and_credit: checkedRights,
              attested_manual_scan: attestedManual,
              notes: revNotes.trim(),
            }
          : {
              decision: "rejected" as const,
              notes: revNotes.trim(),
            };

      const res = await fetch(
        `/api/v1/admin/media/${reviewTarget.id}/review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewSubmitError(
          json?.error?.message ?? "Gagal menyimpan keputusan media."
        );
        return;
      }

      reviewDialogRef.current?.close();
      setActionMessage(
        decision === "cleared"
          ? "Aset media dinyatakan bersih dan siap dipakai di konten terkurasi."
          : "Aset media ditolak dan dihapus dari penyimpanan aktif."
      );
      router.refresh();
    } catch {
      setReviewSubmitError("Terjadi gangguan jaringan saat mengirim keputusan.");
    } finally {
      setSubmittingReview(false);
    }
  }

  const targetNeedsManualAttestation = Boolean(
    reviewTarget && needsManualAttestation(reviewTarget)
  );

  const reviewExtInfo =
    reviewTarget && reviewTarget.storage_bucket === "external-link"
      ? detectExternalMediaPreview(reviewTarget.storage_path, reviewTarget.kind)
      : null;

  const extLiveValidation =
    extUrl.trim().length >= 12
      ? parseAndNormalizeExternalMediaUrl(extUrl, extKind)
      : null;

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Sanitasi &amp; Kurasi Aset • Fase 4
          </p>
          <h1>Perpustakaan Media &amp; Karantina</h1>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Alur aman unggah → karantina → hapus metadata EXIF/GPS &amp; cek
            signature → pemeriksaan manusia → publikasi (SEC-17, SEC-19, D4).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSupabaseLive ? (
            <button
              type="button"
              onClick={() => void handleCleanupOrphans()}
              disabled={cleaningOrphans}
              className="btn-secondary min-h-11 text-xs disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              {cleaningOrphans
                ? "Membersihkan..."
                : "Bersihkan Yatim (>2 Jam)"}
            </button>
          ) : null}
          <Link href="/media" className="btn-secondary min-h-11 text-xs">
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            Galeri Publik
          </Link>
        </div>
      </header>

      {/* Banner Peringatan EXIF/GPS & Keterbatasan D4 */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/65 p-4 text-xs font-semibold text-[#6b4400]">
        <ShieldAlert
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-bold text-[#1f2a24]">
            Kebijakan Keamanan Unggahan Media (SEC-17 / SEC-19 / D4)
          </p>
          <p>
            Format unggahan diizinkan: <strong>JPEG, PNG, WebP, PDF, dan MP4</strong>{" "}
            (SVG, HTML, dan ZIP ditolak). Gambar otomatis dikonversi menjadi WebP
            tanpa metadata EXIF/GPS melalui <code>sharp</code>. Untuk hemat
            Storage, admin juga dapat mendaftarkan{" "}
            <strong>Link Eksternal HTTPS (YouTube, Vimeo, Google Drive, atau URL foto/video HTTPS)</strong>{" "}
            dengan konsumsi Storage <strong>0 B</strong>. Berkas PDF, MP4, serta
            link eksternal mewajibkan <strong>atestasi pemeriksaan manual (D4)</strong>{" "}
            sebelum diterbitkan.
          </p>
        </div>
      </div>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Menampilkan sampel aset
          publik bersih serta contoh foto &amp; PDF dalam antrean karantina.
          Unggah berkas, scrub EXIF, dan persetujuan media aktif ketika Supabase
          dikonfigurasi.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0014_admin_media_rpcs.sql</code> dan{" "}
          <code>0015_admin_external_media_rpc.sql</code> sudah dijalankan di
          Supabase SQL Editor.
        </div>
      ) : null}

      {/* Kartu Hitungan Status Media */}
      <section aria-label="Ringkasan Status Media" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <p className="text-xs font-bold text-[#5b6760] uppercase">
            Total Aset
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.total}
          </p>
        </div>
        <div className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/45 p-4">
          <p className="text-xs font-bold text-[#8a5a00] uppercase">
            Karantina
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {counts.quarantine}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2f6b4f]/30 bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold text-[#1f4d38] uppercase">
            Bersih (Cleared)
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f4d38]">
            {counts.cleared}
          </p>
        </div>
        <div className="rounded-2xl border border-[#b42318]/25 bg-[#fde8e6]/60 p-4">
          <p className="text-xs font-bold text-[#b42318] uppercase">Ditolak</p>
          <p className="mt-1 text-2xl font-extrabold text-[#b42318]">
            {counts.rejected}
          </p>
        </div>
      </section>

      {actionMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-4 py-3 text-xs font-bold text-[#166534]"
        >
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{actionMessage}</span>
        </p>
      ) : null}

      {actionError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-4 py-3 text-xs font-bold text-[#b42318]"
        >
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {actionError}</span>
        </p>
      ) : null}

      {/* Panel Unggah Media Baru / Link Eksternal ke Karantina */}
      <section
        aria-labelledby={`${baseId}-upload-heading`}
        className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/60 p-4 sm:p-5"
      >
        <div className="space-y-1">
          <h2
            id={`${baseId}-upload-heading`}
            className="text-base font-bold text-[#1f2a24]"
          >
            {intakeMode === "upload"
              ? "Unggah Berkas Baru ke Karantina"
              : "Tambah Link Media Eksternal ke Karantina (0 B Storage)"}
          </h2>
          <p className="text-xs text-[#3a4640]">
            {intakeMode === "upload"
              ? "Nama berkas acak dibuat otomatis di server. Semua unggahan baru masuk ke bucket privat media-quarantine sebelum pemeriksaan manusia."
              : "Simpan tautan YouTube, Vimeo, Google Drive, atau URL foto/MP4/PDF HTTPS tanpa memakai kuota Storage Supabase. Tetap masuk karantina & butuh atestasi kurator."}
          </p>
        </div>

        <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] bg-white p-3">
          <legend className="px-1 text-xs font-bold text-[#1f2a24]">
            Metode Penambahan Aset Media
          </legend>
          <div className="flex flex-wrap gap-4">
            <div className="inline-flex min-h-11 items-center gap-2">
              <input
                id={`${baseId}-mode-upload`}
                type="radio"
                name="media_intake_mode"
                value="upload"
                checked={intakeMode === "upload"}
                onChange={() => setIntakeMode("upload")}
                className="h-4 w-4 accent-[#1f4d38]"
              />
              <label
                htmlFor={`${baseId}-mode-upload`}
                className="cursor-pointer text-sm font-bold text-[#1f2a24]"
              >
                Unggah Berkas ke Storage
              </label>
            </div>

            <div className="inline-flex min-h-11 items-center gap-2">
              <input
                id={`${baseId}-mode-external`}
                type="radio"
                name="media_intake_mode"
                value="external"
                checked={intakeMode === "external"}
                onChange={() => setIntakeMode("external")}
                className="h-4 w-4 accent-[#1f4d38]"
              />
              <label
                htmlFor={`${baseId}-mode-external`}
                className="cursor-pointer text-sm font-bold text-[#1f4d38]"
              >
                Tambah Link Eksternal (YouTube / Foto HTTPS — Hemat Storage)
              </label>
            </div>
          </div>
        </fieldset>

        {intakeMode === "upload" ? (
          <form
            aria-labelledby={`${baseId}-upload-heading`}
            onSubmit={(e) => void handleUploadSubmit(e)}
            noValidate
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-up-kind`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Jenis Aset Media
                </label>
                <select
                  id={`${baseId}-up-kind`}
                  name="upload_kind"
                  disabled={!isSupabaseLive || uploading}
                  value={uploadKind}
                  onChange={(e) => {
                    setUploadKind(e.target.value as MediaKind);
                    setUploadError(null);
                  }}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                >
                  {MEDIA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MEDIA_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 lg:col-span-2">
                <label
                  htmlFor={`${baseId}-up-file`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Pilih Berkas (Maks {uploadLimitMb} MB){" "}
                  <span aria-hidden="true">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  id={`${baseId}-up-file`}
                  name="upload_file"
                  type="file"
                  required
                  disabled={!isSupabaseLive || uploading}
                  accept={KIND_ALLOWED_MIMES[uploadKind].join(",")}
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] ?? null);
                    setUploadError(null);
                  }}
                  className="min-h-12 w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] file:mr-3 file:rounded-lg file:border-0 file:bg-[#f0f6f0] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#1f4d38] disabled:bg-[#f4f1ea]"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!isSupabaseLive || uploading}
                  className="btn-primary min-h-12 w-full text-xs disabled:opacity-55"
                >
                  <Upload size={15} strokeWidth={1.75} aria-hidden="true" />
                  {uploading ? "Memproses..." : "Unggah ke Karantina"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-up-credit`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Kredit Awal (Opsional, dapat dilengkapi saat review)
                </label>
                <input
                  id={`${baseId}-up-credit`}
                  name="upload_credit"
                  type="text"
                  disabled={!isSupabaseLive || uploading}
                  value={uploadCredit}
                  onChange={(e) => setUploadCredit(e.target.value)}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-up-license`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Lisensi Awal (Opsional)
                </label>
                <input
                  id={`${baseId}-up-license`}
                  name="upload_license"
                  type="text"
                  disabled={!isSupabaseLive || uploading}
                  value={uploadLicense}
                  onChange={(e) => setUploadLicense(e.target.value)}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
              </div>
            </div>

            {uploadProgress ? (
              <p role="status" className="text-xs font-bold text-[#1f4d38]">
                {uploadProgress}
              </p>
            ) : null}

            {uploadError ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-bold text-[#b42318]"
              >
                <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {uploadError}</span>
              </p>
            ) : null}
          </form>
        ) : (
          <form
            aria-labelledby={`${baseId}-upload-heading`}
            onSubmit={(e) => void handleExternalLinkSubmit(e)}
            noValidate
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-ext-kind`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Jenis Aset Media
                </label>
                <select
                  id={`${baseId}-ext-kind`}
                  name="kind"
                  disabled={!isSupabaseLive || extSubmitting}
                  value={extKind}
                  onChange={(e) => {
                    const nextKind = e.target.value as ExternalMediaKind;
                    setExtKind(nextKind);
                    setExtUrlError(null);
                    setExtSubmitError(null);
                  }}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                >
                  {EXTERNAL_MEDIA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {MEDIA_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 lg:col-span-2">
                <label
                  htmlFor={`${baseId}-ext-url`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Tautan Media Eksternal (HTTPS){" "}
                  <span aria-hidden="true">*</span>
                </label>
                <span
                  id={`${baseId}-ext-url-hint`}
                  className="text-[11px] text-[#5b6760]"
                >
                  Format HTTPS: YouTube (youtu.be / watch?v= / shorts/), Vimeo,
                  Google Drive (/file/d/…), atau URL foto/MP4/PDF langsung.
                </span>
                <input
                  ref={extUrlInputRef}
                  id={`${baseId}-ext-url`}
                  name="url"
                  type="url"
                  required
                  disabled={!isSupabaseLive || extSubmitting}
                  value={extUrl}
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="next"
                  aria-invalid={extUrlError ? "true" : "false"}
                  aria-describedby={
                    extUrlError
                      ? `${baseId}-ext-url-hint ${baseId}-ext-url-err`
                      : `${baseId}-ext-url-hint`
                  }
                  onChange={(e) => {
                    setExtUrl(e.target.value);
                    if (extUrlError) setExtUrlError(null);
                    if (extSubmitError) setExtSubmitError(null);
                  }}
                  onBlur={() => {
                    if (extUrl.trim().length > 0) {
                      const check = parseAndNormalizeExternalMediaUrl(
                        extUrl,
                        extKind
                      );
                      setExtUrlError(check.ok ? null : check.message);
                    }
                  }}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
                {extUrlError ? (
                  <p
                    id={`${baseId}-ext-url-err`}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#b42318]"
                  >
                    <AlertCircle
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    <span>Kesalahan: {extUrlError}</span>
                  </p>
                ) : extLiveValidation?.ok ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-[#2f6b4f]/30 bg-[#f0f6f0] px-3 py-2 text-[11px] text-[#1f4d38]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-bold text-[#1f4d38]">
                      <CheckCircle2
                        size={12}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      {extLiveValidation.data.providerLabel}
                    </span>
                    <span className="font-bold">0 B Storage Supabase</span>
                    <code className="break-all text-[#3a4640]">
                      {extLiveValidation.data.normalizedUrl}
                    </code>
                  </div>
                ) : null}
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!isSupabaseLive || extSubmitting}
                  className="btn-primary min-h-12 w-full text-xs disabled:opacity-55"
                >
                  <Link2 size={15} strokeWidth={1.75} aria-hidden="true" />
                  {extSubmitting
                    ? "Menyimpan..."
                    : "Simpan Link ke Karantina"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-ext-credit`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Kredit Pembuat / Kanal (Opsional, dapat dilengkapi saat review)
                </label>
                <input
                  id={`${baseId}-ext-credit`}
                  name="credit"
                  type="text"
                  disabled={!isSupabaseLive || extSubmitting}
                  value={extCredit}
                  onChange={(e) => setExtCredit(e.target.value)}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-ext-license`}
                  className="text-xs font-bold text-[#1f2a24]"
                >
                  Lisensi / Izin Tayang (Opsional)
                </label>
                <input
                  id={`${baseId}-ext-license`}
                  name="license"
                  type="text"
                  disabled={!isSupabaseLive || extSubmitting}
                  value={extLicense}
                  onChange={(e) => setExtLicense(e.target.value)}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
              </div>
            </div>

            {extSubmitError ? (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-xs font-bold text-[#b42318]"
              >
                <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {extSubmitError}</span>
              </p>
            ) : null}
          </form>
        )}
      </section>

      {/* Filter Perpustakaan Media */}
      <search>
        <form
          method="GET"
          action="/admin/media"
          className="grid gap-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4 sm:grid-cols-2 lg:grid-cols-12"
        >
          <div className="flex flex-col gap-1 lg:col-span-4">
            <label
              htmlFor={`${baseId}-flt-q`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Cari Path, Kredit, atau Lisensi
            </label>
            <input
              id={`${baseId}-flt-q`}
              type="search"
              name="q"
              defaultValue={filters.q}
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            />
          </div>

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-flt-status`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Status Karantina
            </label>
            <select
              id={`${baseId}-flt-status`}
              name="status"
              defaultValue={filters.status}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Status</option>
              {MEDIA_SCAN_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {MEDIA_SCAN_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 lg:col-span-3">
            <label
              htmlFor={`${baseId}-flt-kind`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Jenis Aset
            </label>
            <select
              id={`${baseId}-flt-kind`}
              name="kind"
              defaultValue={filters.kind}
              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
            >
              <option value="">Semua Jenis</option>
              {MEDIA_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MEDIA_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-2">
            <button type="submit" className="btn-primary min-h-12 flex-1 text-xs">
              Terapkan
            </button>
            <Link
              href="/admin/media"
              className="btn-secondary min-h-12 text-xs"
            >
              Reset
            </Link>
          </div>
        </form>
      </search>

      {/* Tabel Daftar Aset Media */}
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="table-wrapper"
      >
        <table className="responsive-results-table text-left text-sm">
          <caption
            id={captionId}
            className="pb-3 text-left text-xs font-semibold text-[#5b6760]"
          >
            Daftar aset media pada penyimpanan karantina maupun bucket publik
            terkurasi beserta status EXIF/GPS dan keputusan pemeriksaan manusia.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Pratinjau &amp; Path
              </th>
              <th scope="col" className="py-3 pr-4">
                Jenis &amp; Ukuran
              </th>
              <th scope="col" className="py-3 pr-4">
                Status &amp; EXIF
              </th>
              <th scope="col" className="py-3 pr-4">
                Kredit &amp; Lisensi
              </th>
              <th scope="col" className="py-3">
                Aksi Kurator
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#5b6760]">
                  Tidak ada aset media yang sesuai filter saat ini.
                </td>
              </tr>
            ) : (
              items.map((asset) => {
                const isExternalLink =
                  asset.storage_bucket === "external-link";
                const extInfo = isExternalLink
                  ? detectExternalMediaPreview(asset.storage_path, asset.kind)
                  : null;
                const isImg =
                  asset.mime.startsWith("image/") && asset.preview_url !== null;
                const thumbUrl = isImg
                  ? asset.preview_url
                  : extInfo?.posterUrl ?? null;

                return (
                  <tr
                    key={asset.id}
                    className="border-b border-[#efeae2] align-top"
                  >
                    <th scope="row" className="py-3.5 pr-4 font-normal">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#d6cec1] bg-[#faf6ee]">
                          {thumbUrl ? (
                            <Image
                              src={thumbUrl}
                              alt={`Pratinjau aset ${asset.storage_path}`}
                              width={48}
                              height={48}
                              unoptimized
                              referrerPolicy={
                                isExternalLink ? "no-referrer" : undefined
                              }
                              className="h-12 w-12 object-cover"
                            />
                          ) : asset.mime === "application/pdf" ? (
                            <FileText
                              size={20}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          ) : asset.mime.startsWith("video/") ? (
                            <Film
                              size={20}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          ) : (
                            <ImageIcon
                              size={20}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <code className="block break-all text-xs font-bold text-[#1f2a24]">
                            {asset.storage_path}
                          </code>
                          {isExternalLink && extInfo ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#5b6760]">
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f6f0] px-2 py-0.5 font-bold text-[#1f4d38]">
                                <Link2
                                  size={11}
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                                Link Eksternal (0 B)
                              </span>
                              <span className="inline-flex items-center rounded-full bg-[#efeae2] px-2 py-0.5 font-bold text-[#1f2a24]">
                                {extInfo.providerLabel}
                              </span>
                              <span>({asset.visibility})</span>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-[#5b6760]">
                              Bucket: {asset.storage_bucket} ({asset.visibility})
                            </p>
                          )}
                        </div>
                      </div>
                    </th>
                    <td
                      data-label="Jenis & Ukuran"
                      className="py-3.5 pr-4 text-xs text-[#3a4640]"
                    >
                      <p className="font-bold text-[#1f2a24]">
                        {MEDIA_KIND_LABELS[asset.kind] ?? asset.kind}
                      </p>
                      <p>
                        {asset.mime} • {formatAssetSize(asset)}
                      </p>
                      {asset.width && asset.height ? (
                        <p>
                          {asset.width} × {asset.height} px
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Status & EXIF" className="py-3.5 pr-4">
                      <div className="space-y-1 text-xs">
                        {asset.scan_status === "cleared" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 font-bold text-[#166534]">
                            <CheckCircle2
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {MEDIA_SCAN_LABELS.cleared}
                          </span>
                        ) : asset.scan_status === "rejected" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fde8e6] px-2.5 py-0.5 font-bold text-[#b42318]">
                            <XCircle
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {MEDIA_SCAN_LABELS.rejected}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 font-bold text-[#8a5a00]">
                            <Clock3
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {MEDIA_SCAN_LABELS.quarantine}
                          </span>
                        )}

                        <p className="text-[11px] text-[#3a4640]">
                          {isExternalLink
                            ? asset.scan_status === "cleared"
                              ? "Link eksternal terverifikasi (0 B)"
                              : "Link eksternal: perlu atestasi manual (D4)"
                            : asset.metadata_scrubbed_at
                              ? "EXIF/Metadata bersih"
                              : !asset.is_finalized
                                ? "Menunggu unggah & finalisasi"
                                : asset.kind === "pdf" ||
                                    asset.kind === "video"
                                  ? "Perlu atestasi manual (D4)"
                                  : "Perlu scrub / review"}
                        </p>
                      </div>
                    </td>
                    <td
                      data-label="Kredit & Lisensi"
                      className="py-3.5 pr-4 text-xs text-[#3a4640]"
                    >
                      {asset.credit || asset.license ? (
                        <div>
                          <p className="font-semibold text-[#1f2a24]">
                            {asset.credit || "—"}
                          </p>
                          <p>{asset.license || "—"}</p>
                        </div>
                      ) : (
                        <span className="text-[#8a5a00]">Belum diisi</span>
                      )}
                    </td>
                    <td data-label="Aksi Kurator" className="py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {asset.scan_status === "quarantine" &&
                        !asset.is_finalized &&
                        isSupabaseLive ? (
                          <button
                            type="button"
                            onClick={() => void handleFinalizeExisting(asset)}
                            disabled={finalizingId === asset.id}
                            className="btn-secondary min-h-11 text-xs disabled:opacity-55"
                          >
                            <RefreshCw
                              size={13}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            {finalizingId === asset.id
                              ? "Memfinalisasi..."
                              : "Finalisasi Berkas"}
                          </button>
                        ) : null}

                        {asset.scan_status !== "rejected" ? (
                          <button
                            type="button"
                            disabled={
                              !isSupabaseLive ||
                              (asset.scan_status === "quarantine" &&
                                !asset.is_finalized)
                            }
                            onClick={() => openReviewDialog(asset)}
                            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#2f6b4f] bg-[#f0f6f0] px-3.5 py-1.5 text-xs font-bold text-[#1f4d38] hover:bg-[#e1efe2] disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            <ShieldCheck
                              size={14}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            Periksa &amp; Putuskan
                          </button>
                        ) : (
                          <span className="text-xs text-[#5b6760]">
                            Arsip ditolak
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog Native Pemeriksaan Manusia & Keputusan Clearance */}
      <dialog
        ref={reviewDialogRef}
        aria-labelledby={`${baseId}-review-dialog-title`}
        onClose={() => setPreviewExternalInDialog(false)}
        className="m-auto w-[min(94vw,40rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        {reviewTarget ? (
          <form
            onSubmit={(e) => void handleReviewSubmit(e)}
            noValidate
            className="space-y-4"
          >
            <div className="space-y-1">
              <h2
                id={`${baseId}-review-dialog-title`}
                className="text-lg font-bold text-[#1f2a24]"
              >
                Pemeriksaan Manusia &amp; Keputusan Media
              </h2>
              <p className="break-all text-xs text-[#5b6760]">
                <code>{reviewTarget.storage_path}</code> ({reviewTarget.mime} •{" "}
                {formatAssetSize(reviewTarget)})
              </p>
            </div>

            {reviewTarget.mime.startsWith("image/") &&
            reviewTarget.preview_url ? (
              <div className="overflow-hidden rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-2">
                <Image
                  src={reviewTarget.preview_url}
                  alt="Pratinjau aset media karantina untuk pemeriksaan kurator"
                  width={reviewTarget.width ?? 640}
                  height={reviewTarget.height ?? 360}
                  unoptimized
                  referrerPolicy={reviewExtInfo ? "no-referrer" : undefined}
                  className="mx-auto h-auto max-h-56 w-auto rounded-xl object-contain"
                />
              </div>
            ) : null}

            {reviewExtInfo ? (
              <div className="space-y-3 rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-bold text-[#1f4d38]">
                    <Link2 size={12} strokeWidth={1.75} aria-hidden="true" />
                    {reviewExtInfo.providerLabel} • 0 B Storage
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {reviewExtInfo.normalizedUrl.startsWith("https://") ? (
                      <a
                        href={reviewExtInfo.normalizedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#2f6b4f] bg-white px-3 py-1 font-bold text-[#1f4d38] hover:bg-[#f0f6f0]"
                      >
                        <ExternalLink
                          size={12}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        Buka Tautan di Tab Baru
                      </a>
                    ) : null}
                    {reviewExtInfo.renderMode === "iframe" ||
                    reviewExtInfo.renderMode === "video" ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewExternalInDialog((prev) => !prev)
                        }
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#1f4d38] bg-[#1f4d38] px-3 py-1 font-bold text-white"
                      >
                        <Film size={12} strokeWidth={1.75} aria-hidden="true" />
                        {previewExternalInDialog
                          ? "Tutup Pratinjau"
                          : "Putar Pratinjau"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {previewExternalInDialog &&
                reviewExtInfo.normalizedUrl.startsWith("https://") ? (
                  reviewExtInfo.renderMode === "iframe" ? (
                    <div className="aspect-video w-full overflow-hidden rounded-xl border border-[#d6cec1] bg-black">
                      <iframe
                        src={reviewExtInfo.normalizedUrl}
                        title={`Pratinjau ${reviewExtInfo.providerLabel}`}
                        className="h-full w-full border-0"
                        loading="lazy"
                        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : reviewExtInfo.renderMode === "video" ? (
                    <video
                      src={reviewExtInfo.normalizedUrl}
                      controls
                      preload="none"
                      className="max-h-60 w-full rounded-xl bg-black"
                    />
                  ) : null
                ) : reviewExtInfo.posterUrl ? (
                  <Image
                    src={reviewExtInfo.posterUrl}
                    alt={`Thumbnail ${reviewExtInfo.providerLabel}`}
                    width={480}
                    height={270}
                    unoptimized
                    referrerPolicy="no-referrer"
                    className="mx-auto h-auto max-h-48 w-auto rounded-xl object-contain"
                  />
                ) : null}
              </div>
            ) : null}

            <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
              <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                Keputusan Kurator
              </legend>
              <div className="flex flex-wrap gap-5">
                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-dec-cleared`}
                    type="radio"
                    name="media_decision"
                    value="cleared"
                    checked={decision === "cleared"}
                    onChange={() => {
                      setDecision("cleared");
                      setReviewFieldErrors({});
                    }}
                    className="h-4 w-4 accent-[#1f4d38]"
                  />
                  <label
                    htmlFor={`${baseId}-dec-cleared`}
                    className="text-sm font-bold text-[#166534]"
                  >
                    Tandai Bersih (Cleared)
                  </label>
                </div>

                <div className="inline-flex items-center gap-2">
                  <input
                    id={`${baseId}-dec-rejected`}
                    type="radio"
                    name="media_decision"
                    value="rejected"
                    checked={decision === "rejected"}
                    onChange={() => {
                      setDecision("rejected");
                      setReviewFieldErrors({});
                    }}
                    className="h-4 w-4 accent-[#b42318]"
                  />
                  <label
                    htmlFor={`${baseId}-dec-rejected`}
                    className="text-sm font-bold text-[#b42318]"
                  >
                    Tolak &amp; Hapus (Rejected)
                  </label>
                </div>
              </div>
            </fieldset>

            {decision === "cleared" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${baseId}-rev-credit`}
                      className="text-xs font-bold text-[#1f2a24]"
                    >
                      Kredit Pembuat / Sumber <span aria-hidden="true">*</span>
                    </label>
                    <input
                      ref={creditInputRef}
                      id={`${baseId}-rev-credit`}
                      type="text"
                      required
                      value={revCredit}
                      aria-invalid={reviewFieldErrors.credit ? "true" : "false"}
                      aria-describedby={
                        reviewFieldErrors.credit
                          ? `${baseId}-rev-credit-err`
                          : undefined
                      }
                      onChange={(e) => {
                        setRevCredit(e.target.value);
                        setReviewFieldErrors((prev) => ({
                          ...prev,
                          credit: undefined,
                        }));
                      }}
                      onBlur={() => {
                        if (revCredit.trim().length > 0 && revCredit.trim().length < 2) {
                          setReviewFieldErrors((prev) => ({
                            ...prev,
                            credit: "Kredit minimal 2 karakter.",
                          }));
                        }
                      }}
                      className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                    />
                    {reviewFieldErrors.credit ? (
                      <p
                        id={`${baseId}-rev-credit-err`}
                        className="text-xs font-semibold text-[#b42318]"
                      >
                        Kesalahan: {reviewFieldErrors.credit}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${baseId}-rev-license`}
                      className="text-xs font-bold text-[#1f2a24]"
                    >
                      Lisensi Penggunaan <span aria-hidden="true">*</span>
                    </label>
                    <input
                      ref={licenseInputRef}
                      id={`${baseId}-rev-license`}
                      type="text"
                      required
                      value={revLicense}
                      aria-invalid={
                        reviewFieldErrors.license ? "true" : "false"
                      }
                      aria-describedby={
                        reviewFieldErrors.license
                          ? `${baseId}-rev-license-err`
                          : undefined
                      }
                      onChange={(e) => {
                        setRevLicense(e.target.value);
                        setReviewFieldErrors((prev) => ({
                          ...prev,
                          license: undefined,
                        }));
                      }}
                      onBlur={() => {
                        if (
                          revLicense.trim().length > 0 &&
                          revLicense.trim().length < 2
                        ) {
                          setReviewFieldErrors((prev) => ({
                            ...prev,
                            license: "Lisensi minimal 2 karakter.",
                          }));
                        }
                      }}
                      className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                    />
                    {reviewFieldErrors.license ? (
                      <p
                        id={`${baseId}-rev-license-err`}
                        className="text-xs font-semibold text-[#b42318]"
                      >
                        Kesalahan: {reviewFieldErrors.license}
                      </p>
                    ) : null}
                  </div>
                </div>

                <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] bg-[#faf6ee]/70 p-3">
                  <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                    Daftar Periksa Keamanan &amp; Kurasi (SEC-17)
                  </legend>

                  <div className="flex items-start gap-2">
                    <input
                      id={`${baseId}-chk-loc`}
                      type="checkbox"
                      checked={checkedNoLocation}
                      onChange={(e) => {
                        setCheckedNoLocation(e.target.checked);
                        setReviewFieldErrors((prev) => ({
                          ...prev,
                          checklist: undefined,
                        }));
                      }}
                      className="mt-0.5 h-4 w-4 accent-[#1f4d38]"
                    />
                    <label
                      htmlFor={`${baseId}-chk-loc`}
                      className="text-xs font-semibold text-[#1f2a24]"
                    >
                      Tidak memuat landmark, plang jalan, atau petunjuk lokasi
                      presisi situs yang sensitif (SEC-17).
                    </label>
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      id={`${baseId}-chk-rights`}
                      type="checkbox"
                      checked={checkedRights}
                      onChange={(e) => {
                        setCheckedRights(e.target.checked);
                        setReviewFieldErrors((prev) => ({
                          ...prev,
                          checklist: undefined,
                        }));
                      }}
                      className="mt-0.5 h-4 w-4 accent-[#1f4d38]"
                    />
                    <label
                      htmlFor={`${baseId}-chk-rights`}
                      className="text-xs font-semibold text-[#1f2a24]"
                    >
                      Kredit, hak pakai, serta kelayakan visual untuk siswa SD
                      kelas III–IV sudah terverifikasi.
                    </label>
                  </div>

                  {targetNeedsManualAttestation ? (
                    <div className="flex items-start gap-2 rounded-lg border border-[#8a5a00]/30 bg-[#fbefcf]/70 p-2">
                      <input
                        id={`${baseId}-chk-manual`}
                        type="checkbox"
                        checked={attestedManual}
                        onChange={(e) => {
                          setAttestedManual(e.target.checked);
                          setReviewFieldErrors((prev) => ({
                            ...prev,
                            checklist: undefined,
                          }));
                        }}
                        className="mt-0.5 h-4 w-4 accent-[#8a5a00]"
                      />
                      <label
                        htmlFor={`${baseId}-chk-manual`}
                        className="text-xs font-bold text-[#6b4400]"
                      >
                        {reviewExtInfo
                          ? "Atestasi Manual Link Eksternal (D4): Tautan telah dibuka dan diperiksa layak untuk siswa SD, bebas iklan/konten berbahaya serta tidak membocorkan lokasi situs sensitif."
                          : "Atestasi Manual PDF/Video (D4): Berkas telah diperiksa secara manual bebas dari tautan berbahaya maupun kebocoran metadata tersembunyi."}
                      </label>
                    </div>
                  ) : null}

                  {reviewFieldErrors.checklist ? (
                    <p className="text-xs font-semibold text-[#b42318]">
                      Kesalahan: {reviewFieldErrors.checklist}
                    </p>
                  ) : null}
                </fieldset>
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-rev-notes`}
                className="text-xs font-bold text-[#1f2a24]"
              >
                {decision === "rejected"
                  ? "Alasan Penolakan (Wajib minimal 5 karakter)"
                  : "Catatan Pemeriksaan (Opsional)"}
              </label>
              <textarea
                ref={notesTextareaRef}
                id={`${baseId}-rev-notes`}
                rows={2}
                required={decision === "rejected"}
                value={revNotes}
                aria-invalid={reviewFieldErrors.notes ? "true" : "false"}
                aria-describedby={
                  reviewFieldErrors.notes ? `${baseId}-rev-notes-err` : undefined
                }
                onChange={(e) => {
                  setRevNotes(e.target.value);
                  setReviewFieldErrors((prev) => ({ ...prev, notes: undefined }));
                }}
                className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
              />
              {reviewFieldErrors.notes ? (
                <p
                  id={`${baseId}-rev-notes-err`}
                  className="text-xs font-semibold text-[#b42318]"
                >
                  Kesalahan: {reviewFieldErrors.notes}
                </p>
              ) : null}
            </div>

            {reviewSubmitError ? (
              <p
                role="alert"
                className="rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {reviewSubmitError}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => reviewDialogRef.current?.close()}
                className="btn-secondary min-h-12 text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className={
                  decision === "rejected"
                    ? "inline-flex min-h-12 items-center justify-center rounded-full bg-[#b42318] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#912018] disabled:opacity-60"
                    : "btn-primary min-h-12 text-xs disabled:opacity-60"
                }
              >
                {submittingReview
                  ? "Menyimpan..."
                  : decision === "cleared"
                    ? "Konfirmasi Bersih"
                    : "Tolak & Hapus Berkas"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </main>
  );
}
