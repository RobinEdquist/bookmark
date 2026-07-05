import type { NextConfig } from "next";

// Set when the site is served from a sub-path (e.g. WEBSITE_BASE_PATH=/bookmark
// for <user>.github.io/bookmark). Leave unset for a custom domain.
const basePath = process.env.WEBSITE_BASE_PATH;

const nextConfig: NextConfig = {
  // The marketing site is fully static so it can be hosted anywhere
  // (GitHub Pages, any static file server, a $0 CDN).
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
