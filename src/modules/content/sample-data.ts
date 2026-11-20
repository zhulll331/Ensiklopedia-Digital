import type { ContentKind, ContentStatus, PublicSiteLocation, ReviewType } from "./types";

export interface SampleSource {
  id: string;
  citation_text: string;
  source_type: "book" | "journal" | "report" | "archive" | "expert_note" | "regulation";
  locator: string;
}

export interface SampleMediaItem {
  id: string;
  title: string;
  badge: "Foto" | "Ilustrasi";
  kind: "image" | "illustration" | "video" | "pdf";
  src: string;
  alt_text: string;
  caption: string;
  credit: string;
  license: string;
  scan_status: "quarantine" | "cleared" | "rejected";
  metadata_scrubbed: boolean;
  width: number;
  height: number;
  related_slug?: string;
}

export interface SampleChapterDetail {
  id: string;
  revision_id: string;
  slug: string;
  order: number;
  title: string;
  summary: string;
  reading_minutes: number;
  target_grades: Array<3 | 4>;
  paragraphs: string[];
  glossary_slugs: string[];
  preservation_note: string;
  sources: SampleSource[];
  status: ContentStatus;
  is_sample_seed: true;
}

export interface SampleSiteDetail {
  id: string;
  revision_id: string;
  slug: string;
  title: string;
  heritage_type: "Menhir" | "Dolmen" | "Batu Kenong" | "Sarkofagus";
  summary: string;
  child_narration: string[];
  scientific_context: string[];
  target_grades: Array<3 | 4>;
  preservation_warning: string;
  location: PublicSiteLocation;
  media_id: string;
  sources: SampleSource[];
  status: ContentStatus;
  is_sample_seed: true;
}

export interface SampleGlossaryEntry {
  id: string;
  slug: string;
  term: string;
  letter: string;
  simple_definition: string;
  context_example: string;
  related_chapter_slug: string;
  status: ContentStatus;
}

export interface SampleResourceItem {
  id: string;
  slug: string;
  type: "book" | "guide" | "worksheet";
  title: string;
  summary: string;
  target_grades: Array<3 | 4>;
  duration_minutes?: number;
  objectives: string[];
  steps: string[];
  file_label: string;
  file_size_label: string;
  version_label: string;
  updated_at_utc: string;
  status: ContentStatus;
}

export interface SampleVideoItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  duration_label: string;
  target_grades: Array<3 | 4>;
  poster_src: string;
  poster_alt: string;
  transcript: string[];
  captions_available: boolean;
  video_url?: string;
  source_kind?: "uploaded" | "external";
  status: ContentStatus;
}

export interface SampleAdminRevisionRow {
  revision_id: string;
  content_id: string;
  slug: string;
  kind: ContentKind;
  version_no: number;
  title: string;
  status: ContentStatus;
  sources_count: number;
  approved_reviews: ReviewType[];
  has_location_clearance: boolean;
  attached_media: Array<{
    id: string;
    scan_status: "quarantine" | "cleared" | "rejected";
    metadata_scrubbed: boolean;
  }>;
  updated_at_utc: string;
}

export const SAMPLE_SOURCES = {
  s1: {
    id: "src-1",
    citation_text: "[Sampel Rujukan] Inventaris Awal Kurasi Materi Megalitik Banyuwangi (Menunggu Verifikasi Ahli)",
    source_type: "expert_note",
    locator: "Bagian 1",
  },
  s2: {
    id: "src-2",
    citation_text: "[Sampel Rujukan] Catatan Kurasi Pendidikan Dasar Kelas III–IV EDMB",
    source_type: "report",
    locator: "Bab 2",
  },
} satisfies Record<string, SampleSource>;

export const SAMPLE_CHAPTERS: SampleChapterDetail[] = [
  {
    id: "chap-1",
    revision_id: "rev-chap-1-v1",
    slug: "mengenal-zaman-batu-besar",
    order: 1,
    title: "Bab 1: Mengenal Tinggalan Batu Besar",
    summary: "Mengenal apa itu peninggalan megalitik dengan kata-kata sederhana untuk kelas III dan IV.",
    reading_minutes: 4,
    target_grades: [3, 4],
    paragraphs: [
      "Jauh sebelum ada gedung bertingkat dan jalan beraspal, masyarakat zaman dahulu di Nusantara memakai batu berukuran besar untuk berbagai kegiatan penting.",
      "Kata megalitik berasal dari gabungan kata 'mega' yang berarti besar dan 'lithos' yang berarti batu. Di wilayah Banyuwangi, para peneliti menemukan beberapa jejak peninggalan batu besar tersebut.",
      "Peninggalan ini seperti buku cerita dari masa lalu. Dengan menjaganya tetap utuh, kita ikut merawat sejarah daerah kita sendiri.",
    ],
    glossary_slugs: ["megalitik", "arkeologi"],
    preservation_note: "Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret.",
    sources: [SAMPLE_SOURCES.s1],
    status: "published",
    is_sample_seed: true,
  },
  {
    id: "chap-2",
    revision_id: "rev-chap-2-v1",
    slug: "menhir-dan-dolmen-di-sekitar-kita",
    order: 2,
    title: "Bab 2: Bentuk Menhir dan Dolmen",
    summary: "Membedakan batu tegak (menhir) dan meja batu (dolmen) lewat pengamatan bentuk.",
    reading_minutes: 5,
    target_grades: [3, 4],
    paragraphs: [
      "Menhir adalah batu tunggal yang berdiri tegak seperti tiang alami yang ditata oleh tangan manusia zaman dahulu.",
      "Dolmen berbentuk seperti meja batu. Ada lempengan batu datar di bagian atas yang ditopang oleh beberapa batu penyangga di bawahnya.",
      "Saat mengamati gambar menhir dan dolmen, perhatikan perbedaan posisi batunya: satu berdiri tegak dan satunya lagi menyerupai meja.",
    ],
    glossary_slugs: ["menhir", "dolmen"],
    preservation_note: "Jangan memanjat atau meletakkan beban di atas peninggalan batu bersejarah.",
    sources: [SAMPLE_SOURCES.s1, SAMPLE_SOURCES.s2],
    status: "published",
    is_sample_seed: true,
  },
  {
    id: "chap-3",
    revision_id: "rev-chap-3-v1",
    slug: "merawat-peninggalan-leluhur-banyuwangi",
    order: 3,
    title: "Bab 3: Cara Kita Menjaga Warisan Budaya",
    summary: "Langkah sederhana siswa kelas IV untuk menjaga kebersihan dan keutuhan situs budaya.",
    reading_minutes: 4,
    target_grades: [4],
    paragraphs: [
      "Setiap orang bisa membantu menjaga warisan budaya. Cara paling mudah adalah tidak membuang sampah di area bersejarah dan tidak mencoret permukaan batu.",
      "Kita juga tidak boleh memindahkan batu atau mengambil benda apa pun dari lingkungan situs karena posisi benda membantu ahli mempelajari kisah masa lalu.",
      "Jika melihat kerusakan di sekitar peninggalan bersejarah, beritahu guru atau pengelola setempat.",
    ],
    glossary_slugs: ["pelestarian", "cagar-budaya"],
    preservation_note: "Warisan budaya dijaga bersama; cukup dokumentasikan dari jarak aman tanpa menyentuh.",
    sources: [SAMPLE_SOURCES.s2],
    status: "published",
    is_sample_seed: true,
  },
];

export const SAMPLE_MEDIA: SampleMediaItem[] = [
  {
    id: "media-1",
    title: "Ilustrasi Menhir & Dolmen",
    badge: "Ilustrasi",
    kind: "illustration",
    src: "/images/samples/ilustrasi-menhir-dolmen.svg",
    alt_text: "Ilustrasi sederhana yang membandingkan batu tegak menhir dan meja batu dolmen di alam terbuka",
    caption: "Ilustrasi perbandingan bentuk menhir (batu tegak) dan dolmen (meja batu).",
    credit: "Ilustrasi Contoh EDMB (Non-Produksi)",
    license: "Internal EDMB",
    scan_status: "cleared",
    metadata_scrubbed: true,
    width: 800,
    height: 600,
    related_slug: "menhir-dan-dolmen-di-sekitar-kita",
  },
  {
    id: "media-2",
    title: "Ilustrasi Batu Kenong",
    badge: "Ilustrasi",
    kind: "illustration",
    src: "/images/samples/ilustrasi-batu-kenong.svg",
    alt_text: "Ilustrasi batu berbentuk silinder dengan tonjolan bulat di bagian atas menyerupai alat musik kenong",
    caption: "Ilustrasi bentuk umum batu kenong sebagai bahan pengenalan visual siswa.",
    credit: "Ilustrasi Contoh EDMB (Non-Produksi)",
    license: "Internal EDMB",
    scan_status: "cleared",
    metadata_scrubbed: true,
    width: 800,
    height: 600,
    related_slug: "batu-kenong-wilayah-tengah",
  },
  {
    id: "media-3",
    title: "Ilustrasi Peta Wilayah Umum Banyuwangi",
    badge: "Ilustrasi",
    kind: "illustration",
    src: "/images/samples/ilustrasi-peta-wilayah.svg",
    alt_text: "Ilustrasi lanskap perbukitan dan pesisir Banyuwangi sebagai pengantar wilayah umum",
    caption: "Ilustrasi lanskap Banyuwangi (bukan foto lapangan atau titik koordinat presisi).",
    credit: "Ilustrasi Contoh EDMB (Non-Produksi)",
    license: "Internal EDMB",
    scan_status: "cleared",
    metadata_scrubbed: true,
    width: 800,
    height: 600,
  },
];

export const SAMPLE_SITES: SampleSiteDetail[] = [
  {
    id: "site-1",
    revision_id: "rev-site-1-v1",
    slug: "tinggalan-menhir-wilayah-barat",
    title: "[Sampel] Tinggalan Menhir Wilayah Barat Banyuwangi",
    heritage_type: "Menhir",
    summary: "Contoh entri situs menhir dengan penanda perkiraan wilayah umum saja.",
    child_narration: [
      "Di wilayah perbukitan barat Banyuwangi terdapat contoh peninggalan batu tegak yang dikenal sebagai menhir.",
      "Batu ini berdiri tegak dan menjadi tanda penting bagi masyarakat pada masa lampau.",
    ],
    scientific_context: [
      "Catatan ilmiah dan rincian penanggalan resmi akan diisi oleh kurator arkeologi sebelum rilis publik.",
      "Lokasi pada peta hanya menunjukkan pusat kecamatan/wilayah umum guna mencegah vandalisme dan penggalian liar.",
    ],
    target_grades: [3, 4],
    preservation_warning: "Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret.",
    location: {
      area_label: "Wilayah Barat Banyuwangi (Perkiraan Kecamatan)",
      display_lat: -8.22,
      display_lon: 114.21,
      precision_label: "Perkiraan wilayah umum",
      display_zoom_max: 11,
    },
    media_id: "media-1",
    sources: [SAMPLE_SOURCES.s1],
    status: "published",
    is_sample_seed: true,
  },
  {
    id: "site-2",
    revision_id: "rev-site-2-v1",
    slug: "batu-kenong-wilayah-tengah",
    title: "[Sampel] Tinggalan Batu Kenong Wilayah Tengah",
    heritage_type: "Batu Kenong",
    summary: "Contoh entri batu kenong untuk pengenalan bentuk oleh siswa kelas III dan IV.",
    child_narration: [
      "Batu kenong memiliki bentuk bulat dengan tonjolan di tengah atasnya, mirip alat musik gamelan kenong.",
      "Siswa dapat mengamati bentuk tonjolan batu tersebut lewat ilustrasi yang tersedia.",
    ],
    scientific_context: [
      "Penjelasan arkeologis lengkap menunggu hasil validasi tiga ahli sesuai panduan kurasi.",
    ],
    target_grades: [3, 4],
    preservation_warning: "Jaga jarak aman saat berkunjung bersama pendamping sekolah; jangan menyentuh permukaan batu.",
    location: {
      area_label: "Wilayah Tengah Banyuwangi (Perkiraan Kecamatan)",
      display_lat: -8.28,
      display_lon: 114.31,
      precision_label: "Perkiraan wilayah umum",
      display_zoom_max: 11,
    },
    media_id: "media-2",
    sources: [SAMPLE_SOURCES.s1, SAMPLE_SOURCES.s2],
    status: "published",
    is_sample_seed: true,
  },
  {
    id: "site-3",
    revision_id: "rev-site-3-v1",
    slug: "dolmen-wilayah-selatan",
    title: "[Sampel] Contoh Dolmen Wilayah Selatan",
    heritage_type: "Dolmen",
    summary: "Contoh entri dolmen untuk materi perbandingan kelas IV.",
    child_narration: [
      "Dolmen tampak seperti meja dari batu besar dengan penopang di bagian bawahnya.",
    ],
    scientific_context: [
      "Data verifikasi lapangan akan menggantikan contoh ini setelah proses validasi materi dan lokasi selesai.",
    ],
    target_grades: [4],
    preservation_warning: "Dilarang duduk, berdiri, atau meletakkan benda di atas batu peninggalan.",
    location: {
      area_label: "Wilayah Selatan Banyuwangi (Perkiraan Kecamatan)",
      display_lat: -8.42,
      display_lon: 114.27,
      precision_label: "Perkiraan wilayah umum",
      display_zoom_max: 11,
    },
    media_id: "media-1",
    sources: [SAMPLE_SOURCES.s2],
    status: "published",
    is_sample_seed: true,
  },
];

export const SAMPLE_GLOSSARY: SampleGlossaryEntry[] = [
  {
    id: "gl-1",
    slug: "arkeologi",
    term: "Arkeologi",
    letter: "A",
    simple_definition: "Ilmu yang mempelajari kehidupan manusia masa lalu lewat benda-benda peninggalan.",
    context_example: "Ahli arkeologi meneliti bentuk batu kuno untuk memahami cara hidup leluhur.",
    related_chapter_slug: "mengenal-zaman-batu-besar",
    status: "published",
  },
  {
    id: "gl-2",
    slug: "batu-kenong",
    term: "Batu Kenong",
    letter: "B",
    simple_definition: "Batu silinder dengan tonjolan bulat di bagian atas seperti kenong gamelan.",
    context_example: "Bentuk tonjolan pada batu kenong mudah dikenali siswa saat mengamati ilustrasi.",
    related_chapter_slug: "menhir-dan-dolmen-di-sekitar-kita",
    status: "published",
  },
  {
    id: "gl-3",
    slug: "cagar-budaya",
    term: "Cagar Budaya",
    letter: "C",
    simple_definition: "Warisan budaya berharga yang dilindungi agar tetap lestari untuk generasi mendatang.",
    context_example: "Merawat cagar budaya berarti tidak mencoret atau memindahkan bagian situs.",
    related_chapter_slug: "merawat-peninggalan-leluhur-banyuwangi",
    status: "published",
  },
  {
    id: "gl-4",
    slug: "dolmen",
    term: "Dolmen",
    letter: "D",
    simple_definition: "Susunan batu besar yang menyerupai meja dengan lempengan datar di atas penopang.",
    context_example: "Dolmen memiliki lempengan batu datar di atasnya.",
    related_chapter_slug: "menhir-dan-dolmen-di-sekitar-kita",
    status: "published",
  },
  {
    id: "gl-5",
    slug: "megalitik",
    term: "Megalitik",
    letter: "M",
    simple_definition: "Tradisi atau peninggalan budaya yang memakai batu berukuran besar.",
    context_example: "Menhir dan dolmen adalah contoh peninggalan tradisi megalitik.",
    related_chapter_slug: "mengenal-zaman-batu-besar",
    status: "published",
  },
  {
    id: "gl-6",
    slug: "menhir",
    term: "Menhir",
    letter: "M",
    simple_definition: "Batu besar tunggal yang didirikan tegak di atas tanah oleh manusia zaman dahulu.",
    context_example: "Berbeda dengan dolmen yang mendatar, menhir berdiri tegak.",
    related_chapter_slug: "menhir-dan-dolmen-di-sekitar-kita",
    status: "published",
  },
  {
    id: "gl-7",
    slug: "pelestarian",
    term: "Pelestarian",
    letter: "P",
    simple_definition: "Usaha menjaga dan merawat peninggalan sejarah agar tidak rusak atau hilang.",
    context_example: "Tidak membuang sampah di lokasi situs adalah bagian dari pelestarian.",
    related_chapter_slug: "merawat-peninggalan-leluhur-banyuwangi",
    status: "published",
  },
];

export const SAMPLE_VIDEOS: SampleVideoItem[] = [
  {
    id: "vid-1",
    slug: "pengantar-megalitik-banyuwangi",
    title: "[Sampel] Pengantar Mengenal Batu Megalitik",
    summary: "Kerangka pemutar video dengan poster, kontrol manual (tanpa autoplay), takarir, dan transkrip teks.",
    duration_label: "02:30 (contoh)",
    target_grades: [3, 4],
    poster_src: "/images/samples/ilustrasi-menhir-dolmen.svg",
    poster_alt: "Poster pengantar video animasi mengenal menhir dan dolmen",
    transcript: [
      "[00:00] Halo teman-teman kelas tiga dan empat!",
      "[00:15] Hari ini kita mengenal tinggalan batu besar atau megalitik di Banyuwangi.",
      "[00:45] Perhatikan perbedaan antara menhir yang berdiri tegak dan dolmen yang berbentuk seperti meja batu.",
      "[02:00] Berkas MP4 final akan diunggah setelah produksi video pada tahap diseminasi.",
    ],
    captions_available: true,
    status: "published",
  },
];

export const SAMPLE_RESOURCES: SampleResourceItem[] = [
  {
    id: "res-1",
    slug: "panduan-guru-kokurikuler-kelas-3",
    type: "guide",
    title: "[Sampel] Panduan Guru: Pengenalan Megalitik Kelas III",
    summary: "Panduan langkah kegiatan kokurikuler 45 menit untuk pengenalan bentuk menhir dan dolmen.",
    target_grades: [3],
    duration_minutes: 45,
    objectives: [
      "Siswa mampu membedakan bentuk menhir dan dolmen secara visual.",
      "Siswa menyebutkan dua cara sederhana menjaga peninggalan budaya.",
    ],
    steps: [
      "Ajak siswa membaca Bab 1 dan Bab 2 bersama selama 15 menit.",
      "Gunakan kartu ilustrasi pada Media Belajar untuk pengamatan kelompok.",
      "Tutup dengan latihan kuis atau tugas kode kelas 5 soal.",
    ],
    file_label: "PDF Panduan (menunggu berkas final)",
    file_size_label: "Belum diunggah",
    version_label: "Draf 0.1",
    updated_at_utc: "2026-11-18T00:00:00Z",
    status: "published",
  },
  {
    id: "res-2",
    slug: "lkpd-pengamatan-megalitik-kelas-4",
    type: "worksheet",
    title: "[Sampel] LKPD Siswa Kelas IV: Membandingkan Tinggalan Batu",
    summary: "Lembar kerja pengamatan mandiri dan diskusi kelompok kecil tentang pelestarian situs.",
    target_grades: [4],
    duration_minutes: 40,
    objectives: [
      "Siswa membandingkan ciri menhir, dolmen, dan batu kenong.",
      "Siswa menuliskan sikap pelestarian di lingkungan sekitar.",
    ],
    steps: [
      "Bagikan LKPD cetak kepada siswa.",
      "Siswa mengamati menu Jelajah Situs (wilayah umum) tanpa membawa data pribadi.",
      "Diskusikan jawaban LKPD secara lisan di kelas.",
    ],
    file_label: "PDF LKPD (menunggu berkas final)",
    file_size_label: "Belum diunggah",
    version_label: "Draf 0.1",
    updated_at_utc: "2026-11-18T00:00:00Z",
    status: "published",
  },
];

// Termasuk draf internal untuk menguji bahwa draf tidak pernah muncul di API publik!
export const SAMPLE_ADMIN_REVISIONS: SampleAdminRevisionRow[] = [
  {
    revision_id: "rev-chap-1-v1",
    content_id: "chap-1",
    slug: "mengenal-zaman-batu-besar",
    kind: "chapter",
    version_no: 1,
    title: "Bab 1: Mengenal Tinggalan Batu Besar",
    status: "published",
    sources_count: 1,
    approved_reviews: ["language", "material"],
    has_location_clearance: false,
    attached_media: [],
    updated_at_utc: "2026-11-18T00:00:00Z",
  },
  {
    revision_id: "rev-site-1-v1",
    content_id: "site-1",
    slug: "tinggalan-menhir-wilayah-barat",
    kind: "site",
    version_no: 1,
    title: "[Sampel] Tinggalan Menhir Wilayah Barat Banyuwangi",
    status: "published",
    sources_count: 1,
    approved_reviews: ["language", "material", "media", "location"],
    has_location_clearance: true,
    attached_media: [
      { id: "media-1", scan_status: "cleared", metadata_scrubbed: true },
    ],
    updated_at_utc: "2026-11-18T00:00:00Z",
  },
  {
    revision_id: "rev-draft-sarkofagus-v1",
    content_id: "site-draft-4",
    slug: "draf-sarkofagus-rahasia",
    kind: "site",
    version_no: 1,
    title: "[Draf Internal] Sarkofagus Belum Clearance Lokasi",
    status: "draft",
    sources_count: 0,
    approved_reviews: [],
    has_location_clearance: false,
    attached_media: [
      { id: "media-quarantine", scan_status: "quarantine", metadata_scrubbed: false },
    ],
    updated_at_utc: "2026-11-18T00:00:00Z",
  },
];
