import { Mp3Encoder } from "@breezystack/lamejs";
let encoder: Mp3Encoder | null = null;
let parts: Uint8Array<ArrayBuffer>[] = [];
self.onmessage = (
  event: MessageEvent<{ type: string; pcm?: Int16Array; sampleRate?: number }>,
) => {
  try {
    if (event.data.type === "start") {
      encoder = new Mp3Encoder(1, event.data.sampleRate!, 128);
      parts = [];
      self.postMessage({ type: "ready" });
    } else if (event.data.type === "encode" && encoder && event.data.pcm) {
      const samples = event.data.pcm;
      for (let i = 0; i < samples.length; i += 1152) {
        const bytes = encoder.encodeBuffer(samples.subarray(i, i + 1152));
        if (bytes.length) parts.push(Uint8Array.from(bytes));
      }
      self.postMessage({ type: "encoded" });
    } else if (event.data.type === "finish" && encoder) {
      const tail = encoder.flush();
      if (tail.length) parts.push(Uint8Array.from(tail));
      self.postMessage({
        type: "finished",
        blob: new Blob(parts, { type: "audio/mpeg" }),
      });
      parts = [];
      encoder = null;
    }
  } catch {
    self.postMessage({ type: "error" });
  }
};
