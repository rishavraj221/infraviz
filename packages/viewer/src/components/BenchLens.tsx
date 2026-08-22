import type { Bench, BenchItem } from "../types";

/**
 * What the pack is worth here.
 *
 * Built around the number people leave out. Cost-today and gain-after are the
 * easy pair and they make every recommendation look equally attractive; the
 * third column, what adopting it costs, is the one the reader is actually
 * deciding on. So all three sit side by side at the same weight, and migration
 * is never collapsed into a footnote.
 *
 * The other deliberate choice is that a claim's provenance is visible without
 * expanding anything. "Counted from the code" and "arithmetic on an assumption"
 * are different kinds of statement, and the assumptions ride directly under the
 * figure they belong to rather than in a methodology section nobody reads.
 */

const UNIT: Record<string, string> = {
  "calls-per-request": "calls per request",
  "calls-per-month": "calls per month",
  "tokens-per-request": "tokens per request",
  "tokens-per-month": "tokens per month",
  "seconds-per-request": "seconds per request",
  "usd-per-month": "USD per month",
  qualitative: "",
};

const BASIS: Record<string, { label: string; fg: string; bg: string; hint: string }> = {
  structural: {
    label: "counted",
    fg: "var(--ok)",
    bg: "var(--ok-soft)",
    hint: "read off the code — true whatever the traffic is",
  },
  estimated: {
    label: "estimated",
    fg: "var(--warn)",
    bg: "var(--warn-soft)",
    hint: "arithmetic on an assumption — the assumptions are listed below the figure",
  },
  measured: {
    label: "measured",
    fg: "var(--accent)",
    bg: "var(--accent-soft)",
    hint: "taken from a real run",
  },
};

function Item({ item, i, onStage }: { item: BenchItem; i: number; onStage?: (id: string) => void }) {
  const b = BASIS[item.today.basis] ?? BASIS.estimated;
  const assumptions = item.assumptions ?? [];

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 mb-2.5">
        <span className="font-mono text-[11px] text-[var(--ink-soft)] tabular-nums">{i + 1}</span>
        <h3 className="font-bold text-[14px] flex-1 min-w-[220px]">{item.applies}</h3>
        <span
          className="text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
          style={{ background: b.bg, color: b.fg }}
          title={b.hint}
        >
          {b.label}
        </span>
        {item.confidence !== "high" && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--mono-bg)] text-[var(--ink-soft)]">
            {item.confidence} confidence
          </span>
        )}
      </div>

      {/* all three at equal weight — the third is the one that decides it */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="rounded-md bg-[var(--bg)] p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-1">Today</div>
          <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{item.today.value}</p>
          {UNIT[item.today.unit] && (
            <p className="text-[10.5px] font-mono text-[var(--ink-soft)] mt-1">{UNIT[item.today.unit]}</p>
          )}
        </div>
        <div className="rounded-md bg-[var(--bg)] p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ok)] mb-1">After</div>
          <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{item.after}</p>
        </div>
        <div className="rounded-md bg-[var(--bg)] p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] mb-1">
            Costs to adopt
          </div>
          <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{item.migration}</p>
        </div>
      </div>

      {assumptions.length > 0 && (
        <div className="mt-2.5 rounded-md border-l-2 border-[var(--warn)] bg-[var(--bg)] px-3 py-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-1">
            That number assumes
          </div>
          <ul className="flex flex-col gap-0.5">
            {assumptions.map((a, k) => (
              <li key={k} className="text-[12px] text-[var(--ink)] leading-relaxed">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-[12.5px] mt-2.5">
        <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] pt-[3px]">
          Quality risk
        </dt>
        <dd className="text-[var(--ink-soft)] leading-relaxed">{item.qualityRisk}</dd>
        {item.evidenceNeeded && (
          <>
            <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--danger)] pt-[3px]">
              Prove first
            </dt>
            <dd className="text-[var(--ink-soft)] leading-relaxed">{item.evidenceNeeded}</dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-[var(--line)]">
        <button
          onClick={() => onStage?.(item.stageId)}
          className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] cursor-pointer"
          title="the stage in the AI pipelines above that this applies to"
        >
          {item.stageId}
        </button>
        <span className="text-[11px] font-mono text-[var(--ink-soft)]" title="the pack entry this cites">
          via {item.techniqueId}
        </span>
        {item.file && (
          <span className="text-[10.5px] font-mono text-[var(--ink-soft)] ml-auto">
            <code>
              {item.file}
              {item.line ? `:${item.line}` : ""}
            </code>
            {item.verification === "failed" && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)]">
                unverified
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BenchLens({ data, onStage }: { data: Bench; onStage?: (id: string) => void }) {
  const items = data.items ?? [];

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] p-5">
        <h3 className="text-[13.5px] font-bold mb-1">Nothing in the pack applies here</h3>
        <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed max-w-2xl">
          {data.note ??
            "No current entry in the practice pack matches what this service does. That is the common result and the correct one — the alternative is reaching for the nearest entry so the section looks full."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-[var(--ink)] leading-relaxed max-w-2xl">{data.summary}</p>
      <p className="text-[11px] text-[var(--ink-soft)]">
        Ordered best-first by gain per unit of adoption cost · computed against pack{" "}
        <code className="font-mono">{data.packVersion}</code>
      </p>
      {items.map((it, i) => (
        <Item key={it.id} item={it} i={i} onStage={onStage} />
      ))}
    </div>
  );
}
