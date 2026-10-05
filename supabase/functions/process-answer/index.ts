import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { followUp, transcribe } from "../_shared/ai.ts";
import { runSavedRecording, type Job } from "../_shared/processing.ts";
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    try {
      const body = await request.json();
      if (typeof body?.responseId !== "string" || body.responseId.length > 100)
        return json({ error: "Invalid response" }, 400);
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key)
        return json(
          {
            saved: true,
            error: "AI processing is unavailable. Your saved audio is safe.",
          },
          503,
        );
      if (body.action === "regenerate") {
        const { error: limitError } = await ctx.supabase.rpc(
          "reserve_question_generation",
          { p_response_id: body.responseId },
        );
        if (limitError)
          return json(
            { error: "Question unavailable or daily limit reached." },
            403,
          );
        const { data: answer, error } = await ctx.supabase
          .from("responses")
          .select("id,thread_id,parent_question_id,question")
          .eq("id", body.responseId)
          .single();
        if (error || !answer)
          return json({ error: "Question unavailable" }, 404);
        const { data: thread } = await ctx.supabase
          .from("threads")
          .select("story_options")
          .eq("id", answer.thread_id)
          .single();
        const parent = answer.parent_question_id
          ? (
              await ctx.supabase
                .from("responses")
                .select("question,transcript")
                .eq("id", answer.parent_question_id)
                .eq("thread_id", answer.thread_id)
                .single()
            ).data
          : null;
        const { data: history, error: historyError } = await ctx.supabase
          .from("responses")
          .select("question,transcript,status")
          .eq("thread_id", answer.thread_id)
          .order("timestamp", { ascending: false })
          .limit(20);
        if (historyError) throw historyError;
        const question = await followUp(
          parent?.question ?? answer.question,
          parent?.transcript ??
            "No answer yet. Offer a different question appropriate to the selected story options.",
          (history ?? []).reverse(),
          key,
          thread?.story_options,
        );
        const { data: updated, error: updateError } =
          await ctx.supabaseAdmin.rpc("replace_pending_question", {
            p_response_id: answer.id,
            p_owner: ctx.userClaims!.id,
            p_previous: answer.question,
            p_question: question,
          });
        if (updateError || !updated)
          return json(
            { error: "Question changed. Refresh and try again." },
            409,
          );
        return json({ status: "complete" });
      }
      const { data: job, error: claimError } = await ctx.supabase.rpc(
        "claim_recording_job",
        { p_response_id: body.responseId },
      );
      if (claimError)
        return json(
          {
            error:
              "Recording unavailable, or retry limit reached. Your audio remains saved.",
          },
          403,
        );
      if (!job)
        return json({ saved: true, processing: "already_running_or_complete" });
      const work = job as Job;
      const result = await runSavedRecording(work, {
        loadAudio: async () => {
          const { data, error } = await ctx.supabaseAdmin.storage
            .from("interview-audio")
            .download(work.objectPath);
          if (error || !data || data.size > 25000000)
            throw Error("audio_unavailable");
          return data;
        },
        transcribe: (audio) => transcribe(audio, work.contentType, key),
        followUp: async (transcript) => {
          const { data: children, error: childError } = await ctx.supabaseAdmin
            .from("responses")
            .select("id")
            .eq("parent_question_id", work.responseId)
            .limit(1);
          if (childError) throw childError;
          if (children?.length) return null;
          const { data: history, error } = await ctx.supabaseAdmin
            .from("responses")
            .select("question,transcript,status")
            .eq("thread_id", work.threadId)
            .order("timestamp", { ascending: false })
            .limit(20);
          if (error) throw error;
          const { data: thread, error: threadError } = await ctx.supabaseAdmin
            .from("threads")
            .select("story_options")
            .eq("id", work.threadId)
            .single();
          if (threadError) throw threadError;
          return followUp(
            work.question,
            transcript,
            (history ?? []).reverse(),
            key,
            thread?.story_options,
          );
        },
        finish: async (transcript, question, errorCode) => {
          const { data, error } = await ctx.supabaseAdmin.rpc(
            "finish_recording_job",
            {
              p_job_id: work.id,
              p_lease: work.lease,
              p_transcript: transcript,
              p_followup: question,
              p_error: errorCode,
            },
          );
          if (error) throw error;
          return data === true;
        },
      });
      return json(result);
    } catch {
      return json(
        {
          saved: true,
          error:
            "Processing interrupted. Your saved recording can be retried from My recordings.",
        },
        502,
      );
    }
  }),
};
