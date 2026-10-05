import { requireSupabaseAuthClient } from "./supabase";

export type AuthUser = { email: string; id: string; role?: string };
export type AuthConfig = {
  authRequired: true;
  authConfigured: true;
  hasAllowedEmailsKey: true;
};
export type AuthConfigStatus = "loading" | "loaded" | "failed";

let accessToken: string | null = null;
let implicitRestore: Promise<void> | null = null;

export function hasPendingOAuthReturn() {
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).has(
    "access_token",
  );
}

export function getStoredAccessToken() {
  return accessToken;
}

export async function resolveSupabaseSession(): Promise<AuthUser | null> {
  const client = requireSupabaseAuthClient();
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const callbackAccessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (callbackAccessToken && refreshToken) {
    implicitRestore ??= (async () => {
      const { error } = await client.auth.setSession({
        access_token: callbackAccessToken,
        refresh_token: refreshToken,
      });
      if (error)
        throw new Error(
          `Could not restore your Supabase sign-in (${error.code ?? error.name}).`,
        );
      window.history.replaceState(null, "", window.location.pathname);
    })();
    await implicitRestore;
  }

  const { data, error } = await client.auth.getSession();
  if (error)
    throw new Error(
      `Could not restore your Supabase sign-in (${error.code ?? error.name}).`,
    );
  const email = data.session?.user.email?.trim().toLowerCase();
  if (!data.session || !email) return null;
  accessToken = data.session.access_token;
  return { email, id: data.session.user.id };
}

export async function claimSupabaseAccess() {
  const { data, error } = await requireSupabaseAuthClient().functions.invoke(
    "claim-access",
    { method: "POST" },
  );
  if (error)
    throw new Error("Could not verify family access. Please try again.");
  const result = data as {
    approved?: boolean;
    error?: string;
    role?: string;
  } | null;
  if (!result?.approved)
    throw new Error(
      result?.error ??
        "This Google account is not on the approved family list.",
    );
  return result.role ?? "member";
}

export async function loginWithGoogle() {
  const { error } = await requireSupabaseAuthClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error("Could not start Google sign-in.");
}

export async function logoutIdentity() {
  const { error } = await requireSupabaseAuthClient().auth.signOut();
  accessToken = null;
  implicitRestore = null;
  if (error) throw new Error("Could not sign out.");
}
