import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { neutralizeCsvCell } from "@/lib/server/crypto";

describe("Netralisasi formula CSV (SEC-22 / AT-16)", () => {
  it("menambahkan awalan kutip tunggal pada karakter pemicu formula", () => {
    expect(neutralizeCsvCell("=CMD()")).toBe(`"'=CMD()"`);
    expect(neutralizeCsvCell("+SUM(A1:A2)")).toBe(`"'+SUM(A1:A2)"`);
    expect(neutralizeCsvCell("-1+1")).toBe(`"'-1+1"`);
    expect(neutralizeCsvCell("@import")).toBe(`"'@import"`);
    expect(neutralizeCsvCell("\tcmd")).toBe(`"'\tcmd"`);
  });

  it("mengamankan tanda kutip ganda di dalam nama", () => {
    expect(neutralizeCsvCell('Siti "Ani"')).toBe(`"Siti ""Ani"""`);
  });

  it("membiarkan teks biasa tetap bersih dalam tanda kutip", () => {
    expect(neutralizeCsvCell("Budi Santoso")).toBe(`"Budi Santoso"`);
  });
});
