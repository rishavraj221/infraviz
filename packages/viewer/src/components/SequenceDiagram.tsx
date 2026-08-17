import { useState, useMemo } from "react";
import { useVizStore } from "../store/useVizStore";
import type { Sequence, SeqRow } from "../types";

// Layout constants. Everything below is computed from these plus the row list —
// no hand-placed coordinates, so a new service only has to describe its calls.
const LANE_GAP = 150;
const LANE_X0 = 92;
const HEADER_Y = 26;
const TOP = 46;
const ROW_MSG = 34; // labelled arrow
const ROW_MSG_BARE = 24;
const ROW_NOTE_LINE = 17;
const STEP_PAD = 10;
const STEP_GAP = 12;
const BOX_TITLE_H = 22;

function rowHeight(r: SeqRow): number {
  if (r.t === "msg") return r.label || r.sub ? ROW_MSG : ROW_MSG_BARE;
  const lines = (r.label ? 1 : 0) + (r.sub?.length ?? 0);
  return Math.max(1, lines) * ROW_NOTE_LINE + 4;
}

function StepZone({ id, y1, y2, x2 }: { id: string; y1: number; y2: number; x2: number }) {
  const selectedStep = useVizStore((s) => s.selectedStep);
  const setSelectedStep = useVizStore((s) => s.setSelectedStep);
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedStep === id;
  return (
    <rect
      x={16}
      y={y1}
      width={x2 - 32}
      height={y2 - y1}
      rx={8}
      fill="var(--accent)"
      opacity={isSelected ? 0.22 : hovered ? 0.1 : 0}
      stroke="var(--accent)"
      strokeWidth={isSelected ? 1.4 : 0}
      strokeOpacity={isSelected ? 0.6 : 0}
      onClick={() => setSelectedStep(isSelected ? null : id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer", transition: "opacity 120ms ease, stroke-opacity 120ms ease" }}
    />
  );
}

const textStyle = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fill: "currentColor", pointerEvents: "none" as const };
const lblStyle = { ...textStyle, fontSize: 11, opacity: 0.85 };
const dimStyle = { ...textStyle, fontSize: 10.5, opacity: 0.65 };

function Arrow({ x1, x2, y, dashed, color }: { x1: number; x2: number; y: number; dashed?: boolean; color: string }) {
  // self-call: draw a small hook rather than a zero-length line
  if (x1 === x2) {
    return (
      <path
        d={`M${x1},${y - 8} h34 a6,6 0 0 1 0,12 h-34`}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd="url(#seq-arrow)"
        pointerEvents="none"
      />
    );
  }
  return (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke={color}
      strokeWidth={1.2}
      strokeDasharray={dashed ? "4 3" : undefined}
      markerEnd="url(#seq-arrow)"
      pointerEvents="none"
    />
  );
}

export default function SequenceDiagram({ seq }: { seq: Sequence }) {
  const laneX = useMemo(() => {
    const m: Record<string, number> = {};
    seq.lanes.forEach((l, i) => (m[l.id] = LANE_X0 + i * LANE_GAP));
    return m;
  }, [seq]);
  const width = LANE_X0 + (seq.lanes.length - 1) * LANE_GAP + 130;

  // single layout pass — assign a y to every row, and a band to every step
  const layout = useMemo(() => {
    let y = TOP + 34;
    const rows: { row: SeqRow; y: number }[] = [];
    const bands: { id: string; y1: number; y2: number; box?: { title: string; tone: "accent" | "warn"; x1: number; x2: number } }[] = [];

    for (const r of seq.intro) {
      y += rowHeight(r);
      rows.push({ row: r, y });
    }

    for (const step of seq.steps) {
      const y1 = y + STEP_GAP;
      y = y1 + STEP_PAD + (step.box ? BOX_TITLE_H : 0);
      const touched: number[] = [];
      for (const r of step.rows) {
        y += rowHeight(r);
        rows.push({ row: r, y });
        if (r.t === "msg") touched.push(laneX[r.from] ?? 0, laneX[r.to] ?? 0);
        else touched.push(laneX[r.lane] ?? 0);
      }
      const y2 = y + STEP_PAD;
      const box = step.box
        ? {
            ...step.box,
            x1: (touched.length ? Math.min(...touched) : LANE_X0) - 14,
            x2: (touched.length ? Math.max(...touched) : LANE_X0) + 120,
          }
        : undefined;
      bands.push({ id: step.id, y1, y2, box });
      y = y2;
    }
    return { rows, bands, height: y + 40 };
  }, [seq, laneX]);

  const summaryY = layout.height + 14;
  const totalH = summaryY + 34 + seq.summary.lines.length * 18;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 mb-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[15px] font-bold">{seq.title}</h2>
        <span className="text-[11px] text-[var(--ink-soft)] font-mono">hover a step, click to pin</span>
      </div>
      <p className="text-[13px] text-[var(--ink-soft)] mb-4 max-w-[70ch]">{seq.blurb}</p>
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg)]">
        <svg viewBox={`0 0 ${width} ${totalH}`} className="min-w-[1100px]" role="img" aria-label={seq.title}>
          <defs>
            <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          <g style={{ fontFamily: "ui-monospace, monospace" }} fill="currentColor" className="text-[var(--ink)]">
            {seq.lanes.map((l) => (
              <g key={l.id}>
                <text x={laneX[l.id]} y={HEADER_Y} fontSize={12.5} fontWeight={700} textAnchor="middle" pointerEvents="none">
                  {l.label}
                </text>
                <line x1={laneX[l.id]} y1={TOP} x2={laneX[l.id]} y2={layout.height - 20} stroke="var(--line)" strokeWidth={1} pointerEvents="none" />
              </g>
            ))}

            {/* step boxes sit behind their rows */}
            {layout.bands.map(
              (b) =>
                b.box && (
                  <g key={`box-${b.id}`}>
                    <rect
                      x={b.box.x1}
                      y={b.y1 + 4}
                      width={b.box.x2 - b.box.x1}
                      height={b.y2 - b.y1 - 8}
                      rx={8}
                      fill={b.box.tone === "warn" ? "var(--warn-soft)" : "var(--accent-soft)"}
                      opacity={0.55}
                      pointerEvents="none"
                    />
                    <text
                      x={b.box.x1 + 12}
                      y={b.y1 + 22}
                      fontWeight={700}
                      fontSize={11.5}
                      fill={b.box.tone === "warn" ? "var(--warn)" : "var(--accent)"}
                      pointerEvents="none"
                    >
                      {b.box.title}
                    </text>
                  </g>
                )
            )}

            {layout.rows.map(({ row, y }, i) => {
              if (row.t === "msg") {
                const x1 = laneX[row.from];
                const x2 = laneX[row.to];
                const color = row.tone === "warn" ? "var(--warn)" : row.dashed ? "var(--ink-soft)" : "currentColor";
                const mid = (x1 + x2) / 2;
                return (
                  <g key={i}>
                    {row.label && (
                      <text x={mid} y={y - 7} textAnchor="middle" style={lblStyle}>
                        {row.label}
                      </text>
                    )}
                    <Arrow x1={x1} x2={x2} y={y} dashed={row.dashed} color={color} />
                    {row.sub && (
                      <text x={mid} y={y + 13} textAnchor="middle" style={dimStyle}>
                        {row.sub}
                      </text>
                    )}
                  </g>
                );
              }
              const x = laneX[row.lane] + 8;
              return (
                <g key={i}>
                  {row.label && (
                    <text x={x} y={y} style={lblStyle}>
                      {row.label}
                    </text>
                  )}
                  {row.sub?.map((s, j) => (
                    <text key={j} x={x} y={y + (row.label ? 15 : 0) + j * ROW_NOTE_LINE} style={dimStyle}>
                      {s}
                    </text>
                  ))}
                </g>
              );
            })}

            {/* click targets last so they win hit-testing */}
            {layout.bands.map((b) => (
              <StepZone key={b.id} id={b.id} y1={b.y1} y2={b.y2} x2={width} />
            ))}

            <rect
              x={20}
              y={summaryY}
              width={width - 40}
              height={26 + seq.summary.lines.length * 18}
              rx={8}
              fill="none"
              stroke="var(--line)"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
            <text x={36} y={summaryY + 22} fontWeight={700} style={{ ...lblStyle, opacity: 1 }}>
              {seq.summary.title}
            </text>
            {seq.summary.lines.map((l, i) => (
              <text key={i} x={36} y={summaryY + 42 + i * 18} style={dimStyle}>
                {l}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
