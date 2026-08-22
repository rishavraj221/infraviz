import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useReactFlow,
  MarkerType,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import ServiceNode, { type ServiceNodeData } from "./nodes/ServiceNode";
import FloatingEdge from "./edges/FloatingEdge";
import { useVizStore, type Tab } from "../store/useVizStore";
import type { Topology, Finding, Optimisations, Deployment, ServiceDef } from "../types";
import OptimiseLens from "./OptimiseLens";
import DeploymentLens from "./DeploymentLens";
import ErrorBoundary from "./ErrorBoundary";

const nodeTypes = { service: ServiceNode };
const edgeTypes = { floating: FloatingEdge };

// Only lenses the artifact format can actually feed. `cost` and `ratelimit` need
// pricing and quota data the schema doesn't carry yet, so they are deliberately
// not offered rather than rendered with invented numbers.
const TABS: [Tab, string][] = [
  ["flow", "Flow"],
  ["load", "Load / scaling"],
  ["security", "Security"],
  ["compliance", "Compliance"],
  ["reliability", "Reliability"],
  ["optimise", "Optimise"],
  ["deployment", "Deployment"],
];
const RISK: Tab[] = ["security", "compliance", "reliability"];

function buildEdgeStepMap(topo: Topology): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const step of topo.steps) for (const e of step.edges) (map[e] ||= []).push(step.id);
  return map;
}

export default function DiagramCard({
  topology,
  optimise,
  deployment,
  service,
}: {
  topology: Topology;
  optimise?: Optimisations | null;
  deployment?: Deployment | null;
  service: ServiceDef;
}) {
  const activeTab = useVizStore((s) => s.activeTab);
  const setActiveTab = useVizStore((s) => s.setActiveTab);
  const selectedStep = useVizStore((s) => s.selectedStep);
  const setSelectedStep = useVizStore((s) => s.setSelectedStep);
  const selectedFinding = useVizStore((s) => s.selectedFinding);
  const setSelectedFinding = useVizStore((s) => s.setSelectedFinding);
  const perCallSuccess = useVizStore((s) => s.perCallSuccess);
  const setPerCallSuccess = useVizStore((s) => s.setPerCallSuccess);
  const fanOutUnits = useVizStore((s) => s.fanOutUnits);
  const setFanOutUnits = useVizStore((s) => s.setFanOutUnits);

  // artifact-backed lenses appear only when their artifact exists; the rest come
  // from what the topology says it can support
  const available = TABS.filter(([k]) =>
    k === "optimise" ? Boolean(optimise) : k === "deployment" ? Boolean(deployment) : topology.lenses.includes(k)
  );
  const tabFindings: Finding[] | undefined = RISK.includes(activeTab)
    ? topology.risk[activeTab as "security" | "compliance" | "reliability"]
    : undefined;
  const activeFinding = tabFindings?.find((f) => f.id === selectedFinding) ?? null;

  const edgeStepMap = useMemo(() => buildEdgeStepMap(topology), [topology]);

  const initialNodes = useMemo<Node<ServiceNodeData>[]>(
    () =>
      topology.nodes.map((n) => ({
        id: n.id,
        type: "service",
        position: { x: n.x, y: n.y },
        data: { label: n.label, sublabel: n.sublabel, kind: n.kind },
      })),
    [topology]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ServiceNodeData>>(initialNodes);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(initialNodes);
    // the boolean fitView prop fires before the container has measured, which
    // clips the graph — re-fit once a frame has actually painted
    const raf = requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [initialNodes, setNodes, fitView]);

  const edges: Edge[] = useMemo(
    () =>
      topology.edges.map((e) => {
        const stepIds = edgeStepMap[e.id] ?? [];
        const stepSelected = selectedStep !== null && stepIds.includes(selectedStep);
        const findingSelected = activeFinding !== null && (activeFinding.edges ?? []).includes(e.id);
        const isSelected = stepSelected || findingSelected;
        // a step highlights in the accent colour; a risk finding highlights in its
        // own severity colour, so the diagram reads as "the problem is here"
        const highlight = findingSelected
          ? activeFinding!.severity === "critical"
            ? "var(--danger)"
            : "var(--warn)"
          : "var(--accent)";
        const stroke = isSelected ? highlight : "var(--ink-soft)";
        const dimmed = (selectedStep !== null || activeFinding !== null) && !isSelected;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: activeTab === "flow" ? e.label : undefined,
          type: "floating",
          animated: isSelected,
          style: { stroke, strokeWidth: isSelected ? 2.5 : 1.2, opacity: dimmed ? 0.2 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
        };
      }),
    [topology, activeTab, selectedStep, activeFinding, edgeStepMap]
  );

  const activeStepInfo = topology.steps.find((s) => s.id === selectedStep) ?? null;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const height = Math.min(720, Math.max(440, 240 + topology.nodes.length * 46));

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
      {topology.kpis.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-4 pb-4 border-b border-[var(--line)]">
          {topology.kpis.map((k) => (
            <div key={k.label}>
              <div className="text-[10.5px] uppercase tracking-wide text-[var(--ink-soft)] font-mono">{k.label}</div>
              <div
                className="text-[16px] font-bold font-mono"
                style={{
                  color: k.tone === "critical" ? "var(--danger)" : k.tone === "warn" ? "var(--warn)" : "var(--accent)",
                }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-[var(--line)] mb-4 flex-wrap">
        {available.map(([key, label], i) => (
          <div key={key} className="flex items-center">
            {i > 0 && RISK.includes(key) && !RISK.includes(available[i - 1][0]) && (
              <span className="w-px h-4 bg-[var(--line)] mx-2" aria-hidden />
            )}
            <button
              onClick={() => {
                setActiveTab(key);
                if (key !== "flow") setSelectedStep(null);
              }}
              className={`px-3.5 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === key
                  ? "text-[var(--accent)] border-[var(--accent)]"
                  : "text-[var(--ink-soft)] border-transparent hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          </div>
        ))}
      </div>

      <div
        ref={wrapRef}
        className={`rounded-lg border border-[var(--line)] overflow-hidden relative ${isFullscreen ? "bg-[var(--bg)]" : ""}`}
        style={{ height: isFullscreen ? "100vh" : height }}
      >
        <button
          onClick={() =>
            document.fullscreenElement ? document.exitFullscreen() : wrapRef.current?.requestFullscreen()
          }
          className="absolute top-2.5 right-2.5 z-10 text-[11px] font-mono px-2.5 py-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--accent)] cursor-pointer"
        >
          {isFullscreen ? "⤡ exit fullscreen" : "⤢ fullscreen"}
        </button>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch
          minZoom={0.4}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--line)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-[11px] text-[var(--ink-soft)] mt-2">
        Drag any box to rearrange · scroll the page normally, pinch or use +/− to zoom.
      </p>

      {activeTab === "load" && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <div className="rounded-lg bg-[var(--warn-soft)] p-3 text-[12.5px] text-[var(--warn)]">
            <b>Not measured.</b>{" "}
            {topology.loadNote ??
              "No load measurements were found for this service, so no CPU or throughput curve is shown rather than implying one exists."}
          </div>
        </div>
      )}

      {activeTab === "optimise" && optimise && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <ErrorBoundary label="The optimise tab">
            <OptimiseLens data={optimise} service={service} />
          </ErrorBoundary>
        </div>
      )}

      {activeTab === "deployment" && deployment && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <ErrorBoundary label="The deployment tab">
            <DeploymentLens data={deployment} service={service} />
          </ErrorBoundary>
        </div>
      )}

      {activeTab === "reliability" && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <ReliabilityMeter
            model={topology.reliabilityModel}
            value={perCallSuccess}
            onChange={setPerCallSuccess}
            units={fanOutUnits}
            onUnitsChange={setFanOutUnits}
          />
        </div>
      )}

      {activeTab === "flow" && topology.steps.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--line)]">
          <div className="flex flex-wrap gap-1.5">
            {topology.steps.map((step) => (
              <button
                key={step.id}
                onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                className={`text-[11px] font-mono px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  selectedStep === step.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]"
                }`}
              >
                {step.title}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-[var(--bg)] border border-[var(--line)] p-3 min-h-[70px]">
            {activeStepInfo ? (
              <>
                <div className="font-bold text-[13.5px]">{activeStepInfo.title}</div>
                {activeStepInfo.code && (
                  <div className="text-[11px] font-mono text-[var(--ink-soft)] mt-1">
                    <code>{activeStepInfo.code}</code>
                  </div>
                )}
                <p className="text-[13px] text-[var(--ink-soft)] mt-1.5">{activeStepInfo.desc}</p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--ink-soft)]">
                Click a step — the matching hop highlights in the diagram, with the real code location.
              </p>
            )}
          </div>
        </div>
      )}

      {tabFindings && (
        <div className={`mt-4 ${activeTab === "reliability" ? "" : "pt-4 border-t border-[var(--line)]"}`}>
          {tabFindings.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--line)] p-4 text-[12.5px] text-[var(--ink-soft)]">
              No {activeTab} findings were reported for this service. An empty result is a real answer — padding it
              would devalue the findings that are here.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {tabFindings.map((f) => {
                  const on = selectedFinding === f.id;
                  const tone = f.severity === "critical" ? "var(--danger)" : "var(--warn)";
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFinding(on ? null : f.id)}
                      className="flex items-center gap-1.5 text-[11.5px] font-mono px-2.5 py-1.5 rounded-full border transition-colors cursor-pointer"
                      style={{
                        borderColor: on ? tone : "var(--line)",
                        background: on
                          ? f.severity === "critical"
                            ? "var(--danger-soft)"
                            : "var(--warn-soft)"
                          : "transparent",
                        color: on ? tone : "var(--ink-soft)",
                      }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tone }} />
                      {f.title}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-lg bg-[var(--bg)] border border-[var(--line)] p-3.5 min-h-[92px]">
                {activeFinding ? (
                  <FindingDetail f={activeFinding} />
                ) : (
                  <p className="text-[13px] text-[var(--ink-soft)]">
                    Click a finding — the affected hop lights up above, in its severity colour.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FindingDetail({ f }: { f: Finding }) {
  const tone = f.severity === "critical" ? "var(--danger)" : "var(--warn)";
  const soft = f.severity === "critical" ? "var(--danger-soft)" : "var(--warn-soft)";
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: soft, color: tone }}
        >
          {f.severity}
        </span>
        <span className="font-bold text-[13.5px]">{f.title}</span>
        <span className="ml-auto flex items-center gap-2">
          <VerificationBadge f={f} />
          {(f.code || f.file) && (
            <span className="text-[11px] font-mono text-[var(--ink-soft)]">
              <code>
                {f.code ?? f.file}
                {f.line ? `:${f.line}` : ""}
              </code>
            </span>
          )}
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-[52px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] pt-[3px]">Breaks</dt>
        <dd className="text-[var(--ink)] leading-relaxed">{f.breaks}</dd>
        <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] pt-[3px]">Fix</dt>
        <dd className="text-[var(--ink-soft)] leading-relaxed">{f.fix}</dd>
      </dl>
    </>
  );
}

export function VerificationBadge({ f }: { f: { verification?: string; verificationNote?: string } }) {
  if (f.verification === "verified")
    return (
      <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[var(--ok-soft)] text-[var(--ok)]">verified</span>
    );
  if (f.verification === "failed")
    return (
      <span
        className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)]"
        title={f.verificationNote}
      >
        unverified claim
      </span>
    );
  return null;
}

function ReliabilityMeter({
  model,
  value,
  onChange,
  units,
  onUnitsChange,
}: {
  model: Topology["reliabilityModel"];
  value: number;
  onChange: (n: number) => void;
  units: number;
  onUnitsChange: (n: number) => void;
}) {
  // Belt and braces: the server now hydrates schema defaults, but a viewer that
  // blanks the entire page because one optional field is missing is a bad trade.
  const groups = model?.groups ?? [];
  const fixed = groups.reduce((a, g) => a + g.n, 0);
  const total = fixed + (model?.fanOut ? units : 0);
  const e2e = Math.pow(value / 100, total) * 100;
  const failRate = 1 - e2e / 100;
  const oneIn = failRate > 0 ? Math.round(1 / failRate) : Infinity;
  const tone = e2e < 90 ? "var(--danger)" : e2e < 99 ? "var(--warn)" : "var(--accent)";
  const shown = [...groups, ...(model?.fanOut ? [{ label: model.fanOut.label, n: units }] : [])];

  if (total === 0) {
    return (
      <p className="text-[12.5px] text-[var(--ink-soft)]">
        No external dependencies were reported for this service, so there is no compounding failure model to show.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-[var(--ink-soft)] font-mono">
            End-to-end success
          </div>
          <div className="font-mono font-bold text-[30px] leading-tight" style={{ color: tone }}>
            {e2e < 1 ? e2e.toFixed(2) : e2e.toFixed(1)}%
          </div>
          <div className="text-[12px] text-[var(--ink-soft)]">
            ≈ 1 in{" "}
            <b className="font-mono text-[var(--ink)]">{Number.isFinite(oneIn) ? oneIn.toLocaleString() : "—"}</b>{" "}
            requests fails
          </div>
        </div>

        <div className="flex-1 min-w-[240px]">
          <div className="flex items-baseline justify-between text-[12px] text-[var(--ink-soft)] mb-1">
            <span>Per-call success rate</span>
            <span className="font-mono font-bold text-[var(--ink)]">{value.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min={98}
            max={99.99}
            step={0.01}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {model?.fanOut && (
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-baseline justify-between text-[12px] text-[var(--ink-soft)] mb-1">
              <span>{model.fanOut!.unitLabel}</span>
              <span className="font-mono font-bold text-[var(--ink)]">{units.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min={1}
              max={model.fanOut!.maxUnits}
              step={1}
              value={units}
              onChange={(e) => onUnitsChange(Number(e.target.value))}
              className="w-full accent-[var(--warn)]"
            />
          </div>
        )}
      </div>

      {/* each dependency is a multiplier — the headline falls faster than intuition suggests */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {shown.map((g) => (
          <span key={g.label} className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--ink-soft)]">
            <span className="w-2.5 h-1.5 rounded-[1px]" style={{ background: tone, opacity: 0.55 }} />
            {g.label} ×{g.n}
          </span>
        ))}
        <span className="text-[10px] font-mono text-[var(--ink-soft)] ml-auto">
          {total.toLocaleString()} must all succeed
        </span>
      </div>
    </div>
  );
}
