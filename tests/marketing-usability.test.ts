import assert from "node:assert/strict";
import test from "node:test";
import { curriculumSlugs, isCurriculumSlug, rateBySlug, rates } from "../marketing/src/data/rates.ts";

test("the canonical rate catalogue has stable unique links for all 125 subjects", () => {
  assert.equal(rates.length, 125);
  assert.equal(new Set(rates.map((rate) => rate.slug)).size, rates.length);
  for (const rate of rates) {
    assert.match(rate.slug, new RegExp(`^${rate.curriculum}--[a-z0-9-]+$`));
    assert.equal(rateBySlug(rate.slug), rate);
  }
});

test("curriculum query values are accepted only from the canonical set", () => {
  for (const slug of curriculumSlugs) assert.equal(isCurriculumSlug(slug), true);
  assert.equal(isCurriculumSlug("ib"), false);
  assert.equal(isCurriculumSlug("<script>"), false);
  assert.equal(isCurriculumSlug(null), false);
});

test("Korean and alternate-spelling searches are represented in rate aliases", () => {
  const searchable = (query: string) => rates.filter((rate) =>
    `${rate.name} ${rate.nameKo || ""} ${rate.aliases.join(" ")}`.toLowerCase().includes(query.toLowerCase()));

  for (const query of ["물리", "수학", "화학", "미적분", "경제"]) {
    assert.ok(searchable(query).length > 0, `${query} should return subjects`);
  }
  assert.deepEqual(
    searchable("maths").map((rate) => rate.slug),
    searchable("mathematics").map((rate) => rate.slug),
  );
});
