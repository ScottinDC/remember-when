import { useEffect, useRef } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { select } from "d3";
import { depthColor } from "../lib/colors";
import { buildSankeyData } from "../lib/interview";
import type { MemoryNode } from "../types";

type SankeyDiagramProps = {
  nodes: MemoryNode[];
};

type LayoutNode = {
  id: string;
  name: string;
  status: MemoryNode["status"];
  sequenceOrder?: number;
  depth?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
};

type LayoutLink = {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  width?: number;
  y0?: number;
  y1?: number;
  label: string;
};

type SankeyLinkInput = {
  source: number;
  target: number;
  value: number;
  label: string;
};

const MIN_CHART_HEIGHT = 450;

function nodeColor(node: LayoutNode) {
  if (node.id === "__start__") {
    return "transparent";
  }
  const base = depthColor(node.depth ?? 0);
  if (node.status === "pending") {
    return base + "66";
  }
  if (node.status === "processing") {
    return base + "aa";
  }
  return base;
}

function linkColor(link: LayoutLink) {
  return depthColor(link.target.depth ?? 0);
}

function linkMidpoint(link: LayoutLink) {
  const x = ((link.source.x1 ?? 0) + (link.target.x0 ?? 0)) / 2;
  const y = ((link.y0 ?? 0) + (link.y1 ?? 0)) / 2;
  return { x, y };
}

function linkSpan(link: LayoutLink) {
  return (link.target.x0 ?? 0) - (link.source.x1 ?? 0);
}

function drawSankey(svgElement: SVGSVGElement, nodes: MemoryNode[], containerWidth: number) {
  const width = Math.max(320, containerWidth);
  const height = Math.max(MIN_CHART_HEIGHT, nodes.length * 36);
  const { nodes: graphNodes, links } = buildSankeyData(nodes);

  const layoutNodes: LayoutNode[] = [
    { id: "__start__", name: "Start", status: "answered", depth: 0 },
    ...graphNodes.map((node) => ({ ...node }))
  ];

  const layoutLinks: SankeyLinkInput[] = [
    ...links,
    ...graphNodes
      .map((node, index) => {
        const parentExists = links.some((link) => link.target === index);
        if (parentExists) {
          return null;
        }
        return {
          source: 0,
          target: index + 1,
          value: 1,
          label: `Q${node.sequenceOrder}`
        };
      })
      .filter((link): link is SankeyLinkInput => link !== null)
  ];

  const sankeyLayout = sankey<LayoutNode, LayoutLink>()
    .nodeWidth(14)
    .nodePadding(14)
    .extent([
      [12, 12],
      [width - 12, height - 12]
    ]);

  const graph = sankeyLayout({
    nodes: layoutNodes.map((node) => ({ ...node })),
    links: layoutLinks as unknown as LayoutLink[]
  });

  const svg = select(svgElement);
  svg.selectAll("*").remove();
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  svg.attr("width", width);
  svg.attr("height", height);

  svg
    .append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke", (link) => linkColor(link))
    .attr("stroke-opacity", 0.78)
    .attr("stroke-width", (link) => Math.max(2, link.width ?? 2));

  svg
    .append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("x", (node) => node.x0 ?? 0)
    .attr("y", (node) => node.y0 ?? 0)
    .attr("height", (node) => Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0)))
    .attr("width", (node) => (node.x1 ?? 0) - (node.x0 ?? 0))
    .attr("fill", (node) => nodeColor(node))
    .attr("opacity", (node) => (node.id === "__start__" ? 0 : 1))
    .attr("rx", 2);

  svg
    .append("g")
    .attr("pointer-events", "none")
    .selectAll("g")
    .data(graph.links.filter((link) => linkSpan(link) >= 20))
    .join("g")
    .attr("transform", (link) => {
      const { x, y } = linkMidpoint(link);
      return `translate(${x},${y})`;
    })
    .each(function (link) {
      const group = select(this);
      const color = linkColor(link);

      group
        .append("rect")
        .attr("x", -26)
        .attr("y", -13)
        .attr("width", 52)
        .attr("height", 26)
        .attr("fill", "#ffffff")
        .attr("stroke", color)
        .attr("stroke-width", 1.5);

      group
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-family", "IBM Plex Mono, monospace")
        .attr("font-size", 14)
        .attr("font-weight", 500)
        .attr("fill", color)
        .text(link.label);
    });
}

export function SankeyDiagram({ nodes }: SankeyDiagramProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg || nodes.length === 0) {
      return;
    }

    const render = () => {
      drawSankey(svg, nodes, container.clientWidth);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(container);
    return () => observer.disconnect();
  }, [nodes]);

  if (nodes.length === 0) {
    return null;
  }

  const maxDepth = Math.max(...nodes.map((node) => node.depth), 0);
  const legendDepths = Array.from({ length: Math.min(maxDepth + 1, 8) }, (_, i) => i);

  return (
    <section className="form-card card-body">
      <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="panel-title">Question Progression</h2>
        <span className="panel-subtitle">Branching flow</span>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-ink-muted">
        Each branch is labeled with the question it leads to. Colors mark depth — foundation
        questions start in navy and move through the spectrum as follow-ups deepen.
      </p>
      {legendDepths.length > 1 ? (
        <ul className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Depth color legend">
          {legendDepths.map((depth) => (
            <li key={depth} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: depthColor(depth) }}
                aria-hidden="true"
              />
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint">
                {depth === 0 ? "Foundation" : `Level ${depth}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div
        ref={containerRef}
        className="min-h-[400px] w-full overflow-x-auto rounded border border-line-soft/80 bg-fill p-2.5"
      >
        <svg ref={svgRef} className="block h-auto w-full" role="img" aria-label="Question tree Sankey diagram" />
      </div>
    </section>
  );
}
