import { randomUUID } from "node:crypto";
import { INITIAL_QUESTIONS } from "./interview";
import { appendLedgerEvent, ledgerFromNode } from "./ledger";
import { readJsonFromGcs, writeJsonToGcs } from "./storage";
import { buildTreePath, enrichNode, nextSequenceOrder, nodeDepth } from "./tree";
import type { InterviewState, InterviewThread, MemoryNode } from "./types";
import { userStateObject } from "./user-key";

function normalizeNode(nodes: MemoryNode[], node: MemoryNode, index: number): MemoryNode {
  const sequenceOrder = node.sequenceOrder ?? index + 1;
  const withOrder = { ...node, sequenceOrder };
  const depth = node.depth ?? nodeDepth(nodes, withOrder);
  const treePath = node.treePath ?? buildTreePath(nodes, withOrder);
  return enrichNode(nodes, { ...withOrder, depth, treePath });
}

function normalizeState(state: InterviewState): InterviewState {
  const nodes = state.nodes.map((node, index) => normalizeNode(state.nodes, node, index));
  return {
    thread: state.thread,
    nodes: nodes.map((node) => normalizeNode(nodes, node, node.sequenceOrder - 1))
  };
}

async function loadState(userEmail: string): Promise<InterviewState | null> {
  const raw = await readJsonFromGcs<InterviewState>(userStateObject(userEmail));
  return raw ? normalizeState(raw) : null;
}

async function persistState(userEmail: string, state: InterviewState) {
  await writeJsonToGcs(userStateObject(userEmail), state);
}

function createInitialState(userEmail: string): InterviewState {
  const now = new Date().toISOString();
  const threadId = randomUUID();
  const thread: InterviewThread = {
    id: threadId,
    title: "My Life Story",
    createdAt: now,
    updatedAt: now
  };

  const nodes: MemoryNode[] = INITIAL_QUESTIONS.map((question, index) => {
    const id = randomUUID();
    return enrichNode([], {
      id,
      threadId,
      parentQuestionId: null,
      question,
      transcript: null,
      mp3Url: null,
      gcsObjectName: null,
      timestamp: now,
      metadata: { ownerEmail: userEmail.trim().toLowerCase() },
      status: "pending",
      sequenceOrder: index + 1,
      depth: 0,
      generation: 0,
      branchRootId: id,
      branchLabel: `Q${index + 1}`,
      treePath: [id]
    });
  });

  return { thread, nodes };
}

async function seedLedger(userEmail: string, state: InterviewState) {
  await appendLedgerEvent(userEmail, {
    type: "thread_initialized",
    threadId: state.thread.id,
    at: state.thread.createdAt,
    questionCount: state.nodes.length
  });

  for (const node of state.nodes) {
    await appendLedgerEvent(userEmail, ledgerFromNode(node, "question_created"));
  }
}

export async function getOrCreateUserThread(userEmail: string): Promise<InterviewState> {
  const existing = await loadState(userEmail);
  if (existing) {
    const needsBranchFields = existing.nodes.some((node) => node.generation === undefined || !node.branchRootId);
    if (needsBranchFields) {
      const normalized = normalizeState(existing);
      void persistState(userEmail, normalized).catch((error) => {
        console.error("Failed to migrate interview branch fields:", error);
      });
      return normalized;
    }
    return existing;
  }

  const initial = createInitialState(userEmail);
  await persistState(userEmail, initial);
  void seedLedger(userEmail, initial).catch((error) => {
    console.error("Failed to seed interview ledger:", error);
  });
  return initial;
}

/** @deprecated Use getOrCreateUserThread with an authenticated email. */
export async function getOrCreateDefaultThread(): Promise<InterviewState> {
  return getOrCreateUserThread("legacy@remember-when.local");
}

export async function getThreadState(userEmail: string, threadId: string): Promise<InterviewState> {
  const state = await loadState(userEmail);
  if (!state || state.thread.id !== threadId) {
    throw new Error("Thread not found.");
  }
  return state;
}

export async function getNode(userEmail: string, id: string): Promise<MemoryNode | undefined> {
  const state = await loadState(userEmail);
  return state?.nodes.find((node) => node.id === id);
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
  const state = await loadState(userEmail);
  if (!state) {
    return undefined;
  }

  const now = new Date().toISOString();
  const index = state.nodes.findIndex((node) => node.id === input.id);
  if (index === -1) {
    return undefined;
  }

  state.nodes[index] = enrichNode(state.nodes, {
    ...state.nodes[index],
    mp3Url: input.mp3Url,
    gcsObjectName: input.gcsObjectName,
    timestamp: now,
    metadata: input.metadata,
    status: "processing"
  });
  state.thread.updatedAt = now;
  await persistState(userEmail, state);
  return state.nodes[index];
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
  const state = await loadState(userEmail);
  if (!state) {
    return undefined;
  }

  const now = new Date().toISOString();
  const index = state.nodes.findIndex((node) => node.id === input.id);
  if (index === -1) {
    return undefined;
  }

  state.nodes[index] = enrichNode(state.nodes, {
    ...state.nodes[index],
    transcript: input.transcript,
    mp3Url: input.mp3Url,
    gcsObjectName: input.gcsObjectName,
    timestamp: now,
    metadata: input.metadata,
    status: "answered"
  });
  state.thread.updatedAt = now;
  await persistState(userEmail, state);
  return state.nodes[index];
}

export async function markNodeFailed(userEmail: string, id: string, message: string) {
  const state = await loadState(userEmail);
  if (!state) {
    return undefined;
  }

  const now = new Date().toISOString();
  const index = state.nodes.findIndex((node) => node.id === id);
  if (index === -1) {
    return undefined;
  }

  state.nodes[index] = enrichNode(state.nodes, {
    ...state.nodes[index],
    timestamp: now,
    metadata: {
      ...(state.nodes[index].metadata ?? {}),
      error: message
    },
    status: "pending"
  });
  state.thread.updatedAt = now;
  await persistState(userEmail, state);
  return state.nodes[index];
}

export async function clearNodeAnswer(userEmail: string, id: string) {
  const state = await loadState(userEmail);
  if (!state) {
    return undefined;
  }

  const now = new Date().toISOString();
  const index = state.nodes.findIndex((node) => node.id === id);
  if (index === -1) {
    return undefined;
  }

  state.nodes[index] = enrichNode(state.nodes, {
    ...state.nodes[index],
    transcript: null,
    mp3Url: null,
    gcsObjectName: null,
    timestamp: now,
    metadata: null,
    status: "pending"
  });
  state.thread.updatedAt = now;
  await persistState(userEmail, state);
  return state.nodes[index];
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
  const state = await loadState(userEmail);
  if (!state || state.thread.id !== input.threadId) {
    return undefined;
  }

  const parent = state.nodes.find((node) => node.id === input.parentQuestionId);
  if (!parent) {
    return undefined;
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const sequenceOrder = nextSequenceOrder(state.nodes);
  const depth = parent.depth + 1;
  const treePath = [...parent.treePath, id];

  const node: MemoryNode = enrichNode(state.nodes, {
    id,
    threadId: input.threadId,
    parentQuestionId: input.parentQuestionId,
    question: input.question,
    transcript: null,
    mp3Url: null,
    gcsObjectName: null,
    timestamp: now,
    metadata: input.metadata ?? null,
    status: "pending",
    sequenceOrder,
    depth,
    generation: depth,
    treePath
  });

  state.nodes.push(node);
  state.thread.updatedAt = now;
  await persistState(userEmail, state);
  return node;
}
