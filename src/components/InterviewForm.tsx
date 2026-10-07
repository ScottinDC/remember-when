import { StoryWorkspace } from "./StoryWorkspace";
import { useEffect, useState } from "react";
import { Mic, Pause, Save } from "lucide-react";
import type { InterviewState } from "../types";
import { saveAnswer, regenerateQuestion } from "../api";
import {
  retryProcessing,
  setArchived,
  passQuestion,
  deleteSupabaseAnswer,
  type SaveStage,
} from "../answer-store";
import { chooseNextQuestion, formatTime } from "../lib/interview";
import { useRecorder } from "../useRecorder";
import { QuestionSeries } from "./QuestionSeries";
import { SankeyDiagram } from "./SankeyDiagram";
import { RecordingLibrary } from "./RecordingLibrary";
import { RecordingPlayer } from "./RecordingPlayer";
import { AudioWaveform } from "./AudioWaveform";
type Props = {
  state: InterviewState;
  onStateChange: (state: InterviewState) => void;
  setError: (error: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
};
export function InterviewForm({
  state,
  onStateChange,
  setError,
  onBusyChange,
}: Props) {
  const nodes = state.nodes.filter((n) => !n.archivedAt),
    next = chooseNextQuestion(nodes);
  const [activeId, setActiveId] = useState<string | null>(next?.id ?? null),
    [profile, setProfile] = useState(false),
    [story, setStory] = useState(false),
    [storyBusy, setStoryBusy] = useState(false),
    [replacing, setReplacing] = useState(false),
    [saving, setSaving] = useState(false),
    [stage, setStage] = useState<SaveStage | null>(null),
    [notice, setNotice] = useState("");
  const current = nodes.find((n) => n.id === activeId) ?? next;
  const recorder = useRecorder(
    current ? `${state.thread.id}:${current.id}` : null,
  );
  const busy =
    saving ||
    storyBusy ||
    recorder.draftLoading ||
    recorder.starting ||
    recorder.isRecording ||
    Boolean(recorder.audioBlob);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const saved = nodes.filter((n) => n.hasAudio || n.mp3Url),
    foundation = nodes.filter((n) => n.depth === 0).slice(0, 5);
  const hasAudio = Boolean(current?.hasAudio || current?.mp3Url);
  async function save() {
    if (!current || !recorder.audioBlob) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const result = await saveAnswer(current.id, recorder.audioBlob, setStage);
      recorder.reset();
      onStateChange(result.state);
      setReplacing(false);
      setNotice(
        result.warning ?? "Recording saved. Your next question is ready.",
      );
      setActiveId(
        chooseNextQuestion(result.state.nodes.filter((n) => !n.archivedAt))
          ?.id ?? current.id,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the recording.",
      );
    } finally {
      setSaving(false);
      setStage(null);
    }
  }
  function select(id: string) {
    if (!busy) {
      setActiveId(id);
      setReplacing(false);
    }
  }
  async function regenerate() {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      onStateChange((await regenerateQuestion(current.id)).state);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not change the question.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-6">
      <nav
        className="flex flex-wrap gap-3 border-b border-ink pb-4"
        aria-label="Interview navigation"
      >
        <button
          type="button"
          disabled={busy}
          className={profile || story ? "btn-secondary" : "btn-primary !w-auto"}
          onClick={() => {
            setProfile(false);
            setStory(false);
          }}
        >
          Record a memory
        </button>
        <button
          type="button"
          disabled={busy}
          className={profile ? "btn-primary !w-auto" : "btn-secondary"}
          onClick={() => {
            setProfile(true);
            setStory(false);
          }}
        >
          My recordings
        </button>
        <button
          type="button"
          disabled={busy}
          className={story ? "btn-primary !w-auto" : "btn-secondary"}
          onClick={() => {
            setStory(true);
            setProfile(false);
          }}
        >
          My story & downloads
        </button>
      </nav>
      {notice && (
        <p role="status" className="saved-notice">
          {notice}
        </p>
      )}
      {story ? (
        <StoryWorkspace
          state={state}
          onStateChange={onStateChange}
          onBusyChange={setStoryBusy}
        />
      ) : profile ? (
        <RecordingLibrary
          nodes={state.nodes}
          deletingId={null}
          onDelete={(id) => {
            setActiveId(id);
            setReplacing(true);
            setProfile(false);
          }}
          onRetry={async (id) => {
            onStateChange((await retryProcessing(id)).state);
          }}
          onPurge={async (id) => {
            onStateChange((await deleteSupabaseAnswer(id)).state);
          }}
          onArchive={async (id, value) => {
            onStateChange((await setArchived(id, value)).state);
          }}
        />
      ) : (
        <>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <QuestionSeries
              nodes={nodes}
              activeQuestionId={current?.id ?? null}
              onSelect={select}
            />
            <aside className="order-first lg:order-none">
              <section className="form-card card-body">
                <div className="flex justify-between items-baseline gap-3 mb-4">
                  <h2 className="panel-title">Your next memory</h2>
                  <span className="text-sm text-ink-secondary">
                    {saved.length} saved
                  </span>
                </div>
                <div
                  className="flex gap-3 mb-5"
                  aria-label="Starting questions"
                >
                  {foundation.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      disabled={busy}
                      onClick={() => select(n.id)}
                      aria-label={`Open question ${n.sequenceOrder}`}
                      aria-current={n.id === current?.id ? "step" : undefined}
                      className="question-step"
                    >
                      {n.hasAudio ? "✓" : n.sequenceOrder}
                    </button>
                  ))}
                </div>
                {current ? (
                  <div className="space-y-4">
                    <p className="field-label">
                      Question {current.sequenceOrder}
                    </p>
                    <p className="font-serif text-2xl leading-relaxed">
                      {current.question}
                    </p>
                    {hasAudio && !replacing && !recorder.audioBlob ? (
                      <>
                        <p className="saved-notice">
                          Recording saved
                          {current.status === "answered"
                            ? ""
                            : ". Your transcript or next question is still pending."}
                        </p>
                        <RecordingPlayer
                          responseId={current.id}
                          label={`Question ${current.sequenceOrder}`}
                        />
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setReplacing(true)}
                        >
                          Record a replacement
                        </button>
                      </>
                    ) : (
                      <>
                        {replacing && (
                          <p className="text-sm text-ink-secondary">
                            Your previous recording stays in Earlier recordings
                            after you save a replacement.
                          </p>
                        )}
                        {recorder.isRecording && recorder.stream && (
                          <AudioWaveform stream={recorder.stream} />
                        )}
                        <div
                          className="flex justify-between text-sm"
                          role="status"
                        >
                          <span>
                            {stage === "processing"
                              ? "Recording saved · preparing transcript"
                              : stage === "saving"
                                ? "Saving audio…"
                                : stage === "refreshing"
                                  ? "Updating your library…"
                                  : recorder.isRecording
                                    ? "Recording"
                                    : recorder.audioBlob
                                      ? "Draft ready to save"
                                      : "Ready to record"}
                          </span>
                          <span>{formatTime(recorder.seconds)} / 05:00</span>
                        </div>
                        {recorder.error && (
                          <p role="alert" className="text-red-800">
                            {recorder.error}
                          </p>
                        )}
                        {recorder.audioBlob ? (
                          <>
                            <audio
                              controls
                              src={recorder.audioUrl ?? undefined}
                              aria-label="Preview your recording"
                            />
                            <div className="flex flex-wrap gap-3">
                              <button
                                className="btn-primary !w-auto"
                                disabled={saving}
                                type="button"
                                onClick={save}
                              >
                                <Save className="h-4 w-4" />
                                {saving ? "Saving…" : "Save recording"}
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={saving}
                                type="button"
                                onClick={recorder.reset}
                              >
                                Discard draft
                              </button>
                            </div>
                            <p className="text-sm text-ink-secondary">
                              Stopped recordings are kept as drafts on this
                              device until you save or discard them.
                            </p>
                          </>
                        ) : (
                          <button
                            className={
                              recorder.isRecording
                                ? "btn-danger"
                                : "btn-primary"
                            }
                            type="button"
                            disabled={
                              saving ||
                              recorder.draftLoading ||
                              recorder.starting
                            }
                            onClick={
                              recorder.isRecording
                                ? recorder.stop
                                : recorder.start
                            }
                          >
                            {recorder.isRecording ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Mic className="h-4 w-4" />
                            )}
                            {recorder.draftLoading
                              ? "Checking saved draft…"
                              : recorder.isRecording
                                ? "Stop recording"
                                : "Record response"}
                          </button>
                        )}
                      </>
                    )}
                    {current.status === "pending" && !hasAudio && (
                      <div className="flex flex-wrap gap-4">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={regenerate}
                        >
                          Try a different question
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={async () => {
                            setSaving(true);
                            setError(null);
                            try {
                              const passed = !current.metadata?.skippedAt;
                              const result = await passQuestion(
                                current.id,
                                passed,
                              );
                              onStateChange(result.state);
                              setActiveId(
                                passed
                                  ? (chooseNextQuestion(result.state.nodes)
                                      ?.id ?? null)
                                  : current.id,
                              );
                              setNotice(
                                passed
                                  ? "Question passed for now. You can return to it from the chart."
                                  : "Question ready when you are.",
                              );
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Could not pass this question.",
                              );
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {current.metadata?.skippedAt
                            ? "Return to this question"
                            : "Pass for now"}
                        </button>
                      </div>
                    )}
                    <p className="text-sm text-ink-secondary">
                      When you save, OpenAI processes your audio to create a
                      transcript and suggest a follow-up question.
                    </p>
                  </div>
                ) : (
                  <p>
                    No unanswered questions are waiting. Open My recordings to
                    listen, or select a passed question in the chart to return
                    to it.
                  </p>
                )}
              </section>
            </aside>
          </div>
          <SankeyDiagram
            nodes={nodes}
            activeQuestionId={current?.id}
            onSelect={select}
            disabled={busy}
          />
        </>
      )}
    </div>
  );
}
