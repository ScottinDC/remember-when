import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SankeyDiagram } from "../src/components/SankeyDiagram";
import { InterviewForm } from "../src/components/InterviewForm";
import { foundation, node } from "./fixtures";
import { normalizeTree } from "../src/lib/tree";
import "../src/styles.css";
function Preview() {
  const [branched, setBranched] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [interview, setInterview] = useState(false);
  const nodes = normalizeTree(
    branched
      ? [
          ...foundation,
          node("child-a", 6, "question-1"),
          node("child-b", 7, "question-1"),
          node("grandchild", 8, "child-a"),
        ]
      : foundation,
  );
  return (
    <main style={{ maxWidth: 1400, margin: "24px auto", padding: 16 }}>
      <p style={{ marginBottom: 16 }}>
        Local preview · synthetic data ·{" "}
        <button onClick={() => setBranched(!branched)}>
          Toggle follow-ups
        </button>{" "}
        ·{" "}
        <button onClick={() => setInterview(!interview)}>
          Toggle full interview
        </button>
      </p>
      {interview ? (
        <InterviewForm
          state={{
            nodes,
            thread: { id: "demo", title: "Demo", createdAt: "", updatedAt: "" },
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
