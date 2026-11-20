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
    expect(headers["content-security-policy"]).not.toContain("youtube-nocookie.com");
    expect(headers["content-security-policy"]).not.toContain("player.vimeo.com");
    expect(headers["content-security-policy"]).not.toContain("drive.google.com");
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

  test("portal admin mewajibkan sesi terautentikasi dan melindungi draf (SEC-04)", async ({
    page,
  }) => {
    // 1. Endpoint publikasi admin menolak permintaan tanpa autentikasi (termasuk ketika membawa CSRF valid)
    const csrfResp = await page.request.get("/api/v1/security/csrf");
    const csrfJson = await csrfResp.json();
    const csrfToken = csrfJson?.data?.csrf_token ?? "";
    const publishResp = await page.request.post(
      "/api/v1/admin/revisions/00000000-0000-4000-8000-000000000001/publish",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { confirm_publish: true },
      }
    );
    expect([401, 403]).toContain(publishResp.status());

    const createContentResp = await page.request.post("/api/v1/admin/contents", {
      headers: { "X-CSRF-Token": csrfToken },
      data: { kind: "chapter", slug: "uji-tanpa-sesi", title: "Uji" },
    });
    expect([401, 403]).toContain(createContentResp.status());

    const transitionResp = await page.request.post(
      "/api/v1/admin/revisions/00000000-0000-4000-8000-000000000001/transition",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { expected_status: "draft", next_status: "in_review" },
      }
    );
    expect([401, 403]).toContain(transitionResp.status());

    const locationResp = await page.request.put(
      "/api/v1/admin/revisions/00000000-0000-4000-8000-000000000001/location",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: {
          area_label: "Wilayah Barat Banyuwangi",
          display_lat: -8.22,
          display_lon: 114.21,
          display_zoom_max: 11,
          clearance_review_id: "00000000-0000-4000-8000-000000000002",
        },
      }
    );
    expect([401, 403]).toContain(locationResp.status());

    const uploadIntentResp = await page.request.post(
      "/api/v1/admin/media/upload-intents",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { kind: "image", mime: "image/jpeg", bytes: 1024 },
      }
    );
    expect([401, 403]).toContain(uploadIntentResp.status());

    const reviewMediaResp = await page.request.post(
      "/api/v1/admin/media/00000000-0000-4000-8000-000000000001/review",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { decision: "rejected", notes: "Uji tanpa autentikasi" },
      }
    );
    expect([401, 403]).toContain(reviewMediaResp.status());

    const externalMediaResp = await page.request.post(
      "/api/v1/admin/media/external-links",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { kind: "video", url: "https://youtu.be/dQw4w9WgXcQ" },
      }
    );
    expect([401, 403]).toContain(externalMediaResp.status());

    const createQuizResp = await page.request.post("/api/v1/admin/quizzes", {
      headers: { "X-CSRF-Token": csrfToken },
      data: {
        slug: "kuis-tanpa-sesi",
        title: "Uji Tanpa Sesi",
        grade: 3,
        usage_mode: "practice",
      },
    });
    expect([401, 403]).toContain(createQuizResp.status());

    const patchQuizRevResp = await page.request.patch(
      "/api/v1/admin/quiz-revisions/00000000-0000-4000-8000-000000000001",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: {
          title: "Ubah Kuis",
          grade: 3,
          usage_mode: "practice",
          instructions: "",
          questions: [],
        },
      }
    );
    expect([401, 403]).toContain(patchQuizRevResp.status());

    const publishQuizResp = await page.request.post(
      "/api/v1/admin/quiz-revisions/00000000-0000-4000-8000-000000000001/publish",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { confirm_publish: true },
      }
    );
    expect([401, 403]).toContain(publishQuizResp.status());

    const getQuizRevResp = await page.request.get(
      "/api/v1/admin/quiz-revisions/00000000-0000-4000-8000-000000000001"
    );
    expect([401, 403]).toContain(getQuizRevResp.status());
    const getQuizRevText = await getQuizRevResp.text();
    expect(getQuizRevText).not.toContain("correct_choice_id");

    const inviteTeacherResp = await page.request.post("/api/v1/admin/teachers", {
      headers: { "X-CSRF-Token": csrfToken },
      data: {
        email: "guru.uji@sdn1kemiren.sch.id",
        display_name: "Guru Uji",
        school_ids: [],
      },
    });
    expect([401, 403]).toContain(inviteTeacherResp.status());

    const statusTeacherResp = await page.request.post(
      "/api/v1/admin/teachers/00000000-0000-4000-8000-000000000001/status",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: { status: "suspended", reason: "Uji tanpa sesi admin" },
      }
    );
    expect([401, 403]).toContain(statusTeacherResp.status());

    const createSchoolResp = await page.request.post("/api/v1/admin/schools", {
      headers: { "X-CSRF-Token": csrfToken },
      data: { name: "SDN Uji", district_label: "Kec. Glagah, Banyuwangi" },
    });
    expect([401, 403]).toContain(createSchoolResp.status());

    const createSupportResp = await page.request.post(
      "/api/v1/admin/support-access",
      {
        headers: { "X-CSRF-Token": csrfToken },
        data: {
          assignment_id: "00000000-0000-4000-8000-000000000001",
          reason: "Uji tanpa sesi admin",
          duration_minutes: 15,
        },
      }
    );
    expect([401, 403]).toContain(createSupportResp.status());

    const readSupportResp = await page.request.get(
      "/api/v1/admin/support-access/00000000-0000-4000-8000-000000000001/results"
    );
    expect([401, 403]).toContain(readSupportResp.status());
    const readSupportText = await readSupportResp.text();
    expect(readSupportText).not.toContain("Ani");

    const revokeSupportResp = await page.request.post(
      "/api/v1/admin/support-access/00000000-0000-4000-8000-000000000001/revoke",
      {
        headers: { "X-CSRF-Token": csrfToken },
      }
    );
    expect([401, 403]).toContain(revokeSupportResp.status());

    const adminSettingsGetResp = await page.request.get("/api/v1/admin/settings");
    expect([401, 403]).toContain(adminSettingsGetResp.status());

    const adminAuditGetResp = await page.request.get("/api/v1/admin/audit-logs");
    expect([401, 403]).toContain(adminAuditGetResp.status());

    const adminMaintGetResp = await page.request.get("/api/v1/admin/maintenance");
    expect([401, 403]).toContain(adminMaintGetResp.status());

    const adminPurgePostResp = await page.request.post(
      "/api/v1/admin/maintenance/retention-purge",
      {
        headers: { "X-CSRF-Token": csrfToken },
      }
    );
    expect([401, 403]).toContain(adminPurgePostResp.status());

    const adminPrivacyGetResp = await page.request.get(
      "/api/v1/admin/privacy-requests"
    );
    expect([401, 403]).toContain(adminPrivacyGetResp.status());

    // 2. Mengakses /admin dan /admin/konten tanpa login mengalihkan ke /admin/masuk tanpa membocorkan draf
    const masukResp = await page.goto("/admin");
    expect(masukResp).not.toBeNull();
    expect(page.url()).toContain("/admin/masuk");
    expect(masukResp!.headers()["cache-control"]).toContain("no-store");
    expect(masukResp!.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.getByText(/Sarkofagus/i)).toHaveCount(0);

    await page.goto("/admin/konten");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/situs");
    expect(page.url()).toContain("/admin/masuk");
    await expect(page.getByText(/Sarkofagus/i)).toHaveCount(0);

    await page.goto("/admin/media");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/kuis");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/guru");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/sekolah");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/dukungan");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/pengaturan");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/audit");
    expect(page.url()).toContain("/admin/masuk");

    await page.goto("/admin/pemeliharaan");
    expect(page.url()).toContain("/admin/masuk");

    // 3. Masuk via tombol demo lokal menampilkan Ringkasan Portal Admin & navigasi ke /admin/konten tanpa overflow
    await page.getByRole("button", { name: /Masuk Demo Admin Lokal/i }).click();
    await page.waitForURL("**/admin");
    await expect(
      page.getByRole("heading", { name: /Ringkasan Portal Admin/i })
    ).toBeVisible();
    await expect(page.getByText(/Wajib MFA • Cache no-store • Audit Aktif/i)).toBeVisible();

    const overflowOverview = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowOverview, "Overflow horizontal terdeteksi di /admin").toBe(false);

    // Navigasi responsif: lewat popover Menu Admin di mobile-360, atau link sidebar langsung di desktop-1280
    const menuTrigger = page.getByRole("button", { name: /Menu Admin/i });
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Konten & Revisi" })
      .click();
    await page.waitForURL("**/admin/konten");
    await expect(
      page.getByRole("heading", { name: /Daftar Konten & Revisi CMS/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toBeVisible();

    const overflowKonten = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowKonten, "Overflow horizontal terdeteksi di /admin/konten").toBe(false);

    // Filter status 'draft' dan buka editor revisi terstruktur
    await page.getByLabel("Status Revisi").selectOption("draft");
    await page.getByRole("button", { name: "Terapkan" }).click();
    await page.waitForURL("**/admin/konten?*status=draft*");
    await expect(
      page.getByRole("link", {
        name: /\[Draf Internal\] Sarkofagus Belum Clearance Lokasi/i,
      })
    ).toBeVisible();

    await page
      .getByRole("link", {
        name: /\[Draf Internal\] Sarkofagus Belum Clearance Lokasi/i,
      })
      .click();
    await page.waitForURL("**/admin/konten/site-draft-4/revisi/rev-draft-sarkofagus-v1");

    await expect(
      page.getByRole("heading", {
        name: /\[Draf Internal\] Sarkofagus Belum Clearance Lokasi/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Editor Revisi");
    await expect(
      page.getByRole("heading", { name: /Gate Publikasi/i })
    ).toBeVisible();
    await expect(
      page.getByText(/Pratinjau Mode Demo Lokal \(Baca-Saja\)/i)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Terbitkan Revisi ke Publik/i })
    ).toBeDisabled();

    const overflowEditor = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(
      overflowEditor,
      "Overflow horizontal terdeteksi di /admin/konten/[id]/revisi/[rev]"
    ).toBe(false);

    // Buka halaman Situs & Peta Wilayah Umum (Fase 3) melalui menu navigasi admin
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Situs & Peta Umum" })
      .click();
    await page.waitForURL("**/admin/situs");

    await expect(
      page.getByRole("heading", { name: /Situs & Peta Wilayah Umum/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Situs & Peta Umum");
    await expect(
      page.getByText(/Standar Perlindungan Lokasi Cagar Budaya \(SEC-16\)/i)
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /Pratinjau peta skematis perkiraan wilayah umum Banyuwangi/i,
      })
    ).toBeVisible();
    await expect(
      page.getByText(/\[Sampel\] Tinggalan Menhir Wilayah Barat Banyuwangi/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/\[Draf Internal\] Sarkofagus Belum Clearance Lokasi/i).first()
    ).toBeVisible();

    const overflowSitus = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowSitus, "Overflow horizontal terdeteksi di /admin/situs").toBe(
      false
    );

    // Buka halaman Media & Karantina (Fase 4) melalui menu navigasi admin
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Media & Karantina" })
      .click();
    await page.waitForURL("**/admin/media");

    await expect(
      page.getByRole("heading", { name: /Perpustakaan Media & Karantina/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Media & Karantina");
    await expect(
      page.getByText(/Kebijakan Keamanan Unggahan Media \(SEC-17 \/ SEC-19 \/ D4\)/i)
    ).toBeVisible();
    await expect(page.getByText(/foto-survei-menhir-baru\.jpg/i)).toBeVisible();
    await expect(page.getByText(/lkpd-megalitik-kelas-4-draf\.pdf/i)).toBeVisible();
    await expect(page.getByText(/youtube-nocookie\.com/i)).toBeVisible();
    await expect(page.getByText(/Link Eksternal \(0 B\)/i).first()).toBeVisible();

    await page.getByLabel(/Tambah Link Eksternal/i).check();
    await expect(page.getByLabel(/Tautan Media Eksternal/i)).toBeVisible();

    const overflowMedia = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowMedia, "Overflow horizontal terdeteksi di /admin/media").toBe(
      false
    );

    // Buka halaman Bank Kuis (Fase 5) melalui menu navigasi admin
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Bank Kuis" })
      .click();
    await page.waitForURL("**/admin/kuis");

    await expect(
      page.getByRole("heading", { name: /Bank Kuis & Validasi Soal/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Bank Kuis");
    await expect(
      page.getByText(/\[Draf Bank Soal\] Mengenal Batu Kenong Banyuwangi/i)
    ).toBeVisible();
    await expect(
      page.getByText(/latihan-mengenal-megalitik-kelas-3/i)
    ).toBeVisible();

    const overflowQuizList = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(
      overflowQuizList,
      "Overflow horizontal terdeteksi di /admin/kuis"
    ).toBe(false);

    // Buka editor revisi kuis draf & uji deteksi overlap latihan -> tugas serta pratinjau kunci
    await page
      .getByRole("link", { name: /Buka Editor/i })
      .first()
      .click();
    await page.waitForURL("**/admin/kuis/**/revisi/**");

    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Editor Revisi Kuis");
    await expect(
      page.getByText(/Soal Latihan Mandiri Terpakai Ulang di Kuis Tugas/i)
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Daftar Soal & Kunci Jawaban Privat/i })
    ).toBeVisible();

    await page.getByLabel(/Tampilkan Kunci Jawaban & Pembahasan/i).check();
    await expect(page.getByText(/Kunci/i).first()).toBeVisible();

    await expect(
      page.getByRole("heading", { name: /Kesiapan Terbit & Alur Persetujuan/i })
    ).toBeVisible();

    const overflowQuizEditor = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(
      overflowQuizEditor,
      "Overflow horizontal terdeteksi di editor revisi kuis"
    ).toBe(false);

    // Buka halaman Akun Guru & Sekolah (Fase 6)
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Akun Guru" })
      .click();
    await page.waitForURL("**/admin/guru");

    await expect(
      page.getByRole("heading", { name: /Manajemen Akun Guru/i })
    ).toBeVisible();
    await expect(
      page.getByText(/Peran admin tidak dapat diberikan melalui form ini/i)
    ).toBeVisible();
    await expect(page.getByText(/Ibu Sari/i).first()).toBeVisible();
    await expect(page.getByText(/Ibu Dewi/i).first()).toBeVisible();

    const overflowTeachers = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowTeachers, "Overflow horizontal terdeteksi di /admin/guru").toBe(
      false
    );

    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Sekolah" })
      .click();
    await page.waitForURL("**/admin/sekolah");

    await expect(
      page.getByRole("heading", { name: /Daftar Sekolah Terdaftar/i })
    ).toBeVisible();
    await expect(page.getByText(/SDN 1 Kemiren/i).first()).toBeVisible();
    await expect(page.getByText(/SDN 4 Rogojampi/i).first()).toBeVisible();

    const overflowSchools = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowSchools, "Overflow horizontal terdeteksi di /admin/sekolah").toBe(
      false
    );

    // Buka halaman Mode Dukungan Data Siswa (Fase 7) melalui menu navigasi admin
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Mode Dukungan" })
      .click();
    await page.waitForURL("**/admin/dukungan");

    await expect(
      page.getByRole("heading", { name: /Mode Dukungan Data Siswa/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Mode Dukungan");
    await expect(
      page.getByText(/Perlindungan Data Anak & Tanpa Ekspor Massal/i)
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", {
        name: /Latihan Tugas Kelas III: Mengenal Megalitik/i,
      }).first()
    ).toBeVisible();

    const overflowSupport = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowSupport, "Overflow horizontal terdeteksi di /admin/dukungan").toBe(
      false
    );

    // Buka halaman Pengaturan Situs (Fase 8)
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Pengaturan" })
      .click();
    await page.waitForURL("**/admin/pengaturan");

    await expect(
      page.getByRole("heading", { name: /Pengaturan Situs & Kontak Privasi/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Pengaturan");
    await expect(
      page.getByRole("button", { name: /Simpan Pengaturan Situs/i })
    ).toBeDisabled();

    const overflowSettings = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(
      overflowSettings,
      "Overflow horizontal terdeteksi di /admin/pengaturan"
    ).toBe(false);

    // Buka halaman Log Audit (Fase 8)
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Log Audit" })
      .click();
    await page.waitForURL("**/admin/audit");

    await expect(
      page.getByRole("heading", { name: /Log Audit Portal Admin/i })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Log Audit");
    await expect(
      page.getByRole("button", { name: /Terapkan Filter/i })
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: /publish_content_revision/i }).first()
    ).toBeVisible();

    const overflowAudit = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowAudit, "Overflow horizontal terdeteksi di /admin/audit").toBe(
      false
    );

    // Buka halaman Pemeliharaan, Retensi & Permintaan Privasi (Fase 8)
    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
    }
    await page
      .getByRole("navigation", { name: "Navigasi Portal Admin" })
      .getByRole("link", { name: "Pemeliharaan" })
      .click();
    await page.waitForURL("**/admin/pemeliharaan");

    await expect(
      page.getByRole("heading", {
        name: /Pemeliharaan, Retensi & Permintaan Privasi/i,
      })
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumbs" })
    ).toContainText("Pemeliharaan");
    await expect(
      page.getByRole("rowheader", { name: /retention_purge/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("rowheader", { name: /SRT-PRIV-2026-004/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Buka Pengaturan Backup Supabase/i })
    ).toBeVisible();

    const overflowMaint = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(
      overflowMaint,
      "Overflow horizontal terdeteksi di /admin/pemeliharaan"
    ).toBe(false);

    await page.getByRole("button", { name: /Keluar Admin/i }).click();
    await page.waitForURL("**/admin/masuk");

    await page.goto("/admin");
    expect(page.url()).toContain("/admin/masuk");
  });
});
