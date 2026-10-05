import type { MemoryNode } from "../types";

/** Build a deterministic forest. Missing/cyclic parents become visible roots. */
export function normalizeTree(input: MemoryNode[]): MemoryNode[] {
  const sorted = [...input].sort(
    (a, b) =>
      a.sequenceOrder - b.sequenceOrder ||
      a.timestamp.localeCompare(b.timestamp) ||
      a.id.localeCompare(b.id),
  );
  const byId = new Map(sorted.map((node) => [node.id, { ...node }]));
  for (const node of byId.values()) {
    const seen = new Set([node.id]);
    let parent = node.parentQuestionId;
    while (parent) {
      if (!byId.has(parent) || seen.has(parent)) {
        node.parentQuestionId = null;
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)!.parentQuestionId;
    }
  }
  const children = new Map<string, MemoryNode[]>();
  for (const node of byId.values())
    if (node.parentQuestionId) {
      const siblings = children.get(node.parentQuestionId) ?? [];
      siblings.push(node);
      children.set(node.parentQuestionId, siblings);
    }
  const result: MemoryNode[] = [];
  function visit(
    node: MemoryNode,
    root: MemoryNode,
    path: string[],
    code: string,
  ) {
    result.push({
      ...node,
      treeOrder: result.length,
      depth: path.length - 1,
      generation: path.length - 1,
      treePath: path,
      branchRootId: root.id,
      branchRootOrder: root.sequenceOrder,
      branchLabel: `Q${root.sequenceOrder}`,
      questionCode: code,
    });
    (children.get(node.id) ?? []).forEach((child, i) =>
      visit(child, root, [...path, child.id], `${code}.${i + 1}`),
    );
  }
  for (const node of byId.values())
    if (!node.parentQuestionId)
      visit(node, node, [node.id], `Q${node.sequenceOrder}`);
  return result;
}
