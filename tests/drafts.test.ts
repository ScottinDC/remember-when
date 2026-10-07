import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readDraft, saveDraft, deleteDraft } from "../src/lib/drafts.ts";
test("stopped drafts survive reopen and a queued delete cannot be undone by a late save", async () => {
  await saveDraft(
    "thread:question",
    new Blob(["recording"], { type: "audio/webm" }),
    12,
  );
  const draft = await readDraft("thread:question");
  assert.equal(await draft?.blob.text(), "recording");
  assert.equal(draft?.blob.type, "audio/webm");
  assert.equal(draft?.seconds, 12);
  await Promise.all([
    saveDraft("thread:question", new Blob(["new"]), 9),
    deleteDraft("thread:question"),
  ]);
  assert.equal(await readDraft("thread:question"), undefined);
  await saveDraft("other:question", new Blob(["private"]), 4);
  assert.equal(await readDraft("thread:question"), undefined);
  await deleteDraft("other:question");
});
test("existing Blob drafts still reopen after the storage format update", async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("remember-when-drafts", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put({ key: "legacy:question", blob: new Blob(["older audio"], { type: "audio/mp4" }), seconds: 7, savedAt: 123 });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
  const draft = await readDraft("legacy:question");
  assert.equal(await draft?.blob.text(), "older audio");
  assert.equal(draft?.blob.type, "audio/mp4");
  assert.equal(draft?.seconds, 7);
  await deleteDraft("legacy:question");
});
