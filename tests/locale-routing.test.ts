import assert from "node:assert/strict";
import test from "node:test";
import { pairedPage, pathInLocale, routeLocale } from "../utils/i18n/locale-routing.ts";

const get = (pathname: string, search = "", cookie?: string) =>
  routeLocale({ method: "GET", pathname, search, cookie });

test("pairs marketing and legal pages with their English twins", () => {
  assert.deepEqual(pairedPage("/"), { locale: "ko", plain: "/" });
  assert.deepEqual(pairedPage("/en"), { locale: "en", plain: "/" });
  assert.deepEqual(pairedPage("/en/subjects/ib"), { locale: "en", plain: "/subjects/ib" });
  assert.deepEqual(pairedPage("/privacy"), { locale: "ko", plain: "/privacy" });
  assert.equal(pairedPage("/portal"), null);
  assert.equal(pairedPage("/login"), null);
  assert.equal(pairedPage("/english"), null);
  assert.equal(pathInLocale("/", "en"), "/en");
  assert.equal(pathInLocale("/tutors", "en"), "/en/tutors");
  assert.equal(pathInLocale("/tutors", "ko"), "/tutors");
});

test("a stored choice moves a page to its twin and keeps the query", () => {
  assert.deepEqual(get("/", "", "en"), { redirectTo: "/en" });
  assert.deepEqual(get("/tutors", "?q=IB", "en"), { redirectTo: "/en/tutors?q=IB" });
  assert.deepEqual(get("/en/tutors", "", "ko"), { redirectTo: "/tutors" });
  assert.deepEqual(get("/en/privacy", "", "ko"), { redirectTo: "/privacy" });
});

test("a page already in the chosen language is left alone", () => {
  assert.deepEqual(get("/en/tutors", "", "en"), {});
  assert.deepEqual(get("/tutors", "", "ko"), {});
});

test("with no choice the URL decides and nothing is stored", () => {
  assert.deepEqual(get("/en/tutors", "", undefined), {});
  assert.deepEqual(get("/", "", undefined), {});
  assert.deepEqual(get("/", "", "fr"), {});
});

test("?lang= is stored, wins over the cookie, and is stripped", () => {
  assert.deepEqual(get("/tutors", "?lang=en", "ko"), { redirectTo: "/en/tutors", remember: "en" });
  assert.deepEqual(get("/en/tutors", "?lang=ko&c=ib", "en"), { redirectTo: "/tutors?c=ib", remember: "ko" });
  assert.deepEqual(get("/en/tutors", "?lang=en", "en"), { redirectTo: "/en/tutors", remember: "en" });
});

test("pages without a twin only store an explicit choice", () => {
  assert.deepEqual(get("/login", "?mode=signup&lang=en", "ko"), { remember: "en" });
  assert.deepEqual(get("/portal", "", "en"), {});
});

test("API calls, assets and writes are never redirected", () => {
  assert.deepEqual(get("/api/tutors", "?lang=en", "ko"), {});
  assert.deepEqual(get("/_next/data/x.json", "", "en"), {});
  assert.deepEqual(routeLocale({ method: "POST", pathname: "/", search: "", cookie: "en" }), {});
});
