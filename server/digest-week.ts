import { DateTime } from "luxon";
import type { LedgerEvent } from "./ledger";
import { readLedgerEvents } from "./ledger-read";
import { readRuntimeEnv } from "./runtime-env";
import type { MemoryNode } from "./types";

export type DigestAnswer = {
  questionId: string;
  question: string;
  branchLabel: string;
  sequenceOrder: number;
  answeredAt: string;
  audioObjectName: string;
  transcript: string | null;
};

export type DigestWeek = {
  weekKey: string;
  label: string;
  start: Date;
  end: Date;
  answers: DigestAnswer[];
};

function digestTimeZone() {
  return readRuntimeEnv("DIGEST_TIMEZONE") ?? "America/Los_Angeles";
}

export function getDigestWeekRange(reference = new Date()) {
  const zone = digestTimeZone();
  const end = DateTime.fromJSDate(reference, { zone });
  const start = end.startOf("week"); // Sunday 00:00 in zone
  return {
    weekKey: start.toISODate() ?? start.toFormat("yyyy-MM-dd"),
    label: `${start.toFormat("MMM d")} – ${end.toFormat("MMM d, yyyy")}`,
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
    zone
  };
}

function isResponseSaved(event: LedgerEvent): event is Extract<LedgerEvent, { type: "response_saved" }> {
  return event.type === "response_saved";
}

function isResponseDeleted(event: LedgerEvent): event is Extract<LedgerEvent, { type: "response_deleted" }> {
  return event.type === "response_deleted";
}

export function collectWeeklyAnswers(nodes: MemoryNode[], events: LedgerEvent[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const savedInWeek = events
    .filter(isResponseSaved)
    .filter((event) => {
      const at = new Date(event.at).getTime();
      return at >= startMs && at <= endMs;
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const latestSaveByQuestion = new Map<string, Extract<LedgerEvent, { type: "response_saved" }>>();
  for (const event of savedInWeek) {
    latestSaveByQuestion.set(event.questionId, event);
  }

  const deletedAfterSave = new Set<string>();
  for (const event of events.filter(isResponseDeleted)) {
    const save = latestSaveByQuestion.get(event.questionId);
    if (!save) {
      continue;
    }
    if (new Date(event.at).getTime() > new Date(save.at).getTime()) {
      deletedAfterSave.add(event.questionId);
    }
  }

  const answers: DigestAnswer[] = [];
  for (const [questionId, event] of latestSaveByQuestion) {
    if (deletedAfterSave.has(questionId)) {
      continue;
    }
    const node = nodeById.get(questionId);
    if (!node || node.status !== "answered") {
      continue;
    }
    const audioObjectName = event.audioObjectName ?? node.gcsObjectName;
    if (!audioObjectName) {
      continue;
    }
    answers.push({
      questionId,
      question: node.question,
      branchLabel: node.branchLabel,
      sequenceOrder: node.sequenceOrder,
      answeredAt: event.at,
      audioObjectName,
      transcript: node.transcript
    });
  }

  answers.sort((a, b) => a.sequenceOrder - b.sequenceOrder || a.answeredAt.localeCompare(b.answeredAt));
  return answers;
}

export async function buildDigestWeek(
  userEmail: string,
  nodes: MemoryNode[],
  reference = new Date()
): Promise<DigestWeek> {
  const range = getDigestWeekRange(reference);
  const events = await readLedgerEvents(userEmail);
  const answers = collectWeeklyAnswers(nodes, events, range.start, range.end);
  return {
    weekKey: range.weekKey,
    label: range.label,
    start: range.start,
    end: range.end,
    answers
  };
}
