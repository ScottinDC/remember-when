import { recordingLink } from "../answer-store";
import type { MemoryNode } from "../types";
import { pcm16 } from "./story-export";
export async function combinedMp3(
  nodes: MemoryNode[],
  progress: (message: string) => void,
  signal: AbortSignal,
  loadAudio?: (node: MemoryNode, signal: AbortSignal) => Promise<Blob>,
) {
  progress("Starting audio export…");
  const context = new AudioContext({ sampleRate: 44100 });
  const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), {
    type: "module",
  });
  const check = () => {
    if (signal.aborted)
      throw new DOMException("Export cancelled", "AbortError");
  };
  function send(
    message: object,
    transfer: Transferable[] = [],
  ): Promise<{ blob?: Blob }> {
    check();
    return new Promise((resolve, reject) => {
      const fail = () => {
        cleanup();
        reject(
          new Error(
            "MP3 export could not finish on this device. Try fewer recordings or a computer.",
          ),
        );
      };
      const cancel = () => {
        cleanup();
        reject(new DOMException("Export cancelled", "AbortError"));
      };
      const done = (event: MessageEvent) => {
        cleanup();
        if (event.data.type === "error") fail();
        else resolve(event.data);
      };
      const timeout = setTimeout(fail, 120000);
      function cleanup() {
        clearTimeout(timeout);
        worker.removeEventListener("message", done);
        worker.removeEventListener("error", fail);
        signal.removeEventListener("abort", cancel);
      }
      worker.addEventListener("message", done);
      worker.addEventListener("error", fail);
      signal.addEventListener("abort", cancel, { once: true });
      worker.postMessage(message, transfer);
    });
  }
  try {
    await send({ type: "start", sampleRate: context.sampleRate });
    let seconds = 0;
    for (let index = 0; index < nodes.length; index++) {
      check();
      const node = nodes[index];
      progress(`Preparing audio ${index + 1} of ${nodes.length}…`);
      const blob = loadAudio
        ? await loadAudio(node, signal)
        : await (async () => {
            const link = await recordingLink(node.id, node.processingJobId);
            const response = await fetch(link.url, { signal });
            if (!response.ok)
              throw new Error(
                `Could not download question ${node.sequenceOrder}. Nothing has been exported; try again.`,
              );
            return response.blob();
          })();
      if (blob.size > 25_000_000)
        throw new Error("A recording is too large to combine on this device.");
      const audio = await context.decodeAudioData(await blob.arrayBuffer());
      seconds += audio.duration;
      if (seconds > 3 * 60 * 60)
        throw new Error("Choose up to three hours of audio per MP3 download.");
      check();
      const samples = pcm16(
        Array.from({ length: audio.numberOfChannels }, (_, i) =>
          audio.getChannelData(i),
        ),
      );
      await send({ type: "encode", pcm: samples }, [samples.buffer]);
    }
    progress("Finishing your MP3…");
    const result = await send({ type: "finish" });
    if (!result.blob?.size) throw new Error("No audio could be exported.");
    return result.blob;
  } catch (e) {
    if (e instanceof DOMException && e.name !== "AbortError")
      throw new Error(
        "This browser could not decode one of the recordings. Download its original audio, or try the combined MP3 on a computer.",
      );
    throw e;
  } finally {
    worker.terminate();
    await context.close();
  }
}
