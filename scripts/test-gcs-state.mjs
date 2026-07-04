#!/usr/bin/env node
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const localEnv = join(homedir(), ".remember-when", ".env");
dotenv.config({ path: existsSync(localEnv) ? localEnv : undefined });

const { getOrCreateDefaultThread } = await import("../server/store-gcs.ts");

const start = Date.now();
const state = await getOrCreateDefaultThread();
const json = JSON.stringify(state);
console.log("nodes:", state.nodes.length);
console.log("json bytes:", json.length);
console.log("elapsed ms:", Date.now() - start);
