import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function loadEnvLocal() {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const entries = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    entries[key] = rawVal.replace(/^"|"$/g, "");
  }
  return entries;
}

const env = { ...loadEnvLocal(), ...process.env };
const supabaseUrl = env.SUPABASE_URL;
const adminSecret = env.SUPABASE_ADMIN_SECRET;

if (!supabaseUrl || !adminSecret) {
  console.error("SUPABASE_URL dan SUPABASE_ADMIN_SECRET wajib terisi di .env.local.");
  process.exit(1);
}

// 1. Gabungkan migrasi 0001..0008 ke berkas siap-tempel untuk SQL Editor
const migrationsDir = path.join(root, "supabase", "migrations");
const migrationFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const bundledSql = [
  "-- Berkas gabungan otomatis untuk SQL Editor Supabase (dari supabase/migrations/0001..0008)",
  "-- Jalankan seluruh isi berkas ini sekali di Supabase Dashboard -> SQL Editor.",
  "",
  ...migrationFiles.map((file) => {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    return `-- === ${file} ===\n${content.trim()}\n`;
  }),
].join("\n");

const bundleOutPath = path.join(root, "supabase", "bootstrap-all-migrations.sql");
fs.writeFileSync(bundleOutPath, bundledSql, "utf8");
console.log(`[OK] Berkas SQL gabungan dibuat: ${path.relative(root, bundleOutPath)} (${migrationFiles.length} migrasi).`);

// 2. Pastikan 3 bucket Storage wajib tersedia
const admin = createClient(supabaseUrl, adminSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REQUIRED_BUCKETS = [
  // Catatan SEC-19: Batas 50 MB menyesuaikan kuota default paket Free Supabase.
  // Pada paket Pro/terkelola untuk unggahan video MP4 besar, batas bucket dapat dinaikkan hingga 250 MB.
  {
    name: "media-public",
    options: {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4"],
    },
  },
  {
    name: "media-quarantine",
    options: {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    },
  },
  {
    name: "exports-private",
    options: {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["text/csv"],
    },
  },
];

const { data: existingBuckets, error: listErr } = await admin.storage.listBuckets();
if (listErr) {
  console.error(`[FAIL] Gagal memeriksa bucket Storage: ${listErr.message}`);
  process.exit(1);
}

const existingNames = new Set((existingBuckets ?? []).map((b) => b.name));
for (const bucket of REQUIRED_BUCKETS) {
  if (existingNames.has(bucket.name)) {
    console.log(`[OK] Bucket "${bucket.name}" sudah ada.`);
    continue;
  }
  const { error: createErr } = await admin.storage.createBucket(bucket.name, bucket.options);
  if (createErr) {
    console.error(`[FAIL] Gagal membuat bucket "${bucket.name}": ${createErr.message}`);
    process.exit(1);
  }
  console.log(`[CREATED] Bucket "${bucket.name}" berhasil dibuat.`);
}

// 3. Cek keterjangkauan schema app & api melalui Data API
const appCheck = await admin.schema("app").from("site_settings").select("key").limit(1);
const apiCheck = await admin.schema("api").rpc("resolve_guest_join", { p_code_digest: "0000" });

const appReady = !appCheck.error;
const apiReady =
  !apiCheck.error ||
  (!/Invalid schema/i.test(apiCheck.error.message) &&
    !/schema.*does not exist/i.test(apiCheck.error.message) &&
    !/Could not find the function/i.test(apiCheck.error.message));

console.log(`Status Schema Data API -> app: ${appReady ? "SIAP" : `BELUM (${appCheck.error.message})`}`);
console.log(`Status Schema Data API -> api: ${apiReady ? "SIAP" : `BELUM (${apiCheck.error?.message ?? "unknown"})`}`);

let rlsNeedFix = false;
let adminNeedMigration = false;
const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
if (appReady && publishableKey) {
  const pub = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [contentsProbe, quizzesProbe, locationsProbe, adminFnProbe] = await Promise.all([
    pub.schema("app").from("content_items").select("id").limit(1),
    pub.schema("app").from("quizzes").select("id").limit(1),
    pub.schema("app").from("site_public_locations").select("revision_id").limit(1),
    admin.schema("app").rpc("current_user_is_active_admin"),
  ]);

  const contentsOk = !contentsProbe.error;
  const quizzesOk = !quizzesProbe.error;
  const locationsOk = !locationsProbe.error;
  const adminOk = !adminFnProbe.error;
  rlsNeedFix = !quizzesOk || !locationsOk;
  adminNeedMigration = !adminOk || !contentsOk;

  console.log(
    `Status RLS Publik (anon) -> app.content_items: ${contentsOk ? "SIAP" : `GAGAL (${contentsProbe.error.code ?? ""} ${contentsProbe.error.message})`}`
  );
  console.log(
    `Status RLS Publik (anon) -> app.quizzes: ${quizzesOk ? "SIAP" : `GAGAL (${quizzesProbe.error.code ?? ""} ${quizzesProbe.error.message})`}`
  );
  console.log(
    `Status RLS Publik (anon) -> app.site_public_locations: ${locationsOk ? "SIAP" : `GAGAL (${locationsProbe.error.code ?? ""} ${locationsProbe.error.message})`}`
  );
  console.log(
    `Status Fondasi Admin (0010) -> app.current_user_is_active_admin: ${adminOk ? "SIAP" : `BELUM (${adminFnProbe.error.message})`}`
  );
}

if (!appReady || !apiReady || rlsNeedFix || adminNeedMigration) {
  let projectRef = "<project-ref>";
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] || projectRef;
  } catch {
    // Tetap gunakan placeholder jika URL tidak standar
  }
  console.log("");
  if (!appReady || !apiReady) {
    console.log("Langkah manual di Dashboard Supabase untuk mengaktifkan Data API:");
    console.log(`1. SQL Editor: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log("   Tempel dan jalankan seluruh isi berkas supabase/bootstrap-all-migrations.sql.");
    console.log(`2. Data API Settings: https://supabase.com/dashboard/project/${projectRef}/settings/api`);
    console.log('   Pada "Exposed schemas", tambahkan "app" dan "api" (JANGAN expose "private"), lalu klik Save.');
  } else {
    console.log("Migrasi SQL lanjutan diperlukan di Supabase SQL Editor:");
    console.log(`1. SQL Editor: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    if (rlsNeedFix) {
      console.log("   Jalankan isi berkas supabase/migrations/0009_fix_rls_recursion_and_location_helper.sql.");
    }
    if (adminNeedMigration) {
      console.log("   Jalankan isi berkas supabase/migrations/0010_admin_foundation.sql.");
    }
  }
  console.log("3. Setelah itu jalankan ulang: npm run supabase:bootstrap");
}
