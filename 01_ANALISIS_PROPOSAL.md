# Analisis Proposal dan Implikasinya terhadap Produk

## 1. Ringkasan penilaian

Proposal memiliki konsep produk yang cukup jelas: ensiklopedia berbasis web dengan buku digital sebagai konten inti, didukung fitur penjelajahan dan perangkat kokurikuler. Produk sebaiknya dibangun sebagai satu aplikasi dengan CMS dan database, sehingga guru dan masyarakat menggunakan sumber konten yang sama dan pembaruan dapat dikelola admin.

Kekuatan utamanya adalah konteks budaya lokal, hubungan penelitian arkeologi dengan pembelajaran SD, kurasi dan validasi ahli yang terpisah, serta kebutuhan pelindungan informasi situs. Namun, proposal belum cukup rinci sebagai spesifikasi pengembang. Identitas pengguna, alur penerimaan nilai, kontrak data, penerbitan konten, pengelolaan privasi dan penerimaan teknis perlu ditambahkan.

## 2. Temuan yang benar-benar tercantum

| Bukti dalam proposal | Implikasi produk |
| --- | --- |
| Bab I bagian 1.1, 1.2 dan 1.4: web-app responsif melalui browser | Prioritas mobile web; instalasi aplikasi tidak wajib |
| Bab II bagian 2.1: buku digital merupakan konten inti | Sediakan pembaca HTML berbab serta PDF terintegrasi, bukan hanya tautan file |
| Bab I bagian 1.4 dan Bab II bagian 2.1: menu konten lengkap | Katalog, peta umum, galeri, glosarium, kuis, ruang guru, LKPD, video dan unduhan harus tersedia |
| Bab II bagian 2.2: sasaran utama kelas IV, V, VI | Perlu perubahan editorial untuk mengikuti kelas III–IV yang diminta pengguna |
| Bab I bagian 1.2: informasi sensitif situs tidak ditampilkan | Lokasi publik harus berupa wilayah umum; berkas dan metadata juga diperiksa |
| Bab I bagian 1.4 dan Bab V bagian 5.1: 3 ahli dan 3 validator | CMS mencatat bukti kurasi dan validasi; validator tidak otomatis membutuhkan peran login baru |
| Bab IV dan tabel tahapan: durasi program lima bulan | Pengembangan bertahap; kesiapan konten menjadi ketergantungan utama |
| Bab IV: web-app bulan 2–3, uji coba dan diseminasi bulan 4 | Uji teknis internal harus selesai sebelum uji pengguna |
| Bab V: uji coba 30 orang guru dan siswa, satu hari | Siapkan protokol uji, data uji dan pencatatan temuan; bukan studi efektivitas jangka panjang |
| Tabel tahapan: produksi video bulan 4–5 | Sistem harus dapat menerima video bertahap; kesiapan diseminasi video perlu dijadwalkan |
| Berbagai bagian: domain, hosting/VPS, SSL dan backup satu tahun | Biaya dan penanggung jawab operasional harus mencakup 12 bulan |
| Tabel luaran: diseminasi, berita lokal dan satu HKI | Sediakan halaman dokumentasi dan arsip berkas; proses pengajuan eksternal tetap dikerjakan tim |

## 3. Perubahan dan tambahan dari pengguna

| Aspek | Proposal | Arahan terbaru | Perlakuan |
| --- | --- | --- | --- |
| Kelas sasaran | IV–VI | III–IV | PRD mengikuti III–IV; naskah proposal perlu diselaraskan secara terpisah |
| Akun siswa | Tidak ditetapkan | Tidak login | Tidak membuat entitas akun siswa |
| Identitas saat kuis | Tidak dijelaskan | Mengisi nama | Nama hanya diminta pada tugas guru dan dilindungi sebagai data siswa |
| Hasil kuis | Evaluasi sederhana | Nilai masuk guru | Tambahkan kelas, tugas, sesi pengerjaan dan dashboard hasil |
| Akun guru/admin | Tidak rinci | Guru dan admin termasuk pengguna | Guru login; admin login dengan MFA |
| Desain | UI/UX responsif direncanakan | Menyusul | Tidak menetapkan warna, ilustrasi, tata letak final atau komponen visual merek |
| Biaya | Dukungan operasional satu tahun, tanpa rincian nominal dalam berkas ini | Belum dipilih | Bandingkan skenario; jangan mengasumsikan anggaran nol |

## 4. Kesenjangan dan rekomendasi

### 4.1 Pengiriman nilai memerlukan konteks guru

Nama siswa saja tidak cukup menentukan penerima nilai. Guru harus membuat tugas yang terikat ke satu kelas dan satu versi kuis. Tautan/QR atau kode tugas membawa konteks itu. Siswa tidak memilih dari direktori guru/sekolah publik. Hasil disimpan ke tugas tersebut dan otomatis muncul dalam dashboard pemiliknya.

### 4.2 Adaptasi usia bukan sekadar mengganti label

Materi kelas III memerlukan kalimat lebih singkat, penjelasan istilah, gambar dengan teks alternatif, petunjuk satu tindakan per langkah, serta soal berbasis pengamatan sederhana. Kelas IV dapat memuat perbandingan objek dan refleksi pelestarian. Rekomendasi awal: 5–10 soal per kuis dan 4 pilihan maksimum, ditelaah ahli pendidikan dasar. Jumlah dan panjang ini rekomendasi editorial, bukan ketentuan proposal.

### 4.3 Buku interaktif perlu didefinisikan

Rekomendasi: bab HTML dengan daftar isi, navigasi bab, istilah terkait, gambar, video terpilih dan tautan kuis. PDF adalah bentuk baca/unduh tambahan. Efek membalik halaman dapat dievaluasi pada tahap desain, tetapi tidak menjadi syarat teknis karena belum tentu mudah diakses pada ponsel.

### 4.4 Validasi harus terikat versi

Admin mencatat hasil validasi bahasa, materi dan media untuk revisi konten tertentu. Perubahan substansi setelah validasi menghasilkan revisi baru dan mengulang validasi relevan. Situs megalitik tidak otomatis disebut telah berstatus hukum cagar budaya hanya karena mempunyai nilai arkeologis; redaksi status harus memiliki sumber yang jelas.

### 4.5 Nilai tanpa akun mempunyai batas

Nama tidak terverifikasi, nama ganda dapat terjadi, dan siswa dapat memulai percobaan lain. Sistem mencegah kiriman ganda akibat jaringan pada satu percobaan, tetapi tidak mengklaim dapat membuktikan identitas atau mencegah semua pengulangan. Guru memverifikasi hasil di kelas. Tidak digunakan sebagai ujian berisiko tinggi.

### 4.6 Peta tidak boleh membocorkan lokasi melalui jalur lain

Pembulatan titik di layar tidak cukup jika koordinat tepat masih ada di API, GeoJSON, EXIF, dokumen PDF, tautan navigasi atau teks artikel. MVP hanya menyimpan wilayah umum yang sudah disetujui; tidak menyediakan kolom koordinat tepat.

## 5. Keterlacakan luaran

| Luaran proposal | Modul/kebutuhan | Bukti penerimaan |
| --- | --- | --- |
| Web-app responsif dan menu berfungsi | FR-01 sampai FR-15, NFR | Uji navigasi publik, guru dan admin pada perangkat sasaran |
| Buku digital interaktif | FR-02 | Bab HTML, tautan konten, PDF viewer dan unduhan |
| Katalog, peta, galeri, glosarium, kuis dan video | FR-03 sampai FR-08 | Setiap modul mempunyai konten final yang disetujui |
| Panduan guru dan LKPD | FR-09 | Panduan per kelas, aktivitas, dokumen dan petunjuk penggunaan |
| Uji coba 30 orang | Rencana uji di berkas 07 | Daftar peserta di arsip kegiatan terpisah, catatan dan daftar perbaikan |
| Diseminasi dan berita daring lokal | FR-14 | Halaman dokumentasi dan tautan berita yang dapat dibuka |
| Satu berkas HKI | Handoff berkas 07 | Arsip versi, lisensi aset, tangkapan produk yang diizinkan dan paket sumber |
| Operasional satu tahun | NFR dan operasi berkas 07 | Domain aktif, TLS, monitoring, backup dan bukti restore |
| Nilai siswa ke guru, tambahan pengguna | FR-10 sampai FR-12 | Nama dan nilai masuk guru yang benar, terlindung dari guru lain |

## 6. Batas analisis

Dokumen ini menganalisis kebutuhan aplikasi berdasarkan proposal, bukan verifikasi ulang seluruh referensi arkeologi, penilaian akademik proposal, penetapan status situs atau penetapan kelayakan pendanaan. Jumlah situs, bab, video, soal dan dokumen final belum ditentukan dalam proposal sehingga memerlukan inventaris konten sebelum estimasi pekerjaan dikunci.
