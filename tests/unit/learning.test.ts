import { describe, expect, it } from "vitest";
import {
  gradeQuizAttempt,
  isValidJoinCodeFormat,
  normalizeJoinCode,
} from "@/modules/learning/quiz";

describe("Normalisasi kode tugas", () => {
  it("menghapus spasi dan tanda hubung lalu mengubah ke huruf besar", () => {
    expect(normalizeJoinCode(" ab34-cd56 ef ")).toBe("AB34CD56EF");
    expect(isValidJoinCodeFormat("ab34-cd56-ef")).toBe(true);
  });

  it("menolak karakter ambigu seperti O, I, L, 0, 1", () => {
    expect(isValidJoinCodeFormat("AB34CD56O0")).toBe(false);
    expect(isValidJoinCodeFormat("AB34CD56IL")).toBe(false);
  });
});

describe("Penilaian kuis di server", () => {
  const q1 = "11111111-1111-4111-8111-111111111111";
  const q2 = "22222222-2222-4222-8222-222222222222";
  const c1a = "aaaa1111-1111-4111-8111-111111111111";
  const c1b = "bbbb1111-1111-4111-8111-111111111111";
  const c2a = "aaaa2222-2222-4222-8222-222222222222";
  const c2b = "bbbb2222-2222-4222-8222-222222222222";

  const questions = [
    { question_id: q1, correct_choice_id: c1a, valid_choice_ids: [c1a, c1b] },
    { question_id: q2, correct_choice_id: c2b, valid_choice_ids: [c2a, c2b] },
  ] as const;

  it("menghitung skor berdasarkan total soal revisi meskipun ada soal kosong", () => {
    const result = gradeQuizAttempt(questions, [
      { question_id: q1, selected_choice_id: c1a },
      { question_id: q2, selected_choice_id: null },
    ]);

    expect(result.correct_count).toBe(1);
    expect(result.question_count).toBe(2);
    expect(result.score).toBe(50);
  });

  it("menolak choice_id milik pertanyaan lain", () => {
    expect(() =>
      gradeQuizAttempt(questions, [
        { question_id: q1, selected_choice_id: c2a },
      ])
    ).toThrow(/bukan milik pertanyaan/);
  });

  it("menolak question_id asing atau duplikat", () => {
    expect(() =>
      gradeQuizAttempt(questions, [
        { question_id: "99999999-9999-4999-8999-999999999999", selected_choice_id: null },
      ])
    ).toThrow(/tidak termasuk/);

    expect(() =>
      gradeQuizAttempt(questions, [
        { question_id: q1, selected_choice_id: c1a },
        { question_id: q1, selected_choice_id: c1b },
      ])
    ).toThrow(/Duplikasi/);
  });
});
