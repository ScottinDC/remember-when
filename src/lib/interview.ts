import type { MemoryNode } from "../types";

export const FOUNDATION_COUNT = 5;

export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function chooseNextQuestion(nodes: MemoryNode[]) {
  const sorted = sortBySeries(nodes);
  const foundationPending = sorted.find(
    (node) =>
      !node.archivedAt &&
      !node.metadata?.skippedAt &&
      node.depth === 0 &&
      node.status === "pending",
  );
  if (foundationPending) {
    return foundationPending;
  }
  return (
    sorted.find(
      (node) =>
        !node.archivedAt &&
        !node.metadata?.skippedAt &&
        node.status === "pending",
    ) ?? null
  );
}

export function sortBySeries(nodes: MemoryNode[]) {
  return [...nodes].sort(
    (left, right) =>
      left.treeOrder - right.treeOrder ||
      left.sequenceOrder - right.sequenceOrder,
  );
}

export function answeredNodes(nodes: MemoryNode[]) {
  return sortBySequence(
    nodes.filter(
      (node) => node.status === "answered" || node.status === "processing",
    ),
  );
}

export function countByStatus(
  nodes: MemoryNode[],
  status: MemoryNode["status"],
) {
  return nodes.filter((node) => node.status === status).length;
}

export function questionNumber(node: MemoryNode) {
  return String(node.sequenceOrder);
}

export function promptLabel(node: MemoryNode) {
  return `Question ${questionNumber(node)}`;
}

export function branchCaption(node: MemoryNode) {
  return `Question ${questionNumber(node)}`;
}

export function questionCode(node: MemoryNode) {
  return `Q${node.sequenceOrder}`;
}

export function seriesLabel(node: MemoryNode) {
  if (node.metadata?.skippedAt) return "Passed for now";
  if (node.status === "answered") {
    return "Saved";
  }
  if (node.status === "processing") {
    return "Working";
  }
  return node.status === "failed" ? "Failed" : "Pending";
}

export function sortBySequence(nodes: MemoryNode[]) {
  return [...nodes].sort(
    (a, b) =>
      a.sequenceOrder - b.sequenceOrder ||
      a.timestamp.localeCompare(b.timestamp) ||
      a.id.localeCompare(b.id),
  );
}
export function pendingNodes(nodes: MemoryNode[]) {
  return sortBySequence(
    nodes.filter((n) => n.status === "pending" || n.status === "failed"),
  );
}
