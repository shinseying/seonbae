import type { MetadataRoute } from "next";

// The apex domain redirects to www in production. Keep every sitemap URL on
// the canonical host so Search Console does not have to resolve redirects.
const siteUrl = "https://www.seonbaetutor.com";

const publicPages: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/tutors", changeFrequency: "weekly", priority: 0.9 },
  { path: "/subjects", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/get-matched", changeFrequency: "monthly", priority: 0.8 },
  { path: "/mock-exams", changeFrequency: "monthly", priority: 0.7 },
  { path: "/resources", changeFrequency: "weekly", priority: 0.8 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/verification", changeFrequency: "monthly", priority: 0.6 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

const subjectPages = [
  "a-level",
  "advanced-placement",
  "english-writing",
  "ib-diploma",
  "igcse",
  "standardized-tests",
];

const resourcePages = [
  "build-study-routine",
  "first-session",
  "homework-support",
  "igcse-to-ib",
  "sat-reading",
  "studying-abroad-korean",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const localizedEntries = (
    path: string,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: number,
  ): MetadataRoute.Sitemap => {
    const koPath = path;
    const enPath = path === "/" ? "/en/" : `/en${path}`;
    const languages = {
      ko: new URL(koPath, siteUrl).toString(),
      en: new URL(enPath, siteUrl).toString(),
      "x-default": new URL(koPath, siteUrl).toString(),
    };
    return [
      { url: languages.ko, lastModified, changeFrequency, priority, alternates: { languages } },
      { url: languages.en, lastModified, changeFrequency, priority, alternates: { languages } },
    ];
  };

  return [
    ...publicPages.flatMap(({ path, changeFrequency, priority }) => localizedEntries(path, changeFrequency, priority)),
    ...subjectPages.flatMap((slug) => localizedEntries(`/subjects/${slug}`, "monthly", 0.7)),
    ...resourcePages.flatMap((slug) => localizedEntries(`/resources/${slug}`, "monthly", 0.7)),
  ];
}
