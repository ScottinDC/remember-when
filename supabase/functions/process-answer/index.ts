import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { withSupabase } from "@supabase/server";

const AUDIO_BUCKET = "interview-audio";
const MAX_AUDIO_BYTES = 35 * 1024 * 1024;
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};

type ProcessRequest = {
  responseId?: unknown;
  objectPath?: unknown;
  contentType?: unknown;
};

type ResponseRow = {
  id: string;
  thread_id: string;
  question: string;
  parent_question_id: string | null;
  metadata: Record<string, unknown> | null;
  threads: { owner_id: string | null } | null;
};

type ThreadResponse = {
  question: string;
  transcript: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function text(value: unknown, maxLength = 8_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function responseOutput(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText.trim();
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => (item && typeof item === "object" && Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: Array<{ text?: unknown }> }).content
      : []))
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("\n")
    .trim();
}

async function transcribe(audio: Blob, contentType: string, apiKey: string) {
  const extensionByType: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/ogg": "ogg"
  };
  const form = new FormData();
  form.append("model", Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") ?? "whisper-1");
  form.append("file", new File([audio], `answer.${extensionByType[contentType] ?? "webm"}`, { type: contentType }));
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const payload = await response.json().catch(() => null) as { text?: unknown; error?: { message?: unknown } } | null;
  if (!response.ok || typeof payload?.text !== "string" || !payload.text.trim()) {
    throw new Error(text(payload?.error?.message, 300) || "Transcription failed.");
  }
  return payload.text.trim();
}

async function generateFollowUp(question: string, transcript: string, history: ThreadResponse[], apiKey: string) {
  const priorAnswers = history
    .filter((item) => item.status === "answered" && item.transcript)
    .map((item) => `Question: ${item.question}\nAnswer: ${item.transcript}`)
    .join("\n\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini",
      temperature: 0.8,
      max_output_tokens: 90,
      input: [
        {
          role: "system",
          content: "You are a compassionate oral historian. Ask one concise, open-ended follow-up question that helps preserve a personal life story. Do not repeat a question already asked. Return only the question."
        },
        {
          role: "user",
          content: `Current question: ${question}\n\nAnswer: ${transcript}\n\nEarlier interview context:\n${priorAnswers || "None yet."}`
        }
      ]
    })
  });
  const payload = await response.json().catch(() => null);
  const followUp = responseOutput(payload);
  if (!response.ok || !followUp) {
    throw new Error("Could not generate a follow-up question.");
  }
  return followUp.slice(0, 1_000);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const userId = context.userClaims?.id;
    if (!userId) return json({ error: "Sign in required." }, 401);
    const payload = await request.json().catch(() => null) as ProcessRequest | null;
    const responseId = text(payload?.responseId, 100);
    const objectPath = text(payload?.objectPath, 500);
    const contentType = text(payload?.contentType, 100);
    const allowedTypes = new Set(["audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg"]);
    if (!responseId || !objectPath || !allowedTypes.has(contentType)) {
      return json({ error: "Invalid audio processing request." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceRoleKey || !openAiKey) {
      console.error("Required processing secrets are unavailable.");
      return json({ error: "Audio processing is not configured yet." }, 503);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: grant } = await admin.from("access_grants").select("status").eq("user_id", userId).maybeSingle();
    if (grant?.status !== "active") return json({ error: "Access is not approved." }, 403);

    const { data: answer, error: answerError } = await admin
      .from("responses")
      .select("id, thread_id, question, parent_question_id, metadata, threads!inner(owner_id)")
      .eq("id", responseId)
      .maybeSingle<ResponseRow>();
    if (answerError || !answer || answer.threads?.owner_id !== userId) {
      return json({ error: "Interview response not found." }, 404);
    }
    const responseDirectory = `${userId}/${answer.thread_id}/${answer.id}/`;
    const isExpectedAudioPath = objectPath.startsWith(`${responseDirectory}source.`) || objectPath.startsWith(`${responseDirectory}source-`);
    if (!isExpectedAudioPath) return json({ error: "Audio path is not authorized." }, 403);

    const { data: audio, error: downloadError } = await admin.storage.from(AUDIO_BUCKET).download(objectPath);
    if (downloadError || !audio || audio.size > MAX_AUDIO_BYTES) {
      return json({ error: "Could not read the uploaded recording." }, 400);
    }

    const { data: lockedAnswer, error: lockError } = await admin
      .from("responses")
      .update({ status: "processing", storage_object_name: objectPath, timestamp: new Date().toISOString() })
      .eq("id", answer.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (lockError) return json({ error: "Could not start audio processing." }, 500);
    if (!lockedAnswer) {
      const { data: current } = await admin.from("responses").select("status").eq("id", answer.id).maybeSingle();
      return json({ status: current?.status === "answered" ? "complete" : "processing" });
    }
    try {
      const transcript = await transcribe(audio, contentType, openAiKey);
      const { data: history } = await admin
        .from("responses")
        .select("question, transcript, status, metadata")
        .eq("thread_id", answer.thread_id)
        .order("timestamp", { ascending: true });
      const followUp = await generateFollowUp(answer.question, transcript, history ?? [], openAiKey);
      const now = new Date().toISOString();
      const followUpSequenceOrder = Math.max(
        5,
        ...(history ?? []).flatMap((item) => {
          const sequenceOrder = item.metadata?.sequenceOrder;
          return typeof sequenceOrder === "number" && Number.isInteger(sequenceOrder) ? [sequenceOrder] : [];
        })
      ) + 1;
      const { error: answerUpdateError } = await admin
        .from("responses")
        .update({
          transcript,
          status: "answered",
          storage_object_name: objectPath,
          timestamp: now,
          metadata: { ...(answer.metadata ?? {}), generatedBy: Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini" }
        })
        .eq("id", answer.id);
      if (answerUpdateError) throw answerUpdateError;
      const { error: followUpError } = await admin.from("responses").insert({
        id: crypto.randomUUID(), thread_id: answer.thread_id, parent_question_id: answer.id, question: followUp, status: "pending", created_at: now, timestamp: now,
        metadata: {
          generatedBy: Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini",
          guidedByAnswerId: answer.id,
          sequenceOrder: followUpSequenceOrder
        }
      });
      if (followUpError) throw followUpError;
      await admin.from("threads").update({ updated_at: now }).eq("id", answer.thread_id);
      return json({ status: "complete" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio processing failed.";
      console.error("process-answer failed:", message);
      await admin.from("responses").update({ status: "failed", timestamp: new Date().toISOString(), metadata: { error: message }, storage_object_name: objectPath }).eq("id", answer.id);
      return json({ error: "Could not process this recording." }, 500);
    }
  })
};
