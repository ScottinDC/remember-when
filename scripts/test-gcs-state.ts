#!/usr/bin/env tsx
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getOrCreateDefaultThread } from "../server/store-gcs";
import { readJsonFromGcs } from "../server/storage";

const localEnv = join(homedir(), ".remember-when", ".env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : undefined });

const raw = await readJsonFromGcs("app/interview-state.json");
if (raw) {
  const needs = raw.nodes.some((node) => node.generation === undefined || !node.branchRootId);
  console.log("raw nodes:", raw.nodes.length, "needsBranchFields:", needs);
}

const start = Date.now();
const state = await getOrCreateDefaultThread();
const json = JSON.stringify(state);
console.log("nodes:", state.nodes.length);
console.log("json bytes:", json.length);
console.log("elapsed ms:", Date.now() - start);
