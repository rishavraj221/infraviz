import type { NodeProps, Node } from "@xyflow/react";

export type AiFanoutNodeData = { label: string; width: number };

/**
 * The bracket under a run of repeating stages.
 *
 * The stacked cards say "this one repeats". The bracket says how far the
 * repetition reaches — that an embedding call AND a retrieval round trip both
 * happen per sub-question is a different, larger fact than either stage alone,
 * and it is the number that decides what the request actually costs.
 */
export default function AiFanoutNode({ data }: NodeProps<Node<AiFanoutNodeData>>) {
  return (
    <div className="pointer-events-none select-none" style={{ width: data.width }}>
      <svg width={data.width} height={10} className="block">
        <path
          d={`M1 0 L1 6 L${data.width - 1} 6 L${data.width - 1} 0`}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={1.5}
        />
      </svg>
      <div className="text-center mt-0.5">
        <span
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          {data.label}
        </span>
      </div>
    </div>
  );
}
