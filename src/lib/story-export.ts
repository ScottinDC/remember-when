import type { MemoryNode } from "../types";
export function exportableRecordings(nodes: MemoryNode[]) {
  return nodes.filter(
    (n) =>
      (n.hasAudio || n.mp3Url) && !n.archivedAt && !n.metadata?.deletePending,
  );
}
export function storyText(
  title: string,
  nodes: MemoryNode[],
  includeQuestions: boolean,
) {
  return [
    title,
    "Recorded memories · original transcript",
    "",
    ...nodes.flatMap((n) => [
      ...(includeQuestions
        ? [`Question ${n.sequenceOrder}: ${n.question}`]
        : []),
      n.transcript?.trim() ||
        "[Transcript not available for this recording. The original audio remains in your archive.]",
      "",
    ]),
  ].join("\n");
}
export async function storyDocument(
  title: string,
  nodes: MemoryNode[],
  includeQuestions: boolean,
) {
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const document = new Document({
    title,
    creator: "Remember When",
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
          new Paragraph({
            text: "Recorded memories · original transcript",
            spacing: { after: 300 },
          }),
          ...nodes.flatMap((n) => [
            ...(includeQuestions
              ? [
                  new Paragraph({
                    text: `Question ${n.sequenceOrder}: ${n.question}`,
                    heading: HeadingLevel.HEADING_2,
                  }),
                ]
              : []),
            ...(
              n.transcript?.trim() ||
              "[Transcript not available for this recording.]"
            )
              .split(/\r?\n/)
              .map((text) => new Paragraph({ text, spacing: { after: 160 } })),
          ]),
        ],
      },
    ],
  });
  return Packer.toBlob(document);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function pcm16(channels: Float32Array[]): Int16Array {
  if (!channels.length) return new Int16Array();
  const result = new Int16Array(channels[0].length);
  for (let i = 0; i < result.length; i++) {
    const value = Math.max(
      -1,
      Math.min(1, channels.reduce((sum, c) => sum + c[i], 0) / channels.length),
    );
    result[i] = Math.round(value * (value < 0 ? 32768 : 32767));
  }
  return result;
}
