"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { PublicQuizDefinition } from "@/modules/learning/sample-quizzes";

const LETTERS = ["A", "B", "C", "D"] as const;

interface CheckItemResult {
  question_id: string;
  selected_choice_id: string | null;
  correct_choice_id: string | null;
  is_correct: boolean;
  explanation: string;
}

interface CheckResponse {
  correct_count: number;
  question_count: number;
  score: number;
  items: CheckItemResult[];
}

export function PracticeQuizClient({ quiz }: { quiz: PublicQuizDefinition }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        answers: quiz.questions.map((q) => ({
          question_id: q.id,
          selected_choice_id: answers[q.id] ?? null,
        })),
      };
      const res = await fetch(`/api/v1/practice-quizzes/${quiz.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Gagal memeriksa jawaban latihan.");
        return;
      }
      setResult(json.data);
    } catch {
      setError("Koneksi terputus. Coba periksa jaringanmu lalu tekan Periksa Jawaban.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setAnswers({});
    setResult(null);
    setError("");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#fbefcf] px-4 py-3 text-sm font-semibold text-[#8a5a00]">
        Latihan umum — tanpa nama dan nilai tidak disimpan ke mana pun.
      </div>

      {result ? (
        <section
          aria-live="polite"
          className="space-y-4 rounded-[24px] border-2 border-[#2f6b4f] bg-white p-6"
        >
          <p className="text-xs font-bold tracking-[0.08em] text-[#1f4d38] uppercase">
            Hasil Latihan
          </p>
          <h2 className="text-2xl font-extrabold text-[#1f2a24]">
            Jawaban benar {result.correct_count} dari {result.question_count}{" "}
            (Skor {result.score})
          </h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleReset} className="btn-secondary">
              <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
              Coba Lagi
            </button>
            <Link href="/kuis" className="btn-primary">
              Kembali ke Menu Kuis
            </Link>
          </div>
        </section>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        {quiz.questions.map((question, qIdx) => {
          const feedback = result?.items.find(
            (item) => item.question_id === question.id
          );
          return (
            <fieldset
              key={question.id}
              disabled={Boolean(result)}
              className="space-y-3 rounded-[24px] border border-[#d6cec1] bg-white p-5 sm:p-6"
            >
              <legend className="px-2 text-base font-bold text-[#1f2a24] sm:text-lg">
                Soal {qIdx + 1}: {question.prompt}
              </legend>

              <div className="space-y-2.5 pt-1">
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
                        name={question.id}
                        value={choice.id}
                        checked={checked}
                        onChange={() =>
                          setAnswers((prev) => ({
                            ...prev,
                            [question.id]: choice.id,
                          }))
                        }
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

              {feedback ? (
                <div
                  className={
                    feedback.is_correct
                      ? "flex items-start gap-2 rounded-xl bg-[#dcfce7] p-3 text-sm text-[#166534]"
                      : "flex items-start gap-2 rounded-xl bg-[#fde8e6] p-3 text-sm text-[#b42318]"
                  }
                >
                  {feedback.is_correct ? (
                    <CheckCircle2
                      size={18}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <XCircle
                      size={18}
                      strokeWidth={1.75}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <p className="font-bold">
                      {feedback.is_correct ? "Benar!" : "Belum tepat."}
                    </p>
                    <p>{feedback.explanation}</p>
                  </div>
                </div>
              ) : null}
            </fieldset>
          );
        })}

        {error ? (
          <p role="alert" className="rounded-xl bg-[#fde8e6] p-4 text-sm font-bold text-[#b42318]">
            {error}
          </p>
        ) : null}

        {!result ? (
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? "Memeriksa..." : "Periksa Jawaban"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
