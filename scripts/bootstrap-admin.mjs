import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return "";
  }
  return String(process.argv[idx + 1] ?? "").trim();
}

const email = readArg("--email").toLowerCase();
const displayName = readArg("--name");

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Penggunaan: npm run admin:bootstrap -- --email admin@instansi.sch.id --name "Nama Admin"');
  process.exit(1);
}

if (!displayName || displayName.length < 2 || displayName.length > 80) {
  console.error("Argumen --name wajib diisi (2..80 karakter).");
  process.exit(1);
}

const env = { ...loadEnvLocal(), ...process.env };
const supabaseUrl = env.SUPABASE_URL;
const adminSecret = env.SUPABASE_ADMIN_SECRET;
const publicAppUrl = (env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

if (!supabaseUrl || !adminSecret) {
  console.error("SUPABASE_URL dan SUPABASE_ADMIN_SECRET wajib dikonfigurasi di .env.local.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, adminSecret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const redirectTo = `${publicAppUrl}/auth/callback?next=/admin/mfa/daftar`;
let targetUserId = "";
let inviteSent = false;

const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
  email,
  { redirectTo }
);

if (!inviteErr && inviteData?.user?.id) {
  targetUserId = inviteData.user.id;
  inviteSent = true;
} else {
  // Jika email sudah terdaftar di Auth, cari user-nya lewat daftar admin API
  let page = 1;
  while (!targetUserId && page <= 20) {
    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (listErr) {
      console.error(`Gagal memeriksa pengguna Auth: ${listErr.message}`);
      process.exit(1);
    }
    const found = (listData?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (found) {
      targetUserId = found.id;
      break;
    }
    if (!listData?.users || listData.users.length < 100) {
      break;
    }
    page += 1;
  }

  if (!targetUserId) {
    console.error(
      `Gagal mengundang atau menemukan akun Auth (${inviteErr?.message ?? "tidak ditemukan"}).`
    );
    process.exit(1);
  }
}

const { error: profileErr } = await admin
  .schema("app")
  .from("profiles")
  .upsert(
    {
      user_id: targetUserId,
      role: "admin",
      display_name: displayName,
      status: "active",
    },
    { onConflict: "user_id" }
  );

if (profileErr) {
  console.error(`Gagal menyimpan profil admin di app.profiles: ${profileErr.message}`);
  process.exit(1);
}

const requestId = randomUUID();
const { error: auditErr } = await admin.schema("api").rpc("write_admin_audit", {
  p_actor_id: targetUserId,
  p_action: "bootstrap_admin",
  p_target_type: "profile",
  p_target_id: targetUserId,
  p_request_id: requestId,
  p_outcome: "success",
  p_safe_metadata: { invite_sent: inviteSent },
});

if (auditErr) {
  console.warn(`[PERINGATAN] Profil admin aktif, tetapi audit RPC belum siap: ${auditErr.message}`);
}

console.log(`[OK] Akun admin aktif siap: user_id=${targetUserId}`);
console.log(
  inviteSent
    ? `[INFO] Email undangan pendaftaran dikirim dengan redirect ${redirectTo}`
    : "[INFO] Akun Auth sudah terdaftar; silakan masuk di /admin/masuk lalu selesaikan pendaftaran MFA."
);
