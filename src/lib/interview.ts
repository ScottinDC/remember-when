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
  const foundationPending = sorted.find((node) => node.depth === 0 && node.status === "pending");
  if (foundationPending) {
    return foundationPending;
  }
  return sorted.find((node) => node.status === "pending") ?? null;
}

export function sortBySeries(nodes: MemoryNode[]) {
  return [...nodes].sort((left, right) => left.sequenceOrder - right.sequenceOrder);
}

export function answeredNodes(nodes: MemoryNode[]) {
  return sortBySeries(nodes.filter((node) => node.status === "answered" || node.status === "processing"));
}

export function countByStatus(nodes: MemoryNode[], status: MemoryNode["status"]) {
  return nodes.filter((node) => node.status === status).length;
}

export function questionNumber(node: MemoryNode) {
  return String(node.sequenceOrder).padStart(2, "0");
}

export function promptLabel(node: MemoryNode) {
  return `Prompt ${questionNumber(node)}`;
}

export function branchCaption(node: MemoryNode) {
  if (node.depth === 0) {
    return questionCode(node);
  }
  return `${questionCode(node)} · ${node.branchLabel} branch · gen ${node.generation}`;
}

export function questionCode(node: MemoryNode) {
  return `Q${node.sequenceOrder}`;
}

export function seriesLabel(node: MemoryNode) {
  if (node.status === "answered") {
    return "Saved";
  }
  if (node.status === "processing") {
    return "Working";
  }
  return "Pending";
}

export type SankeyNode = {
  id: string;
  name: string;
  status: MemoryNode["status"];
  sequenceOrder: number;
  depth: number;
  question: string;
};
export type SankeyLink = {
  source: number;
  target: number;
  value: number;
  label: string;
};

export function buildSankeyData(nodes: MemoryNode[]) {
  const sorted = sortBySeries(nodes);
  const indexById = new Map(sorted.map((node, index) => [node.id, index]));

  const sankeyNodes: SankeyNode[] = sorted.map((node) => ({
    id: node.id,
    name: questionCode(node),
    status: node.status,
    sequenceOrder: node.sequenceOrder,
    depth: node.depth,
    question: node.question
  }));

  const links: SankeyLink[] = [];
  for (const node of sorted) {
    if (!node.parentQuestionId) {
      continue;
    }
    const source = indexById.get(node.parentQuestionId);
    const target = indexById.get(node.id);
    if (source === undefined || target === undefined) {
      continue;
    }
    links.push({
      source,
      target,
      value: 1,
      label: questionCode(node)
    });
  }

  return { nodes: sankeyNodes, links };
}
