import { requireSupabaseAuthClient } from "./auth/supabase";
import { fetchOrCreateSupabaseInterview } from "./interview-store";
import type { InterviewState } from "./types";

const AUDIO_BUCKET = "interview-audio";

type ResponseRecord = {
  id: string;
  thread_id: string;
};

function audioFileDetails(audio: Blob) {
  const contentType =
    audio.type.split(";", 1)[0]?.trim().toLowerCase() || "audio/webm";
  const extensionByType: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg",
  };
  const extension = extensionByType[contentType];
  if (!extension) {
    throw new Error(
      "This recording format is not supported. Please record again in a supported browser.",
    );
  }
  return { contentType, extension };
}

export type SaveStage = "saving" | "processing" | "refreshing";

export async function saveSupabaseAnswer(
  questionId: string,
  audio: Blob,
  onStage?: (stage: SaveStage) => void,
): Promise<{ state: InterviewState; warning?: string }> {
  if (audio.size > 25_000_000)
    throw new Error(
      "This recording is too large. Please make a shorter recording.",
    );
  onStage?.("saving");
  const supabase = requireSupabaseAuthClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
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
  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(objectPath, audio, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Could not upload the recording: ${uploadError.message}`);
  }

  const { error: registerError } = await supabase.rpc("register_recording", {
    p_response_id: questionId,
    p_object_path: objectPath,
    p_content_type: contentType,
    p_bytes: audio.size,
  });
  if (registerError)
    throw new Error(
      "Your draft is still on this device. Could not confirm the recording was saved; please try again.",
    );
  onStage?.("processing");
  const { data, error } = await supabase.functions.invoke("process-answer", {
    body: { responseId: questionId },
  });
  onStage?.("refreshing");
  let state: InterviewState;
  try {
    state = await fetchOrCreateSupabaseInterview();
  } catch {
    throw new Error(
      "Your recording was saved, but the library could not refresh. Reload this page to check it before saving another copy.",
    );
  }
  return {
    state,
    warning:
      error || data?.processing === "failed"
        ? "Recording saved. You can retry the transcript and next question from My recordings."
        : undefined,
  };
}

export async function processRecording(questionId: string) {
  const supabase = requireSupabaseAuthClient();
  const { data, error } = await supabase.functions.invoke("process-answer", {
    body: { responseId: questionId },
  });
  if (error || data?.processing === "failed")
    throw new Error(
      "Your recording is safe. Processing could not finish; try again later.",
    );
}

export async function retryProcessing(questionId: string) {
  await processRecording(questionId);
  return { state: await fetchOrCreateSupabaseInterview() };
}

export async function setArchived(questionId: string, archived: boolean) {
  const { error } = await requireSupabaseAuthClient().rpc(
    "set_recording_archived",
    { p_response_id: questionId, p_archived: archived },
  );
  if (error) throw new Error("Could not update the recording.");
  return { state: await fetchOrCreateSupabaseInterview() };
}

export async function recordingLink(
  responseId: string,
  jobId?: string,
): Promise<{ url: string; contentType: string | null; expiresAt: number }> {
  const { data, error } = await requireSupabaseAuthClient().functions.invoke(
    "archive-audio",
    { body: { responseId, jobId } },
  );
  if (error || !data?.url)
    throw new Error(
      "Could not open this recording. Please sign in again if your session expired.",
    );
  return data;
}

export async function deleteSupabaseAnswer(
  questionId: string,
): Promise<{ state: InterviewState }> {
  const supabase = requireSupabaseAuthClient();
  const { error } = await supabase.functions.invoke("delete-answer", {
    body: { responseId: questionId, permanent: true },
  });
  if (error) {
    throw new Error(
      "Deletion could not finish. Please retry Delete permanently.",
    );
  }
  return { state: await fetchOrCreateSupabaseInterview() };
}

export async function regenerateSupabaseQuestion(questionId: string) {
  const { error } = await requireSupabaseAuthClient().functions.invoke(
    "process-answer",
    { body: { responseId: questionId, action: "regenerate" } },
  );
  if (error)
    throw new Error(
      "Could not generate another question. Your current question is unchanged.",
    );
  return { state: await fetchOrCreateSupabaseInterview() };
}

export async function passQuestion(questionId: string, passed: boolean) {
  const { error } = await requireSupabaseAuthClient().rpc(
    "set_question_passed",
    { p_response_id: questionId, p_passed: passed },
  );
  if (error) throw new Error("Could not update this question.");
  return { state: await fetchOrCreateSupabaseInterview() };
}
export async function saveStoryOptions(
  threadId: string,
  options: import("../supabase/functions/_shared/story-options").StoryOptions,
) {
  const { error } = await requireSupabaseAuthClient().rpc(
    "save_story_options",
    { p_thread_id: threadId, p_options: options },
  );
  if (error) throw new Error("Could not save story options.");
  return { state: await fetchOrCreateSupabaseInterview() };
}
