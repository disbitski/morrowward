import type { MetadataRoute } from "next";

const allowSearchIndexing =
  process.env.NEXT_PUBLIC_ALLOW_INDEXING?.trim().toLowerCase() === "true";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: allowSearchIndexing
      ? {
          userAgent: "*",
          allow: "/",
          disallow: "/api/",
        }
      : {
          userAgent: "*",
          disallow: "/",
        },
  };
}
