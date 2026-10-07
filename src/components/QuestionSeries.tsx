import type { MemoryNode } from "../types";
// Recovered from the September 17 deployment; see docs/SOURCE-RECOVERY.md.
import { sortBySequence, questionNumber, seriesLabel } from "../lib/interview";
function QuestionSeries({
  nodes,
  activeQuestionId,
  onSelect,
}: {
  nodes: MemoryNode[];
  activeQuestionId: string | null;
  onSelect: (id: string) => void;
}) {
  const parentIds = new Set(nodes.map((c) => c.parentQuestionId)),
    leaves = sortBySequence(nodes).filter((c) => !parentIds.has(c.id));
  return (
    <section className="form-card min-w-0">
      <div className="card-header mx-5 mt-1 flex-wrap gap-2">
        <h2 className="panel-title">{"Your questions"}</h2>
        <span className="panel-subtitle">
          {leaves.length}
          {" current branches"}
        </span>
      </div>
      <p className="px-5 pt-1 text-sm text-ink-secondary">
        {"Earlier questions remain available in the chart and My recordings."}
      </p>
      <ol className="m-0 list-none p-3">
        {leaves.map((c) => (
          <li className="border-b border-line-soft last:border-b-0" key={c.id}>
            <button
              type="button"
              aria-current={activeQuestionId === c.id ? "true" : void 0}
              onClick={() => onSelect(c.id)}
              className={`my-1 grid w-full grid-cols-[auto_1fr] gap-3 rounded-xl border-l-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-light ${activeQuestionId === c.id ? "border-navy bg-[#b8d5fa] text-ink" : "border-transparent hover:border-navy-light hover:bg-[#f5f5f5]"}`}
            >
              <span className="font-mono">{questionNumber(c)}</span>
              <span>
                <span className="mb-1 block text-sm text-ink-secondary">
                  {seriesLabel(c)}
                </span>
                {c.question}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
export { QuestionSeries };
