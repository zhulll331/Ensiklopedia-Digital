# Spesifikasi Produk Ensiklopedia Digital Megalitik Banyuwangi

Versi: 1.0 • Tanggal: 17 November 2026 • Bahasa produk: Indonesia

Status: rancangan kebutuhan dan rekomendasi teknis siap ditelaah; belum merupakan aplikasi yang dibangun atau desain visual yang disetujui.

## 1. Keputusan utama

| Aspek | Keputusan kerja |
| --- | --- |
| Produk | Web-app ensiklopedia edukasi budaya Banyuwangi, responsif dan berorientasi perangkat seluler |
| Pengguna | Publik/siswa tanpa akun, guru dengan akun, admin dengan akun |
| Sasaran siswa | Kelas III dan IV sesuai arahan terbaru pengguna; berbeda dengan kelas IV–VI dalam proposal |
| Siswa mengerjakan kuis | Buka tautan tugas/QR dari guru atau isi kode tugas, isi nama, kerjakan, kirim |
| Pengiriman nilai | Nilai tersimpan di dashboard guru pemilik tugas; tidak memerlukan email siswa atau pengiriman pesan |
| Pemisahan kuis | Latihan umum tanpa nama dan tanpa penyimpanan nilai individu; tugas guru menyimpan nama serta nilai secara privat |
| Guru | Menggunakan materi, membuat kelas dan tugas dari kuis tervalidasi, memantau serta mengekspor hasil |
| Admin | Mengelola konten, validasi, media, bank kuis, guru, pengaturan, dan operasional |
| Stack utama | Next.js + TypeScript; Supabase PostgreSQL, Auth dan Storage; CMS khusus di aplikasi |
| API | REST JSON melalui backend aplikasi; penilaian dan otorisasi dilakukan di server |
| Hosting | Produksi terkelola direkomendasikan; opsi VPS tersedia jika ada pengelola teknis |
| Anggaran | Belum ditentukan; angka dalam dokumen merupakan simulasi, bukan penawaran |
| Desain visual | Menyusul; dokumen hanya menetapkan struktur informasi, alur, perilaku dan aksesibilitas |

**Makna tanpa login:** siswa tidak membuat akun, tidak menggunakan kata sandi, dan tidak perlu email. Sistem tetap membuat sesi pengerjaan sementara yang tidak terlihat sebagai proses login. Nama yang diisikan tidak membuktikan identitas siswa; hasil sesuai untuk evaluasi formatif dengan pengawasan guru.

## 2. Isi paket dan urutan baca

| Berkas | Isi |
| --- | --- |
| [01_ANALISIS_PROPOSAL.md](01_ANALISIS_PROPOSAL.md) | Temuan proposal, kesenjangan, perubahan sasaran, keterlacakan kebutuhan |
| [02_PRD.md](02_PRD.md) | Kebutuhan produk, struktur web, peran, fitur, alur, prioritas dan kriteria penerimaan |
| [03_ARSITEKTUR_DAN_TECH_STACK.md](03_ARSITEKTUR_DAN_TECH_STACK.md) | Pilihan stack, batas sistem, diagram komponen, keputusan teknis dan integrasi |
| [04_DATABASE.md](04_DATABASE.md) | Model data, kamus tabel, relasi, aturan integritas, transaksi dan akses database |
| [05_API.md](05_API.md) | Kontrak endpoint, autentikasi, skema permintaan, kesalahan dan idempotensi |
| [06_KEAMANAN_DAN_PRIVASI.md](06_KEAMANAN_DAN_PRIVASI.md) | Ancaman, perlindungan data anak, keamanan kuis, media, lokasi dan kontrol akses |
| [07_IMPLEMENTASI_OPERASIONAL_DAN_BIAYA.md](07_IMPLEMENTASI_OPERASIONAL_DAN_BIAYA.md) | Tahapan, pengujian, rilis, backup, pemeliharaan, estimasi dan sumber resmi |

Dokumen-dokumen ini saling melengkapi. ID kebutuhan `FR`, `NFR`, `SEC`, dan `AT` dipakai untuk penelusuran saat implementasi. Isi yang ditandai rekomendasi atau asumsi belum menjadi persetujuan biaya, penyedia, maupun kontrak.

## 3. Batas versi pertama

Semua menu inti proposal masuk versi pertama: buku digital, katalog situs, peta umum, galeri, glosarium, kuis, ruang guru, panduan, LKPD, PDF viewer, unduhan dan video. Tugas tanpa akun serta rekap guru merupakan tambahan dari arahan pengguna. Penugasan awal memakai soal pilihan ganda satu jawaban agar penilaian otomatis dapat dipertanggungjawabkan.

LMS penuh, aplikasi Android/iOS, AI/chatbot, forum, WhatsApp API, pembayaran, ranking siswa publik, koordinat sensitif dan pengumpulan LKPD oleh siswa tidak menjadi kebutuhan awal.

## 4. Hal yang masih perlu diputuskan sebelum rilis

Hal berikut tidak menghambat penyusunan dokumen, tetapi memerlukan keputusan pada tahap pelaksanaan: identitas pengelola dan kontak privasi; sekolah mitra; jumlah konten final; penanggung jawab validator; domain dan penyedia; anggaran tahunan; bukti persetujuan orang tua/wali; serta kebijakan retensi sekolah. Default teknis tercantum dalam masing-masing berkas.

## 5. Dasar penyusunan

1. `Proposal_Ensiklopedia_Digital_Megalitik_Banyuwangi_REVISI_KUNING(2).docx`, termasuk tabel luaran, tahapan, jadwal dan panitia, dibaca dari berkas unggahan.
2. Arahan pengguna: siswa kelas III–IV tanpa login, mengisi nama, nilai masuk kepada guru; rekomendasi struktur mengikuti proposal; desain menyusul; anggaran belum dipilih.
3. Dokumentasi resmi penyedia dan ketentuan terkait yang ditelaah pada 17 November 2026; tautan ada di berkas 07. Tidak ada harga pengadaan atau jumlah konten yang dianggap sudah disahkan.
