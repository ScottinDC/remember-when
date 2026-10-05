import type { MemoryNode } from "../types";
// Recovered from the September 17 deployment; see docs/SOURCE-RECOVERY.md.
import React from "react";
import { Loader2, RotateCcw, Download, Volume2 } from "lucide-react";
import { answeredNodes, questionNumber, branchCaption } from "../lib/interview";
function downloadFilename(node: MemoryNode) {
  return `remember-when-q${questionNumber(node)}.webm`;
}
async function downloadRecording(node: MemoryNode) {
  if (!node.mp3Url) return;
  const blob = await (await fetch(node.mp3Url)).blob(),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  ((anchor.href = url),
    (anchor.download = downloadFilename(node)),
    anchor.click(),
    URL.revokeObjectURL(url));
}
async function downloadAll(recordings: MemoryNode[]) {
  for (const n of recordings)
    !n.mp3Url ||
      n.status !== "answered" ||
      (await downloadRecording(n),
      await new Promise((a) => setTimeout(a, 400)));
}
function RecordingRow({
  node,
  deleting,
  onDelete,
  onPlay,
}: {
  node: MemoryNode;
  deleting: boolean;
  onDelete: (id: string) => void;
  onPlay: (audio: HTMLAudioElement) => void;
}) {
  const canPlay = !!(node.mp3Url && node.status === "answered");
  return (
    <article className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-secondary">{branchCaption(node)}</p>
          <h3 className="mt-1 font-serif text-lg leading-snug text-ink">
            {node.question}
          </h3>
        </div>
        {node.status === "processing" ? (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-navy-light"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {node.transcript ? (
        <p className="mb-2.5 text-sm leading-relaxed text-ink-muted">
          {node.transcript}
        </p>
      ) : null}
      {canPlay ? (
        <audio
          aria-label={`Recording for ${branchCaption(node)}`}
          className="my-3"
          controls={true}
          preload="none"
          src={node.mp3Url || void 0}
          onPlay={(c) => onPlay(c.currentTarget)}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Re-record response"
          className="btn-secondary"
          disabled={deleting || node.status === "processing"}
          onClick={() => onDelete(node.id)}
          title="Re-record"
          type="button"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {"Re-record"}
        </button>
        <button
          aria-label="Download recording"
          className="btn-icon"
          disabled={!canPlay}
          onClick={() => downloadRecording(node)}
          type="button"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
function RecordingLibrary({
  nodes,
  onDelete,
  deletingId,
}: {
  nodes: MemoryNode[];
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  const recordings = answeredNodes(nodes).filter(
      (d) => d.mp3Url || d.status === "processing",
    ),
    completed = recordings.filter((d) => d.status === "answered" && d.mp3Url),
    audioRef = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(
    () => () => {
      var d;
      (d = audioRef.current) == null || d.pause();
    },
    [],
  );
  function handlePlay(d: HTMLAudioElement) {
    (audioRef.current && audioRef.current !== d && audioRef.current.pause(),
      (audioRef.current = d));
  }
  return (
    <section className="form-card card-body">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="panel-title">{"My recordings"}</h2>
          <span className="text-sm text-ink-secondary tabular-nums">
            {String(completed.length).padStart(2, "0")}
            {" saved"}
          </span>
        </div>
        <button
          aria-label="Download all recordings"
          className="btn-icon"
          disabled={completed.length === 0}
          onClick={() => downloadAll(completed)}
          type="button"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {recordings.length === 0 ? (
        <div className="flex items-center gap-2.5 border-t border-line-soft/80 pt-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line-hair bg-[#f5f5f5]">
            <Volume2 className="h-4 w-4 text-ink-placeholder" />
          </div>
          <p className="m-0 text-sm leading-relaxed text-ink-placeholder">
            {"Recordings will appear here as each response is saved."}
          </p>
        </div>
      ) : (
        <div>
          {recordings.map((d) => (
            <RecordingRow
              deleting={deletingId === d.id}
              node={d}
              onDelete={onDelete}
              onPlay={handlePlay}
              key={d.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
export { RecordingLibrary };
