import JSZip from "jszip";
import type { DigestAnswer } from "./digest-week";
import { downloadGcsObject, getSignedReadUrl, uploadBufferToGcs } from "./storage";
import { userDigestZipPrefix } from "./user-key";

const ZIP_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function extensionFromObjectName(objectName: string) {
  const match = objectName.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "webm";
}

function zipEntryName(answer: DigestAnswer) {
  const ext = extensionFromObjectName(answer.audioObjectName);
  const slug = answer.question
    .slice(0, 72)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  const order = String(answer.sequenceOrder).padStart(3, "0");
  return `${order}-${answer.branchLabel}-${slug || answer.questionId.slice(0, 8)}.${ext}`;
}

export async function buildWeeklyZip(userEmail: string, weekKey: string, answers: DigestAnswer[]) {
  const zip = new JSZip();

  for (const answer of answers) {
    const buffer = await downloadGcsObject(answer.audioObjectName);
    zip.file(zipEntryName(answer), buffer);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  const objectName = `${userDigestZipPrefix(userEmail, weekKey)}/remember-when-${weekKey}.zip`;
  await uploadBufferToGcs({
    objectName,
    buffer,
    contentType: "application/zip"
  });

  const url = await getSignedReadUrl(objectName, ZIP_LINK_TTL_MS);
  return { objectName, url };
}

export async function signedAudioLinks(answers: DigestAnswer[]) {
  const links = new Map<string, string>();
  for (const answer of answers) {
    links.set(
      answer.questionId,
      await getSignedReadUrl(answer.audioObjectName, ZIP_LINK_TTL_MS)
    );
  }
  return links;
}
