import { combinedMp3 } from "../src/lib/audio-export";
import { downloadBlob } from "../src/lib/story-export";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SankeyDiagram } from "../src/components/SankeyDiagram";
import { InterviewForm } from "../src/components/InterviewForm";
import { AdminArchive, type Archive } from "../src/components/AdminArchive";
import { foundation, node } from "./fixtures";
import { normalizeTree } from "../src/lib/tree";
import "../src/styles.css";
const sample: Archive = {
  members: [
    {
      email: "recorder@example.com",
      user_id: "demo",
      role: "member",
      status: "active",
    },
    {
      email: "admin@example.com",
      user_id: "admin",
      role: "admin",
      status: "active",
    },
  ],
  recordings: [
    {
      id: "sample",
      question: "What do you remember about your childhood garden?",
      transcript:
        "We planted beans in the spring. I remember checking every morning to see whether the first shoots had appeared.",
      status: "answered",
      timestamp: "2026-10-01T12:00:00Z",
      owner_email: "recorder@example.com",
      has_audio: true,
      archived_at: null,
      versions: [],
    },
    {
      id: "sample-2",
      question: "Who taught you something you still use today?",
      transcript: null,
      status: "failed",
      timestamp: "2026-10-02T12:00:00Z",
      owner_email: "recorder@example.com",
      has_audio: true,
      archived_at: null,
      versions: [],
    },
  ],
  total: 2,
  deliveries: [],
};
const mockClient = {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal2" },
      }),
      listFactors: async () => ({
        data: { totp: [{ id: "fake", status: "verified" }] },
      }),
    },
  },
  rpc: async (name: string) =>
    name === "admin_archive"
      ? { data: sample }
      : { error: Error("This is a local preview.") },
} as unknown as SupabaseClient;
function Preview() {
  const [branched, setBranched] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState("chart"),
    [exportStatus, setExportStatus] = useState("");
  const nodes = normalizeTree(
    branched
      ? [
          ...foundation,
          node("child-a", 6, "question-1"),
          node("child-b", 7, "question-1"),
          node("grandchild", 8, "child-a"),
        ]
      : foundation,
  ).map((n, i) => ({
    ...n,
    ...(i === 0
      ? {
          hasAudio: true,
          status: "answered" as const,
          transcript: "A sample family memory for the local preview.",
        }
      : i === 1
        ? { hasAudio: true, status: "failed" as const }
        : {}),
  }));
  return (
    <main style={{ maxWidth: 1400, margin: "24px auto", padding: 16 }}>
      <p className="mb-4">
        Local preview · sample data ·{" "}
        <button onClick={() => setBranched(!branched)}>
          Toggle follow-ups
        </button>{" "}
        · <button onClick={() => setMode("chart")}>Chart</button> ·{" "}
        <button onClick={() => setMode("interview")}>Interview</button> ·{" "}
        <button onClick={() => setMode("admin")}>Admin preview</button> ·{" "}
        <button
          onClick={async () => {
            try {
              const blob = await combinedMp3(
                nodes.slice(0, 2),
                setExportStatus,
                new AbortController().signal,
                async () => sampleWav(),
              );
              downloadBlob(blob, "remember-when-test-tone.mp3");
              setExportStatus("Sample MP3 ready: two one-second tones.");
            } catch (e) {
              setExportStatus(String(e));
            }
          }}
        >
          Export sample MP3
        </button>
        <span role="status">{exportStatus}</span>
      </p>
      {mode === "admin" ? (
        <AdminArchive client={mockClient} />
      ) : mode === "interview" ? (
        <InterviewForm
          state={{
            nodes,
            thread: {
              id: "preview-only",
              title: "Demo",
              createdAt: "",
              updatedAt: "",
            },
          }}
          onStateChange={() => {}}
          setError={() => {}}
        />
      ) : (
        <SankeyDiagram
          nodes={nodes}
          activeQuestionId={selected}
          onSelect={setSelected}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);

function sampleWav() {
  const sampleRate = 44100,
    samples = sampleRate,
    bytes = new ArrayBuffer(44 + samples * 2),
    v = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      v.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++)
    v.setInt16(
      44 + i * 2,
      Math.sin((i * 440 * 2 * Math.PI) / sampleRate) * 5000,
      true,
    );
  return new Blob([bytes], { type: "audio/wav" });
}
