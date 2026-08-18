import { useEffect, useState } from "react";
import type { ServiceDef } from "../types";
import { useRunner, type RunKind } from "../useRunner";
import { promptForService, type Kind } from "../prompts";

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
  {
    kind: "deployment" as const,
    label: "Deployment & cost",
    blurb: "What is actually running and what it costs. Needs a connected cloud account.",
  },
];

export default function RequestPanel({
  service,
  has,
}: {
  service: ServiceDef;
  has: { topology: boolean; sequence: boolean; optimise: boolean; deployment: boolean };
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
  const runBatch = useRunner((s) => s.runBatch);
  const missing = KINDS.filter((k) => !has[k.kind]);

  async function copy(kind: string, text?: string) {
    try {
      await navigator.clipboard.writeText(text ?? promptForService(service, [kind as Kind]));
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
      {missing.length > 1 && (
        <div className="flex flex-wrap items-center gap-2.5 mb-3 pb-3 border-b border-[var(--line)]">
          {canRunHere && (
            <button
              disabled={Boolean(running[`all:${service.id}`])}
              onClick={() => runBatch(missing.map((k) => ({ kind: k.kind, serviceId: service.id })), `all:${service.id}`)}
              className="text-[12.5px] font-semibold px-3.5 py-2 rounded-md bg-[var(--accent)] text-[var(--surface)] disabled:opacity-40 cursor-pointer"
            >
              {running[`all:${service.id}`] ? "Generating…" : `Generate all ${missing.length}`}
            </button>
          )}
          {/* the aggregate copy must exist whether or not a CLI is installed —
              without it an IDE user pastes once per artifact */}
          <button
            onClick={() => copy("__all", promptForService(service, missing.map((m) => m.kind as Kind)))}
            className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-md cursor-pointer ${
              canRunHere
                ? "border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                : "bg-[var(--accent)] text-[var(--surface)]"
            }`}
          >
            {copied === "__all" ? "Copied ✓" : `Copy one prompt for all ${missing.length}`}
          </button>
          <span className="text-[11px] text-[var(--ink-soft)]">
            {canRunHere ? "Runs one after another · " : "One paste covers this whole service · "}
            {missing.length} model calls, a few minutes each
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-[var(--danger-soft)] text-[var(--danger)] p-3 text-[12px] mb-3">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
