import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isMissingDocumentsRelation,
  mergeTutorDocumentRecords,
  readContractSnapshot,
  readSubjectScores,
} from "../utils/tutors/admin-details.ts";

test("normalized tutor documents keep every file and deduplicate legacy mirrors", () => {
  const documents = mergeTutorDocumentRecords([
    {
      kind: "school_proof",
      storage_path: "user/school-1.pdf",
      original_name: "school-1.pdf",
      mime_type: "application/pdf",
      size_bytes: 1234,
      created_at: "2026-09-12T00:00:00Z",
    },
    {
      kind: "credential",
      storage_path: "user/score-1.pdf",
      original_name: "score-1.pdf",
      mime_type: "application/pdf",
      size_bytes: 5678,
      created_at: "2026-09-12T00:00:01Z",
    },
  ], [
    { kind: "school_proof", path: "user/school-1.pdf", name: "legacy-school.pdf" },
    { kind: "credential", path: "user/legacy-score.png", name: "legacy-score.png" },
  ]);

  assert.deepEqual(documents.map((document) => document.storage_path), [
    "user/school-1.pdf",
    "user/score-1.pdf",
    "user/legacy-score.png",
  ]);
  assert.equal(documents[0].original_name, "school-1.pdf");
});

test("legacy singular document columns remain viewable before document migration", () => {
  const documents = mergeTutorDocumentRecords([], [
    { kind: "school_proof", path: "legacy/enrollment.pdf", name: null },
    { kind: "credential", path: null, name: null },
  ]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].original_name, "학적증명서");
  assert.equal(isMissingDocumentsRelation({ code: "PGRST205" }), true);
});

test("stored contract snapshot and complete subject scores are rendered as signed", () => {
  assert.deepEqual(readSubjectScores([
    { subject: "IB Physics HL", score: "7" },
    { subject: "", score: "6" },
  ]), [{ subject: "IB Physics HL", score: "7" }]);

  const snapshot = readContractSnapshot({
    title: "Versioned contract",
    intro: "Terms at signing time",
    clauses: [{ title: "Clause 1", paragraphs: ["Stored text"] }],
    company: { legalName: "Seonbae" },
  });
  assert.equal(snapshot.title, "Versioned contract");
  assert.deepEqual(snapshot.clauses[0], { title: "Clause 1", paragraphs: ["Stored text"] });
  assert.deepEqual(snapshot.company, [["legalName", "Seonbae"]]);
});

test("admin contract query never selects connection audit hashes", async () => {
  const [source, listSource, nextConfig] = await Promise.all([
    readFile(new URL("../app/admin/tutor-details/[requestId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/tutor-details/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(source, /ip_address_hash|user_agent_hash/);
  assert.match(source, /contract_snapshot/);
  assert.match(source, /createSignedUrl\([^,]+, 10 \* 60\)/);
  assert.match(source, /referrerPolicy="no-referrer"/);
  assert.match(nextConfig, /\/admin\/tutor-details\/:path\*/);
  assert.match(nextConfig, /Referrer-Policy.*no-referrer/);
  assert.match(source, /select\("registry_id,roster_number,name,university,active"\)/);
  assert.match(source, /label="명부 번호"[\s\S]+?tutorCard\?\.roster_number/);
  assert.match(source, /label="연결 카드 명부 번호"/);
  assert.match(listSource, /select\("registry_id,roster_number"\)/);
  assert.match(listSource, /<dt>명부 번호<\/dt>/);
});
