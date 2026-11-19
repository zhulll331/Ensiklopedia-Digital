# Implementasi, Pengujian, Operasional dan Estimasi Biaya

## 1. Tahapan yang mengikuti proposal

| Tahap | Waktu relatif | Pekerjaan dan hasil | Ketergantungan |
| --- | --- | --- | --- |
| Definisi | Bulan 1 | Konfirmasi PRD, kelas III–IV, inventaris konten, pemilik data dan daftar pihak penelaah | Penetapan pengelola dan sekolah mitra |
| Riset dan kurasi | Bulan 1–2 | Sumber, foto, narasi, struktur buku, panduan/LKPD, kebijakan wilayah umum | Ahli dan validator sesuai proposal |
| Desain dan fondasi | Awal bulan 2 | Desain menyusul, route, auth, schema, RLS, proof-of-concept role guest dan kuis tanpa akun | Desain/persetujuan alur dan konten awal |
| Pengembangan | Bulan 2–3 | CMS, buku, katalog, peta, glosarium, media, guru, kelas, tugas dan rekap | Konten terkurasi bertahap |
| Pengujian internal | Akhir bulan 3 | Uji fungsional, akses, penilaian, aksesibilitas, beban, backup/restore | Seluruh P0 terintegrasi |
| Uji pengguna dan revisi | Bulan 4 | Uji terbatas30 orang sesuai proposal; daftar temuan dan perbaikannya | Proses privasi sekolah dan konten yang boleh digunakan |
| Diseminasi | Bulan 4 | Demonstrasi, materi pelatihan dan dokumentasi; berita lokal oleh tim | Versi stabil untuk demonstrasi |
| Video final dan serah terima | Bulan 4–5 | Integrasi video final, arsip, satu paket dukungan HKI, evaluasi dan handoff | Jadwal produksi video proposal |
| Pemeliharaan | 12 bulan sesuai kontrak | Hosting, domain, patch, monitoring, backup dan dukungan | Tanggal mulai, biaya dan penanggung jawab disepakati |

Tahap pengembangan bulan 2–3 memerlukan ketersediaan konten dan desain tepat waktu. Tabel bukan janji jumlah hari kerja vendor. Video final tersedia bulan 4–5 menurut proposal; jika demonstrasi bulan 4 memerlukan video final, jadwal produksi perlu dimajukan atau versi demonstrasi berizin disiapkan. Tanggal mulai dukungan12 bulan harus tertulis, misalnya sejak serah terima, agar tidak berkurang karena masa pengembangan.

## 2. Backlog implementasi

| Urutan | Paket | Hasil terukur |
| --- | --- | --- |
| 1 | Fondasi dan keputusan | Repository, staging, environment, ADR, OpenAPI awal dan migration pertama |
| 2 | Proof-of-concept kritis | Dua guru terisolasi; satu siswa guest dapat kirim dan nilai masuk benar; role guest berhak minimum |
| 3 | CMS dan publikasi | Revisi, review, sumber, media karantina dan publish gate |
| 4 | Ensiklopedia publik | Semua menu inti, bacaan HTML, reader PDF, peta umum, galeri, video dan pencarian |
| 5 | Kegiatan guru | Undangan/login, kelas, tugas, QR/kode, jadwal, rekap, anotasi dan CSV |
| 6 | Ketahanan | Autosave/version, idempotency/race, expiry, revoke, CSRF, limiter terpusat |
| 7 | Kesiapan produksi | Konten final tervalidasi, restore/purge, monitoring, a11y dan panduan |
| 8 | Evaluasi | UAT, perbaikan, diseminasi dan handoff |

## 3. Rencana uji penerimaan

Uji berikut direncanakan untuk aplikasi yang akan dibangun. Tidak ada klaim bahwa pengujian aplikasi sudah dijalankan melalui dokumen ini.

| ID | Skenario | Hasil yang harus terjadi |
| --- | --- | --- |
| AT-01 | Publik membuka seluruh menu inti | Konten final tampil, tidak ada menu mati atau draf bocor |
| AT-02 | Membaca buku pada ponsel | Bab dapat dibaca, tautan istilah bekerja, PDF dapat dibuka/diunduh |
| AT-03 | Guru membuat kelas III dan memilih kuis IV | Kombinasi salah ditolak, pilihan sesuai kelas tersedia |
| AT-04 | Siswa masuk via QR dan via kode | Tanpa akun; kelas/guru benar; cukup isi nama |
| AT-05 | Jawaban4 benar dari 5 soal | Score80; soal kosong tetap masuk penyebut |
| AT-06 | Dua siswa bernama sama | Hasil terpisah, guru dapat memverifikasi tanpa overwrite |
| AT-07 | Double click dan retry submit | Satu hasil final dan receipt yang sama |
| AT-08 | Dua submit paralel payload berbeda | Satu final commit; tidak ada score berubah setelah terkirim |
| AT-09 | Autosave lama tiba setelah submit | Tidak menimpa jawaban final |
| AT-10 | Tugas berakhir/ditutup/dicabut | Perilaku sesuai PRD dan waktu server; pencabutan menolak submit baru |
| AT-11 | Guru A mengganti ID ke tugas/attempt/ekspor B | Tidak ada data guru B terbaca, termasuk lewat API langsung |
| AT-12 | Siswa menebak attempt ID lain | Tidak mendapatkan nama, nilai atau jawaban orang lain |
| AT-13 | Inspeksi respons, source HTML dan file | Tidak ada kunci tugas, token privat atau koordinat sensitif |
| AT-14 | Siswa selesai lalu berganti pengguna | Cookie/state dibersihkan; tombol back tidak menampilkan data sesi lama |
| AT-15 | Putus jaringan saat submit | Tidak mengklaim sukses sebelum konfirmasi; retry aman |
| AT-16 | Nama dengan HTML/karakter Indonesia/formula CSV | Ditampilkan sebagai teks aman, tidak mengaktifkan script/formula |
| AT-17 | Revisi konten/kuis dipublikasikan | Revisi tugas lama tetap konsisten; draf tidak bocor |
| AT-18 | Uji foto ber-GPS/PDF sensitif | Karantina atau sanitasi dan clearance sebelum terbit |
| AT-19 | Uji keyboard, screen reader dan caption | Alur inti dapat dioperasikan, label/fokus/pesan jelas |
| AT-20 | Beban100 siswa,30 submit serentak,10 guru | Target NFR diukur, limiter tidak memblokir kelas di satu NAT |
| AT-21 | Restore ke lingkungan terisolasi | Database, media, kunci, grants, role dan akses pulih; purge diterapkan ulang |
| AT-22 | Data mencapai purge_at | Nama/jawaban/nilai/ekspor/linkage dihapus sesuai kebijakan |
| AT-23 | Akun guru disuspensi | API/RLS menolak akses walaupun token lama masih ada |
| AT-24 | Pengumpulan nilai belum siap consent | Tugas bernama tidak dapat dibuka; alasan jelas bagi guru |

Unit test fokus rumus, pilihan asing, tenggat dan aturan revisi. Integration test fokus transaksi, RLS/grants dan token. E2E fokus publik→siswa→guru dan admin publish. Load test memakai data sintetis; tidak memakai nama anak asli. Pemeriksaan a11y otomatis dilengkapi uji manual. Hasil uji disimpan dengan versi kode, lingkungan dan langkah reproduksi.

## 4. Environment dan rilis

Gunakan development lokal, staging terpisah, dan production. Proyek/database/bucket staging terpisah dari produksi. Tidak melakukan eksperimen pada data nilai nyata. CI menjalankan lint/typecheck, uji penting, migration check, secret scan dan build; hasil artifact sama dipromosikan melalui proses rilis.

Urutan rilis: backup dan cek restore terbaru → migration kompatibel → deploy → smoke test baca/login/guest submit/rekap → monitor error. Rollback aplikasi ke versi sebelumnya hanya jika schema kompatibel; perubahan destruktif memakai langkah migrasi terencana. Jangan mengembalikan backup database sekadar untuk membatalkan perubahan UI karena nilai yang masuk sesudah backup dapat hilang.

Contoh nama konfigurasi, tanpa nilai: `PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ADMIN_SECRET`, `GUEST_DATABASE_URL`, `JOIN_CODE_PEPPER`, `CRON_SECRET`, `SMTP_FROM`, `ERROR_TRACKER_DSN`. Namespace publik hanya untuk hal yang memang boleh terbuka. Secret tidak diserahkan lewat dokumen umum atau commit. Daftar environment final mengikuti SDK dan penyedia yang benar-benar dipilih.

## 5. Backup dan pemulihan

| Cakupan | Rencana |
| --- | --- |
| Database | Backup provider sesuai paket ditambah export terenkripsi harian ke lokasi offsite berakses terbatas |
| File storage | Salinan/versioning objek, manifest path+checksum; meliputi aset publik dan privat yang perlu dipertahankan |
| Auth/config | Catat prosedur pemulihan konfigurasi Auth, redirect, SMTP, secrets, RLS/grants dan storage policy; jangan mengasumsikan SQL dump memulihkan semuanya |
| Kode | Repository milik pengelola, tag rilis, lockfile, migration dan dokumentasi |
| Retensi | Backup offsite rolling35 hari; kunci enkripsi disimpan terpisah |
| Restore drill | Sebelum rilis dan setiap 3 bulan; hasil dan durasi dicatat |
| Target | RPO ≤24 jam; RTO ≤8 jam setelah insiden dinyatakan dan petugas tersedia |

Dokumentasi Supabase menyatakan backup database tidak mencakup file objek Storage; karena itu backup database saja tidak cukup [S4]. Restore harus menguji isi objek dan checksum, login guru, pembacaan PDF, penilaian serta isolasi akses. Jalankan ulang deletion ledger agar data yang sebelumnya dihapus tidak muncul kembali setelah restore. Jangan membuka hasil restore kepada pengguna sebelum pemeriksaan selesai.

## 6. Monitoring dan tanggung jawab

| Frekuensi | Tindakan |
| --- | --- |
| Otomatis/harian | Uptime, submit errors, job backup/purge, kapasitas disk/storage, auth failures dan biaya mendekati batas |
| Mingguan | Telaah error tersanitasi, failed jobs, kiriman anomali, link rusak dan dependensi kritis |
| Bulanan | Patch terencana, cek akses staf/vendor, biaya, konten keliru/usang dan status retensi |
| Tiap 3 bulan | Restore drill, review akses dukungan, uji lintas guru dan review risiko data anak |
| Sebelum tahun layanan habis | Penganggaran perpanjangan domain/hosting, keputusan arsip dan rencana keberlanjutan |

Pengelola produk bertanggung jawab lingkup dan penerimaan; kurator/validator pada substansi; admin konten pada entri dan publikasi; sekolah/guru pada pemanfaatan serta proses persetujuan peserta; operator/vendor pada layanan teknis sesuai kontrak. Penunjukan ini tidak otomatis memindahkan tanggung jawab hukum pengendali data; peran dan perjanjian pemrosesan harus ditetapkan.

## 7. Estimasi kapasitas awal

Asumsi perencanaan: satu produksi, beberapa sekolah mitra, sampai50 akun guru awal, pengujian100 siswa aktif, serta konten berupa puluhan entri dan beberapa video pendek. Ini asumsi sizing, bukan jumlah yang dijanjikan proposal.

Perkirakan storage dari file final, bukan jumlah pengunjung saja. Contoh hitung: 10 video×50 MB=500 MB; jika masing-masing ditonton penuh1.000 kali, transfer sekitar 500 GB sebelum faktor cache/kompresi. Jumlah video dan tontonan contoh tidak berasal dari proposal. Video menjadi pendorong biaya utama; jangan menaruh file produksi/master pada jalur publik. Pantau egress, ukuran file, image transformation dan extra compute.

## 8. Perbandingan biaya

Harga acuan penyedia ditelaah17November2026. Semua angka rupiah memakai **kurs simulasi Rp17.000/USD**, bukan kurs berjalan. Belum termasuk pajak, perubahan kurs, pekerjaan pengembang, produksi konten/video, honor ahli, dukungan manusia dan kelebihan pemakaian.

| Skenario | Perencanaan biaya infrastruktur | Penilaian |
| --- | --- | --- |
| Development/demo | Dapat memanfaatkan paket gratis sesuai kuota dan ketentuan; domain/pihak ketiga mungkin tetap berbiaya | Untuk prototipe, bukan komitmen layanan sekolah12 bulan |
| Produksi terkelola, rekomendasi | Baseline Vercel ProUSD20 + Supabase Pro mulaiUSD25 = USD45/bulan, sekitar Rp765.000; tambah domain dan layanan pendukung | Operasional relatif sederhana; anggarkan sekitar Rp1.000.000–Rp1.300.000/bulan sebagai pagu awal sebelum pajak dan lonjakan penggunaan |
| VPS kelola sendiri, alternatif | Amplop perencanaan internal sekitar Rp300.000–Rp700.000/bulan untuk server, storage, backup dan pendukung; perlu penawaran vendor | Bukan tarif provider terverifikasi; bisa lebih tinggi. Memerlukan operator, patch, auth/DB dan restore mandiri |

Skenario VPS biaya lebih rendah mengasumsikan backend/database/auth yang benar-benar dikelola sendiri, misalnya alternatif Laravel/PostgreSQL. Memindahkan hanya aplikasi Next.js ke VPS sambil tetap menggunakan Supabase Pro tetap menanggung biaya Supabase. Jangan menjumlahkan manfaat dua skenario tanpa menghitung seluruh layanan.

### 8.1 Rincian skenario terkelola

| Komponen | Dasar | Per bulan simulasi |
| --- | --- | --- |
| Hosting web | Vercel ProUSD20 untuk baseline satu deploying seat [S2] | Rp340.000 |
| Database/Auth/Storage | Supabase Pro mulaiUSD25, satu proyek dasar sesuai ketentuan [S3] | Rp425.000 |
| Email dewasa, backup offsite, monitor/tile/kelebihan kecil | Alokasi perencanaan internal; bukan harga paket terverifikasi | Rp150.000–Rp400.000 |
| Domain | Alokasi internal Rp250.000–Rp400.000/tahun, tergantung ekstensi/registrar | SekitarRp21.000–Rp33.000 |
| Total perkiraan dasar | Menjumlah komponen di atas | SekitarRp936.000–Rp1.198.000 |

Pagu dibulatkan Rp1–1,3 juta/bulan, setara Rp12–15,6 juta/tahun sebelum pajak, dukungan manusia dan overage besar. Cadangan final perlu disepakati setelah inventaris video, jumlah kunjungan, region, jumlah editor deploy, SMTP dan backup dipilih. Tidak membeli layanan melalui penyusunan dokumen ini.

Vercel Hobby memiliki pembatasan penggunaan personal/nonkomersial; jangan mengasumsikan proyek institusi/vendor pasti memenuhi syarat [S1]. Supabase Free dapat berhenti sementara saat tidak aktif dan tidak mempunyai perlindungan operasional setara rencana produksi; jangan menjadikannya satu-satunya fondasi janji operasional satu tahun [S3]. Pilih paket berdasarkan ketentuan aktual saat pengadaan.

### 8.2 Pengendalian biaya

Pasang notifikasi50%,75% dan 90% dari anggaran internal; bedakan alert dari hard cap yang benar-benar didukung provider. Batasi upload, kompres video/gambar, lazy-load, cache publik dan matikan fitur berbiaya yang tidak digunakan. Tetapkan penanganan saat kuota hampir habis tanpa diam-diam mematikan pengiriman nilai. Nilai biaya maintenance manusia secara terpisah saat membandingkan VPS dan layanan terkelola.

## 9. Handoff yang harus diminta dari pengembang

Repository dan hak akses milik pengelola; source code dan tag rilis; lockfile; migration dan RLS/grants; OpenAPI final; inventaris environment tanpa secret; saluran penyerahan secret yang aman; daftar akun/cloud/domain; inventaris lisensi media dan dependency; dokumentasi konten/validasi; panduan guru/admin; laporan uji; backup+restore runbook; prosedur purge/insiden; daftar biaya dan tanggal perpanjangan; serta daftar isu yang belum selesai.

Serah terima juga menetapkan hak cipta/lisensi kode dan aset, kewajiban vendor, dukungan12 bulan, waktu respons insiden, batas perubahan, dan cara mengekspor data jika pindah penyedia. Materi pendukung HKI disiapkan tim berdasarkan karya final; aplikasi tidak menjanjikan pengajuan/persetujuan HKI otomatis.

## 10. Risiko dan keputusan lanjutan

| Risiko/keputusan | Langkah |
| --- | --- |
| Anggaran belum ditentukan | Pilih pagu12 bulan sebelum kontrak; rekomendasi produksi terkelola sebagai dasar diskusi |
| Jumlah konten belum final | Susun inventaris situs, bab, media, soal dan dokumen dengan penanggung jawab |
| Materi masih menyasar IV–VI | Validasi ulang untuk III–IV; pengguna belum meminta mengedit berkas proposal asli |
| Desain menyusul | Tetapkan IA/alur pada dokumen ini; lakukan desain dan uji usia sasaran sebelum implementasi visual |
| Proses consent sekolah belum ditetapkan | Tetapkan peran, bukti, pendampingan dan penarikan sebelum tugas bernama dibuka |
| Token/nama tanpa akun dapat disalahgunakan | Posisikan sebagai formatif, verifikasi guru, link terbatas, jadwal dan revoke |
| Penyedia/region belum dipilih | Nilai latensi, pemrosesan data, ketentuan, biaya serta pemulihan |
| Validasi/produksi video terlambat | Jadwalkan penyerahan konten bertahap dan gate penerimaan |

## 11. Sumber resmi dan peta pemakaian

Semua ditelaah17November2026. Sumber mendukung kemampuan/ketentuan penyedia, pedoman dan dasar regulasi; keputusan desain serta pagu internal merupakan rekomendasi penyusun.

| ID | Sumber | Dipakai untuk |
| --- | --- | --- |
| S1 | [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Fair Use](https://vercel.com/docs/limits/fair-use-guidelines) | Batas paket gratis dan kelayakan penggunaan |
| S2 | [Vercel Pricing](https://vercel.com/pricing), [Pro Plan](https://vercel.com/docs/plans/pro-plan) | Harga baseline, seat dan kemungkinan usage tambahan |
| S3 | [Supabase Pricing](https://supabase.com/pricing) | Harga Pro dasar, kuota dan perilaku Free |
| S4 | [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) | Memisahkan backup database dari file Storage |
| S5 | [Next.js App Router](https://nextjs.org/docs/app), [Authentication](https://nextjs.org/docs/app/guides/authentication), [Self-hosting](https://nextjs.org/docs/app/guides/self-hosting) | Rancangan full-stack, auth server dan opsi Node hosting |
| S6 | [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing API](https://supabase.com/docs/guides/api/securing-your-api) | RLS, grants, view, pembatasan secret dan isolasi akses |
| S7 | [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) | Hak execute, SECURITY DEFINER dan search_path |
| S8 | [Supabase SSR](https://supabase.com/docs/guides/auth/server-side) | Integrasi auth dewasa pada server; kebijakan cookie BFF perlu implementasi tersendiri |
| S9 | [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) | Pembaca PDF dan lisensi |
| S10 | [Leaflet](https://leafletjs.com/), [OSMF Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) | Library peta, atribusi, penggunaan tile; tidak menganggap server tile komunitas sebagai layanan bersla |
| S11 | [WCAG 2.2 W3C](https://www.w3.org/TR/WCAG22/) | Target aksesibilitas; capaian tetap perlu diuji |
| S12 | [UU Nomor 27 Tahun 2022, JDIH BPK](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022), [PDF resmi](https://peraturan.bpk.go.id/Home/Download/224884/UU%20Nomor%2027%20Tahun%202022.pdf) | Pemrosesan data anak, termasuk Pasal 25 ayat (2) |
| S13 | [PP Nomor 17 Tahun 2025, JDIH Komdigi](https://jdih.komdigi.go.id/produk_hukum/view/id/965/t/peraturan%20pemerintah%20nomor%2017%20tahun%202025), [PDF resmi](https://peraturan.go.id/files/pp-no-17-tahun-2025.pdf) | Tata kelola layanan elektronik untuk anak; penilaian kewajiban sebelum rilis |
| S14 | [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) | Perlindungan ekspor dari formula input tak tepercaya |

## 12. Status akhir dokumen

Paket ini siap menjadi acuan diskusi dengan pengembang, perumusan penawaran dan desain lanjutan. Belum ada source aplikasi, migration siap eksekusi, desain final, pembelian layanan, deployment atau pengujian runtime yang dilakukan. Validasi dokumen hanya mencakup konsistensi spesifikasi dan kelengkapan berkas.
