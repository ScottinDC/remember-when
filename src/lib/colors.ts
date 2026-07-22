export const palette = {
  edge: "#3182bd",
  body: "#6baed6",
  pending: "#c6dbef",
  processing: "#6baed6",
  ink: "#1a365d",
  inkMuted: "#486581"
} as const;

/** Foundation branch colors (Q1–Q5) — used outside the Sankey when needed. */
export const branchColors = ["#3f6f9c", "#4f8c6a", "#c08a2e", "#bb6240", "#8e5670"] as const;

/**
 * Depth / generation colors for the Sankey — a muted rainbow that sits on
 * the warm archival page (#f4f4f2) with navy + terracotta accents.
 * Index 0 = foundation questions; deeper follow-ups advance through the spectrum.
 */
export const depthColors = [
  "#2c5f8f", // blue — navy-light
  "#3d8a7a", // teal
  "#5a9a4a", // green
  "#c4a035", // gold
  "#d27a3a", // amber / orange
  "#d24a3d", // terracotta — record accent
  "#b85a78", // rose
  "#7a5a9a" // soft violet
] as const;

export function branchColor(sequenceOrder: number) {
  return branchColors[(sequenceOrder - 1) % branchColors.length];
}

export function depthColor(depth: number) {
  const index = Math.max(0, Math.floor(depth));
  return depthColors[index % depthColors.length];
}
