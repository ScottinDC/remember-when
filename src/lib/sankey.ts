import { sankey, sankeyLeft } from "d3-sankey";
import type { MemoryNode } from "../types";
import { normalizeTree } from "./tree";
import { branchColor } from "./colors";

export type StoryNode = {
  id: string;
  memory: MemoryNode | null;
  color: string;
  fixedValue: number;
};
export type StoryLink = { sourceId: string; targetId: string; color: string };
const ORIGIN = "__interview_origin__";

/** Ribbon width counts terminal questions, preserving flow at every fork. */
export function layoutStory(nodes: MemoryNode[], containerWidth: number) {
  const forest = normalizeTree(nodes);
  const weights = new Map<string, number>();
  for (const node of [...forest].reverse()) {
    const weight = weights.get(node.id) ?? 1;
    weights.set(node.id, weight);
    if (node.parentQuestionId)
      weights.set(
        node.parentQuestionId,
        (weights.get(node.parentQuestionId) ?? 0) + weight,
      );
  }
  const roots = forest.filter((node) => !node.parentQuestionId);
  const total = roots.reduce((sum, node) => sum + weights.get(node.id)!, 0);
  const width = Math.max(
    containerWidth,
    640,
    (Math.max(0, ...forest.map((node) => node.depth)) + 1) * 320 + 120,
  );
  const height = Math.max(
    340,
    120 +
      total * 74 +
      Math.max(
        0,
        forest.filter((n) => !forest.some((c) => c.parentQuestionId === n.id))
          .length - 1,
      ) *
        30,
  );
  if (!forest.length) return { graph: { nodes: [], links: [] }, width, height };
  const input = {
    nodes: [
      {
        id: ORIGIN,
        memory: null,
        color: "transparent",
        fixedValue: total,
      } as StoryNode,
      ...forest.map((memory) => ({
        id: memory.id,
        memory,
        color: branchColor(memory.branchRootOrder),
        fixedValue: weights.get(memory.id)!,
      })),
    ],
    links: forest.map((node) => ({
      source: node.parentQuestionId ?? ORIGIN,
      target: node.id,
      sourceId: node.parentQuestionId ?? ORIGIN,
      targetId: node.id,
      color: branchColor(node.branchRootOrder),
      value: weights.get(node.id)!,
    })),
  };
  const graph = sankey<StoryNode, StoryLink>()
    .nodeId((node) => node.id)
    .nodeAlign(sankeyLeft)
    .nodeWidth(42)
    .nodePadding(30)
    .nodeSort(
      (a, b) => (a.memory?.treeOrder ?? -1) - (b.memory?.treeOrder ?? -1),
    )
    .linkSort(
      (a, b) =>
        (a.target as StoryNode).memory!.treeOrder -
        (b.target as StoryNode).memory!.treeOrder,
    )
    .extent([
      [60, 60],
      [width - 60, height - 60],
    ])(input);
  return { graph, width, height };
}
