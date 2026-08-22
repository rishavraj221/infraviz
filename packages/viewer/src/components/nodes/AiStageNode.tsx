import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { AiStageKind } from "../../types";

export type AiStageNodeData = {
  index: number;
  name: string;
  kind: AiStageKind;
  model?: string;
  calls?: string;
  repeats: boolean;
  hasOpportunity: boolean;
  selected: boolean;
  /** true while "what's worth changing" is on and this stage is not one of them */
  dimmed: boolean;
};

const handleStyle: React.CSSProperties = { opacity: 0, width: 1, height: 1, pointerEvents: "none" };

const KIND_TAG: Record<AiStageKind, string> = {
  guard: "guard",
  classify: "classify",
  decompose: "decompose",
  embed: "embed",
  retrieve: "retrieve",
  rerank: "rerank",
  generate: "generate",
  tool: "tool call",
  chunk: "chunk",
  index: "index",
  store: "store",
  other: "step",
};

/** Stages that call a model are where the money is, so they read louder than plumbing. */
const MODEL_KINDS = new Set<AiStageKind>(["classify", "decompose", "generate", "rerank", "embed", "guard"]);

export const STAGE_W = 176;
export const STAGE_H = 94;

/**
 * One stage of a pipeline.
 *
 * The stacked-card treatment on a repeating stage is the point of drawing this
 * as a diagram at all. A stage that runs once per sub-question, in a system that
 * splits a question into eight, costs eight times what a single box implies —
 * and a text badge reading "repeats" does not make anyone feel that. Two offset
 * cards behind the real one do.
 */
export default function AiStageNode({ data }: NodeProps<Node<AiStageNodeData>>) {
  const isModel = Boolean(data.model) || MODEL_KINDS.has(data.kind);
  const accent = isModel ? "var(--accent)" : "var(--line)";

  return (
    <div
      className="relative select-none"
      style={{ width: STAGE_W, height: STAGE_H, opacity: data.dimmed ? 0.32 : 1, transition: "opacity 120ms" }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />

      {/* the stack, drawn behind: multiplicity you can see rather than read */}
      {data.repeats && (
        <>
          <div
            className="absolute rounded-xl border bg-[var(--surface)]"
            style={{ inset: 0, transform: "translate(7px, 7px)", borderColor: "var(--line)", opacity: 0.5 }}
          />
          <div
            className="absolute rounded-xl border bg-[var(--surface)]"
            style={{ inset: 0, transform: "translate(3.5px, 3.5px)", borderColor: "var(--line)", opacity: 0.75 }}
          />
        </>
      )}

      <div
        className="absolute inset-0 rounded-xl border bg-[var(--surface)] px-3 py-2.5 cursor-pointer flex flex-col"
        style={{
          borderColor: data.selected ? "var(--accent)" : accent,
          borderWidth: data.selected || isModel ? 2 : 1,
          boxShadow: data.selected ? "0 0 0 3px var(--accent-soft)" : undefined,
        }}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] text-[var(--ink-soft)] tabular-nums">{data.index}</span>
          <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--ink-soft)] truncate">
            {KIND_TAG[data.kind] ?? data.kind}
          </span>
          {data.hasOpportunity && (
            <span
              className="ml-auto w-[7px] h-[7px] rounded-full shrink-0"
              style={{ background: "var(--warn)" }}
              title="Something worth changing here"
            />
          )}
        </div>

        <div className="text-[12.5px] font-bold leading-tight mt-1 line-clamp-2">{data.name}</div>

        <div className="mt-auto flex flex-col gap-0.5">
          {data.model && (
            <code className="text-[9.5px] font-mono px-1.5 py-0.5 rounded self-start max-w-full truncate bg-[var(--accent-soft)] text-[var(--accent)]">
              {data.model}
            </code>
          )}
          {data.calls && (
            <span className="text-[9.5px] font-mono text-[var(--ink-soft)] truncate">{data.calls}</span>
          )}
        </div>
      </div>
    </div>
  );
}
