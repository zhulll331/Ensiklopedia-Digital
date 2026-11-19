import { expect, test } from "@playwright/test";

test.describe("Alur Inti EDMB & Keamanan Browser", () => {
  test("halaman publik tidak mengalami overflow horizontal pada viewport aktif", async ({
    page,
  }) => {
    for (const route of ["/", "/ensiklopedia", "/jelajah-situs", "/media", "/kuis"]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `Overflow horizontal terdeteksi di ${route}`).toBe(false);
    }
  });

  test("halaman /tugas menerapkan header no-store, no-referrer, dan CSP ketat", async ({
    page,
  }) => {
    const response = await page.goto("/tugas");
    expect(response).not.toBeNull();
    const headers = response!.headers();
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["content-security-policy"]).toContain("nonce-");
    expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
  });

  test("alur siswa lengkap: kode -> nama -> jawab -> dialog konfirmasi -> kirim -> selesai", async ({
    page,
  }) => {
    await page.goto("/tugas");

    await page.getByLabel(/Kode Tugas/i).fill("EDMB34ABCD");
    await page.getByRole("button", { name: "Buka Tugas" }).click();

    await expect(page.getByText(/Ibu Sari/i)).toBeVisible();
    await page.getByLabel(/Tulis namamu/i).fill("Siswa Uji E2E");
    await page.getByRole("button", { name: "Mulai Mengerjakan" }).click();

    await expect(page.getByText(/Soal 1 dari 5/i)).toBeVisible();
    await page.locator(".choice-card").first().click();

    // Lompat cepat sampai ke layar tinjau (membiarkan 4 soal kosong untuk menguji dialog konfirmasi)
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole("button", { name: "Berikutnya" }).click();
    }
    await page.getByRole("button", { name: "Tinjau & Kirim" }).click();

    await page.getByRole("button", { name: "Kirim Jawaban" }).click();
    await expect(page.getByRole("heading", { name: /Masih ada 4 soal belum dijawab/i })).toBeVisible();
    await page.getByRole("button", { name: "Tetap Kirim" }).click();

    await expect(page.getByText(/Jawaban Berhasil Dikirim/i)).toBeVisible();
    await page.getByRole("button", { name: /Selesai \/ Ganti Siswa/i }).click();
    await expect(page.getByLabel(/Kode Tugas/i)).toBeVisible();
  });

  test("portal guru menampilkan rekap dan mengisolasi lintas guru", async ({
    page,
  }) => {
    await page.goto("/guru");
    await page.getByRole("button", { name: /Masuk Lokal: Ibu Sari/i }).click();
    await expect(page.getByRole("heading", { name: /4\. Rekap Kiriman Siswa/i })).toBeVisible();
    await page.getByRole("button", { name: /Keluar Guru/i }).click();

    await page.getByRole("button", { name: /Masuk Lokal: Bapak Budi/i }).click();
    await expect(page.getByText(/Belum ada tugas di akun guru ini/i)).toBeVisible();
  });
});
