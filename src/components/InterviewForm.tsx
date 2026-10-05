import type { InterviewState } from "../types";
import type { SaveStage } from "../answer-store";
// Recovered from the September 17 deployment; see docs/SOURCE-RECOVERY.md.
import React from "react";
import { Check, Loader2, Mic, Pause, RotateCcw, Save } from "lucide-react";
import {
  sortBySeries,
  answeredNodes,
  chooseNextQuestion,
  pendingNodes,
  FOUNDATION_COUNT,
  questionNumber,
  promptLabel,
  formatTime,
} from "../lib/interview";
import { useRecorder } from "../useRecorder";
import { saveAnswer, regenerateQuestion } from "../api";
import { QuestionSeries } from "./QuestionSeries";
import { RecordingLibrary } from "./RecordingLibrary";
import { SankeyDiagram } from "./SankeyDiagram";
import { AudioWaveform } from "./AudioWaveform";
const SAVE_STAGES = {
  saving: {
    label: "Saving recording…",
    detail: "Uploading your audio securely. Please keep this page open.",
  },
  processing: {
    label: "Processing answer…",
    detail:
      "Your audio is uploaded. Transcribing your answer and preparing follow-up questions.",
  },
  refreshing: {
    label: "Updating interview…",
    detail: "Loading your saved answer and the latest questions.",
  },
};
function InterviewForm({
  state,
  onStateChange,
  setError,
}: {
  state: InterviewState;
  onStateChange: (state: InterviewState) => void;
  setError: (error: string | null) => void;
}) {
  const nodes = state.nodes,
    sorted = sortBySeries(nodes),
    saved = answeredNodes(nodes),
    nextQuestion = chooseNextQuestion(nodes),
    recorder = useRecorder(),
    [saving, setSaving] = React.useState(false),
    [saveStage, setSaveStage] = React.useState<SaveStage | null>(null),
    [showProfile, setShowProfile] = React.useState(false),
    [replacing, setReplacing] = React.useState(false),
    [activeQuestionId, setActiveQuestionId] = React.useState<string | null>(
      (nextQuestion == null ? void 0 : nextQuestion.id) ?? null,
    );
  React.useEffect(() => {
    !activeQuestionId && nextQuestion && setActiveQuestionId(nextQuestion.id);
  }, [nextQuestion, activeQuestionId]);
  const current =
      nodes.find((ye) => ye.id === activeQuestionId) ?? nextQuestion,
    foundation = sorted
      .filter((ye) => ye.depth === 0)
      .slice(0, FOUNDATION_COUNT),
    foundationSaved = saved.filter((ye) => ye.depth === 0).length,
    foundationComplete =
      foundation.length === FOUNDATION_COUNT &&
      foundationSaved === FOUNDATION_COUNT,
    pending = pendingNodes(nodes),
    progressSteps = foundationComplete ? pending : foundation,
    progress = Math.min(100, (recorder.seconds / recorder.maxSeconds) * 100);
  async function handleSaveCurrent() {
    var ye;
    if (
      !(
        !current ||
        (!replacing &&
          current.status !== "pending" &&
          current.status !== "failed") ||
        !recorder.audioBlob
      )
    ) {
      (setSaving(true), setError(null));
      try {
        const Me = await saveAnswer(
          current.id,
          recorder.audioBlob,
          setSaveStage,
        );
        (recorder.reset(),
          setReplacing(false),
          onStateChange(Me.state),
          Me.warning && setError(Me.warning),
          setActiveQuestionId(
            ((ye = chooseNextQuestion(Me.state.nodes)) == null
              ? void 0
              : ye.id) ?? null,
          ));
      } catch (Me) {
        setError(
          Me instanceof Error ? Me.message : "Could not save the response.",
        );
      } finally {
        (setSaving(false), setSaveStage(null));
      }
    }
  }
  function handleSelect(ye: string) {
    saving ||
      recorder.isRecording ||
      recorder.audioBlob ||
      (setActiveQuestionId(ye), setReplacing(false));
  }
  function handleRerecord(ye: string) {
    saving ||
      recorder.isRecording ||
      recorder.audioBlob ||
      (setActiveQuestionId(ye), setReplacing(true), setShowProfile(false));
  }
  async function handleRegenerate() {
    if (current) {
      (setSaving(true), setError(null));
      try {
        onStateChange((await regenerateQuestion(current.id)).state);
      } catch (ye) {
        setError(
          ye instanceof Error ? ye.message : "Could not replace question.",
        );
      } finally {
        setSaving(false);
      }
    }
  }
  return (
    <div className="flex w-full flex-col gap-6">
      <nav
        className="flex flex-wrap gap-2 border-b border-ink pb-4"
        aria-label="Interview navigation"
      >
        <button
          type="button"
          className={
            showProfile ? "btn-secondary !w-auto" : "btn-primary !w-auto"
          }
          onClick={() => setShowProfile(false)}
        >
          {"Interview"}
        </button>
        <button
          type="button"
          disabled={saving || recorder.isRecording || !!recorder.audioBlob}
          className={
            showProfile ? "btn-primary !w-auto" : "btn-secondary !w-auto"
          }
          onClick={() => setShowProfile(true)}
        >
          {"My profile"}
        </button>
      </nav>
      {showProfile ? (
        <RecordingLibrary
          deletingId={null}
          nodes={nodes}
          onDelete={handleRerecord}
        />
      ) : (
        <React.Fragment>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
            <QuestionSeries
              activeQuestionId={activeQuestionId}
              nodes={sorted}
              onSelect={handleSelect}
            />
            <aside className="order-first flex flex-col gap-4 lg:order-none">
              <section className="form-card card-body">
                <div className="mb-4">
                  <div
                    aria-label={
                      foundationComplete
                        ? `${pending.length} questions awaiting an answer`
                        : `${foundationSaved} of ${foundation.length} starting questions saved`
                    }
                    className="flex items-center gap-0 font-mono"
                    role="status"
                  >
                    {progressSteps.map((ye, Me) => {
                      const $ =
                          !foundationComplete &&
                          saved.some(
                            (D) =>
                              D.sequenceOrder === ye.sequenceOrder ||
                              D.id === ye.id,
                          ),
                        O = ye.id === (current == null ? void 0 : current.id);
                      return (
                        <React.Fragment key={ye.id}>
                          <button
                            aria-current={O ? "step" : void 0}
                            aria-label={`Open question ${questionNumber(ye)}`}
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-light disabled:cursor-not-allowed ${$ ? "bg-navy text-white" : O ? "border-[1.5px] border-line-hair bg-white text-ink-faint ring-2 ring-navy/20" : "border-[1.5px] border-line-hair bg-white text-[#b3ada3]"}`}
                            disabled={
                              saving ||
                              recorder.isRecording ||
                              !!recorder.audioBlob
                            }
                            onClick={() => handleSelect(ye.id)}
                            title={`Open question ${questionNumber(ye)}`}
                            type="button"
                          >
                            {$ ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              questionNumber(ye)
                            )}
                          </button>
                          {Me < progressSteps.length - 1 ? (
                            <div
                              className={`h-[1.5px] flex-1 ${$ ? "bg-navy/50" : "bg-line-hair"}`}
                            />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                    {progressSteps.length === 0 ? (
                      <Check
                        aria-hidden="true"
                        className="h-5 w-5 text-success"
                      />
                    ) : null}
                  </div>
                  {foundationComplete ? (
                    <p className="mt-3 text-sm text-ink-secondary">
                      {FOUNDATION_COUNT}
                      {" starting questions complete"}
                      {pending.length > 0
                        ? ` · ${pending.length} questions awaiting an answer`
                        : " · All current questions answered"}
                    </p>
                  ) : null}
                </div>
                <div className="mb-4 flex items-baseline justify-between border-b border-line-soft pb-3">
                  <h2 className="panel-title">{"Current Question"}</h2>
                  <span className="text-sm text-ink-secondary tabular-nums">
                    {foundationComplete
                      ? `${pending.length} ready`
                      : `${String(foundationSaved).padStart(2, "0")} / ${String(foundation.length).padStart(2, "0")} saved`}
                  </span>
                </div>
                {current ? (
                  <div className="space-y-4">
                    <div>
                      <p className="field-label mb-2">{promptLabel(current)}</p>
                      <p className="font-serif text-2xl leading-relaxed text-ink md:text-[28px]">
                        {current.question}
                      </p>
                    </div>
                    {current.status === "pending" &&
                    current.parentQuestionId ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          saving || recorder.isRecording || !!recorder.audioBlob
                        }
                        onClick={handleRegenerate}
                      >
                        {saving ? "Please wait…" : "Generate another question"}
                      </button>
                    ) : null}
                    {recorder.isRecording && recorder.stream ? (
                      <AudioWaveform stream={recorder.stream} />
                    ) : null}
                    {replacing ? (
                      <p className="border-l-2 border-navy-light bg-[#f5f5f5] px-3 py-2 text-sm">
                        {
                          "The previous recording will be deleted after you save its replacement."
                        }
                      </p>
                    ) : null}
                    {current.status !== "processing" &&
                    (current.status !== "answered" || replacing) ? (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between font-mono">
                          <span
                            role="status"
                            className="flex items-center gap-2 text-sm text-ink-secondary"
                          >
                            {recorder.isRecording ? (
                              <span
                                aria-hidden="true"
                                className="inline-block h-2 w-2 shrink-0 rounded-full bg-record"
                              />
                            ) : null}
                            {saveStage
                              ? SAVE_STAGES[saveStage].label
                              : recorder.isRecording
                                ? "Recording"
                                : recorder.audioBlob
                                  ? "Ready to save"
                                  : "Ready to record"}
                          </span>
                          <span className="text-sm tabular-nums text-ink-secondary">
                            {formatTime(recorder.seconds)}{" "}
                            <span>
                              {"/ "}
                              {formatTime(recorder.maxSeconds)}
                            </span>
                          </span>
                        </div>
                        <div className="mb-4 h-1 overflow-hidden bg-line-soft">
                          <div
                            className="h-full bg-navy transition-all"
                            style={{
                              width: `${progress}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {recorder.error ? (
                      <p className="text-sm text-[#9b2c2c]">{recorder.error}</p>
                    ) : null}
                    {saveStage ? (
                      <p
                        role="status"
                        className="rounded-xl bg-fill p-3 text-sm text-ink-secondary"
                      >
                        {SAVE_STAGES[saveStage].detail}
                      </p>
                    ) : null}
                    {current.status === "answered" && !replacing ? (
                      <div className="space-y-3 border-l-2 border-navy-light bg-[#f5f5f5] p-4">
                        <p className="field-label">{"Saved response"}</p>
                        {current.mp3Url ? (
                          <audio controls={true} src={current.mp3Url}>
                            <track kind="captions" />
                          </audio>
                        ) : null}
                        {current.transcript ? (
                          <p className="text-sm leading-relaxed text-ink-secondary">
                            {current.transcript}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setReplacing(true)}
                        >
                          {"Re-record answer"}
                        </button>
                      </div>
                    ) : current.status === "processing" ? (
                      <p className="flex items-center gap-2 text-sm text-ink-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {" Processing this answer and preparing its follow-up."}
                      </p>
                    ) : recorder.audioUrl ? (
                      <div className="space-y-3">
                        <audio controls={true} src={recorder.audioUrl}>
                          <track kind="captions" />
                        </audio>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="btn-secondary !w-auto"
                            disabled={saving}
                            onClick={() => {
                              (recorder.reset(), setReplacing(false));
                            }}
                            type="button"
                          >
                            {"Discard"}
                          </button>
                          <button
                            className="btn-secondary !w-auto"
                            disabled={saving}
                            onClick={recorder.reset}
                            type="button"
                          >
                            <RotateCcw className="h-4 w-4" />
                            {"Re-record"}
                          </button>
                          <button
                            className="btn-primary !w-auto"
                            disabled={saving}
                            onClick={handleSaveCurrent}
                            type="button"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            {saveStage
                              ? SAVE_STAGES[saveStage].label
                              : "Save response"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={
                          recorder.isRecording ? "btn-danger" : "btn-primary"
                        }
                        disabled={saving}
                        onClick={
                          recorder.isRecording ? recorder.stop : recorder.start
                        }
                        type="button"
                      >
                        {recorder.isRecording ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                        {recorder.isRecording
                          ? "Stop recording"
                          : "Record response"}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {
                      "All current questions are saved. Choose another from the question series."
                    }
                  </p>
                )}
              </section>
            </aside>
          </div>
          <SankeyDiagram
            disabled={saving || recorder.isRecording || !!recorder.audioBlob}
            activeQuestionId={(current == null ? void 0 : current.id) ?? null}
            nodes={nodes}
            onSelect={handleSelect}
          />
        </React.Fragment>
      )}
    </div>
  );
}
export { InterviewForm };
