import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runSavedRecording,
  type Job,
} from "../supabase/functions/_shared/processing";
import {
  interviewContext,
  validateQuestion,
} from "../supabase/functions/_shared/ai";
const job: Job = {
  id: "job",
  lease: "lease",
  responseId: "response",
  threadId: "thread",
  question: "A memory?",
  objectPath: "saved-audio",
  contentType: "audio/webm",
  transcript: null,
};
test("transcription failure finishes as retryable failure without changing the saved audio", async () => {
  let result: unknown[] = [];
  const state = await runSavedRecording(job, {
    loadAudio: async () => new Blob(["audio"]),
    transcribe: async () => {
      throw Error("unavailable");
    },
    followUp: async () => {
      throw Error("must not run");
    },
    finish: async (...args) => {
      result = args;
      return true;
    },
  });
  assert.deepEqual(result, [null, null, "transcription_failed"]);
  assert.equal(state.saved, true);
});
test("follow-up failure preserves completed transcript; retry does not repeat transcription", async () => {
  let transcript: string | null = null;
  await runSavedRecording(job, {
    loadAudio: async () => new Blob(["audio"]),
    transcribe: async () => "A saved story",
    followUp: async () => {
      throw Error("unavailable");
    },
    finish: async (text, question, error) => {
      transcript = text;
      assert.equal(error, "followup_failed");
      return true;
    },
  });
  const state = await runSavedRecording(
    { ...job, transcript },
    {
      loadAudio: async () => {
        throw Error("must not download");
      },
      transcribe: async () => {
        throw Error("must not transcribe");
      },
      followUp: async () => "What happened next?",
      finish: async () => true,
    },
  );
  assert.equal(state.processing, "complete");
});
test("interview context is bounded and repeated/multiline questions are rejected", () => {
  const history = Array.from({ length: 100 }, (_, i) => ({
    question: `Question ${i}?`,
    transcript: "x".repeat(2000),
    status: "answered",
  }));
  assert.ok(interviewContext(history).length <= 24000);
  assert.equal(interviewContext(history).includes("Question 1?"), false);
  assert.throws(() => validateQuestion("QUESTION 99!", history));
  assert.throws(() => validateQuestion("First?\nSecond?", history));
  assert.equal(
    validateQuestion("What happened next?", history),
    "What happened next?",
  );
});
