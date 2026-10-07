import { fetchOrCreateSupabaseInterview } from "./interview-store";
import {
  saveSupabaseAnswer,
  regenerateSupabaseQuestion,
  type SaveStage,
} from "./answer-store";

export async function fetchInterview() {
  return fetchOrCreateSupabaseInterview();
}

export async function saveAnswer(
  questionId: string,
  audio: Blob,
  onStage?: (stage: SaveStage) => void,
) {
  return saveSupabaseAnswer(questionId, audio, onStage);
}

export const regenerateQuestion = regenerateSupabaseQuestion;
