import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { NodeKind } from "../../types";

export type ServiceNodeData = {
  label: string;
  sublabel?: string;
  kind: NodeKind;
};

type Props = NodeProps<Node<ServiceNodeData>>;

// Invisible: react-flow still needs Handle elements as connection anchors, but
// the visible dots are drawn per-edge by FloatingEdge, right where each specific
// edge crosses the node boundary. Fixed visible handles would mean every edge on
// a side shares one dot and overlaps.
const handleStyle: React.CSSProperties = { opacity: 0, width: 1, height: 1, pointerEvents: "none" };

/** A short tag per node kind, so the graph reads without needing a legend. */
const KIND_TAG: Partial<Record<NodeKind, string>> = {
  openai: "LLM",
  db: "database",
  vector: "vector",
  cache: "cache",
  storage: "storage",
  external: "third-party",
  lb: "load balancer",
};

export default function ServiceNode({ data }: Props) {
  const isTask = data.kind === "task";
  const tag = KIND_TAG[data.kind];

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 text-center shadow-sm w-[190px] cursor-grab active:cursor-grabbing select-none ${
        isTask ? "border-[var(--accent)] bg-[var(--accent-soft)] border-2" : "border-[var(--line)] bg-[var(--surface)]"
      }`}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />

      <div className="font-mono text-[14px] font-bold text-[var(--ink)]">{data.label}</div>
      {data.sublabel && <div className="mt-0.5 text-[11px] text-[var(--ink-soft)] font-mono">{data.sublabel}</div>}
      {tag && !isTask && (
        <div className="mt-1.5 text-[9.5px] font-mono uppercase tracking-wider text-[var(--ink-soft)] opacity-60">
          {tag}
        </div>
      )}
    </div>
  );
}
