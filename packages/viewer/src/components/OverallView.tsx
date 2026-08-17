import { useVizStore } from "../store/useVizStore";
import { VerificationBadge } from "./DiagramCard";
import type { VizData, Severity, Finding } from "../types";

const TONE: Record<Severity, { fg: string; bg: string }> = {
  ok: { fg: "var(--ok)", bg: "var(--ok-soft)" },
  warn: { fg: "var(--warn)", bg: "var(--warn-soft)" },
  critical: { fg: "var(--danger)", bg: "var(--danger-soft)" },
};

const rank = (s: Severity) => (s === "critical" ? 2 : s === "warn" ? 1 : 0);

export default function OverallView({ data }: { data: VizData }) {
  const setActiveService = useVizStore((s) => s.setActiveService);
  const { project } = data;
  const services = project.services ?? [];
  const platform = project.platformFindings ?? [];

  const criticals = services.filter((s) => s.severity === "critical").length;
  const generated = services.filter((s) => data.services[s.id]?.topology || data.services[s.id]?.sequence).length;

  // count every citation across the whole artifact set
  let verified = 0;
  let failed = 0;
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (o.verification === "verified") verified++;
      if (o.verification === "failed") failed++;
      Object.values(o).forEach(walk);
    }
  };
  walk(project);
  walk(data.services);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Services" value={String(services.length)} sub={`${generated} with diagrams`} />
        <Stat
          label="At critical"
          value={`${criticals} of ${services.length}`}
          sub={criticals ? "listed first below" : "nothing flagged critical"}
          tone={criticals ? "critical" : "ok"}
        />
        <Stat
          label="Citations checked"
          value={`${verified} verified`}
          sub={failed ? `${failed} did not match the code` : "every citation matched its file"}
          tone={failed ? "warn" : "ok"}
        />
      </div>

      {project.stack && (
        <p className="text-[12.5px] text-[var(--ink-soft)]">
          <b className="text-[var(--ink)]">{project.stack.language}</b>
          {project.stack.framework ? ` · ${project.stack.framework}` : ""}
          {project.stack.entrypoint ? (
            <>
              {" "}
              · entrypoint <code>{project.stack.entrypoint}</code>
            </>
          ) : null}
        </p>
      )}

      {project.infra?.summary && (
        <section>
          <h2 className="text-[13px] font-bold mb-1.5">Infrastructure</h2>
          <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed mb-2.5 max-w-3xl">
            {project.infra.summary}
          </p>
          {(project.infra.resources ?? []).length > 0 && (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
              {project.infra.resources!.map((r, i) => (
                <div key={i} className="p-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] w-[86px] shrink-0">
                    {r.kind}
                  </span>
                  <span className="font-semibold">{r.name}</span>
                  {r.detail && <span className="text-[var(--ink-soft)] flex-1 min-w-[200px]">{r.detail}</span>}
                  <VerificationBadge f={r} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {platform.length > 0 && (
        <section>
          <h2 className="text-[13px] font-bold mb-1">Platform-wide</h2>
          <p className="text-[12px] text-[var(--ink-soft)] mb-2.5 max-w-3xl">
            True of the whole system rather than any one service — which is usually why they stay unfixed.
          </p>
          <div className="flex flex-col gap-2">
            {platform.map((f) => (
              <PlatformFinding key={f.id} f={f} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-[13px] font-bold mb-2.5">Services</h2>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)]">
                  <th className="py-2 px-3 font-normal">Service</th>
                  <th className="py-2 px-3 font-normal">Tier</th>
                  <th className="py-2 px-3 font-normal">LOC</th>
                  <th className="py-2 px-3 font-normal">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {[...services]
                  .sort((a, b) => rank(b.severity) - rank(a.severity))
                  .map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setActiveService(s.id)}
                      className="border-t border-[var(--line)] hover:bg-[var(--bg)] cursor-pointer align-top"
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: TONE[s.severity].fg }}
                          />
                          <span className="font-semibold">{s.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--ink-soft)]">{s.tier}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--ink-soft)]">{s.loc ?? "—"}</td>
                      <td className="py-2.5 px-3 text-[var(--ink-soft)] leading-relaxed">{s.verdict}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[10.5px] text-[var(--ink-soft)] mt-2 leading-relaxed">
          Row click opens the service.
          {project.generatedAt && ` Generated ${new Date(project.generatedAt).toLocaleString()}`}
          {project.generatedBy && ` by ${project.generatedBy}`}. Re-check every citation with{" "}
          <code>npx infraviz verify</code>.
        </p>
      </section>
    </div>
  );
}

function PlatformFinding({ f }: { f: Finding }) {
  const tone = TONE[f.severity];
  return (
    <div
      className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5"
      style={{ borderLeft: `3px solid ${tone.fg}` }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold text-[13.5px]">{f.title}</span>
        <span className="ml-auto flex items-center gap-2">
          <VerificationBadge f={f} />
          {(f.code || f.file) && (
            <span className="text-[10.5px] font-mono text-[var(--ink-soft)]">
              <code>
                {f.code ?? f.file}
                {f.line ? `:${f.line}` : ""}
              </code>
            </span>
          )}
        </span>
      </div>
      <p className="text-[12.5px] text-[var(--ink)] mt-1.5 leading-relaxed">{f.breaks}</p>
      <p className="text-[12.5px] text-[var(--ink-soft)] mt-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] mr-2">Fix</span>
        {f.fix}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: Severity }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="text-[10px] uppercase tracking-wide text-[var(--ink-soft)] font-mono">{label}</div>
      <div
        className="font-mono font-bold text-[22px] leading-tight mt-0.5"
        style={{ color: tone ? TONE[tone].fg : "var(--accent)" }}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--ink-soft)] mt-1 leading-snug">{sub}</div>
    </div>
  );
}
