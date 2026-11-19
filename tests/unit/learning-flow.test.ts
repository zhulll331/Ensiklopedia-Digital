import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  autosaveGuestAnswers,
  checkPracticeQuizSubmission,
  createTeacherCsvExport,
  DomainError,
  downloadTeacherCsvExport,
  endGuestSession,
  getGuestResult,
  getPublicPracticeQuizById,
  getTeacherAssignmentResults,
  resetServerStoreForTests,
  resolveGuestJoin,
  startGuestAttempt,
  submitGuestAttempt,
} from "@/modules/learning/server-store";

describe("Alur Latihan Umum & Isolasi Kunci (FR-08, SEC-08)", () => {
  beforeEach(() => {
    resetServerStoreForTests();
  });

  it("payload soal latihan tidak pernah menyertakan kunci atau pembahasan", () => {
    const quiz = getPublicPracticeQuizById("quiz-practice-3");
    expect(quiz).not.toBeNull();
    const serialized = JSON.stringify(quiz);
    expect(serialized).not.toContain("correct_choice_id");
    expect(serialized).not.toContain("explanation");
  });

  it("penilaian latihan menghitung benar/salah di server", () => {
    const result = checkPracticeQuizSubmission("quiz-practice-3", [
      {
        question_id: "10000000-0000-4000-8000-000000000001",
        selected_choice_id: "c1000000-0000-4000-8000-000000000001",
      },
    ]);
    expect(result.correct_count).toBe(1);
    expect(result.question_count).toBe(5);
    expect(result.score).toBe(20);
  });
});

describe("Alur Tugas Siswa Tanpa Login, Autosave, Idempotency & Cleanup (FR-11, AT-14)", () => {
  beforeEach(() => {
    resetServerStoreForTests();
  });

  it("menolak kode tidak valid dengan 404 tanpa membocorkan data", () => {
    expect(() => resolveGuestJoin({ join_code: "ZZZZZZZZZZ" })).toThrow(DomainError);
  });

  it("menjalankan siklus lengkap start -> autosave -> konflik revisi -> submit idempoten -> end session", () => {
    const resolved = resolveGuestJoin({ join_code: "EDMB34ABCD" });
    expect(resolved.can_start).toBe(true);

    const started = startGuestAttempt({
      join_code: "EDMB34ABCD",
      student_name: "=SUM(1,2)",
      privacy_notice_version: "1.0",
    });

    // Pastikan tidak ada kunci jawaban pada payload soal siswa
    const payloadJson = JSON.stringify(started.payload);
    expect(payloadJson).not.toContain("correct_choice_id");
    expect(payloadJson).not.toContain("explanation");

    const q1 = started.payload.questions[0]!;
    const firstChoice = q1.choices[0]!;

    // Autosave revisi 0 -> naik ke 1
    const saved = autosaveGuestAnswers(started.rawSessionToken, {
      expected_revision: 0,
      answers: [{ question_id: q1.id, selected_choice_id: firstChoice.id }],
    });
    expect(saved.answer_revision).toBe(1);

    // Revisi usang (0) ditolak 409 REVISION_CONFLICT
    expect(() =>
      autosaveGuestAnswers(started.rawSessionToken, {
        expected_revision: 0,
        answers: [{ question_id: q1.id, selected_choice_id: firstChoice.id }],
      })
    ).toThrow(/konflik|berubah/i);

    // Submit final dengan Idempotency-Key
    const finalAnswers = [{ question_id: q1.id, selected_choice_id: firstChoice.id }];
    const idemKey = "11111111-2222-4333-8444-555555555555";
    const firstSubmit = submitGuestAttempt(started.rawSessionToken, idemKey, {
      answers: finalAnswers,
      confirm_submit: true,
    });
    expect(firstSubmit.receipt.score).toBe(20);

    // Replay dengan key sama & payload sama mengembalikan receipt identik
    const replaySubmit = submitGuestAttempt(started.rawSessionToken, idemKey, {
      answers: finalAnswers,
      confirm_submit: true,
    });
    expect(replaySubmit.receipt.receipt_code).toBe(firstSubmit.receipt.receipt_code);

    // Key sama tetapi payload berbeda -> 409 IDEMPOTENCY_CONFLICT
    expect(() =>
      submitGuestAttempt(started.rawSessionToken, idemKey, {
        answers: [{ question_id: q1.id, selected_choice_id: null }],
        confirm_submit: true,
      })
    ).toThrow(/berbeda/i);

    // Selesai / ganti siswa mencabut sesi baca hasil (AT-14)
    endGuestSession(started.rawSessionToken);
    expect(() => getGuestResult(started.rawSessionToken)).toThrow(/berakhir/i);
  });
});

describe("Isolasi Lintas Guru, Nama Ganda & Ekspor CSV Aman (FR-12, AT-11, AT-16)", () => {
  beforeEach(() => {
    resetServerStoreForTests();
  });

  it("menolak guru lain mengakses rekap dan ekspor guru pemilik tugas (AT-11)", () => {
    expect(() =>
      getTeacherAssignmentResults("teacher-demo-2", "asg-demo-1")
    ).toThrow(/tidak ditemukan/i);

    const exp = createTeacherCsvExport("teacher-demo-1", "asg-demo-1");
    expect(() =>
      downloadTeacherCsvExport("teacher-demo-2", exp.export_id)
    ).toThrow(/tidak ditemukan/i);
  });

  it("memisahkan dua siswa bernama sama dan menetralkan formula CSV", () => {
    const s1 = startGuestAttempt({
      join_code: "EDMB34ABCD",
      student_name: "=CMD()",
      privacy_notice_version: "1.0",
    });
    const s2 = startGuestAttempt({
      join_code: "EDMB34ABCD",
      student_name: "=CMD()",
      privacy_notice_version: "1.0",
    });

    submitGuestAttempt(s1.rawSessionToken, "aaaa-1111-bbbb-2222", {
      answers: [],
      confirm_submit: true,
    });
    submitGuestAttempt(s2.rawSessionToken, "cccc-3333-dddd-4444", {
      answers: [],
      confirm_submit: true,
    });

    const results = getTeacherAssignmentResults("teacher-demo-1", "asg-demo-1");
    expect(results.submissions).toHaveLength(2);
    expect(results.submissions.every((r) => r.duplicate_name)).toBe(true);

    const exp = createTeacherCsvExport("teacher-demo-1", "asg-demo-1");
    const file = downloadTeacherCsvExport("teacher-demo-1", exp.export_id);
    expect(file.csv_content).toContain(`"'=CMD()"`);
  });
});
