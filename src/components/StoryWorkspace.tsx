import { useEffect, useRef, useState } from "react";
import type { InterviewState } from "../types";
import {
  storyChoices,
  normalizeStoryOptions,
  storyArc,
  type StoryOptions,
} from "../../supabase/functions/_shared/story-options";
import { saveStoryOptions } from "../answer-store";
import {
  exportableRecordings,
  storyText,
  storyDocument,
  downloadBlob,
} from "../lib/story-export";
import { combinedMp3 } from "../lib/audio-export";
const labels: Record<keyof StoryOptions, string> = {
  mode: "What kind of story?",
  length: "How much would you like to tell?",
  perspective: "Whose perspective?",
  framing: "How should it unfold?",
  tone: "Voice and tone",
  audience: "Who is it for?",
};
export function StoryWorkspace({
  state,
  onStateChange,
  onBusyChange,
}: {
  state: InterviewState;
  onStateChange: (state: InterviewState) => void;
  onBusyChange?: (value: boolean) => void;
}) {
  const [options, setOptions] = useState(() =>
    normalizeStoryOptions(state.thread.storyOptions),
  );
  const available = exportableRecordings(state.nodes).sort(
    (a, b) => a.treeOrder - b.treeOrder || a.sequenceOrder - b.sequenceOrder,
  );
  const [order, setOrder] = useState(() => available.map((n) => n.id));
  const [selected, setSelected] = useState(
    () => new Set(available.map((n) => n.id)),
  );
  const [title, setTitle] = useState(state.thread.title),
    [questions, setQuestions] = useState(true),
    [format, setFormat] = useState("docx"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const cancel = useRef<AbortController | null>(null);
  const recordings = order
    .map((id) => available.find((n) => n.id === id))
    .filter((n) => n !== undefined);
  const chosen = recordings.filter((n) => selected.has(n.id));
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => () => cancel.current?.abort(), []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      onStateChange((await saveStoryOptions(state.thread.id, options)).state);
      setMessage(
        "Story choices saved. They will guide new and regenerated questions; existing recordings stay as you told them.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save choices.");
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!chosen.length) return;
    setBusy(true);
    setError("");
    setMessage("Preparing your download…");
    const controller = new AbortController();
    cancel.current = controller;
    try {
      const blob =
        format === "mp3"
          ? await combinedMp3(chosen, setMessage, controller.signal)
          : format === "docx"
            ? await storyDocument(title, chosen, questions)
            : new Blob([storyText(title, chosen, questions)], {
                type: "text/plain;charset=utf-8",
              });
      if (controller.signal.aborted) return;
      downloadBlob(blob, `remember-when-story.${format}`);
      setMessage(
        "Your download is ready. It contains only the recordings you selected, in the order shown.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
      setMessage("");
    } finally {
      cancel.current = null;
      setBusy(false);
    }
  }
  function move(index: number, direction: number) {
    const next = [...order];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setOrder(next);
  }
  return (
    <div className="space-y-6">
      <section className="form-card card-body">
        <h2 className="panel-title">Your story, your way</h2>
        <p className="mt-2 text-ink-secondary">
          Choose a direction, then tell it in your own words. You can change
          these choices as your story grows.
        </p>
        <div className="story-options">
          {(Object.keys(storyChoices) as (keyof StoryOptions)[]).map((key) => (
            <label key={key}>
              {labels[key]}
              <select
                disabled={busy}
                value={options[key]}
                onChange={(e) =>
                  setOptions({ ...options, [key]: e.target.value })
                }
              >
                {storyChoices[key].map((c) => (
                  <option value={c[0]} key={c[0]}>
                    {c[1]}
                  </option>
                ))}
              </select>
              <span className="text-sm text-ink-secondary">
                {storyChoices[key].find((c) => c[0] === options[key])?.[2]}
              </span>
            </label>
          ))}
        </div>
        <p className="text-sm text-ink-secondary mb-4">
          Length estimates describe a future edited story, not a promise to
          expand your memories to a word count. Downloads below contain your
          original audio or transcript.
        </p>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={save}
        >
          Save story choices
        </button>
        <h3 className="font-serif text-xl mt-6 mb-3">How this arc unfolds</h3>
        <ol className="story-arc">
          {storyArc(options).map((stage, i) => (
            <li key={stage.title}>
              <span className="text-sm text-ink-secondary">
                {i + 1} · {stage.subtitle}
              </span>
              <h4 className="font-medium">{stage.title}</h4>
              <p>{stage.question}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink-secondary mt-3">
          A guide, not a required path. Revisit any stage, pass on a question,
          or follow an unexpected memory. The question chart shows your actual
          conversation.
        </p>
      </section>
      <section className="form-card card-body">
        <h2 className="panel-title">Download your story</h2>
        <p className="mt-2 mb-4 text-ink-secondary">
          Choose recordings and arrange them below. The MP3 combines your
          original voice. Word and text preserve the available transcripts; they
          do not rewrite your story.
        </p>
        <div className="story-options">
          <label>
            Download title
            <input
              value={title}
              maxLength={150}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            File format
            <select
              value={format}
              disabled={busy}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="docx">Word document (.docx)</option>
              <option value="txt">Plain text (.txt)</option>
              <option value="mp3">One audio file (.mp3)</option>
            </select>
          </label>
        </div>
        {format !== "mp3" && (
          <label className="flex gap-2 items-center my-3">
            <input
              type="checkbox"
              checked={questions}
              disabled={busy}
              onChange={(e) => setQuestions(e.target.checked)}
            />
            Include the questions
          </label>
        )}
        {!recordings.length ? (
          <p className="my-6">Your saved recordings will appear here.</p>
        ) : (
          <>
            <div className="flex gap-4 my-3">
              <button
                disabled={busy}
                onClick={() => setSelected(new Set(order))}
              >
                Select all
              </button>
              <button disabled={busy} onClick={() => setSelected(new Set())}>
                Clear selection
              </button>
            </div>
            <ol className="export-recordings">
              {recordings.map((n, i) => (
                <li key={n.id}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={selected.has(n.id)}
                      onChange={(e) =>
                        setSelected((old) => {
                          const next = new Set(old);
                          if (e.target.checked) next.add(n.id);
                          else next.delete(n.id);
                          return next;
                        })
                      }
                    />
                    <span>
                      Q{n.sequenceOrder} · {n.question}
                      {!n.transcript && (
                        <small className="block">
                          Audio available · transcript pending
                        </small>
                      )}
                    </span>
                  </label>
                  <div className="flex gap-3">
                    <button
                      disabled={busy || i === 0}
                      aria-label={`Move question ${n.sequenceOrder} earlier`}
                      onClick={() => move(i, -1)}
                    >
                      ↑ Earlier
                    </button>
                    <button
                      disabled={busy || i === recordings.length - 1}
                      aria-label={`Move question ${n.sequenceOrder} later`}
                      onClick={() => move(i, 1)}
                    >
                      ↓ Later
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="flex gap-3 flex-wrap mt-5">
          <button
            type="button"
            className="btn-primary !w-auto"
            disabled={busy || !chosen.length}
            onClick={download}
          >
            Download {chosen.length} recording{chosen.length === 1 ? "" : "s"}
          </button>
          {busy && cancel.current && (
            <button onClick={() => cancel.current?.abort()}>
              Cancel export
            </button>
          )}
        </div>
        {format === "mp3" && (
          <p className="text-sm text-ink-secondary mt-3">
            Keep this page open while the MP3 is prepared on your device. For a
            long story, a computer works best. Up to three hours per download.
          </p>
        )}
      </section>
      {message && (
        <p role="status" className="saved-notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
