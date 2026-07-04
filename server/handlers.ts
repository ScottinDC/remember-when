import { authConfig } from "./auth";
import { storageConfig } from "./runtime-env";
import {
  addFollowUpQuestion,
  clearNodeAnswer,
  getNode,
  getOrCreateUserThread,
  getThreadState,
  markNodeAnswered,
  markNodeProcessing
} from "./db";
import { generateFollowUp, transcribeAudio } from "./ai";
import { appendLedgerEvent, ledgerFromNode } from "./ledger";
import { prepareAudioForUpload } from "./audio";
import { deleteAnswerArtifacts, uploadAudioToGcs, writeAnswerManifest } from "./storage";

export async function handleHealth() {
  return { ok: true, ...authConfig(), ...storageConfig() };
}

export async function handleGetInterview(userEmail: string) {
  return getOrCreateUserThread(userEmail);
}

async function saveAnswerForNode(
  userEmail: string,
  input: {
    questionId: string;
    audioBuffer: Buffer;
    mimeType: string;
    originalFilename: string;
    sourceByteLength: number;
  }
) {
  const node = await getNode(userEmail, input.questionId);
  if (!node) {
    return { status: 404 as const, body: { error: "Question not found." } };
  }

  const prepared = await prepareAudioForUpload(input.audioBuffer, input.mimeType);
  const uploaded = await uploadAudioToGcs({
    buffer: prepared.buffer,
    threadId: node.threadId,
    node,
    extension: prepared.extension,
    contentType: prepared.contentType
  });

  const metadata = {
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    sourceByteLength: input.sourceByteLength,
    audioByteLength: prepared.buffer.byteLength,
    audioFormat: prepared.extension,
    sequenceOrder: node.sequenceOrder,
    generation: node.generation,
    branchRootId: node.branchRootId,
    branchLabel: node.branchLabel,
    depth: node.depth,
    treePath: node.treePath
  };

  const transcript = await transcribeAudio(prepared.buffer, prepared.filename, prepared.contentType);
  const answeredNode = await markNodeAnswered(userEmail, {
    id: node.id,
    transcript,
    mp3Url: uploaded.url,
    gcsObjectName: uploaded.objectName,
    metadata
  });

  if (!answeredNode) {
    return { status: 500 as const, body: { error: "Could not save response." } };
  }

  await writeAnswerManifest({
    node: answeredNode,
    audioObjectName: uploaded.objectName
  });

  await appendLedgerEvent(userEmail, ledgerFromNode(answeredNode, "response_saved"));

  const currentState = await getThreadState(userEmail, answeredNode.threadId);
  const followUpQuestion = await generateFollowUp(currentState.nodes, answeredNode);
  const followUpNode = await addFollowUpQuestion(userEmail, {
    threadId: answeredNode.threadId,
    parentQuestionId: answeredNode.id,
    question: followUpQuestion,
    metadata: {
      generatedBy: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      guidedByAnswerId: answeredNode.id
    }
  });

  if (followUpNode) {
    await appendLedgerEvent(userEmail, ledgerFromNode(followUpNode, "followup_generated"));
    await appendLedgerEvent(userEmail, ledgerFromNode(followUpNode, "question_created"));
  }

  return {
    status: 200 as const,
    body: {
      status: "complete",
      answeredNode,
      followUpNode,
      state: await getThreadState(userEmail, answeredNode.threadId)
    }
  };
}

export async function handlePostAnswer(
  userEmail: string,
  input: {
    questionId: string;
    audioBuffer: Buffer;
    mimeType: string;
    originalFilename: string;
    sourceByteLength: number;
  }
) {
  return saveAnswerForNode(userEmail, input);
}

export async function handleDeleteAnswer(userEmail: string, questionId: string) {
  const node = await getNode(userEmail, questionId);
  if (!node) {
    return { status: 404 as const, body: { error: "Question not found." } };
  }

  if (node.gcsObjectName || node.status === "answered") {
    await deleteAnswerArtifacts(node.threadId, node);
  }

  const cleared = await clearNodeAnswer(userEmail, questionId);
  if (!cleared) {
    return { status: 500 as const, body: { error: "Could not delete the answer." } };
  }

  await appendLedgerEvent(userEmail, ledgerFromNode(cleared, "response_deleted"));

  return {
    status: 200 as const,
    body: {
      state: await getThreadState(userEmail, node.threadId)
    }
  };
}

export async function handlePostAnswerBackground(
  userEmail: string,
  input: {
    questionId: string;
    audioBuffer: Buffer;
    mimeType: string;
    originalFilename: string;
    sourceByteLength: number;
  }
) {
  const node = await getNode(userEmail, input.questionId);
  if (!node) {
    return { status: 404 as const, body: { error: "Question not found." } };
  }

  const prepared = await prepareAudioForUpload(input.audioBuffer, input.mimeType);
  const uploaded = await uploadAudioToGcs({
    buffer: prepared.buffer,
    threadId: node.threadId,
    node,
    extension: prepared.extension,
    contentType: prepared.contentType
  });

  await markNodeProcessing(userEmail, {
    id: node.id,
    mp3Url: uploaded.url,
    gcsObjectName: uploaded.objectName,
    metadata: {
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sourceByteLength: input.sourceByteLength,
      audioByteLength: prepared.buffer.byteLength,
      audioFormat: prepared.extension,
      sequenceOrder: node.sequenceOrder,
      generation: node.generation,
      branchRootId: node.branchRootId,
      branchLabel: node.branchLabel,
      depth: node.depth,
      treePath: node.treePath
    }
  });

  return {
    status: 202 as const,
    body: {
      status: "processing",
      questionId: node.id,
      state: await getThreadState(userEmail, node.threadId)
    },
    prepared,
    uploaded
  };
}

export async function finishBackgroundAnswer(
  userEmail: string,
  input: {
    questionId: string;
    prepared: Awaited<ReturnType<typeof prepareAudioForUpload>>;
    uploaded: { objectName: string; url: string };
    originalFilename: string;
    mimeType: string;
    sourceByteLength: number;
  }
) {
  const node = await getNode(userEmail, input.questionId);
  if (!node) {
    return;
  }

  const metadata = {
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    sourceByteLength: input.sourceByteLength,
    audioByteLength: input.prepared.buffer.byteLength,
    audioFormat: input.prepared.extension,
    sequenceOrder: node.sequenceOrder,
    generation: node.generation,
    branchRootId: node.branchRootId,
    branchLabel: node.branchLabel,
    depth: node.depth,
    treePath: node.treePath
  };

  const transcript = await transcribeAudio(
    input.prepared.buffer,
    input.prepared.filename,
    input.prepared.contentType
  );
  const answeredNode = await markNodeAnswered(userEmail, {
    id: node.id,
    transcript,
    mp3Url: input.uploaded.url,
    gcsObjectName: input.uploaded.objectName,
    metadata
  });

  if (!answeredNode) {
    return;
  }

  await writeAnswerManifest({
    node: answeredNode,
    audioObjectName: input.uploaded.objectName
  });

  await appendLedgerEvent(userEmail, ledgerFromNode(answeredNode, "response_saved"));

  const currentState = await getThreadState(userEmail, answeredNode.threadId);
  const followUpQuestion = await generateFollowUp(currentState.nodes, answeredNode);
  const followUpNode = await addFollowUpQuestion(userEmail, {
    threadId: answeredNode.threadId,
    parentQuestionId: answeredNode.id,
    question: followUpQuestion,
    metadata: {
      generatedBy: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      guidedByAnswerId: answeredNode.id
    }
  });

  if (followUpNode) {
    await appendLedgerEvent(userEmail, ledgerFromNode(followUpNode, "followup_generated"));
    await appendLedgerEvent(userEmail, ledgerFromNode(followUpNode, "question_created"));
  }
}
