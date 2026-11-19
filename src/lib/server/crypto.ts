import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

export function hashSha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Menetralkan potensi CSV formula injection (=, +, -, @, tab, CR)
 * sesuai SEC-22 dan kebutuhan ekspor guru pada 06_KEAMANAN_DAN_PRIVASI.md.
 */
export function neutralizeCsvCell(rawValue: string | number | null | undefined): string {
  if (rawValue === null || rawValue === undefined) {
    return "";
  }
  const text = String(rawValue);
  const needsFormulaGuard = /^[=+\-@\t\r]/.test(text);
  const safeText = needsFormulaGuard ? `'${text}` : text;
  const escaped = safeText.replace(/"/g, '""');
  return `"${escaped}"`;
}
