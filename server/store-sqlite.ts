import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { INITIAL_QUESTIONS } from "./interview";
import { buildTreePath, enrichNode, nodeDepth } from "./tree";
import type { InterviewState, InterviewThread, MemoryNode } from "./types";

const databasePath = process.env.DATABASE_PATH ?? "./data/remember-when.sqlite";
mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responses (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    parent_question_id TEXT,
    question TEXT NOT NULL,
    transcript TEXT,
    mp3_url TEXT,
    gcs_object_name TEXT,
    timestamp TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'answered')),
    FOREIGN KEY (thread_id) REFERENCES threads(id),
    FOREIGN KEY (parent_question_id) REFERENCES responses(id)
  );
`);

const threadColumns = db.prepare("PRAGMA table_info(threads)").all() as { name: string }[];
if (!threadColumns.some((column) => column.name === "owner_email")) {
  db.exec("ALTER TABLE threads ADD COLUMN owner_email TEXT NOT NULL DEFAULT ''");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function rowToThread(row: Record<string, string>): InterviewThread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToNode(row: Record<string, string | null>, nodes: MemoryNode[], index: number): MemoryNode {
  const base: MemoryNode = {
    id: row.id as string,
    threadId: row.thread_id as string,
    parentQuestionId: row.parent_question_id,
    question: row.question as string,
    transcript: row.transcript,
    mp3Url: row.mp3_url,
    gcsObjectName: row.gcs_object_name,
    timestamp: row.timestamp as string,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    status: row.status as MemoryNode["status"],
    sequenceOrder: index + 1,
    depth: 0,
    generation: 0,
    branchRootId: row.id as string,
    branchLabel: "",
    treePath: [row.id as string]
  };
  const depth = nodeDepth(nodes.length ? nodes : [base], base);
  const treePath = buildTreePath(nodes.length ? nodes : [base], base);
  return enrichNode(nodes.length ? nodes : [base], { ...base, depth, treePath });
}

function hydrateNodes(rows: Record<string, string | null>[]) {
  const preliminary = rows.map((row, index) => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    parentQuestionId: row.parent_question_id,
    question: row.question as string,
    transcript: row.transcript,
    mp3Url: row.mp3_url,
    gcsObjectName: row.gcs_object_name,
    timestamp: row.timestamp as string,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    status: row.status as MemoryNode["status"],
    sequenceOrder: index + 1,
    depth: 0,
    generation: 0,
    branchRootId: row.id as string,
    branchLabel: "",
    treePath: [row.id as string]
  }));
  return preliminary.map((node, index) => rowToNode(rows[index], preliminary, index));
}

export async function getOrCreateUserThread(userEmail: string): Promise<InterviewState> {
  const owner = normalizeEmail(userEmail);
  let threadRow = db
    .prepare("SELECT * FROM threads WHERE owner_email = ? ORDER BY created_at LIMIT 1")
    .get(owner) as Record<string, string> | undefined;

  if (!threadRow) {
    const now = new Date().toISOString();
    const threadId = randomUUID();
    db.prepare(
      "INSERT INTO threads (id, owner_email, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(threadId, owner, "My Life Story", now, now);

    const insertQuestion = db.prepare(`
      INSERT INTO responses (
        id, thread_id, parent_question_id, question, transcript, mp3_url,
        gcs_object_name, timestamp, metadata, status
      ) VALUES (?, ?, NULL, ?, NULL, NULL, NULL, ?, ?, 'pending')
    `);

    for (const question of INITIAL_QUESTIONS) {
      insertQuestion.run(
        randomUUID(),
        threadId,
        question,
        now,
        JSON.stringify({ ownerEmail: owner })
      );
    }

    threadRow = db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as Record<string, string>;
  }

  return getThreadState(userEmail, threadRow.id);
}

/** @deprecated Use getOrCreateUserThread with an authenticated email. */
export async function getOrCreateDefaultThread(): Promise<InterviewState> {
  return getOrCreateUserThread("local-dev@remember-when.local");
}

export async function getThreadState(userEmail: string, threadId: string): Promise<InterviewState> {
  const owner = normalizeEmail(userEmail);
  const thread = db
    .prepare("SELECT * FROM threads WHERE id = ? AND owner_email = ?")
    .get(threadId, owner) as Record<string, string> | undefined;
  if (!thread) {
    throw new Error("Thread not found.");
  }

  const rows = db
    .prepare("SELECT * FROM responses WHERE thread_id = ? ORDER BY timestamp ASC")
    .all(threadId) as Record<string, string | null>[];

  return {
    thread: rowToThread(thread),
    nodes: hydrateNodes(rows)
  };
}

export async function getNode(userEmail: string, id: string): Promise<MemoryNode | undefined> {
  const owner = normalizeEmail(userEmail);
  const row = db
    .prepare(
      `SELECT r.* FROM responses r
       JOIN threads t ON t.id = r.thread_id
       WHERE r.id = ? AND t.owner_email = ?`
    )
    .get(id, owner) as Record<string, string | null> | undefined;
  return row ? hydrateNodes([row])[0] : undefined;
}

export async function markNodeProcessing(
  userEmail: string,
  input: {
    id: string;
    mp3Url: string;
    gcsObjectName: string;
    metadata: Record<string, unknown>;
  }
) {
  const node = await getNode(userEmail, input.id);
  if (!node) {
    return undefined;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE responses
     SET mp3_url = ?, gcs_object_name = ?, timestamp = ?, metadata = ?, status = 'processing'
     WHERE id = ?`
  ).run(input.mp3Url, input.gcsObjectName, now, JSON.stringify(input.metadata), input.id);

  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, node.threadId);
  return getNode(userEmail, input.id);
}

export async function markNodeAnswered(
  userEmail: string,
  input: {
    id: string;
    transcript: string;
    mp3Url: string;
    gcsObjectName: string;
    metadata: Record<string, unknown>;
  }
) {
  const node = await getNode(userEmail, input.id);
  if (!node) {
    return undefined;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE responses
     SET transcript = ?, mp3_url = ?, gcs_object_name = ?, timestamp = ?, metadata = ?, status = 'answered'
     WHERE id = ?`
  ).run(
    input.transcript,
    input.mp3Url,
    input.gcsObjectName,
    now,
    JSON.stringify(input.metadata),
    input.id
  );

  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, node.threadId);
  return getNode(userEmail, input.id);
}

export async function markNodeFailed(userEmail: string, id: string, message: string) {
  const node = await getNode(userEmail, id);
  if (!node) {
    return undefined;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE responses
     SET timestamp = ?, metadata = ?, status = 'pending'
     WHERE id = ?`
  ).run(
    now,
    JSON.stringify({
      ...(node.metadata ?? {}),
      error: message
    }),
    id
  );

  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, node.threadId);
  return getNode(userEmail, id);
}

export async function addFollowUpQuestion(
  userEmail: string,
  input: {
    threadId: string;
    parentQuestionId: string;
    question: string;
    metadata?: Record<string, unknown>;
  }
) {
  await getThreadState(userEmail, input.threadId);

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO responses (
      id, thread_id, parent_question_id, question, transcript, mp3_url,
      gcs_object_name, timestamp, metadata, status
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'pending')`
  ).run(
    id,
    input.threadId,
    input.parentQuestionId,
    input.question,
    now,
    input.metadata ? JSON.stringify(input.metadata) : null
  );
  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, input.threadId);
  const state = await getThreadState(userEmail, input.threadId);
  return state.nodes.find((node) => node.id === id) ?? undefined;
}

export async function clearNodeAnswer(userEmail: string, id: string) {
  const node = await getNode(userEmail, id);
  if (!node) {
    return undefined;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE responses
     SET transcript = NULL, mp3_url = NULL, gcs_object_name = NULL, timestamp = ?, metadata = NULL, status = 'pending'
     WHERE id = ?`
  ).run(now, id);

  db.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, node.threadId);
  return getNode(userEmail, id);
}
