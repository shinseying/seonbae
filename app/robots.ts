import type { MetadataRoute } from "next";

const siteUrl = "https://www.seonbaetutor.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // `/api/tutors` has to stay crawlable even though the rest of `/api/` is
      // closed: the homepage and `/tutors` fetch it on the client to draw the
      // tutor directory, so blocking it leaves a crawler with an empty grid.
      // Google resolves a conflict by the longest matching path, so the
      // specific Allow beats the `/api/` Disallow. The route answers with
      // `X-Robots-Tag: noindex` so the JSON itself stays out of the index.
      allow: ["/", "/api/tutors"],
      disallow: ["/admin/", "/api/", "/portal/", "/login", "/signup", "/reset-password", "/my-page"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
