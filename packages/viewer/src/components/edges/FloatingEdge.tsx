import { getBezierPath, useInternalNode, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { getEdgeParams } from "../../utils/floatingEdge";

export default function FloatingEdge({ id, source, target, markerEnd, style, label, animated }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  const stroke = (style?.stroke as string) ?? "var(--ink-soft)";

  return (
    <>
      <path
        id={id}
        className={animated ? "react-flow__edge-path react-flow__edge-path-animated" : "react-flow__edge-path"}
        d={path}
        markerEnd={markerEnd}
        style={style}
        fill="none"
      />
      {/* one dot per edge, right where this specific edge crosses each node's boundary — not shared with any other edge */}
      <circle cx={sx} cy={sy} r={3} fill={stroke} stroke="var(--surface)" strokeWidth={1} />
      <circle cx={tx} cy={ty} r={3} fill={stroke} stroke="var(--surface)" strokeWidth={1} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
            }}
            className="font-mono text-[10.5px] px-1.5 py-0.5 rounded"
          >
            <span
              style={{
                background: "var(--surface)",
                color: stroke,
                border: "1px solid var(--line)",
                borderRadius: 4,
                padding: "2px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
