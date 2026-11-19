/**
 * Uji beban k6 untuk skenario 1 kelas di balik NAT sekolah (AT-20 & NFR-04/NFR-05).
 * Target: 100 siswa aktif, ~30 submit serentak, menggunakan data sintetis (tanpa nama anak nyata).
 *
 * Cara jalan:
 *   k6 run -e BASE_URL=https://staging.example.org -e JOIN_CODE=EDMB34ABCD tests/load/k6-classroom-burst.js
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    classroom_quiz: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 30 },
        { duration: "30s", target: 100 },
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{step:resolve}": ["p(95)<800"],
    "http_req_duration{step:submit}": ["p(95)<1500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3100";
const JOIN_CODE = __ENV.JOIN_CODE || "EDMB34ABCD";

export default function classroomBurst() {
  // 1. Ambil CSRF nonce prasesi
  const csrfRes = http.get(`${BASE_URL}/api/v1/security/csrf`, {
    tags: { step: "csrf" },
  });
  check(csrfRes, { "csrf 200": (r) => r.status === 200 });
  const csrfToken = csrfRes.json("data.csrf_token");

  // 2. Resolve tugas
  const resolveRes = http.post(
    `${BASE_URL}/api/v1/join/resolve`,
    JSON.stringify({ join_code: JOIN_CODE }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { step: "resolve" },
    }
  );
  check(resolveRes, { "resolve 200": (r) => r.status === 200 });

  // 3. Mulai percobaan dengan nama sintetis
  const startRes = http.post(
    `${BASE_URL}/api/v1/guest/attempts`,
    JSON.stringify({
      join_code: JOIN_CODE,
      student_name: `Uji-Sintetis-${__VU}-${__ITER}`,
      privacy_notice_version: "1.0",
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      tags: { step: "start" },
    }
  );
  check(startRes, { "start 201": (r) => r.status === 201 });

  sleep(1);

  // 4. Submit final idempoten
  const questions = startRes.json("data.questions") || [];
  const answers = questions.map((q) => ({
    question_id: q.id,
    selected_choice_id: q.choices?.[0]?.id ?? null,
  }));

  const submitRes = http.post(
    `${BASE_URL}/api/v1/guest/attempt/submit`,
    JSON.stringify({ answers, confirm_submit: true }),
    {
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
        "Idempotency-Key": `k6-${__VU}-${__ITER}-${Date.now()}`,
      },
      tags: { step: "submit" },
    }
  );
  check(submitRes, { "submit 200": (r) => r.status === 200 });
}
