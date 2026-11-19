# Panduan Pengembangan — EDMB (Ensiklopedia Digital Megalitik Banyuwangi)

## Konteks Proyek
- **Produk:** Web-app ensiklopedia edukasi budaya Banyuwangi untuk siswa SD kelas III–IV (tanpa login), guru (login), dan admin (login + MFA).
- **Stack:** Next.js App Router + TypeScript strict + Tailwind CSS + Supabase (PostgreSQL, Auth, Storage) pada hosting terkelola.
- **Spesifikasi acuan:** `README.md`, `01_ANALISIS_PROPOSAL.md` s.d. `07_IMPLEMENTASI_OPERASIONAL_DAN_BIAYA.md`, dan `desain (5).md`.

## Browser Support & Modern Web Guidance
- **Browser Support:** Baseline Widely available sebagai standar utama. Fitur Newly Available diperbolehkan jika dilengkapi fallback ringan atau progressive enhancement tanpa dependensi eksternal berat.
- Selalu jalankan skill `modern-web-guidance` sebelum menulis atau mengubah komponen HTML/CSS/JS klien.
- Jangan menimpa `font-size` pada `:root` atau `html`; sertakan `<meta name="text-scale" content="scale" />` agar skala teks OS pengguna dihormati.
- Jangan memuat font eksternal, analytics, atau skrip pihak ketiga di `/tugas` (alur siswa).

## Aturan Keamanan & Privasi Wajib
1. Jangan pernah menaruh `SUPABASE_ADMIN_SECRET`, `GUEST_DATABASE_URL`, `JOIN_CODE_PEPPER`, atau `CRON_SECRET` di `NEXT_PUBLIC_*` atau komponen klien.
2. Semua modul di `src/lib/server/` wajib menyertakan `import "server-only";`.
3. Kunci jawaban kuis dan skor tidak pernah dikirim dalam payload soal atau diterima dari browser.
4. Peta publik hanya menampilkan wilayah umum yang sudah lolos clearance (`area_label` + titik representatif), tanpa koordinat tepat situs.
5. Rute `/tugas`, `/guru`, `/admin`, dan endpoint sensitif `/api/v1/{guest,teacher,admin,security}` wajib `Cache-Control: private, no-store`.
