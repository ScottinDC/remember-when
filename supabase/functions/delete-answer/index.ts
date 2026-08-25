import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS"
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const userId = context.userClaims?.id;
    const body = await request.json().catch(() => null) as { responseId?: unknown } | null;
    const responseId = typeof body?.responseId === "string" ? body.responseId.trim() : "";
    if (!userId || !responseId) return json({ error: "Invalid clear request." }, 400);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceRoleKey) return json({ error: "Archive service is unavailable." }, 503);
    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: answer } = await admin
      .from("responses")
      .select("id, thread_id, storage_object_name, metadata, threads!inner(owner_id)")
      .eq("id", responseId)
      .maybeSingle<{ id: string; thread_id: string; storage_object_name: string | null; metadata: Record<string, unknown> | null; threads: { owner_id: string | null } | null }>();
    if (!answer || answer.threads?.owner_id !== userId) return json({ error: "Interview response not found." }, 404);

    if (answer.storage_object_name) {
      const { error: storageError } = await admin.storage.from("interview-audio").remove([answer.storage_object_name]);
      if (storageError) return json({ error: "Could not remove the private recording." }, 500);
    }
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("responses")
      .update({ transcript: null, mp3_url: null, gcs_object_name: null, storage_object_name: null, status: "pending", timestamp: now, metadata: answer.metadata })
      .eq("id", answer.id);
    if (updateError) return json({ error: "Could not reset the response." }, 500);
    await admin.from("threads").update({ updated_at: now }).eq("id", answer.thread_id);
    return json({ status: "cleared" });
  })
};
