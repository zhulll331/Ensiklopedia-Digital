# ADR-0001: Keputusan Arsitektur Awal & Fase 0

Tanggal: 2026-11-18  
Status: Disetujui

## Konteks
Dokumen spesifikasi (`01`–`07`, `desain (5).md`) menetapkan rancangan Ensiklopedia Digital Megalitik Banyuwangi (EDMB) untuk siswa SD kelas III–IV (tanpa login), guru (login), dan admin (login + MFA).

## Keputusan
1. **ADR-01 (Modular Monolith):** Satu aplikasi Next.js App Router + TypeScript strict dengan pemisahan modul `content`, `learning`, `identity`, dan `lib/server`.
2. **ADR-02 (PostgreSQL Relasional + RLS):** Menggunakan Supabase PostgreSQL terkelola dengan pemisahan schema `app`, `private`, dan `api`.
3. **ADR-03 (Sesi Siswa Tanpa Akun):** Tidak membuat akun siswa (termasuk tidak memakai anonymous Supabase Auth); menggunakan cookie sesi opaque `HttpOnly` yang dikelola backend dan role DB terisolasi `guest_api`.
4. **ADR-04 (Penilaian di Server):** Kunci jawaban berada di `private.quiz_answer_keys`; perhitungan skor dilakukan secara atomik di server.
5. **ADR-05 (Revisi Immutable):** Revisi konten dan kuis yang disetujui/terbit tidak diubah in-place; publikasi memindahkan pointer secara atomik.
6. **ADR-06 (Pelindungan Lokasi):** Koordinat tepat situs tidak disimpan; hanya `area_label` dan titik representatif wilayah yang lolos clearance.
7. **ADR-07 (Isolasi Nilai):** Materi guru terbuka; kelas dan nilai bersifat privat per guru pemilik kelas.
8. **ADR-08 (Hosting Terkelola & Pengembang Tunggal):** Mengikuti rekomendasi dokumen menggunakan Supabase + hosting Next.js terkelola dengan target rilis kondisional dan dikerjakan oleh pengembang tunggal.
