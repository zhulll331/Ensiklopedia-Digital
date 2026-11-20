import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export function computeSha256Hex(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface ScrubbedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  mime: "image/webp";
  sha256: string;
}

/**
 * Mengonversi gambar karantina ke WebP bersih tanpa metadata EXIF/GPS/XMP (SEC-17).
 * Orientasi EXIF diterapkan otomatis lewat `.rotate()` sebelum seluruh metadata dihapus.
 */
export async function scrubImageToWebp(
  inputBuffer: Buffer
): Promise<ScrubbedImageResult> {
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });

  const width = info.width && info.width > 0 ? info.width : 1;
  const height = info.height && info.height > 0 ? info.height : 1;

  return {
    buffer: data,
    width,
    height,
    mime: "image/webp",
    sha256: computeSha256Hex(data),
  };
}
