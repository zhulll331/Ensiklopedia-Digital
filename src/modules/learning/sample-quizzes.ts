export interface PublicQuizChoice {
  id: string;
  position: 1 | 2 | 3 | 4;
  label: string;
}

export interface PublicQuizQuestion {
  id: string;
  position: number;
  prompt: string;
  choices: PublicQuizChoice[];
}

export interface PublicQuizDefinition {
  id: string;
  revision_id: string;
  slug: string;
  title: string;
  grade: 3 | 4;
  usage_mode: "practice" | "assignment";
  instructions: string;
  question_count: number;
  questions: PublicQuizQuestion[];
}

/**
 * Daftar kuis sampel tanpa kunci jawaban atau pembahasan (SEC-08).
 * Kunci jawaban disimpan terpisah hanya di modul server-only.
 */
export const SAMPLE_PRACTICE_QUIZZES: PublicQuizDefinition[] = [
  {
    id: "quiz-practice-3",
    revision_id: "qrev-practice-3-v1",
    slug: "latihan-mengenal-megalitik-kelas-3",
    title: "[Sampel] Latihan: Mengenal Batu Megalitik (Kelas III)",
    grade: 3,
    usage_mode: "practice",
    instructions:
      "Pilih satu jawaban yang paling tepat. Latihan ini tidak memakai nama dan tidak menyimpan nilai.",
    question_count: 5,
    questions: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        position: 1,
        prompt: "Apa arti kata 'mega' pada istilah megalitik?",
        choices: [
          { id: "c1000000-0000-4000-8000-000000000001", position: 1, label: "Besar" },
          { id: "c1000000-0000-4000-8000-000000000002", position: 2, label: "Kecil" },
          { id: "c1000000-0000-4000-8000-000000000003", position: 3, label: "Cepat" },
          { id: "c1000000-0000-4000-8000-000000000004", position: 4, label: "Halus" },
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        position: 2,
        prompt: "Batu besar tunggal yang berdiri tegak disebut ...",
        choices: [
          { id: "c2000000-0000-4000-8000-000000000001", position: 1, label: "Dolmen" },
          { id: "c2000000-0000-4000-8000-000000000002", position: 2, label: "Menhir" },
          { id: "c2000000-0000-4000-8000-000000000003", position: 3, label: "Keramik" },
          { id: "c2000000-0000-4000-8000-000000000004", position: 4, label: "Perahu" },
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        position: 3,
        prompt: "Dolmen memiliki bentuk yang mirip dengan ...",
        choices: [
          { id: "c3000000-0000-4000-8000-000000000001", position: 1, label: "Meja batu" },
          { id: "c3000000-0000-4000-8000-000000000002", position: 2, label: "Roda kayu" },
          { id: "c3000000-0000-4000-8000-000000000003", position: 3, label: "Rumah kaca" },
          { id: "c3000000-0000-4000-8000-000000000004", position: 4, label: "Tiang bendera" },
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000004",
        position: 4,
        prompt: "Batu silinder dengan tonjolan di bagian atas mirip alat musik disebut ...",
        choices: [
          { id: "c4000000-0000-4000-8000-000000000001", position: 1, label: "Batu Kenong" },
          { id: "c4000000-0000-4000-8000-000000000002", position: 2, label: "Batu Kertas" },
          { id: "c4000000-0000-4000-8000-000000000003", position: 3, label: "Batu Kapur" },
          { id: "c4000000-0000-4000-8000-000000000004", position: 4, label: "Batu Bata" },
        ],
      },
      {
        id: "10000000-0000-4000-8000-000000000005",
        position: 5,
        prompt: "Sikap yang benar saat melihat peninggalan batu bersejarah adalah ...",
        choices: [
          { id: "c5000000-0000-4000-8000-000000000001", position: 1, label: "Mencoret batu dengan kapur" },
          { id: "c5000000-0000-4000-8000-000000000002", position: 2, label: "Memindahkan batu ke tas" },
          { id: "c5000000-0000-4000-8000-000000000003", position: 3, label: "Menjaganya tanpa menyentuh atau mencoret" },
          { id: "c5000000-0000-4000-8000-000000000004", position: 4, label: "Memanjat bagian atas batu" },
        ],
      },
    ],
  },
];

export const SAMPLE_ASSIGNMENT_QUIZZES: PublicQuizDefinition[] = [
  {
    id: "quiz-assign-3",
    revision_id: "qrev-assign-3-v1",
    slug: "kuis-tugas-mengenal-tinggalan-kelas-3",
    title: "[Sampel Tugas] Mengenal Tinggalan Megalitik (Kelas III)",
    grade: 3,
    usage_mode: "assignment",
    instructions:
      "Baca soal dengan tenang, pilih satu jawaban, lalu tekan Kirim Jawaban jika sudah selesai.",
    question_count: 5,
    questions: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        position: 1,
        prompt: "Peninggalan zaman dahulu yang menggunakan batu berukuran besar disebut tradisi ...",
        choices: [
          { id: "d1000000-0000-4000-8000-000000000001", position: 1, label: "Megalitik" },
          { id: "d1000000-0000-4000-8000-000000000002", position: 2, label: "Digital" },
          { id: "d1000000-0000-4000-8000-000000000003", position: 3, label: "Logam modern" },
          { id: "d1000000-0000-4000-8000-000000000004", position: 4, label: "Plastik" },
        ],
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        position: 2,
        prompt: "Perbedaan utama menhir dan dolmen adalah ...",
        choices: [
          { id: "d2000000-0000-4000-8000-000000000001", position: 1, label: "Menhir terbuat dari kayu, dolmen dari kaca" },
          { id: "d2000000-0000-4000-8000-000000000002", position: 2, label: "Menhir berdiri tegak, dolmen berbentuk meja batu" },
          { id: "d2000000-0000-4000-8000-000000000003", position: 3, label: "Menhir hanya di laut, dolmen hanya di kota" },
          { id: "d2000000-0000-4000-8000-000000000004", position: 4, label: "Keduanya sama-sama berbentuk perahu" },
        ],
      },
      {
        id: "20000000-0000-4000-8000-000000000003",
        position: 3,
        prompt: "Ilmu yang mempelajari kehidupan masa lalu melalui benda peninggalan disebut ...",
        choices: [
          { id: "d3000000-0000-4000-8000-000000000001", position: 1, label: "Arkeologi" },
          { id: "d3000000-0000-4000-8000-000000000002", position: 2, label: "Astronomi" },
          { id: "d3000000-0000-4000-8000-000000000003", position: 3, label: "Botani" },
          { id: "d3000000-0000-4000-8000-000000000004", position: 4, label: "Geometri" },
        ],
      },
      {
        id: "20000000-0000-4000-8000-000000000004",
        position: 4,
        prompt: "Mengapa peta di EDMB hanya menampilkan perkiraan wilayah umum?",
        choices: [
          { id: "d4000000-0000-4000-8000-000000000001", position: 1, label: "Karena peta belum selesai digambar" },
          { id: "d4000000-0000-4000-8000-000000000002", position: 2, label: "Untuk melindungi situs agar tidak dirusak atau dicuri" },
          { id: "d4000000-0000-4000-8000-000000000003", position: 3, label: "Agar siswa bingung mencari lokasi" },
          { id: "d4000000-0000-4000-8000-000000000004", position: 4, label: "Karena komputer tidak bisa membaca angka" },
        ],
      },
      {
        id: "20000000-0000-4000-8000-000000000005",
        position: 5,
        prompt: "Jika menemukan coretan atau kerusakan di situs budaya, sebaiknya kita ...",
        choices: [
          { id: "d5000000-0000-4000-8000-000000000001", position: 1, label: "Menambahkan coretan baru" },
          { id: "d5000000-0000-4000-8000-000000000002", position: 2, label: "Membawa pulang batu kecil" },
          { id: "d5000000-0000-4000-8000-000000000003", position: 3, label: "Memberitahu guru atau pengelola setempat" },
          { id: "d5000000-0000-4000-8000-000000000004", position: 4, label: "Membiarkan sampah berserakan" },
        ],
      },
    ],
  },
  {
    id: "quiz-assign-4",
    revision_id: "qrev-assign-4-v1",
    slug: "kuis-tugas-pelestarian-kelas-4",
    title: "[Sampel Tugas] Perbandingan & Pelestarian Situs (Kelas IV)",
    grade: 4,
    usage_mode: "assignment",
    instructions:
      "Jawablah pertanyaan berikut berdasarkan bacaan Bab 2 dan Bab 3.",
    question_count: 5,
    questions: [
      {
        id: "30000000-0000-4000-8000-000000000001",
        position: 1,
        prompt: "Mengapa benda peninggalan sejarah tidak boleh dipindahkan dari tempat asalnya?",
        choices: [
          { id: "e1000000-0000-4000-8000-000000000001", position: 1, label: "Karena benda itu terlalu ringan" },
          { id: "e1000000-0000-4000-8000-000000000002", position: 2, label: "Karena posisi benda membantu ahli mempelajari kisah masa lalu" },
          { id: "e1000000-0000-4000-8000-000000000003", position: 3, label: "Karena batu akan berubah warna" },
          { id: "e1000000-0000-4000-8000-000000000004", position: 4, label: "Agar tidak terlihat di peta" },
        ],
      },
      {
        id: "30000000-0000-4000-8000-000000000002",
        position: 2,
        prompt: "Ciri khas utama batu kenong adalah ...",
        choices: [
          { id: "e2000000-0000-4000-8000-000000000001", position: 1, label: "Berbentuk segitiga pipih" },
          { id: "e2000000-0000-4000-8000-000000000002", position: 2, label: "Memiliki tonjolan bulat di bagian atas menyerupai kenong" },
          { id: "e2000000-0000-4000-8000-000000000003", position: 3, label: "Terbuat dari tanah liat basah" },
          { id: "e2000000-0000-4000-8000-000000000004", position: 4, label: "Selalu mengapung di air" },
        ],
      },
      {
        id: "30000000-0000-4000-8000-000000000003",
        position: 3,
        prompt: "Pada dolmen, bagian atas berupa lempengan datar ditopang oleh ...",
        choices: [
          { id: "e3000000-0000-4000-8000-000000000001", position: 1, label: "Beberapa batu penyangga" },
          { id: "e3000000-0000-4000-8000-000000000002", position: 2, label: "Tiang besi modern" },
          { id: "e3000000-0000-4000-8000-000000000003", position: 3, label: "Bambu anyaman" },
          { id: "e3000000-0000-4000-8000-000000000004", position: 4, label: "Balok semen" },
        ],
      },
      {
        id: "30000000-0000-4000-8000-000000000004",
        position: 4,
        prompt: "Usaha menjaga dan merawat peninggalan sejarah agar tetap lestari disebut ...",
        choices: [
          { id: "e4000000-0000-4000-8000-000000000001", position: 1, label: "Pelestarian" },
          { id: "e4000000-0000-4000-8000-000000000002", position: 2, label: "Penghapusan" },
          { id: "e4000000-0000-4000-8000-000000000003", position: 3, label: "Pemindahan" },
          { id: "e4000000-0000-4000-8000-000000000004", position: 4, label: "Penutupan" },
        ],
      },
      {
        id: "30000000-0000-4000-8000-000000000005",
        position: 5,
        prompt: "Saat berkunjung ke situs budaya bersama sekolah, hal yang dilarang adalah ...",
        choices: [
          { id: "e5000000-0000-4000-8000-000000000001", position: 1, label: "Mengamati dari jarak aman" },
          { id: "e5000000-0000-4000-8000-000000000002", position: 2, label: "Mencatat hasil pengamatan di buku tulis" },
          { id: "e5000000-0000-4000-8000-000000000003", position: 3, label: "Duduk atau mencoret permukaan batu peninggalan" },
          { id: "e5000000-0000-4000-8000-000000000004", position: 4, label: "Bertanya kepada guru pendamping" },
        ],
      },
    ],
  },
];
