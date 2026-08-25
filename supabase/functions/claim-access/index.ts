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

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (request, context) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405);
    }

    // Supabase JWTs use the standard `sub` claim for the authenticated user.
    // Keep `id` as a compatibility fallback for older local test runtimes.
    const userId = context.userClaims?.sub ?? context.userClaims?.id ?? null;
    const email = normalizedEmail(context.userClaims?.email);
    if (!userId || !email) {
      return json({ error: "A verified Google account email is required." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase service-role credentials are unavailable to claim-access.");
      return json({ error: "Access service is unavailable." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data, error } = await admin
      .from("access_grants")
      .update({
        user_id: userId,
        status: "active",
        linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("email", email)
      .in("status", ["invited", "active"])
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .select("role,status")
      .maybeSingle();

    if (error) {
      console.error("Unable to claim access grant:", error.message);
      return json({ error: "Could not verify access." }, 500);
    }

    if (!data) {
      return json({ error: "This Google account is not approved for the family archive." }, 403);
    }

    return json({ approved: true, role: data.role, status: data.status });
  })
};
