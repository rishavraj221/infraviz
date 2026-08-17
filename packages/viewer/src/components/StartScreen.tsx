import { useEffect, useState } from "react";
import { useRunner } from "../useRunner";

const IDE_PROMPT = `Scan this repository with infraviz.

Run \`npx infraviz spec scan\` and follow it exactly. Write the result to
.infraviz/project.json, then run \`npx infraviz verify\`.

Stop after the scan — do not generate per-service diagrams yet.`;

/**
 * Entry point when nothing has been analysed. Both paths are offered as equals:
 * drive it from here if an agent CLI is installed, or drive it from your IDE.
 * They write the same files, so you can switch between them at any point.
 */
export default function StartScreen() {
  const providers = useRunner((s) => s.providers);
  const loadProviders = useRunner((s) => s.loadProviders);
  const run = useRunner((s) => s.run);
  const running = useRunner((s) => s.running);
  const log = useRunner((s) => s.log);
  const error = useRunner((s) => s.error);
  const provider = useRunner((s) => s.provider);
  const setEngine = useRunner((s) => s.setEngine);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const installed = providers.filter((p) => p.installed);
  const active = providers.find((p) => p.id === provider);
  const busy = Boolean(running.scan);

  async function copy() {
    await navigator.clipboard.writeText(IDE_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <p className="font-mono text-[12px] tracking-wider uppercase text-[var(--accent)] mb-2">infraviz</p>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Nothing analysed yet</h1>
        <p className="text-[var(--ink-soft)] mb-8 leading-relaxed">
          Start with a scan — it finds the services and infrastructure, and takes a couple of minutes. Per-service
          diagrams come later, one at a time, so you only pay for what you look at.
        </p>

        {error && (
          <div className="rounded-lg bg-[var(--danger-soft)] text-[var(--danger)] p-3.5 text-[12.5px] mb-4">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* path 1 — from here */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col">
            <h2 className="font-bold text-[14px] mb-1">Run it here</h2>
            <p className="text-[12px] text-[var(--ink-soft)] mb-3 flex-1 leading-relaxed">
              {installed.length
                ? "Uses an agent CLI already on your PATH. Progress streams below."
                : "No agent CLI found on PATH. Install Claude Code, Codex or Cursor CLI to use this path."}
            </p>

            {installed.length > 1 && (
              <select
                value={provider ?? ""}
                onChange={(e) => {
                  const p = providers.find((x) => x.id === e.target.value);
                  setEngine({ provider: e.target.value, model: p?.defaultModel, effort: p?.defaultEffort ?? null });
                }}
                className="w-full text-[12px] font-mono px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--bg)] mb-2 cursor-pointer"
              >
                {installed.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            <button
              disabled={!installed.length || busy}
              onClick={() => run("scan")}
              className="text-[13px] font-semibold px-3 py-2.5 rounded-md bg-[var(--accent)] text-[var(--surface)] disabled:opacity-40 cursor-pointer"
            >
              {busy ? "Scanning…" : "Scan codebase"}
            </button>
            {active && installed.length === 1 && (
              <p className="text-[10.5px] font-mono text-[var(--ink-soft)] mt-1.5 text-center">
                {active.label} · {active.defaultModel}
              </p>
            )}
          </div>

          {/* path 2 — from the IDE */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col">
            <h2 className="font-bold text-[14px] mb-1">Run it from your IDE</h2>
            <p className="text-[12px] text-[var(--ink-soft)] mb-3 flex-1 leading-relaxed">
              Paste this into Cursor, Claude Code or any coding agent. This page updates on its own when the files
              appear — no reload needed.
            </p>
            <button
              onClick={copy}
              className="text-[13px] font-semibold px-3 py-2.5 rounded-md border border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)] cursor-pointer"
            >
              {copied ? "Copied ✓" : "Copy scan prompt"}
            </button>
          </div>
        </div>

        {log.length > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 max-h-[180px] overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} className="text-[11px] font-mono text-[var(--ink-soft)] leading-relaxed">
                {l}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11.5px] text-[var(--ink-soft)] leading-relaxed">
          Either path writes to <code>.infraviz/</code>, so you can switch between them freely — run the scan here and
          the diagrams in your IDE, or the reverse. <code>npx infraviz status</code> shows what is done and what is
          missing, which is how an agent resumes from wherever you left off.
        </p>
      </div>
    </div>
  );
}
