import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const plusJakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});

const nunitoSans = localFont({
  src: "../../node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2",
  variable: "--font-nunito",
  weight: "200 900",
  display: "swap",
});

const caveat = localFont({
  src: "../../node_modules/@fontsource/caveat/files/caveat-latin-600-normal.woff2",
  variable: "--font-caveat",
  weight: "600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ensiklopedia Digital Megalitik Banyuwangi (EDMB)",
  description:
    "Web-app ensiklopedia edukasi budaya megalitik Banyuwangi untuk siswa SD kelas III-IV dan guru.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${nunitoSans.variable} ${caveat.variable}`}
    >
      <head>
        {/* Mengizinkan skala teks OS pengguna bekerja pada rem/em (respect-os-text-scale) */}
        <meta name="text-scale" content="scale" />
      </head>
      <body>{children}</body>
    </html>
  );
}
