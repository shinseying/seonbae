import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy tutor entry pages redirect to account-backed signup", async () => {
  const { default: config } = await import("../next.config.mjs");
  const redirects = await config.redirects();
  const bySource = new Map(redirects.map((rule) => [rule.source, rule.destination]));

  assert.equal(bySource.get("/become-a-tutor"), "/login?mode=signup&role=tutor");
  assert.equal(bySource.get("/en/become-a-tutor"), "/login?mode=signup&role=tutor&lang=en");
  assert.equal(bySource.get("/tutor-apply"), "/login?mode=signup&role=tutor");
});

test("legacy application POST is retired but historical PATCH remains", async () => {
  const source = await readFile(new URL("../app/api/tutor-applications/route.ts", import.meta.url), "utf8");
  assert.match(source, /export async function POST\(\)/);
  assert.match(source, /status: 410/);
  assert.match(source, /destination: "\/login\?mode=signup&role=tutor"/);
  assert.match(source, /export async function PATCH\(request: NextRequest\)/);
  assert.doesNotMatch(source, /request\.formData\(\)/);
});

test("redirected tutor application page is omitted from sitemap", async () => {
  const source = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /path: "\/become-a-tutor"/);
});

test("the legacy English redirect explicitly initializes the signup locale", async () => {
  const source = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const requestedLanguage = params\.get\("lang"\)/);
  assert.match(source, /setSeonbaeLocale\(requestedLanguage\)/);
});
