import * as gcsStore from "./store-gcs";
import { isNetlifyRuntime, useGcsBackend } from "./runtime-env";
import type { InterviewState, MemoryNode } from "./types";

async function store() {
  if (isNetlifyRuntime() || useGcsBackend()) {
    return gcsStore;
  }
  return import("./store-sqlite");
}

export async function getOrCreateUserThread(userEmail: string): Promise<InterviewState> {
  return (await store()).getOrCreateUserThread(userEmail);
}

/** @deprecated Use getOrCreateUserThread with an authenticated email. */
export async function getOrCreateDefaultThread(): Promise<InterviewState> {
  return getOrCreateUserThread("local-dev@remember-when.local");
}

export async function getThreadState(userEmail: string, threadId: string): Promise<InterviewState> {
  return (await store()).getThreadState(userEmail, threadId);
}

export async function getNode(userEmail: string, id: string): Promise<MemoryNode | undefined> {
  return (await store()).getNode(userEmail, id);
}

export async function markNodeProcessing(
  userEmail: string,
  input: {
    id: string;
    mp3Url: string;
    gcsObjectName: string;
    metadata: Record<string, unknown>;
  }
) {
  return (await store()).markNodeProcessing(userEmail, input);
}

export async function markNodeAnswered(
  userEmail: string,
  input: {
    id: string;
    transcript: string;
    mp3Url: string;
    gcsObjectName: string;
    metadata: Record<string, unknown>;
  }
) {
  return (await store()).markNodeAnswered(userEmail, input);
}

export async function markNodeFailed(userEmail: string, id: string, message: string) {
  return (await store()).markNodeFailed(userEmail, id, message);
}

export async function addFollowUpQuestion(
  userEmail: string,
  input: {
    threadId: string;
    parentQuestionId: string;
    question: string;
    metadata?: Record<string, unknown>;
  }
) {
  return (await store()).addFollowUpQuestion(userEmail, input);
}

export async function clearNodeAnswer(userEmail: string, id: string) {
  return (await store()).clearNodeAnswer(userEmail, id);
}
