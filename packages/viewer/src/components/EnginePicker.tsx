import { useRunner } from "../useRunner";

/**
 * Which agent, which model, how much effort.
 *
 * Lives in one component because every run button in the app sends the same
 * three fields to /api/run, and a picker that only existed on the start screen
 * meant the choice was locked in at scan time — you could not scan with Opus and
 * then generate the cheap per-service passes with Sonnet, which is exactly the
 * split most people want.
 *
 * Only renders controls that have something to choose: a single installed
 * provider hides the provider select, and a provider with no effort levels
 * (Cursor) hides that one.
 */
export default function EnginePicker({ compact = false }: { compact?: boolean }) {
  const providers = useRunner((s) => s.providers);
  const provider = useRunner((s) => s.provider);
  const model = useRunner((s) => s.model);
  const effort = useRunner((s) => s.effort);
  const setEngine = useRunner((s) => s.setEngine);

  const installed = providers.filter((p) => p.installed);
  const active = providers.find((p) => p.id === provider);
  if (!installed.length || !active) return null;

  const sel =
    "text-[11.5px] font-mono px-2 py-1.5 rounded-md border border-[var(--line)] bg-[var(--bg)] cursor-pointer text-[var(--ink)]";
  const lbl = "text-[10px] uppercase tracking-wider text-[var(--ink-soft)] font-semibold";

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2 mb-2"}>
      {installed.length > 1 && (
        <Field label="Agent" compact={compact}>
          <select
            aria-label="Agent"
            value={provider ?? ""}
            onChange={(e) => {
              // Model and effort belong to a provider, so carrying the old ones
              // across would send e.g. a Claude model id to Codex.
              const p = providers.find((x) => x.id === e.target.value);
              setEngine({ provider: e.target.value, model: p?.defaultModel, effort: p?.defaultEffort ?? null });
            }}
            className={`${sel} ${compact ? "" : "w-full"}`}
          >
            {installed.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Model" compact={compact}>
        <select
          aria-label="Model"
          value={model ?? active.defaultModel}
          onChange={(e) => setEngine({ model: e.target.value })}
          className={`${sel} ${compact ? "" : "w-full"}`}
        >
          {active.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.hint ? ` — ${m.hint}` : ""}
            </option>
          ))}
        </select>
      </Field>

      {active.efforts.length > 0 && (
        <Field label="Effort" compact={compact}>
          <select
            aria-label="Effort"
            value={effort ?? active.defaultEffort ?? ""}
            onChange={(e) => setEngine({ effort: e.target.value })}
            className={`${sel} ${compact ? "" : "w-full"}`}
          >
            {active.efforts.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );

  function Field({
    label,
    compact,
    children,
  }: {
    label: string;
    compact: boolean;
    children: React.ReactNode;
  }) {
    return compact ? (
      <label className="flex items-center gap-1.5">
        <span className={lbl}>{label}</span>
        {children}
      </label>
    ) : (
      <label className="flex flex-col gap-1">
        <span className={lbl}>{label}</span>
        {children}
      </label>
    );
  }
}
