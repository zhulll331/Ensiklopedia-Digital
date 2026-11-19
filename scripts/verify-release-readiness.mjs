import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const strictEnv = process.argv.includes("--strict-env");
let failed = false;

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// 1. Jalankan pemeriksaan migrasi SQL
try {
  execSync("node scripts/check-migrations.mjs", { stdio: "inherit" });
} catch {
  failed = true;
}

// 2. Pastikan seluruh file di src/lib/server/ mengimpor "server-only"
const serverDir = path.join(root, "src", "lib", "server");
for (const file of walkFiles(serverDir)) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes('import "server-only"') && !content.includes("import 'server-only'")) {
    console.error(`[FAIL] ${path.relative(root, file)} wajib menyertakan import "server-only";`);
    failed = true;
  }
}

// 3. Scan secret di komponen klien atau NEXT_PUBLIC_*
const FORBIDDEN_IN_CLIENT = [
  "SUPABASE_ADMIN_SECRET",
  "GUEST_DATABASE_URL",
  "JOIN_CODE_PEPPER",
  "CRON_SECRET",
];

const srcFiles = walkFiles(path.join(root, "src"));
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  const isClientFile =
    content.trimStart().startsWith('"use client"') ||
    content.trimStart().startsWith("'use client'");

  for (const secretName of FORBIDDEN_IN_CLIENT) {
    if (content.includes(`NEXT_PUBLIC_${secretName}`)) {
      console.error(`[FAIL] Variabel publik dilarang memakai ${secretName} di ${path.relative(root, file)}`);
      failed = true;
    }
    if (isClientFile && content.includes(secretName)) {
      console.error(`[FAIL] Komponen klien mereferensikan secret ${secretName} di ${path.relative(root, file)}`);
      failed = true;
    }
  }
}

// 4. Opsional: cek environment produksi jika dipanggil dengan --strict-env
if (strictEnv) {
  const requiredProdVars = [
    "PUBLIC_APP_URL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ADMIN_SECRET",
    "GUEST_DATABASE_URL",
    "JOIN_CODE_PEPPER",
    "CRON_SECRET",
  ];
  for (const v of requiredProdVars) {
    if (!process.env[v]) {
      console.error(`[FAIL] Environment produksi wajib mengisi ${v}.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("Pemeriksaan kesiapan rilis (migrasi, server-only, secret scan) LOLOS.");
