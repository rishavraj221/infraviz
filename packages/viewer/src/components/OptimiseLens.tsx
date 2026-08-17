import type { Optimisations, Optimisation } from "../types";

// Effort is the denominator of "is this worth it", so it gets the strongest
// visual weight after the title.
const EFFORT: Record<string, { label: string; fg: string; bg: string }> = {
  low: { label: "low effort", fg: "var(--ok)", bg: "var(--ok-soft)" },
  medium: { label: "medium effort", fg: "var(--warn)", bg: "var(--warn-soft)" },
  high: { label: "high effort", fg: "var(--danger)", bg: "var(--danger-soft)" },
};

const DIM_LABEL: Record<string, string> = {
  latency: "latency",
  cost: "cost",
  reliability: "reliability",
  ux: "user experience",
  scale: "scale",
  security: "security",
};

export default function OptimiseLens({ data }: { data: Optimisations }) {
  const items = data.items ?? [];

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] p-5">
        <h3 className="text-[13.5px] font-bold mb-1">Nothing worth changing</h3>
        <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed max-w-2xl">
          {data.note ??
            "No optimisations were identified for this service. That is a real result — padding this list would train you to skim past the items that matter."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-[var(--ink-soft)]">
        Ordered best-first by gain per unit of effort. Stop reading whenever the effort stops being worth the gain.
      </p>

      {items.map((it: Optimisation, i: number) => {
        const ef = EFFORT[it.effort] ?? EFFORT.medium;
        return (
          <div key={it.id} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 mb-3">
              <span className="font-mono text-[11px] text-[var(--ink-soft)] tabular-nums">{i + 1}</span>
              <h3 className="font-bold text-[14px] flex-1 min-w-[240px]">{it.title}</h3>
              <span
                className="text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: ef.bg, color: ef.fg }}
              >
                {ef.label}
              </span>
              {it.confidence !== "high" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--mono-bg)] text-[var(--ink-soft)]">
                  {it.confidence} confidence
                </span>
              )}
            </div>

            {/* the before/after pair is the actual decision content */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              <div className="rounded-md bg-[var(--bg)] p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-1">
                  Costing you now
                </div>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{it.costsToday}</p>
              </div>
              <div className="rounded-md bg-[var(--bg)] p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ok)] mb-1">
                  After the change
                </div>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{it.gain}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[46px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] pt-[3px]">How</dt>
              <dd className="text-[var(--ink-soft)] leading-relaxed">{it.how}</dd>
              {it.risk && (
                <>
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] pt-[3px]">Risk</dt>
                  <dd className="text-[var(--ink-soft)] leading-relaxed">{it.risk}</dd>
                </>
              )}
            </dl>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-[var(--line)]">
              <div className="flex flex-wrap gap-1">
                {it.dimension.map((d) => (
                  <span
                    key={d}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]"
                  >
                    {DIM_LABEL[d] ?? d}
                  </span>
                ))}
              </div>
              {it.file && (
                <span className="text-[10.5px] font-mono text-[var(--ink-soft)] ml-auto">
                  <code>
                    {it.file}
                    {it.line ? `:${it.line}` : ""}
                  </code>
                  {it.verification === "failed" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)]">
                      unverified
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {data.note && (
        <p className="text-[11.5px] text-[var(--ink-soft)] leading-relaxed">{data.note}</p>
      )}
    </div>
  );
}
