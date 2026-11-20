"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CopyPlus,
  ExternalLink,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  AdminQuizPreviewPanel,
  type PreviewQuizQuestion,
} from "@/components/admin/AdminQuizPreviewPanel";
import { fetchAdminCsrfToken } from "@/components/admin/csrf-client";
import {
  QUIZ_MAX_QUESTIONS,
  QUIZ_REVIEW_DECISIONS,
  QUIZ_REVIEW_TYPES,
  QUIZ_REVIEW_TYPE_LABELS,
  QUIZ_USAGE_MODE_LABELS,
  upsertQuizDraftSchema,
  type QuizReviewDecision,
  type QuizReviewType,
  type QuizUsageMode,
} from "@/modules/admin/quiz-schemas";
import type { AdminQuizRevisionDetail } from "@/modules/admin/quiz-service";
import {
  REVISION_STATUS_LABELS,
  REVISION_WORKFLOW_STEPS,
  getAllowedTransitionActions,
  type TransitionActionSpec,
} from "@/modules/admin/state-machine";

interface EditableChoice {
  label: string;
}

interface EditableSourceRef {
  source_id: string;
  citation_text: string;
  locator: string;
}

interface EditableQuestion {
  localKey: string;
  prompt: string;
  media_asset_id: string | null;
  choices: EditableChoice[];
  correct_choice_position: number;
  explanation: string;
  sources: EditableSourceRef[];
}

const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

const DECISION_LABELS: Record<QuizReviewDecision, string> = {
  approved: "Disetujui",
  changes_requested: "Perlu Perbaikan",
  rejected: "Ditolak",
};

function createEmptyQuestion(seed: string): EditableQuestion {
  return {
    localKey: seed,
    prompt: "",
    media_asset_id: null,
    choices: [{ label: "" }, { label: "" }, { label: "" }],
    correct_choice_position: 1,
    explanation: "",
    sources: [],
  };
}

export function AdminQuizEditorClient({
  detail,
}: {
  detail: AdminQuizRevisionDetail;
}) {
  const router = useRouter();
  const baseId = useId();
  const keyCounterRef = useRef(0);

  const isSupabaseLive = detail.mode === "supabase";
  const isMutable = detail.status === "draft";
  const canEdit = isSupabaseLive && isMutable;

  // Refs untuk fokus otomatis saat validasi gagal
  const titleInputRef = useRef<HTMLInputElement>(null);
  const reviewerInputRef = useRef<HTMLInputElement>(null);
  const transitionReasonRef = useRef<HTMLTextAreaElement>(null);
  const transitionDialogRef = useRef<HTMLDialogElement>(null);
  const publishDialogRef = useRef<HTMLDialogElement>(null);

  // State draf metadata & bank soal
  const [title, setTitle] = useState(detail.title);
  const [grade, setGrade] = useState<3 | 4>(detail.grade);
  const [usageMode, setUsageMode] = useState<QuizUsageMode>(detail.usage_mode);
  const [instructions, setInstructions] = useState(detail.instructions);
  const [questions, setQuestions] = useState<EditableQuestion[]>(() =>
    detail.questions.map((q) => ({
      localKey: q.id,
      prompt: q.prompt,
      media_asset_id: q.media_asset_id,
      choices:
        q.choices.length >= 2
          ? q.choices.map((c) => ({ label: c.label }))
          : [{ label: "" }, { label: "" }],
      correct_choice_position: q.correct_choice_position,
      explanation: q.explanation,
      sources: q.sources.map((s) => ({ ...s })),
    }))
  );

  // State validasi & penyimpanan draf
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pilihan sementara sumber per soal
  const [draftSourceChoice, setDraftSourceChoice] = useState<
    Record<string, { sourceId: string; locator: string }>
  >({});

  // State catatan validasi penelaah
  const [reviewType, setReviewType] = useState<QuizReviewType>("language");
  const [reviewerLabel, setReviewerLabel] = useState("");
  const [reviewDecision, setReviewDecision] =
    useState<QuizReviewDecision>("approved");
  const [evidenceAssetId, setEvidenceAssetId] = useState("");
  const [reviewerError, setReviewerError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  // State revisi baru, transisi & publikasi
  const [cloning, setCloning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] =
    useState<TransitionActionSpec | null>(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionReasonErr, setTransitionReasonErr] = useState<string | null>(
    null
  );
  const [transitionErr, setTransitionErr] = useState<string | null>(null);
  const [transitionNeedsReauth, setTransitionNeedsReauth] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [publishNeedsReauth, setPublishNeedsReauth] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const mediaById = new Map(detail.available_media.map((m) => [m.id, m]));
  const sourceById = new Map(detail.available_sources.map((s) => [s.id, s]));

  function nextLocalKey(): string {
    keyCounterRef.current += 1;
    return `new-q-${keyCounterRef.current}`;
  }

  function handleAddQuestion() {
    if (!canEdit || questions.length >= QUIZ_MAX_QUESTIONS) return;
    setQuestions((prev) => [...prev, createEmptyQuestion(nextLocalKey())]);
    setSaveError(null);
    setSaveMessage(null);
  }

  function updateQuestion(
    index: number,
    updater: (prev: EditableQuestion) => EditableQuestion
  ) {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? updater(q) : q))
    );
    setSaveError(null);
    setSaveMessage(null);
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const current = next[index];
      const target = next[targetIdx];
      if (!current || !target) return prev;
      next[index] = target;
      next[targetIdx] = current;
      return next;
    });
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addSourceToQuestion(qIndex: number, localKey: string) {
    const draft = draftSourceChoice[localKey];
    const pickedId = draft?.sourceId || detail.available_sources[0]?.id || "";
    if (!pickedId) return;
    const srcMeta = sourceById.get(pickedId);
    if (!srcMeta) return;
    const locator = (draft?.locator ?? "").trim();

    updateQuestion(qIndex, (q) => {
      if (
        q.sources.some(
          (s) => s.source_id === pickedId && s.locator === locator
        )
      ) {
        return q;
      }
      return {
        ...q,
        sources: [
          ...q.sources,
          {
            source_id: pickedId,
            citation_text: srcMeta.citation_text,
            locator,
          },
        ],
      };
    });
  }

  async function handleSaveDraft(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canEdit) return;
    setSaveError(null);
    setSaveMessage(null);

    if (title.trim().length < 2) {
      setTitleError("Judul kuis minimal 2 karakter wajib diisi.");
      titleInputRef.current?.focus();
      return;
    }

    const payload = {
      title: title.trim(),
      grade,
      usage_mode: usageMode,
      instructions: instructions.trim(),
      questions: questions.map((q) => ({
        prompt: q.prompt.trim(),
        media_asset_id: q.media_asset_id || null,
        choices: q.choices.map((c) => ({ label: c.label.trim() })),
        correct_choice_position: q.correct_choice_position,
        explanation: q.explanation.trim(),
        sources: q.sources.map((s) => ({
          source_id: s.source_id,
          locator: s.locator.trim(),
        })),
      })),
    };

    const parsed = upsertQuizDraftSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setSaveError(
        firstIssue?.message ??
          "Periksa kembali teks pertanyaan, pilihan (2–4), dan kunci jawaban."
      );
      return;
    }

    setSaving(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/quiz-revisions/${detail.revision_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify(parsed.data),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(
          json?.error?.message ?? "Gagal menyimpan draf bank kuis."
        );
        return;
      }

      setSaveMessage(
        `Draf kuis (${parsed.data.questions.length} butir soal & kunci jawaban privat) tersimpan.`
      );
      router.refresh();
    } catch {
      setSaveError("Terjadi gangguan jaringan saat menyimpan draf kuis.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseLive || detail.status === "published" || detail.status === "archived") {
      return;
    }
    setReviewError(null);

    if (reviewerLabel.trim().length < 2) {
      setReviewerError("Nama atau label penelaah minimal 2 karakter.");
      reviewerInputRef.current?.focus();
      return;
    }

    setSubmittingReview(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/quiz-revisions/${detail.revision_id}/reviews`,
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
            evidence_asset_id: evidenceAssetId || null,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setReviewError(
          json?.error?.message ?? "Gagal mencatat hasil validasi kuis."
        );
        return;
      }

      setReviewerLabel("");
      setEvidenceAssetId("");
      setReviewerError(null);
      setActionMessage("Catatan validasi kurator berhasil disimpan.");
      router.refresh();
    } catch {
      setReviewError("Terjadi gangguan jaringan saat menyimpan validasi.");
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleCreateNewRevision() {
    if (!isSupabaseLive) return;
    setActionError(null);
    setCloning(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(`/api/v1/admin/quizzes/${detail.quiz_id}/revisions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ source_revision_id: detail.revision_id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ?? "Gagal menyalin revisi kuis baru."
        );
        return;
      }

      const nextRev = String(json?.data?.revision_id ?? "");
      if (nextRev) {
        router.push(`/admin/kuis/${detail.quiz_id}/revisi/${nextRev}`);
      } else {
        router.refresh();
      }
    } catch {
      setActionError("Terjadi gangguan jaringan saat membuat revisi baru.");
    } finally {
      setCloning(false);
    }
  }

  async function executeTransition(
    spec: TransitionActionSpec,
    reason?: string
  ) {
    setActionError(null);
    setTransitionErr(null);
    setTransitionNeedsReauth(false);
    setTransitioning(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/quiz-revisions/${detail.revision_id}/transition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          body: JSON.stringify({
            expected_status: detail.status,
            next_status: spec.nextStatus,
            reason: reason?.trim() || undefined,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.error?.message ?? "Gagal mengubah status revisi.";
        const needsReauth =
          res.status === 403 && /verifikasi ulang/i.test(msg);
        if (spec.needsDialog) {
          setTransitionErr(msg);
          setTransitionNeedsReauth(needsReauth);
        } else {
          setActionError(msg);
        }
        return;
      }

      transitionDialogRef.current?.close();
      setActionMessage(
        `Status revisi diperbarui menjadi '${REVISION_STATUS_LABELS[spec.nextStatus]}'.`
      );
      router.refresh();
    } catch {
      setActionError("Terjadi gangguan jaringan saat transisi status.");
    } finally {
      setTransitioning(false);
    }
  }

  function handleTransitionClick(spec: TransitionActionSpec) {
    if (!isSupabaseLive) return;
    if (!spec.needsDialog) {
      void executeTransition(spec);
      return;
    }
    setPendingTransition(spec);
    setTransitionReason("");
    setTransitionReasonErr(null);
    setTransitionErr(null);
    setTransitionNeedsReauth(false);
    transitionDialogRef.current?.showModal();
  }

  async function handleTransitionDialogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingTransition) return;
    if (pendingTransition.needsReason && transitionReason.trim().length < 5) {
      setTransitionReasonErr("Alasan minimal 5 karakter wajib diisi.");
      transitionReasonRef.current?.focus();
      return;
    }
    await executeTransition(pendingTransition, transitionReason);
  }

  async function handlePublishConfirm() {
    if (!isSupabaseLive) return;
    setPublishErr(null);
    setPublishNeedsReauth(false);
    setPublishing(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      const res = await fetch(
        `/api/v1/admin/quiz-revisions/${detail.revision_id}/publish`,
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
        const msg = json?.error?.message ?? "Gagal menerbitkan kuis.";
        setPublishErr(msg);
        setPublishNeedsReauth(
          res.status === 403 && /verifikasi ulang/i.test(msg)
        );
        return;
      }

      publishDialogRef.current?.close();
      setActionMessage(
        "Paket kuis berhasil diterbitkan dan langsung aktif di aplikasi."
      );
      router.refresh();
    } catch {
      setPublishErr("Terjadi gangguan jaringan saat menerbitkan kuis.");
    } finally {
      setPublishing(false);
    }
  }

  const transitionActions = getAllowedTransitionActions(detail.status);
  const previewQuestions: PreviewQuizQuestion[] = questions.map((q) => ({
    localKey: q.localKey,
    prompt: q.prompt,
    choices: q.choices,
    correct_choice_position: q.correct_choice_position,
    explanation: q.explanation,
    mediaLabel: q.media_asset_id
      ? mediaById.get(q.media_asset_id)?.storage_path ?? q.media_asset_id
      : null,
  }));

  return (
    <main className="space-y-6 rounded-[24px] border border-[#d6cec1] bg-white p-6 sm:p-8">
      {/* Header Editor Revisi Kuis */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#efeae2] pb-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#1f4d38]">
            <span>Bank Kuis • v{detail.version_no}</span>
            <span>•</span>
            <span>Kelas {grade === 3 ? "III" : "IV"}</span>
            {detail.is_live_published ? (
              <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[#166534]">
                Tayang Live
              </span>
            ) : null}
          </div>
          <h1>{detail.title}</h1>
          <p className="text-xs text-[#5b6760]">
            Slug: <code>{detail.slug}</code> • Status:{" "}
            <strong>{REVISION_STATUS_LABELS[detail.status]}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveDraft()}
              className="btn-primary min-h-12 text-xs disabled:opacity-55"
            >
              <Save size={15} strokeWidth={1.75} aria-hidden="true" />
              {saving ? "Menyimpan..." : "Simpan Draf"}
            </button>
          ) : null}
          {isSupabaseLive ? (
            <button
              type="button"
              disabled={cloning}
              onClick={() => void handleCreateNewRevision()}
              className="btn-secondary min-h-12 text-xs disabled:opacity-55"
            >
              <CopyPlus size={15} strokeWidth={1.75} aria-hidden="true" />
              {cloning ? "Menyalin..." : "Buat Revisi Baru (v+1)"}
            </button>
          ) : null}
        </div>
      </header>

      {/* Banner Status Demo / Migrasi / Immutabilitas */}
      {detail.mode === "local_demo" ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2f6b4f]/30 bg-[#faf6ee] p-4 text-sm text-[#3a4640]"
        >
          <strong>Mode Demo Lokal (Baca-Saja):</strong> Anda sedang memeriksa
          revisi sampel beserta deteksi kemiripan soal dan pratinjau kunci
          privat. Perubahan dan penerbitan aktif ketika Supabase terkonfigurasi.
        </div>
      ) : null}

      {detail.migrationPending ? (
        <div
          role="status"
          className="rounded-2xl border border-[#b42318]/30 bg-[#fde8e6] p-4 text-sm text-[#b42318]"
        >
          <strong>Migrasi Database Diperlukan:</strong> Pastikan migrasi{" "}
          <code>0016_admin_quiz_rpcs.sql</code> sudah dijalankan di Supabase
          SQL Editor agar kunci jawaban &amp; RPC Bank Kuis aktif.
        </div>
      ) : null}

      {!isMutable ? (
        <div
          role="status"
          className="rounded-2xl border border-[#8a5a00]/30 bg-[#fbefcf]/65 p-4 text-xs font-semibold text-[#6b4400]"
        >
          Revisi berstatus <strong>{REVISION_STATUS_LABELS[detail.status]}</strong>{" "}
          bersifat <strong>baca-saja / immutable (ADR-05)</strong>. Untuk
          mengubah soal atau kunci, gunakan tombol{" "}
          <strong>Buat Revisi Baru (v+1)</strong>; tugas guru yang sedang
          berjalan tetap merujuk revisi lama secara aman.
        </div>
      ) : null}

      {/* Peringatan Reuse Soal Latihan di Kuis Tugas */}
      {detail.practice_overlaps.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-[#8a5a00]/40 bg-[#fbefcf] p-4 text-xs text-[#6b4400]"
        >
          <AlertTriangle
            size={18}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-bold text-[#1f2a24]">
              Peringatan: Soal Latihan Mandiri Terpakai Ulang di Kuis Tugas
            </p>
            <p>
              Untuk menjaga kevalidan nilai penugasan, hindari menyalin butir
              soal persis dari kuis latihan publik:
            </p>
            <ul className="list-disc pl-4">
              {detail.practice_overlaps.map((warn) => (
                <li key={`${warn.position}-${warn.matched_quiz_slug}`}>
                  Soal #{warn.position} sama dengan kuis latihan{" "}
                  <strong>{warn.matched_quiz_title}</strong> (
                  <code>{warn.matched_quiz_slug}</code>).
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Stepper Workflow + Navigasi Versi */}
      <section aria-label="Alur Status & Versi Revisi" className="space-y-3">
        <ol className="flex flex-wrap list-none gap-2 p-0 text-xs">
          {REVISION_WORKFLOW_STEPS.map((step, idx) => {
            const active = detail.status === step;
            return (
              <li
                key={step}
                aria-current={active ? "step" : undefined}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full border border-[#1f4d38] bg-[#1f4d38] px-3 py-1.5 font-bold text-white"
                    : "inline-flex items-center gap-1.5 rounded-full border border-[#d6cec1] bg-[#faf6ee] px-3 py-1.5 font-semibold text-[#5b6760]"
                }
              >
                <span>{idx + 1}.</span>
                <span>{REVISION_STATUS_LABELS[step]}</span>
              </li>
            );
          })}
        </ol>

        {detail.revisions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-[#5b6760]">Versi Revisi:</span>
            {detail.revisions.map((rev) => (
              <Link
                key={rev.id}
                href={`/admin/kuis/${detail.quiz_id}/revisi/${rev.id}`}
                className={
                  rev.id === detail.revision_id
                    ? "rounded-full bg-[#1f4d38] px-3 py-1 font-bold text-white no-underline"
                    : "rounded-full border border-[#d6cec1] bg-[#faf6ee] px-3 py-1 font-semibold text-[#1f2a24] no-underline hover:bg-[#efeae2]"
                }
              >
                v{rev.version_no} ({REVISION_STATUS_LABELS[rev.status]})
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {actionMessage || saveMessage ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-[#166534]/30 bg-[#dcfce7] px-4 py-3 text-xs font-bold text-[#166534]"
        >
          <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{saveMessage ?? actionMessage}</span>
        </p>
      ) : null}

      {actionError || saveError ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] px-4 py-3 text-xs font-bold text-[#b42318]"
        >
          <AlertCircle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Kesalahan: {saveError ?? actionError}</span>
        </p>
      ) : null}

      {/* Form Metadata & Bank Soal */}
      <form onSubmit={(e) => void handleSaveDraft(e)} noValidate className="space-y-6">
        <section
          aria-labelledby={`${baseId}-meta-heading`}
          className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/60 p-4 sm:p-5"
        >
          <h2 id={`${baseId}-meta-heading`} className="text-base font-bold text-[#1f2a24]">
            Metadata Paket Kuis
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-title`}
                className="text-xs font-bold text-[#1f2a24]"
              >
                Judul Kuis <span aria-hidden="true">*</span>
              </label>
              <input
                ref={titleInputRef}
                id={`${baseId}-title`}
                name="title"
                type="text"
                required
                disabled={!canEdit}
                maxLength={160}
                value={title}
                aria-invalid={titleError ? "true" : "false"}
                aria-describedby={
                  titleError ? `${baseId}-title-err` : undefined
                }
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError(null);
                  setSaveError(null);
                }}
                onBlur={() => {
                  if (title.trim().length < 2) {
                    setTitleError("Judul kuis minimal 2 karakter wajib diisi.");
                  }
                }}
                className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
              />
              {titleError ? (
                <p id={`${baseId}-title-err`} className="text-xs font-semibold text-[#b42318]">
                  Kesalahan: {titleError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset className="space-y-1.5 rounded-xl border border-[#d6cec1] bg-white p-3">
                <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                  Kelas
                </legend>
                <div className="flex gap-4">
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      id={`${baseId}-grade-3`}
                      type="radio"
                      name="quiz_grade"
                      disabled={!canEdit}
                      checked={grade === 3}
                      onChange={() => setGrade(3)}
                      className="h-4 w-4 accent-[#1f4d38]"
                    />
                    <label htmlFor={`${baseId}-grade-3`} className="text-xs font-bold">
                      Kelas III
                    </label>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      id={`${baseId}-grade-4`}
                      type="radio"
                      name="quiz_grade"
                      disabled={!canEdit}
                      checked={grade === 4}
                      onChange={() => setGrade(4)}
                      className="h-4 w-4 accent-[#1f4d38]"
                    />
                    <label htmlFor={`${baseId}-grade-4`} className="text-xs font-bold">
                      Kelas IV
                    </label>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-1.5 rounded-xl border border-[#d6cec1] bg-white p-3">
                <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                  Mode
                </legend>
                <div className="flex flex-col gap-1">
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      id={`${baseId}-mode-practice`}
                      type="radio"
                      name="quiz_usage_mode"
                      disabled={!canEdit}
                      checked={usageMode === "practice"}
                      onChange={() => setUsageMode("practice")}
                      className="h-4 w-4 accent-[#1f4d38]"
                    />
                    <label htmlFor={`${baseId}-mode-practice`} className="text-xs font-bold">
                      Latihan
                    </label>
                  </div>
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      id={`${baseId}-mode-assignment`}
                      type="radio"
                      name="quiz_usage_mode"
                      disabled={!canEdit}
                      checked={usageMode === "assignment"}
                      onChange={() => setUsageMode("assignment")}
                      className="h-4 w-4 accent-[#1f4d38]"
                    />
                    <label htmlFor={`${baseId}-mode-assignment`} className="text-xs font-bold">
                      Tugas Guru
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-instructions`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Petunjuk Pengerjaan Siswa
            </label>
            <textarea
              id={`${baseId}-instructions`}
              name="instructions"
              rows={2}
              disabled={!canEdit}
              maxLength={1000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
            />
          </div>
        </section>

        {/* Bank Soal & Kunci Jawaban Privat */}
        <section aria-labelledby={`${baseId}-questions-heading`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2
                id={`${baseId}-questions-heading`}
                className="text-base font-bold text-[#1f2a24]"
              >
                Daftar Soal &amp; Kunci Jawaban Privat ({questions.length} /{" "}
                {QUIZ_MAX_QUESTIONS})
              </h2>
              <p className="text-xs text-[#5b6760]">
                Rekomendasi editorial: 5–10 soal singkat ramah siswa kelas
                III–IV SD. Kunci jawaban disimpan pada{" "}
                <code>private.quiz_answer_keys</code>.
              </p>
            </div>

            {canEdit ? (
              <button
                type="button"
                disabled={questions.length >= QUIZ_MAX_QUESTIONS}
                onClick={handleAddQuestion}
                className="btn-secondary min-h-11 text-xs disabled:opacity-55"
              >
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                Tambah Soal
              </button>
            ) : null}
          </div>

          {questions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d6cec1] p-6 text-center text-sm text-[#5b6760]">
              Belum ada butir soal. Klik &ldquo;Tambah Soal&rdquo; untuk
              mulai menyusun kuis.
            </p>
          ) : (
            <div className="space-y-4">
              {questions.map((q, qIdx) => {
                const draftSrc = draftSourceChoice[q.localKey] ?? {
                  sourceId: detail.available_sources[0]?.id ?? "",
                  locator: "",
                };

                return (
                  <article
                    key={q.localKey}
                    className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/45 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efeae2] pb-2">
                      <h3 className="text-sm font-extrabold text-[#1f2a24]">
                        Soal #{qIdx + 1}
                      </h3>
                      {canEdit ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={qIdx === 0}
                            onClick={() => moveQuestion(qIdx, -1)}
                            className="btn-secondary min-h-9 px-2.5 text-xs disabled:opacity-45"
                            aria-label={`Geser Soal ${qIdx + 1} ke atas`}
                          >
                            <ArrowUp size={13} strokeWidth={1.75} aria-hidden="true" />
                            Naik
                          </button>
                          <button
                            type="button"
                            disabled={qIdx === questions.length - 1}
                            onClick={() => moveQuestion(qIdx, 1)}
                            className="btn-secondary min-h-9 px-2.5 text-xs disabled:opacity-45"
                            aria-label={`Geser Soal ${qIdx + 1} ke bawah`}
                          >
                            <ArrowDown size={13} strokeWidth={1.75} aria-hidden="true" />
                            Turun
                          </button>
                          <button
                            type="button"
                            onClick={() => removeQuestion(qIdx)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-[#b42318]/40 bg-[#fde8e6] px-3 py-1 text-xs font-bold text-[#b42318]"
                          >
                            <Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
                            Hapus Soal
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${baseId}-q-${q.localKey}-prompt`}
                        className="text-xs font-bold text-[#1f2a24]"
                      >
                        Teks Pertanyaan <span aria-hidden="true">*</span>
                      </label>
                      <span
                        id={`${baseId}-q-${q.localKey}-prompt-hint`}
                        className="text-[11px] text-[#5b6760]"
                      >
                        Minimal 3 karakter, gunakan kalimat sederhana dan jelas.
                      </span>
                      <textarea
                        id={`${baseId}-q-${q.localKey}-prompt`}
                        name={`q_${qIdx}_prompt`}
                        rows={2}
                        required
                        disabled={!canEdit}
                        value={q.prompt}
                        aria-describedby={`${baseId}-q-${q.localKey}-prompt-hint`}
                        onChange={(e) =>
                          updateQuestion(qIdx, (prev) => ({
                            ...prev,
                            prompt: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
                      />
                    </div>

                    <fieldset className="space-y-2.5 rounded-xl border border-[#d6cec1] bg-white p-3">
                      <legend className="px-1 text-xs font-bold text-[#1f2a24]">
                        Pilihan Jawaban (2–4 opsi) &amp; Kunci Jawaban Privat
                      </legend>

                      {q.choices.map((c, cIdx) => {
                        const pos = cIdx + 1;
                        const letter = CHOICE_LETTERS[cIdx] ?? String(pos);
                        const radioId = `${baseId}-q-${q.localKey}-key-${pos}`;
                        const inputId = `${baseId}-q-${q.localKey}-opt-${pos}`;

                        return (
                          <div
                            key={`${q.localKey}-opt-${pos}`}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <div className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#d6cec1] bg-[#faf6ee] px-2.5">
                              <input
                                id={radioId}
                                type="radio"
                                name={`correct_choice_${q.localKey}`}
                                disabled={!canEdit}
                                checked={q.correct_choice_position === pos}
                                onChange={() =>
                                  updateQuestion(qIdx, (prev) => ({
                                    ...prev,
                                    correct_choice_position: pos,
                                  }))
                                }
                                className="h-4 w-4 accent-[#1f4d38]"
                              />
                              <label
                                htmlFor={radioId}
                                className="cursor-pointer text-xs font-bold text-[#1f4d38]"
                              >
                                Kunci {letter}
                              </label>
                            </div>

                            <label htmlFor={inputId} className="sr-only">
                              Teks Pilihan {letter} untuk Soal {qIdx + 1}
                            </label>
                            <input
                              id={inputId}
                              name={`q_${qIdx}_choice_${pos}`}
                              type="text"
                              required
                              disabled={!canEdit}
                              value={c.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateQuestion(qIdx, (prev) => ({
                                  ...prev,
                                  choices: prev.choices.map((item, idx) =>
                                    idx === cIdx ? { label: val } : item
                                  ),
                                }));
                              }}
                              className="edmb-field-control min-w-[12rem] flex-1 rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                            />

                            {canEdit && q.choices.length > 2 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuestion(qIdx, (prev) => {
                                    const filtered = prev.choices.filter(
                                      (_, idx) => idx !== cIdx
                                    );
                                    const adjustedKey =
                                      prev.correct_choice_position >
                                      filtered.length
                                        ? 1
                                        : prev.correct_choice_position;
                                    return {
                                      ...prev,
                                      choices: filtered,
                                      correct_choice_position: adjustedKey,
                                    };
                                  })
                                }
                                className="btn-secondary min-h-11 px-3 text-xs"
                              >
                                Hapus
                              </button>
                            ) : null}
                          </div>
                        );
                      })}

                      {canEdit && q.choices.length < 4 ? (
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(qIdx, (prev) => ({
                              ...prev,
                              choices: [...prev.choices, { label: "" }],
                            }))
                          }
                          className="btn-secondary min-h-10 text-xs"
                        >
                          <Plus size={13} strokeWidth={1.75} aria-hidden="true" />
                          Tambah Pilihan (Maks 4)
                        </button>
                      ) : null}
                    </fieldset>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`${baseId}-q-${q.localKey}-expl`}
                          className="text-xs font-bold text-[#1f2a24]"
                        >
                          Pembahasan Kunci (Disimpan Privat SEC-08)
                        </label>
                        <textarea
                          id={`${baseId}-q-${q.localKey}-expl`}
                          name={`q_${qIdx}_explanation`}
                          rows={2}
                          disabled={!canEdit}
                          value={q.explanation}
                          onChange={(e) =>
                            updateQuestion(qIdx, (prev) => ({
                              ...prev,
                              explanation: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-base text-[#1f2a24] disabled:bg-[#f4f1ea]"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`${baseId}-q-${q.localKey}-media`}
                          className="text-xs font-bold text-[#1f2a24]"
                        >
                          Lampiran Media Terkurasi (Opsional)
                        </label>
                        <select
                          id={`${baseId}-q-${q.localKey}-media`}
                          name={`q_${qIdx}_media`}
                          disabled={!canEdit}
                          value={q.media_asset_id ?? ""}
                          onChange={(e) =>
                            updateQuestion(qIdx, (prev) => ({
                              ...prev,
                              media_asset_id: e.target.value || null,
                            }))
                          }
                          className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-sm text-[#1f2a24] disabled:bg-[#f4f1ea]"
                        >
                          <option value="">Tanpa lampiran gambar</option>
                          {detail.available_media.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.storage_path} ({m.credit || "EDMB"})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Rujukan Sumber Soal Opsional */}
                    <div className="space-y-2 rounded-xl border border-[#efeae2] bg-white p-3">
                      <p className="text-xs font-bold text-[#1f2a24]">
                        Sumber Referensi Soal ({q.sources.length})
                      </p>
                      {q.sources.length > 0 ? (
                        <ul className="list-none space-y-1 p-0 text-xs">
                          {q.sources.map((src, sIdx) => (
                            <li
                              key={`${src.source_id}-${sIdx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#faf6ee] px-2.5 py-1.5"
                            >
                              <span>
                                {src.citation_text}
                                {src.locator ? ` (${src.locator})` : ""}
                              </span>
                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(qIdx, (prev) => ({
                                      ...prev,
                                      sources: prev.sources.filter(
                                        (_, idx) => idx !== sIdx
                                      ),
                                    }))
                                  }
                                  className="text-xs font-bold text-[#b42318] underline"
                                >
                                  Lepas
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {canEdit && detail.available_sources.length > 0 ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex min-w-[14rem] flex-1 flex-col gap-1">
                            <label
                              htmlFor={`${baseId}-q-${q.localKey}-src-sel`}
                              className="text-[11px] font-semibold text-[#5b6760]"
                            >
                              Pilih Rujukan
                            </label>
                            <select
                              id={`${baseId}-q-${q.localKey}-src-sel`}
                              value={draftSrc.sourceId}
                              onChange={(e) =>
                                setDraftSourceChoice((prev) => ({
                                  ...prev,
                                  [q.localKey]: {
                                    sourceId: e.target.value,
                                    locator: draftSrc.locator,
                                  },
                                }))
                              }
                              className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-2.5 py-1.5 text-xs text-[#1f2a24]"
                            >
                              {detail.available_sources.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.citation_text.slice(0, 80)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`${baseId}-q-${q.localKey}-src-loc`}
                              className="text-[11px] font-semibold text-[#5b6760]"
                            >
                              Halaman / Lokasi (Opsional)
                            </label>
                            <input
                              id={`${baseId}-q-${q.localKey}-src-loc`}
                              type="text"
                              value={draftSrc.locator}
                              onChange={(e) =>
                                setDraftSourceChoice((prev) => ({
                                  ...prev,
                                  [q.localKey]: {
                                    sourceId: draftSrc.sourceId,
                                    locator: e.target.value,
                                  },
                                }))
                              }
                              className="edmb-field-control rounded-xl border border-[#767676] bg-white px-2.5 py-1.5 text-xs text-[#1f2a24]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => addSourceToQuestion(qIdx, q.localKey)}
                            className="btn-secondary min-h-11 text-xs"
                          >
                            Tautkan Sumber
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {canEdit ? (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary min-h-12 text-sm disabled:opacity-55"
              >
                <Save size={16} strokeWidth={1.75} aria-hidden="true" />
                {saving ? "Menyimpan..." : "Simpan Perubahan Draf"}
              </button>
            </div>
          ) : null}
        </section>
      </form>

      {/* Panel Pratinjau Kuis Khusus Admin (no-store) */}
      <AdminQuizPreviewPanel
        title={title}
        grade={grade}
        usageMode={usageMode}
        instructions={instructions}
        questions={previewQuestions}
      />

      {/* Panel Catatan Validasi Penelaah (Bahasa, Materi, Media) */}
      <section
        aria-labelledby={`${baseId}-reviews-heading`}
        className="space-y-4 rounded-2xl border border-[#d6cec1] bg-[#faf6ee]/50 p-4 sm:p-5"
      >
        <h2
          id={`${baseId}-reviews-heading`}
          className="text-base font-bold text-[#1f2a24]"
        >
          Catatan Validasi Kurator ({detail.reviews.length})
        </h2>

        {detail.reviews.length > 0 ? (
          <ul className="list-none space-y-2 p-0 text-xs">
            {detail.reviews.map((rev) => (
              <li
                key={rev.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d6cec1] bg-white px-4 py-3"
              >
                <div>
                  <span className="font-bold text-[#1f2a24]">
                    {QUIZ_REVIEW_TYPE_LABELS[rev.review_type]}
                  </span>
                  <span className="mx-1.5 text-[#5b6760]">•</span>
                  <span className="text-[#3a4640]">{rev.reviewer_label}</span>
                </div>
                <span
                  className={
                    rev.decision === "approved"
                      ? "rounded-full bg-[#dcfce7] px-2.5 py-0.5 font-bold text-[#166534]"
                      : "rounded-full bg-[#fde8e6] px-2.5 py-0.5 font-bold text-[#b42318]"
                  }
                >
                  {DECISION_LABELS[rev.decision]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[#5b6760]">
            Belum ada catatan validasi bahasa/materi untuk revisi ini.
          </p>
        )}

        {isSupabaseLive &&
        detail.status !== "published" &&
        detail.status !== "archived" ? (
          <form
            onSubmit={(e) => void handleAddReview(e)}
            noValidate
            className="grid gap-3 rounded-xl border border-[#d6cec1] bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-rev-type`}
                className="text-xs font-bold text-[#1f2a24]"
              >
                Aspek Validasi
              </label>
              <select
                id={`${baseId}-rev-type`}
                name="review_type"
                value={reviewType}
                onChange={(e) => setReviewType(e.target.value as QuizReviewType)}
                className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-xs text-[#1f2a24]"
              >
                {QUIZ_REVIEW_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {QUIZ_REVIEW_TYPE_LABELS[rt]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-rev-label`}
                className="text-xs font-bold text-[#1f2a24]"
              >
                Nama Penelaah <span aria-hidden="true">*</span>
              </label>
              <input
                ref={reviewerInputRef}
                id={`${baseId}-rev-label`}
                name="reviewer_label"
                type="text"
                required
                value={reviewerLabel}
                aria-invalid={reviewerError ? "true" : "false"}
                aria-describedby={
                  reviewerError ? `${baseId}-rev-label-err` : undefined
                }
                onChange={(e) => {
                  setReviewerLabel(e.target.value);
                  if (reviewerError) setReviewerError(null);
                }}
                onBlur={() => {
                  if (reviewerLabel.trim().length > 0 && reviewerLabel.trim().length < 2) {
                    setReviewerError("Nama penelaah minimal 2 karakter.");
                  }
                }}
                className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-xs text-[#1f2a24]"
              />
              {reviewerError ? (
                <p id={`${baseId}-rev-label-err`} className="text-[11px] font-semibold text-[#b42318]">
                  Kesalahan: {reviewerError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${baseId}-rev-dec`}
                className="text-xs font-bold text-[#1f2a24]"
              >
                Keputusan
              </label>
              <select
                id={`${baseId}-rev-dec`}
                name="decision"
                value={reviewDecision}
                onChange={(e) =>
                  setReviewDecision(e.target.value as QuizReviewDecision)
                }
                className="edmb-field-control w-full rounded-xl border border-[#767676] bg-white px-3 py-2 text-xs text-[#1f2a24]"
              >
                {QUIZ_REVIEW_DECISIONS.map((dec) => (
                  <option key={dec} value={dec}>
                    {DECISION_LABELS[dec]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end gap-1">
              <label
                htmlFor={`${baseId}-rev-ev`}
                className="text-[11px] font-semibold text-[#5b6760]"
              >
                Bukti Media (Opsional)
              </label>
              <div className="flex gap-2">
                <select
                  id={`${baseId}-rev-ev`}
                  name="evidence_asset_id"
                  value={evidenceAssetId}
                  onChange={(e) => setEvidenceAssetId(e.target.value)}
                  className="edmb-field-control min-w-0 flex-1 rounded-xl border border-[#767676] bg-white px-2 py-1.5 text-xs text-[#1f2a24]"
                >
                  <option value="">Tanpa bukti</option>
                  {detail.available_media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.storage_path}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="btn-primary min-h-11 shrink-0 text-xs disabled:opacity-55"
                >
                  {submittingReview ? "..." : "Simpan"}
                </button>
              </div>
            </div>

            {reviewError ? (
              <p
                role="alert"
                className="sm:col-span-2 lg:col-span-4 text-xs font-bold text-[#b42318]"
              >
                Kesalahan: {reviewError}
              </p>
            ) : null}
          </form>
        ) : null}
      </section>

      {/* Panel Checklist Gate Terbit & Transisi Status */}
      <section
        aria-labelledby={`${baseId}-publish-heading`}
        className="space-y-4 rounded-2xl border border-[#d6cec1] bg-white p-4 sm:p-5"
      >
        <h2
          id={`${baseId}-publish-heading`}
          className="text-base font-bold text-[#1f2a24]"
        >
          Kesiapan Terbit &amp; Alur Persetujuan
        </h2>

        <ul className="list-none space-y-2 p-0 text-xs">
          {detail.publish_gate.checks.map((chk) => (
            <li
              key={chk.key}
              className={
                chk.ok
                  ? "flex items-center gap-2 rounded-xl bg-[#f0f6f0] px-3 py-2 font-semibold text-[#166534]"
                  : "flex items-center gap-2 rounded-xl bg-[#faf6ee] px-3 py-2 font-semibold text-[#6b4400]"
              }
            >
              {chk.ok ? (
                <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <AlertCircle size={15} strokeWidth={1.75} aria-hidden="true" />
              )}
              <span>{chk.label}</span>
              {chk.detail ? (
                <span className="ml-auto font-bold">{chk.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          {transitionActions.map((spec) => (
            <button
              key={spec.nextStatus}
              type="button"
              disabled={!isSupabaseLive || transitioning}
              onClick={() => handleTransitionClick(spec)}
              className={
                spec.variant === "danger"
                  ? "inline-flex min-h-12 items-center justify-center rounded-full border border-[#b42318]/40 bg-[#fde8e6] px-4 py-2 text-xs font-bold text-[#b42318] disabled:opacity-55"
                  : spec.variant === "primary"
                    ? "btn-primary min-h-12 text-xs disabled:opacity-55"
                    : "btn-secondary min-h-12 text-xs disabled:opacity-55"
              }
            >
              <Send size={14} strokeWidth={1.75} aria-hidden="true" />
              {spec.label}
            </button>
          ))}

          {detail.status !== "published" && detail.status !== "archived" ? (
            <button
              type="button"
              disabled={!isSupabaseLive || !detail.publish_gate.ready || publishing}
              onClick={() => {
                setPublishErr(null);
                setPublishNeedsReauth(false);
                publishDialogRef.current?.showModal();
              }}
              className="btn-primary min-h-12 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={15} strokeWidth={1.75} aria-hidden="true" />
              Terbitkan Kuis ke Aplikasi
            </button>
          ) : null}
        </div>
      </section>

      {/* Dialog Native Konfirmasi Transisi Status */}
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
            {pendingTransition?.description}
          </p>

          <div className="flex flex-col gap-1">
            <label
              htmlFor={`${baseId}-trans-reason`}
              className="text-xs font-bold text-[#1f2a24]"
            >
              Alasan Perubahan (Wajib minimal 5 karakter){" "}
              <span aria-hidden="true">*</span>
            </label>
            <textarea
              ref={transitionReasonRef}
              id={`${baseId}-trans-reason`}
              name="transition_reason"
              rows={2}
              required={pendingTransition?.needsReason}
              value={transitionReason}
              aria-invalid={transitionReasonErr ? "true" : "false"}
              aria-describedby={
                transitionReasonErr ? `${baseId}-trans-reason-err` : undefined
              }
              onChange={(e) => {
                setTransitionReason(e.target.value);
                if (transitionReasonErr) setTransitionReasonErr(null);
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

          {transitionErr ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              <p>Kesalahan: {transitionErr}</p>
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

      {/* Dialog Native Konfirmasi Publikasi Kuis */}
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
            Terbitkan Revisi Kuis?
          </h2>
          <p className="text-sm text-[#3a4640]">
            Revisi <strong>v{detail.version_no}</strong> akan diterbitkan dan
            menjadi versi aktif ({QUIZ_USAGE_MODE_LABELS[detail.usage_mode]}).
            Revisi terbit tidak dapat diubah langsung tanpa membuat revisi
            baru (ADR-05) dan memerlukan sesi MFA terbaru.
          </p>

          {publishErr ? (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-[#b42318]/30 bg-[#fde8e6] p-3 text-xs font-semibold text-[#b42318]"
            >
              <p>Kesalahan: {publishErr}</p>
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
              onClick={() => void handlePublishConfirm()}
              className="btn-primary min-h-12 text-xs disabled:opacity-60"
            >
              {publishing ? "Menerbitkan..." : "Konfirmasi Terbitkan Kuis"}
            </button>
          </div>
        </div>
      </dialog>
    </main>
  );
}
