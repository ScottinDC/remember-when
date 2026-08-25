import { requireSupabaseAuthClient } from "./auth/supabase";
import { fetchOrCreateSupabaseInterview } from "./interview-store";
import type { InterviewState } from "./types";

const AUDIO_BUCKET = "interview-audio";

type ResponseRecord = {
  id: string;
  thread_id: string;
};

function audioFileDetails(audio: Blob) {
  const contentType = (audio.type.split(";", 1)[0]?.trim().toLowerCase() || "audio/webm");
  const extensionByType: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg"
  };
  const extension = extensionByType[contentType];
  if (!extension) {
    throw new Error("This recording format is not supported. Please record again in a supported browser.");
  }
  return { contentType, extension };
}

export async function saveSupabaseAnswer(questionId: string, audio: Blob): Promise<{ state: InterviewState }> {
  const supabase = requireSupabaseAuthClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (sessionError || !user) {
    throw new Error("Your Supabase sign-in has expired. Please sign in again.");
  }

  const { data: responseRecord, error: responseError } = await supabase
    .from("responses")
    .select("id, thread_id")
    .eq("id", questionId)
    .maybeSingle<ResponseRecord>();
  if (responseError || !responseRecord) {
    throw new Error("This interview question is no longer available.");
  }

  const { contentType, extension } = audioFileDetails(audio);
  const objectPath = `${user.id}/${responseRecord.thread_id}/${responseRecord.id}/source-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(objectPath, audio, {
    cacheControl: "31536000",
    contentType,
    upsert: false
  });
  if (uploadError) {
    throw new Error(`Could not upload the recording: ${uploadError.message}`);
  }

  const { error: processError } = await supabase.functions.invoke("process-answer", {
    body: { responseId: responseRecord.id, objectPath, contentType }
  });
  if (processError) {
    throw new Error("The recording was saved, but processing could not finish. Please refresh before trying again.");
  }

  return { state: await fetchOrCreateSupabaseInterview() };
}

export async function deleteSupabaseAnswer(questionId: string): Promise<{ state: InterviewState }> {
  const supabase = requireSupabaseAuthClient();
  const { error } = await supabase.functions.invoke("delete-answer", { body: { responseId: questionId } });
  if (error) {
    throw new Error("Could not clear this recording. Please try again.");
  }
  return { state: await fetchOrCreateSupabaseInterview() };
}
