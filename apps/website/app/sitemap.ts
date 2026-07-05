import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://getbookmark.app/", priority: 1 },
    { url: "https://getbookmark.app/get-started/", priority: 0.8 },
  ];
}
