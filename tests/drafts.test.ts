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
