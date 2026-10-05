import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "cache-control": "no-store",
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
      if (typeof body?.responseId !== "string")
        return json({ error: "Invalid request" }, 400);
      const { data: audio, error } = await ctx.supabase.rpc("authorize_audio", {
        p_response_id: body.responseId,
        p_job_id: body.jobId ?? null,
      });
      if (error || !audio?.path)
        return json({ error: "Recording unavailable" }, 403);
      const { data, error: signError } = await ctx.supabaseAdmin.storage
        .from("interview-audio")
        .createSignedUrl(audio.path, 300);
      if (signError || !data)
        return json({ error: "Playback temporarily unavailable" }, 503);
      return json({
        url: data.signedUrl,
        contentType: audio.contentType,
        expiresAt: Date.now() + 300000,
      });
    } catch {
      return json({ error: "Playback unavailable" }, 500);
    }
  }),
};
