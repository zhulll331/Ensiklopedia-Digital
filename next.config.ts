import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    const baseSecurityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    const noStoreHeaders = [
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];

    return [
      {
        source: "/(.*)",
        headers: [
          ...baseSecurityHeaders,
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/tugas/:path*",
        headers: [
          ...noStoreHeaders,
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/tugas",
        headers: [
          ...noStoreHeaders,
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/guru/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/guru",
        headers: noStoreHeaders,
      },
      {
        source: "/admin/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/admin",
        headers: noStoreHeaders,
      },
      {
        source: "/api/v1/guest/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/api/v1/teacher/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/api/v1/admin/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/api/v1/security/:path*",
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
