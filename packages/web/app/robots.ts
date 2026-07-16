import type { MetadataRoute } from "next";

const SITE_URL = "https://openllmrank.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private funnel and app routes — no SEO value, keep out of the index.
      disallow: ["/api/", "/wizard/", "/checkout/", "/reports/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
