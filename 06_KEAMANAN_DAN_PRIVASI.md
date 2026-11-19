# Keamanan, Privasi dan Pelindungan Informasi Situs

## 1. Sasaran dan klasifikasi data

Keamanan melindungi siswa, guru, integritas pengetahuan dan pelestarian situs. Pengisian nama tanpa login tetap merupakan pemrosesan data pribadi ketika dikaitkan kelas, jawaban dan nilai. Tidak membuat akun bukan berarti data menjadi anonim.

| Data | Klasifikasi | Akses |
| --- | --- | --- |
| Narasi/foto terbit, glosarium, wilayah umum | Publik setelah kurasi | Semua pengguna |
| Draf, master media, bukti validasi | Internal | Admin sesuai kebutuhan |
| Akun guru, email dan sekolah | Privat | Pemilik dan admin berwenang |
| Nama siswa, kelas, jawaban, nilai dan waktu | Privat dengan perlindungan khusus data anak | Guru pemilik tugas; dukungan admin terkontrol |
| Kunci jawaban, token sesi, kode akses dan credential | Rahasia | Proses server terbatas; kunci bank soal melalui admin berwenang |
| Koordinat tepat/arsip lapangan sensitif | Tidak dikumpulkan dalam MVP | Tidak tersedia pada aplikasi |

## 2. Model ancaman dan kontrol

| Ancaman | Dampak | Kontrol wajib | Uji |
| --- | --- | --- | --- |
| Guru mengganti ID tugas di URL/API | Nilai kelas lain terbaca | Owner check setiap request + RLS + policy akun aktif | Guru A mencoba semua endpoint guru B |
| Kunci soal ada di HTML/JSON | Penilaian tidak bermakna | Key di schema privat; serializer eksplisit | Inspeksi HTML, network, source map dan payload soal |
| Skor/jadwal dimanipulasi browser | Nilai/waktu tidak sah | Score dan waktu dihitung server | Ubah score, started_at, class_id pada request |
| Tautan/kode ditebak atau tersebar | Kiriman palsu/biaya meningkat | Random token kuat, throttling, jadwal, rotate/revoke | Enumeration, kode invalid dan beban NAT sekolah |
| Nama palsu atau nama ganda | Salah atribusi hasil | Jelaskan batas tanpa akun; verifikasi guru; attempt terpisah | Dua nama sama tidak menimpa hasil |
| Retry/double click/race | Nilai ganda atau berubah | Transaksi, row lock, idempotency dan state immutable | Submit paralel dan retry setelah timeout |
| Stored XSS di konten/nama | Pencurian sesi/data | Rich text allowlist, sanitasi server, output escaping, CSP | Payload script/HTML/SVG berbahaya |
| CSRF/session abuse | Tugas/hasil berubah | Secure HttpOnly cookie, Origin check, token CSRF, rotasi | Request lintas origin dan replay |
| Unggahan berbahaya/SSRF | Kebocoran/server diserang | Karantina, scan, tipe/ukuran allowlist; tidak fetch URL bebas | MIME palsu, polyglot, URL jaringan internal |
| GPS tersisa pada media/PDF/API | Lokasi situs sensitif diketahui | Sanitasi metadata, clearance editorial seluruh kanal | EXIF, OCR/teks PDF, GeoJSON, source HTML |
| Nilai tertinggal di perangkat bersama | Siswa lain melihat data | Satu sesi aktif, tombol selesai, no-store, clear state | Siswa kedua setelah selesai dan tombol back |
| Ekspor CSV berformula | Eksekusi formula spreadsheet | Escape formula dan quoting CSV | Nama diawali =, +, -, @, tab/CR |
| Credential bocor | Pengambilalihan layanan | Secret store, server-only, least privilege dan rotasi | Secret scan repo/bundel/log |
| Backup tidak lengkap | Data/media tidak dapat pulih | Backup database dan objek terpisah, restore drill | Pulihkan kuis, nilai, file, role dan login |

## 3. Identitas dewasa dan otorisasi

SEC-01 guru didaftarkan melalui undangan admin dan verifikasi email. Pendaftaran umum tidak otomatis memberi akses membuat kelas. Pemulihan kata sandi menggunakan alur resmi provider dengan redirect allowlist; jangan mengungkap apakah email tertentu terdaftar.

SEC-02 admin wajib MFA; guru dianjurkan MFA. Akun admin aplikasi dipisahkan dari akun pemilik layanan cloud. Hindari akun bersama. Bootstrap admin pertama dilakukan melalui proses operator yang tercatat, lalu credential bootstrap dicabut.

SEC-03 role/status berasal dari data yang tidak dapat diedit pengguna. Suspensi harus segera membatasi API/RLS, bukan menunggu tampilan menu berubah atau token lama habis. Terapkan recent reauth untuk grant admin, akses dukungan dan tindakan penghapusan sensitif.

SEC-04 otorisasi berada di service/API/database; middleware/proxy hanya membantu navigasi. UI tersembunyi, UUID acak, robots.txt dan noindex bukan pengganti hak akses.

SEC-05 sesi dewasa memakai cookie server yang aman, diverifikasi server, masa aktif terbatas dan logout yang mencabut sesi. Batas usulan admin idle30 menit dan guru idle60 menit dengan absolute lifetime8 jam, dikonfigurasi dan diuji sesuai kemampuan provider/BFF.

## 4. Sesi siswa dan keamanan penilaian

SEC-06 link tugas random≥128 bit; cookie sesi random≥256 bit; token mentah tidak disimpan pada database atau log. Hash dibuat dengan algoritme kriptografis; kode manual memakai HMAC/pepper server dan rate limit karena entropinya lebih rendah.

SEC-07 sesi sementara tidak menjadi akun anak. Hanya dapat mengakses attempt sendiri sampai expiry, dan dapat dicabut. Cookie HttpOnly Secure SameSite, state di browser dibersihkan setelah tombol Selesai. Nama/jawaban tidak disimpan ke localStorage, analytics atau URL. Browser back dan cache harus diuji; halaman di-render ulang berdasarkan sesi sah.

SEC-08 kunci/penjelasan tugas tidak ada di payload soal, build static, data prerender, admin preview yang terbuka, storage publik atau latihan umum. Mode practice dan assignment dipisahkan pada revisi kuis. Guru harus menyadari soal yang sengaja dipakai ulang dari latihan sudah mungkin diketahui siswa.

SEC-09 submit memakai server time, lock, transaksi, idempotency dan score server. Nilai mentah tidak dapat diedit manual. Anotasi koreksi/verifikasi terpisah dan tercatat. Soal/revisi tugas berjalan tidak berubah ketika CMS diedit.

SEC-10 sistem tidak mengklaim verifikasi identitas, proctoring atau pencegahan mencontek penuh. Memulai ulang dari perangkat lain tetap mungkin. Kuis dipakai sebagai evaluasi formatif dan didampingi guru.

## 5. Data anak dan persetujuan

Pasal 25 ayat (2) Undang-Undang Nomor 27 Tahun 2022 mengatur persetujuan orang tua dan/atau wali untuk pemrosesan data pribadi anak. PP Nomor 17 Tahun 2025 juga relevan bagi penyelenggaraan sistem elektronik untuk anak. Rujukan resmi ada di berkas07. Dokumen ini menetapkan kebutuhan produk; pemenuhan kewajiban dan aturan pelaksana terbaru perlu ditetapkan pengelola sebelum produksi.

SEC-11 tetapkan pengelola/pengendali, sekolah mitra, tujuan, jenis data, penerima, masa simpan, penyedia pemroses, kontak dan mekanisme hak subjek data dalam kebijakan berbahasa sederhana. Lakukan penilaian dampak privasi untuk pemrosesan anak, termasuk akses lintas wilayah/negara bila provider berada di luar Indonesia. Pemilihan region harus menilai aturan dan kontrak; lokasi terdekat tidak otomatis berarti patuh.

SEC-12 sebelum tugas bernama dibuka, sekolah/guru memastikan persetujuan orang tua/wali yang sesuai dan dapat dibuktikan tersedia untuk peserta. Sistem mencatat referensi/versi proses dan waktu kesiapan, bukan meminta siswa menyetujui atas nama orang tua. Tidak mengumpulkan KTP, tanggal lahir atau email orang tua secara default.

SEC-13 pengelola harus menentukan metode pengaitan bukti persetujuan dengan peserta dalam pendampingan guru. Karena nama tidak terverifikasi, centang readiness kelas saja tidak membuktikan persetujuan individual. Uji coba harus memakai sekolah mitra yang menyiapkan proses tersebut. Jika belum siap, pengumpulan nama/nilai individu belum dibuka. Akses konten/latihan tanpa nama tetap perlu dievaluasi dalam kerangka layanan untuk anak; jangan menganggap otomatis dikecualikan dari aturan.

SEC-14 minimalkan data: nama sesuai arahan guru, kelas yang berasal dari tugas, jawaban/nilai dan timestamp. Tidak ada NISN, NIK, alamat rumah, GPS siswa, kamera, mikrofon, biometrik, kontak siswa, iklan perilaku atau ranking publik. Klasifikasi usia berdasarkan konteks kelas tidak diperlakukan sebagai verifikasi usia resmi.

SEC-15 orang tua/wali melalui sekolah dapat meminta akses, koreksi atau penghapusan setelah verifikasi yang proporsional. Tidak menyediakan lookup publik berdasarkan nama. Simpan status permintaan serta penghapusan tanpa menyalin data sensitif ke audit. Penghapusan memperhitungkan ekspor yang telah diunduh guru dan siklus backup; prosedur sekolah harus mengatur salinannya.

## 6. Retensi usulan

| Kategori | Default usulan | Tindakan |
| --- | --- | --- |
| Nama, jawaban dan nilai tugas | 90 hari setelah tugas ditutup | Pemberitahuan kepada guru, purge/anonymize; sekolah dapat menetapkan durasi lain dengan dasar jelas |
| Sesi siswa | Pengerjaan maksimum 2 jam atau tenggat; baca hasil maksimum 30 menit setelah submit | Revoke saat selesai; hapus baris kedaluwarsa dalam 24 jam |
| Idempotency | 24 jam | Hapus setelah masa retry; tidak menyimpan token mentah |
| File ekspor | Maksimum24 jam | Hapus otomatis; URL unduh singkat≤60 detik |
| Log aplikasi | 14 hari | Redaksi PII; raw IP tidak menjadi analitik siswa |
| Audit | 180 hari | Minimal actor/action/target/outcome; tanpa nama/jawaban |
| Backup offsite | 35 hari rolling | Enkripsi, akses terbatas, expiry; restore harus menerapkan ulang deletion ledger |
| Bukti persetujuan | Sesuai kebijakan sah sekolah | Aplikasi menyimpan referensi minimum; durasi disepakati sebelum rilis |

Angka ini rekomendasi operasional, bukan kutipan batas hukum. Nama dan nilai yang sudah dihapus tidak dipertahankan dalam JSON lain, audit, file ekspor, error tracker atau indeks pencarian. Penghapusan data primer tidak langsung menghilangkan backup yang belum berakhir; kebijakan harus menjelaskan masa habis dan kontrol aksesnya.

## 7. Pelindungan lokasi dan substansi

SEC-16 gunakan `area_label` dan titik representatif wilayah yang sudah disetujui ahli. Jangan sekadar mengirim koordinat tepat lalu memburamkannya dengan CSS. Tidak ada fitur navigasi, unduh koordinat, pin presisi atau tautan ke rute situs sensitif.

SEC-17 periksa foto, EXIF/GPS, thumbnail, file master, nama file, narasi, alt text, video, subtitle, PDF, QR, GeoJSON, sitemap dan metadata SEO. Sanitasi otomatis dilengkapi pemeriksaan manusia terhadap landmark dan petunjuk lokasi di dalam isi.

SEC-18 pernyataan ilmiah mempunyai sumber, status hukum tidak dikarang, dan foto bukti dibedakan dari ilustrasi/rekonstruksi. Konten perlu mekanisme koreksi serta takedown; penerbitan ulang memerlukan revisi baru dan audit.

## 8. Media, aplikasi dan browser

SEC-19 allowlist awal: JPEG/PNG/WebP untuk gambar, PDF untuk dokumen, MP4 untuk video. SVG/HTML/ZIP tidak diizinkan sebagai unggahan publik pada MVP. Periksa signature/MIME nyata, ukuran dan checksum. Batas usulan foto10 MB, PDF25 MB, video250 MB melalui signed direct upload; batas bisa diturunkan berdasarkan biaya dan kondisi koneksi.

SEC-20 scanner dan alat sanitasi berjalan di worker/container terbatas, bukan parser tak terbatas dalam request publik. Hasil scan gagal tidak dapat diterbitkan. PDF harus diperiksa lampiran/aksi/tautan dan isi sensitif; sanitasi metadata saja tidak cukup. Gunakan Content-Type benar, nosniff, content disposition dan worker PDF yang dipatch.

SEC-21 CSP membatasi script, frame, connect dan image pada origin yang diperlukan; gunakan nonce/hash untuk script sesuai framework, hindari unsafe-eval di produksi. Set HSTS setelah domain/TLS siap, X-Content-Type-Options, frame-ancestors dan Permissions-Policy untuk menonaktifkan kamera/mikrofon/geolocation yang tidak diperlukan. Uji kompatibilitas reader/peta/video.

SEC-22 semua nilai/nama di-escape; rich text disanitasi menggunakan allowlist. Parameter SQL diparameterisasi. URL luar dibatasi http(s) yang sah dan domain yang disetujui; fetch media bebas dilarang untuk menghindari SSRF. CSV menetralkan formula serta mengutip delimiter/newline dengan benar.

## 9. Infrastruktur dan observabilitas

SEC-23 gunakan TLS, enkripsi at rest provider yang diverifikasi, akses least privilege dan proyek staging terpisah. Secret disimpan di environment secret manager; tidak pada source, dokumen handoff atau berkas publik. Database guest credentials, job secret dan admin provider secret berbeda. Rotasi saat pergantian vendor/personel atau insiden.

SEC-24 log hanya request_id, route template, status, durasi, action dan ID internal minimum. Redact cookie, Authorization, token link, nama, pencarian nama, jawaban, request/response body sensitif. Error tracker dimatikan session replay/screenshot/PII capture secara default. Rate limiting dapat memakai digest IP sementara dengan retensi pendek dan tujuan keamanan.

SEC-25 audit akses hasil oleh admin dan seluruh ekspor. Dukungan admin memerlukan alasan, scope satu tugas, expiry maksimum 30 menit dan MFA; tidak menyalakan akses massal tanpa kebutuhan. Akses vendor ke produksi berjangka dan dicabut sesudah pekerjaan.

## 10. Penanganan insiden

Deteksi dan catat request_id/waktu → batasi endpoint atau cabut credential terkait → amankan bukti tanpa menyalin data anak berlebihan → ukur data terdampak → pemilik pengelola menentukan komunikasi dan kewajiban pemberitahuan sesuai aturan yang berlaku → perbaiki, restore bila perlu, uji dan dokumentasikan. Kontak penanggung jawab serta jalur eskalasi ditetapkan sebelum rilis. Jangan memublikasikan nama/nilai korban pada laporan insiden umum.

## 11. Gate keamanan sebelum rilis

Wajib ada bukti uji isolasi guru, deny akses anonim ke data privat, tidak ada kunci pada browser, submit race/idempotency, session cleanup perangkat bersama, redaksi log, scan/sanitasi media, backup/restore, purge retensi, konfigurasi secret serta bukti kesiapan proses privasi anak. Review dependencies berfokus kerentanan yang dapat dieksploitasi pada aplikasi ini; patch kritis yang relevan menjadi penghalang rilis.
