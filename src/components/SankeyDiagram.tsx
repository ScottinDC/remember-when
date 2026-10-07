import { useEffect, useMemo, useRef, useState } from "react";
import { sankeyLinkHorizontal, type SankeyNode } from "d3-sankey";
import { layoutStory, type StoryLink, type StoryNode } from "../lib/sankey";
import { seriesLabel } from "../lib/interview";
import type { MemoryNode } from "../types";

type Props = {
  nodes: MemoryNode[];
  activeQuestionId?: string | null;
  onSelect?: (id: string) => void;
  disabled?: boolean;
};
export function SankeyDiagram({
  nodes,
  activeQuestionId,
  onSelect,
  disabled = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const { graph, width, height } = useMemo(
    () => layoutStory(nodes, containerWidth),
    [nodes, containerWidth],
  );
  const selected = nodes.find((node) => node.id === activeQuestionId);
  const linkPath = sankeyLinkHorizontal<StoryNode, StoryLink>();
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setContainerWidth(entries[0].contentRect.width),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  if (!nodes.length) return null;
  return (
    <section
      className="form-card card-body progression"
      aria-labelledby="progression-title"
    >
      <div className="progression-heading">
        <h2 className="panel-title" id="progression-title">
          Question Progression
        </h2>
        <span>Branching flow</span>
      </div>
      <p className="progression-description">
        Each branch is labeled with the question it leads to. The conversation
        deepens as one answer flows into the next.
      </p>
      <div
        ref={container}
        className="progression-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable question progression"
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="Question branches"
        >
          {graph.links.map((link) => {
            const source = link.source as SankeyNode<StoryNode, StoryLink>;
            const target = link.target as SankeyNode<StoryNode, StoryLink>;
            const memory = target.memory!;
            const x = ((source.x1 ?? 0) + (target.x0 ?? 0)) / 2;
            const y = ((link.y0 ?? 0) + (link.y1 ?? 0)) / 2;
            const current = memory.id === activeQuestionId;
            return (
              <g
                key={link.targetId}
                className="progression-ribbon"
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-pressed={current}
                aria-label={`Q${memory.sequenceOrder}, ${seriesLabel(memory)}: ${memory.question}`}
                onClick={() => !disabled && onSelect?.(memory.id)}
                onKeyDown={(event) => {
                  if (
                    !disabled &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onSelect?.(memory.id);
                  }
                }}
              >
                <title>{`Q${memory.sequenceOrder}: ${memory.question} (${seriesLabel(memory)})`}</title>
                <path
                  d={linkPath(link) ?? undefined}
                  fill="none"
                  stroke={link.color}
                  strokeOpacity={0.8}
                  strokeWidth={link.width}
                />
                {!source.memory && (
                  <rect
                    x={source.x0}
                    y={(link.y0 ?? 0) - (link.width ?? 0) / 2}
                    width={42}
                    height={link.width}
                    fill={link.color}
                  />
                )}
                <rect
                  x={target.x0}
                  y={target.y0}
                  width={42}
                  height={(target.y1 ?? 0) - (target.y0 ?? 0)}
                  fill={link.color}
                />
                <rect
                  className="ribbon-label"
                  x={x - 29}
                  y={y - 15}
                  width={58}
                  height={30}
                  fill="white"
                  stroke={link.color}
                  strokeWidth={current ? 3 : 1.5}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill={link.color}
                  className="ribbon-text"
                >
                  Q{memory.sequenceOrder}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {selected && (
        <p className="mt-3 text-sm text-ink-secondary" aria-live="polite">
          <strong>Q{selected.sequenceOrder}.</strong> {selected.question}
        </p>
      )}
      <details className="mt-3 text-sm text-ink-secondary">
        <summary>Read question connections</summary>
        <ol className="tree-connections">
          {nodes.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect?.(node.id)}
              >
                Q{node.sequenceOrder}: {node.question}
              </button>
              <span>
                {" "}
                — {seriesLabel(node)}
                {node.parentQuestionId
                  ? `; follows Q${nodes.find((parent) => parent.id === node.parentQuestionId)?.sequenceOrder ?? "?"}.`
                  : "; starting question."}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
