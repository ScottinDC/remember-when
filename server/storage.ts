import { getBucketName, getStorageClient } from "./gcs-client";
import { seriesPrefix } from "./tree";
import type { AnswerManifest, MemoryNode } from "./types";

const GCS_OPERATION_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function readJsonFromGcs<T>(objectName: string): Promise<T | null> {
  let storage;
  try {
    storage = getStorageClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initialize cloud storage.";
    throw new Error(message);
  }

  const file = storage.bucket(getBucketName()).file(objectName);

  try {
    const [contents] = await withTimeout(file.download(), GCS_OPERATION_TIMEOUT_MS, "Cloud storage read");
    return JSON.parse(contents.toString("utf8")) as T;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : undefined;
    if (code === "404" || code === "ENOENT") {
      return null;
    }
    const message = error instanceof Error ? error.message : "Could not read from cloud storage.";
    throw new Error(message);
  }
}

export async function readTextFromGcs(objectName: string): Promise<string | null> {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);

  try {
    const [contents] = await file.download();
    return contents.toString("utf8");
  } catch {
    return null;
  }
}

export async function appendLineToGcs(objectName: string, line: string) {
  const existing = (await readTextFromGcs(objectName)) ?? "";
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);
  const next = existing.length > 0 && !existing.endsWith("\n") ? `${existing}\n${line}\n` : `${existing}${line}\n`;

  await withTimeout(
    file.save(next, {
      resumable: false,
      contentType: "application/x-ndjson"
    }),
    GCS_OPERATION_TIMEOUT_MS,
    "Cloud storage append"
  );
}

export async function writeJsonToGcs(objectName: string, value: unknown) {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);
  await withTimeout(
    file.save(JSON.stringify(value, null, 2), {
      resumable: false,
      contentType: "application/json"
    }),
    GCS_OPERATION_TIMEOUT_MS,
    "Cloud storage write"
  );
}

export async function deleteGcsObject(objectName: string) {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);
  try {
    await file.delete({ ignoreNotFound: true });
  } catch {
    // ignore missing objects
  }
}

export async function downloadGcsObject(objectName: string) {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);
  const [contents] = await withTimeout(file.download(), GCS_OPERATION_TIMEOUT_MS, "Cloud storage download");
  return contents;
}

export async function getSignedReadUrl(objectName: string, expiresMs = 1000 * 60 * 60 * 24 * 7) {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(objectName);
  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + expiresMs
  });
  return signedUrl;
}

export async function uploadBufferToGcs(input: {
  objectName: string;
  buffer: Buffer;
  contentType: string;
}) {
  const storage = getStorageClient();
  const file = storage.bucket(getBucketName()).file(input.objectName);
  await withTimeout(
    file.save(input.buffer, {
      resumable: false,
      contentType: input.contentType
    }),
    GCS_OPERATION_TIMEOUT_MS,
    "Cloud storage upload"
  );
  return input.objectName;
}

function seriesBasePath(threadId: string, node: MemoryNode) {
  return `threads/${threadId}/series/${seriesPrefix(node)}`;
}

export async function uploadAudioToGcs(input: {
  buffer: Buffer;
  threadId: string;
  node: MemoryNode;
  extension?: string;
  contentType?: string;
}) {
  const extension = input.extension ?? "webm";
  const contentType = input.contentType ?? "audio/webm";
  const storage = getStorageClient();
  const basePath = seriesBasePath(input.threadId, input.node);
  const objectName = `${basePath}/answer.${extension}`;
  const file = storage.bucket(getBucketName()).file(objectName);

  await file.save(input.buffer, {
    resumable: false,
    contentType,
    metadata: {
      metadata: {
        threadId: input.threadId,
        questionId: input.node.id,
        parentQuestionId: input.node.parentQuestionId ?? "",
        sequenceOrder: String(input.node.sequenceOrder),
        generation: String(input.node.generation),
        branchRootId: input.node.branchRootId,
        branchLabel: input.node.branchLabel,
        depth: String(input.node.depth),
        treePath: input.node.treePath.join("/")
      }
    }
  });

  const [signedUrl] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24 * 365
  });

  return {
    objectName,
    url: signedUrl
  };
}

export async function writeAnswerManifest(input: {
  node: MemoryNode;
  audioObjectName: string | null;
}) {
  const manifest: AnswerManifest = {
    threadId: input.node.threadId,
    questionId: input.node.id,
    parentQuestionId: input.node.parentQuestionId,
    sequenceOrder: input.node.sequenceOrder,
    generation: input.node.generation,
    depth: input.node.depth,
    branchRootId: input.node.branchRootId,
    branchLabel: input.node.branchLabel,
    treePath: input.node.treePath,
    question: input.node.question,
    status: input.node.status,
    transcript: input.node.transcript,
    audioObjectName: input.audioObjectName,
    updatedAt: new Date().toISOString()
  };

  const objectName = `${seriesBasePath(input.node.threadId, input.node)}/manifest.json`;
  await writeJsonToGcs(objectName, manifest);
  return objectName;
}

export async function deleteAnswerArtifacts(threadId: string, node: MemoryNode) {
  const basePath = seriesBasePath(threadId, node);
  await deleteGcsObject(`${basePath}/manifest.json`);
  if (node.gcsObjectName) {
    await deleteGcsObject(node.gcsObjectName);
  }
}
