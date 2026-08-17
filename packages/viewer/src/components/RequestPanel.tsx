import { useEffect, useState } from "react";
import type { ServiceDef } from "../types";
import { useRunner, type RunKind } from "../useRunner";

/**
 * The bridge between this page and your agent.
 *
 * A browser page can't spawn an agent, so instead of a button that silently does
 * nothing, each artifact gets a ready-made prompt you paste into your IDE. That
 * is what keeps analysis incremental: you generate one service at a time, on
 * demand, rather than paying for a whole-repo pass up front.
 */
const KINDS = [
  {
    kind: "sequence" as const,
    label: "Sequence diagram",
    blurb: "Call order lane by lane, including work that runs after the response.",
  },
  {
    kind: "topology" as const,
    label: "Flow & risk lenses",
    blurb: "Node graph plus security, compliance and reliability findings.",
  },
  {
    kind: "optimise" as const,
    label: "Optimisations",
    blurb: "Ranked improvements you can hand straight to your agent to implement.",
  },
];

function promptFor(kind: string, service: ServiceDef) {
  return `Generate the ${kind} artifact for the "${service.name}" service in this repo.

Router: ${service.router}

Run \`npx infraviz spec ${kind}\` and follow it exactly. Write the result to
.infraviz/services/${service.id}/${kind}.json, then run \`npx infraviz verify\`
and fix anything it reports.

Only this one service — do not analyse the rest of the repo.`;
}

export default function RequestPanel({
  service,
  has,
}: {
  service: ServiceDef;
  has: { topology: boolean; sequence: boolean; optimise: boolean };
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const providers = useRunner((s) => s.providers);
  const loadProviders = useRunner((s) => s.loadProviders);
  const run = useRunner((s) => s.run);
  const running = useRunner((s) => s.running);
  const log = useRunner((s) => s.log);
  const error = useRunner((s) => s.error);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const canRunHere = providers.some((p) => p.installed);
  const missing = KINDS.filter((k) => !has[k.kind]);

  async function copy(kind: string) {
    try {
      await navigator.clipboard.writeText(promptFor(kind, service));
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  if (!missing.length) return null;

  return (
    <div className="rounded-xl border border-dashed border-[var(--line)] p-5">
      <h2 className="text-[14px] font-bold mb-1">Not generated yet for {service.name}</h2>
      <p className="text-[12.5px] text-[var(--ink-soft)] mb-4 max-w-2xl leading-relaxed">
        Generate here, or copy a prompt for your IDE — both write the same files, so you can mix the two freely. Each
        covers this service only, so you spend tokens on what you're actually looking at.
      </p>
      {error && (
        <div className="rounded-lg bg-[var(--danger-soft)] text-[var(--danger)] p-3 text-[12px] mb-3">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {missing.map((k) => {
          const busy = Boolean(running[`${service.id}:${k.kind}`]);
          return (
            <div key={k.kind} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3.5 flex flex-col">
              <span className="font-semibold text-[13px] mb-1">{k.label}</span>
              <p className="text-[11.5px] text-[var(--ink-soft)] mb-3 flex-1 leading-relaxed">{k.blurb}</p>
              <div className="flex flex-col gap-1.5">
                {canRunHere && (
                  <button
                    disabled={busy}
                    onClick={() => run(k.kind as RunKind, service.id)}
                    className="text-[12px] font-semibold px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--surface)] disabled:opacity-40 cursor-pointer"
                  >
                    {busy ? "Generating…" : "Generate here"}
                  </button>
                )}
                <button
                  onClick={() => copy(k.kind)}
                  className={`text-[12px] font-semibold px-3 py-2 rounded-md cursor-pointer ${
                    canRunHere
                      ? "border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      : "bg-[var(--accent)] text-[var(--surface)]"
                  }`}
                >
                  {copied === k.kind ? "Copied ✓" : copied === "failed" ? "Copy failed" : "Copy prompt for IDE"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {log.length > 0 && (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 max-h-[160px] overflow-y-auto">
          {log.map((l, i) => (
            <div key={i} className="text-[11px] font-mono text-[var(--ink-soft)] leading-relaxed">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
