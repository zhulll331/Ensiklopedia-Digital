import fs from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("Tidak ada berkas migrasi di supabase/migrations.");
  process.exit(1);
}

let hasError = false;

files.forEach((file, index) => {
  const expectedPrefix = String(index + 1).padStart(4, "0") + "_";
  if (!file.startsWith(expectedPrefix)) {
    console.error(`Penomoran migrasi tidak berurutan: ${file} (seharusnya diawali ${expectedPrefix})`);
    hasError = true;
  }

  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

  if (/\bdrop\s+table\b|\btruncate\s+table\b/i.test(sql)) {
    console.error(`Migrasi ${file} mengandung DROP TABLE/TRUNCATE yang berisiko destruktif.`);
    hasError = true;
  }

  if (/security\s+definer/i.test(sql) && !/set\s+search_path\s*=\s*''/i.test(sql)) {
    console.error(`Migrasi ${file} memakai SECURITY DEFINER tanpa SET search_path = ''.`);
    hasError = true;
  }
});

if (hasError) {
  process.exit(1);
}

console.log(`Pemeriksaan migrasi lolos (${files.length} berkas).`);
