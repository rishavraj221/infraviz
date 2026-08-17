import type { Progress } from "../types";

/**
 * Live view of work happening in the user's IDE.
 *
 * Nothing here can observe Cursor directly, so the agent reports each step via
 * `infraviz progress`, which appends to .infraviz/progress.json. The server
 * already watches that directory, so every append pushes to this panel.
 */
export default function ProgressPanel({ progress }: { progress: Progress }) {
  const steps = progress.steps ?? [];
  const latest = steps[steps.length - 1];
  const running = !progress.done && !progress.stale;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--line)]">
        {running && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />}
        <span className="text-[13px] font-bold">
          {progress.done
            ? "Your IDE finished"
            : progress.stale
              ? "No update for a while"
              : "Your IDE is working on it"}
        </span>
        <span className="ml-auto text-[10px] font-mono text-[var(--ink-soft)]">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      </div>

      {latest && !progress.done && (
        <div className="px-4 py-2.5 border-b border-[var(--line)]">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-0.5">Now</div>
          <div className="text-[13px] text-[var(--ink)]">{latest.text}</div>
        </div>
      )}

      <div className="px-4 py-3 max-h-[200px] overflow-y-auto flex flex-col-reverse">
        {[...steps].reverse().map((st, i) => (
          <div key={steps.length - i} className="flex gap-2.5 text-[11.5px] leading-relaxed">
            <span className="font-mono text-[var(--ink-soft)] opacity-60 shrink-0">{st.at.slice(11, 19)}</span>
            <span className="text-[var(--ink-soft)]">{st.text}</span>
          </div>
        ))}
      </div>

      {progress.stale && (
        <div className="px-4 py-2.5 bg-[var(--warn-soft)] text-[var(--warn)] text-[11.5px] leading-relaxed">
          Nothing reported for over five minutes. The agent may have stopped, or may simply not be reporting — check
          your IDE. Anything it already wrote is safe and shown here.
        </div>
      )}
    </div>
  );
}
