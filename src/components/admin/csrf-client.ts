"use client";

export async function fetchAdminCsrfToken(): Promise<string> {
  const res = await fetch("/api/v1/security/csrf", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Gagal menyiapkan token keamanan sesi.");
  }
  const json = await res.json();
  const token = String(json?.data?.csrf_token ?? "");
  if (!token) {
    throw new Error("Token keamanan CSRF tidak tersedia.");
  }
  return token;
}
