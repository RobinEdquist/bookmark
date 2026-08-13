/* eslint-disable no-undef */
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  rewrites() {
    return [
      {
        // Exclude /api/events - handled by route handler for SSE streaming
        source: "/api/:path((?!events).*)",
        destination: `${process.env.API_URL}/api/:path*`,
      },
    ];
  },
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Baseline browser hardening (SECURITY-REVIEW SAV-10). The CSP is
          // deliberately minimal so it cannot break Next.js hydration or the
          // blob:-based ebook reader: object-src blocks plugin content
          // (including inside reader iframes, which inherit this policy for
          // blob: documents), base-uri blocks <base> hijacks, and
          // frame-ancestors limits clickjacking. HSTS is left to the
          // TLS-terminating reverse proxy, which knows whether HTTPS is on.
          {
            key: "Content-Security-Policy",
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
