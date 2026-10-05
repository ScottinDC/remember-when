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
      mp3Url: row.mp3_url,
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

async function withPrivateAudioUrl(
  row: ResponseRow,
  node: MemoryNode,
): Promise<MemoryNode> {
  const supabase = requireSupabaseAuthClient();
  let privateAudioUrl: string | null = null;
  if (row.storage_object_name) {
    const { data, error } = await supabase.storage
      .from("interview-audio")
      .createSignedUrl(row.storage_object_name, 60 * 60);
    if (!error) {
      privateAudioUrl = data.signedUrl;
    }
  }
  return { ...node, mp3Url: privateAudioUrl ?? node.mp3Url };
}

export async function fetchOrCreateSupabaseInterview(): Promise<InterviewState> {
  const supabase = requireSupabaseAuthClient();
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (sessionError || !user?.email) {
    throw new Error("Your Supabase sign-in has expired. Please sign in again.");
  }

  let { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, title, created_at, updated_at")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (threadError) {
    throw new Error("Could not load your interview.");
  }

  if (!thread) {
    const threadId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { data: createdThread, error: createThreadError } = await supabase
      .from("threads")
      .insert({
        id: threadId,
        owner_id: user.id,
        owner_email: user.email,
        title: "My Life Story",
        created_at: now,
        updated_at: now,
      })
      .select("id, title, created_at, updated_at")
      .single();
    if (createThreadError) {
      throw new Error("Could not create your interview.");
    }

    const { error: createResponsesError } = await supabase
      .from("responses")
      .insert(
        INITIAL_QUESTIONS.map((question, index) => ({
          id: crypto.randomUUID(),
          thread_id: threadId,
          question,
          metadata: { sequenceOrder: index + 1 },
          status: "pending" as const,
        })),
      );
    if (createResponsesError) {
      throw new Error("Could not initialize your interview questions.");
    }
    thread = createdThread;
  }

  const { data: responses, error: responsesError } = await supabase
    .from("responses")
    .select(
      "id, thread_id, parent_question_id, question, transcript, mp3_url, gcs_object_name, storage_object_name, created_at, timestamp, metadata, status",
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
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    },
    nodes: await Promise.all(
      hydrateNodes(responses ?? []).map((node) => {
        const row = (responses ?? []).find(
          (candidate) => candidate.id === node.id,
        );
        if (!row) {
          return node;
        }
        return withPrivateAudioUrl(row, node);
      }),
    ),
  };
}
