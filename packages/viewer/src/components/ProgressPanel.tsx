import { useEffect, useState } from "react";
import type { Progress } from "../types";

/**
 * Live view of work happening in the user's IDE.
 *
 * Nothing here can observe Cursor directly, so the agent reports each step via
 * `infraviz progress`, which appends to .infraviz/progress.json. The server
 * already watches that directory, so every append pushes straight to this panel.
 *
 * The bar is deliberately indeterminate: the number of steps is not known ahead
 * of time, and a fake percentage that stalls at 80% is worse than an honest
 * "still going". The elapsed clock is what actually tells you it is alive.
 */
export default function ProgressPanel({ progress }: { progress: Progress }) {
  const steps = progress.steps ?? [];
  const latest = steps[steps.length - 1];
  const running = !progress.done && !progress.stale;
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!progress.startedAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.now() - new Date(progress.startedAt!).getTime()) / 1000));
      setElapsed(secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`);
    };
    tick();
    if (!running) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [progress.startedAt, running]);

  const accent = progress.stale ? "var(--warn)" : progress.done ? "var(--ok)" : "var(--accent)";

  return (
    <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: accent }}>
      {/* indeterminate sweep — motion is the signal, not a number */}
      <div className="h-[3px] w-full overflow-hidden" style={{ background: "var(--mono-bg)" }}>
        {running ? (
          <div className="h-full w-1/3 iv-sweep" style={{ background: accent }} />
        ) : (
          <div className="h-full w-full" style={{ background: accent, opacity: progress.done ? 1 : 0.4 }} />
        )}
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3">
        {running && (
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-transparent iv-spin shrink-0"
            style={{ borderTopColor: accent, borderRightColor: accent }}
          />
        )}
        <span className="text-[13.5px] font-bold" style={{ color: accent }}>
          {progress.done ? "Finished" : progress.stale ? "No update for a while" : "Scanning your codebase"}
        </span>
        <span className="ml-auto flex items-center gap-2.5 text-[10.5px] font-mono text-[var(--ink-soft)]">
          {elapsed && <span>{elapsed}</span>}
          <span>
            {steps.length} step{steps.length === 1 ? "" : "s"}
          </span>
        </span>
      </div>

      {latest && !progress.done && (
        <div className="px-4 pb-3 -mt-1">
          <div className="text-[13px] text-[var(--ink)] leading-snug">{latest.text}</div>
        </div>
      )}

      {steps.length > 1 && (
        <div className="px-4 py-2.5 border-t border-[var(--line)] max-h-[170px] overflow-y-auto flex flex-col-reverse">
          {[...steps.slice(0, -1)].reverse().map((st, i) => (
            <div key={steps.length - i} className="flex gap-2.5 text-[11.5px] leading-relaxed">
              <span className="font-mono text-[var(--ink-soft)] opacity-50 shrink-0">{st.at.slice(11, 19)}</span>
              <span className="text-[var(--ink-soft)]">{st.text}</span>
            </div>
          ))}
        </div>
      )}

      {progress.stale && (
        <div className="px-4 py-2.5 bg-[var(--warn-soft)] text-[var(--warn)] text-[11.5px] leading-relaxed">
          Nothing reported for over five minutes. The agent may have stopped, or may simply have stopped reporting —
          check your IDE. Anything already written is safe and shown here.
        </div>
      )}
    </div>
  );
}
