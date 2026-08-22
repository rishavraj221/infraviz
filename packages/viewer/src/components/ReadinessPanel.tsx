import { useEffect, useState } from "react";
import type { Answerable, Level } from "../readiness";
import { DEMO } from "../demo";
import { useRunner, type RunKind } from "../useRunner";

const TONE: Record<Level, { fg: string; bg: string; label: string }> = {
  ready: { fg: "var(--ok)", bg: "var(--ok-soft)", label: "answered" },
  partial: { fg: "var(--warn)", bg: "var(--warn-soft)", label: "partial" },
  none: { fg: "var(--ink-soft)", bg: "var(--mono-bg)", label: "not yet" },
};

const PROMPT_FOR = (kind: string, ids: string[]) =>
  `Generate the ${kind} artifact for these services in this repo: ${ids.join(", ")}.

Run \`npx infraviz spec ${kind}\` and follow it exactly. Write each result to
.infraviz/services/<id>/${kind}.json, then run \`npx infraviz verify\` and fix
anything it reports. Only these services.`;

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
  const providers = useRunner((s) => s.providers);
  const loadProviders = useRunner((s) => s.loadProviders);
  const runBatch = useRunner((s) => s.runBatch);
  const running = useRunner((s) => s.running);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const canRunHere = providers.some((p) => p.installed);

  async function copyFor(it: Answerable) {
    await navigator.clipboard.writeText(PROMPT_FOR(it.kind, it.missing));
    setCopied(it.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <div className="px-5 pt-4 pb-3.5">
        <h2 className="text-[15px] font-bold tracking-tight">{verdict.title}</h2>
        <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed mt-1 max-w-3xl">{verdict.body}</p>
      </div>

      <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
        {items.map((it) => {
          const t = TONE[it.level];
          const key = `ready:${it.kind}`;
          const busy = Boolean(running[key]);
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

              <div className="w-full flex flex-wrap items-center gap-x-2.5 gap-y-1.5 -mt-0.5">
                {it.headline ? (
                  <span className="text-[12.5px] text-[var(--ink)]">
                    {it.headline}
                    {it.sub && <span className="text-[11.5px] text-[var(--ink-soft)]"> · {it.sub}</span>}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-[var(--ink-soft)]">
                    Nothing generated for this yet.
                  </span>
                )}

                {/* the gap and the way to close it, in the same place — otherwise
                    a new user is told what is missing with no idea how to get it */}
                {it.missing.length > 0 && !DEMO && (
                  <span className="flex items-center gap-1.5 ml-auto shrink-0">
                    {canRunHere && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          runBatch(
                            it.missing.map((id) => ({ kind: it.kind as RunKind, serviceId: id })),
                            key
                          )
                        }
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[var(--accent)] text-[var(--surface)] disabled:opacity-40 cursor-pointer"
                      >
                        {busy ? "Generating…" : `Generate ${it.needs} (${it.missing.length})`}
                      </button>
                    )}
                    <button
                      onClick={() => copyFor(it)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-md cursor-pointer ${
                        canRunHere
                          ? "border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          : "bg-[var(--accent)] text-[var(--surface)]"
                      }`}
                    >
                      {copied === it.id ? "Copied ✓" : canRunHere ? "Copy prompt" : `Copy prompt for ${it.needs}`}
                    </button>
                  </span>
                )}
              </div>

              {it.needsConnector && it.level === "none" && (
                <p className="w-full text-[10.5px] text-[var(--ink-soft)] leading-relaxed">
                  Needs a cloud account connected first — run <code>npx infraviz connect</code> to see what is already
                  authenticated. Read-only, and it never asks for credentials.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
