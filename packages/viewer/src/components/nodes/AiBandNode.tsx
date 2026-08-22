import type { NodeProps, Node } from "@xyflow/react";

export type AiBandNodeData = {
  name: string;
  when: "request" | "offline" | "scheduled" | "event";
  unitOfWork?: string;
  stageCount: number;
  width: number;
  height: number;
};

/**
 * The container behind one pipeline.
 *
 * Ingestion and query are drawn as separate bands rather than one connected
 * graph on purpose: they run in different time domains, and a single flowing
 * chain would say they run together — which is the exact misconception this view
 * exists to remove. The band label carries "when", because whether someone is
 * waiting on a stage decides whether latency matters at all.
 */
const WHEN: Record<string, { label: string; hint: string; live: boolean }> = {
  request: { label: "per request", hint: "someone is waiting on this", live: true },
  offline: { label: "offline", hint: "nobody is waiting on this", live: false },
  scheduled: { label: "scheduled", hint: "runs on a timer", live: false },
  event: { label: "event-driven", hint: "runs when something upstream happens", live: false },
};

export default function AiBandNode({ data }: NodeProps<Node<AiBandNodeData>>) {
  const when = WHEN[data.when] ?? WHEN.request;
  return (
    <div
      className="rounded-2xl border border-dashed pointer-events-none"
      style={{
        width: data.width,
        height: data.height,
        borderColor: when.live ? "var(--accent)" : "var(--line)",
        // The offline band must not use --bg: that is the canvas colour, so the
        // band vanished entirely and the two pipelines read as one.
        background: when.live ? "var(--accent-soft)" : "var(--surface)",
        opacity: when.live ? 0.45 : 0.7,
      }}
    />
  );
}

/** Drawn as its own node so it sits above the band tint but below the stages. */
export function AiBandLabel({ data }: NodeProps<Node<AiBandNodeData>>) {
  const when = WHEN[data.when] ?? WHEN.request;
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap pointer-events-none select-none">
      <span className="text-[13px] font-bold">{data.name}</span>
      <span
        className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
        style={{
          background: when.live ? "var(--accent-soft)" : "var(--mono-bg)",
          color: when.live ? "var(--accent)" : "var(--ink-soft)",
        }}
        title={when.hint}
      >
        {when.label}
      </span>
      {data.unitOfWork && (
        <span className="text-[11px] text-[var(--ink-soft)]">per {data.unitOfWork}</span>
      )}
    </div>
  );
}
