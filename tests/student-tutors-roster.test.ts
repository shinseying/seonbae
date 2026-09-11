import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("student tutor cards display canonical roster numbers", async () => {
  const source = await readFile(
    new URL("../app/portal/tutors/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /tutors\(name,university,photo_url,exam,score,roster_number\)/);
  assert.match(source, /rosterNumber: tutor\?\.roster_number \|\| null/);
  assert.match(source, /<small>\{tutor\.rosterNumber \|\|/);
  assert.doesNotMatch(source, /<small>\{tutor\.registryId\}<\/small>/);
});

test("admin contract lookup has an application and signed-time index", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260912121000_tutor_signup_details_documents.sql", import.meta.url),
    "utf8",
  );

  assert.match(
    migration,
    /on public\.tutor_contract_signatures \(application_request_id, signed_at desc\)/,
  );
});
