import { useEffect, useRef, useState } from "react";
import { readDraft, saveDraft, deleteDraft } from "./lib/drafts";

const MAX_SECONDS = 5 * 60;

function pickMimeType() {
  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useRecorder(draftKey?: string | null) {
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state === "recording") recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const [draftLoading, setDraftLoading] = useState(Boolean(draftKey));
  const secondsRef = useRef(0);
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);
  useEffect(() => {
    if (!draftKey) {
      setDraftLoading(false);
      return;
    }
    setDraftLoading(true);
    let cancelled = false;
    readDraft(draftKey)
      .then((draft) => {
        if (!cancelled && draft) {
          setAudioBlob(draft.blob);
          setAudioUrl(URL.createObjectURL(draft.blob));
          setSeconds(draft.seconds);
        }
      })
      .catch(() =>
        setError(
          "Device draft recovery is unavailable. Keep this page open until you save.",
        ),
      )
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (isRecording) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRecording]);

  async function start() {
    if (startingRef.current || recorderRef.current?.state === "recording")
      return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setStream(stream);
      chunksRef.current = [];
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (draftKey)
          void saveDraft(draftKey, blob, secondsRef.current).catch(() =>
            setError(
              "This browser could not protect your draft. Save it before leaving this page.",
            ),
          );
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      setSeconds(0);
      secondsRef.current = 0;
      recorder.start();
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          if (current + 1 >= MAX_SECONDS) {
            stop();
            return MAX_SECONDS;
          }
          return current + 1;
        });
      }, 1000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setIsRecording(false);
      setError("Microphone access is needed to record an answer.");
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function reset() {
    if (draftKey)
      void deleteDraft(draftKey).catch(() =>
        setError("Could not clear the device draft."),
      );
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setSeconds(0);
    setError(null);
  }

  return {
    starting,
    draftLoading,
    audioBlob,
    audioUrl,
    error,
    isRecording,
    maxSeconds: MAX_SECONDS,
    seconds,
    stream,
    reset,
    start,
    stop,
  };
}
