import { createHash } from "node:crypto";

export function userKeyFromEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function userStateObject(email: string) {
  return `users/${userKeyFromEmail(email)}/interview-state.json`;
}

export function userLedgerObject(email: string) {
  return `users/${userKeyFromEmail(email)}/interview-ledger.jsonl`;
}

export function userDigestStateObject(email: string) {
  return `users/${userKeyFromEmail(email)}/digest-state.json`;
}

export function userDigestZipPrefix(email: string, weekKey: string) {
  return `users/${userKeyFromEmail(email)}/digests/${weekKey}`;
}
