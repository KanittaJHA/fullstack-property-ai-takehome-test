import type { NextConfig } from "next";
import path from "node:path";

// Sent with every page. A full Content-Security-Policy would also need nonces for Next.js inline scripts;
// frame-ancestors alone stops other sites from framing these pages (clickjacking).
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Ignored by browsers over plain HTTP (local development); applies once the site is served over HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Allow the backend DB lookup and 45-second model timeout to finish.
  experimental: { proxyTimeout: 65000 },
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${backend}/:path*` },
      { source: "/listings", destination: `${backend}/listings` },
      { source: "/match", destination: `${backend}/match` },
    ];
  },
  turbopack: {
    root: path.resolve(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
