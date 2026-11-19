"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LogOut,
  WifiOff,
} from "lucide-react";
import { isValidJoinCodeFormat, normalizeJoinCode } from "@/modules/learning/quiz";
import type { PublicQuizQuestion } from "@/modules/learning/sample-quizzes";

const LETTERS = ["A", "B", "C", "D"] as const;

type ScreenMode =
  | "loading"
  | "enter_code"
  | "confirm_name"
  | "answering"
  | "review"
  | "result"
  | "unavailable";

interface ResolvedTaskInfo {
  assignment_title: string;
  class_label: string;
  grade: number;
  teacher_display_name: string;
  can_start: boolean;
  privacy_notice_version: string;
  privacy_notice_summary: string;
  join_code?: string;
  join_token?: string;
}

interface ActiveAttemptState {
  attempt_id: string;
  assignment_title: string;
  expires_at: string;
  answer_revision: number;
  instructions: string;
  questions: PublicQuizQuestion[];
}

interface ResultState {
  attempt_id: string;
  assignment_title?: string;
  submitted_at: string;
  correct_count: number;
  question_count: number;
  score: number;
  receipt_code: string;
  explanations_available: boolean;
  explanations?: Array<{
    question_id: string;
    prompt: string;
    is_correct: boolean;
    explanation: string;
  }>;
}

export function StudentTaskClient() {
  const codeInputId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const nameInputId = useId();
  const nameErrorId = useId();
  const confirmDialogTitleId = useId();

  const codeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const csrfTokenRef = useRef<string>("");
  const submitIdempotencyRef = useRef<string>("");

  const [mode, setMode] = useState<ScreenMode>("loading");
  const [joinCode, setJoinCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [resolved, setResolved] = useState<ResolvedTaskInfo | null>(null);
  const [studentName, setStudentName] = useState("");
  const [nameError, setNameError] = useState("");
  const [attempt, setAttempt] = useState<ActiveAttemptState | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [unavailableMsg, setUnavailableMsg] = useState("");

  const ensureCsrfToken = useCallback(async () => {
    if (csrfTokenRef.current) return csrfTokenRef.current;
    const res = await fetch("/api/v1/security/csrf", { cache: "no-store" });
    const json = await res.json();
    const token = json?.data?.csrf_token ?? "";
    csrfTokenRef.current = token;
    return token;
  }, []);

  const resolveTask = useCallback(
    async (credential: { join_code?: string; join_token?: string }) => {
      try {
        const res = await fetch("/api/v1/join/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credential),
        });
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 410 || res.status === 403) {
            setUnavailableMsg(
              json?.error?.message ?? "Tugas ini sudah ditutup. Beri tahu gurumu ya."
            );
            setMode("unavailable");
          } else {
            setCodeError(
              json?.error?.message ?? "Kode tidak ditemukan. Periksa lagi atau tanya gurumu."
            );
            setMode("enter_code");
          }
          return;
        }
        setResolved({ ...json.data, ...credential });
        setCodeError("");
        setMode("confirm_name");
      } catch {
        setCodeError("Koneksi terputus saat memeriksa kode. Coba lagi ya.");
        setMode("enter_code");
      }
    },
    []
  );

  // Inisialisasi: cek fragment #t= atau sesi aktif siswa yang sudah ada
  useEffect(() => {
    let active = true;
    async function init() {
      if (typeof window !== "undefined" && window.location.hash.includes("t=")) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const token = hashParams.get("t");
        const cleanUrl = window.location.pathname + window.location.search;
        window.history.replaceState(null, "", cleanUrl);
        if (token && active) {
          await resolveTask({ join_token: token });
          return;
        }
      }

      try {
        const res = await fetch("/api/v1/guest/attempt", { cache: "no-store" });
        if (!active) return;
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          if (data.state === "submitted") {
            const resResult = await fetch("/api/v1/guest/attempt/result", {
              cache: "no-store",
            });
            if (resResult.ok) {
              const rJson = await resResult.json();
              setResult(rJson.data);
              setMode("result");
              return;
            }
          }
          if (data.state === "in_progress") {
            const initialMap: Record<string, string | null> = {};
            for (const a of data.answers ?? []) {
              initialMap[a.question_id] = a.selected_choice_id;
            }
            setAttempt({
              attempt_id: data.attempt_id,
              assignment_title: data.assignment_title,
              expires_at: data.expires_at,
              answer_revision: data.answer_revision,
              instructions: data.instructions,
              questions: data.questions,
            });
            setAnswers(initialMap);
            setMode("answering");
            return;
          }
        }
      } catch {
        // Lanjutkan ke layar kode tugas
      }

      if (active) {
        setMode("enter_code");
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [resolveTask]);

  async function handleCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = normalizeJoinCode(joinCode);
    if (!normalized) {
      setCodeError("Masukkan kode tugas 10 karakter dari gurumu.");
      codeInputRef.current?.focus();
      return;
    }
    if (!isValidJoinCodeFormat(normalized)) {
      setCodeError("Kode harus 10 huruf/angka (tanpa huruf O, I, L atau 0, 1).");
      codeInputRef.current?.focus();
      return;
    }
    await resolveTask({ join_code: normalized });
  }

  async function handleStartAttempt(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = studentName.trim();
    if (!trimmed) {
      setNameError("Tulis namamu terlebih dahulu sebelum mulai.");
      nameInputRef.current?.focus();
      return;
    }
    if (trimmed.length > 80) {
      setNameError("Nama maksimal 80 karakter.");
      nameInputRef.current?.focus();
      return;
    }
    if (!resolved) return;

    setNameError("");
    try {
      const csrf = await ensureCsrfToken();
      const bodyPayload: Record<string, string> = {
        student_name: trimmed,
        privacy_notice_version: resolved.privacy_notice_version,
      };
      if (resolved.join_token) bodyPayload.join_token = resolved.join_token;
      else if (resolved.join_code) bodyPayload.join_code = resolved.join_code;

      const res = await fetch("/api/v1/guest/attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify(bodyPayload),
      });
      const json = await res.json();
      if (!res.ok) {
        setNameError(json?.error?.message ?? "Gagal memulai tugas.");
        return;
      }

      setAttempt({
        attempt_id: json.data.attempt_id,
        assignment_title: json.data.assignment_title,
        expires_at: json.data.expires_at,
        answer_revision: json.data.answer_revision,
        instructions: json.data.instructions,
        questions: json.data.questions,
      });
      setAnswers({});
      setCurrentIdx(0);
      setSaveStatus("idle");
      submitIdempotencyRef.current = "";
      setMode("answering");
    } catch {
      setNameError("Koneksi terputus saat memulai tugas. Coba lagi ya.");
    }
  }

  const persistAnswers = useCallback(
    async (nextAnswers: Record<string, string | null>, activeAttempt: ActiveAttemptState) => {
      setSaveStatus("saving");
      try {
        const csrf = await ensureCsrfToken();
        const payload = {
          expected_revision: activeAttempt.answer_revision,
          answers: activeAttempt.questions.map((q) => ({
            question_id: q.id,
            selected_choice_id: nextAnswers[q.id] ?? null,
          })),
        };
        const res = await fetch("/api/v1/guest/attempt/answers", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (res.status === 409) {
          // Sinkronkan state terbaru dari server jika terjadi konflik revisi
          const stateRes = await fetch("/api/v1/guest/attempt", { cache: "no-store" });
          if (stateRes.ok) {
            const sJson = await stateRes.json();
            setAttempt((prev) =>
              prev ? { ...prev, answer_revision: sJson.data.answer_revision } : prev
            );
          }
          setSaveStatus("error");
          return;
        }
        if (!res.ok) {
          setSaveStatus("error");
          return;
        }
        setAttempt((prev) =>
          prev ? { ...prev, answer_revision: json.data.answer_revision } : prev
        );
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [ensureCsrfToken]
  );

  // Debounce autosave 900ms saat siswa memilih jawaban
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSelectChoice(questionId: string, choiceId: string) {
    if (!attempt) return;
    const next = { ...answers, [questionId]: choiceId };
    setAnswers(next);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void persistAnswers(next, attempt);
    }, 900);
  }

  async function executeSubmit() {
    if (!attempt) return;
    setSubmitting(true);
    setSubmitError("");
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    if (!submitIdempotencyRef.current) {
      submitIdempotencyRef.current = crypto.randomUUID();
    }

    try {
      const csrf = await ensureCsrfToken();
      const payload = {
        answers: attempt.questions.map((q) => ({
          question_id: q.id,
          selected_choice_id: answers[q.id] ?? null,
        })),
        confirm_submit: true,
      };
      const res = await fetch("/api/v1/guest/attempt/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
          "Idempotency-Key": submitIdempotencyRef.current,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(
          json?.error?.message ?? "Gagal mengirim jawaban. Periksa sinyal lalu coba kirim ulang."
        );
        return;
      }

      setResult({
        attempt_id: json.data.attempt_id,
        assignment_title: attempt.assignment_title,
        submitted_at: json.data.submitted_at,
        correct_count: json.data.correct_count,
        question_count: json.data.question_count,
        score: json.data.score,
        receipt_code: json.data.receipt_code,
        explanations_available: json.data.explanations_available,
      });
      setMode("result");
    } catch {
      setSubmitError("Koneksi terputus saat mengirim. Tekan Kirim Jawaban lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRequestSubmit() {
    if (!attempt) return;
    const unansweredCount = attempt.questions.filter((q) => !answers[q.id]).length;
    if (unansweredCount > 0) {
      confirmDialogRef.current?.showModal();
      return;
    }
    void executeSubmit();
  }

  async function handleFinishAndClear() {
    try {
      const csrf = await ensureCsrfToken();
      await fetch("/api/v1/guest/session/end", {
        method: "POST",
        headers: { "x-csrf-token": csrf },
      });
    } catch {
      // Abaikan gangguan jaringan saat bersih-bersih lokal
    }
    csrfTokenRef.current = "";
    submitIdempotencyRef.current = "";
    setAttempt(null);
    setResolved(null);
    setResult(null);
    setAnswers({});
    setStudentName("");
    setJoinCode("");
    setSaveStatus("idle");
    setMode("enter_code");
  }

  if (mode === "loading") {
    return (
      <div className="py-8 text-center text-sm font-semibold text-[#3a4640]">
        Memeriksa sesi tugas...
      </div>
    );
  }

  if (mode === "unavailable") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-[#fbefcf] p-4 text-sm font-semibold text-[#8a5a00]">
          <AlertTriangle size={20} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
          <p>{unavailableMsg}</p>
        </div>
        <button
          type="button"
          onClick={() => setMode("enter_code")}
          className="btn-secondary w-full"
        >
          Masukkan Kode Lain
        </button>
      </div>
    );
  }

  if (mode === "enter_code") {
    return (
      <form onSubmit={handleCodeSubmit} noValidate className="space-y-5">
        <div className="space-y-2">
          <label htmlFor={codeInputId} className="block text-base font-bold text-[#1f2a24]">
            Kode Tugas (10 karakter)
          </label>
          <p id={codeHintId} className="text-sm text-[#5b6760]">
            Tulis kode dari gurumu. Untuk uji coba lokal: <code>EDMB34ABCD</code>.
          </p>
          <input
            ref={codeInputRef}
            id={codeInputId}
            name="join_code"
            type="text"
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              if (codeError) setCodeError("");
            }}
            required
            maxLength={14}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={codeError ? "true" : undefined}
            aria-describedby={codeError ? `${codeHintId} ${codeErrorId}` : codeHintId}
            className="min-h-12 w-full rounded-[10px] border-2 border-[#8b8378] bg-white px-4 py-2.5 text-[max(1rem,1em)] font-bold tracking-wider text-[#1f2a24] aria-[invalid=true]:border-[#b42318]"
          />
          {codeError ? (
            <p
              id={codeErrorId}
              role="alert"
              className="rounded-lg bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b42318]"
            >
              {codeError}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary w-full">
          Buka Tugas
        </button>
      </form>
    );
  }

  if (mode === "confirm_name" && resolved) {
    return (
      <form onSubmit={handleStartAttempt} noValidate className="space-y-5">
        <div className="space-y-2 rounded-2xl border border-[#dcebdd] bg-[#f0f6f0] p-4">
          <p className="text-xs font-bold text-[#1f4d38] uppercase">
            Kelas {resolved.class_label} (Kelas {resolved.grade})
          </p>
          <h2 className="text-lg font-bold text-[#1f2a24]">
            {resolved.assignment_title}
          </h2>
          <p className="text-sm text-[#3a4640]">
            Guru: <strong>{resolved.teacher_display_name}</strong>
          </p>
          <p className="border-t border-[#dcebdd] pt-2 text-xs text-[#3a4640]">
            {resolved.privacy_notice_summary}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor={nameInputId} className="block text-base font-bold text-[#1f2a24]">
            Tulis namamu seperti arahan gurumu
          </label>
          <input
            ref={nameInputRef}
            id={nameInputId}
            name="student_name"
            type="text"
            value={studentName}
            onChange={(e) => {
              setStudentName(e.target.value);
              if (nameError) setNameError("");
            }}
            required
            maxLength={80}
            autoComplete="name"
            enterKeyHint="done"
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            className="min-h-12 w-full rounded-[10px] border-2 border-[#8b8378] bg-white px-4 py-2.5 text-[max(1rem,1em)] text-[#1f2a24] aria-[invalid=true]:border-[#b42318]"
          />
          {studentName.length >= 60 ? (
            <p className="text-xs text-[#5b6760]">
              {studentName.length}/80 karakter
            </p>
          ) : null}
          {nameError ? (
            <p
              id={nameErrorId}
              role="alert"
              className="rounded-lg bg-[#fde8e6] px-3 py-2 text-sm font-semibold text-[#b42318]"
            >
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("enter_code")}
            className="btn-secondary"
          >
            Ganti Kode
          </button>
          <button type="submit" className="btn-primary flex-1">
            Mulai Mengerjakan
          </button>
        </div>
      </form>
    );
  }

  if (mode === "answering" && attempt) {
    const question = attempt.questions[currentIdx];
    const answeredCount = attempt.questions.filter((q) => Boolean(answers[q.id])).length;
    if (!question) return null;

    return (
      <div className="space-y-6">
        <div className="space-y-2 border-b border-[#efeae2] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
            <span className="text-[#1f4d38]">
              Soal {currentIdx + 1} dari {attempt.questions.length}
            </span>
            <span
              aria-live="polite"
              className={
                saveStatus === "error"
                  ? "inline-flex items-center gap-1 text-[#8a5a00]"
                  : "text-[#5b6760]"
              }
            >
              {saveStatus === "saving" ? "Menyimpan..." : null}
              {saveStatus === "saved" ? "Tersimpan" : null}
              {saveStatus === "error" ? (
                <>
                  <WifiOff size={14} strokeWidth={1.75} aria-hidden="true" />
                  Belum tersimpan, cek sinyalmu
                </>
              ) : null}
            </span>
          </div>

          <progress
            className="quiz-progress"
            value={answeredCount}
            max={attempt.questions.length}
            aria-label={`Sudah dijawab ${answeredCount} dari ${attempt.questions.length} soal`}
          />
        </div>

        <fieldset className="space-y-3 border-0 p-0">
          <legend className="text-lg font-bold text-[#1f2a24]">
            {question.prompt}
          </legend>

          <div className="space-y-2.5 pt-2">
            {question.choices.map((choice, cIdx) => {
              const inputId = `${question.id}-${choice.id}`;
              const checked = answers[question.id] === choice.id;
              return (
                <label
                  key={choice.id}
                  htmlFor={inputId}
                  className={`choice-card ${checked ? "is-selected" : ""}`}
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={`q-${question.id}`}
                    value={choice.id}
                    checked={checked}
                    onChange={() => handleSelectChoice(question.id, choice.id)}
                    className="sr-only"
                  />
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#8b8378] text-sm font-bold text-[#1f2a24]">
                    {LETTERS[cIdx] ?? cIdx + 1}
                  </span>
                  <span className="flex-1 text-base text-[#1f2a24]">
                    {choice.label}
                  </span>
                  {checked ? (
                    <Check
                      size={20}
                      strokeWidth={2.25}
                      className="shrink-0 text-[#2f6b4f]"
                      aria-hidden="true"
                    />
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#efeae2] pt-4">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            className="btn-secondary disabled:opacity-40"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Sebelumnya
          </button>

          {currentIdx < attempt.questions.length - 1 ? (
            <button
              type="button"
              onClick={() =>
                setCurrentIdx((i) => Math.min(attempt.questions.length - 1, i + 1))
              }
              className="btn-primary"
            >
              Berikutnya
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode("review")}
              className="btn-primary"
            >
              Tinjau &amp; Kirim
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === "review" && attempt) {
    const unansweredCount = attempt.questions.filter((q) => !answers[q.id]).length;
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#1f2a24]">Tinjau Jawabanmu</h2>
          <p className="text-sm text-[#3a4640]">
            Tekan nomor soal jika ingin memeriksa ulang sebelum mengirim.
          </p>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {attempt.questions.map((q, idx) => {
            const isAnswered = Boolean(answers[q.id]);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setCurrentIdx(idx);
                  setMode("answering");
                }}
                className={
                  isAnswered
                    ? "min-h-12 rounded-xl border-2 border-[#2f6b4f] bg-[#dcebdd] font-bold text-[#1f4d38]"
                    : "min-h-12 rounded-xl border-2 border-[#d6cec1] bg-white font-bold text-[#5b6760]"
                }
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {unansweredCount > 0 ? (
          <p className="rounded-xl bg-[#fbefcf] px-4 py-3 text-sm font-semibold text-[#8a5a00]">
            Masih ada {unansweredCount} soal yang belum dijawab.
          </p>
        ) : null}

        {submitError ? (
          <p role="alert" className="rounded-xl bg-[#fde8e6] px-4 py-3 text-sm font-bold text-[#b42318]">
            {submitError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("answering")}
            className="btn-secondary"
          >
            Kembali ke Soal
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleRequestSubmit}
            className="btn-primary flex-1"
          >
            {submitting ? "Mengirim..." : "Kirim Jawaban"}
          </button>
        </div>

        {/* Native modal <dialog> konfirmasi soal kosong sesuai desain (5).md & dialog guide */}
        <dialog
          ref={confirmDialogRef}
          aria-labelledby={confirmDialogTitleId}
          className="m-auto w-[min(92vw,28rem)] rounded-[24px] border border-[#d6cec1] bg-white p-6 text-[#1f2a24] shadow-xl"
        >
          <h2 id={confirmDialogTitleId} className="text-lg font-bold">
            Masih ada {unansweredCount} soal belum dijawab. Kirim sekarang?
          </h2>
          <p className="mt-2 text-sm text-[#3a4640]">
            Soal yang kosong akan dihitung bernilai nol. Kamu masih bisa kembali
            untuk mengisinya.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <form method="dialog">
              <button type="submit" autoFocus className="btn-primary">
                Kembali
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                confirmDialogRef.current?.close();
                void executeSubmit();
              }}
              className="btn-secondary"
            >
              Tetap Kirim
            </button>
          </div>
        </dialog>
      </div>
    );
  }

  if (mode === "result" && result) {
    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border-2 border-[#2f6b4f] bg-[#f0f6f0] p-6">
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#166534]">
            <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
            Jawaban Berhasil Dikirim
          </div>
          <h2 className="text-2xl font-extrabold text-[#1f2a24]">
            Jawaban benar {result.correct_count} dari {result.question_count}
          </h2>
          <p className="text-lg font-bold text-[#1f4d38]">
            Nilai: {result.score}
          </p>
          <p className="text-xs text-[#3a4640]">
            Kode konfirmasi layar: <code>{result.receipt_code}</code>
          </p>
        </div>

        {!result.explanations_available ? (
          <p className="rounded-xl bg-[#faf6ee] p-4 text-sm text-[#3a4640]">
            Pembahasan akan dibahas bersama gurumu setelah tugas selesai.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleFinishAndClear}
            className="btn-primary w-full"
          >
            <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
            Selesai / Ganti Siswa
          </button>
          <Link href="/" className="btn-secondary w-full">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
