import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectApplicationDocumentPaths } from "../utils/tutors/application-documents.ts";

test("application cleanup combines normalized and legacy paths without duplicates", () => {
  const paths = collectApplicationDocumentPaths(
    {
      acceptance_letter_path: "user/school.pdf",
      credential_path: "user/score.pdf",
    },
    [
      { storage_path: "user/school.pdf" },
      { storage_path: "user/score-2.png" },
      { storage_path: " " },
      { storage_path: null },
    ],
  );

  assert.deepEqual(paths, [
    "user/school.pdf",
    "user/score.pdf",
    "user/score-2.png",
  ]);
});

test("admin deletion preserves the request when document discovery or cleanup fails", async () => {
  const source = await readFile(
    new URL("../app/api/admin/applications/route.ts", import.meta.url),
    "utf8",
  );

  const normalizedLookup = source.indexOf('.from("account_request_documents")');
  const storageRemoval = source.indexOf('.from("account-documents")\n      .remove(documentPaths)');
  const databaseDeletion = source.indexOf('.from("account_creation_requests").delete()');

  assert.ok(normalizedLookup >= 0, "normalized document paths must be fetched");
  assert.ok(storageRemoval > normalizedLookup, "storage cleanup must follow path discovery");
  assert.ok(databaseDeletion > storageRemoval, "database deletion must wait for storage cleanup");
  assert.match(source, /normalizedDocuments\.error && !isMissingDocumentsRelation/);
  assert.match(source, /if \(storageError\) \{[\s\S]*?신청 기록을 유지했습니다/);
});
