import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static-friendly CSP (no nonces, so pages stay prerendered — see docs/ARCHITECTURE.md).
// Only first-party scripts; map tiles from Esri; all data APIs are called from the server.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://server.arcgisonline.com https://services.arcgisonline.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite is only used in local development (no DATABASE_URL); never bundle it into server functions
  serverExternalPackages: ["@electric-sql/pglite"],
  // the engine reads the generated NASA datasets from disk at runtime
  outputFileTracingIncludes: {
    "/api/**": ["./data/generated/**/*"],
    "/[lang]/**": ["./data/generated/**/*"],
  },
  outputFileTracingExcludes: {
    "*": ["./pipeline/**/*", "./tests/**/*", "./presentation/**/*", "./.data/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the API serves this site only: no Access-Control-Allow-Origin header is sent, so other origins are blocked
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
