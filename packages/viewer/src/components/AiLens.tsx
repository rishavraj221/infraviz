import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import AiPipelineDiagram from "./AiPipelineDiagram";
import ErrorBoundary from "./ErrorBoundary";
import { useVizStore } from "../store/useVizStore";
import type { Ai, AiStage } from "../types";

/**
 * The AI section.
 *
 * Drawn rather than listed, because the two facts that matter here are both
 * spatial. Fan-out is a shape — a stage that runs once per sub-question, in a
 * system that splits a question into eight, is eight boxes deep, and no amount
 * of prose makes that land the way a stack of cards does. And the gap between an
 * offline pipeline and a per-request one is a gap: they run in different time
 * domains, and drawing them as one chain would say they run together.
 *
 * Reading order is deliberate. The diagram answers "what shape is this", the
 * list under it answers "what should I do", and the detail panel answers "what
 * exactly happens here" only once someone asks by clicking. Putting all three on
 * screen at once produced a wall nobody read.
 */
function stageIndex(data: Ai) {
  const out = new Map<string, { stage: AiStage; pipeline: string }>();
  for (const p of data.pipelines ?? []) for (const s of p.stages ?? []) out.set(s.id, { stage: s, pipeline: p.name });
  return out;
}

function Detail({ stage, pipeline, onClose }: { stage: AiStage; pipeline: string; onClose: () => void }) {
  return (
    <div className="rounded-lg border-2 border-[var(--accent)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)]">{pipeline}</span>
        <h4 className="text-[14px] font-bold">{stage.name}</h4>
        {stage.model && (
          <code className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">
            {stage.model}
          </code>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
        >
          close
        </button>
      </div>

      {stage.calls && <p className="text-[11.5px] font-mono text-[var(--ink-soft)] mb-1.5">{stage.calls}</p>}
      <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{stage.detail}</p>

      {stage.opportunity && (
        <div className="mt-2.5 rounded-md bg-[var(--bg)] border-l-2 border-[var(--warn)] px-3 py-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-0.5">
            Worth changing here
          </div>
          <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{stage.opportunity}</p>
        </div>
      )}

      {stage.file && (
        <p className="text-[10.5px] font-mono text-[var(--ink-soft)] mt-2.5">
          <code>
            {stage.file}
            {stage.line ? `:${stage.line}` : ""}
          </code>
          {stage.verification === "failed" && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)]">unverified</span>
          )}
        </p>
      )}
    </div>
  );
}

export default function AiLens({ data }: { data: Ai }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const setSelectedStep = useVizStore((s) => s.setSelectedStep);

  const index = stageIndex(data);
  const chosen = selected ? index.get(selected) : undefined;
  const opportunities = [...index.values()].filter((v) => v.stage.opportunity);

  // Selecting a stage highlights the same step in the sequence diagram, which is
  // the whole reason stepId exists in the artifact.
  useEffect(() => {
    const step = selected ? index.get(selected)?.stage.stepId : undefined;
    if (step) setSelectedStep(step);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--ink)] leading-relaxed max-w-2xl">{data.summary}</p>

      <div className="flex flex-wrap gap-2">
        <div className="rounded-md bg-[var(--bg)] px-3 py-2 flex-1 min-w-[240px]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-0.5">Volume</div>
          <p className="text-[12px] text-[var(--ink)] leading-relaxed">{data.volumeNote}</p>
        </div>
        {data.evals && (
          <div className="rounded-md bg-[var(--bg)] px-3 py-2 flex-1 min-w-[240px]">
            <div
              className="text-[10px] font-mono uppercase tracking-wider mb-0.5"
              style={{ color: data.evals.present ? "var(--ok)" : "var(--warn)" }}
            >
              {data.evals.present ? "Evaluation in place" : "No evaluation"}
            </div>
            <p className="text-[12px] text-[var(--ink)] leading-relaxed">{data.evals.note}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[11.5px] text-[var(--ink-soft)] flex-1 min-w-[240px]">
          Click a stage for what happens there. Stacked cards repeat per unit of work.
        </p>
        {opportunities.length > 0 && (
          <button
            onClick={() => setFocus((f) => !f)}
            className="text-[11.5px] font-semibold px-2.5 py-1 rounded-md border cursor-pointer whitespace-nowrap"
            style={{
              borderColor: focus ? "var(--warn)" : "var(--line)",
              background: focus ? "var(--warn-soft)" : "transparent",
              color: focus ? "var(--warn)" : "var(--ink-soft)",
            }}
          >
            {focus ? "Show every stage" : `Highlight the ${opportunities.length} worth changing`}
          </button>
        )}
      </div>

      <ErrorBoundary label="The pipeline diagram">
        <ReactFlowProvider>
          <AiPipelineDiagram data={data} selected={selected} onSelect={setSelected} focusOpportunities={focus} />
        </ReactFlowProvider>
      </ErrorBoundary>

      {chosen && <Detail stage={chosen.stage} pipeline={chosen.pipeline} onClose={() => setSelected(null)} />}

      {opportunities.length > 0 && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <h4 className="text-[13px] font-bold mb-2.5">Worth changing</h4>
          <div className="flex flex-col gap-2.5">
            {opportunities.map(({ stage, pipeline }) => (
              <button
                key={stage.id}
                onClick={() => setSelected(stage.id)}
                className="text-left rounded-md bg-[var(--bg)] border-l-2 border-[var(--warn)] px-3 py-2 cursor-pointer hover:bg-[var(--accent-soft)]"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[12.5px] font-bold">{stage.name}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)]">
                    {pipeline}
                  </span>
                  {stage.repeats && (
                    <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--warn-soft)] text-[var(--warn)]">
                      repeats
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed mt-0.5">{stage.opportunity}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.note && <p className="text-[11.5px] text-[var(--ink-soft)] leading-relaxed">{data.note}</p>}
    </div>
  );
}
