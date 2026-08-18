import type { Deployment, Observation, ServiceDef } from "../types";
import OptimiseLens from "./OptimiseLens";

/**
 * What is actually running, and what it actually costs.
 *
 * Every other lens reads source; this one reads infrastructure, which changes
 * the trust model. A cloud fact cannot be re-checked against a file — so the
 * command and the timestamp are its provenance, and age is shown prominently.
 * A cost figure from three weeks ago is a materially different claim from one
 * taken this morning, and the UI should not let those look alike.
 */
function ageOf(at?: string): { label: string; stale: boolean } | null {
  if (!at) return null;
  const days = (Date.now() - new Date(at).getTime()) / 86_400_000;
  if (Number.isNaN(days)) return null;
  if (days < 1) return { label: "today", stale: false };
  if (days < 2) return { label: "yesterday", stale: false };
  const d = Math.round(days);
  return { label: `${d} days ago`, stale: d > 7 };
}

function Provenance({ o }: { o: Observation }) {
  const age = ageOf(o.observedAt);
  if (!o.command && !age) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-[10px] font-mono text-[var(--ink-soft)]">
      {age && (
        <span
          className="px-1.5 py-0.5 rounded"
          style={
            age.stale
              ? { background: "var(--warn-soft)", color: "var(--warn)" }
              : { background: "var(--mono-bg)" }
          }
          title={o.observedAt}
        >
          {age.label}
        </span>
      )}
      {o.command && (
        <code className="opacity-70 truncate max-w-full" title={o.command}>
          {o.command}
        </code>
      )}
    </div>
  );
}

export default function DeploymentLens({ data, service }: { data: Deployment; service: ServiceDef }) {
  const cost = data.cost ?? [];
  const workloads = data.workloads ?? [];
  const obs = data.observability;
  const recs = data.recommendations ?? [];
  const currency = cost[0]?.currency ?? "USD";
  const actualTotal = cost.filter((c) => c.basis === "actual").reduce((a, c) => a + c.amount, 0);
  const anyActual = cost.some((c) => c.basis === "actual");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13.5px] font-bold">{data.platform}</span>
        {data.environment && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]">
            {data.environment}
          </span>
        )}
      </div>
      <p className="text-[13px] text-[var(--ink)] leading-relaxed max-w-3xl -mt-2">{data.summary}</p>

      {cost.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-[12.5px] font-bold">Cost</h3>
            {anyActual && (
              <span className="text-[11px] text-[var(--ink-soft)]">
                {currency} {actualTotal.toFixed(2)} billed across the periods below
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cost.map((c, i) => (
              <div key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] text-[var(--ink-soft)] flex-1">{c.label}</span>
                  {/* an estimate must never be mistaken for a bill */}
                  <span
                    className="text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={
                      c.basis === "actual"
                        ? { background: "var(--ok-soft)", color: "var(--ok)" }
                        : { background: "var(--warn-soft)", color: "var(--warn)" }
                    }
                  >
                    {c.basis}
                  </span>
                </div>
                <div className="font-mono font-bold text-[19px] text-[var(--ink)] mt-0.5">
                  {c.currency ?? "USD"} {c.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10.5px] font-mono text-[var(--ink-soft)]">{c.period}</div>
                <Provenance o={c} />
              </div>
            ))}
          </div>
        </section>
      )}

      {workloads.length > 0 && (
        <section>
          <h3 className="text-[12.5px] font-bold mb-2">Running workloads</h3>
          <div className="flex flex-col gap-2">
            {workloads.map((w, i) => (
              <div key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="font-semibold text-[13px]">{w.name}</span>
                  {w.kind && <span className="text-[11px] text-[var(--ink-soft)]">{w.kind}</span>}
                  {w.replicas !== undefined && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--mono-bg)] text-[var(--ink-soft)]">
                      ×{w.replicas}
                    </span>
                  )}
                </div>
                {/* provisioned against used is the line that turns into money */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[12px]">
                  <Row label="Provisioned" value={[w.cpu, w.memory].filter(Boolean).join(" / ") || "—"} />
                  <Row label="Observed" value={w.utilisation} highlight={Boolean(w.utilisation)} />
                  <Row label="Scaling" value={w.scaling} />
                </div>
                <Provenance o={w} />
              </div>
            ))}
          </div>
        </section>
      )}

      {obs && (
        <section>
          <h3 className="text-[12.5px] font-bold mb-2">Observability</h3>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5 flex flex-col gap-1.5 text-[12.5px]">
            <Row label="Metrics" value={obs.metrics} />
            <Row label="Logs" value={obs.logs} />
            <Row label="Alerts" value={obs.alerts} />
            <Row label="Tracing" value={obs.tracing} />
            {obs.gaps && obs.gaps.length > 0 && (
              <div className="mt-2 pt-2.5 border-t border-[var(--line)]">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-1">
                  Would hurt at 3am
                </div>
                <ul className="flex flex-col gap-1">
                  {obs.gaps.map((g, i) => (
                    <li key={i} className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed">
                      · {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {recs.length > 0 && (
        <section>
          <h3 className="text-[12.5px] font-bold mb-2">What the deployment should change</h3>
          <OptimiseLens data={{ schemaVersion: 1, items: recs }} service={service} />
        </section>
      )}

      {data.notes && (
        <div className="rounded-lg bg-[var(--warn-soft)] p-3.5 text-[12px] text-[var(--warn)] leading-relaxed">
          <b>What this did not see.</b> {data.notes}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] w-[76px] shrink-0 pt-[3px]">
        {label}
      </span>
      <span className={highlight ? "text-[var(--accent)] font-semibold" : "text-[var(--ink-soft)]"}>{value}</span>
    </div>
  );
}
