import { authConfig } from "./auth";
import { storageConfig } from "./runtime-env";
import { readJsonFromGcs } from "./storage";
import { getOrCreateUserThread } from "./store-gcs";
import { userStateObject } from "./user-key";

const CACHE_TTL_MS = 15_000;
const cachedInterview = new Map<string, { value: Awaited<ReturnType<typeof getOrCreateUserThread>>; at: number }>();

export async function handleHealth() {
  const storage = storageConfig();
  let storageReachable = false;
  let storageError: string | undefined;

  if (storage.storageConfigured) {
    try {
      await readJsonFromGcs("app/interview-state.json");
      storageReachable = true;
    } catch (error) {
      storageError = error instanceof Error ? error.message : "Could not reach cloud storage.";
    }
  }

  return {
    ok: true,
    ...authConfig(),
    ...storage,
    storageReachable,
    storageError
  };
}

export async function handleGetInterview(userEmail: string) {
  const cached = cachedInterview.get(userEmail);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const value = await getOrCreateUserThread(userEmail);
  cachedInterview.set(userEmail, { value, at: Date.now() });
  return value;
}

export function invalidateInterviewCache(userEmail: string) {
  cachedInterview.delete(userEmail);
}

/** Probe that per-user storage paths are writable (health check only). */
export async function probeUserStorage(userEmail: string) {
  await readJsonFromGcs(userStateObject(userEmail));
}
