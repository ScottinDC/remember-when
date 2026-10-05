import { normalizeStoryOptions } from "../supabase/functions/_shared/story-options";
import { requireSupabaseAuthClient } from "./auth/supabase";
import { normalizeTree } from "./lib/tree";
import type { InterviewState, MemoryNode } from "./types";

const INITIAL_QUESTIONS = [
  "When you look back over your life, what are the moments that made you who you are?",
  "What are your earliest memories of growing up in North Dakota and your family?",
  "What do you remember most about your parents, and what did they teach you?",
  "How did your years at Kodak shape your life, both professionally and personally?",
  "If your children, grandchildren, and great-grandchild could only know a handful of lessons from your life, what would you want them to remember?",
];

type ResponseRow = {
  id: string;
  thread_id: string;
  parent_question_id: string | null;
  question: string;
  transcript: string | null;
  mp3_url: string | null;
  gcs_object_name: string | null;
  storage_object_name: string | null;
  created_at: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  status: MemoryNode["status"];
  archived_at: string | null;
};

function foundationSequenceOrder(row: ResponseRow) {
  const foundationIndex = INITIAL_QUESTIONS.indexOf(row.question);
  return foundationIndex >= 0 ? foundationIndex + 1 : null;
}

function hydrateNodes(rows: ResponseRow[]): MemoryNode[] {
  const followUpSequenceById = new Map(
    rows
      .filter((row) => row.parent_question_id)
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .map((row, index) => [row.id, INITIAL_QUESTIONS.length + index + 1]),
  );
  const preliminary = rows.map(
    (row): MemoryNode => ({
      id: row.id,
      threadId: row.thread_id,
      parentQuestionId: row.parent_question_id,
      question: row.question,
      transcript: row.transcript,
      mp3Url: null,
      hasAudio: Boolean(row.storage_object_name),
      archivedAt: row.archived_at,
      contentType:
        typeof row.metadata?.contentType === "string"
          ? row.metadata.contentType
          : undefined,
      processingJobId:
        typeof row.metadata?.recordingJobId === "string"
          ? row.metadata.recordingJobId
          : undefined,
      gcsObjectName: row.gcs_object_name,
      timestamp: row.timestamp,
      metadata: row.metadata,
      status: row.status,
      sequenceOrder:
        foundationSequenceOrder(row) ??
        (typeof row.metadata?.sequenceOrder === "number"
          ? row.metadata.sequenceOrder
          : null) ??
        followUpSequenceById.get(row.id) ??
        INITIAL_QUESTIONS.length + 1,
      treeOrder: 0,
      branchRootOrder: 0,
      questionCode: "",
      depth: 0,
      generation: 0,
      branchRootId: row.id,
      branchLabel: "",
      treePath: [row.id],
    }),
  );
  return normalizeTree(preliminary);
}

export async function fetchOrCreateSupabaseInterview(): Promise<InterviewState> {
  const supabase = requireSupabaseAuthClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (sessionError || !user?.email) {
    throw new Error("Your Supabase sign-in has expired. Please sign in again.");
  }

  const { data: threadId, error: initializeError } =
    await supabase.rpc("ensure_interview");
  if (initializeError || !threadId)
    throw new Error("Could not open your interview. Please try again.");
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id,title,created_at,updated_at,story_options")
    .eq("id", threadId)
    .single();
  if (threadError || !thread) throw new Error("Could not load your interview.");

  const { data: responses, error: responsesError } = await supabase
    .from("responses")
    .select(
      "id, thread_id, parent_question_id, question, transcript, mp3_url, gcs_object_name, storage_object_name, created_at, timestamp, metadata, status, archived_at",
    )
    .eq("thread_id", thread.id)
    .order("timestamp", { ascending: true });
  if (responsesError) {
    throw new Error("Could not load your interview questions.");
  }

  return {
    thread: {
      id: thread.id,
      title: thread.title,
      storyOptions: normalizeStoryOptions(thread.story_options),
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    },
    nodes: hydrateNodes(responses ?? []),
  };
}
