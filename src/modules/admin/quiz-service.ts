import "server-only";
import { revalidatePath } from "next/cache";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
} from "@/lib/server/env";
import {
  createAdminSecretSupabaseClient,
  createAdultSessionSupabaseClient,
} from "@/lib/server/supabase";
import type { AdminSessionResult } from "@/modules/admin/auth";
import type {
  AdminMediaOption,
  AdminSourceOption,
} from "@/modules/admin/cms-service";
import {
  detectPracticePromptOverlap,
  evaluateQuizPublishGate,
  mapAdminQuizPostgresError,
  type PracticePromptIndexEntry,
  type QuizPracticeOverlapWarning,
  type QuizPublishGateResult,
  type QuizReviewDecision,
  type QuizReviewType,
  type QuizUsageMode,
} from "@/modules/admin/quiz-schemas";
import { SAMPLE_MEDIA, SAMPLE_SOURCES } from "@/modules/content/sample-data";
import type { ContentStatus } from "@/modules/content/types";
import { DomainError } from "@/modules/learning/errors";
import {
  SAMPLE_ASSIGNMENT_QUIZZES,
  SAMPLE_PRACTICE_QUIZZES,
} from "@/modules/learning/sample-quizzes";
import { isSupabaseSchemaNotReadyError } from "@/modules/learning/supabase-store";

export interface AdminQuizListRow {
  quiz_id: string;
  revision_id: string;
  slug: string;
  version_no: number;
  title: string;
  grade: 3 | 4;
  usage_mode: QuizUsageMode;
  status: ContentStatus;
  is_live_published: boolean;
  question_count: number;
  approved_reviews: QuizReviewType[];
  created_at_utc: string;
  published_at: string | null;
  publish_gate: QuizPublishGateResult;
}

export interface AdminQuizSummaryCounts {
  total: number;
  practice: number;
  assignment: number;
  draft: number;
  in_review: number;
  approved: number;
  published: number;
  archived: number;
}

export interface AdminQuizListResult {
  items: AdminQuizListRow[];
  counts: AdminQuizSummaryCounts;
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

export interface AdminQuizChoiceItem {
  id: string;
  position: 1 | 2 | 3 | 4;
  label: string;
}

export interface AdminQuizQuestionSourceItem {
  source_id: string;
  citation_text: string;
  locator: string;
}

export interface AdminQuizQuestionItem {
  id: string;
  position: number;
  prompt: string;
  media_asset_id: string | null;
  media_asset: {
    id: string;
    storage_path: string;
    scan_status: "quarantine" | "cleared" | "rejected";
    metadata_scrubbed: boolean;
  } | null;
  choices: AdminQuizChoiceItem[];
  correct_choice_id: string | null;
  correct_choice_position: number;
  explanation: string;
  sources: AdminQuizQuestionSourceItem[];
}

export interface AdminQuizReviewItem {
  id: string;
  review_type: QuizReviewType;
  decision: QuizReviewDecision;
  reviewer_label: string;
  evidence_asset_id: string | null;
  reviewed_at: string;
}

export interface AdminQuizRevisionDetail {
  quiz_id: string;
  revision_id: string;
  slug: string;
  version_no: number;
  title: string;
  grade: 3 | 4;
  usage_mode: QuizUsageMode;
  instructions: string;
  status: ContentStatus;
  is_live_published: boolean;
  published_revision_id: string | null;
  created_at_utc: string;
  published_at: string | null;
  questions: AdminQuizQuestionItem[];
  reviews: AdminQuizReviewItem[];
  revisions: Array<{
    id: string;
    version_no: number;
    status: ContentStatus;
    created_at_utc: string;
  }>;
  publish_gate: QuizPublishGateResult;
  practice_overlaps: QuizPracticeOverlapWarning[];
  available_media: AdminMediaOption[];
  available_sources: AdminSourceOption[];
  mode: "supabase" | "local_demo";
  migrationPending: boolean;
}

interface DemoAnswerKeyEntry {
  correct_choice_position: number;
  explanation: string;
}

// Kunci jawaban sampel mode demo lokal — hanya ada di modul server-only (SEC-08)
const DEMO_SAMPLE_ANSWER_KEYS = new Map<string, DemoAnswerKeyEntry>([
  ["10000000-0000-4000-8000-000000000001", { correct_choice_position: 1, explanation: "'Mega' berarti besar dan 'lithos' berarti batu." }],
  ["10000000-0000-4000-8000-000000000002", { correct_choice_position: 2, explanation: "Menhir adalah batu tunggal yang berdiri tegak." }],
  ["10000000-0000-4000-8000-000000000003", { correct_choice_position: 1, explanation: "Dolmen tersusun menyerupai meja dari lempengan batu datar." }],
  ["10000000-0000-4000-8000-000000000004", { correct_choice_position: 1, explanation: "Bentuk tonjolan di atas batu silinder mirip alat musik kenong." }],
  ["10000000-0000-4000-8000-000000000005", { correct_choice_position: 3, explanation: "Kita menjaga peninggalan dengan tidak menyentuh, memindahkan, atau mencoretnya." }],
  ["20000000-0000-4000-8000-000000000001", { correct_choice_position: 1, explanation: "Tradisi batu besar disebut megalitik." }],
  ["20000000-0000-4000-8000-000000000002", { correct_choice_position: 2, explanation: "Menhir berdiri tegak sedangkan dolmen berbentuk meja batu." }],
  ["20000000-0000-4000-8000-000000000003", { correct_choice_position: 1, explanation: "Arkeologi meneliti peninggalan manusia masa lalu." }],
  ["20000000-0000-4000-8000-000000000004", { correct_choice_position: 2, explanation: "Peta wilayah umum melindungi situs dari vandalisme." }],
  ["20000000-0000-4000-8000-000000000005", { correct_choice_position: 3, explanation: "Segera laporkan kerusakan kepada guru atau pengelola." }],
  ["30000000-0000-4000-8000-000000000001", { correct_choice_position: 2, explanation: "Posisi asli benda membantu ahli membaca konteks sejarah." }],
  ["30000000-0000-4000-8000-000000000002", { correct_choice_position: 2, explanation: "Batu kenong memiliki tonjolan bulat di bagian atas." }],
  ["30000000-0000-4000-8000-000000000003", { correct_choice_position: 1, explanation: "Dolmen ditopang oleh beberapa batu penyangga." }],
  ["30000000-0000-4000-8000-000000000004", { correct_choice_position: 1, explanation: "Menjaga warisan agar lestari disebut pelestarian." }],
  ["30000000-0000-4000-8000-000000000005", { correct_choice_position: 3, explanation: "Dilarang duduk atau mencoret permukaan peninggalan batu." }],
]);

function extractJsonText(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "text" in val) {
    return String((val as { text?: unknown }).text ?? "");
  }
  return "";
}

function summarizeQuizCounts(rows: readonly AdminQuizListRow[]): AdminQuizSummaryCounts {
  const counts: AdminQuizSummaryCounts = {
    total: rows.length,
    practice: 0,
    assignment: 0,
    draft: 0,
    in_review: 0,
    approved: 0,
    published: 0,
    archived: 0,
  };

  for (const row of rows) {
    if (row.usage_mode === "practice") counts.practice += 1;
    else counts.assignment += 1;
    counts[row.status] += 1;
  }

  return counts;
}

function buildDemoQuizListAndDetails(): {
  rows: AdminQuizListRow[];
  detailsByRevisionId: Map<string, AdminQuizRevisionDetail>;
} {
  const availableMedia: AdminMediaOption[] = SAMPLE_MEDIA.filter(
    (m) => m.kind === "image" || m.kind === "illustration"
  ).map((m) => ({
    id: m.id,
    kind: m.kind,
    storage_bucket: "media-public",
    storage_path: m.src,
    visibility: "public",
    scan_status: m.scan_status,
    metadata_scrubbed: m.metadata_scrubbed,
    credit: m.credit,
    license: m.license,
  }));

  const availableSources: AdminSourceOption[] = Object.values(SAMPLE_SOURCES).map(
    (s) => ({
      id: s.id,
      citation_text: s.citation_text,
      url: null,
      doi: null,
      accessed_at: null,
      source_type: s.source_type,
    })
  );

  const practicePrompts: PracticePromptIndexEntry[] = [];
  for (const pq of SAMPLE_PRACTICE_QUIZZES) {
    for (const q of pq.questions) {
      practicePrompts.push({
        quiz_id: pq.id,
        quiz_slug: pq.slug,
        quiz_title: pq.title,
        prompt: q.prompt,
      });
    }
  }

  const allPublished = [...SAMPLE_PRACTICE_QUIZZES, ...SAMPLE_ASSIGNMENT_QUIZZES];
  const rows: AdminQuizListRow[] = [];
  const details = new Map<string, AdminQuizRevisionDetail>();

  for (const sample of allPublished) {
    const reviews: AdminQuizReviewItem[] = [
      {
        id: `demo-rev-lang-${sample.id}`,
        review_type: "language",
        decision: "approved",
        reviewer_label: "Validator Bahasa SD Banyuwangi",
        evidence_asset_id: null,
        reviewed_at: "2026-04-01T08:00:00Z",
      },
      {
        id: `demo-rev-mat-${sample.id}`,
        review_type: "material",
        decision: "approved",
        reviewer_label: "Kurator Arkeologi Banyuwangi",
        evidence_asset_id: null,
        reviewed_at: "2026-04-01T09:00:00Z",
      },
    ];

    const questions: AdminQuizQuestionItem[] = sample.questions.map((q) => {
      const key = DEMO_SAMPLE_ANSWER_KEYS.get(q.id);
      const correctChoice = q.choices.find(
        (c) => c.position === (key?.correct_choice_position ?? 1)
      );
      return {
        id: q.id,
        position: q.position,
        prompt: q.prompt,
        media_asset_id: null,
        media_asset: null,
        choices: q.choices.map((c) => ({ ...c })),
        correct_choice_id: correctChoice?.id ?? null,
        correct_choice_position: key?.correct_choice_position ?? 1,
        explanation: key?.explanation ?? "",
        sources: availableSources[0]
          ? [
              {
                source_id: availableSources[0].id,
                citation_text: availableSources[0].citation_text,
                locator: "Bagian Dasar Megalitik",
              },
            ]
          : [],
      };
    });

    const gate = evaluateQuizPublishGate({
      status: "published",
      questions: questions.map((q) => ({
        choices_count: q.choices.length,
        has_valid_answer_key: Boolean(q.correct_choice_id),
        media_asset: null,
      })),
      approved_reviews: ["language", "material"],
    });

    rows.push({
      quiz_id: sample.id,
      revision_id: sample.revision_id,
      slug: sample.slug,
      version_no: 1,
      title: sample.title,
      grade: sample.grade,
      usage_mode: sample.usage_mode,
      status: "published",
      is_live_published: true,
      question_count: questions.length,
      approved_reviews: ["language", "material"],
      created_at_utc: "2026-04-01T07:00:00Z",
      published_at: "2026-04-01T10:00:00Z",
      publish_gate: gate,
    });

    details.set(sample.revision_id, {
      quiz_id: sample.id,
      revision_id: sample.revision_id,
      slug: sample.slug,
      version_no: 1,
      title: sample.title,
      grade: sample.grade,
      usage_mode: sample.usage_mode,
      instructions: sample.instructions,
      status: "published",
      is_live_published: true,
      published_revision_id: sample.revision_id,
      created_at_utc: "2026-04-01T07:00:00Z",
      published_at: "2026-04-01T10:00:00Z",
      questions,
      reviews,
      revisions: [
        {
          id: sample.revision_id,
          version_no: 1,
          status: "published",
          created_at_utc: "2026-04-01T07:00:00Z",
        },
      ],
      publish_gate: gate,
      practice_overlaps:
        sample.usage_mode === "assignment"
          ? detectPracticePromptOverlap(questions, practicePrompts)
          : [],
      available_media: availableMedia,
      available_sources: availableSources,
      mode: "local_demo",
      migrationPending: false,
    });
  }

  // Sampel Draf Kuis Tugas Kelas IV dengan 1 soal identik dengan kuis latihan (uji deteksi overlap)
  const draftQuestions: AdminQuizQuestionItem[] = [
    {
      id: "40000000-0000-4000-8000-000000000001",
      position: 1,
      prompt: "Apa arti kata 'mega' pada istilah megalitik?",
      media_asset_id: null,
      media_asset: null,
      choices: [
        { id: "f1000000-0000-4000-8000-000000000001", position: 1, label: "Besar" },
        { id: "f1000000-0000-4000-8000-000000000002", position: 2, label: "Kecil" },
        { id: "f1000000-0000-4000-8000-000000000003", position: 3, label: "Cepat" },
      ],
      correct_choice_id: "f1000000-0000-4000-8000-000000000001",
      correct_choice_position: 1,
      explanation: "Mega berasal dari bahasa Yunani yang berarti besar.",
      sources: [],
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      position: 2,
      prompt: "Mengapa penemu benda batu bersejarah sebaiknya melapor ke guru atau dinas budaya?",
      media_asset_id: availableMedia[0]?.id ?? null,
      media_asset: availableMedia[0]
        ? {
            id: availableMedia[0].id,
            storage_path: availableMedia[0].storage_path,
            scan_status: availableMedia[0].scan_status,
            metadata_scrubbed: true,
          }
        : null,
      choices: [
        { id: "f2000000-0000-4000-8000-000000000001", position: 1, label: "Agar benda dapat diamankan dan diteliti dengan aman" },
        { id: "f2000000-0000-4000-8000-000000000002", position: 2, label: "Agar batu bisa dibawa pulang masing-masing" },
        { id: "f2000000-0000-4000-8000-000000000003", position: 3, label: "Supaya bentuk batunya dicat ulang" },
      ],
      correct_choice_id: "f2000000-0000-4000-8000-000000000001",
      correct_choice_position: 1,
      explanation: "Pelaporan menjaga keamanan lokasi dan keaslian temuan.",
      sources: [],
    },
  ];

  const draftGate = evaluateQuizPublishGate({
    status: "draft",
    questions: draftQuestions.map((q) => ({
      choices_count: q.choices.length,
      has_valid_answer_key: true,
      media_asset: q.media_asset,
    })),
    approved_reviews: ["language"],
  });

  rows.unshift({
    quiz_id: "quiz-draft-4",
    revision_id: "qrev-draft-4-v1",
    slug: "kuis-tugas-batu-kenong-kelas-4",
    version_no: 1,
    title: "[Draf Bank Soal] Mengenal Batu Kenong Banyuwangi (Kelas IV)",
    grade: 4,
    usage_mode: "assignment",
    status: "draft",
    is_live_published: false,
    question_count: draftQuestions.length,
    approved_reviews: ["language"],
    created_at_utc: "2026-04-02T09:00:00Z",
    published_at: null,
    publish_gate: draftGate,
  });

  details.set("qrev-draft-4-v1", {
    quiz_id: "quiz-draft-4",
    revision_id: "qrev-draft-4-v1",
    slug: "kuis-tugas-batu-kenong-kelas-4",
    version_no: 1,
    title: "[Draf Bank Soal] Mengenal Batu Kenong Banyuwangi (Kelas IV)",
    grade: 4,
    usage_mode: "assignment",
    instructions:
      "Baca setiap pertanyaan tentang situs batu kenong dan pilih satu jawaban yang paling tepat.",
    status: "draft",
    is_live_published: false,
    published_revision_id: null,
    created_at_utc: "2026-04-02T09:00:00Z",
    published_at: null,
    questions: draftQuestions,
    reviews: [
      {
        id: "demo-rev-lang-draft4",
        review_type: "language",
        decision: "approved",
        reviewer_label: "Validator Bahasa SD",
        evidence_asset_id: null,
        reviewed_at: "2026-04-02T09:15:00Z",
      },
    ],
    revisions: [
      {
        id: "qrev-draft-4-v1",
        version_no: 1,
        status: "draft",
        created_at_utc: "2026-04-02T09:00:00Z",
      },
    ],
    publish_gate: draftGate,
    practice_overlaps: detectPracticePromptOverlap(draftQuestions, practicePrompts),
    available_media: availableMedia,
    available_sources: availableSources,
    mode: "local_demo",
    migrationPending: false,
  });

  return { rows, detailsByRevisionId: details };
}

function assertSupabaseWriteReady(session: AdminSessionResult) {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    throw new DomainError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Mode demo lokal hanya menyediakan pratinjau baca-saja untuk Bank Kuis."
    );
  }
  const admin = createAdminSecretSupabaseClient();
  if (!admin || !session.userId || session.status !== "authenticated") {
    throw new DomainError(
      403,
      "ACTION_NOT_ALLOWED",
      "Sesi admin terverifikasi MFA serta SUPABASE_ADMIN_SECRET dibutuhkan untuk menulis kuis."
    );
  }
  return { admin, actorId: session.userId };
}

export function revalidatePublicQuizPaths(slug?: string | null): void {
  revalidatePath("/kuis");
  revalidatePath("/guru");
  revalidatePath("/admin");
  revalidatePath("/admin/kuis");
  if (slug) {
    revalidatePath(`/kuis/latihan/${slug}`);
  }
}

export async function listAdminQuizzesAsync(
  session: AdminSessionResult,
  filters?: {
    grade?: "3" | "4";
    usage_mode?: QuizUsageMode;
    status?: ContentStatus;
    q?: string;
  }
): Promise<AdminQuizListResult> {
  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const { rows } = buildDemoQuizListAndDetails();
    const qLower = (filters?.q ?? "").trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (filters?.grade && String(row.grade) !== filters.grade) return false;
      if (filters?.usage_mode && row.usage_mode !== filters.usage_mode) return false;
      if (filters?.status && row.status !== filters.status) return false;
      if (
        qLower &&
        !row.title.toLowerCase().includes(qLower) &&
        !row.slug.toLowerCase().includes(qLower)
      ) {
        return false;
      }
      return true;
    });

    return {
      items: filtered,
      counts: summarizeQuizCounts(rows),
      mode: "local_demo",
      migrationPending: false,
    };
  }

  const client = await createAdultSessionSupabaseClient();
  if (!client || session.status !== "authenticated") {
    return {
      items: [],
      counts: summarizeQuizCounts([]),
      mode: "supabase",
      migrationPending: false,
    };
  }

  const [{ data: quizzes, error: qErr }, { data: revisions, error: rErr }] =
    await Promise.all([
      client
        .schema("app")
        .from("quizzes")
        .select("id, slug, published_revision_id, created_at"),
      client
        .schema("app")
        .from("quiz_revisions")
        .select(
          "id, quiz_id, version_no, title, grade, usage_mode, status, created_at, published_at"
        )
        .order("created_at", { ascending: false })
        .order("version_no", { ascending: false }),
    ]);

  if (qErr || rErr) {
    const err = qErr ?? rErr;
    if (err && isSupabaseSchemaNotReadyError(err)) {
      return {
        items: [],
        counts: summarizeQuizCounts([]),
        mode: "supabase",
        migrationPending: true,
      };
    }
    throw new Error(`Gagal memuat bank kuis admin: ${err?.message ?? "unknown"}`);
  }

  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const revIds = (revisions ?? []).map((r) => r.id);

  const [{ data: questions }, { data: reviews }] =
    revIds.length > 0
      ? await Promise.all([
          client
            .schema("app")
            .from("quiz_questions")
            .select("id, quiz_revision_id, media_asset_id")
            .in("quiz_revision_id", revIds),
          client
            .schema("app")
            .from("quiz_review_records")
            .select("quiz_revision_id, review_type, decision")
            .in("quiz_revision_id", revIds),
        ])
      : [{ data: [] }, { data: [] }];

  const questionIds = (questions ?? []).map((q) => q.id);
  const mediaIds = Array.from(
    new Set(
      (questions ?? [])
        .map((q) => q.media_asset_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [{ data: choices }, { data: mediaRows }] = await Promise.all([
    questionIds.length > 0
      ? client
          .schema("app")
          .from("quiz_choices")
          .select("question_id")
          .in("question_id", questionIds)
      : Promise.resolve({ data: [] }),
    mediaIds.length > 0
      ? client
          .schema("app")
          .from("media_assets")
          .select("id, scan_status, metadata_scrubbed_at")
          .in("id", mediaIds)
      : Promise.resolve({ data: [] }),
  ]);

  const choiceCountMap = new Map<string, number>();
  for (const c of choices ?? []) {
    choiceCountMap.set(
      c.question_id,
      (choiceCountMap.get(c.question_id) ?? 0) + 1
    );
  }

  const mediaMap = new Map(
    (mediaRows ?? []).map((m) => [
      m.id,
      {
        scan_status: m.scan_status as "quarantine" | "cleared" | "rejected",
        metadata_scrubbed: Boolean(m.metadata_scrubbed_at),
      },
    ])
  );

  const questionsByRev = new Map<
    string,
    Array<{
      choices_count: number;
      has_valid_answer_key: boolean;
      media_asset: {
        scan_status: "quarantine" | "cleared" | "rejected";
        metadata_scrubbed: boolean;
      } | null;
    }>
  >();

  for (const q of questions ?? []) {
    const arr = questionsByRev.get(q.quiz_revision_id) ?? [];
    arr.push({
      choices_count: choiceCountMap.get(q.id) ?? 0,
      has_valid_answer_key: true, // Divalidasi penuh di editor & RPC publish
      media_asset: q.media_asset_id ? mediaMap.get(q.media_asset_id) ?? null : null,
    });
    questionsByRev.set(q.quiz_revision_id, arr);
  }

  const approvedReviewsMap = new Map<string, QuizReviewType[]>();
  for (const revRec of reviews ?? []) {
    if (revRec.decision !== "approved") continue;
    const arr = approvedReviewsMap.get(revRec.quiz_revision_id) ?? [];
    const rt = revRec.review_type as QuizReviewType;
    if (!arr.includes(rt)) arr.push(rt);
    approvedReviewsMap.set(revRec.quiz_revision_id, arr);
  }

  const allRows: AdminQuizListRow[] = (revisions ?? []).map((r) => {
    const parent = quizById.get(r.quiz_id);
    const revQuestions = questionsByRev.get(r.id) ?? [];
    const approvedReviews = approvedReviewsMap.get(r.id) ?? [];
    const status = r.status as ContentStatus;

    return {
      quiz_id: r.quiz_id,
      revision_id: r.id,
      slug: parent?.slug ?? r.quiz_id,
      version_no: r.version_no,
      title: r.title,
      grade: (r.grade === 4 ? 4 : 3) as 3 | 4,
      usage_mode: (r.usage_mode === "assignment" ? "assignment" : "practice") as QuizUsageMode,
      status,
      is_live_published: parent?.published_revision_id === r.id,
      question_count: revQuestions.length,
      approved_reviews: approvedReviews,
      created_at_utc: r.created_at,
      published_at: r.published_at ?? null,
      publish_gate: evaluateQuizPublishGate({
        status,
        questions: revQuestions,
        approved_reviews: approvedReviews,
      }),
    };
  });

  const qLower = (filters?.q ?? "").trim().toLowerCase();
  const filtered = allRows.filter((row) => {
    if (filters?.grade && String(row.grade) !== filters.grade) return false;
    if (filters?.usage_mode && row.usage_mode !== filters.usage_mode) return false;
    if (filters?.status && row.status !== filters.status) return false;
    if (
      qLower &&
      !row.title.toLowerCase().includes(qLower) &&
      !row.slug.toLowerCase().includes(qLower)
    ) {
      return false;
    }
    return true;
  });

  return {
    items: filtered,
    counts: summarizeQuizCounts(allRows),
    mode: "supabase",
    migrationPending: false,
  };
}

export async function getAdminQuizRevisionDetailAsync(
  session: AdminSessionResult,
  quizId: string,
  revisionId: string
): Promise<AdminQuizRevisionDetail | null> {
  if (session.status !== "authenticated") {
    return null;
  }

  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const { detailsByRevisionId } = buildDemoQuizListAndDetails();
    const found = detailsByRevisionId.get(revisionId) ?? null;
    if (!found || found.quiz_id !== quizId) return null;
    return found;
  }

  return loadSupabaseQuizRevisionDetail(session, revisionId, quizId);
}

export async function getAdminQuizRevisionDetailByRevIdAsync(
  session: AdminSessionResult,
  revisionId: string
): Promise<AdminQuizRevisionDetail | null> {
  if (session.status !== "authenticated") {
    return null;
  }

  if (!isSupabaseConfigured() || session.mode === "local_demo") {
    const { detailsByRevisionId } = buildDemoQuizListAndDetails();
    return detailsByRevisionId.get(revisionId) ?? null;
  }

  return loadSupabaseQuizRevisionDetail(session, revisionId);
}

async function loadSupabaseQuizRevisionDetail(
  session: AdminSessionResult,
  revisionId: string,
  expectedQuizId?: string
): Promise<AdminQuizRevisionDetail | null> {
  const client = await createAdultSessionSupabaseClient();
  if (!client || session.status !== "authenticated") return null;

  let revQuery = client
    .schema("app")
    .from("quiz_revisions")
    .select(
      "id, quiz_id, version_no, title, grade, usage_mode, instructions, status, created_at, published_at"
    )
    .eq("id", revisionId);

  if (expectedQuizId) {
    revQuery = revQuery.eq("quiz_id", expectedQuizId);
  }

  const { data: rev, error: revErr } = await revQuery.maybeSingle();
  if (revErr) {
    if (isSupabaseSchemaNotReadyError(revErr)) return null;
    throw new Error(`Gagal memuat detail revisi kuis: ${revErr.message}`);
  }
  if (!rev) return null;

  const { data: quiz, error: quizErr } = await client
    .schema("app")
    .from("quizzes")
    .select("id, slug, published_revision_id")
    .eq("id", rev.quiz_id)
    .maybeSingle();

  if (quizErr || !quiz) return null;

  const [
    { data: siblingRevs },
    { data: qRows },
    { data: reviewRows },
    { data: mediaOptions },
    { data: sourceOptions },
  ] = await Promise.all([
    client
      .schema("app")
      .from("quiz_revisions")
      .select("id, version_no, status, created_at")
      .eq("quiz_id", quiz.id)
      .order("version_no", { ascending: false }),
    client
      .schema("app")
      .from("quiz_questions")
      .select("id, position, prompt_json, media_asset_id")
      .eq("quiz_revision_id", rev.id)
      .order("position", { ascending: true }),
    client
      .schema("app")
      .from("quiz_review_records")
      .select(
        "id, review_type, decision, reviewer_label, evidence_asset_id, reviewed_at"
      )
      .eq("quiz_revision_id", rev.id)
      .order("reviewed_at", { ascending: false }),
    client
      .schema("app")
      .from("media_assets")
      .select(
        "id, kind, storage_bucket, storage_path, visibility, scan_status, metadata_scrubbed_at, credit, license"
      )
      .eq("scan_status", "cleared")
      .eq("visibility", "public")
      .in("kind", ["image", "illustration"])
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .schema("app")
      .from("source_references")
      .select("id, citation_text, url, doi, accessed_at, source_type")
      .order("citation_text", { ascending: true })
      .limit(200),
  ]);

  const qIds = (qRows ?? []).map((q) => q.id);
  const attachedMediaIds = Array.from(
    new Set(
      (qRows ?? [])
        .map((q) => q.media_asset_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const [{ data: choiceRows }, { data: qSourceRows }, { data: attachedMediaRows }] =
    await Promise.all([
      qIds.length > 0
        ? client
            .schema("app")
            .from("quiz_choices")
            .select("id, question_id, position, label_json")
            .in("question_id", qIds)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] }),
      qIds.length > 0
        ? client
            .schema("app")
            .from("question_sources")
            .select("question_id, source_id, locator")
            .in("question_id", qIds)
        : Promise.resolve({ data: [] }),
      attachedMediaIds.length > 0
        ? client
            .schema("app")
            .from("media_assets")
            .select("id, storage_path, scan_status, metadata_scrubbed_at")
            .in("id", attachedMediaIds)
        : Promise.resolve({ data: [] }),
    ]);

  // Kunci jawaban privat hanya dibaca lewat RPC `api.get_admin_quiz_answer_keys` (SEC-08)
  let migrationPending = false;
  const answerKeyMap = new Map<
    string,
    { correct_choice_id: string | null; explanation: string }
  >();
  const admin = createAdminSecretSupabaseClient();
  if (admin && session.userId && isSupabaseAdminConfigured()) {
    const { data: keyData, error: keyErr } = await admin
      .schema("api")
      .rpc("get_admin_quiz_answer_keys", {
        p_actor_id: session.userId,
        p_revision_id: rev.id,
      });

    if (keyErr) {
      if (isSupabaseSchemaNotReadyError(keyErr)) {
        migrationPending = true;
      } else {
        throw new Error(`Gagal memuat kunci jawaban admin: ${keyErr.message}`);
      }
    } else if (Array.isArray(keyData)) {
      for (const entry of keyData) {
        if (entry && typeof entry === "object" && "question_id" in entry) {
          const item = entry as {
            question_id: string;
            correct_choice_id?: string | null;
            explanation?: string;
          };
          answerKeyMap.set(item.question_id, {
            correct_choice_id: item.correct_choice_id ?? null,
            explanation: item.explanation ?? "",
          });
        }
      }
    }
  } else {
    migrationPending = true;
  }

  const choicesByQuestion = new Map<string, AdminQuizChoiceItem[]>();
  for (const c of choiceRows ?? []) {
    const arr = choicesByQuestion.get(c.question_id) ?? [];
    arr.push({
      id: c.id,
      position: c.position as 1 | 2 | 3 | 4,
      label: extractJsonText(c.label_json),
    });
    choicesByQuestion.set(c.question_id, arr);
  }

  const sourceCitationMap = new Map(
    (sourceOptions ?? []).map((s) => [s.id, s.citation_text])
  );
  const sourcesByQuestion = new Map<string, AdminQuizQuestionSourceItem[]>();
  for (const qs of qSourceRows ?? []) {
    const arr = sourcesByQuestion.get(qs.question_id) ?? [];
    arr.push({
      source_id: qs.source_id,
      citation_text: sourceCitationMap.get(qs.source_id) ?? qs.source_id,
      locator: qs.locator ?? "",
    });
    sourcesByQuestion.set(qs.question_id, arr);
  }

  const attachedMediaMap = new Map(
    (attachedMediaRows ?? []).map((m) => [
      m.id,
      {
        id: m.id,
        storage_path: m.storage_path,
        scan_status: m.scan_status as "quarantine" | "cleared" | "rejected",
        metadata_scrubbed: Boolean(m.metadata_scrubbed_at),
      },
    ])
  );

  const questions: AdminQuizQuestionItem[] = (qRows ?? []).map((q) => {
    const qChoices = choicesByQuestion.get(q.id) ?? [];
    const keyInfo = answerKeyMap.get(q.id);
    const matchedChoice = keyInfo?.correct_choice_id
      ? qChoices.find((c) => c.id === keyInfo.correct_choice_id) ?? null
      : null;

    return {
      id: q.id,
      position: q.position,
      prompt: extractJsonText(q.prompt_json),
      media_asset_id: q.media_asset_id ?? null,
      media_asset: q.media_asset_id
        ? attachedMediaMap.get(q.media_asset_id) ?? null
        : null,
      choices: qChoices,
      correct_choice_id: matchedChoice?.id ?? null,
      correct_choice_position: matchedChoice?.position ?? 1,
      explanation: keyInfo?.explanation ?? "",
      sources: sourcesByQuestion.get(q.id) ?? [],
    };
  });

  const reviews: AdminQuizReviewItem[] = (reviewRows ?? []).map((r) => ({
    id: r.id,
    review_type: r.review_type as QuizReviewType,
    decision: r.decision as QuizReviewDecision,
    reviewer_label: r.reviewer_label,
    evidence_asset_id: r.evidence_asset_id ?? null,
    reviewed_at: r.reviewed_at,
  }));

  const approvedReviews = Array.from(
    new Set(
      reviews
        .filter((r) => r.decision === "approved")
        .map((r) => r.review_type)
    )
  );

  const usageMode = (
    rev.usage_mode === "assignment" ? "assignment" : "practice"
  ) as QuizUsageMode;

  // Deteksi soal latihan yang dipakai ulang di kuis tugas (kebijakan PR-08 / rencana §4)
  let practiceOverlaps: QuizPracticeOverlapWarning[] = [];
  if (usageMode === "assignment" && questions.length > 0) {
    const { data: practiceRevs } = await client
      .schema("app")
      .from("quiz_revisions")
      .select("id, quiz_id, title")
      .eq("usage_mode", "practice")
      .neq("status", "archived")
      .neq("quiz_id", quiz.id)
      .limit(100);

    const pRevIds = (practiceRevs ?? []).map((r) => r.id);
    if (pRevIds.length > 0) {
      const [{ data: pQuizzes }, { data: pQuestions }] = await Promise.all([
        client.schema("app").from("quizzes").select("id, slug"),
        client
          .schema("app")
          .from("quiz_questions")
          .select("quiz_revision_id, prompt_json")
          .in("quiz_revision_id", pRevIds),
      ]);

      const slugByQuiz = new Map((pQuizzes ?? []).map((q) => [q.id, q.slug]));
      const revMeta = new Map(
        (practiceRevs ?? []).map((r) => [
          r.id,
          {
            quiz_id: r.quiz_id,
            quiz_slug: slugByQuiz.get(r.quiz_id) ?? r.quiz_id,
            quiz_title: r.title,
          },
        ])
      );

      const practiceIndex: PracticePromptIndexEntry[] = [];
      for (const pq of pQuestions ?? []) {
        const meta = revMeta.get(pq.quiz_revision_id);
        if (!meta) continue;
        practiceIndex.push({
          quiz_id: meta.quiz_id,
          quiz_slug: meta.quiz_slug,
          quiz_title: meta.quiz_title,
          prompt: extractJsonText(pq.prompt_json),
        });
      }

      practiceOverlaps = detectPracticePromptOverlap(questions, practiceIndex);
    }
  }

  const status = rev.status as ContentStatus;
  const gate = evaluateQuizPublishGate({
    status,
    questions: questions.map((q) => ({
      choices_count: q.choices.length,
      has_valid_answer_key: Boolean(q.correct_choice_id),
      media_asset: q.media_asset,
    })),
    approved_reviews: approvedReviews,
  });

  return {
    quiz_id: quiz.id,
    revision_id: rev.id,
    slug: quiz.slug,
    version_no: rev.version_no,
    title: rev.title,
    grade: (rev.grade === 4 ? 4 : 3) as 3 | 4,
    usage_mode: usageMode,
    instructions: rev.instructions ?? "",
    status,
    is_live_published: quiz.published_revision_id === rev.id,
    published_revision_id: quiz.published_revision_id ?? null,
    created_at_utc: rev.created_at,
    published_at: rev.published_at ?? null,
    questions,
    reviews,
    revisions: (siblingRevs ?? []).map((s) => ({
      id: s.id,
      version_no: s.version_no,
      status: s.status as ContentStatus,
      created_at_utc: s.created_at,
    })),
    publish_gate: gate,
    practice_overlaps: practiceOverlaps,
    available_media: (mediaOptions ?? []).map((m) => ({
      id: m.id,
      kind: m.kind,
      storage_bucket: m.storage_bucket,
      storage_path: m.storage_path,
      visibility: m.visibility as "private" | "public",
      scan_status: m.scan_status as "quarantine" | "cleared" | "rejected",
      metadata_scrubbed: Boolean(m.metadata_scrubbed_at),
      credit: m.credit ?? "",
      license: m.license ?? "",
    })),
    available_sources: (sourceOptions ?? []).map((s) => ({
      id: s.id,
      citation_text: s.citation_text,
      url: s.url ?? null,
      doi: s.doi ?? null,
      accessed_at: s.accessed_at ?? null,
      source_type: s.source_type,
    })),
    mode: "supabase",
    migrationPending,
  };
}

export async function createQuizWithDraftAsync(
  session: AdminSessionResult,
  input: {
    slug: string;
    title: string;
    grade: 3 | 4;
    usage_mode: QuizUsageMode;
    instructions: string;
    requestId: string;
  }
): Promise<{
  quiz_id: string;
  revision_id: string;
  version_no: number;
  slug: string;
}> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("create_quiz_with_draft", {
      p_actor_id: actorId,
      p_slug: input.slug,
      p_title: input.title,
      p_grade: input.grade,
      p_usage_mode: input.usage_mode,
      p_instructions: input.instructions,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/kuis");
  return data as {
    quiz_id: string;
    revision_id: string;
    version_no: number;
    slug: string;
  };
}

export async function createNewQuizRevisionAsync(
  session: AdminSessionResult,
  input: {
    quizId: string;
    sourceRevisionId?: string | null;
    requestId: string;
  }
): Promise<{
  quiz_id: string;
  revision_id: string;
  version_no: number;
}> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("create_new_quiz_revision", {
      p_actor_id: actorId,
      p_quiz_id: input.quizId,
      p_source_revision_id: input.sourceRevisionId ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/kuis");
  return data as {
    quiz_id: string;
    revision_id: string;
    version_no: number;
  };
}

export async function upsertQuizRevisionDraftAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    title: string;
    grade: 3 | 4;
    usage_mode: QuizUsageMode;
    instructions: string;
    questions: unknown;
    requestId: string;
  }
): Promise<{ revision_id: string; question_count: number }> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("upsert_quiz_revision_draft", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_title: input.title,
      p_grade: input.grade,
      p_usage_mode: input.usage_mode,
      p_instructions: input.instructions,
      p_questions: input.questions,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/kuis");
  return data as { revision_id: string; question_count: number };
}

export async function addQuizRevisionReviewAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    review_type: QuizReviewType;
    reviewer_label: string;
    decision: QuizReviewDecision;
    evidence_asset_id?: string | null;
    requestId: string;
  }
): Promise<AdminQuizReviewItem> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("add_quiz_revision_review", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_review_type: input.review_type,
      p_reviewer_label: input.reviewer_label,
      p_decision: input.decision,
      p_evidence_asset_id: input.evidence_asset_id ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  revalidatePath("/admin/kuis");
  return data as AdminQuizReviewItem;
}

export async function transitionQuizRevisionAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    expectedStatus: ContentStatus;
    nextStatus: ContentStatus;
    reason?: string | null;
    requestId: string;
  }
): Promise<{
  revision_id: string;
  quiz_id: string;
  from_status: ContentStatus;
  to_status: ContentStatus;
  unpublished_live: boolean;
}> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("transition_quiz_revision", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_expected_status: input.expectedStatus,
      p_next_status: input.nextStatus,
      p_reason: input.reason ?? null,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  return data as {
    revision_id: string;
    quiz_id: string;
    from_status: ContentStatus;
    to_status: ContentStatus;
    unpublished_live: boolean;
  };
}

export async function publishQuizRevisionAsync(
  session: AdminSessionResult,
  input: {
    revisionId: string;
    requestId: string;
  }
): Promise<{
  revision_id: string;
  quiz_id: string;
  slug: string;
  version_no: number;
}> {
  const { admin, actorId } = assertSupabaseWriteReady(session);

  const { data, error } = await admin
    .schema("api")
    .rpc("publish_quiz_revision", {
      p_actor_id: actorId,
      p_revision_id: input.revisionId,
      p_request_id: input.requestId,
    });

  if (error) {
    throw mapAdminQuizPostgresError(error) ?? new Error(error.message);
  }

  const res = data as {
    revision_id: string;
    quiz_id: string;
    slug: string;
    version_no: number;
  };

  revalidatePublicQuizPaths(res.slug);
  return res;
}
