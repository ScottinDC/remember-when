export type MemoryNode = {
  id: string;
  threadId: string;
  parentQuestionId: string | null;
  question: string;
  transcript: string | null;
  mp3Url: string | null;
  gcsObjectName: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  status: "pending" | "processing" | "answered" | "failed";
  sequenceOrder: number;
  treeOrder: number;
  branchRootOrder: number;
  questionCode: string;
  depth: number;
  generation: number;
  branchRootId: string;
  branchLabel: string;
  treePath: string[];
};

export type InterviewThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type InterviewState = {
  thread: InterviewThread;
  nodes: MemoryNode[];
};

export type QueuedRecording = {
  questionId: string;
  blob: Blob;
  url: string;
};
