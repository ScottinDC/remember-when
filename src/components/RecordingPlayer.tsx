import { useRef, useState } from "react";
import { recordingLink } from "../answer-store";
export function RecordingPlayer({
  responseId,
  jobId,
  label,
}: {
  responseId: string;
  jobId?: string;
  label: string;
}) {
  const [link, setLink] = useState<{
      url: string;
      contentType: string | null;
      expiresAt: number;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setLink(await recordingLink(responseId, jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback unavailable");
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      const fresh = await recordingLink(responseId, jobId);
      const response = await fetch(fresh.url);
      if (!response.ok) throw Error("Download failed. Please try again.");
      const blob = await response.blob();
      const mime = fresh.contentType ?? blob.type;
      const ext: Record<string, string> = {
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
        "audio/webm": "webm",
      };
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remember-when-${responseId}.${ext[mime.split(";")[0]] ?? "audio"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="recording-player">
      {link ? (
        <audio
          ref={audio}
          controls
          preload="none"
          src={link.url}
          aria-label={label}
          onError={() => {
            if (link && Date.now() >= link.expiresAt - 1000) void load();
            else
              setError(
                "Playback failed. Refresh the playback link and try again.",
              );
          }}
          onPlay={() => {
            if (link && Date.now() >= link.expiresAt - 1000) {
              audio.current?.pause();
              void load();
              return;
            }
            document.querySelectorAll("audio").forEach((other) => {
              if (other !== audio.current) other.pause();
            });
          }}
        />
      ) : (
        <button
          className="btn-secondary"
          type="button"
          disabled={busy}
          onClick={load}
        >
          {busy ? "Opening…" : "Listen to recording"}
        </button>
      )}
      <div className="flex flex-wrap gap-3 mt-2">
        {link && (
          <button type="button" disabled={busy} onClick={load}>
            Refresh playback link
          </button>
        )}
        <button type="button" disabled={busy} onClick={download}>
          Download audio
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
