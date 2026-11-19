# Product Requirements Document

Produk: Ensiklopedia Digital Megalitik Banyuwangi (EDMB) • Versi 1.0

## 1. Tujuan dan hasil yang diharapkan

Menyediakan sumber belajar budaya megalitik Banyuwangi yang akurat, mudah digunakan siswa kelas III–IV, membantu guru menjalankan aktivitas kokurikuler, dan memperluas akses pengetahuan publik secara bertanggung jawab. Keberhasilan produk meliputi tersedianya konten tervalidasi, kemudahan penggunaan dan pengiriman hasil kuis kepada guru. Klaim peningkatan hasil belajar memerlukan rancangan penelitian tersendiri.

## 2. Persona dan kebutuhan

| Pengguna | Kebutuhan utama | Cara akses |
| --- | --- | --- |
| Siswa kelas III | Membaca materi singkat, melihat gambar, mengerjakan kuis sederhana | Publik; isi nama hanya pada tugas guru |
| Siswa kelas IV | Menjelajah katalog, memahami istilah dan hubungan budaya, mengikuti aktivitas | Publik; tautan/kode tugas guru |
| Publik | Mengenal peninggalan dan sumber pengetahuan | Tanpa akun |
| Guru | Memilih materi, memandu aktivitas, membuat tugas serta membaca hasil | Materi publik; login untuk kelas dan nilai |
| Admin | Mengelola substansi, publikasi, bank kuis, guru dan operasional | Akun terverifikasi dan MFA |

## 3. Prioritas

P0 wajib sebelum uji penerimaan dan rilis awal. P1 peningkatan setelah alur inti stabil; bukan alasan menunda fitur inti proposal. P2 fase berikutnya setelah evaluasi. Semua konten contoh harus ditandai sebagai data uji dan dihapus sebelum produksi.

## 4. Struktur web yang direkomendasikan

### 4.1 Area publik

| Menu | Halaman dan fungsi | Akses |
| --- | --- | --- |
| Beranda | Pengantar singkat, mulai membaca, jelajah situs, akses tugas | Publik |
| Ensiklopedia | Buku digital berbab, daftar isi, PDF viewer, unduh buku | Publik |
| Jelajah Situs | Katalog/filter, detail tinggalan/situs, sumber dan peta umum | Publik |
| Media Belajar | Galeri foto/ilustrasi, video dengan caption/transkrip, glosarium A–Z | Publik |
| Kuis | Latihan umum dan formulir masuk tugas dengan kode | Publik |
| Ruang Guru | Panduan, alur kokurikuler, LKPD, tautan dashboard guru | Materi publik; dashboard privat |
| Tentang | Tim, metode penyusunan, etika pelestarian, referensi, dokumentasi | Publik |
| Unduhan | Buku, panduan, LKPD dengan jenis, ukuran, kelas dan versi | Publik |

Peta berada pada Jelajah Situs dan dapat dibuka sebagai halaman tersendiri. Glosarium juga dapat dibuka langsung melalui tautan istilah. Pengelompokan menu bertujuan mengurangi kepadatan navigasi tanpa menghilangkan modul proposal. Tata letak akhir menunggu desain.

Footer mencakup kontak pengelola, hak cipta dan atribusi, kebijakan privasi, ketentuan penggunaan, kanal koreksi konten serta pemberitahuan peta umum. Kontak belum diisi dengan data rekaan.

### 4.2 Area guru

| Menu | Fungsi |
| --- | --- |
| Ringkasan | Kelas aktif, tugas terbaru, jumlah kiriman dan status |
| Kelas Saya | Membuat kelas III/IV, label rombel, tahun ajaran, sekolah; arsip |
| Materi Kokurikuler | Panduan dan LKPD sesuai kelas, tautan ke ensiklopedia |
| Tugas dan Kuis | Pilih kuis tervalidasi, pilih kelas, jadwalkan, bagikan tautan/QR/kode, tutup tugas |
| Hasil Belajar | Nama, waktu kirim, nilai, jawaban per soal, percobaan, status verifikasi dan CSV |
| Akun | Profil, sekolah, kata sandi, MFA opsional dan keluar |

Guru memakai bank kuis terbitan admin. Pembuatan soal sendiri, kolaborasi antarguru dan pengumpulan berkas LKPD dapat ditambahkan pada fase berikutnya. Tidak memerlukan LMS penuh pada MVP.

### 4.3 Area admin

Ringkasan, konten ensiklopedia, situs dan peta umum, buku dan bab, media, glosarium, panduan/LKPD, bank kuis, catatan validasi, guru/sekolah, halaman/pengaturan, dokumentasi kegiatan, audit dan pemeliharaan. Akses data hasil siswa memerlukan mode dukungan dengan alasan tercatat, bukan tampilan umum dashboard admin.

## 5. Matriks hak akses

| Tindakan | Publik/siswa | Guru | Admin |
| --- | --- | --- | --- |
| Baca konten terbitan, unduh materi | Ya | Ya | Ya |
| Lihat draf dan catatan validasi | Tidak | Tidak | Ya |
| Latihan umum tanpa nama | Ya | Ya | Ya |
| Kirim tugas dengan nama | Dengan tautan/kode dan sesi sah | Untuk uji seperti siswa | Untuk uji seperti siswa |
| Melihat hasil satu percobaan | Sesi sendiri yang masih sah | Tugas milik sendiri | Dukungan terbatas dan diaudit |
| Buat kelas/tugas | Tidak | Milik sendiri | Tidak otomatis bertindak sebagai guru |
| Lihat/ekspor daftar nilai | Tidak | Tugas milik sendiri | Dukungan beralasan, diaudit |
| Kelola konten dan kuis | Tidak | Tidak pada MVP | Ya |
| Aktivasi akun guru dan pengaturan | Tidak | Tidak | Ya |
| Ubah skor mentah otomatis | Tidak | Tidak | Tidak melalui CRUD umum |

Guru bisa menandai hasil tidak sah dan memilih percobaan yang digunakan, dengan alasan. Perubahan hasil oleh koreksi kunci memerlukan versi/perhitungan ulang terpisah dengan jejak audit, bukan menimpa nilai awal.

## 6. Kebutuhan fungsional

| ID | Kebutuhan | Prioritas | Kriteria penerimaan |
| --- | --- | --- | --- |
| FR-01 | Navigasi dan pencarian konten publik | P0 | Pencarian judul/kata kunci, filter jenis/kelas; hanya revisi terbit yang muncul; hasil kosong dijelaskan |
| FR-02 | Buku digital interaktif | P0 | Daftar isi, bab HTML, navigasi berikut/sebelum, gambar/media terkait, PDF viewer, fallback unduh |
| FR-03 | Katalog dan detail situs | P0 | Nama, jenis tinggalan, wilayah umum, narasi anak, konteks ilmiah, sumber, kredit dan peringatan pelestarian |
| FR-04 | Peta umum | P0 | Hanya area yang disetujui; label perkiraan, atribusi, fallback daftar wilayah; tidak ada petunjuk menuju titik sensitif |
| FR-05 | Galeri | P0 | Foto/ilustrasi dibedakan, caption, kredit, alt text, kaitan konten; aset sudah lolos pemeriksaan |
| FR-06 | Glosarium | P0 | A–Z, pencarian, definisi sederhana, contoh konteks dan tautan dari bab |
| FR-07 | Video edukasi | P0 | Pemutaran atas tindakan pengguna, caption/transkrip, poster, durasi; tidak memutar otomatis |
| FR-08 | Latihan kuis umum | P0 | Tanpa nama/login; pilihan ganda, hasil dan penjelasan; tidak menyimpan nilai individu |
| FR-09 | Ruang guru, LKPD dan unduhan | P0 | Filter kelas III/IV, tujuan, langkah kegiatan, durasi rekomendasi, dokumen PDF dan versi |
| FR-10 | Akun guru dan kelas | P0 | Undangan admin, email terverifikasi, login/pemulihan; kelas bergrade 3/4 dengan satu guru pemilik |
| FR-11 | Tugas tanpa login siswa | P0 | Satu tugas untuk satu kelas dan versi kuis; link/QR/kode; nama; jadwal; simpan jawaban dan kirim |
| FR-12 | Rekap guru | P0 | Nama, nilai 0–100, benar/total, waktu, daftar percobaan, filter, verifikasi dan CSV privat |
| FR-13 | CMS dan validasi | P0 | Draf, penelaahan, persetujuan, publikasi, arsip; catatan bahasa/materi/media dan clearance lokasi untuk revisi terkait |
| FR-14 | Tentang dan dokumentasi | P0 | Halaman tim, referensi, metode, diseminasi/berita/HKI yang boleh dipublikasikan, kontak dan kebijakan |
| FR-15 | Pengaturan dan audit | P0 | Admin mengubah teks/link/menu yang diizinkan; log publikasi, ekspor dan perubahan akses; tanpa editor kode bebas |
| FR-16 | Bookmark bacaan lokal | P1 | Hanya konten publik; tidak menyimpan nama/nilai; tombol hapus tersedia |
| FR-17 | Paket bacaan untuk koneksi terbatas | P1 | Unduh PDF secara sadar; kuis penilaian tetap memerlukan koneksi |
| FR-18 | Usulan konten oleh guru dan rubrik LKPD | P2 | Didesain setelah evaluasi kebutuhan guru |

## 7. Alur utama

### 7.1 Membaca dan latihan umum

Pengunjung membuka beranda → memilih bab atau situs → membaca, melihat istilah/gambar/video → mencoba latihan umum → menerima umpan balik. Tidak diminta nama. Jawaban latihan diproses melalui API tanpa membuat rekam nilai individu; log tidak merekam isi jawaban.

### 7.2 Guru menyiapkan tugas

Guru login → membuat/memilih kelas III atau IV → memilih kuis sesuai kelas → mengisi judul dan waktu buka/tutup → memeriksa dasar pemrosesan data anak dan kesiapan persetujuan → membuka tugas → menerima link/QR/kode → membagikan kepada siswa. Membagikan merupakan tindakan guru di luar sistem; tidak ada pesan otomatis ke siswa.

Kode direkomendasikan acak 10 karakter tanpa karakter yang mudah tertukar. Link memakai token acak terpisah dengan entropi minimal 128 bit. Kode memberi izin memulai tugas, tidak memberi izin melihat daftar nilai.

### 7.3 Siswa mengerjakan

Siswa membuka link atau memasukkan kode → sistem menampilkan nama tugas, kelas dan nama tampilan guru → siswa mengisi nama sesuai arahan guru → sistem membuat sesi sementara → siswa mengerjakan → jawaban tersimpan berkala saat terkoneksi → siswa menekan Kirim → sistem menghitung nilai → menampilkan tanda kirim dan nilai miliknya → siswa menekan Selesai/Keluar untuk membersihkan sesi perangkat bersama.

Nama tidak diletakkan pada URL. Tidak ada daftar nama siswa atau papan peringkat pada halaman publik. Kelas dipilih oleh tugas, bukan diisi bebas oleh siswa. Jika tugas tidak ditemukan/ditutup, tampilkan pesan aman dan arahkan meminta bantuan guru.

### 7.4 Guru membaca nilai

Guru membuka tugas → daftar kiriman diperbarui melalui polling ringan → memeriksa nama, nilai dan waktu → menandai hasil valid/tidak sah → memilih percobaan yang digunakan jika perlu → mengekspor CSV. Rekap menyebut jumlah **kiriman**, bukan jumlah siswa unik yang sudah mengerjakan, karena tidak ada roster/akun siswa.

## 8. Aturan penilaian dan edge case

| Kondisi | Perilaku |
| --- | --- |
| Bentuk soal MVP | Pilihan ganda satu jawaban benar, bobot sama; minimal satu soal |
| Rumus | Nilai = pembulatan dua desimal dari jumlah benar / jumlah soal × 100; salah/kosong = 0 |
| Sebelum kirim | Ada konfirmasi jika masih kosong; siswa dapat kembali melengkapi |
| Setelah kirim | Jawaban terkunci; refresh tidak menciptakan nilai baru |
| Pembahasan tugas | Nilai tampil setelah kirim; pembahasan hanya setelah waktu tutup jika sesi baca hasil masih sah, atau dibahas guru di kelas; kunci tidak dikirim sebelum penutupan |
| Pembahasan latihan | Boleh langsung; soal latihan dipisahkan dari bank tugas yang sedang digunakan |
| Nama sama | Buat percobaan berbeda; jangan menggabungkan/menimpa berdasarkan nama |
| Salah nama | Guru menambahkan koreksi nama dengan alasan; nilai asli tidak berubah; audit tanpa menyebarkan nama ke log |
| Mengulang dari browser lain | Bisa terjadi; guru memverifikasi, sistem tidak menjanjikan batas satu siswa satu percobaan |
| Jaringan terputus | Tampilkan status belum tersimpan; kirim ulang dengan idempotency key; hasil hanya sah setelah server mengonfirmasi |
| Sesi berakhir | Guru dapat mengarahkan memulai ulang jika tugas masih buka; percobaan lama tidak dianggap terkirim |
| Batas sesi | Default 2 jam atau waktu tutup tugas, mana yang lebih awal; tenggat server ditampilkan saat mulai |
| Sesudah submit | Sesi baca hasil maksimal 30 menit setelah kirim; jawaban tetap terkunci; tombol Selesai mengakhiri sesi lebih awal |
| Tutup tugas biasa | Hentikan percobaan baru; percobaan yang sudah dimulai dapat kirim sampai tenggatnya |
| Cabut tugas darurat | Tolak mulai dan kirim, batalkan sesi aktif; alasan tercatat |
| Soal diubah | Tugas berjalan tetap memakai revisi lama; koreksi substansi dibuat sebagai revisi baru |
| Perangkat bersama | Satu percobaan aktif per browser; tombol ganti siswa membersihkan sesi setelah konfirmasi |

## 9. Persyaratan konten

Setiap konten mempunyai judul, ringkasan ramah anak, sasaran kelas, tipe konten, sumber, kredit/lisensi, status, revisi dan tanggal penelaahan. Ilustrasi rekonstruksi/AI ditandai secara jelas dan tidak diperlakukan sebagai foto bukti. Materi kelas III–IV ditelaah ulang, termasuk LKPD dan tingkat kesulitan soal. Jumlah final per jenis ditetapkan dalam inventaris editorial, tanpa mengarang kuota dari proposal.

## 10. Kebutuhan nonfungsional

| ID | Target awal, perlu dibuktikan lewat pengujian |
| --- | --- |
| NFR-01 | Responsif pada lebar 360 px hingga desktop; fungsi inti bekerja tanpa hover |
| NFR-02 | Aksesibilitas ditargetkan WCAG 2.2 AA: keyboard, label, fokus, kontras, alt text, caption, pesan kesalahan jelas |
| NFR-03 | Target LCP ≤2,5 detik, INP ≤200 ms, CLS ≤0,1 pada persentil 75 jika tersedia data lapangan; sebelum itu gunakan uji laboratorium pada perangkat/koneksi representatif |
| NFR-04 | API umum p95 ≤800 ms dan submit p95 ≤1,5 detik pada uji 100 siswa aktif; tidak termasuk unduh video/PDF dan jaringan klien |
| NFR-05 | Uji awal 100 siswa aktif, 30 submit bersamaan dan 10 guru; error tak terduga <1%, tidak ada kiriman hilang/ganda akibat retry |
| NFR-06 | Target ketersediaan bulanan 99,5%, RPO ≤24 jam dan RTO ≤8 jam; target operasional, bukan SLA yang telah dibeli |
| NFR-07 | Seluruh tanggal disimpan UTC dan ditampilkan Asia/Jakarta; format waktu/jadwal jelas |
| NFR-08 | Dashboard, sesi, jawaban dan hasil memakai no-store; hanya konten publik boleh memakai cache bersama |
| NFR-09 | Backup database dan file diuji restore; kepemilikan domain, kode dan akun layanan atas pengelola |

## 11. Ukuran keberhasilan dan penerimaan

Pada uji terbatas 30 orang sesuai proposal, catat komposisi guru/siswa yang benar-benar hadir. Target awal yang diusulkan: ≥90% peserta menyelesaikan tugas penggunaan inti yang diberikan; 100% kiriman sah masuk guru yang tepat; tidak ada akses lintas guru; seluruh konten yang dipublikasikan mempunyai bukti validasi yang diwajibkan. Catat penyebut, perangkat, bantuan fasilitator dan kegagalan. Target ini rekomendasi produk, bukan angka yang sudah dijanjikan proposal.

Rilis diterima setelah semua P0 lulus, konten final tersedia pada semua modul, pengujian keamanan kritis lulus, restore berhasil, panduan admin/guru tersedia dan pemilik operasional ditetapkan. Temuan kritis privasi, otorisasi, penilaian atau kehilangan data memblokir rilis.

## 12. Di luar lingkup MVP

Akun siswa; NISN/NIK; data biometrik; ujian resmi; sertifikat nilai otomatis; leaderboard publik; chat/forum; integrasi Dapodik; AI generatif; pemetaan koordinat tepat; transaksi; pembayaran; aplikasi native; sinkronisasi nilai ke Google Sheets; pengiriman email/WhatsApp nilai; pengumpulan foto/tugas anak. Penambahan memerlukan perubahan PRD dan penilaian biaya/privasi.
