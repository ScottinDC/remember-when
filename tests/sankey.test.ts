import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStory } from "../src/lib/sankey";
import { normalizeTree } from "../src/lib/tree";
import { foundation, node } from "./fixtures";

test("five starting questions have distinct ribbons from one shared origin", () => {
  const { graph } = layoutStory(foundation, 1200);
  assert.equal(graph.links.length, 5);
  assert.equal(new Set(graph.links.map((l) => l.sourceId)).size, 1);
  assert.deepEqual(
    graph.links.map((l) => l.targetId),
    foundation.map((n) => n.id),
  );
  assert.equal(new Set(graph.links.map((l) => l.color)).size, 5);
  for (const n of graph.nodes)
    for (const p of [n.x0, n.x1, n.y0, n.y1]) assert.ok(Number.isFinite(p));
});
test("branch weights conserve flow and links use stable IDs even when input is shuffled", () => {
  const input = [
    node("grandchild", 8, "child-a"),
    node("child-b", 7, "question-1"),
    ...foundation,
    node("child-a", 6, "question-1"),
  ];
  const { graph } = layoutStory(input, 600);
  const root = graph.nodes.find((n) => n.id === "question-1")!;
  assert.equal(root.value, 2);
  assert.equal(
    root.sourceLinks!.reduce((s, l) => s + l.value, 0),
    root.targetLinks![0].value,
  );
  for (const l of graph.links) {
    assert.equal((l.target as { id: string }).id, l.targetId);
    assert.ok(Number.isFinite(l.width));
  }
  assert.ok(
    graph.nodes.find((n) => n.id === "grandchild")!.x0! >
      graph.nodes.find((n) => n.id === "child-a")!.x0!,
  );
});
test("empty, singleton, missing parents and cycles remain finite and visible", () => {
  assert.equal(layoutStory([], 300).graph.nodes.length, 0);
  for (const nodes of [
    [node("a", 1)],
    [node("a", 1, "missing")],
    [node("a", 1, "b"), node("b", 2, "a")],
  ]) {
    assert.equal(normalizeTree(nodes).length, nodes.length);
    for (const n of layoutStory(nodes, 300).graph.nodes)
      assert.ok(Number.isFinite(n.x0) && Number.isFinite(n.y0));
  }
});
