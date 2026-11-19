import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputDir = path.join(root, "public", "images", "logos");
fs.mkdirSync(outputDir, { recursive: true });

// Penamaan tanpa underscore sesuai panduan aksesibilitas (gunakan tanda hubung)
const jobs = [
  {
    src: "LOGO KEMENBUD/PNG 01/KEMENKEBUD LOGO 01 (COLOR).png",
    dest: "kemenbud-01-color.webp",
  },
  {
    src: "LOGO KEMENBUD/PNG 01/KEMENKEBUD LOGO 01 (WHITE).png",
    dest: "kemenbud-01-white.webp",
  },
  {
    src: "LOGO KEMENBUD/PNG 01/KEMENKEBUD LOGO 01 (BLACK).png",
    dest: "kemenbud-01-black.webp",
  },
  {
    src: "LOGO KEMENBUD/PNG 02/KEMENKEBUD LOGO 02 (COLOR).png",
    dest: "kemenbud-02-color.webp",
  },
  {
    src: "LOGO KEMENBUD/PNG 02/KEMENKEBUD LOGO 02 (WHITE).png",
    dest: "kemenbud-02-white.webp",
  },
  {
    src: "LOGO KEMENBUD/PNG 02/KEMENKEBUD LOGO 02 (BLACK).png",
    dest: "kemenbud-02-black.webp",
  },
  {
    src: "LOGO LPDP/LPDP (COLORWHITE).png",
    dest: "lpdp-color-white.webp",
  },
  {
    src: "LOGO LPDP/LPDP (COLORBLACK).png",
    dest: "lpdp-color-black.webp",
  },
  {
    src: "LOGO LPDP/LPDP (WHITE).png",
    dest: "lpdp-white.webp",
  },
  {
    src: "LOGO LPDP/LPDP (BLACK).png",
    dest: "lpdp-black.webp",
  },
  {
    src: "LOGO DANA INDONESIARAYA/logo Warna.png",
    dest: "dana-indonesiana-color.webp",
  },
  {
    src: "LOGO DANA INDONESIARAYA/logo putih.png",
    dest: "dana-indonesiana-white.webp",
  },
];

const results = [];

for (const job of jobs) {
  const srcPath = path.join(root, job.src);
  const destPath = path.join(outputDir, job.dest);
  const srcBytes = fs.statSync(srcPath).size;

  const info = await sharp(srcPath)
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(destPath);

  results.push({
    file: job.dest,
    width: info.width,
    height: info.height,
    srcKB: (srcBytes / 1024).toFixed(1),
    webpKB: (info.size / 1024).toFixed(1),
  });
}

console.table(results);
