import { useState } from "react";
import type { Synthesis, Priority } from "../synthesis";
import type { VizData } from "../types";
import { serviceNames } from "../synthesis";

const SEV: Record<string, { fg: string; bg: string }> = {
  critical: { fg: "var(--danger)", bg: "var(--danger-soft)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-soft)" },
};
const EFFORT: Record<string, string> = { low: "low effort", medium: "medium effort", high: "high effort" };

/**
 * The single ranked list of what to do across the whole system.
 *
 * Ranking is mechanical and stated, not a black box: risk outranks improvement,
 * low effort outranks high, and anything landing in several services outranks
 * the same work in one — because that is one change, not five.
 */
export default function PrioritiesPanel({ synthesis, data }: { synthesis: Synthesis; data: VizData }) {
  const [all, setAll] = useState(false);
  const { priorities, cost, risk, shared } = synthesis;
  if (!priorities.length) return null;

  const shown = all ? priorities : priorities.slice(0, 6);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[15px] font-bold tracking-tight">What to do next</h2>
        <span className="text-[11.5px] text-[var(--ink-soft)]">
          {priorities.length} item{priorities.length === 1 ? "" : "s"} across the services analysed
          {shared.length > 0 && ` · ${shared.length} affect more than one`}
        </span>
      </div>

      {/* three numbers a product owner can act on, and nothing else */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Tile
          label="Critical risks"
          value={String(risk.critical)}
          sub={risk.warn ? `${risk.warn} more worth watching` : "nothing else flagged"}
          tone={risk.critical ? "critical" : undefined}
        />
        <Tile
          label="Fixes more than one service"
          value={String(shared.length)}
          sub={shared.length ? "one change, several services" : "no shared root causes found"}
        />
        <Tile
          label={cost.anyActual ? "Observed spend" : "Spend"}
          value={
            cost.anyActual
              ? cost.total.toLocaleString(undefined, { style: "currency", currency: cost.currency })
              : "—"
          }
          sub={cost.anyActual ? "billed, across periods observed" : "connect a cloud account to see this"}
        />
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
        {shown.map((p, i) => (
          <Row key={`${p.kind}-${p.id}-${i}`} p={p} rank={i + 1} data={data} />
        ))}
      </div>

      {priorities.length > 6 && (
        <button
          onClick={() => setAll((v) => !v)}
          className="self-start text-[11.5px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
        >
          {all ? "show top 6" : `show all ${priorities.length}`}
        </button>
      )}

      <p className="text-[10.5px] text-[var(--ink-soft)] leading-relaxed">
        Ranked by risk first, then effort, with a boost for anything that lands in several services. Items citing the
        same file are merged — that is one fix, not several.
      </p>
    </section>
  );
}

function Row({ p, rank, data }: { p: Priority; rank: number; data: VizData }) {
  const names = serviceNames(data, p.services);
  const isPlatform = p.services.length > 1;
  return (
    <div className="px-4 py-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <span className="font-mono text-[11px] text-[var(--ink-soft)] tabular-nums w-4 shrink-0">{rank}</span>
      <span className="text-[13px] font-semibold flex-1 min-w-[240px]">{p.title}</span>

      {p.severity && (
        <span
          className="text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
          style={{ background: SEV[p.severity].bg, color: SEV[p.severity].fg }}
        >
          {p.severity}
        </span>
      )}
      {p.effort && (
        <span className="text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--mono-bg)] text-[var(--ink-soft)] shrink-0">
          {EFFORT[p.effort]}
        </span>
      )}

      <div className="w-full flex flex-wrap items-baseline gap-x-2 -mt-0.5">
        <span className="text-[12px] text-[var(--ink-soft)] leading-relaxed flex-1 min-w-[260px]">{p.why}</span>
        <span
          className="text-[10.5px] font-mono shrink-0"
          style={{ color: isPlatform ? "var(--accent)" : "var(--ink-soft)" }}
          title={names.join(", ")}
        >
          {isPlatform ? `${names.length} services` : names[0]}
        </span>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "critical" }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-mono">{label}</div>
      <div
        className="font-mono font-bold text-[21px] leading-tight mt-0.5"
        style={{ color: tone === "critical" ? "var(--danger)" : "var(--accent)" }}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--ink-soft)] mt-0.5 leading-snug">{sub}</div>
    </div>
  );
}
