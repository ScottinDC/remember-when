import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { useGcsBackend } from "./runtime-env";
import { appendLineToGcs, readTextFromGcs } from "./storage";
import type { MemoryNode } from "./types";
import { userKeyFromEmail, userLedgerObject } from "./user-key";

const LOCAL_LEDGER_DIR = process.env.LEDGER_PATH
  ? path.dirname(process.env.LEDGER_PATH)
  : "./data/ledgers";

function localLedgerPath(userEmail: string) {
  return path.join(LOCAL_LEDGER_DIR, `${userKeyFromEmail(userEmail)}.jsonl`);
}

function useGcsLedger() {
  return useGcsBackend();
}

export type LedgerEvent =
  | {
      type: "thread_initialized";
      threadId: string;
      at: string;
      questionCount: number;
    }
  | {
      type: "question_created";
      threadId: string;
      at: string;
      questionId: string;
      parentQuestionId: string | null;
      sequenceOrder: number;
      generation: number;
      branchRootId: string;
      branchLabel: string;
      question: string;
    }
  | {
      type: "response_saved";
      threadId: string;
      at: string;
      questionId: string;
      sequenceOrder: number;
      generation: number;
      branchRootId: string;
      branchLabel: string;
      audioObjectName: string | null;
      transcriptLength: number;
    }
  | {
      type: "response_deleted";
      threadId: string;
      at: string;
      questionId: string;
      sequenceOrder: number;
      generation: number;
      branchRootId: string;
      branchLabel: string;
      reason: "redo";
    }
  | {
      type: "followup_generated";
      threadId: string;
      at: string;
      questionId: string;
      parentQuestionId: string;
      guidedByQuestionId: string;
      sequenceOrder: number;
      generation: number;
      branchRootId: string;
      branchLabel: string;
    };

export async function appendLedgerEvent(userEmail: string, event: LedgerEvent) {
  const line = JSON.stringify(event);

  if (useGcsLedger()) {
    await appendLineToGcs(userLedgerObject(userEmail), line);
    return;
  }

  const ledgerPath = localLedgerPath(userEmail);
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${line}\n`, "utf8");
}

export async function readUserLedgerEvents(userEmail: string): Promise<LedgerEvent[]> {
  let text: string | null;

  if (useGcsLedger()) {
    text = await readTextFromGcs(userLedgerObject(userEmail));
  } else {
    try {
      text = await readFile(localLedgerPath(userEmail), "utf8");
    } catch {
      text = null;
    }
  }

  if (!text?.trim()) {
    return [];
  }

  const events: LedgerEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      events.push(JSON.parse(trimmed) as LedgerEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

export function ledgerFromNode(
  node: MemoryNode,
  type: "question_created" | "response_saved" | "response_deleted" | "followup_generated",
  extra: Partial<LedgerEvent> = {}
): LedgerEvent {
  const base = {
    threadId: node.threadId,
    at: new Date().toISOString(),
    questionId: node.id,
    sequenceOrder: node.sequenceOrder,
    generation: node.generation,
    branchRootId: node.branchRootId,
    branchLabel: node.branchLabel
  };

  if (type === "question_created") {
    return {
      type,
      ...base,
      parentQuestionId: node.parentQuestionId,
      question: node.question,
      ...extra
    } as LedgerEvent;
  }

  if (type === "response_saved") {
    return {
      type,
      ...base,
      audioObjectName: node.gcsObjectName,
      transcriptLength: node.transcript?.length ?? 0,
      ...extra
    } as LedgerEvent;
  }

  if (type === "response_deleted") {
    return {
      type,
      ...base,
      reason: "redo",
      ...extra
    } as LedgerEvent;
  }

  return {
    type: "followup_generated",
    ...base,
    parentQuestionId: node.parentQuestionId ?? "",
    guidedByQuestionId: String(
      (node.metadata as { guidedByAnswerId?: string } | null)?.guidedByAnswerId ?? node.parentQuestionId ?? ""
    ),
    ...extra
  } as LedgerEvent;
}
