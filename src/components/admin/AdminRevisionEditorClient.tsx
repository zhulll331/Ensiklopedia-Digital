"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CopyPlus,
  ExternalLink,
  FileCheck2,
  Link2,
  Plus,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { AdminStructuredFields } from "@/components/admin/AdminStructuredFields";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import { validateStructuredContent } from "@/modules/admin/cms-schemas";
import type {
  AdminRevisionDetail,
  AdminRevisionLinkRow,
  AdminRevisionMediaRow,
  AdminRevisionSourceRow,
  AdminSourceOption,
} from "@/modules/admin/cms-service";
import {
  CONTENT_KIND_LABELS,
  REVISION_STATUS_LABELS,
  REVISION_WORKFLOW_STEPS,
  getAllowedTransitionActions,
  type TransitionActionSpec,
} from "@/modules/admin/state-machine";
import {
  isRevisionMutable,
  type PublishGateResult,
} from "@/modules/content/publish-gate";
import type { ContentKind, ReviewType } from "@/modules/content/types";

export interface AdminRevisionEditorClientProps {
  detail: AdminRevisionDetail;
}

const REVIEW_TYPE_LABELS: Record<ReviewType, string> = {
  language: "Bahasa III–IV",
  material: "Materi & Substansi",
  media: "Media & Aset",
  location: "Clearance Lokasi",
};

const SOURCE_TYPE_OPTIONS = [
  { value: "report", label: "Laporan Survei / Kajian" },
  { value: "book", label: "Buku Referensi" },
  { value: "journal", label: "Jurnal Ilmiah" },
  { value: "archive", label: "Arsip Resmi" },
  { value: "expert_note", label: "Catatan Ahli" },
  { value: "regulation", label: "Regulasi / SK" },
] as const;

const MEDIA_ROLE_OPTIONS = [
  "cover",
  "hero",
  "inline",
  "gallery",
  "poster",
  "caption_vtt",
  "download",
] as const;

const RELATION_TYPE_OPTIONS = [
  { value: "related_glossary", label: "Glosarium Terkait" },
  { value: "related_site", label: "Situs Terkait" },
  { value: "book_chapter", label: "Bagian Bab Buku" },
  { value: "related_worksheet", label: "LKPD Terkait" },
  { value: "related_quiz", label: "Kuis Terkait" },
] as const;

function sanitizeStructuredArrays(
  kind: ContentKind,
  bodyJson: Record<string, unknown>,
  metadataJson: Record<string, unknown>
): {
  body_json: Record<string, unknown>;
  metadata_json: Record<string, unknown>;
} {
  const cleanArr = (val: unknown) =>
    Array.isArray(val)
      ? val
          .filter((item): item is string => typeof item === "string")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  switch (kind) {
    case "chapter":
      return {
        body_json: { paragraphs: cleanArr(bodyJson.paragraphs) },
        metadata_json: {
          order:
            typeof metadataJson.order === "number" ? metadataJson.order : 1,
          reading_minutes:
            typeof metadataJson.reading_minutes === "number"
              ? metadataJson.reading_minutes
              : 4,
          glossary_slugs: cleanArr(metadataJson.glossary_slugs),
          preservation_note: String(metadataJson.preservation_note ?? "").trim(),
        },
      };
    case "site":
      return {
        body_json: {
          child_narration: cleanArr(bodyJson.child_narration),
          scientific_context: cleanArr(bodyJson.scientific_context),
        },
        metadata_json: {
          heritage_type: String(metadataJson.heritage_type ?? "Menhir").trim(),
          preservation_warning: String(
            metadataJson.preservation_warning ?? ""
          ).trim(),
        },
      };
    case "video":
      return {
        body_json: { transcript: cleanArr(bodyJson.transcript) },
        metadata_json: {
          duration_label: String(metadataJson.duration_label ?? "02:00").trim(),
          poster_src: String(metadataJson.poster_src ?? "").trim(),
          poster_alt: String(metadataJson.poster_alt ?? "").trim(),
          captions_available: Boolean(metadataJson.captions_available),
          video_url: String(metadataJson.video_url ?? "").trim(),
        },
      };
    case "glossary":
      return {
        body_json: {
          definition: String(bodyJson.definition ?? "").trim(),
          context_example: String(bodyJson.context_example ?? "").trim(),
        },
        metadata_json: {
          related_chapter_slug: String(
            metadataJson.related_chapter_slug ?? ""
          ).trim(),
        },
      };
    case "book":
    case "guide":
    case "worksheet":
      return {
        body_json: {
          objectives: cleanArr(bodyJson.objectives),
          steps: cleanArr(bodyJson.steps),
        },
        metadata_json: {
          duration_minutes:
            typeof metadataJson.duration_minutes === "number"
              ? metadataJson.duration_minutes
              : null,
          file_label: String(metadataJson.file_label ?? "Dokumen PDF").trim(),
          file_size_label: String(
            metadataJson.file_size_label ?? "Belum diunggah"
          ).trim(),
          version_label: String(
            metadataJson.version_label ?? "Draf 0.1"
          ).trim(),
        },
      };
    case "page":
    case "news":
      return {
        body_json: { paragraphs: cleanArr(bodyJson.paragraphs) },
        metadata_json: {
          section_label: String(metadataJson.section_label ?? "").trim(),
          published_date_label: String(
            metadataJson.published_date_label ?? ""
          ).trim(),
        },
      };
  }
}

export function AdminRevisionEditorClient({
  detail,
}: AdminRevisionEditorClientProps) {
  const router = useRouter();
  const baseId = useId();

  const isSupabaseLive = detail.mode === "supabase";
  const canEditDraft = isSupabaseLive && isRevisionMutable(detail.status);
  const canRecordReview =
    isSupabaseLive &&
    detail.status !== "published" &&
    detail.status !== "archived";

  // State konten draf yang disunting
  const [title, setTitle] = useState(detail.title);
  const [summary, setSummary] = useState(detail.summary);
  const [targetGrades, setTargetGrades] = useState<Array<3 | 4>>(
    detail.target_grades
  );
  const [bodyJson, setBodyJson] = useState<Record<string, unknown>>(
    detail.body_json
  );
  const [metadataJson, setMetadataJson] = useState<Record<string, unknown>>(
    detail.metadata_json
  );
  const [sources, setSources] = useState<AdminRevisionSourceRow[]>(
    detail.sources
  );
  const [mediaLinks, setMediaLinks] = useState<AdminRevisionMediaRow[]>(
    detail.media
  );
  const [contentLinks, setContentLinks] = useState<AdminRevisionLinkRow[]>(
    detail.links
  );
  const [availableSources, setAvailableSources] = useState<AdminSourceOption[]>(
    detail.available_sources
  );
  const [publishGate, setPublishGate] = useState<PublishGateResult>(
    detail.publish_gate
  );

  // State validasi & status simpan draf
  const [titleError, setTitleError] = useState<string | null>(null);
  const [gradesError, setGradesError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  // State kontrol tambah relasi side panel
  const [selectedSourceId, setSelectedSourceId] = useState(
    detail.available_sources[0]?.id ?? ""
  );
  const [showNewSourceForm, setShowNewSourceForm] = useState(false);
  const [newSrcCitation, setNewSrcCitation] = useState("");
  const [newSrcType, setNewSrcType] = useState<string>("report");
  const [newSrcUrl, setNewSrcUrl] = useState("");
  const [newSrcErr, setNewSrcErr] = useState<string | null>(null);
  const [creatingSource, setCreatingSource] = useState(false);

  const [selectedMediaId, setSelectedMediaId] = useState(
    detail.available_media[0]?.id ?? ""
  );
  const [selectedMediaRole, setSelectedMediaRole] = useState<string>("cover");

  const [selectedLinkTargetId, setSelectedLinkTargetId] = useState(
    detail.available_link_targets[0]?.id ?? ""
  );
  const [selectedRelationType, setSelectedRelationType] =
    useState<string>("related_glossary");

  // State catatan validasi kurator
  const [reviewType, setReviewType] = useState<ReviewType>("language");
  const [reviewerLabel, setReviewerLabel] = useState("");
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<
    "approved" | "changes_requested" | "rejected"
  >("approved");
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);
  const [reviewSubmitError, setReviewSubmitError] = useState<string | null>(
    null
  );

  // State dialog transisi status & dialog publikasi
  const transitionDialogRef = useRef<HTMLDialogElement>(null);
  const publishDialogRef = useRef<HTMLDialogElement>(null);
  const reasonTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [pendingTransition, setPendingTransition] =
    useState<TransitionActionSpec | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionReasonErr, setTransitionReasonErr] = useState<string | null>(
    null
  );
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionNeedsReauth, setTransitionNeedsReauth] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishNeedsReauth, setPublishNeedsReauth] = useState(false);

  const transitionActions = getAllowedTransitionActions(detail.status);

  function toggleGrade(grade: 3 | 4) {
    if (!canEditDraft) return;
    setGradesError(null);
    setTargetGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  }

  async function handleSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditDraft) return;

    setSaveError(null);
    setSaveMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError("Judul revisi wajib diisi.");
      document.getElementById(`${baseId}-title`)?.focus();
      return;
    }
    if (targetGrades.length === 0) {
      setGradesError("Pilih minimal satu kelas sasaran (Kelas III atau IV).");
      return;
    }

    const cleaned = sanitizeStructuredArrays(
      detail.kind,
      bodyJson,
      metadataJson
    );
    const structured = validateStructuredContent(
      detail.kind,
      cleaned.body_json,
      cleaned.metadata_json
    );
    if (!structured.ok) {
      setSaveError(structured.message);
      return;
    }

    setSavingDraft(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(`/api/v1/admin/revisions/${detail.revision_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          summary: summary.trim(),
          target_grades: [...targetGrades].sort((a, b) => a - b),
          body_json: structured.body_json,
          metadata_json: structured.metadata_json,
          sources: sources.map((s) => ({
            source_id: s.source_id,
            locator: s.locator.trim(),
            note: s.note.trim(),
          })),
          media: mediaLinks.map((m, idx) => ({
            asset_id: m.asset_id,
            role: m.role,
            alt_text: m.alt_text.trim(),
            caption: m.caption.trim(),
            sort_order: idx,
          })),
          links: contentLinks.map((l, idx) => ({
            target_content_id: l.target_content_id,
            relation_type: l.relation_type,
            sort_order: idx,
          })),
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(json?.error?.message ?? "Gagal menyimpan draf revisi.");
        return;
      }

      const updated = json?.data as AdminRevisionDetail | undefined;
      if (updated) {
        setBodyJson(updated.body_json);
        setMetadataJson(updated.metadata_json);
        setSources(updated.sources);
        setMediaLinks(updated.media);
        setContentLinks(updated.links);
        setPublishGate(updated.publish_gate);
      }

      setSaveMessage(
        "Draf, relasi sumber, dan media berhasil disimpan ke database."
      );
      router.refresh();
    } catch {
      setSaveError("Terjadi gangguan jaringan saat menyimpan draf.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleCloneNewRevision() {
    if (!isSupabaseLive) return;
    setCloning(true);
    setSaveError(null);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/contents/${detail.content_id}/revisions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ source_revision_id: detail.revision_id }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(json?.error?.message ?? "Gagal membuat revisi baru.");
        return;
      }
      const nextRevId = String(json?.data?.revision_id ?? "");
      if (nextRevId) {
        router.push(`/admin/konten/${detail.content_id}/revisi/${nextRevId}`);
      }
    } catch {
      setSaveError("Gagal menghubungi server saat membuat revisi baru.");
    } finally {
      setCloning(false);
    }
  }

  function handleAttachSelectedSource() {
    const src = availableSources.find((s) => s.id === selectedSourceId);
    if (!src) return;
    setSources((prev) => [
      ...prev,
      {
        source_id: src.id,
        citation_text: src.citation_text,
        source_type: src.source_type,
        url: src.url,
        locator: "",
        note: "",
      },
    ]);
  }

  async function handleCreateNewSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewSrcErr(null);
    if (newSrcCitation.trim().length < 3) {
      setNewSrcErr("Teks sitasi sumber minimal 3 karakter.");
      return;
    }
    setCreatingSource(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch("/api/v1/admin/sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          citation_text: newSrcCitation.trim(),
          source_type: newSrcType,
          url: newSrcUrl.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNewSrcErr(
          json?.error?.message ?? "Gagal menambahkan sumber rujukan baru."
        );
        return;
      }

      const created = json?.data as AdminSourceOption;
      setAvailableSources((prev) => [...prev, created]);
      setSelectedSourceId(created.id);
      setSources((prev) => [
        ...prev,
        {
          source_id: created.id,
          citation_text: created.citation_text,
          source_type: created.source_type,
          url: created.url,
          locator: "",
          note: "",
        },
      ]);
      setNewSrcCitation("");
      setNewSrcUrl("");
      setShowNewSourceForm(false);
      setSaveMessage(
        "Sumber baru ditambahkan ke draf lokal; klik 'Simpan Draf' untuk menautkannya."
      );
    } catch {
      setNewSrcErr("Gagal menghubungi server saat menambah sumber.");
    } finally {
      setCreatingSource(false);
    }
  }

  function handleAttachMedia() {
    const asset = detail.available_media.find((m) => m.id === selectedMediaId);
    if (!asset) return;
    setMediaLinks((prev) => [
      ...prev,
      {
        asset_id: asset.id,
        role: selectedMediaRole,
        alt_text: "",
        caption: "",
        sort_order: prev.length,
        storage_path: asset.storage_path,
        scan_status: asset.scan_status,
        metadata_scrubbed: asset.metadata_scrubbed,
        asset_kind: asset.kind,
      },
    ]);
  }

  function handleAttachContentLink() {
    const target = detail.available_link_targets.find(
      (t) => t.id === selectedLinkTargetId
    );
    if (!target) return;
    const duplicate = contentLinks.some(
      (l) =>
        l.target_content_id === target.id &&
        l.relation_type === selectedRelationType
    );
    if (duplicate) return;
    setContentLinks((prev) => [
      ...prev,
      {
        target_content_id: target.id,
        target_slug: target.slug,
        target_kind: target.kind,
        target_title: target.title,
        relation_type: selectedRelationType,
        sort_order: prev.length,
      },
    ]);
  }

  async function executeTransition(
    action: TransitionActionSpec,
    reason?: string
  ) {
    setTransitioning(true);
    setTransitionError(null);
    setTransitionNeedsReauth(false);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${detail.revision_id}/transition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            expected_status: detail.status,
            next_status: action.nextStatus,
            ...(reason ? { reason } : {}),
          }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = String(
          json?.error?.message ?? "Gagal mengubah status revisi."
        );
        if (
          res.status === 403 &&
          msg.toLowerCase().includes("verifikasi ulang")
        ) {
          setTransitionNeedsReauth(true);
        }
        setTransitionError(msg);
        if (!action.needsDialog) {
          setSaveError(msg);
        }
        return;
      }

      transitionDialogRef.current?.close();
      setPendingTransition(null);
      setTransitionReason("");
      router.refresh();
    } catch {
      const msg = "Terjadi gangguan jaringan saat mengubah status revisi.";
      setTransitionError(msg);
      if (!action.needsDialog) setSaveError(msg);
    } finally {
      setTransitioning(false);
    }
  }

  function handleTransitionClick(action: TransitionActionSpec) {
    if (!isSupabaseLive) return;
    if (!action.needsDialog) {
      void executeTransition(action);
      return;
    }
    setPendingTransition(action);
    setTransitionReason("");
    setTransitionReasonErr(null);
    setTransitionError(null);
    setTransitionNeedsReauth(false);
    transitionDialogRef.current?.showModal();
  }

  async function handleTransitionDialogSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!pendingTransition) return;

    const trimmedReason = transitionReason.trim();
    if (pendingTransition.needsReason && trimmedReason.length < 5) {
      setTransitionReasonErr(
        "Alasan transisi minimal 5 karakter wajib diisi sebelum melanjutkan."
      );
      reasonTextareaRef.current?.focus();
      return;
    }

    await executeTransition(pendingTransition, trimmedReason);
  }

  async function handleReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRecordReview) return;

    setReviewFeedback(null);
    setReviewSubmitError(null);
    if (reviewerLabel.trim().length < 2) {
      setReviewerError("Nama/label penelaah minimal 2 karakter.");
      document.getElementById(`${baseId}-reviewer-label`)?.focus();
      return;
    }

    setSubmittingReview(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${detail.revision_id}/reviews`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            review_type: reviewType,
            reviewer_label: reviewerLabel.trim(),
            decision: reviewDecision,
            notes: reviewNotes.trim(),
          }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewSubmitError(
          json?.error?.message ?? "Gagal mencatat validasi kurator."
        );
        return;
      }

      setReviewerLabel("");
      setReviewNotes("");
      setReviewerError(null);
      setReviewFeedback("Catatan validasi berhasil disimpan.");
      router.refresh();
    } catch {
      setReviewSubmitError(
        "Terjadi gangguan jaringan saat mengirim catatan validasi."
      );
    } finally {
      setSubmittingReview(false);
    }
  }

  function openPublishDialog() {
    setPublishError(null);
    setPublishNeedsReauth(false);
    publishDialogRef.current?.showModal();
  }

  async function handleConfirmPublish() {
    setPublishing(true);
    setPublishError(null);
    setPublishNeedsReauth(false);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/revisions/${detail.revision_id}/publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({ confirm_publish: true }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = String(
          json?.error?.message ?? "Gagal memublikasikan revisi."
        );
        if (
          res.status === 403 &&
          msg.toLowerCase().includes("verifikasi ulang")
        ) {
          setPublishNeedsReauth(true);
        }
        setPublishError(msg);
        return;
      }

      publishDialogRef.current?.close();
      router.refresh();
    } catch {
      setPublishError(
        "Terjadi gangguan jaringan saat memublikasikan revisi."
      );
    } finally {
      setPublishing(false);
    }
  }

  const latestReviewByType = new Map<
    ReviewType,
    AdminRevisionDetail["reviews"][number]
  >();
  for (const revRec of detail.reviews) {
    if (!latestReviewByType.has(revRec.review_type)) {
      latestReviewByType.set(revRec.review_type, revRec);
    }
  }

  const currentStepIdx = REVISION_WORKFLOW_STEPS.indexOf(detail.status);

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      {/* Header Revisi & Navigasi Versi */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#efeae2] pb-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-[#f0f6f0] px-2.5 py-0.5 text-[#1f4d38]">
              {CONTENT_KIND_LABELS[detail.kind]}
            </span>
            <span className="rounded-full bg-[#efeae2] px-2.5 py-0.5 text-[#1f2a24]">
              Versi {detail.version_no} •{" "}
              {REVISION_STATUS_LABELS[detail.status]}
            </span>
            {detail.published_revision_id === detail.revision_id ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[#166534]">
                <CheckCircle2 size={13} strokeWidth={1.75} aria-hidden="true" />
                Live Publik
              </span>
            ) : null}
          </div>

          <h1 className="break-words">{title || detail.title}</h1>
          <p className="text-xs text-[#5b6760]">
            Slug: <code>{detail.slug}</code>
          </p>

          {detail.sibling_revisions.length > 1 ? (
            <nav aria-label="Pilih Versi Revisi" className="pt-1">
              <ul className="flex flex-wrap list-none gap-1.5 p-0 text-xs">
                {detail.sibling_revisions.map((sr) => {
                  const active = sr.revision_id === detail.revision_id;
                  return (
                    <li key={sr.revision_id}>
                      <Link
                        href={`/admin/konten/${detail.content_id}/revisi/${sr.revision_id}`}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "inline-flex min-h-9 items-center rounded-lg border border-[#2f6b4f] bg-[#1f4d38] px-2.5 py-1 font-bold text-white no-underline"
                            : "inline-flex min-h-9 items-center rounded-lg border border-[#d6cec1] bg-[#faf6ee] px-2.5 py-1 font-semibold text-[#1f2a24] no-underline hover:bg-[#efeae2]"
                        }
                      >
                        v{sr.version_no} ({REVISION_STATUS_LABELS[sr.status]})
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSupabaseLive ? (
            <button
              type="button"
              onClick={() => void handleCloneNewRevision()}
              disabled={cloning}
              className="btn-secondary min-h-11 text-xs disabled:opacity-60"
            >
              <CopyPlus size={15} strokeWidth={1.75} aria-hidden="true" />
              {cloning ? "Menyalin..." : "Buat Revisi Baru (v+1)"}
            </button>
          ) : null}
          <Link href="/admin/konten" className="btn-secondary min-h-11 text-xs">
            <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
            Daftar Konten
          </Link>
        </div>
      </header>

      {/* Banner Status Demo atau Immutability ADR-05 */}
      {!isSupabaseLive ? (
        <div
          role="status"
          className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/60 p-4 text-sm text-[#6b4400]"
        >
          <strong>Pratinjau Mode Demo Lokal (Baca-Saja):</strong> Bidang
          terstruktur, relasi sumber, dan checklist gate ditampilkan dalam mode
          baca-saja karena Supabase tidak sedang aktif.
        </div>
      ) : !canEditDraft ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#1f2a24]"
        >
          <p>
            <strong>Revisi Bersifat Immutable (ADR-05):</strong> Revisi dengan
            status <strong>{REVISION_STATUS_LABELS[detail.status]}</strong>{" "}
            tidak dapat diubah langsung. Untuk mengubah isi, sumber, atau media,
            buat salinan draf revisi baru.
          </p>
          <button
            type="button"
            onClick={() => void handleCloneNewRevision()}
            disabled={cloning}
            className="btn-primary min-h-11 text-xs"
          >
            <CopyPlus size={15} strokeWidth={1.75} aria-hidden="true" />
            Buat Revisi Baru (v+1)
          </button>
        </div>
      ) : null}

      {/* Stepper Alur Status & Tombol Transisi */}
      <section
        aria-labelledby={`${baseId}-workflow-heading`}
        className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/70 p-4 sm:p-5"
      >
        <h2
          id={`${baseId}-workflow-heading`}
          className="text-base font-bold text-[#1f2a24]"
        >
          Alur Status Revisi
        </h2>

        <ol className="grid grid-cols-2 gap-2 list-none p-0 sm:grid-cols-5">
          {REVISION_WORKFLOW_STEPS.map((step, idx) => {
            const isCurrent = step === detail.status;
            const isDone =
              detail.status !== "archived" &&
              currentStepIdx > idx &&
              step !== "archived";
            return (
              <li
                key={step}
                aria-current={isCurrent ? "step" : undefined}
                className={
                  isCurrent
                    ? "flex items-center gap-2 rounded-xl border-2 border-[#1f4d38] bg-[#f0f6f0] px-3 py-2 text-xs font-extrabold text-[#1f4d38]"
                    : isDone
                      ? "flex items-center gap-2 rounded-xl border border-[#2f6b4f]/40 bg-white px-3 py-2 text-xs font-bold text-[#166534]"
                      : "flex items-center gap-2 rounded-xl border border-[#d6cec1] bg-white px-3 py-2 text-xs font-semibold text-[#5b6760]"
                }
              >
                {isDone ? (
                  <CheckCircle2
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <Clock3 size={14} strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>
                  {idx + 1}. {REVISION_STATUS_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>

        {transitionActions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {transitionActions.map((action) => (
              <button
                key={action.nextStatus}
                type="button"
                disabled={!isSupabaseLive || transitioning}
                onClick={() => handleTransitionClick(action)}
                className={
                  action.variant === "primary"
                    ? "btn-primary min-h-11 text-xs disabled:opacity-55"
                    : action.variant === "danger"
                      ? "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#b42318] bg-[#fde8e6] px-4 py-2 text-xs font-bold text-[#b42318] hover:bg-[#fbd5d1] disabled:opacity-55"
                      : "btn-secondary min-h-11 text-xs disabled:opacity-55"
                }
              >
                <Send size={14} strokeWidth={1.75} aria-hidden="true" />
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs font-semibold text-[#5b6760]">
            Revisi berada pada status final <strong>Arsip</strong>. Buat revisi
            baru (v+1) bila ingin menerbitkan ulang item ini.
          </p>
        )}
      </section>

      {/* Grid Utama: Editor Konten Terstruktur (Kiri) + Panel Samping (Kanan) */}
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Kolom Kiri: Form Editor Draf Terstruktur */}
        <div className="min-w-0 space-y-6 lg:col-span-7">
          <form
            aria-labelledby={`${baseId}-editor-heading`}
            onSubmit={(e) => void handleSaveDraft(e)}
            noValidate
            className="space-y-5 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id={`${baseId}-editor-heading`}
                className="text-base font-bold text-[#1f2a24]"
              >
                Editor Isi Terstruktur ({CONTENT_KIND_LABELS[detail.kind]})
              </h2>
              {canEditDraft ? (
                <button
                  type="submit"
                  disabled={savingDraft}
                  className="btn-primary min-h-11 text-xs disabled:opacity-60"
                >
                  <Save size={15} strokeWidth={1.75} aria-hidden="true" />
                  {savingDraft ? "Menyimpan..." : "Simpan Draf"}
                </button>
              ) : null}
            </div>

            {saveMessage ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-3 py-2 text-xs font-bold text-[#166534]"
              >
                <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{saveMessage}</span>
              </p>
            ) : null}

            {saveError ? (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-3 py-2 text-xs font-bold text-[#b42318]"
              >
                <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Kesalahan: {saveError}</span>
              </p>
            ) : null}

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-title`}
                className="text-sm font-bold text-[#1f2a24]"
              >
                Judul Revisi <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${baseId}-title`}
                name="title"
                type="text"
                required
                disabled={!canEditDraft}
                value={title}
                aria-invalid={titleError ? "true" : "false"}
                aria-describedby={titleError ? `${baseId}-title-err` : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleError(null);
                }}
                onBlur={() => {
                  if (canEditDraft && !title.trim()) {
                    setTitleError("Judul revisi wajib diisi.");
                  }
                }}
                className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-[#1f2a24] disabled:bg-[#f4f1ea]"
              />
              {titleError ? (
                <p
                  id={`${baseId}-title-err`}
                  className="flex items-center gap-1 text-xs font-semibold text-[#b42318]"
                >
                  <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Kesalahan: {titleError}</span>
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-summary`}
                className="text-sm font-bold text-[#1f2a24]"
              >
                Ringkasan Materi
              </label>
              <textarea
                id={`${baseId}-summary`}
                name="summary"
                rows={2}
                disabled={!canEditDraft}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
              />
            </div>

            <fieldset className="space-y-2 rounded-xl border border-[#d6cec1] p-3">
              <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                Kelas Sasaran
              </legend>
              <div className="flex flex-wrap gap-5">
                {([3, 4] as const).map((grade) => (
                  <div key={grade} className="inline-flex items-center gap-2">
                    <input
                      id={`${baseId}-ed-grade-${grade}`}
                      type="checkbox"
                      disabled={!canEditDraft}
                      checked={targetGrades.includes(grade)}
                      onChange={() => toggleGrade(grade)}
                      className="h-5 w-5 accent-[#1f4d38]"
                    />
                    <label
                      htmlFor={`${baseId}-ed-grade-${grade}`}
                      className="text-sm font-semibold text-[#1f2a24]"
                    >
                      Kelas {grade === 3 ? "III" : "IV"}
                    </label>
                  </div>
                ))}
              </div>
              {gradesError ? (
                <p className="flex items-center gap-1 text-xs font-semibold text-[#b42318]">
                  <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Kesalahan: {gradesError}</span>
                </p>
              ) : null}
            </fieldset>

            <AdminStructuredFields
              revisionId={detail.revision_id}
              kind={detail.kind}
              bodyJson={bodyJson}
              metadataJson={metadataJson}
              canEdit={canEditDraft}
              onChangeBody={setBodyJson}
              onChangeMeta={setMetadataJson}
              siteLocation={detail.site_location}
            />

            {canEditDraft ? (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingDraft}
                  className="btn-primary min-h-12 text-sm disabled:opacity-60"
                >
                  <Save size={16} strokeWidth={1.75} aria-hidden="true" />
                  {savingDraft ? "Menyimpan..." : "Simpan Draf"}
                </button>
              </div>
            ) : null}
          </form>

          {/* Seksi Catatan Validasi Kurator */}
          <section
            aria-labelledby={`${baseId}-reviews-heading`}
            className="space-y-4 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
          >
            <h2
              id={`${baseId}-reviews-heading`}
              className="text-base font-bold text-[#1f2a24]"
            >
              Catatan Validasi Kurator ({detail.reviews.length})
            </h2>

            {/* 4 Chip Status Validasi */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["language", "material", "media", "location"] as const).map(
                (typeKey) => {
                  const rec = latestReviewByType.get(typeKey);
                  const badgeClass =
                    rec?.decision === "approved"
                      ? "border-[#166534]/40 bg-[#dcfce7] text-[#166534]"
                      : rec?.decision === "rejected"
                        ? "border-[#b42318]/40 bg-[#fde8e6] text-[#b42318]"
                        : rec?.decision === "changes_requested"
                          ? "border-[#8a5a00]/40 bg-[#fbefcf] text-[#8a5a00]"
                          : "border-[#d6cec1] bg-[#faf6ee] text-[#5b6760]";

                  return (
                    <div
                      key={typeKey}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold ${badgeClass}`}
                    >
                      <p>{REVIEW_TYPE_LABELS[typeKey]}</p>
                      <p className="mt-0.5 font-semibold">
                        {rec ? rec.decision : "Belum dicatat"}
                      </p>
                    </div>
                  );
                }
              )}
            </div>

            {detail.reviews.length > 0 ? (
              <ul className="space-y-2 list-none p-0 text-xs">
                {detail.reviews.map((revRec) => (
                  <li
                    key={revRec.id}
                    className="rounded-xl border border-[#efeae2] bg-[#faf6ee]/60 p-3"
                  >
                    <p className="font-bold text-[#1f2a24]">
                      {REVIEW_TYPE_LABELS[revRec.review_type]} •{" "}
                      {revRec.decision} • oleh {revRec.reviewer_label}
                    </p>
                    {revRec.notes ? (
                      <p className="mt-1 text-[#3a4640]">{revRec.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#5b6760]">
                Belum ada catatan validasi pada revisi ini.
              </p>
            )}

            {canRecordReview ? (
              <form
                onSubmit={(e) => void handleReviewSubmit(e)}
                noValidate
                className="space-y-3 border-t border-[#efeae2] pt-4"
              >
                <h3 className="text-sm font-bold text-[#1f2a24]">
                  Tambah Catatan Validasi Baru
                </h3>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${baseId}-rev-type`}
                      className="text-xs font-bold text-[#1f2a24]"
                    >
                      Bidang Telaah
                    </label>
                    <select
                      id={`${baseId}-rev-type`}
                      value={reviewType}
                      onChange={(e) =>
                        setReviewType(e.target.value as ReviewType)
                      }
                      className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                    >
                      <option value="language">Bahasa Kelas III–IV</option>
                      <option value="material">Materi &amp; Arkeologi</option>
                      <option value="media">Media &amp; Ilustrasi</option>
                      <option value="location">Clearance Lokasi</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`${baseId}-rev-decision`}
                      className="text-xs font-bold text-[#1f2a24]"
                    >
                      Keputusan
                    </label>
                    <select
                      id={`${baseId}-rev-decision`}
                      value={reviewDecision}
                      onChange={(e) =>
                        setReviewDecision(
                          e.target.value as
                            | "approved"
                            | "changes_requested"
                            | "rejected"
                        )
                      }
                      className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                    >
                      <option value="approved">Disetujui (approved)</option>
                      <option value="changes_requested">
                        Perlu Perbaikan (changes_requested)
                      </option>
                      <option value="rejected">Ditolak (rejected)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-reviewer-label`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Nama / Peran Penelaah <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={`${baseId}-reviewer-label`}
                    type="text"
                    required
                    value={reviewerLabel}
                    aria-invalid={reviewerError ? "true" : "false"}
                    aria-describedby={
                      reviewerError ? `${baseId}-reviewer-err` : undefined
                    }
                    onChange={(e) => {
                      setReviewerLabel(e.target.value);
                      setReviewerError(null);
                    }}
                    onBlur={() => {
                      if (reviewerLabel.trim().length > 0 && reviewerLabel.trim().length < 2) {
                        setReviewerError("Nama/label penelaah minimal 2 karakter.");
                      }
                    }}
                    className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24]"
                  />
                  {reviewerError ? (
                    <p
                      id={`${baseId}-reviewer-err`}
                      className="text-xs font-semibold text-[#b42318]"
                    >
                      Kesalahan: {reviewerError}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`${baseId}-rev-notes`}
                    className="text-xs font-bold text-[#1f2a24]"
                  >
                    Catatan Telaah (Opsional)
                  </label>
                  <textarea
                    id={`${baseId}-rev-notes`}
                    rows={2}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
                  />
                </div>

                {reviewFeedback ? (
                  <p role="status" className="text-xs font-bold text-[#166534]">
                    {reviewFeedback}
                  </p>
                ) : null}
                {reviewSubmitError ? (
                  <p role="alert" className="text-xs font-bold text-[#b42318]">
                    Kesalahan: {reviewSubmitError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="btn-secondary min-h-11 text-xs disabled:opacity-60"
                >
                  <FileCheck2 size={15} strokeWidth={1.75} aria-hidden="true" />
                  {submittingReview ? "Mencatat..." : "Catat Validasi"}
                </button>
              </form>
            ) : null}
          </section>
        </div>

        {/* Kolom Kanan: Panel Publikasi & Relasi Sumber/Media/Tautan */}
        <aside className="min-w-0 space-y-6 lg:col-span-5">
          {/* Panel Publikasi & Gate Validasi */}
          <section
            aria-labelledby={`${baseId}-publish-panel-heading`}
            className="space-y-4 rounded-2xl border-2 border-[#2f6b4f]/35 bg-[#f0f6f0]/75 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id={`${baseId}-publish-panel-heading`}
                className="text-base font-bold text-[#1f2a24]"
              >
                Gate Publikasi (D3)
              </h2>
              {detail.status === "published" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-bold text-[#166534]">
                  <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                  Terbit
                </span>
              ) : publishGate.ready ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-xs font-bold text-[#166534]">
                  <CheckCircle2
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  Lolos Gate
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fbefcf] px-2.5 py-0.5 text-xs font-bold text-[#8a5a00]">
                  <ShieldAlert size={14} strokeWidth={1.75} aria-hidden="true" />
                  Terkunci
                </span>
              )}
            </div>

            {detail.status === "published" ? (
              <p className="text-xs font-semibold text-[#166534]">
                Revisi ini sedang terbit dan tampil pada halaman publik.
              </p>
            ) : publishGate.ready ? (
              <p className="text-xs font-semibold text-[#166534]">
                Seluruh syarat (status <code>approved</code>, rujukan sumber,
                review bahasa &amp; materi, serta media/lokasi bila ada) telah
                terpenuhi.
              </p>
            ) : (
              <div className="space-y-2 text-xs text-[#3a4640]">
                <p className="font-bold text-[#8a5a00]">
                  Syarat yang belum terpenuhi:
                </p>
                <ul className="list-disc space-y-1 pl-4">
                  {publishGate.missingRequirements.map((reqMsg, i) => (
                    <li key={i}>{reqMsg}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={openPublishDialog}
              disabled={!publishGate.ready || !isSupabaseLive || publishing}
              className="btn-primary min-h-12 w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={17} strokeWidth={1.75} aria-hidden="true" />
              Terbitkan Revisi ke Publik
            </button>
          </section>

          {/* Panel Sumber Rujukan */}
          <section
            aria-labelledby={`${baseId}-sources-heading`}
            className="space-y-3 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
          >
            <h2
              id={`${baseId}-sources-heading`}
              className="text-base font-bold text-[#1f2a24]"
            >
              Sumber Rujukan ({sources.length})
            </h2>

            {sources.length === 0 ? (
              <p className="text-xs text-[#5b6760]">
                Belum ada sumber ditautkan pada draf ini.
              </p>
            ) : (
              <ul className="space-y-2 list-none p-0 text-xs">
                {sources.map((src, idx) => (
                  <li
                    key={`${src.source_id}-${idx}`}
                    className="space-y-2 rounded-xl border border-[#efeae2] bg-[#faf6ee]/50 p-3"
                  >
                    <p className="font-bold text-[#1f2a24]">
                      {src.citation_text}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor={`${baseId}-src-loc-${idx}`}
                        className="text-[11px] font-bold text-[#3a4640]"
                      >
                        Halaman / Lokasi Kutipan:
                      </label>
                      <input
                        id={`${baseId}-src-loc-${idx}`}
                        type="text"
                        disabled={!canEditDraft}
                        value={src.locator}
                        onChange={(e) =>
                          setSources((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, locator: e.target.value }
                                : item
                            )
                          )
                        }
                        className="min-h-9 flex-1 rounded-lg border border-[#767676] bg-white px-2 py-1 text-xs text-[#1f2a24] disabled:bg-[#f4f1ea]"
                      />
                      {canEditDraft ? (
                        <button
                          type="button"
                          onClick={() =>
                            setSources((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#d6cec1] bg-white px-2 py-1 text-xs font-semibold text-[#b42318]"
                        >
                          <Trash2
                            size={12}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Lepas
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canEditDraft ? (
              <div className="space-y-3 border-t border-[#efeae2] pt-3">
                {availableSources.length > 0 ? (
                  <div className="space-y-2">
                    <label
                      htmlFor={`${baseId}-pick-source`}
                      className="block text-xs font-bold text-[#1f2a24]"
                    >
                      Pilih dari Bank Sumber
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <select
                        id={`${baseId}-pick-source`}
                        value={selectedSourceId}
                        onChange={(e) => setSelectedSourceId(e.target.value)}
                        className="edmb-field-control min-w-0 flex-1 rounded-xl border border-[#767676] bg-white px-2.5 py-2 text-xs text-[#1f2a24]"
                      >
                        {availableSources.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            [{opt.source_type}] {opt.citation_text.slice(0, 70)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAttachSelectedSource}
                        className="btn-secondary min-h-11 text-xs"
                      >
                        <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                        Tautkan
                      </button>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setShowNewSourceForm((prev) => !prev)}
                  className="text-xs font-bold text-[#1f4d38] underline"
                >
                  {showNewSourceForm
                    ? "Tutup Form Tambah Sumber Baru"
                    : "+ Tambah Sumber Rujukan Baru"}
                </button>

                {showNewSourceForm ? (
                  <form
                    onSubmit={(e) => void handleCreateNewSource(e)}
                    noValidate
                    className="space-y-2 rounded-xl border border-[#d6cec1] bg-[#faf6ee] p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${baseId}-new-src-cite`}
                        className="text-xs font-bold text-[#1f2a24]"
                      >
                        Teks Sitasi Lengkap <span aria-hidden="true">*</span>
                      </label>
                      <textarea
                        id={`${baseId}-new-src-cite`}
                        rows={2}
                        value={newSrcCitation}
                        onChange={(e) => {
                          setNewSrcCitation(e.target.value);
                          setNewSrcErr(null);
                        }}
                        className="w-full rounded-lg border border-[#767676] bg-white px-2.5 py-1.5 text-sm text-[#1f2a24]"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`${baseId}-new-src-type`}
                          className="text-xs font-bold text-[#1f2a24]"
                        >
                          Jenis Sumber
                        </label>
                        <select
                          id={`${baseId}-new-src-type`}
                          value={newSrcType}
                          onChange={(e) => setNewSrcType(e.target.value)}
                          className="min-h-11 rounded-lg border border-[#767676] bg-white px-2 py-1 text-xs text-[#1f2a24]"
                        >
                          {SOURCE_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`${baseId}-new-src-url`}
                          className="text-xs font-bold text-[#1f2a24]"
                        >
                          URL Sumber (Opsional)
                        </label>
                        <input
                          id={`${baseId}-new-src-url`}
                          type="url"
                          value={newSrcUrl}
                          onChange={(e) => setNewSrcUrl(e.target.value)}
                          className="min-h-11 rounded-lg border border-[#767676] bg-white px-2.5 py-1 text-xs text-[#1f2a24]"
                        />
                      </div>
                    </div>
                    {newSrcErr ? (
                      <p className="text-xs font-bold text-[#b42318]">
                        Kesalahan: {newSrcErr}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={creatingSource}
                      className="btn-primary min-h-11 text-xs"
                    >
                      {creatingSource ? "Menyimpan..." : "Simpan ke Bank Sumber"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Panel Media Tertaut */}
          <section
            aria-labelledby={`${baseId}-media-heading`}
            className="space-y-3 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
          >
            <h2
              id={`${baseId}-media-heading`}
              className="text-base font-bold text-[#1f2a24]"
            >
              Media Tertaut ({mediaLinks.length})
            </h2>

            {mediaLinks.length === 0 ? (
              <p className="text-xs text-[#5b6760]">
                Tidak ada aset media tertaut pada revisi ini.
              </p>
            ) : (
              <ul className="space-y-2 list-none p-0 text-xs">
                {mediaLinks.map((m, idx) => (
                  <li
                    key={`${m.asset_id}-${idx}`}
                    className="space-y-1.5 rounded-xl border border-[#efeae2] bg-[#faf6ee]/50 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="break-all font-bold text-[#1f2a24]">
                        {m.storage_path}
                      </code>
                      <span
                        className={
                          m.scan_status === "cleared" && m.metadata_scrubbed
                            ? "rounded-full bg-[#dcfce7] px-2 py-0.5 font-bold text-[#166534]"
                            : "rounded-full bg-[#fbefcf] px-2 py-0.5 font-bold text-[#8a5a00]"
                        }
                      >
                        {m.scan_status} •{" "}
                        {m.metadata_scrubbed ? "EXIF bersih" : "Perlu scrub"}
                      </span>
                    </div>
                    <p className="text-[#3a4640]">
                      Peran: <strong>{m.role}</strong>
                    </p>
                    {canEditDraft ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <input
                          type="text"
                          aria-label={`Teks alt media #${idx + 1}`}
                          value={m.alt_text}
                          onChange={(e) =>
                            setMediaLinks((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, alt_text: e.target.value }
                                  : item
                              )
                            )
                          }
                          className="min-h-9 flex-1 rounded-lg border border-[#767676] bg-white px-2 py-1 text-xs text-[#1f2a24]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setMediaLinks((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#d6cec1] bg-white px-2 py-1 text-xs font-semibold text-[#b42318]"
                        >
                          <Trash2
                            size={12}
                            strokeWidth={1.75}
                            aria-hidden="true"
                          />
                          Lepas
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canEditDraft && detail.available_media.length > 0 ? (
              <div className="space-y-2 border-t border-[#efeae2] pt-3">
                <label
                  htmlFor={`${baseId}-pick-media`}
                  className="block text-xs font-bold text-[#1f2a24]"
                >
                  Tautkan Aset Media
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    id={`${baseId}-pick-media`}
                    value={selectedMediaId}
                    onChange={(e) => setSelectedMediaId(e.target.value)}
                    className="edmb-field-control min-w-0 flex-1 rounded-xl border border-[#767676] bg-white px-2 py-1.5 text-xs text-[#1f2a24]"
                  >
                    {detail.available_media.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        [{opt.scan_status}] {opt.storage_path}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Peran aset media"
                    value={selectedMediaRole}
                    onChange={(e) => setSelectedMediaRole(e.target.value)}
                    className="edmb-field-control rounded-xl border border-[#767676] bg-white px-2 py-1.5 text-xs text-[#1f2a24]"
                  >
                    {MEDIA_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAttachMedia}
                    className="btn-secondary min-h-11 text-xs"
                  >
                    <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                    Tautkan
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Panel Tautan Relasi Konten */}
          <section
            aria-labelledby={`${baseId}-links-heading`}
            className="space-y-3 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
          >
            <h2
              id={`${baseId}-links-heading`}
              className="text-base font-bold text-[#1f2a24]"
            >
              Tautan Relasi ({contentLinks.length})
            </h2>

            {contentLinks.length === 0 ? (
              <p className="text-xs text-[#5b6760]">
                Belum ada tautan relasi ke entri lain.
              </p>
            ) : (
              <ul className="space-y-2 list-none p-0 text-xs">
                {contentLinks.map((lnk, idx) => (
                  <li
                    key={`${lnk.target_content_id}-${lnk.relation_type}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#efeae2] bg-[#faf6ee]/50 p-2.5"
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#1f2a24]">
                      <Link2 size={13} strokeWidth={1.75} aria-hidden="true" />
                      {lnk.target_title} ({lnk.relation_type})
                    </span>
                    {canEditDraft ? (
                      <button
                        type="button"
                        onClick={() =>
                          setContentLinks((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-xs font-bold text-[#b42318] underline"
                      >
                        Hapus
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canEditDraft && detail.available_link_targets.length > 0 ? (
              <div className="space-y-2 border-t border-[#efeae2] pt-3">
                <label
                  htmlFor={`${baseId}-pick-link`}
                  className="block text-xs font-bold text-[#1f2a24]"
                >
                  Tambah Relasi Konten
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    id={`${baseId}-pick-link`}
                    value={selectedLinkTargetId}
                    onChange={(e) => setSelectedLinkTargetId(e.target.value)}
                    className="edmb-field-control min-w-0 flex-1 rounded-xl border border-[#767676] bg-white px-2 py-1.5 text-xs text-[#1f2a24]"
                  >
                    {detail.available_link_targets.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        [{opt.kind}] {opt.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Jenis relasi konten"
                    value={selectedRelationType}
                    onChange={(e) => setSelectedRelationType(e.target.value)}
                    className="edmb-field-control rounded-xl border border-[#767676] bg-white px-2 py-1.5 text-xs text-[#1f2a24]"
                  >
                    {RELATION_TYPE_OPTIONS.map((rt) => (
                      <option key={rt.value} value={rt.value}>
                        {rt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAttachContentLink}
                    className="btn-secondary min-h-11 text-xs"
                  >
                    Tambah
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {/* Dialog Native Konfirmasi Transisi / Takedown dengan Alasan */}
      <dialog
        ref={transitionDialogRef}
        aria-labelledby={`${baseId}-trans-dialog-title`}
        className="m-auto w-[min(94vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <form
          onSubmit={(e) => void handleTransitionDialogSubmit(e)}
          noValidate
          className="space-y-4"
        >
          <h2
            id={`${baseId}-trans-dialog-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            {pendingTransition?.label ?? "Konfirmasi Perubahan Status"}
          </h2>
          <p className="text-sm text-[#3a4640]">
            {pendingTransition?.description ?? ""}
          </p>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-trans-reason`}
              className="text-sm font-bold text-[#1f2a24]"
            >
              Alasan Perubahan Status <span aria-hidden="true">*</span>
            </label>
            <span
              id={`${baseId}-trans-reason-hint`}
              className="text-xs text-[#5b6760]"
            >
              Minimal 5 karakter; dicatat otomatis ke audit log admin.
            </span>
            <textarea
              ref={reasonTextareaRef}
              id={`${baseId}-trans-reason`}
              rows={3}
              required
              value={transitionReason}
              aria-invalid={transitionReasonErr ? "true" : "false"}
              aria-describedby={
                transitionReasonErr
                  ? `${baseId}-trans-reason-hint ${baseId}-trans-reason-err`
                  : `${baseId}-trans-reason-hint`
              }
              onChange={(e) => {
                setTransitionReason(e.target.value);
                setTransitionReasonErr(null);
              }}
              onBlur={() => {
                if (
                  pendingTransition?.needsReason &&
                  transitionReason.trim().length > 0 &&
                  transitionReason.trim().length < 5
                ) {
                  setTransitionReasonErr("Alasan minimal 5 karakter.");
                }
              }}
              className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24]"
            />
            {transitionReasonErr ? (
              <p
                id={`${baseId}-trans-reason-err`}
                className="text-xs font-semibold text-[#b42318]"
              >
                Kesalahan: {transitionReasonErr}
              </p>
            ) : null}
          </div>

          {transitionError ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              <p>Kesalahan: {transitionError}</p>
              {transitionNeedsReauth ? (
                <Link
                  href="/admin/mfa/verifikasi?reauth=1"
                  className="inline-flex items-center gap-1 font-bold text-[#1f4d38] underline"
                >
                  Verifikasi Ulang MFA Sekarang
                  <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              onClick={() => transitionDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={transitioning}
              className={
                pendingTransition?.variant === "danger"
                  ? "inline-flex min-h-12 items-center justify-center rounded-full bg-[#b42318] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#912018] disabled:opacity-60"
                  : "btn-primary min-h-12 text-xs disabled:opacity-60"
              }
            >
              {transitioning ? "Memproses..." : "Ya, Lanjutkan"}
            </button>
          </div>
        </form>
      </dialog>

      {/* Dialog Native Konfirmasi Publikasi Final */}
      <dialog
        ref={publishDialogRef}
        aria-labelledby={`${baseId}-pub-dialog-title`}
        className="m-auto w-[min(94vw,34rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 shadow-2xl"
      >
        <div className="space-y-4">
          <h2
            id={`${baseId}-pub-dialog-title`}
            className="text-lg font-bold text-[#1f2a24]"
          >
            Terbitkan Revisi ke Halaman Publik?
          </h2>
          <p className="text-sm text-[#3a4640]">
            Setelah diterbitkan, revisi <strong>v{detail.version_no}</strong>{" "}
            menjadi konten aktif bagi siswa serta guru dan bersifat{" "}
            <strong>immutable</strong> (tidak dapat disunting ulang tanpa
            membuat revisi baru). Tindakan ini membutuhkan sesi MFA terbaru.
          </p>

          {publishError ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              <p>Kesalahan: {publishError}</p>
              {publishNeedsReauth ? (
                <Link
                  href="/admin/mfa/verifikasi?reauth=1"
                  className="inline-flex items-center gap-1 font-bold text-[#1f4d38] underline"
                >
                  Verifikasi Ulang MFA Sekarang
                  <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              onClick={() => publishDialogRef.current?.close()}
              className="btn-secondary min-h-12 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={() => void handleConfirmPublish()}
              className="btn-primary min-h-12 text-xs disabled:opacity-60"
            >
              <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
              {publishing ? "Menerbitkan..." : "Ya, Terbitkan Sekarang"}
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
