import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
export default {
  fetch: withSupabase({ auth: "user" }, async (request, ctx) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST")
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers },
      );
    const body = await request.json().catch(() => null);
    if (typeof body?.responseId !== "string")
      return Response.json(
        { error: "Invalid request" },
        { status: 400, headers },
      );
    // Old clients archive safely. Permanent deletion requires an explicit UI confirmation flag.
    if (body.permanent !== true) {
      const { error } = await ctx.supabase.rpc("set_recording_archived", {
        p_response_id: body.responseId,
        p_archived: true,
      });
      return Response.json(
        error ? { error: "Recording unavailable" } : { status: "archived" },
        { status: error ? 403 : 200, headers },
      );
    }
    try {
      const { data: deletion, error } = await ctx.supabase.rpc(
        "prepare_recording_delete",
        { p_response_id: body.responseId },
      );
      if (error || !deletion)
        return Response.json(
          { error: "Recording unavailable" },
          { status: 403, headers },
        );
      const paths = deletion.paths as string[];
      for (let i = 0; i < paths.length; i += 100) {
        const { error: removeError } = await ctx.supabaseAdmin.storage
          .from("interview-audio")
          .remove(paths.slice(i, i + 100));
        if (removeError) throw removeError;
      }
      const { data: complete, error: finishError } =
        await ctx.supabaseAdmin.rpc("finish_recording_delete", {
          p_response_id: body.responseId,
          p_token: deletion.token,
        });
      if (finishError || !complete) throw new Error("Deletion incomplete");
      return Response.json({ status: "deleted" }, { headers });
    } catch {
      return Response.json(
        {
          error:
            "Deletion could not finish. This recording is locked; retry Delete permanently to finish.",
        },
        { status: 502, headers },
      );
    }
  }),
};
