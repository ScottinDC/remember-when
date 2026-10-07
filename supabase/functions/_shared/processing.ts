export type Job = {
  id: string;
  lease: string;
  responseId: string;
  threadId: string;
  question: string;
  objectPath: string;
  contentType: string;
  transcript: string | null;
};
export type ProcessingDependencies = {
  loadAudio: () => Promise<Blob>;
  transcribe: (audio: Blob) => Promise<string>;
  followUp: (transcript: string) => Promise<string | null>;
  finish: (
    transcript: string | null,
    question: string | null,
    error: string | null,
  ) => Promise<boolean>;
};
/** The audio pointer is already committed by register_recording before this runs. */
export async function runSavedRecording(
  job: Job,
  dependencies: ProcessingDependencies,
) {
  let transcript = job.transcript;
  let question: string | null = null;
  let failure: string | null = null;
  try {
    transcript ??= await dependencies.transcribe(
      await dependencies.loadAudio(),
    );
    question = await dependencies.followUp(transcript);
  } catch {
    failure = transcript ? "followup_failed" : "transcription_failed";
  }
  const applied = await dependencies.finish(transcript, question, failure);
  return { saved: true, processing: failure ? "failed" : "complete", applied };
}
