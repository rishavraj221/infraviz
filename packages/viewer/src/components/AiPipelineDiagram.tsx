import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react";
import AiStageNode, { STAGE_W, STAGE_H, type AiStageNodeData } from "./nodes/AiStageNode";
import AiBandNode, { AiBandLabel, type AiBandNodeData } from "./nodes/AiBandNode";
import AiFanoutNode, { type AiFanoutNodeData } from "./nodes/AiFanoutNode";
import FloatingEdge from "./edges/FloatingEdge";
import type { Ai, AiStage } from "../types";

const nodeTypes = { aiStage: AiStageNode, aiBand: AiBandNode, aiBandLabel: AiBandLabel, aiFanout: AiFanoutNode };
const edgeTypes = { floating: FloatingEdge };

// Layout is computed here, never carried in the artifact. The topology view asks
// the agent for coordinates because its graph has no inherent order; a pipeline
// is an ordered list, so placing it is arithmetic — and asking a model to do
// arithmetic it cannot check is how diagrams end up overlapping.
const GAP_X = 48;
const PAD = 20;
const LABEL_H = 26;
const FANOUT_H = 30;
const BAND_GAP = 34;

interface Placed {
  nodes: Node[];
  edges: Edge[];
  height: number;
  width: number;
}

/** Consecutive repeating stages form one bracket: the fan-out reaches across all of them. */
function repeatRuns(stages: AiStage[]): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  stages.forEach((s, i) => {
    if (s.repeats) {
      if (start === null) start = i;
    } else if (start !== null) {
      runs.push([start, i - 1]);
      start = null;
    }
  });
  if (start !== null) runs.push([start, stages.length - 1]);
  return runs;
}

function build(data: Ai, selected: string | null, focusOpportunities: boolean): Placed {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const pipelines = data.pipelines ?? [];
  // where each pipeline's last stage sits, so a cross-band "reads" edge can find it
  const lastStageOf = new Map<string, string>();
  let y = 0;

  for (const p of pipelines) {
    const stages = p.stages ?? [];
    const runs = repeatRuns(stages);
    const bandW = PAD * 2 + stages.length * STAGE_W + Math.max(0, stages.length - 1) * GAP_X;
    const bandH = LABEL_H + STAGE_H + (runs.length ? FANOUT_H : 0) + PAD * 2;
    const stageY = y + PAD + LABEL_H;

    nodes.push({
      id: `band-${p.id}`,
      type: "aiBand",
      position: { x: 0, y },
      data: { name: p.name, when: p.when, unitOfWork: p.unitOfWork, stageCount: stages.length, width: bandW, height: bandH } as AiBandNodeData,
      draggable: false,
      selectable: false,
      // Negative, so the band tint sits BEHIND the edge layer. At zIndex 0 its
      // fill covered the cross-pipeline edge, which is the one edge on the
      // diagram that says something the stage list does not.
      zIndex: -1,
    });
    nodes.push({
      id: `bandlabel-${p.id}`,
      type: "aiBandLabel",
      position: { x: PAD, y: y + PAD - 4 },
      data: { name: p.name, when: p.when, unitOfWork: p.unitOfWork, stageCount: stages.length, width: bandW, height: bandH } as AiBandNodeData,
      draggable: false,
      selectable: false,
      zIndex: 1,
    });

    stages.forEach((s, i) => {
      const x = PAD + i * (STAGE_W + GAP_X);
      nodes.push({
        id: s.id,
        type: "aiStage",
        position: { x, y: stageY },
        data: {
          index: i + 1,
          name: s.name,
          kind: s.kind,
          model: s.model,
          calls: s.calls,
          repeats: Boolean(s.repeats),
          hasOpportunity: Boolean(s.opportunity),
          selected: selected === s.id,
          dimmed: focusOpportunities && !s.opportunity,
        } as AiStageNodeData,
        draggable: false,
        zIndex: 2,
      });

      if (i > 0) {
        edges.push({
          id: `${stages[i - 1].id}->${s.id}`,
          source: stages[i - 1].id,
          target: s.id,
          type: "floating",
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--ink-soft)" },
          style: { stroke: "var(--ink-soft)", strokeWidth: 1.4 },
        });
      }

      // the seam between two pipelines, drawn only where the artifact names it
      for (const from of s.reads ?? []) {
        const src = lastStageOf.get(from);
        if (src) {
          edges.push({
            id: `reads-${from}-${s.id}`,
            source: src,
            target: s.id,
            type: "floating",
            label: "reads what this built",
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "var(--accent)" },
            style: { stroke: "var(--accent)", strokeWidth: 1.4, strokeDasharray: "5 4" },
          });
        }
      }
    });

    for (const [a, b] of runs) {
      const width = (b - a + 1) * STAGE_W + (b - a) * GAP_X;
      const s = stages[a];
      nodes.push({
        id: `fanout-${p.id}-${a}`,
        type: "aiFanout",
        position: { x: PAD + a * (STAGE_W + GAP_X), y: stageY + STAGE_H + 8 },
        data: {
          width,
          // "both" was wrong the moment a run covered three stages. Say the
          // count, since the count is the point of drawing the bracket at all.
          label: b > a ? `${b - a + 1} stages, ${s.calls ?? "per unit of work"}` : (s.calls ?? "repeats"),
        } as AiFanoutNodeData,
        draggable: false,
        selectable: false,
        zIndex: 1,
      });
    }

    if (stages.length) lastStageOf.set(p.id, stages[stages.length - 1].id);
    y += bandH + BAND_GAP;
  }

  const width = Math.max(
    1,
    ...pipelines.map((p) => PAD * 2 + (p.stages?.length ?? 0) * STAGE_W + Math.max(0, (p.stages?.length ?? 0) - 1) * GAP_X)
  );
  return { nodes, edges, height: Math.max(200, y - BAND_GAP), width };
}

export default function AiPipelineDiagram({
  data,
  selected,
  onSelect,
  focusOpportunities,
}: {
  data: Ai;
  selected: string | null;
  onSelect: (id: string | null) => void;
  focusOpportunities: boolean;
}) {
  const { nodes, edges, height, width } = useMemo(
    () => build(data, selected, focusOpportunities),
    [data, selected, focusOpportunities]
  );

  // The card is sized to what the diagram actually occupies once fitted.
  // A fixed height left a third of the canvas empty above the first band, which
  // read as a rendering failure rather than as space.
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const zoom = avail ? Math.min(1, (avail - 24) / width) : 1;

  // The viewport is set explicitly rather than fitted. fitView runs once on
  // mount, before the width has been measured, so the transform it computed was
  // for the wrong box height and the last band ended up clipped off the bottom.
  const rf = useReactFlow();
  useEffect(() => {
    rf.setViewport({ x: 12, y: 12, zoom });
  }, [rf, zoom, width, height]);

  return (
    <div
      ref={box}
      className="rounded-lg border border-[var(--line)] bg-[var(--bg)]"
      style={{ height: Math.round(height * zoom) + 26 }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={{ x: 12, y: 12, zoom }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelect(n.type === "aiStage" ? (n.id === selected ? null : n.id) : null)}
        onPaneClick={() => onSelect(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line)" />
        <Controls showInteractive={false} position="top-right" />
      </ReactFlow>
    </div>
  );
}
