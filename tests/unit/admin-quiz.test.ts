import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createQuizSchema,
  detectPracticePromptOverlap,
  evaluateQuizPublishGate,
  mapAdminQuizPostgresError,
  QUIZ_MAX_QUESTIONS,
  upsertQuizDraftSchema,
} from "@/modules/admin/quiz-schemas";

const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";

describe("Bank Kuis Admin: Skema, Gate Paritas & Keamanan (Fase 5)", () => {
  it("memvalidasi createQuizSchema dan menolak slug/judul/grade/mode tidak sah", () => {
    const ok = createQuizSchema.safeParse({
      slug: "kuis-menhir-kelas-3",
      title: "Mengenal Menhir di Banyuwangi",
      grade: 3,
      usage_mode: "practice",
      instructions: "Pilih jawaban yang paling tepat.",
    });
    expect(ok.success).toBe(true);

    expect(
      createQuizSchema.safeParse({
        slug: "Salah Format Slug!",
        title: "Judul Sah",
        grade: 3,
        usage_mode: "practice",
      }).success
    ).toBe(false);

    expect(
      createQuizSchema.safeParse({
        slug: "kuis-sah",
        title: "Judul Sah",
        grade: 5,
        usage_mode: "practice",
      }).success
    ).toBe(false);
  });

  it("memvalidasi upsertQuizDraftSchema (2–4 opsi, 1–50 soal, posisi kunci valid)", () => {
    const validDraft = upsertQuizDraftSchema.safeParse({
      title: "Kuis Batu Kenong",
      grade: 4,
      usage_mode: "assignment",
      instructions: "Kerjakan dengan teliti.",
      questions: [
        {
          prompt: "Apa ciri khas batu kenong pada bagian atasnya?",
          media_asset_id: VALID_UUID_1,
          choices: [{ label: "Memiliki tonjolan bulat" }, { label: "Berlubang tembus" }],
          correct_choice_position: 1,
          explanation: "Tonjolan bulat menyerupai alat musik kenong.",
          sources: [{ source_id: VALID_UUID_2, locator: "Hal. 12" }],
        },
      ],
    });
    expect(validDraft.success).toBe(true);

    // Tolak pilihan kurang dari 2
    const oneChoice = upsertQuizDraftSchema.safeParse({
      title: "Kuis Uji",
      grade: 3,
      usage_mode: "practice",
      instructions: "",
      questions: [
        {
          prompt: "Pertanyaan valid minimal 3 huruf?",
          choices: [{ label: "Hanya satu opsi" }],
          correct_choice_position: 1,
        },
      ],
    });
    expect(oneChoice.success).toBe(false);

    // Tolak pilihan lebih dari 4
    const fiveChoices = upsertQuizDraftSchema.safeParse({
      title: "Kuis Uji",
      grade: 3,
      usage_mode: "practice",
      instructions: "",
      questions: [
        {
          prompt: "Pertanyaan lima pilihan?",
          choices: [
            { label: "A" },
            { label: "B" },
            { label: "C" },
            { label: "D" },
            { label: "E" },
          ],
          correct_choice_position: 1,
        },
      ],
    });
    expect(fiveChoices.success).toBe(false);

    // Tolak posisi kunci melebihi jumlah pilihan
    const badKeyPos = upsertQuizDraftSchema.safeParse({
      title: "Kuis Uji",
      grade: 3,
      usage_mode: "practice",
      instructions: "",
      questions: [
        {
          prompt: "Pertanyaan dengan kunci di luar jangkauan?",
          choices: [{ label: "A" }, { label: "B" }],
          correct_choice_position: 4,
        },
      ],
    });
    expect(badKeyPos.success).toBe(false);

    // Tolak lebih dari 50 soal
    const tooMany = Array.from({ length: QUIZ_MAX_QUESTIONS + 1 }, (_, i) => ({
      prompt: `Soal nomor ${i + 1}`,
      choices: [{ label: "A" }, { label: "B" }],
      correct_choice_position: 1,
    }));
    expect(
      upsertQuizDraftSchema.safeParse({
        title: "Kuis Kelebihan Soal",
        grade: 4,
        usage_mode: "practice",
        instructions: "",
        questions: tooMany,
      }).success
    ).toBe(false);
  });

  it("menjaga paritas gate publikasi kuis pada semua syarat kelayakan", () => {
    // 1. Lengkap tanpa media -> ready
    const readyNoMedia = evaluateQuizPublishGate({
      status: "approved",
      questions: [
        { choices_count: 3, has_valid_answer_key: true, media_asset: null },
      ],
      approved_reviews: ["language", "material"],
    });
    expect(readyNoMedia.ready).toBe(true);

    // 2. Status belum 'approved' (masih in_review) -> blocked
    expect(
      evaluateQuizPublishGate({
        status: "in_review",
        questions: [
          { choices_count: 3, has_valid_answer_key: true, media_asset: null },
        ],
        approved_reviews: ["language", "material"],
      }).ready
    ).toBe(false);

    // 3. Soal kosong -> blocked
    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [],
        approved_reviews: ["language", "material"],
      }).ready
    ).toBe(false);

    // 4. Kunci jawaban hilang -> blocked
    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [
          { choices_count: 3, has_valid_answer_key: false, media_asset: null },
        ],
        approved_reviews: ["language", "material"],
      }).ready
    ).toBe(false);

    // 5. Hanya review bahasa (materi belum) -> blocked
    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [
          { choices_count: 3, has_valid_answer_key: true, media_asset: null },
        ],
        approved_reviews: ["language"],
      }).ready
    ).toBe(false);

    // 6. Media terpasang tapi masih karantina atau tanpa review media -> blocked
    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [
          {
            choices_count: 3,
            has_valid_answer_key: true,
            media_asset: { scan_status: "quarantine", metadata_scrubbed: false },
          },
        ],
        approved_reviews: ["language", "material", "media"],
      }).ready
    ).toBe(false);

    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [
          {
            choices_count: 3,
            has_valid_answer_key: true,
            media_asset: { scan_status: "cleared", metadata_scrubbed: true },
          },
        ],
        approved_reviews: ["language", "material"],
      }).ready
    ).toBe(false);

    // 7. Media cleared + EXIF scrubbed + review media disetujui -> ready
    expect(
      evaluateQuizPublishGate({
        status: "approved",
        questions: [
          {
            choices_count: 3,
            has_valid_answer_key: true,
            media_asset: { scan_status: "cleared", metadata_scrubbed: true },
          },
        ],
        approved_reviews: ["language", "material", "media"],
      }).ready
    ).toBe(true);
  });

  it("mendeteksi soal latihan yang dipakai ulang pada kuis mode tugas", () => {
    const warnings = detectPracticePromptOverlap(
      [
        {
          position: 1,
          prompt: "  Apa arti kata MEGA pada istilah megalitik? ",
        },
        {
          position: 2,
          prompt: "Mengapa pelestarian dolmen harus melibatkan warga sekitar?",
        },
      ],
      [
        {
          quiz_id: "q1",
          quiz_slug: "latihan-mengenal-megalitik-kelas-3",
          quiz_title: "[Sampel] Latihan: Mengenal Batu Megalitik (Kelas III)",
          prompt: "Apa arti kata 'mega' pada istilah megalitik?",
        },
      ]
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.position).toBe(1);
    expect(warnings[0]?.matched_quiz_slug).toBe(
      "latihan-mengenal-megalitik-kelas-3"
    );
  });

  it("memetakan error SQL 0016 dan memverifikasi konsistensi migrasi Bank Kuis", () => {
    expect(
      mapAdminQuizPostgresError({ message: "STATE_CONFLICT:LOCKED_BY_ASSIGNMENT" })
        ?.status
    ).toBe(409);
    expect(
      mapAdminQuizPostgresError({ message: "VALIDATION_FAILED:ANSWER_KEY_REQUIRED" })
        ?.status
    ).toBe(422);
    expect(
      mapAdminQuizPostgresError({ message: "VALIDATION_FAILED:SLUG_EXISTS" })
        ?.status
    ).toBe(409);

    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0016_admin_quiz_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");

    const requiredFunctions = [
      "api.get_admin_quiz_answer_keys",
      "api.create_quiz_with_draft",
      "api.create_new_quiz_revision",
      "api.upsert_quiz_revision_draft",
      "api.add_quiz_revision_review",
      "api.transition_quiz_revision",
      "api.publish_quiz_revision",
    ];
    for (const fn of requiredFunctions) {
      expect(sql).toContain(fn);
    }

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("delete from private.quiz_answer_keys");
    expect(sql).toContain("STATE_CONFLICT:REQUIRES_APPROVED");
    expect(sql).toContain("VALIDATION_FAILED:QUESTIONS_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:ANSWER_KEY_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:REVIEWS_REQUIRED");
    expect(sql).toContain("VALIDATION_FAILED:MEDIA_NOT_CLEARED");
    expect(sql).toContain("VALIDATION_FAILED:MEDIA_REVIEW_REQUIRED");
  });
});
