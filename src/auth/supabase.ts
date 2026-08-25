import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const usesSupabaseAuth = import.meta.env.VITE_AUTH_PROVIDER === "supabase";

export const supabaseAuthClient: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          // This is a browser-only SPA with no callback server. Implicit OAuth
          // keeps the session exchange in the browser and avoids PKCE verifier
          // races between multiple open static-app tabs.
          flowType: "implicit",
          persistSession: true,
          autoRefreshToken: true,
          // identity.ts restores the implicit callback explicitly. Disabling
          // the SDK's parallel handler avoids two consumers racing over the
          // same URL fragment during React bootstrap.
          detectSessionInUrl: false
        }
      })
    : null;

export function requireSupabaseAuthClient() {
  if (!supabaseAuthClient) {
    throw new Error("Supabase Auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  return supabaseAuthClient;
}
