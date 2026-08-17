import { useVizStore } from "../store/useVizStore";
import type { VizData, Severity, Tier } from "../types";

const DOT: Record<Severity, string> = { ok: "var(--ok)", warn: "var(--warn)", critical: "var(--danger)" };
const GROUPS: { tier: Tier; label: string }[] = [
  { tier: "A", label: "Full treatment" },
  { tier: "B", label: "Compact" },
  { tier: "C", label: "Noted" },
];

export default function Sidebar({ data }: { data: VizData }) {
  const activeService = useVizStore((s) => s.activeService);
  const setActiveService = useVizStore((s) => s.setActiveService);
  const services = data.project.services ?? [];

  return (
    <nav className="w-[224px] shrink-0 hidden lg:block">
      <div className="sticky top-8">
        <div className="mb-4">
          <div className="text-[13px] font-bold truncate">{data.project.name}</div>
          {data.project.stack?.framework && (
            <div className="font-mono text-[10px] text-[var(--ink-soft)] truncate">
              {data.project.stack.language} · {data.project.stack.framework}
            </div>
          )}
        </div>

        <button
          onClick={() => setActiveService("overall")}
          className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] font-semibold cursor-pointer ${
            activeService === "overall" || !services.some((s) => s.id === activeService)
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
          }`}
        >
          Overview
        </button>

        {GROUPS.map((g) => {
          const items = services.filter((s) => s.tier === g.tier);
          if (!items.length) return null;
          return (
            <div key={g.tier} className="mt-5">
              <div className="px-2.5 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] opacity-70">
                {g.label}
              </div>
              {items.map((s) => {
                const on = activeService === s.id;
                const a = data.services[s.id];
                const generated = Boolean(a?.topology || a?.sequence);
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveService(s.id)}
                    title={s.verdict}
                    className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-[12.5px] cursor-pointer ${
                      on
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT[s.severity] }} />
                    <span className="truncate flex-1">{s.name}</span>
                    {generated && <span className="text-[9px] font-mono opacity-60 shrink-0">◆</span>}
                  </button>
                );
              })}
            </div>
          );
        })}

        <p className="mt-6 px-2.5 text-[10px] font-mono text-[var(--ink-soft)] opacity-60 leading-relaxed">
          ◆ has generated diagrams. Depth is tiered on purpose — a thin router doesn't need five lenses.
        </p>
      </div>
    </nav>
  );
}
