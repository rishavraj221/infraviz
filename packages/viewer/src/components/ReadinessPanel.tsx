import type { Answerable, Level } from "../readiness";

const TONE: Record<Level, { fg: string; bg: string; label: string }> = {
  ready: { fg: "var(--ok)", bg: "var(--ok-soft)", label: "answered" },
  partial: { fg: "var(--warn)", bg: "var(--warn-soft)", label: "partial" },
  none: { fg: "var(--ink-soft)", bg: "var(--mono-bg)", label: "not yet" },
};

/** Three ticks rather than a percentage — a bar at 40% invites reading it as a
 *  score, when what matters is which services are in and which are out. */
function Coverage({ covered, total }: { covered: number; total: number }) {
  return (
    <span className="flex items-center gap-[3px] shrink-0" title={`${covered} of ${total} services`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="w-[7px] h-[7px] rounded-[1px]"
          style={{ background: i < covered ? "var(--accent)" : "var(--line)" }}
        />
      ))}
    </span>
  );
}

export default function ReadinessPanel({
  items,
  verdict,
}: {
  items: Answerable[];
  verdict: { title: string; body: string };
}) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <div className="px-5 pt-4 pb-3.5">
        <h2 className="text-[15px] font-bold tracking-tight">{verdict.title}</h2>
        <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed mt-1 max-w-3xl">{verdict.body}</p>
      </div>

      <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
        {items.map((it) => {
          const t = TONE[it.level];
          return (
            <div key={it.id} className="px-5 py-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[13px] font-semibold flex-1 min-w-[220px]">{it.question}</span>

              <Coverage covered={it.covered.length} total={it.covered.length + it.missing.length} />
              <span
                className="text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ background: t.bg, color: t.fg }}
              >
                {t.label}
              </span>

              <div className="w-full flex flex-wrap items-baseline gap-x-2 -mt-0.5">
                {it.headline ? (
                  <>
                    <span className="text-[12.5px] text-[var(--ink)]">{it.headline}</span>
                    {it.sub && <span className="text-[11.5px] text-[var(--ink-soft)]">· {it.sub}</span>}
                  </>
                ) : (
                  <span className="text-[11.5px] text-[var(--ink-soft)]">Needs {it.needs}.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
