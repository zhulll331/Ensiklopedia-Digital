import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BANYUWANGI_AREA_PRESETS,
  hasAtMostTwoDecimalDigitsString,
  hasAtMostTwoDecimals,
  isWithinBanyuwangiRoughBounds,
  mapSiteLocationPostgresError,
  projectBanyuwangiSchematic,
  roundCoarseCoordinate,
  upsertSiteLocationSchema,
} from "@/modules/admin/site-location";

const VALID_REVIEW_UUID = "11111111-1111-4111-8111-111111111111";

describe("Utilitas & Validasi Lokasi Wilayah Umum (SEC-16)", () => {
  it("memvalidasi batas maksimal 2 desimal dan pembulatan koordinat kasar", () => {
    expect(hasAtMostTwoDecimals(-8.22)).toBe(true);
    expect(hasAtMostTwoDecimals(114.21)).toBe(true);
    expect(hasAtMostTwoDecimals(-8.2)).toBe(true);
    expect(hasAtMostTwoDecimals(-8.221)).toBe(false);
    expect(hasAtMostTwoDecimals(114.2156)).toBe(false);

    expect(hasAtMostTwoDecimalDigitsString("-8.22")).toBe(true);
    expect(hasAtMostTwoDecimalDigitsString("114")).toBe(true);
    expect(hasAtMostTwoDecimalDigitsString("-8.221")).toBe(false);
    expect(hasAtMostTwoDecimalDigitsString("114.215")).toBe(false);
    expect(hasAtMostTwoDecimalDigitsString("abc")).toBe(false);

    expect(roundCoarseCoordinate(-8.2249)).toBe(-8.22);
    expect(roundCoarseCoordinate(114.216)).toBe(114.22);
    expect(roundCoarseCoordinate(-0.001)).toBe(0);
  });

  it("memeriksa jangkauan kasar Banyuwangi dan proyeksi SVG dalam batas kanvas", () => {
    for (const preset of BANYUWANGI_AREA_PRESETS) {
      expect(hasAtMostTwoDecimals(preset.display_lat)).toBe(true);
      expect(hasAtMostTwoDecimals(preset.display_lon)).toBe(true);
      expect(
        isWithinBanyuwangiRoughBounds(preset.display_lat, preset.display_lon)
      ).toBe(true);
      const { x, y } = projectBanyuwangiSchematic(
        preset.display_lat,
        preset.display_lon
      );
      expect(x).toBeGreaterThanOrEqual(60);
      expect(x).toBeLessThanOrEqual(540);
      expect(y).toBeGreaterThanOrEqual(50);
      expect(y).toBeLessThanOrEqual(340);
    }

    expect(isWithinBanyuwangiRoughBounds(-6.2, 106.8)).toBe(false);
  });

  it("menolak koordinat > 2 desimal, zoom > 13, serta field terlarang pada upsertSiteLocationSchema", () => {
    const valid = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi (Perkiraan Kecamatan)",
      display_lat: -8.22,
      display_lon: 114.21,
      precision_label: "Perkiraan wilayah umum",
      display_zoom_max: 11,
      clearance_review_id: VALID_REVIEW_UUID,
    });
    expect(valid.success).toBe(true);

    const tooPreciseLat = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi",
      display_lat: -8.225,
      display_lon: 114.21,
      display_zoom_max: 11,
      clearance_review_id: VALID_REVIEW_UUID,
    });
    expect(tooPreciseLat.success).toBe(false);

    const tooPreciseLon = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi",
      display_lat: -8.22,
      display_lon: 114.2134,
      display_zoom_max: 11,
      clearance_review_id: VALID_REVIEW_UUID,
    });
    expect(tooPreciseLon.success).toBe(false);

    const zoomTooHigh = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi",
      display_lat: -8.22,
      display_lon: 114.21,
      display_zoom_max: 14,
      clearance_review_id: VALID_REVIEW_UUID,
    });
    expect(zoomTooHigh.success).toBe(false);

    const zoomTooLow = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi",
      display_lat: -8.22,
      display_lon: 114.21,
      display_zoom_max: 7,
      clearance_review_id: VALID_REVIEW_UUID,
    });
    expect(zoomTooLow.success).toBe(false);

    const illegalExtraField = upsertSiteLocationSchema.safeParse({
      area_label: "Wilayah Barat Banyuwangi",
      display_lat: -8.22,
      display_lon: 114.21,
      display_zoom_max: 11,
      clearance_review_id: VALID_REVIEW_UUID,
      exact_lat: -8.224819,
    });
    expect(illegalExtraField.success).toBe(false);
  });

  it("memetakan error SQL 0013 ke DomainError informatif dan menjaga paritas dengan migrasi SQL", () => {
    const preciseErr = mapSiteLocationPostgresError({
      message: "VALIDATION_FAILED:COORDINATES_TOO_PRECISE",
    });
    expect(preciseErr?.status).toBe(422);
    expect(preciseErr?.message).toContain("SEC-16");

    const reviewErr = mapSiteLocationPostgresError({
      message: "VALIDATION_FAILED:INVALID_CLEARANCE_REVIEW",
    });
    expect(reviewErr?.status).toBe(422);
    expect(reviewErr?.message).toContain("location");

    const sqlPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "0013_admin_site_locations_rpcs.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf8");
    expect(sql).toContain("COORDINATES_TOO_PRECISE");
    expect(sql).toContain("INVALID_CLEARANCE_REVIEW");
    expect(sql).toContain("NOT_A_SITE");
    expect(sql).toContain("STATE_CONFLICT:IMMUTABLE");
    expect(sql).toContain("p_display_zoom_max < 8 or p_display_zoom_max > 13");
  });
});
