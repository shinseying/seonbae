import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("application review and archive display canonical roster numbers", async () => {
  const [reviewPage, reviewClient, archivePage, archiveClient] = await Promise.all([
    source("../app/admin/applications/page.tsx"),
    source("../app/admin/applications/ApplicationReviewClient.tsx"),
    source("../app/admin/applications/completed/page.tsx"),
    source("../app/admin/applications/completed/CompletedApplicationList.tsx"),
  ]);

  assert.match(reviewPage, /tutor_roster_number:/);
  assert.match(reviewClient, /item\.tutor_roster_number \|\| "명부 번호 준비 중"/);
  assert.doesNotMatch(reviewClient, /연결된 튜터 카드 · \{item\.tutor_registry_id\}/);
  assert.match(archivePage, /select\("registry_id,roster_number"\)/);
  assert.match(archiveClient, /명부 \{item\.rosterNumber \|\| "번호 준비 중"\} 보기/);
});

test("request queues display roster numbers without exposing registry keys", async () => {
  const [cardPage, cardList, slotPage, slotList] = await Promise.all([
    source("../app/admin/card-requests/page.tsx"),
    source("../app/admin/card-requests/CardRequestList.tsx"),
    source("../app/admin/classroom-slots/page.tsx"),
    source("../app/admin/classroom-slots/SlotRequestList.tsx"),
  ]);

  assert.match(cardPage, /select\("registry_id,roster_number,name"\)/);
  assert.doesNotMatch(cardList, /item\.registryId/);
  assert.match(cardList, /item\.rosterNumber/);
  assert.match(slotPage, /select\("registry_id,roster_number,name,classroom_limit"\)/);
  assert.doesNotMatch(slotList, /request\.registryId/);
  assert.match(slotList, /request\.rosterNumber/);
});

test("session and booking labels include canonical roster numbers", async () => {
  const [sessionPage, sessionClient, bookingsPage, tutorAccounts] = await Promise.all([
    source("../app/admin/sessions/page.tsx"),
    source("../app/admin/sessions/AdminSessionManager.tsx"),
    source("../app/admin/bookings/page.tsx"),
    source("../app/admin/tutor-accounts/TutorAccountCreator.tsx"),
  ]);

  assert.match(sessionPage, /select\("registry_id,roster_number,name,exam,zoom_host_email,active"\)/);
  assert.match(sessionClient, /tutor\.roster_number \|\| "명부 번호 준비 중"/);
  assert.match(bookingsPage, /select\("registry_id,roster_number,name"\)/);
  assert.match(bookingsPage, /row\.roster_number \|\| "명부 번호 준비 중"/);
  assert.doesNotMatch(bookingsPage, /\|\| row\.tutor_registry_id/);
  assert.match(tutorAccounts, /linkedRosterNumber \|\| "명부 번호 준비 중"/);
  assert.doesNotMatch(tutorAccounts, /\$\{result\.registryId \|\| linkedRegistryId\}/);
});
