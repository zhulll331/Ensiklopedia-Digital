# Runbook Rilis, Backup, Restore Drill & Uji Coba — EDMB

Dokumen operasional Fase 5 sesuai `07_IMPLEMENTASI_OPERASIONAL_DAN_BIAYA.md` dan `06_KEAMANAN_DAN_PRIVASI.md`.

## 1. Daftar Keputusan Pengelola Sebelum Go-Live
- [ ] Nama pengelola resmi & email kontak privasi (ganti placeholder di `Footer.tsx`, `tentang/page.tsx`, dan `settings/public/route.ts`).
- [ ] Identitas sekolah mitra & guru pilot untuk uji coba terbatas 30 orang.
- [ ] Bukti proses persetujuan orang tua/wali di sekolah mitra serta ketetapan masa retensi nilai (default rancangan: 90 hari setelah tugas tutup).
- [ ] Penanggung jawab 3 ahli + 3 validator untuk menelaah konten final & clearance lokasi wilayah umum.
- [ ] Kepemilikan penuh domain, repository GitHub, akun Supabase (staging & produksi terpisah), hosting Next.js terkelola, serta SMTP transaksional.

## 2. Penyiapan Environment Staging & Production
1. Buat dua proyek Supabase terpisah (`edmb-staging` dan `edmb-production`).
2. Jalankan migrasi SQL berurutan pada masing-masing proyek:
   - `supabase/migrations/0001_schemas_and_identity.sql` s.d. `0007_guest_rpc_and_api_functions.sql`
   - Pada `staging` saja, dapat menjalankan `supabase/seed.sql` (jangan pakai data produksi di staging).
3. Isi variabel environment terpisah (rujuk `.env.example`):
   - `PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
   - Rahasia server-only: `SUPABASE_ADMIN_SECRET`, `GUEST_DATABASE_URL`, `JOIN_CODE_PEPPER` (≥32 byte acak), `CRON_SECRET` (≥32 byte acak), `SMTP_FROM`
4. Aktifkan **MFA wajib** pada akun Supabase Auth admin aplikasi.
5. Jadwalkan cron harian ke `POST /api/v1/internal/jobs/retention` dengan header `Authorization: Bearer <CRON_SECRET>`.

## 3. Urutan Rilis Produksi
1. Jalankan pemeriksaan gate lokal/CI:
   - `npm run release:check -- --strict-env`
   - `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`
2. Pastikan backup terbaru tersedia dan hasil restore drill terakhir tercatat lolos.
3. Terapkan migrasi yang kompatibel ke database produksi.
4. Deploy build aplikasi ke hosting terkelola.
5. Lakukan *smoke test* pascDeploy:
   - `GET /api/v1/health` mengembalikan `database_configured: true`
   - Halaman publik (`/`, `/ensiklopedia`, `/jelajah-situs`, `/media`, `/kuis`) merender konten terbit
   - Login guru & `/api/v1/security/csrf` + alur submit tugas uji (dengan akun/kode uji lalu dibersihkan)
   - Cek header `Cache-Control: private, no-store` pada `/tugas`, `/guru`, `/admin`.

## 4. Prosedur Backup & Restore Drill (Sebelum Rilis & Tiap 3 Bulan)
Target operasional: **RPO ≤ 24 jam**, **RTO ≤ 8 jam**.
1. **Database:** gunakan backup otomatis penyedia + ekspor terenkripsi harian ke penyimpanan offsite berakses terbatas (retensi rolling 35 hari).
2. **Storage Media:** backup berkala objek bucket publik & privat beserta manifest checksum SHA-256 (karena backup database tidak mencakup objek Storage).
3. **Konfigurasi Auth & Secret:** dokumentasikan ulang redirect allowlist, SMTP, MFA policy, RLS, dan storage policy.
4. **Latihan Pemulihan (Restore Drill):**
   - Pulihkan DB dan objek Storage ke lingkungan terisolasi sebelum dibuka ke pengguna.
   - Verifikasi checksum file media/PDF, login guru, kuis tanpa login, dan isolasi antar guru (`AT-11`).
   - **Wajib:** jalankan ulang `POST /api/v1/internal/jobs/retention` (atau `private.run_retention_purge()`) agar data yang sebelumnya sudah dihapus tidak muncul kembali dari snapshot backup lama.
   - Catat tanggal, durasi pemulihan, dan hasil verifikasi.

## 5. Protokol Uji Coba Terbatas (30 Orang Guru & Siswa)
1. Siapkan kode tugas uji khusus kelas III & IV pada lingkungan *staging* atau *production* dengan kesiapan persetujuan sekolah.
2. Uji pada perangkat seluler nyata (lebar `360 px`, koneksi seluler terbatas):
   - Siswa masuk lewat QR/tautan dan kode 10 karakter
   - Mengisi nama, menjawab 5 soal, mencoba tombol konfirmasi soal kosong, mengirim, dan menekan **Selesai / Ganti Siswa**
   - Guru memantau rekap, mencoba pencarian nama, anotasi, dan ekspor CSV
3. Jalankan `tests/load/k6-classroom-burst.js` dengan data sintetis untuk mengukur p95 respons (`AT-20`).
4. Catat seluruh temuan kegunaan/aksesibilitas, perbaiki sebelum pengisian konten penuh dan diseminasi.
