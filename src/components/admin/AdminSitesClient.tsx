"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  MapPin,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  BANYUWANGI_AREA_PRESETS,
  hasAtMostTwoDecimalDigitsString,
  hasAtMostTwoDecimals,
  isWithinBanyuwangiRoughBounds,
  projectBanyuwangiSchematic,
  type BanyuwangiAreaPreset,
} from "@/modules/admin/site-location";
import type {
  AdminSiteLocationItem,
  AdminSiteLocationReviewOption,
} from "@/modules/admin/site-location-service";
import { REVISION_STATUS_LABELS } from "@/modules/admin/state-machine";

export interface AdminSitesClientProps {
  items: AdminSiteLocationItem[];
  initialRevisionId: string | null;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

interface LocationFormFields {
  areaLabel: string;
  displayLat: string;
  displayLon: string;
  precisionLabel: string;
  displayZoomMax: string;
  clearanceReviewId: string;
}

function buildInitialFields(
  item: AdminSiteLocationItem | null
): LocationFormFields {
  if (!item) {
    return {
      areaLabel: "",
      displayLat: "-8.22",
      displayLon: "114.21",
      precisionLabel: "Perkiraan wilayah umum",
      displayZoomMax: "11",
      clearanceReviewId: "",
    };
  }
  return {
    areaLabel: item.site_location?.area_label ?? "",
    displayLat:
      item.site_location !== null
        ? String(item.site_location.display_lat)
        : "-8.22",
    displayLon:
      item.site_location !== null
        ? String(item.site_location.display_lon)
        : "114.21",
    precisionLabel:
      item.site_location?.precision_label ?? "Perkiraan wilayah umum",
    displayZoomMax: String(item.site_location?.display_zoom_max ?? 11),
    clearanceReviewId:
      item.site_location?.clearance_review_id ??
      item.approved_location_reviews[0]?.id ??
      "",
  };
}

export function AdminSitesClient({
  items,
  initialRevisionId,
  mode,
  migrationPending,
}: AdminSitesClientProps) {
  const router = useRouter();
  const baseId = useId();
  const captionId = `${baseId}-sites-caption`;

  const initialSelected =
    items.find((i) => i.revision_id === initialRevisionId) ?? items[0] ?? null;

  const [selectedRevisionId, setSelectedRevisionId] = useState<string>(
    initialSelected?.revision_id ?? ""
  );
  const selectedItem =
    items.find((i) => i.revision_id === selectedRevisionId) ??
    initialSelected ??
    null;

  const [fields, setFields] = useState<LocationFormFields>(() =>
    buildInitialFields(initialSelected)
  );
  const [fieldErrors, setFieldErrors] = useState<{
    areaLabel?: string;
    displayLat?: string;
    displayLon?: string;
    precisionLabel?: string;
    clearanceReviewId?: string;
  }>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Quick clearance review state
  const [addedReviewsByRev, setAddedReviewsByRev] = useState<
    Record<string, AdminSiteLocationReviewOption[]>
  >({});
  const [reviewerLabel, setReviewerLabel] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const [reviewSubmitErr, setReviewSubmitErr] = useState<string | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  // Delete location dialog
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const areaInputRef = useRef<HTMLInputElement>(null);
  const latInputRef = useRef<HTMLInputElement>(null);
  const lonInputRef = useRef<HTMLInputElement>(null);
  const precisionInputRef = useRef<HTMLInputElement>(null);
  const clearanceSelectRef = useRef<HTMLSelectElement>(null);
  const reviewerInputRef = useRef<HTMLInputElement>(null);

  const isSupabaseLive = mode === "supabase";
  const isRevisionLocationMutable = Boolean(
    selectedItem &&
      (selectedItem.status === "draft" || selectedItem.status === "in_review")
  );
  const canEdit = isSupabaseLive && isRevisionLocationMutable;

  const mergedLocationReviews = (() => {
    if (!selectedItem) return [];
    const merged = [...selectedItem.approved_location_reviews];
    const extras = addedReviewsByRev[selectedItem.revision_id] ?? [];
    for (const ex of extras) {
      if (!merged.some((m) => m.id === ex.id)) {
        merged.unshift(ex);
      }
    }
    return merged;
  })();

  function handleSelectRevision(item: AdminSiteLocationItem) {
    setSelectedRevisionId(item.revision_id);
    setFields(buildInitialFields(item));
    setFieldErrors({});
    setSaveMessage(null);
    setSaveError(null);
    setReviewerError(null);
    setReviewSubmitErr(null);
  }

  function applyPreset(preset: BanyuwangiAreaPreset) {
    if (!canEdit) return;
    setFields((prev) => ({
      ...prev,
      areaLabel: preset.area_label,
      displayLat: String(preset.display_lat),
      displayLon: String(preset.display_lon),
      displayZoomMax: String(preset.display_zoom_max),
      precisionLabel: preset.precision_label,
    }));
    setFieldErrors((prev) => ({
      ...prev,
      areaLabel: undefined,
      displayLat: undefined,
      displayLon: undefined,
      precisionLabel: undefined,
    }));
  }

  function validateArea(val: string): string | undefined {
    const trimmed = val.trim();
    if (trimmed.length < 2) return "Label wilayah umum minimal 2 karakter.";
    if (trimmed.length > 120) return "Label wilayah umum maksimal 120 karakter.";
    return undefined;
  }

  function validateLat(val: string): string | undefined {
    const trimmed = val.trim();
    if (!trimmed) return "Lintang wilayah wajib diisi.";
    if (!hasAtMostTwoDecimalDigitsString(trimmed)) {
      return "SEC-16: Lintang publik maksimal 2 angka di belakang koma (contoh: -8.22).";
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || !hasAtMostTwoDecimals(num) || num < -12 || num > 8) {
      return "Lintang harus angka valid antara -12 dan 8 dengan maksimal 2 desimal.";
    }
    return undefined;
  }

  function validateLon(val: string): string | undefined {
    const trimmed = val.trim();
    if (!trimmed) return "Bujur wilayah wajib diisi.";
    if (!hasAtMostTwoDecimalDigitsString(trimmed)) {
      return "SEC-16: Bujur publik maksimal 2 angka di belakang koma (contoh: 114.21).";
    }
    const num = Number(trimmed);
    if (
      !Number.isFinite(num) ||
      !hasAtMostTwoDecimals(num) ||
      num < 94 ||
      num > 142
    ) {
      return "Bujur harus angka valid antara 94 dan 142 dengan maksimal 2 desimal.";
    }
    return undefined;
  }

  function validatePrecision(val: string): string | undefined {
    const trimmed = val.trim();
    if (trimmed.length < 3) return "Label perkiraan minimal 3 karakter.";
    if (trimmed.length > 80) return "Label perkiraan maksimal 80 karakter.";
    return undefined;
  }

  async function handleQuickLocationReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem || !canEdit) return;
    setReviewSubmitErr(null);

    if (reviewerLabel.trim().length < 2) {
      setReviewerError("Nama/peran penelaah lokasi minimal 2 karakter.");
      reviewerInputRef.current?.focus();
      return;
    }

    setSavingReview(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${selectedItem.revision_id}/reviews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            review_type: "location",
            reviewer_label: reviewerLabel.trim(),
            decision: "approved",
            notes:
              reviewerNotes.trim() ||
              "Disetujui untuk koordinat perkiraan wilayah umum (SEC-16).",
          }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewSubmitErr(
          json?.error?.message ?? "Gagal mencatat validasi lokasi."
        );
        return;
      }

      const createdId = String(json?.data?.id ?? "");
      if (createdId) {
        const revOption: AdminSiteLocationReviewOption = {
          id: createdId,
          reviewer_label: reviewerLabel.trim(),
          reviewed_at: String(json?.data?.reviewed_at ?? new Date().toISOString()),
          notes:
            reviewerNotes.trim() ||
            "Disetujui untuk koordinat perkiraan wilayah umum (SEC-16).",
        };
        setAddedReviewsByRev((prev) => ({
          ...prev,
          [selectedItem.revision_id]: [
            revOption,
            ...(prev[selectedItem.revision_id] ?? []),
          ],
        }));
        setFields((prev) => ({ ...prev, clearanceReviewId: createdId }));
        setFieldErrors((prev) => ({ ...prev, clearanceReviewId: undefined }));
      }
      setReviewerLabel("");
      setReviewerNotes("");
      setSaveMessage(
        "Clearance lokasi disetujui tercatat. Lanjutkan dengan menyimpan koordinat wilayah umum di Langkah 2."
      );
      router.refresh();
    } catch {
      setReviewSubmitErr("Terjadi gangguan jaringan saat mencatat clearance.");
    } finally {
      setSavingReview(false);
    }
  }

  async function handleSaveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem || !canEdit) return;

    setSaveError(null);
    setSaveMessage(null);

    const areaErr = validateArea(fields.areaLabel);
    const latErr = validateLat(fields.displayLat);
    const lonErr = validateLon(fields.displayLon);
    const precErr = validatePrecision(fields.precisionLabel);
    const clearErr = !fields.clearanceReviewId
      ? "Wajib memilih catatan clearance lokasi yang sudah disetujui (Langkah 1)."
      : undefined;

    if (areaErr || latErr || lonErr || precErr || clearErr) {
      setFieldErrors({
        areaLabel: areaErr,
        displayLat: latErr,
        displayLon: lonErr,
        precisionLabel: precErr,
        clearanceReviewId: clearErr,
      });
      if (areaErr) areaInputRef.current?.focus();
      else if (latErr) latInputRef.current?.focus();
      else if (lonErr) lonInputRef.current?.focus();
      else if (precErr) precisionInputRef.current?.focus();
      else if (clearErr) clearanceSelectRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${selectedItem.revision_id}/location`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            area_label: fields.areaLabel.trim(),
            display_lat: Number(fields.displayLat.trim()),
            display_lon: Number(fields.displayLon.trim()),
            precision_label: fields.precisionLabel.trim(),
            display_zoom_max: Number.parseInt(fields.displayZoomMax, 10),
            clearance_review_id: fields.clearanceReviewId,
          }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(
          json?.error?.message ?? "Gagal menyimpan lokasi wilayah umum."
        );
        return;
      }

      setSaveMessage(
        "Lokasi wilayah umum berhasil disimpan sesuai batasan keamanan SEC-16."
      );
      router.refresh();
    } catch {
      setSaveError("Terjadi gangguan jaringan saat menyimpan lokasi.");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteDialog() {
    setDeleteError(null);
    deleteDialogRef.current?.showModal();
  }

  async function handleConfirmDeleteLocation() {
    if (!selectedItem || !canEdit) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${selectedItem.revision_id}/location`,
        {
          method: "DELETE",
          headers: {
            "X-CSRF-Token": csrf,
          },
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDeleteError(
          json?.error?.message ?? "Gagal menghapus lokasi publik."
        );
        return;
      }
      deleteDialogRef.current?.close();
      setFields((prev) => ({ ...prev, areaLabel: "" }));
      setSaveMessage("Data lokasi publik pada revisi ini telah dilepas.");
      router.refresh();
    } catch {
      setDeleteError("Terjadi gangguan jaringan saat menghapus lokasi.");
    } finally {
      setDeleting(false);
    }
  }

  const totalSites = items.length;
  const clearedCount = items.filter(
    (i) => i.clearance_status === "cleared"
  ).length;
  const pendingCount = totalSites - clearedCount;

  const parsedPreviewLat = Number(fields.displayLat.trim());
  const parsedPreviewLon = Number(fields.displayLon.trim());
  const hasValidPreviewPoint =
    Number.isFinite(parsedPreviewLat) &&
    Number.isFinite(parsedPreviewLon) &&
    parsedPreviewLat >= -12 &&
    parsedPreviewLat <= 8 &&
    parsedPreviewLon >= 94 &&
    parsedPreviewLon <= 142;

  const previewOutsideBanyuwangi =
    hasValidPreviewPoint &&
    !isWithinBanyuwangiRoughBounds(parsedPreviewLat, parsedPreviewLon);

  const otherClearedSites = items.filter(
    (i) =>
      i.revision_id !== selectedItem?.revision_id &&
      i.site_location !== null &&
      i.clearance_status === "cleared"
  );

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-[0.06em] text-[#1f4d38] uppercase">
            Keamanan Peta Publik • Fase 3 (SEC-16)
          </p>
          <h1>Situs &amp; Peta Wilayah Umum</h1>
          <p className="max-w-[68ch] text-sm text-[#3a4640]">
            Atur perkiraan wilayah umum dan tautan clearance ahli lokasi untuk
            entri situs megalitik tanpa menyimpan atau mengirim koordinat presisi.
          </p>
        </div>

        <Link href="/jelajah-situs" className="btn-secondary min-h-11 text-xs">
          <ExternalLink size={15} strokeWidth={1.75} aria-hidden="true" />
          Lihat Peta Publik
        </Link>
      </header>

      {/* Banner Pengaman SEC-16 */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/65 p-4 text-xs font-semibold text-[#6b4400]">
        <ShieldAlert
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-bold text-[#1f2a24]">
            Standar Perlindungan Lokasi Cagar Budaya (SEC-16)
          </p>
          <p>
            Koordinat publik dibatasi maksimal 2 angka di belakang koma (±1,1 km),
            zoom peta publik dibatasi pada skala wilayah umum (8–13), dan setiap
            lokasi wajib tertaut ke catatan validasi <code>location</code> yang
            disetujui kurator.
          </p>
        </div>
      </div>

      {mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Menampilkan sampel
          revisi situs terbit dan draf internal beserta pratinjau petanya. Simpan
          atau hapus lokasi memerlukan koneksi Supabase aktif.
        </div>
      ) : null}

      {migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0013_admin_site_locations_rpcs.sql</code> sudah dijalankan di
          Supabase SQL Editor.
        </div>
      ) : null}

      {/* Kartu Ringkasan Situs */}
      <section aria-label="Ringkasan Clearance Situs" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#d6cec1] bg-[#faf6ee] p-4">
          <p className="text-xs font-bold text-[#5b6760] uppercase">
            Total Revisi Situs
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {totalSites}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2f6b4f]/30 bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold text-[#1f4d38] uppercase">
            Clearance Wilayah Lengkap
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f4d38]">
            {clearedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[#d6cec1] bg-[#fbefcf]/45 p-4">
          <p className="text-xs font-bold text-[#8a5a00] uppercase">
            Belum Clearance / Lokasi
          </p>
          <p className="mt-1 text-2xl font-extrabold text-[#1f2a24]">
            {pendingCount}
          </p>
        </div>
      </section>

      {/* Tabel Daftar Revisi Situs */}
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
            Daftar seluruh revisi konten jenis <code>site</code> beserta
            perkiraan wilayah umum dan status clearance lokasinya.
          </caption>
          <thead>
            <tr className="border-b border-[#d6cec1] text-xs font-bold text-[#1f2a24] uppercase">
              <th scope="col" className="py-3 pr-4">
                Situs &amp; Versi
              </th>
              <th scope="col" className="py-3 pr-4">
                Status Revisi
              </th>
              <th scope="col" className="py-3 pr-4">
                Wilayah Umum (2 Desimal)
              </th>
              <th scope="col" className="py-3 pr-4">
                Clearance Lokasi
              </th>
              <th scope="col" className="py-3">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[#5b6760]">
                  Belum ada konten jenis situs (<code>site</code>) yang tercatat.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const isSelected = selectedItem?.revision_id === item.revision_id;
                return (
                  <tr
                    key={item.revision_id}
                    className={
                      isSelected
                        ? "border-b border-[#efeae2] bg-[#f0f6f0]/60 align-top"
                        : "border-b border-[#efeae2] align-top"
                    }
                  >
                    <th scope="row" className="py-3.5 pr-4 font-normal">
                      <p className="font-bold text-[#1f2a24]">{item.title}</p>
                      <p className="text-xs text-[#5b6760]">
                        <code>{item.slug}</code> • v{item.version_no} •{" "}
                        {item.heritage_type}
                        {item.is_live_published ? (
                          <span className="ml-2 inline-block rounded bg-[#dcfce7] px-1.5 py-0.5 font-bold text-[#166534]">
                            Live Publik
                          </span>
                        ) : null}
                      </p>
                    </th>
                    <td data-label="Status Revisi" className="py-3.5 pr-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#efeae2] px-2.5 py-1 text-xs font-bold text-[#1f2a24]">
                        {REVISION_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td
                      data-label="Wilayah Umum (2 Desimal)"
                      className="py-3.5 pr-4 text-xs text-[#3a4640]"
                    >
                      {item.site_location ? (
                        <div>
                          <p className="font-bold text-[#1f2a24]">
                            {item.site_location.area_label}
                          </p>
                          <p>
                            {item.site_location.display_lat},{" "}
                            {item.site_location.display_lon} • Zoom ≤{" "}
                            {item.site_location.display_zoom_max}
                          </p>
                        </div>
                      ) : (
                        <span className="font-semibold text-[#8a5a00]">
                          Belum diatur
                        </span>
                      )}
                    </td>
                    <td data-label="Clearance Lokasi" className="py-3.5 pr-4">
                      {item.clearance_status === "cleared" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-bold text-[#166534]">
                          <CheckCircle2
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Lolos Clearance
                        </span>
                      ) : item.clearance_status === "review_ready_no_location" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#d8eef0] px-2.5 py-1 text-xs font-bold text-[#0e6f7a]">
                          <MapPin
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Review Ada • Isi Wilayah
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-1 text-xs font-bold text-[#8a5a00]">
                          <Clock3
                            size={14}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Perlu Review Lokasi
                        </span>
                      )}
                    </td>
                    <td data-label="Aksi" className="py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectRevision(item)}
                          aria-pressed={isSelected}
                          className={
                            isSelected
                              ? "inline-flex min-h-11 items-center rounded-full border border-[#2f6b4f] bg-[#1f4d38] px-3.5 py-1.5 text-xs font-bold text-white"
                              : "inline-flex min-h-11 items-center rounded-full border border-[#2f6b4f] bg-[#f0f6f0] px-3.5 py-1.5 text-xs font-bold text-[#1f4d38] hover:bg-[#e1efe2]"
                          }
                        >
                          {isSelected ? "Sedang Dipilih" : "Pilih / Atur Lokasi"}
                        </button>
                        <Link
                          href={`/admin/konten/${item.content_id}/revisi/${item.revision_id}`}
                          className="inline-flex min-h-11 items-center rounded-full border border-[#d6cec1] bg-white px-3 py-1.5 text-xs font-bold text-[#1f2a24] no-underline hover:bg-[#faf6ee]"
                        >
                          Editor Konten
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Editor 2 Kolom: Form Lokasi (Kiri) + Pratinjau Peta Umum Publik (Kanan) */}
      {selectedItem ? (
        <div className="grid gap-6 border-t border-[#efeae2] pt-6 lg:grid-cols-12 lg:items-start">
          {/* Kolom Kiri: Langkah Clearance + Form SEC-16 */}
          <div className="min-w-0 space-y-5 lg:col-span-7">
            <div className="space-y-1">
              <p className="text-xs font-bold tracking-[0.05em] text-[#1f4d38] uppercase">
                Revisi Terpilih
              </p>
              <h2 className="text-lg font-bold text-[#1f2a24]">
                {selectedItem.title} (v{selectedItem.version_no} •{" "}
                {REVISION_STATUS_LABELS[selectedItem.status]})
              </h2>
            </div>

            {isSupabaseLive && !isRevisionLocationMutable ? (
              <div
                role="status"
                className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#1f2a24]"
              >
                <strong>Revisi Immutable (ADR-05):</strong> Lokasi pada revisi
                berstatus{" "}
                <strong>{REVISION_STATUS_LABELS[selectedItem.status]}</strong>{" "}
                tidak dapat diubah langsung.{" "}
                <Link
                  href={`/admin/konten/${selectedItem.content_id}/revisi/${selectedItem.revision_id}`}
                  className="font-bold text-[#1f4d38] underline"
                >
                  Buka Editor Konten untuk membuat revisi baru (v+1)
                </Link>
                .
              </div>
            ) : null}

            {saveMessage ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-3.5 py-2.5 text-xs font-bold text-[#166534]"
              >
                <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{saveMessage}</span>
              </p>
            ) : null}

            {saveError ? (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-3.5 py-2.5 text-xs font-bold text-[#b42318]"
              >
                <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {saveError}</span>
              </p>
            ) : null}

            {/* Langkah 1: Catat review location bila belum tersedia */}
            {canEdit && mergedLocationReviews.length === 0 ? (
              <form
                onSubmit={(e) => void handleQuickLocationReview(e)}
                noValidate
                className="space-y-3 rounded-2xl border border-[#8a5a00]/35 bg-[#fbefcf]/45 p-4"
              >
                <h3 className="text-sm font-bold text-[#1f2a24]">
                  Langkah 1: Catat Persetujuan Penelaah Lokasi
                </h3>
                <p className="text-xs text-[#3a4640]">
                  Revisi ini belum memiliki catatan review bertipe{" "}
                  <code>location</code> berstatus <code>approved</code>. Catat
                  persetujuan penelaah lokasi terlebih dahulu agar formulir
                  wilayah umum di bawah dapat ditautkan.
                </p>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-loc-reviewer`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Nama / Peran Penelaah Lokasi <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={reviewerInputRef}
                    id={`${baseId}-loc-reviewer`}
                    type="text"
                    required
                    value={reviewerLabel}
                    aria-invalid={reviewerError ? "true" : "false"}
                    aria-describedby={
                      reviewerError ? `${baseId}-loc-reviewer-err` : undefined
                    }
                    onChange={(e) => {
                      setReviewerLabel(e.target.value);
                      setReviewerError(null);
                    }}
                    onBlur={() => {
                      if (
                        reviewerLabel.trim().length > 0 &&
                        reviewerLabel.trim().length < 2
                      ) {
                        setReviewerError("Nama/peran penelaah minimal 2 karakter.");
                      }
                    }}
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                  />
                  {reviewerError ? (
                    <p
                      id={`${baseId}-loc-reviewer-err`}
                      className="text-xs font-semibold text-[#b42318]"
                    >
                      Kesalahan: {reviewerError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-loc-review-notes`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Catatan Clearance Lokasi (Opsional)
                  </label>
                  <textarea
                    id={`${baseId}-loc-review-notes`}
                    rows={2}
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
                  />
                </div>

                {reviewSubmitErr ? (
                  <p role="alert" className="text-xs font-bold text-[#b42318]">
                    Kesalahan: {reviewSubmitErr}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={savingReview}
                  className="btn-secondary min-h-11 text-xs disabled:opacity-60"
                >
                  <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
                  {savingReview
                    ? "Mencatat Clearance..."
                    : "Catat Clearance Lokasi (Approved)"}
                </button>
              </form>
            ) : null}

            {/* Langkah 2: Form Lokasi Wilayah Umum */}
            <form
              onSubmit={(e) => void handleSaveLocation(e)}
              noValidate
              className="space-y-4 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
            >
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#1f2a24]">
                  Pengaturan Wilayah Umum &amp; Titik Representatif (SEC-16)
                </h3>
                <p className="text-xs text-[#5b6760]">
                  Pilih salah satu preset wilayah Banyuwangi atau masukkan
                  koordinat perkiraan dengan maksimal 2 angka di belakang koma.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#1f2a24]">
                  Preset Titik Wilayah Banyuwangi:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BANYUWANGI_AREA_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => applyPreset(preset)}
                      className="min-h-10 rounded-full border border-[#d6cec1] bg-[#faf6ee] px-3 py-1 text-xs font-bold text-[#1f2a24] hover:border-[#2f6b4f] hover:bg-[#f0f6f0] disabled:opacity-55"
                    >
                      {preset.id.slice(0, 1).toUpperCase() + preset.id.slice(1)} (
                      {preset.display_lat}, {preset.display_lon})
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-area-label`}
                  className="text-sm font-bold text-[#1f2a24]"
                >
                  Label Wilayah Umum (<code>area_label</code>){" "}
                  <span aria-hidden="true">*</span>
                </label>
                <span
                  id={`${baseId}-area-label-hint`}
                  className="text-xs text-[#5b6760]"
                >
                  Contoh: Wilayah Barat Banyuwangi (Perkiraan Kecamatan).
                </span>
                <input
                  ref={areaInputRef}
                  id={`${baseId}-area-label`}
                  name="area_label"
                  type="text"
                  required
                  disabled={!canEdit}
                  value={fields.areaLabel}
                  aria-invalid={fieldErrors.areaLabel ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.areaLabel
                      ? `${baseId}-area-label-hint ${baseId}-area-label-err`
                      : `${baseId}-area-label-hint`
                  }
                  onChange={(e) => {
                    setFields((prev) => ({ ...prev, areaLabel: e.target.value }));
                    setFieldErrors((prev) => ({ ...prev, areaLabel: undefined }));
                  }}
                  onBlur={() =>
                    setFieldErrors((prev) => ({
                      ...prev,
                      areaLabel: validateArea(fields.areaLabel),
                    }))
                  }
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
                />
                {fieldErrors.areaLabel ? (
                  <p
                    id={`${baseId}-area-label-err`}
                    className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
                  >
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Kesalahan: {fieldErrors.areaLabel}</span>
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-lat`}
                    className="text-sm font-bold text-[#1f2a24]"
                  >
                    Lintang Publik (<code>display_lat</code>){" "}
                    <span aria-hidden="true">*</span>
                  </label>
                  <span
                    id={`${baseId}-lat-hint`}
                    className="text-xs text-[#5b6760]"
                  >
                    Maksimal 2 desimal (contoh: -8.22).
                  </span>
                  <input
                    ref={latInputRef}
                    id={`${baseId}-lat`}
                    name="display_lat"
                    type="text"
                    inputMode="decimal"
                    required
                    disabled={!canEdit}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={fields.displayLat}
                    aria-invalid={fieldErrors.displayLat ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.displayLat
                        ? `${baseId}-lat-hint ${baseId}-lat-err`
                        : `${baseId}-lat-hint`
                    }
                    onChange={(e) => {
                      setFields((prev) => ({
                        ...prev,
                        displayLat: e.target.value,
                      }));
                      setFieldErrors((prev) => ({
                        ...prev,
                        displayLat: undefined,
                      }));
                    }}
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        displayLat: validateLat(fields.displayLat),
                      }))
                    }
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
                  />
                  {fieldErrors.displayLat ? (
                    <p
                      id={`${baseId}-lat-err`}
                      className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
                    >
                      <AlertCircle
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>Kesalahan: {fieldErrors.displayLat}</span>
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-lon`}
                    className="text-sm font-bold text-[#1f2a24]"
                  >
                    Bujur Publik (<code>display_lon</code>){" "}
                    <span aria-hidden="true">*</span>
                  </label>
                  <span
                    id={`${baseId}-lon-hint`}
                    className="text-xs text-[#5b6760]"
                  >
                    Maksimal 2 desimal (contoh: 114.21).
                  </span>
                  <input
                    ref={lonInputRef}
                    id={`${baseId}-lon`}
                    name="display_lon"
                    type="text"
                    inputMode="decimal"
                    required
                    disabled={!canEdit}
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={fields.displayLon}
                    aria-invalid={fieldErrors.displayLon ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.displayLon
                        ? `${baseId}-lon-hint ${baseId}-lon-err`
                        : `${baseId}-lon-hint`
                    }
                    onChange={(e) => {
                      setFields((prev) => ({
                        ...prev,
                        displayLon: e.target.value,
                      }));
                      setFieldErrors((prev) => ({
                        ...prev,
                        displayLon: undefined,
                      }));
                    }}
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        displayLon: validateLon(fields.displayLon),
                      }))
                    }
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
                  />
                  {fieldErrors.displayLon ? (
                    <p
                      id={`${baseId}-lon-err`}
                      className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
                    >
                      <AlertCircle
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span>Kesalahan: {fieldErrors.displayLon}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-precision`}
                    className="text-sm font-bold text-[#1f2a24]"
                  >
                    Label Tingkat Perkiraan <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={precisionInputRef}
                    id={`${baseId}-precision`}
                    name="precision_label"
                    type="text"
                    required
                    disabled={!canEdit}
                    value={fields.precisionLabel}
                    aria-invalid={fieldErrors.precisionLabel ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.precisionLabel
                        ? `${baseId}-precision-err`
                        : undefined
                    }
                    onChange={(e) => {
                      setFields((prev) => ({
                        ...prev,
                        precisionLabel: e.target.value,
                      }));
                      setFieldErrors((prev) => ({
                        ...prev,
                        precisionLabel: undefined,
                      }));
                    }}
                    onBlur={() =>
                      setFieldErrors((prev) => ({
                        ...prev,
                        precisionLabel: validatePrecision(fields.precisionLabel),
                      }))
                    }
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
                  />
                  {fieldErrors.precisionLabel ? (
                    <p
                      id={`${baseId}-precision-err`}
                      className="text-xs font-semibold text-[#b42318]"
                    >
                      Kesalahan: {fieldErrors.precisionLabel}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-zoom`}
                    className="text-sm font-bold text-[#1f2a24]"
                  >
                    Zoom Maksimal Publik (8–13)
                  </label>
                  <select
                    id={`${baseId}-zoom`}
                    name="display_zoom_max"
                    disabled={!canEdit}
                    value={fields.displayZoomMax}
                    onChange={(e) =>
                      setFields((prev) => ({
                        ...prev,
                        displayZoomMax: e.target.value,
                      }))
                    }
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
                  >
                    {[8, 9, 10, 11, 12, 13].map((z) => (
                      <option key={z} value={z}>
                        Zoom maksimal {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${baseId}-clearance-id`}
                  className="text-sm font-bold text-[#1f2a24]"
                >
                  Catatan Validasi Lokasi (<code>clearance_review_id</code>){" "}
                  <span aria-hidden="true">*</span>
                </label>
                <select
                  ref={clearanceSelectRef}
                  id={`${baseId}-clearance-id`}
                  name="clearance_review_id"
                  disabled={!canEdit}
                  value={fields.clearanceReviewId}
                  aria-invalid={
                    fieldErrors.clearanceReviewId ? "true" : "false"
                  }
                  aria-describedby={
                    fieldErrors.clearanceReviewId
                      ? `${baseId}-clearance-err`
                      : undefined
                  }
                  onChange={(e) => {
                    setFields((prev) => ({
                      ...prev,
                      clearanceReviewId: e.target.value,
                    }));
                    setFieldErrors((prev) => ({
                      ...prev,
                      clearanceReviewId: undefined,
                    }));
                  }}
                  className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                >
                  {mergedLocationReviews.length === 0 ? (
                    <option value="">
                      Belum ada review location yang disetujui
                    </option>
                  ) : (
                    mergedLocationReviews.map((lr) => (
                      <option key={lr.id} value={lr.id}>
                        [Approved] {lr.reviewer_label} ({lr.id.slice(0, 8)}…)
                      </option>
                    ))
                  )}
                </select>
                {fieldErrors.clearanceReviewId ? (
                  <p
                    id={`${baseId}-clearance-err`}
                    className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
                  >
                    <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Kesalahan: {fieldErrors.clearanceReviewId}</span>
                  </p>
                ) : null}
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  {selectedItem.site_location ? (
                    <button
                      type="button"
                      onClick={openDeleteDialog}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#b42318] bg-[#fde8e6] px-4 py-2 text-xs font-bold text-[#b42318] hover:bg-[#fbd5d1]"
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      Lepas Data Lokasi
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary min-h-12 text-xs disabled:opacity-60"
                  >
                    <Save size={15} strokeWidth={1.75} aria-hidden="true" />
                    {saving ? "Menyimpan..." : "Simpan Lokasi Wilayah Umum"}
                  </button>
                </div>
              ) : null}
            </form>
          </div>

          {/* Kolom Kanan: Pratinjau Tampilan Peta Publik SEC-16 */}
          <aside className="min-w-0 space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/70 p-4 sm:p-5 lg:col-span-5">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#1f2a24]">
                Pratinjau Peta Wilayah Umum Publik
              </h3>
              <p className="text-xs text-[#3a4640]">
                Simulasi proyeksi skematis identik dengan{" "}
                <code>/jelajah-situs</code>. Lingkaran terakota menunjukkan
                perkiraan wilayah revisi terpilih.
              </p>
            </div>

            {previewOutsideBanyuwangi ? (
              <p
                role="status"
                className="flex items-center gap-1.5 rounded-xl border border-[#8a5a00]/30 bg-[#fbefcf] px-3 py-2 text-xs font-semibold text-[#8a5a00]"
              >
                <ShieldAlert
                  size={15}
                  strokeWidth={1.75}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Koordinat di luar perkiraan kotak wilayah Banyuwangi (-8.8..-7.8,
                  113.8..114.7) dan akan dijepit ke tepi pratinjau.
                </span>
              </p>
            ) : null}

            <svg
              viewBox="0 0 600 380"
              role="img"
              aria-label="Pratinjau peta skematis perkiraan wilayah umum Banyuwangi"
              className="h-auto w-full rounded-2xl border border-[#d6cec1] bg-[#d8eef0]"
            >
              <path
                d="M110 70 Q280 40 430 95 L490 210 Q450 320 340 345 L170 325 Q95 245 110 70 Z"
                fill="#f0f6f0"
                stroke="#4a8a68"
                strokeWidth="3"
              />
              {otherClearedSites.map((other) => {
                if (!other.site_location) return null;
                const { x, y } = projectBanyuwangiSchematic(
                  other.site_location.display_lat,
                  other.site_location.display_lon
                );
                return (
                  <g key={other.revision_id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={32}
                      fill="rgba(47, 107, 79, 0.22)"
                      stroke="#1f4d38"
                      strokeWidth="2"
                      strokeDasharray="6 4"
                    />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill="#1f2a24"
                    >
                      {other.heritage_type}
                    </text>
                  </g>
                );
              })}

              {hasValidPreviewPoint ? (
                (() => {
                  const { x, y } = projectBanyuwangiSchematic(
                    parsedPreviewLat,
                    parsedPreviewLon
                  );
                  return (
                    <g>
                      <circle
                        cx={x}
                        cy={y}
                        r={42}
                        fill="rgba(210, 106, 60, 0.34)"
                        stroke="#8f3d1b"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                      />
                      <text
                        x={x}
                        y={y + 4}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="800"
                        fill="#1f2a24"
                      >
                        {selectedItem.heritage_type}
                      </text>
                    </g>
                  );
                })()
              ) : null}
            </svg>

            <dl className="space-y-1.5 rounded-xl border border-[#d6cec1] bg-white p-3 text-xs text-[#3a4640]">
              <div className="flex justify-between gap-2">
                <dt className="font-bold text-[#1f2a24]">Label Wilayah:</dt>
                <dd className="text-right">
                  {fields.areaLabel.trim() || "Belum diisi"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-bold text-[#1f2a24]">Titik Perkiraan:</dt>
                <dd>
                  {hasValidPreviewPoint
                    ? `${parsedPreviewLat}, ${parsedPreviewLon}`
                    : "Koordinat belum valid"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-bold text-[#1f2a24]">Tingkat Perkiraan:</dt>
                <dd>{fields.precisionLabel.trim() || "Perkiraan wilayah umum"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-bold text-[#1f2a24]">Batas Zoom Publik:</dt>
                <dd>Maksimal {fields.displayZoomMax}</dd>
              </div>
            </dl>
          </aside>
        </div>
      ) : null}

      {/* Dialog Native Konfirmasi Hapus Lokasi */}
      <dialog
        ref={deleteDialogRef}
        aria-labelledby={`${baseId}-del-dialog-title`}
        className="m-auto w-[min(94vw,32rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <div className="space-y-4">
          <h2
            id={`${baseId}-del-dialog-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            Lepas Data Lokasi Wilayah Umum?
          </h2>
          <p className="text-sm text-[#3a4640]">
            Revisi <strong>{selectedItem?.title}</strong> akan kehilangan data{" "}
            <code>site_public_locations</code> dan tidak dapat lolos gate
            publikasi sampai lokasi wilayah umum diisi kembali.
          </p>

          {deleteError ? (
            <p
              role="alert"
              className="rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              Kesalahan: {deleteError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              onClick={() => deleteDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void handleConfirmDeleteLocation()}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#b42318] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#912018] disabled:opacity-60"
            >
              {deleting ? "Menghapus..." : "Ya, Lepas Lokasi"}
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
