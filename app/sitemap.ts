import type { MetadataRoute } from "next";

const PAGES = ["", "/advisor", "/land", "/market", "/trends", "/methods", "/land/faisalabad", "/land/sheikhupura", "/land/gujranwala", "/land/hafizabad", "/land/okara", "/land/multan"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return ["en", "ur"].flatMap((l) => PAGES.map((p) => ({ url: `${base}/${l}${p}`, changeFrequency: "daily" as const })));
}
