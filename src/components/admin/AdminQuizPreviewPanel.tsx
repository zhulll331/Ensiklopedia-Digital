"use client";

import { useId, useState } from "react";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import {
  QUIZ_USAGE_MODE_LABELS,
  type QuizUsageMode,
} from "@/modules/admin/quiz-schemas";

export interface PreviewQuizQuestion {
  localKey: string;
  prompt: string;
  choices: Array<{ label: string }>;
  correct_choice_position: number;
  explanation: string;
  mediaLabel: string | null;
}

export interface AdminQuizPreviewPanelProps {
  title: string;
  grade: 3 | 4;
  usageMode: QuizUsageMode;
  instructions: string;
  questions: readonly PreviewQuizQuestion[];
}

const CHOICE_LETTERS = ["A", "B", "C", "D"] as const;

export function AdminQuizPreviewPanel({
  title,
  grade,
  usageMode,
  instructions,
  questions,
}: AdminQuizPreviewPanelProps) {
  const baseId = useId();
  const [showKeys, setShowKeys] = useState(false);

  return (
    <section
      aria-labelledby={`${baseId}-preview-heading`}
      className="space-y-4 rounded-2xl border border-[#2f6b4f]/35 bg-[#f0f6f0]/55 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2
            id={`${baseId}-preview-heading`}
            className="text-base font-bold text-[#1f2a24]"
          >
            Pratinjau Kuis Admin (Terlindungi Sesi &amp; no-store)
          </h2>
          <p className="text-xs text-[#3a4640]">
            Simulasi tampilan soal bagi siswa. Kunci jawaban dan pembahasan di
            bawah hanya muncul di portal admin terautentikasi MFA (SEC-08).
          </p>
        </div>

        <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d6cec1] bg-white px-3 py-2">
          <input
            id={`${baseId}-toggle-keys`}
            type="checkbox"
            checked={showKeys}
            onChange={(e) => setShowKeys(e.target.checked)}
            className="h-4 w-4 accent-[#1f4d38]"
          />
          <label
            htmlFor={`${baseId}-toggle-keys`}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#1f4d38]"
          >
            {showKeys ? (
              <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
            Tampilkan Kunci Jawaban &amp; Pembahasan
          </label>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-[#d6cec1] bg-white p-4">
        <div className="space-y-1 border-b border-[#efeae2] pb-3">
          <p className="text-xs font-bold text-[#1f4d38]">
            Kelas {grade === 3 ? "III" : "IV"} •{" "}
            {QUIZ_USAGE_MODE_LABELS[usageMode]}
          </p>
          <p className="text-base font-extrabold text-[#1f2a24]">
            {title || "(Judul belum diisi)"}
          </p>
          {instructions.trim() ? (
            <p className="text-xs text-[#3a4640]">{instructions}</p>
          ) : null}
        </div>

        {questions.length === 0 ? (
          <p className="text-xs text-[#5b6760]">
            Belum ada butir soal untuk dipratinjau.
          </p>
        ) : (
          <ol className="space-y-4 pl-4">
            {questions.map((q, qIdx) => (
              <li
                key={q.localKey}
                className="space-y-2 rounded-xl border border-[#efeae2] bg-[#faf6ee]/60 p-3.5"
              >
                <p className="text-sm font-bold text-[#1f2a24]">
                  {qIdx + 1}. {q.prompt.trim() || "(Teks pertanyaan kosong)"}
                </p>
                {q.mediaLabel ? (
                  <p className="text-[11px] font-semibold text-[#5b6760]">
                    Lampiran media: <code>{q.mediaLabel}</code>
                  </p>
                ) : null}
                <ul className="grid list-none gap-1.5 p-0 sm:grid-cols-2">
                  {q.choices.map((c, cIdx) => {
                    const pos = cIdx + 1;
                    const isCorrect =
                      showKeys && pos === q.correct_choice_position;
                    return (
                      <li
                        key={`${q.localKey}-c-${pos}`}
                        className={
                          isCorrect
                            ? "flex items-center justify-between gap-2 rounded-lg border border-[#166534]/40 bg-[#dcfce7] px-3 py-2 text-xs font-bold text-[#166534]"
                            : "rounded-lg border border-[#d6cec1] bg-white px-3 py-2 text-xs text-[#1f2a24]"
                        }
                      >
                        <span>
                          {CHOICE_LETTERS[cIdx] ?? pos}.{" "}
                          {c.label.trim() || "(Kosong)"}
                        </span>
                        {isCorrect ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#166534]">
                            <CheckCircle2
                              size={12}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                            Kunci
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {showKeys && q.explanation.trim() ? (
                  <p className="rounded-lg border border-[#2f6b4f]/25 bg-white px-3 py-2 text-xs text-[#1f4d38]">
                    <strong>Pembahasan:</strong> {q.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
