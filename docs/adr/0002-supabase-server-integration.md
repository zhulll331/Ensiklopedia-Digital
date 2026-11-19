# ADR-0002: Integrasi Server Supabase & Isolasi Schema

Tanggal: 2026-11-19  
Status: Disetujui

## Konteks
Aplikasi menggunakan Supabase terkelola (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ADMIN_SECRET`). Schema database dibagi menjadi `app` (data bisnis dengan RLS), `private` (kunci jawaban, sesi tamu, idempotency, token hash, log audit), dan `api` (fungsi RPC `SECURITY DEFINER`).

## Keputusan
1. **Schema `private` tidak pernah masuk Exposed Schemas PostgREST:** Hanya `app` dan `api` yang diekspos pada Data API Supabase.
2. **Query guru & admin memakai sesi pengguna (`createAdultSessionSupabaseClient`):** Seluruh query `app.classes`, `app.assignments`, `app.attempts`, `app.attempt_annotations`, dan `app.result_selections` berjalan memakai token pengguna dewasa sehingga RLS `auth.uid()` bekerja penuh di PostgreSQL.
3. **Sesi siswa tamu & operasi `private.*` lewat RPC sempit:** Karena tabel `private.*` tidak diekspos, modul `server-only` memanggil fungsi `SECURITY DEFINER` (`set search_path = ''`) di schema `api` yang hanya diberikan hak `EXECUTE` kepada `guest_api` dan `service_role` (`REVOKE ALL FROM PUBLIC, anon, authenticated`). Ini sesuai opsi fallback tervalidasi pada `03_ARSITEKTUR_DAN_TECH_STACK.md` §5.
4. **Penyimpanan ekspor CSV privat:** Ekspor CSV rekap guru ditulis ke bucket privat `exports-private` dan diunduh hanya setelah validasi ulang kepemilikan & kedaluwarsa di server.
