"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { fetchAdminCsrfToken } from "./csrf-client";

export function AdminSignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    try {
      const csrf = await fetchAdminCsrfToken();
      await fetch("/api/v1/admin/auth/logout", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf,
        },
      });
    } catch {
      // Tetap arahkan ke halaman masuk bila permintaan keluar gagal
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Reload dokumen penuh saat keluar agar seluruh state & cache sesi dibersihkan
      window.location.assign("/admin/masuk");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={signingOut}
      className="btn-secondary min-h-11 text-xs disabled:opacity-60"
    >
      <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
      {signingOut ? "Mengakhiri sesi..." : "Keluar Admin"}
    </button>
  );
}
