# Desain Antarmuka — Ensiklopedia Digital Megalitik Banyuwangi (EDMB)

Versi 1.1 • Dasar: README, 01–07 (PRD v1.0) + gambar referensi website sekolah (gaya UI: kartu kaca, hero ilustratif)
Palet warna: disesuaikan dengan konteks megalitik Banyuwangi (hijau lumut, terakota, emas fajar, batu andesit, biru Ijen); bukan biru referensi
Status: spesifikasi desain untuk ditelaah. Belum ada desain final di Figma maupun kode. Warna dan font adalah rekomendasi yang harus diuji kontras dan keterbacaannya pada perangkat sasaran.

---

## 1. Hasil analisis PRD yang membatasi desain

| Fakta dari PRD | Konsekuensi desain |
| --- | --- |
| Siswa kelas III–IV, tanpa akun (FR-08, FR-11) | Bahasa sederhana, target sentuh besar, satu tindakan per langkah, tidak ada ikon login untuk siswa |
| Mobile-first, 360 px sampai desktop (NFR-01) | Desain dimulai dari 360 px; fungsi inti tidak bergantung hover |
| WCAG 2.2 AA (NFR-02) | Kontras, fokus terlihat, label, alt text, caption; warna tidak jadi satu-satunya penanda |
| LCP ≤2,5 dtk, INP ≤200 ms, CLS ≤0,1 (NFR-03) | Efek blur dan bokeh dibatasi, gambar hero dioptimasi dan diberi dimensi tetap, tanpa font atau skrip pihak ketiga |
| Video tidak autoplay, ada caption/transkrip/poster (FR-07) | Tombol "Tonton Video" membuka pemutar; tidak ada video latar di hero |
| Peta hanya wilayah umum, berlabel perkiraan (FR-04, SEC-16) | Penanda berupa area/lingkaran perkiraan, bukan pin presisi; tidak ada tombol navigasi atau salin koordinat |
| Ilustrasi rekonstruksi/AI harus ditandai (Bab 9 PRD) | Lencana "Ilustrasi" atau "Foto" pada setiap media |
| Tidak ada papan peringkat, nama tidak di URL, data anak minimal (SEC-14, 7.3) | Tidak ada komponen leaderboard; hasil siswa hanya milik sesinya |
| Jumlah situs, bab, video, soal belum ditentukan | Angka statistik tidak boleh karangan; tampil dinamis dari konten terbit atau disembunyikan |
| Kontak pengelola belum diisi | Footer memakai placeholder bertanda, bukan data rekaan |
| Guru login, admin login + MFA, dashboard privat no-store | Area guru dan admin memakai pola dashboard terpisah dari tampilan publik, dengan penanda privasi jelas |
| Kuis tugas: nama, autosave, kirim, konfirmasi bila kosong, tombol Selesai | Alur kuis khusus dengan status simpan, dialog konfirmasi dan layar hasil |
| Desain visual "menyusul" | Dokumen ini adalah arah visual awal; struktur informasi dan perilaku mengikuti PRD |

## 2. Arah visual dari referensi

Gambar referensi adalah beranda sekolah dengan ciri berikut. EDMB meminjam bahasa visualnya, bukan isinya. Bentuk, kaca, radius, bokeh, dan tata letak mengikuti referensi; **warna tidak mengikuti biru referensi** dan diturunkan dari konteks EDMB (lihat 3.1).

| Ciri referensi | Diterapkan di EDMB |
| --- | --- |
| Latar gradien muda ke putih dengan lingkaran blur (bokeh) di tepi | Gaya dipertahankan; warna menjadi kabut hijau–krem, 3–5 lingkaran statis, tanpa animasi berat |
| Navbar kaca membulat, menu berbentuk pil, item aktif terisi penuh warna merek | Dipertahankan; CTA kanan "Masuk Tugas" menggantikan "Admission" |
| Hero 2 kolom: teks kiri, foto kanan, lencana sapaan kecil | Dipertahankan; foto diganti ilustrasi (lihat 9.1) |
| Judul besar dengan kata aksen berwarna | Dipertahankan |
| Dua tombol: terisi dan outline dengan ikon | Dipertahankan |
| Empat kartu fitur kaca dengan ikon berwarna | Dipertahankan; isinya modul inti EDMB |
| Bagian tentang: gambar kiri, teks tengah, kolom statistik kanan | Dipertahankan; statistik dinamis |
| Kartu program akademik | Menjadi "Pilih Kelasmu" dan jenis materi |
| Panel "Latest Notice" | Menjadi "Kabar Terbaru" (dokumentasi dan berita, FR-14) |
| Tulisan tangan "Small Steps Big Dreams" | Satu slogan dekoratif; aria-hidden |
| Foto siswa nyata | **Tidak dipakai.** Foto anak memerlukan persetujuan dan menambah risiko privasi |

Suasana yang dituju: cerah, ramah anak, bersih, hangat seperti batu, tanah, dan lumut. Motif batu megalitik dipakai hemat sebagai ilustrasi dan pola halus, bukan dekorasi tebal. Motif tradisi lokal (mis. batik Osing) hanya dipakai setelah ditelaah ahli budaya dan lisensinya jelas.

## 3. Design tokens

### 3.1 Warna

Palet diturunkan dari konteks EDMB: peninggalan batu yang diselimuti lumut, tanah, dan citra matahari terbit Banyuwangi. Asosiasi ini adalah interpretasi desain, bukan ketentuan budaya; pengelola dan ahli budaya dapat mengubahnya.

| Keluarga | Inspirasi | Dipakai untuk |
| --- | --- | --- |
| Hijau lumut (merek) | Lumut dan vegetasi pada batu megalitik | Tombol utama, nav aktif, tautan, kartu Buku Digital |
| Terakota | Tanah, tembikar, laterit | Aksen kedua, kartu Jelajah Situs, penanda peringatan pelestarian |
| Emas fajar | Matahari terbit | Kartu Kuis Seru, sorotan kecil, tombol aksen |
| Batu andesit (netral hangat) | Batu | Latar krem, tepi, teks netral, footer |
| Biru Ijen | Toska danau kawah | Info, kartu Ruang Guru, tautan sekunder |

Nilai di bawah adalah usulan. Hitungan kontras manual di bawah bersifat perkiraan dan wajib diverifikasi dengan alat kontras sebelum dikunci; target teks normal 4,5:1 dan komponen UI 3:1.

```css
:root {
  /* Merek: Hijau Lumut */
  --brand-700: #1f4d38;       /* judul penting, pressed */
  --brand-600: #2f6b4f;       /* tombol utama, item nav aktif */
  --brand-500: #4a8a68;       /* aksen kata judul (hanya teks besar) */
  --brand-100: #dcebdd;
  --brand-50:  #f0f6f0;

  /* Teks dan permukaan */
  --ink-900: #1f2a24;         /* judul */
  --ink-700: #3a4640;         /* teks isi */
  --ink-500: #5b6760;         /* teks sekunder */
  --surface: #ffffff;
  --surface-sand: #faf6ee;    /* krem batu */
  --surface-glass: rgba(255,255,255,.74);
  --border-soft: rgba(47,107,79,.16);

  /* Batu andesit (netral hangat) */
  --stone-100: #efeae2;
  --stone-300: #d6cec1;       /* garis, tepi (bukan teks) */
  --stone-500: #8b8378;       /* ikon nonteks */
  --stone-900: #26231f;       /* footer */

  /* Aksen */
  --terra-500: #d26a3c;  --terra-600: #b4532a;  --terra-700: #8f3d1b;  --terra-100: #f6dfd2;
  --gold-500:  #e0a526;  --gold-700:  #8a5a00;  --gold-100:  #fbefcf;
  --ijen-500:  #2aa3ad;  --ijen-700:  #0e6f7a;  --ijen-100:  #d8eef0;

  /* Status (selalu disertai ikon dan kata) */
  --ok:     #166534;  --ok-bg:     #dcfce7;
  --warn:   #8a5a00;  --warn-bg:   #fbefcf;
  --danger: #b42318;  --danger-bg: #fde8e6;
  --info:   #0e6f7a;  --info-bg:   #d8eef0;

  /* Fokus */
  --focus-ring: 0 0 0 3px #fff, 0 0 0 6px #1f4d38;
}
```

Latar dan dekorasi:
- Gradien halaman: `linear-gradient(180deg, #e6f0e7 0%, #faf6ee 40%, #ffffff 100%)` (kabut hijau → krem → putih).
- Bokeh: lingkaran blur hijau lumut (`--brand-500` 30%), emas (`--gold-500` 35%) dan biru Ijen (`--ijen-500` 25%), 3–5 buah, statis.
- Tombol utama: `--brand-600`, hover/pressed `--brand-700`; gradien opsional `#2f6b4f → #1f4d38`.
- Footer: latar `--stone-900`, teks `#f3ede2`, tautan diberi garis bawah.

Pemetaan kartu fitur (menggantikan biru/teal/jingga/ungu referensi):

| Kartu | Ikon (isi) | Latar ikon | Teks aksen |
| --- | --- | --- | --- |
| Buku Digital | `--brand-600` | `--brand-100` | `--brand-700` |
| Jelajah Situs | `--terra-500` | `--terra-100` | `--terra-700` |
| Kuis Seru | `--gold-500` | `--gold-100` | `--gold-700` |
| Ruang Guru | `--ijen-500` | `--ijen-100` | `--ijen-700` |

Perkiraan kontras pasangan utama (verifikasi dengan alat):

| Pasangan | Perkiraan | Catatan |
| --- | --- | --- |
| Putih di atas `--brand-600` | ≈6,3:1 | Lolos untuk tombol |
| `--ink-500` di atas putih / krem | ≈5,9 / ≈5,4:1 | Lolos |
| `--terra-600` di atas putih | ≈5,0:1 | Lolos; di atas `--terra-100` pakai `--terra-700` (≈5,7:1) |
| `--gold-700` di atas `--gold-100` | ≈5,2:1 | Lolos |
| `--ink-900` di atas `--gold-500` | ≈6,8:1 | Teks tombol emas harus gelap, bukan putih |
| `--ijen-700` di atas `--ijen-100` | ≈4,8:1 | Lolos tipis; ukur ulang |
| `--brand-500` di atas putih | ≈4,1:1 | **Hanya untuk teks besar** (≥24 px, atau ≥19 px tebal), minimum 3:1 |

Aturan warna:
- Warna terang (`--terra-500`, `--gold-500`, `--ijen-500`) hanya untuk ikon dan latar; teks memakai varian `-600/-700`.
- Status tidak pernah hanya berupa warna; selalu ada ikon dan kata.
- Hijau merek dan hijau status "ok" dibedakan lewat ikon centang dan label teks.
- Mode gelap tidak termasuk MVP.

### 3.2 Tipografi

| Peran | Font usulan | Catatan |
| --- | --- | --- |
| Judul | Plus Jakarta Sans 700/800 | Bentuk geometris seperti referensi |
| Isi | Nunito Sans 400/600/700 | Huruf terbuka dan mudah dibaca anak |
| Slogan dekoratif | Caveat 600 | Hanya satu elemen, aria-hidden |

Semua font di-host sendiri (`next/font/local`), subset Latin, `font-display: swap`. Tidak memakai Google Fonts untuk menghindari permintaan pihak ketiga (halaman join harus bersih dari aset luar, lihat 03 bagian 9).

| Token | Mobile | Desktop | Berat | Tinggi baris |
| --- | --- | --- | --- | --- |
| display (judul hero) | 32 px | 56 px | 800 | 1.12 |
| h1 | 28 | 40 | 800 | 1.2 |
| h2 | 22 | 30 | 700 | 1.25 |
| h3 | 18 | 22 | 700 | 1.3 |
| body | 16 | 17 | 400 | 1.65 |
| body-anak (bab kelas III) | 18 | 19 | 400 | 1.75 |
| caption | 13 | 14 | 600 | 1.4 |
| label-atas (eyebrow, huruf kapital kecil) | 12 | 13 | 700 | 1.3, spasi huruf 0.08em |

Teks bacaan maksimal 68 karakter per baris. Teks isi tidak lebih kecil dari 16 px.

### 3.3 Bentuk, ruang, bayangan

| Token | Nilai |
| --- | --- |
| Radius | sm 10 px (input), md 16 px (kartu kecil), lg 24 px (kartu fitur, panel), pill 999 px (nav, tombol, chip) |
| Spasi | skala 4 px: 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Gutter halaman | 16 px (mobile), 24 px (tablet), 32 px (desktop) |
| Lebar konten | maks 1200 px; teks bacaan 720 px |
| Bayangan kartu | `0 8px 24px rgba(31,77,56,.10)` |
| Bayangan kaca | `0 10px 30px rgba(31,42,36,.08)` + border 1 px `--border-soft` |
| Blur kaca | `backdrop-filter: blur(14px)`, hanya navbar dan kartu fitur hero; sediakan fallback latar putih 92% bila blur tidak didukung |

### 3.4 Breakpoint

| Nama | Lebar | Kolom |
| --- | --- | --- |
| xs | 360–639 | 4 |
| sm | 640–767 | 4 |
| md | 768–1023 | 8 |
| lg | 1024–1279 | 12 |
| xl | ≥1280 | 12 |

Tidak ada konten atau fungsi yang bergantung hover. Target sentuh minimum 44×44 px (siswa: 48×48 px).

### 3.5 Pemetaan Tailwind (ringkas)

```ts
// tailwind.config.ts (potongan)
theme: { extend: {
  colors: { brand: { 50:'#f0f6f0',100:'#dcebdd',500:'#4a8a68',600:'#2f6b4f',700:'#1f4d38' },
            terra: { 100:'#f6dfd2',500:'#d26a3c',600:'#b4532a',700:'#8f3d1b' },
            gold: { 100:'#fbefcf',500:'#e0a526',700:'#8a5a00' },
            ijen: { 100:'#d8eef0',500:'#2aa3ad',700:'#0e6f7a' },
            stone: { 100:'#efeae2',300:'#d6cec1',500:'#8b8378',900:'#26231f' },
            sand: '#faf6ee',
            ink: { 900:'#1f2a24',700:'#3a4640',500:'#5b6760' } },
  borderRadius: { lg:'24px', md:'16px', sm:'10px' },
  boxShadow: { card:'0 8px 24px rgba(31,77,56,.10)', glass:'0 10px 30px rgba(31,42,36,.08)' },
  fontFamily: { heading:['var(--font-jakarta)'], body:['var(--font-nunito)'], script:['var(--font-caveat)'] }
}}
```

## 4. Komponen inti

| Komponen | Spesifikasi |
| --- | --- |
| **Navbar** | Tinggi 64 px, sticky, kaca, radius lg, jarak 12 px dari tepi atas. Logo + nama singkat kiri; pil menu tengah; ikon cari + CTA "Masuk Tugas" kanan. Aktif: latar `--brand-600`, teks putih, `aria-current="page"`. Mobile: logo, ikon cari, tombol menu; panel menu layar penuh dengan tautan 48 px. Dropdown "Media Belajar" (Galeri, Video, Glosarium) bisa dibuka dengan klik dan keyboard. |
| **Tombol utama** | Tinggi 48 px (hero 52), pill, latar `--brand-600`, teks putih 600, ikon panah kanan. Pressed `--brand-700`. Fokus memakai `--focus-ring`. Loading menampilkan spinner dan menonaktifkan klik ganda. |
| **Tombol sekunder** | Outline 1.5 px `--brand-600`, latar putih 70%, teks `--brand-700`; ikon play di kiri untuk video. |
| **Tombol tersier/tautan** | Teks `--brand-700` dengan panah; garis bawah saat fokus. |
| **Kartu fitur** | Kaca, radius lg, padding 20 px. Ikon di kotak 44 px berwarna kategori, judul h3, deskripsi 1–2 baris, panah di kanan bawah. Seluruh kartu satu tautan. |
| **Chip/filter** | Pil 40 px, tersedia: kelas (III, IV), jenis konten, huruf A–Z. Terpilih = isi hijau lumut + ikon centang. |
| **Lencana media** | "Foto" (hijau lumut) dan "Ilustrasi" (emas) di pojok gambar, teks 12 px, kontras 4,5:1. |
| **Kartu situs** | Gambar 4:3 + lencana, nama, jenis tinggalan, `area_label`, sasaran kelas, tombol "Baca". |
| **Kartu bab** | Nomor bab, judul, ringkasan ramah anak, durasi baca, status "sudah dibuka" (bookmark lokal, FR-16). |
| **Pembaca bab** | Kolom 720 px, daftar isi (sticky di desktop, laci di mobile), tombol Sebelumnya/Berikutnya di bawah, istilah glosarium bergaris titik dengan tooltip yang juga bisa diakses lewat klik. |
| **Pemutar video** | Poster, durasi, tombol play besar, caption, tautan transkrip. Tidak autoplay, `preload=none`. |
| **Kotak peta** | Leaflet, atribusi tile terlihat, label "Lokasi perkiraan wilayah", daftar wilayah sebagai fallback di sebelah/bawah. Tidak ada pin presisi. |
| **Input** | Tinggi 48 px, label di atas (bukan placeholder saja), bantuan di bawah, error dengan ikon + teks. Nama siswa: batas 80 karakter, penghitung hanya muncul saat mendekati batas. |
| **Panel pemberitahuan** | Ikon + judul + isi; varian info, peringatan, sukses, bahaya. |
| **Dialog** | Fokus terkunci di dalam, Esc menutup (kecuali konfirmasi kirim kuis), tombol utama di kanan. |
| **Tabel dashboard** | Header lekat, baris 56 px, kolom kunci tidak disembunyikan di mobile (gunakan kartu bertumpuk), ikon + teks status. |
| **Skeleton** | Untuk daftar dan kartu; tidak ada layout shift. |
| **Footer** | Kontak pengelola (placeholder bertanda), hak cipta dan atribusi, kebijakan privasi, ketentuan, kanal koreksi konten, pemberitahuan peta umum. |

## 5. Halaman publik

### 5.1 Beranda (mengikuti referensi)

Wireframe desktop (≥1024 px):

```
┌────────────────────────────────────────────────────────────────────┐
│ [logo] EDMB  [Beranda][Ensiklopedia][Jelajah Situs][Media ▾]       │
│              [Kuis][Ruang Guru][Tentang]        (cari) [Masuk Tugas]│
├────────────────────────────────────────────────────────────────────┤
│ (• Selamat datang di EDMB)                  ┌─────────────────────┐ │
│ Menjelajah                                  │  ILUSTRASI HERO     │ │
│ Jejak Megalitik Banyuwangi                  │  anak + tinggalan   │ │
│ Paragraf pengantar 2–3 baris                │  megalitik          │ │
│ [Mulai Membaca →] [▶ Tonton Video]          │  [Ilustrasi]        │ │
│                                  ~slogan~   └─────────────────────┘ │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                       │
│ │Buku    │ │Jelajah │ │Kuis    │ │Ruang   │   ← 4 kartu kaca      │
│ │Digital │ │Situs   │ │Seru    │ │Guru    │                       │
│ └────────┘ └────────┘ └────────┘ └────────┘                       │
├────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐  TENTANG EDMB                  ┌──────────────┐     │
│ │ gambar     │  Mengenal Warisan Leluhur      │ n Bab        │     │
│ │ [Wilayah]  │  paragraf + [Selengkapnya →]   │ n Situs      │     │
│ └────────────┘                                │ n Video      │     │
│                                               └──────────────┘     │
├────────────────────────────────────────────────────────────────────┤
│ PILIH KELASMU            [Kelas III][Kelas IV]  | Kabar Terbaru     │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐          | • item dokumentasi │
│ │Materi   │ │Latihan  │ │Glosarium│          | • item berita      │
│ └─────────┘ └─────────┘ └─────────┘          | [Lihat semua →]    │
└────────────────────────────────────────────────────────────────────┘
```

Mobile (360 px): navbar ringkas; hero satu kolom (teks dulu, ilustrasi di bawah, tinggi maks 240 px); kartu fitur 2×2; tentang satu kolom, statistik jadi baris geser horizontal; kabar terbaru di bawah.

Isi dan aturan:

| Blok | Isi | Aturan |
| --- | --- | --- |
| Lencana sapaan | "Selamat datang di EDMB" | Statis |
| Judul hero | "Menjelajah **Jejak Megalitik** Banyuwangi" | Kata aksen memakai `--brand-500` dengan kontras terukur; boleh diganti editor lewat pengaturan allowlist (FR-15) |
| Paragraf | Pengantar 2–3 kalimat, kalimat pendek | Teks akhir mengikuti kurasi, bukan karangan pengembang |
| CTA | "Mulai Membaca" → Ensiklopedia; "Tonton Video" → Media Belajar/Video | Tombol video disembunyikan bila belum ada video terbit |
| Kartu fitur | Buku Digital (hijau lumut), Jelajah Situs (terakota), Kuis Seru (emas), Ruang Guru (biru Ijen) | Satu kalimat per kartu |
| Slogan tulisan tangan | Draf: "Kenali, Jaga, Lestarikan" | Dekoratif, `aria-hidden`, disembunyikan di bawah 640 px |
| Tentang | Gambar wilayah umum + teks singkat + tautan ke Tentang | Gambar mendapat kredit |
| Statistik | Jumlah bab, situs, video dari konten terbit | **Tidak boleh angka rekaan.** Jika 0, blok disembunyikan |
| Pilih Kelasmu | Pintasan filter kelas III/IV ke Ensiklopedia dan Latihan | Memakai filter FR-01 |
| Kabar Terbaru | Dokumentasi dan berita yang diizinkan publik (FR-14) | Kosong → blok tidak tampil |

### 5.2 Ensiklopedia (buku digital, FR-02)

- Halaman daftar: sampul buku, ringkasan, tombol "Baca Bab Pertama", "Unduh PDF" (jenis, ukuran, versi), lalu kartu bab berurutan.
- Pembaca bab: judul, ringkasan ramah anak, isi, gambar dengan caption dan kredit, istilah bertaut ke glosarium, kotak "Coba Kuisnya" di akhir bab bila ada latihan terkait.
- PDF viewer terintegrasi (PDF.js), dengan tombol "Unduh" sebagai fallback bila gagal dimuat.
- Efek membalik halaman tidak diwajibkan (analisis 4.3).

### 5.3 Jelajah Situs (FR-03, FR-04)

- Bilah filter: pencarian, jenis tinggalan, wilayah umum, kelas.
- Dua tampilan: Daftar dan Peta (tab). Peta menampilkan area umum yang sudah mendapat clearance.
- Detail situs: judul, lencana jenis, `area_label`, narasi anak (ringkas), bagian "Untuk yang ingin tahu lebih" (konteks ilmiah), sumber, kredit, kotak peringatan pelestarian ("Jaga peninggalan, jangan dicoret atau dipindahkan").
- Status hukum cagar budaya hanya tampil jika bersumber jelas.

### 5.4 Media Belajar (FR-05–07)

- Tab: Galeri, Video, Glosarium.
- Galeri: grid 2/3/4 kolom, lencana Foto/Ilustrasi, lightbox dengan caption, kredit dan alt text; fokus kembali ke pemicu saat ditutup.
- Video: kartu dengan poster dan durasi; halaman pemutar memiliki caption dan transkrip.
- Glosarium: bilah huruf A–Z (tombol 44 px), pencarian, kartu istilah dengan definisi sederhana dan contoh konteks.

### 5.5 Kuis (latihan umum)

- Daftar kuis latihan per kelas. Tanda jelas: "Latihan — nilai tidak disimpan".
- Dua pintu di halaman Kuis: **Latihan** dan **Masukkan Kode Tugas**.
- Latihan: pola yang sama dengan kuis tugas (bagian 6), tetapi tanpa nama dan tanpa status simpan; umpan balik dan penjelasan tampil langsung.

### 5.6 Ruang Guru, Unduhan, Tentang

- Ruang Guru: filter kelas III/IV, kartu panduan dan LKPD (tujuan, durasi rekomendasi, langkah), tombol "Masuk sebagai Guru" menuju dashboard.
- Unduhan: tabel/daftar berisi jenis, kelas, ukuran, versi, tanggal; ikon tipe berkas + teks.
- Tentang: tim, metode penyusunan, etika pelestarian, referensi, dokumentasi, kebijakan privasi.

## 6. Alur siswa: masuk tugas dan mengerjakan kuis

Prinsip: satu tindakan per layar, bahasa singkat, tidak ada kesan "login".

| Layar | Isi | Catatan |
| --- | --- | --- |
| 1. Masuk | Judul "Masuk ke Tugas"; kolom kode 10 karakter (huruf besar, tanpa karakter mirip), atau halaman otomatis jika datang dari QR/tautan | Pesan error umum: "Kode tidak ditemukan. Tanyakan pada gurumu." |
| 2. Konfirmasi tugas | Nama tugas, kelas, nama tampilan guru, ringkasan privasi 2 kalimat (versi pemberitahuan) | Bukan persetujuan orang tua; jangan tampilkan seperti kotak "Saya setuju" |
| 3. Isi nama | Label "Tulis namamu seperti arahan gurumu"; tombol "Mulai" | Nama tidak muncul di URL; tidak ada email atau tanggal lahir |
| 4. Soal | Header: judul tugas, "Soal 2 dari 5", bilah progres; isi soal; pilihan jawaban sebagai kartu 56 px (maks 4); tombol Sebelumnya/Berikutnya | Satu soal per layar untuk kelas III; kelas IV boleh 1–2 soal per layar jika pendek |
| 5. Status simpan | Penanda kecil: "Tersimpan", "Menyimpan…", "Belum tersimpan, periksa sinyal" | Ikon + teks; `aria-live="polite"` |
| 6. Tinjau | Daftar nomor soal dengan penanda terjawab/kosong; tombol "Kirim" | Jika ada kosong: dialog "Masih ada 2 soal kosong. Kirim sekarang?" dengan tombol "Kembali" lebih menonjol |
| 7. Hasil | Kartu: "Jawaban benar 4 dari 5", nilai 80, waktu kirim, kode konfirmasi, tombol "Selesai" | Nada positif netral; tanpa konfeti berlebihan, tanpa peringkat |
| 8. Pembahasan | Hanya muncul jika tugas sudah ditutup dan sesi baca masih sah; selain itu teks "Pembahasan akan dibahas bersama gurumu" | Mengikuti aturan PRD bagian 8 |
| 9. Selesai/Keluar | Mengakhiri sesi dan membersihkan layar | Konfirmasi singkat; tombol "Ganti siswa" tersedia di perangkat bersama |

Pilihan jawaban:
- Huruf A–D di lingkaran + teks; terpilih = tepi hijau tebal + ikon centang (bukan hanya warna).
- Setelah dikirim, pilihan terkunci dan terlihat nonaktif.
- Gambar pada soal wajib ber-alt text.

Status khusus: sesi hampir habis (penghitung mundur terlihat 5 menit terakhir, tidak mengejutkan), jaringan putus (spanduk kuning, tombol "Kirim ulang"), tugas ditutup atau dicabut (layar ramah "Tugas ini sudah ditutup. Beri tahu gurumu."), sesi berakhir.

## 7. Area guru

Tata letak: sidebar kiri 240 px (desktop) atau menu bawah/laci (mobile); konten di kanan. Latar krem–putih lembut yang sama, tanpa bokeh agar fokus ke data. Penanda "Data privat" di header halaman yang menampilkan nama siswa.

| Halaman | Komponen utama |
| --- | --- |
| Ringkasan | Kartu: kelas aktif, tugas terbuka, jumlah kiriman terbaru; daftar tugas terbaru dengan status |
| Kelas Saya | Daftar kelas (label, kelas 3/4, tahun ajaran, sekolah), tombol "Buat Kelas", arsip |
| Materi Kokurikuler | Panduan dan LKPD terfilter kelas, tautan ke ensiklopedia |
| Tugas dan Kuis | Stepper 4 langkah: Pilih kelas → Pilih kuis tervalidasi → Jadwal → Tinjau dan buka. Memuat panel kesiapan persetujuan orang tua/wali. Setelah dibuka: tautan, QR (dibuat lokal), kode, tombol Rotasi Akses, Tutup, Cabut (dengan alasan wajib) |
| Hasil Belajar | Tabel: nama, waktu kirim, nilai, benar/total, percobaan, status verifikasi; filter, pencarian nama, "diperbarui n detik lalu", ekspor CSV; detail per soal di panel samping |
| Akun | Profil, sekolah, kata sandi, MFA opsional, keluar |

Aturan penting:
- Rekap menyebut "kiriman", bukan "siswa", karena tidak ada roster.
- Nama ganda ditandai chip "Nama sama" dan tidak digabung.
- Guru dapat menandai hasil sah/tidak sah dan menambah koreksi nama dengan alasan; nilai asli tidak berubah.
- Tombol ekspor menampilkan peringatan privasi singkat; CSV berisi netralisasi formula (sisi server).
- Penanda "Data hasil dihapus otomatis pada <tanggal>" (retensi 90 hari) tampil di halaman tugas.
- Tombol berbahaya (Cabut, Hapus) berwarna `--danger` dengan dialog konfirmasi.

## 8. Area admin

Pola dashboard yang sama dengan guru, ditambah:

| Halaman | Komponen utama |
| --- | --- |
| Konten | Tabel item (jenis, judul, status revisi, tanggal telaah); filter jenis dan status |
| Editor revisi | Editor terstruktur (allowlist), panel samping: sasaran kelas, sumber, media, tautan relasi |
| Alur status | Stepper: Draf → Penelaahan → Disetujui → Terbit → Arsip; tombol "Terbitkan" nonaktif sampai syarat lengkap, daftar syarat ditampilkan (sumber, aset cleared, validasi bahasa/materi/media/lokasi bila relevan) |
| Catatan validasi | Chip per jenis (bahasa, materi, media, lokasi) dengan keputusan, nama peninjau (label), tanggal, bukti privat |
| Situs dan peta umum | Form `area_label` dan titik representatif wilayah; tidak ada kolom koordinat tepat; status clearance |
| Media | Unggah → karantina → hasil scan → bersih → turunan web; status `scan_status` berlencana; peringatan GPS/EXIF |
| Bank kuis | Soal, pilihan (2–4), kunci (hanya admin), penjelasan, mode practice/assignment, validasi |
| Guru/sekolah | Undangan, aktivasi, suspensi |
| Dukungan data siswa | Mode dukungan: alasan wajib, satu tugas, kedaluwarsa 30 menit (penghitung mundur), banner merah "Mode dukungan aktif — diaudit" |
| Audit dan pemeliharaan | Log tersanitasi, status backup/purge, pengaturan teks/tautan/menu yang diizinkan |

Admin memakai MFA; halaman sensitif meminta autentikasi ulang (dialog tersendiri).

## 9. Gaya gambar dan ilustrasi

### 9.1 Hero dan ilustrasi

- Hero memakai **ilustrasi** (anak-anak digambar, bukan foto) berinteraksi dengan siluet tinggalan megalitik (menhir, dolmen, batu berundak sebagai bentuk umum). Lencana "Ilustrasi" ditampilkan pada sudut gambar.
- Palet ilustrasi selaras token (krem batu andesit, hijau lumut, terakota, emas fajar, sedikit biru Ijen untuk langit).
- Gaya: flat/semi-flat, garis lembut, tanpa teks di dalam gambar.
- Foto nyata situs dipakai di Jelajah Situs dengan kredit dan hasil sanitasi metadata. Dilarang memuat foto yang membocorkan petunjuk lokasi sensitif.
- Foto anak nyata tidak dipakai di materi publik kecuali ada persetujuan tertulis yang terdokumentasi.
- Gambar AI/rekonstruksi wajib berlabel "Ilustrasi" dan tidak diperlakukan sebagai bukti.

### 9.2 Dekorasi latar

- Lingkaran blur (bokeh): 3–5 elemen CSS, gradasi hijau lumut/emas/biru Ijen, opasitas 25–40%, `pointer-events:none`, `aria-hidden`.
- Pola halus (opsional): garis kontur lembut atau tekstur batu pada area tentang, kontras sangat rendah, tidak mengganggu teks.
- Dekorasi dimatikan atau disederhanakan saat `prefers-reduced-data` atau perangkat lemah.

### 9.3 Ikon

Set ikon garis 24 px, tebal 1.75 px, sudut membulat (mis. Lucide). Ikon dekoratif `aria-hidden`; ikon yang berdiri sendiri memiliki label.

## 10. Gerak dan interaksi

| Elemen | Gerak | Batas |
| --- | --- | --- |
| Hover/fokus kartu | Naik 2 px + bayangan, 150 ms | Hanya penambah; fungsi tidak bergantung hover |
| Transisi halaman | Fade 150–200 ms | Dimatikan bila `prefers-reduced-motion` |
| Bokeh/latar | Statis | Tanpa animasi pada MVP |
| Hasil kuis | Kartu muncul halus | Tanpa konfeti, kedip, atau suara otomatis |
| Video | Hanya atas tindakan pengguna | Tanpa autoplay |

## 11. Aksesibilitas (NFR-02)

- Kontras: teks ≥4,5:1, teks besar dan komponen UI ≥3:1; periksa teks di atas kaca dan gradien pada titik terburuk.
- Fokus: cincin ganda putih–hijau tua `--focus-ring`, tidak tertutup elemen sticky (navbar harus memberi `scroll-padding-top`).
- Keyboard: semua dropdown, tab, lightbox, dialog dan pembaca PDF dapat dioperasikan; urutan tab mengikuti urutan visual.
- Struktur: satu h1 per halaman, landmark (header, nav, main, footer), tautan "Lewati ke konten" di awal.
- Gambar: `alt` bermakna per konteks; dekoratif `alt=""`.
- Video: caption dan transkrip; poster dengan alt.
- Formulir: label terhubung, pesan error spesifik dan diumumkan (`aria-live`), tidak mengosongkan isian saat error.
- Target sentuh: minimum 44 px, siswa 48 px; jarak antar target cukup.
- Teks dapat diperbesar 200% tanpa kehilangan fungsi; tanpa scroll horizontal pada 360 px.
- Bahasa: `lang="id"`; istilah asing/daerah diberi penjelasan di glosarium.
- Kuis: tidak ada batas waktu menekan per soal; hitung mundur sesi bersifat informatif dan tidak membuat panik.
- Ujian: otomatis (axe/Lighthouse) + manual keyboard + pembaca layar (AT-19).

## 12. Performa desain (NFR-03)

- Gambar hero: AVIF/WebP, dimensi tetap, `fetchpriority="high"`, ukuran target ≤150 KB di mobile.
- Gambar lain `loading="lazy"` dengan `width`/`height` atau `aspect-ratio`.
- Hindari `backdrop-filter` pada banyak elemen sekaligus; batasi pada navbar dan satu baris kartu hero.
- Font: maksimal 3 berkas (Jakarta, Nunito, Caveat) dengan subset; Caveat dimuat hanya di Beranda.
- Peta dan PDF.js dimuat dinamis hanya pada halaman yang memerlukan.
- Tanpa skrip analitik, widget atau embed pihak ketiga di halaman tugas.

## 13. Microcopy (Bahasa Indonesia, nada ramah dan jelas)

| Konteks | Contoh draf |
| --- | --- |
| Tombol utama | Mulai Membaca • Masuk Tugas • Kirim Jawaban • Selesai |
| Kode salah | Kode tidak ditemukan. Periksa lagi atau tanya gurumu. |
| Tugas ditutup | Tugas ini sudah ditutup. Beri tahu gurumu ya. |
| Simpan | Tersimpan • Menyimpan… • Belum tersimpan, cek sinyalmu |
| Konfirmasi kosong | Masih ada 2 soal belum dijawab. Mau kirim sekarang? |
| Peta | Lokasi ditampilkan sebagai wilayah perkiraan untuk melindungi peninggalan. |
| Pelestarian | Peninggalan ini rapuh. Lihat dengan mata, jangan dipindahkan atau dicoret. |
| Kosong | Belum ada materi untuk filter ini. Coba pilih kelas atau jenis lain. |

Semua teks di atas adalah draf; teks final ditelaah editor dan ahli pendidikan dasar. Hindari kata teknis dan kalimat panjang untuk kelas III.

## 14. Keterlacakan desain ke kebutuhan

| Elemen desain | Kebutuhan |
| --- | --- |
| Navbar, pencarian, filter | FR-01 |
| Pembaca bab, PDF viewer, unduh | FR-02 |
| Kartu situs, detail, peringatan pelestarian | FR-03 |
| Kotak peta umum, fallback daftar | FR-04, SEC-16 |
| Galeri dan lencana Foto/Ilustrasi | FR-05 |
| Glosarium A–Z | FR-06 |
| Pemutar video tanpa autoplay | FR-07 |
| Latihan tanpa nama | FR-08 |
| Ruang Guru, Unduhan | FR-09 |
| Login guru, kelas | FR-10 |
| Alur masuk tugas dan kuis siswa | FR-11 |
| Tabel hasil, anotasi, CSV | FR-12 |
| Stepper validasi dan publikasi admin | FR-13 |
| Tentang, dokumentasi, Kabar Terbaru | FR-14 |
| Pengaturan allowlist dan audit | FR-15 |
| Bookmark lokal (P1) | FR-16 |
| Responsif, tanpa hover | NFR-01 |
| Kontras, fokus, caption | NFR-02 |
| Aturan gambar, font, blur | NFR-03 |
| Tanggal Asia/Jakarta di UI | NFR-07 |
| Tanpa cache untuk layar siswa/guru | NFR-08, SEC-07 |

## 15. Kriteria penerimaan desain

1. Beranda, Ensiklopedia, Jelajah Situs, Media Belajar, Kuis, Ruang Guru, Unduhan dan Tentang tersedia pada 360 px, 768 px dan 1280 px.
2. Alur siswa dari masuk kode sampai hasil tersedia pada 360 px dengan target 48 px.
3. Tidak ada angka statistik, kontak atau teks hukum rekaan di desain final.
4. Hero memakai ilustrasi berlabel; tidak ada foto anak.
5. Semua pasangan warna teks/latar lolos 4,5:1 (3:1 untuk teks besar dan komponen).
6. Peta tidak menampilkan pin presisi atau tautan navigasi.
7. Halaman kuis tidak memuat leaderboard, nama di URL, atau aset pihak ketiga.
8. Uji kegunaan dengan guru dan siswa kelas III–IV (mengikuti uji 30 orang pada proposal) mencatat penyelesaian tugas inti, bantuan fasilitator dan kegagalan.

## 16. Hal yang masih perlu diputuskan

| Keputusan | Pemilik | Catatan |
| --- | --- | --- |
| Logo, nama singkat dan identitas pengelola | Pengelola | Belum ada di paket dokumen |
| Gaya ilustrasi hero dan maskot (jika ada) | Tim desain + ahli pendidikan dasar | Uji keterterimaan anak kelas III–IV |
| Final font (uji keterbacaan pada ponsel murah) | Tim desain | Alternatif: font sistem untuk performa |
| Judul hero, slogan dan teks pengantar | Editor | Draf di dokumen ini hanya contoh |
| Jenis ikon dan set ilustrasi | Tim desain | Pastikan lisensi |
| Palet warna final dan makna budayanya | Pengelola + ahli budaya | Palet 3.1 adalah usulan; ukur kontras dengan alat dan uji pada ponsel layar redup |
| Jumlah konten untuk statistik | Inventaris editorial | Blok disembunyikan jika belum ada |
| Penyedia tile peta | Tim teknis | Lisensi dan atribusi mengikuti ketentuan penyedia |
| Persetujuan visual akhir | Pengelola | Seluruh isi dokumen ini adalah arah, bukan desain yang disetujui |
