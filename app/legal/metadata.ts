import type { Metadata } from "next";

type LegalMetadataOptions = {
  title: string;
  description: string;
  canonical: string;
  koPath: string;
  enPath: string;
  locale: "ko" | "en";
};

export function legalMetadata({
  title,
  description,
  canonical,
  koPath,
  enPath,
  locale,
}: LegalMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { ko: koPath, en: enPath, "x-default": koPath },
    },
    openGraph: {
      type: "website",
      siteName: "Seonbae",
      title,
      description,
      url: canonical,
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [locale === "ko" ? "en_US" : "ko_KR"],
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Seonbae", type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}
