import { useState } from "react";
import type { MemoryNode } from "../types";
import { RecordingPlayer } from "./RecordingPlayer";
import { requireSupabaseAuthClient } from "../auth/supabase";
export function RecordingLibrary({
  nodes,
  onDelete,
  onRetry,
  onArchive,
  onPurge,
  deletingId,
}: {
  nodes: MemoryNode[];
  onDelete: (id: string) => void;
  deletingId: string | null;
  onRetry?: (id: string) => Promise<void>;
  onArchive?: (id: string, archived: boolean) => Promise<void>;
  onPurge?: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState(""),
    [archived, setArchived] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const [versions, setVersions] = useState<
    Record<string, { id: string; created_at: string; status: string }[]>
  >({});
  const recordings = nodes
    .filter((n) => n.hasAudio || n.mp3Url)
    .filter((n) => Boolean(n.archivedAt) === archived)
    .filter((n) =>
      `${n.question} ${n.transcript ?? ""}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  async function action(id: string, operation: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }
  async function history(id: string) {
    const { data, error } = await requireSupabaseAuthClient()
      .from("recording_jobs")
      .select("id,created_at,status")
      .eq("response_id", id)
      .order("created_at", { ascending: false });
    if (error) throw Error("Could not load earlier recordings.");
    setVersions((old) => ({ ...old, [id]: data ?? [] }));
  }
  return (
    <section className="form-card card-body">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="panel-title">My recordings</h2>
        <span>{recordings.length} recording{recordings.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-2 mb-4 text-ink-secondary">
        Your recordings, newest first. Listen, download, redo an answer, or
        remove a recording.
      </p>
      <div className="library-controls">
        <label>
          Find a memory
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search questions and transcripts"
          />
        </label>
        <label className="library-toggle flex gap-2 items-center">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Show archived recordings
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-800 my-3">
          {error}
        </p>
      )}
      {recordings.length === 0 ? (
        <p className="py-8 text-ink-secondary">
          {filter
            ? "No recordings match your search."
            : archived
              ? "No archived recordings."
              : "Your first saved recording will appear here."}
        </p>
      ) : (
        recordings.map((node) => (
          <article key={node.id} className="recording-entry">
            <p className="text-sm text-ink-secondary">
              Question {node.sequenceOrder} ·{" "}
              {new Date(node.timestamp).toLocaleDateString()} · Recording saved
            </p>
            <h3 className="font-serif text-xl my-2">{node.question}</h3>
            {node.transcript ? (
              <p className="whitespace-pre-wrap text-ink-secondary mb-4">
                {node.transcript}
              </p>
            ) : (
              <p className="text-ink-secondary mb-4">
                {node.status === "failed"
                  ? "The transcript needs another attempt. Your audio is safe."
                  : "The transcript is being prepared. Your audio is safe."}
              </p>
            )}
            {Boolean(node.metadata?.deletePending) ? (
              <p role="alert">
                Deletion is unfinished. Retry Delete permanently to finish
                removing this recording.
              </p>
            ) : (
              <RecordingPlayer
                responseId={node.id}
                label={`Recording for question ${node.sequenceOrder}`}
              />
            )}
            <div className="flex flex-wrap gap-3 mt-4">
              {!archived && (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={busy === node.id || deletingId === node.id}
                  onClick={() => onDelete(node.id)}
                >
                  Record a replacement
                </button>
              )}
              {!archived && node.status !== "answered" && onRetry && (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={busy === node.id}
                  onClick={() => action(node.id, () => onRetry(node.id))}
                >
                  {busy === node.id
                    ? "Working…"
                    : "Retry transcript & next question"}
                </button>
              )}
              {onArchive && (
                <button
                  type="button"
                  disabled={busy === node.id}
                  onClick={() =>
                    action(node.id, () => onArchive(node.id, !archived))
                  }
                >
                  {archived ? "Restore recording" : "Archive recording"}
                </button>
              )}
              {onPurge && (
                <button
                  type="button"
                  className="text-red-800"
                  disabled={busy !== null}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Permanently delete this answer's audio, transcript and all earlier takes? This cannot be undone. Its question and follow-up questions will remain so you can record again. Copies already downloaded or emailed cannot be recalled.",
                      )
                    )
                      void action(node.id, () => onPurge(node.id));
                  }}
                >
                  Delete permanently
                </button>
              )}
              <button
                type="button"
                disabled={busy === node.id}
                onClick={() => action(node.id, () => history(node.id))}
              >
                Earlier recordings
              </button>
            </div>
            {versions[node.id] && (
              <div className="mt-4">
                <h4 className="font-medium">Saved versions</h4>
                {versions[node.id].map((version) => (
                  <details key={version.id} className="py-2">
                    <summary>
                      {new Date(version.created_at).toLocaleString()} ·{" "}
                      {version.status}
                    </summary>
                    <RecordingPlayer
                      responseId={node.id}
                      jobId={version.id}
                      label="Earlier recording"
                    />
                  </details>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
