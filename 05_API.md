# Spesifikasi API REST

Base path: `/api/v1` • JSON UTF-8 • Waktu ISO8601 UTC • Tampilan pengguna Asia/Jakarta.

Status: kontrak rancangan yang perlu diterjemahkan menjadi OpenAPI dan diuji saat implementasi. ID pada contoh adalah placeholder, bukan ID produksi.

## 1. Prinsip kontrak

Semua query mutasi tervalidasi server. Backend menentukan owner, grade, revisi, deadline dan score; field tersebut tidak dipercaya dari browser. Unknown fields pada mutasi sensitif ditolak. Daftar memakai pagination cursor opaque dan `limit` default 20 maksimum 100. Filter/sort di-allowlist, tidak menerima ekspresi SQL.

Respons sukses: `{"data":{...},"meta":{"request_id":"..."}}`. Daftar menambahkan `next_cursor`. Respons error: `{"error":{"code":"...","message":"...","request_id":"...","field_errors":{}}}`. Jangan mengirim stack trace, SQL, secret atau data pengguna lain.

## 2. Jenis autentikasi

| Label | Mekanisme |
| --- | --- |
| P | Publik; hanya konten terbit dan latihan umum |
| J | Link token/kode tugas untuk resolve atau mulai; bukan izin membaca nilai |
| S | Cookie sesi siswa opaque HttpOnly, Secure, SameSite=Lax, Path=/ dengan prefix `__Host-`; pengerjaan maksimum 2 jam atau deadline, lalu sesi baca hasil maksimum 30 menit setelah submit |
| G | Sesi Auth guru terverifikasi dan aktif; ownership diperiksa per request |
| A | Sesi admin aktif dengan MFA; modul sensitif memerlukan recent reauthentication |
| X | Job server, kredensial khusus terpisah dan scope minimum |

Alur dewasa menggunakan integrasi Auth provider di server/BFF. Token dewasa disimpan dalam cookie server dengan HttpOnly dan Secure; kode browser tidak mengelola refresh token. Implementasi dan rotasi cookie harus diuji terhadap panduan SSR provider. Validasi server memakai verifikasi token/user resmi, bukan hanya membaca objek sesi lokal yang belum diverifikasi. Cookie berubah pada login/logout dan refresh; callback redirect memakai allowlist.

Semua mutasi berbasis cookie: periksa Origin, metode/content-type, SameSite, dan token CSRF yang diikat sesi. CSRF bukan pengganti otorisasi. CORS dibatasi origin aplikasi; credentialed wildcard dilarang. Endpoint publik submit latihan juga dibatasi origin/rate untuk mencegah penyalahgunaan biaya.

Sebelum mulai/login, `GET /security/csrf` menerbitkan nonce prasesi berumur pendek, maksimum 15 menit, tanpa nama atau identitas anak. Token CSRF diikat nonce tersebut dan diverifikasi bersama Origin pada operasi pembentukan sesi. Setelah sesi sah terbentuk, binding dirotasi ke sesi baru. Endpoint ini no-store dan tidak memberikan akses ke data apa pun.

## 3. Endpoint publik

| Method dan path | Akses | Masukan | Keluaran |
| --- | --- | --- | --- |
| `GET /settings/public` | P | — | Teks/menu/kontak publik allowlist; tanpa secret |
| `GET /contents` | P | kind, grade, q, cursor, limit | Ringkasan revisi terbit; tidak ada body privat |
| `GET /contents/{slug}` | P | Slug aman | Detail terbit, sumber, media dan tautan relevan |
| `GET /books/{slug}/chapters` | P | Cursor opsional | Urutan bab buku yang telah terbit |
| `GET /sites` | P | type, area, q | Katalog situs terbit |
| `GET /map/areas` | P | — | Wilayah umum yang lolos clearance; tanpa koordinat tepat |
| `GET /glossary` | P | q, letter | Istilah dan definisi terbit |
| `GET /resources` | P | type, grade | Panduan/LKPD/buku, ukuran dan versi |
| `GET /practice-quizzes` | P | grade | Daftar kuis mode practice yang terbit |
| `GET /practice-quizzes/{id}` | P | — | Soal dan pilihan tanpa key field |
| `POST /practice-quizzes/{id}/check` | P | Jawaban untuk revisi practice | Nilai dan pembahasan; tidak membuat rekam nilai individu |
| `GET /media/{id}/download` | P atau pemilik | Media ID | Redirect/URL singkat sesuai izin; hanya aset cleared yang dapat publik |

Endpoint `contents` yang generik dapat melayani sebagian route khusus. Route tambahan berguna sebagai kontrak domain; implementasi service internal jangan digandakan. Media privat tidak dapat diakses dengan menebak ID.

## 4. Endpoint siswa tanpa login

| Method dan path | Akses | Perilaku |
| --- | --- | --- |
| `POST /join/resolve` | J | Token atau kode → nama tugas, kelas, guru tampilan, status dan notice privasi ringkas; tanpa daftar siswa |
| `POST /guest/attempts` | J + CSRF | Token/kode dan nama → buat attempt, Set-Cookie sesi, return soal tanpa kunci dan deadline |
| `GET /guest/attempt` | S | Resume percobaan sendiri, state, jawaban terakhir dan deadline |
| `PUT /guest/attempt/answers` | S + CSRF | Autosave snapshot jawaban dengan revision kontrol konkurensi |
| `POST /guest/attempt/submit` | S + CSRF | Jawaban final dan Idempotency-Key → transaksi penilaian |
| `GET /guest/attempt/result` | S | Receipt dan score sendiri; pembahasan hanya sesuai waktu/kebijakan |
| `POST /guest/session/end` | S + CSRF | Revoke sesi dan hapus cookie; hasil terkirim tetap tersimpan di guru |

Tidak ada endpoint `GET /results?name=...`, pencarian nama publik, atau akses hasil hanya memakai attempt_id. API tamu memakai sesi untuk memilih attempt; parameter attempt milik orang lain tidak diterima.

### 4.1 Link dan kode

Link dibentuk sebagai `https://<domain>/tugas#t=<random-token>` sehingga token tidak dikirim otomatis pada HTTP URL/referer. Halaman join lokal membaca fragment, menghapusnya dari address bar dengan `replaceState`, dan menukar token melalui POST. Halaman tersebut tidak memuat analytics/skrip/asset pihak ketiga. Token tidak pernah dimasukkan ke body log. Jalur tugas memakai no-store dan noindex.

Kode tugas acak10 karakter memberi alternatif ketik manual. Backend menormalisasi huruf/spasi sesuai aturan, menghitung digest, memvalidasi state serta menerapkan throttling. Link dan kode memberi kemampuan memulai tugas; jika tersebar, guru dapat merotasi akses atau mencabut tugas.

### 4.2 Contoh resolve dan mulai

```json
{
  "join_code": "<kode-dari-guru>"
}
```

Field `join_token` dapat digunakan sebagai alternatif; tepat satu token/kode diwajibkan. Respons resolve:

```json
{
  "data": {
    "assignment_title": "Mengenal Tinggalan Megalitik",
    "class_label": "III A",
    "grade": 3,
    "teacher_display_name": "<nama-tampilan-guru>",
    "can_start": true,
    "privacy_notice_version": "1.0"
  },
  "meta": {"request_id": "<request-id>"}
}
```

Mulai:

```json
{
  "join_code": "<kode-dari-guru>",
  "student_name": "<nama-sesuai-arahan-guru>",
  "privacy_notice_version": "1.0"
}
```

Kelas/guru tidak dikirim sebagai input siswa. Notice acknowledgement bukan persetujuan orang tua/wali. Backend memastikan kesiapan persetujuan tugas dan alur pendampingan sekolah sebelum memproses nama. Jika kelas belum siap, tugas tidak dapat dibuka untuk pengumpulan nilai; latihan tanpa nama tetap menjadi pilihan produk, tunduk penilaian kewajiban layanan anak.

Respons201 memberi `attempt_id`, `state`, `expires_at`, `answer_revision=0` serta daftar question/choice ID dan teks. Cookie token tidak dimasukkan JSON. Payload tidak mengandung `correct_choice_id`, `is_correct`, pembahasan atau hash kunci. Nama tidak perlu dipantulkan kembali dalam respons soal.

Start bukan operasi idempotent pada koneksi awal tanpa cookie. Retry dapat menghasilkan attempt belum terkirim tambahan jika respons/cookie pertama benar-benar hilang; attempt tersebut kedaluwarsa dan tidak masuk hitungan kiriman. Jika cookie sudah ada, tawarkan resume/ganti siswa, jangan diam-diam membuat attempt lain. Batas ini berbeda dari submit yang wajib idempotent.

### 4.3 Autosave

```json
{
  "expected_revision": 2,
  "answers": [
    {"question_id": "<question-id>", "selected_choice_id": "<choice-id>"},
    {"question_id": "<question-id-lain>", "selected_choice_id": null}
  ]
}
```

Snapshot memuat seluruh state jawaban yang diketahui klien. Backend menolak duplicate question, ID asing, choice dari pertanyaan lain, sesi lewat waktu atau percobaan terkirim. Lock attempt; cocokkan revision; simpan dan naikkan revision. Respons memuat revision baru dan saved_at. Jika 409, browser mengambil state terbaru dan meminta resolusi sesuai tampilan; request lama tidak menimpa jawaban baru. Debounce sekitar 2 detik, maksimum 30 autosave/menit/sesi.

### 4.4 Submit

Header `Idempotency-Key: <random-uuid>` dibuat sekali untuk satu tindakan final dan digunakan ulang ketika retry. Body:

```json
{
  "answers": [
    {"question_id": "<question-id>", "selected_choice_id": "<choice-id>"}
  ],
  "confirm_submit": true
}
```

Daftar ini merupakan jawaban final, tidak bergantung autosave terakhir. Pertanyaan yang tidak disertakan dianggap kosong setelah konfirmasi UI. Key discope per attempt+aksi, request di-hash secara canonical. Key sama/payload berbeda →409. Key sama/payload sama → receipt yang sama. Key berbeda pada attempt yang sudah terkirim → receipt final yang sama tanpa menilai ulang. Race request tetap menghasilkan satu hasil final.

```json
{
  "data": {
    "attempt_id": "<attempt-id>",
    "state": "submitted",
    "submitted_at": "2026-11-17T04:00:00Z",
    "correct_count": 4,
    "question_count": 5,
    "score": 80.00,
    "explanations_available": false,
    "receipt_code": "<kode-konfirmasi-nonotorisasi>"
  },
  "meta": {"request_id": "<request-id>"}
}
```

Receipt code hanya bukti konfirmasi di layar, bukan password untuk membuka hasil. Cookie sesi yang masih sah dibutuhkan untuk mengambil hasil lagi. Jika perangkat kehilangan sesi setelah sukses, siswa meminta guru memeriksa hasil; tidak ada recovery melalui pencarian nama publik.

Submit sukses memperpanjang cookie/sesi yang sama sampai maksimum 30 menit setelah submitted_at untuk membaca hasil. Tenggat pengerjaan tidak berubah. Replay submit atas attempt yang telah committed diproses sebelum pemeriksaan tenggat pengerjaan, tetapi tetap memeriksa keabsahan sesi dan konflik key/payload. Tidak ada hak mengubah jawaban selama sesi baca. Pembahasan tersedia hanya jika closes_at tercapai selama sesi masih sah; jika tidak, guru menyampaikan pembahasan melalui kegiatan kelas.

## 5. Endpoint guru

| Method dan path | Akses | Aturan |
| --- | --- | --- |
| `GET /me` / `PATCH /me` | G/A | Allowlist profil; role/status tidak dapat diedit |
| `GET /teacher/classes` | G | Hanya kelas milik sendiri |
| `POST /teacher/classes` | G | school_id yang diizinkan, label, grade3/4, tahun ajaran |
| `PATCH /teacher/classes/{id}` | G owner | Label/arsip; owner tidak berubah; grade terkunci setelah ada tugas |
| `GET /teacher/quizzes` | G | Kuis assignment terbit; tidak memuat key |
| `POST /teacher/assignments` | G owner kelas | class_id, quiz_revision_id, judul, jadwal dan kebijakan |
| `PATCH /teacher/assignments/{id}` | G owner | Jadwal/state sesuai aturan; revisi kuis terkunci setelah buka |
| `POST /teacher/assignments/{id}/open` | G owner | Periksa jadwal dan readiness persetujuan; buat akses acak |
| `POST /teacher/assignments/{id}/rotate-access` | G owner | Cabut link/kode lama untuk mulai baru; sesi berjalan tetap sesuai tenggat |
| `POST /teacher/assignments/{id}/close` | G owner | Stop starts; existing sessions sampai deadline semula |
| `POST /teacher/assignments/{id}/revoke` | G owner | Alasan wajib; batalkan sesi aktif; tolak submit baru |
| `GET /teacher/assignments/{id}/results` | G owner | Filter state, q nama di server, cursor; no-store; pencarian tidak dicatat dalam URL log |
| `GET /teacher/attempts/{id}` | G owner | Detail jawaban/score; pembahasan server dibatasi sesuai peran |
| `POST /teacher/attempts/{id}/annotations` | G owner | Jenis, alasan, koreksi nama/validitas; tidak menerima score |
| `POST /teacher/assignments/{id}/select-result` | G owner | Pilih attempt yang digunakan, dengan alasan |
| `POST /teacher/assignments/{id}/exports` | G owner | Buat CSV privat; reauth bila kebijakan mensyaratkan |
| `GET /teacher/exports/{id}/download` | G owner job | Recheck akses, signed URL≤60 detik; audit |

Filter nama sebaiknya memakai POST `/teacher/assignments/{id}/results/search` jika infrastructure log tidak mampu menyensor query parameter. Metode final ditetapkan konsisten saat OpenAPI dibangun. Default yang direkomendasikan: GET untuk filter non-PII dan POST untuk pencarian nama.

Token/kode mentah dikembalikan hanya saat open/rotate melalui respons no-store. Database menyimpan digest saja. Jika guru kehilangan token, gunakan rotate; jangan menyimpan secret mentah untuk kebutuhan tampilan ulang. Guru dapat menyimpan QR secara sadar pada perangkatnya.

## 6. Endpoint admin dan job

| Method/path family | Akses | Fungsi |
| --- | --- | --- |
| `/admin/contents` dan `/{id}/revisions` | A | Membuat item/revisi, metadata dan relasi |
| `/admin/revisions/{id}/reviews` | A | Mencatat bukti kurasi/validasi dari ahli/validator |
| `POST /admin/revisions/{id}/publish` | A | Validasi gate, ubah pointer atomik, invalidasi cache |
| `/admin/quizzes` dan `/admin/quiz-revisions` | A | Bank soal, pilihan, kunci dan validasi; response bank privat |
| `POST /admin/media/upload-intents` | A | Buat signed upload untuk path acak, tipe/ukuran maksimum |
| `POST /admin/media/{id}/finalize` | A | Periksa object nyata, scan/sanitize, tetap privat sampai lolos |
| `/admin/teachers` | A | Undangan, aktivasi, suspensi; role admin tidak dapat diberikan lewat form guru |
| `/admin/schools` dan `/admin/settings` | A | Sekolah dan setting allowlist |
| `POST /admin/support-access` | A | Recent MFA, assignment tertentu, alasan dan expiry |
| `GET /admin/support-access/{id}/results` | A scoped | Baca terbatas dan audit; tidak mengekspor massal secara default |
| `POST /admin/privacy-requests` | A | Permintaan koreksi/purge yang diverifikasi lewat sekolah; tanpa endpoint publik berbasis nama |
| `POST /internal/jobs/retention` | X | Purge data dan ekspor kedaluwarsa, idempotent |
| `POST /internal/jobs/media-scan` | X | Worker scan; payload bertanda tangan dan batas scope |

Setiap mutasi admin menggunakan method spesifik GET/POST/PATCH/DELETE yang dijabarkan dalam OpenAPI saat implementasi. Endpoint family di tabel bukan izin CRUD bebas. Publikasi, kunci soal, grant role dan penghapusan data mempunyai service khusus serta audit.

## 7. Status dan error

| HTTP | Code contoh | Penggunaan |
| --- | --- | --- |
| 400 | INVALID_REQUEST | JSON/format field tidak sah |
| 401 | AUTH_REQUIRED / SESSION_EXPIRED | Sesi dewasa/siswa tidak ada atau tidak sah |
| 403 | ACTION_NOT_ALLOWED | Aksi tidak diizinkan pada resource yang memang boleh diketahui |
| 404 | RESOURCE_NOT_FOUND | ID tidak ada atau milik guru lain; tidak membocorkan keberadaan |
| 409 | STATE_CONFLICT / REVISION_CONFLICT / IDEMPOTENCY_CONFLICT | State berubah, autosave usang, key berbeda payload |
| 410 | TASK_UNAVAILABLE / ATTEMPT_EXPIRED | Tugas/sesi tamu sudah tidak dapat digunakan; tanpa detail privat |
| 413 | PAYLOAD_TOO_LARGE | Body/file melewati batas |
| 422 | VALIDATION_FAILED | Relasi jawaban, jadwal atau konten tidak valid |
| 429 | RATE_LIMITED | Sertakan Retry-After dan petunjuk mencoba kembali |
| 503 | TEMPORARILY_UNAVAILABLE | Gangguan layanan; jangan mengonfirmasi hasil sebelum commit |

## 8. Batas dan perlindungan operasional

Rekomendasi awal: JSON jawaban≤64 KB; nama≤80 karakter; soal≤50per kuis walaupun rekomendasi editorial5–10; limit daftar≤100. Throttle memakai penyimpanan bersama yang atomik agar bekerja pada banyak instance, misalnya tabel counter melalui fungsi DB berindeks pada skala awal. Jangan memakai memori satu instance sebagai satu-satunya limiter. Pindahkan limiter ke managed Redis bila pengukuran membenarkan.

Rancangan awal throttle: invalid code 10/menit/IP; start valid hingga 300/15 menit/IP dan 250/15 menit/tugas; autosave 30/menit/sesi; submit 10/menit/sesi; ekspor 5/jam/guru. Nilai harus diuji untuk NAT sekolah agar satu kelas tidak terblokir. Terapkan backoff dan deteksi kode acak, bukan CAPTCHA berat untuk semua anak.

Kontrak API diuji untuk input asing, kepemilikan lintas guru, key bocor, body besar, retry, race submit, callback auth, expiry dan cache. Skema request/response dibangun menjadi OpenAPI 3.1 pada fase implementasi; contoh di dokumen bukan kode server atau bukti pengujian yang sudah berjalan.
