import { useState } from "react";
import type { VizData } from "../types";
import { CHECKS, PROFILE_LABELS } from "../checks";

type State = "finding" | "clean" | "unknown";

/**
 * Production checks for this kind of system.
 *
 * The important state is "unknown", and it is deliberately not styled as a pass.
 * A check nobody examined is an open question, and letting it read as green is
 * how a checklist becomes actively misleading — it converts absence of evidence
 * into evidence of absence.
 *
 * Coverage comes from what artifacts declare in `assessed` / `addresses`. We do
 * not keyword-match findings and guess, because a wrong "assessed" is worse than
 * no answer at all.
 */
export default function ChecklistPanel({ data }: { data: VizData }) {
  const [open, setOpen] = useState(false);
  const profiles = data.project.profiles ?? [];
  const checks = CHECKS.filter((c) => c.profile === "observability" || profiles.includes(c.profile));
  if (!checks.length) return null;

  const assessed = new Set<string>();
  const flagged = new Map<string, string>();
  for (const a of Object.values(data.services)) {
    for (const id of a.topology?.assessed ?? []) assessed.add(id);
    const findings = a.topology?.risk
      ? [...a.topology.risk.security, ...a.topology.risk.compliance, ...a.topology.risk.reliability]
      : [];
    for (const f of findings)
      for (const id of f.addresses ?? []) {
        assessed.add(id);
        flagged.set(id, f.title);
      }
    for (const o of a.optimise?.items ?? [])
      for (const id of o.addresses ?? []) {
        assessed.add(id);
        flagged.set(id, o.title);
      }
  }
  for (const f of data.project.platformFindings ?? []) {
    for (const id of f.addresses ?? []) {
      assessed.add(id);
      flagged.set(id, f.title);
    }
  }

  const stateOf = (id: string): State => (flagged.has(id) ? "finding" : assessed.has(id) ? "clean" : "unknown");
  const counts = checks.reduce(
    (a, c) => ({ ...a, [stateOf(c.id)]: (a[stateOf(c.id)] ?? 0) + 1 }),
    {} as Record<State, number>
  );
  const unknown = counts.unknown ?? 0;
  const shown = open ? checks : checks.filter((c) => stateOf(c.id) !== "clean");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[15px] font-bold tracking-tight">Production checks</h2>
        <span className="text-[11.5px] text-[var(--ink-soft)]">
          {profiles.length ? profiles.map((p) => PROFILE_LABELS[p] ?? p).join(" · ") : "general"} ·{" "}
          {counts.finding ?? 0} flagged, {counts.clean ?? 0} clean, {unknown} not yet examined
        </span>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] divide-y divide-[var(--line)]">
        {shown.map((c) => {
          const st = stateOf(c.id);
          const tone =
            st === "finding"
              ? { fg: "var(--danger)", bg: "var(--danger-soft)", label: "flagged" }
              : st === "clean"
                ? { fg: "var(--ok)", bg: "var(--ok-soft)", label: "checked" }
                : { fg: "var(--ink-soft)", bg: "var(--mono-bg)", label: "unknown" };
          return (
            <div key={c.id} className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-[12.5px] flex-1 min-w-[260px]">{c.question}</span>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-mono text-[var(--ink-soft)] hover:text-[var(--accent)] shrink-0"
                title={c.referenceTitle}
              >
                {c.reference}
              </a>
              <span
                className="text-[9.5px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ background: tone.bg, color: tone.fg }}
              >
                {tone.label}
              </span>
              {flagged.has(c.id) && (
                <span className="w-full text-[11.5px] text-[var(--ink-soft)] -mt-0.5">{flagged.get(c.id)}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3">
        {(counts.clean ?? 0) > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[11.5px] font-mono text-[var(--accent)] hover:underline cursor-pointer"
          >
            {open ? "hide checks that came back clean" : `show ${counts.clean} clean check${counts.clean === 1 ? "" : "s"}`}
          </button>
        )}
        {unknown > 0 && (
          <span className="text-[10.5px] text-[var(--ink-soft)] leading-relaxed">
            "Unknown" means nobody has looked yet — not that it passed. Generating more services closes these.
          </span>
        )}
      </div>
    </section>
  );
}
