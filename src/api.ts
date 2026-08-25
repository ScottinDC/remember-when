import { fetchOrCreateSupabaseInterview } from "./interview-store";
import { deleteSupabaseAnswer, saveSupabaseAnswer } from "./answer-store";
import type { InterviewState } from "./types";

export async function fetchInterview() {
  return fetchOrCreateSupabaseInterview();
}

export async function saveAnswer(questionId: string, audio: Blob) {
  return saveSupabaseAnswer(questionId, audio);
}

export async function deleteAnswer(questionId: string) {
  return deleteSupabaseAnswer(questionId);
}

export async function saveAllAnswers(entries: Array<{ questionId: string; blob: Blob }>) {
  let state: InterviewState | null = null;
  for (const entry of entries) {
    const result = await saveAnswer(entry.questionId, entry.blob);
    state = result.state;
  }
  if (!state) {
    throw new Error("No answers were saved.");
  }
  return { state };
}
