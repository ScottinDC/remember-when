import type { MemoryNode } from "../src/types";
export function node(
  id: string,
  sequenceOrder: number,
  parentQuestionId: string | null = null,
): MemoryNode {
  return {
    id,
    sequenceOrder,
    parentQuestionId,
    threadId: "demo",
    question: `What do you remember about moment ${sequenceOrder}?`,
    transcript: null,
    mp3Url: null,
    gcsObjectName: null,
    timestamp: "2026-10-01T12:00:00Z",
    metadata: null,
    status: "pending",
    treeOrder: 0,
    branchRootOrder: 0,
    questionCode: "",
    depth: 0,
    generation: 0,
    branchRootId: id,
    branchLabel: "",
    treePath: [],
  };
}
export const foundation = Array.from({ length: 5 }, (_, i) =>
  node(`question-${i + 1}`, i + 1),
);
