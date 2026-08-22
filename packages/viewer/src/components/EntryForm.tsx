import { useState } from "react";

/**
 * Authoring an entry.
 *
 * A form, not a file upload. A PDF is not something an agent can act on, so
 * attaching one would produce a pack that looks full and briefs nothing. The
 * fields below are exactly what the agent reads; capturing them is the work, and
 * it is work only a person who has implemented the technique can do.
 *
 * The prose fields are ordered the way the judgement actually gets made: what it
 * is, when it applies, when it does not, what it costs, what you learned. The
 * last one is the field that makes the pack worth more than the model's own
 * knowledge, so it is required rather than optional.
 */

const TOPICS = [
  "retrieval",
  "caching",
  "routing",
  "decomposition",
  "batching",
  "serving",
  "structured-output",
  "guardrails",
  "evaluation",
  "ingestion",
  "observability",
  "system-design",
];

const today = new Date().toISOString().slice(0, 10);

const BLANK = {
  id: "",
  kind: "technique",
  topic: "caching",
  title: "",
  status: "draft",
  supersedes: "",
  maturity: "field-proven",
  scope: "knob",
  evalSensitivity: "none",
  source: { title: "", url: "", kind: "paper" },
  firstSeen: today,
  reviewedAt: today,
  author: "",
  appliesWhen: "",
  doesNotApplyWhen: "",
  claim: "",
  adoptionCost: "",
  learned: "",
  detect: "",
};

const PROSE: [keyof typeof BLANK, string, string][] = [
  ["claim", "What improves", "…and roughly by how much. A range is fine; an invented precision is not."],
  [
    "appliesWhen",
    "Applies when",
    "The conditions that make this worth doing. The agent decides applicability from this field, so write it as something checkable against code.",
  ],
  ["doesNotApplyWhen", "Does not apply when", "When to leave it alone. Usually more useful than the field above."],
  [
    "adoptionCost",
    "What it costs to adopt",
    "Honestly, including the parts that are not code: re-indexing, dual-running, review time.",
  ],
  [
    "learned",
    "What you learned implementing it",
    "The precondition that turned out to matter, the failure mode you hit. This is the half a model cannot supply — it is why the pack exists.",
  ],
  ["detect", "Already done if", "How to tell whether a codebase already does this."],
];

const SELECTS: [keyof typeof BLANK, string, string[], string][] = [
  ["topic", "Topic", TOPICS, "At most one entry per topic can be current."],
  ["kind", "Kind", ["technique", "principle"], "A concrete change, or a durable design rule."],
  [
    "maturity",
    "Maturity",
    ["ga", "field-proven", "beta", "emerging"],
    "Emerging entries stay on this page and are never applied — that is what the setting means.",
  ],
  [
    "scope",
    "Scope",
    ["knob", "architecture"],
    "A knob is an afternoon. An architecture change rebuilds part of the system.",
  ],
  [
    "evalSensitivity",
    "Can it change model output?",
    ["none", "low", "high"],
    "none means a cost comparison is sufficient proof. high means nothing ships without an evaluation.",
  ],
  ["status", "Status", ["draft", "current", "superseded"], "Current is the answer the agent will apply."],
];

const input =
  "w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";
const labelCls = "text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-1 block";

export default function EntryForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [v, setV] = useState<Record<string, unknown>>({ ...BLANK });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));
  const setSource = (k: string, val: string) =>
    setV((s) => ({ ...s, source: { ...(s.source as object), [k]: val } }));

  async function save() {
    setSaving(true);
    setErrors([]);
    // an empty optional must not reach the schema as ""
    const body = { ...v };
    if (!body.supersedes) delete body.supersedes;
    const r = await fetch("/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (r.ok) return onSaved();
    const j = await r.json().catch(() => ({ errors: [`HTTP ${r.status}`] }));
    setErrors(j.errors ?? ["could not save"]);
  }

  return (
    <div className="rounded-lg border-2 border-[var(--accent)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      <h3 className="text-[14px] font-bold">New entry</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Title</label>
          <input
            className={input}
            value={v.title as string}
            onChange={(e) => set("title", e.target.value)}
            placeholder="What it is, in a phrase a reader can scan"
          />
        </div>
        <div>
          <label className={labelCls}>Id</label>
          <input
            className={input}
            value={v.id as string}
            onChange={(e) => set("id", e.target.value)}
            placeholder="kebab-case-id"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SELECTS.map(([k, label, options, hint]) => (
          <div key={k as string}>
            <label className={labelCls} title={hint}>
              {label}
            </label>
            <select className={input} value={v[k as string] as string} onChange={(e) => set(k as string, e.target.value)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <p className="text-[10.5px] text-[var(--ink-soft)] leading-snug mt-1">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Source title</label>
          <input className={input} value={(v.source as any).title} onChange={(e) => setSource("title", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Source URL</label>
          <input
            className={input}
            value={(v.source as any).url}
            onChange={(e) => setSource("url", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className={labelCls}>Source kind</label>
          <select className={input} value={(v.source as any).kind} onChange={(e) => setSource("kind", e.target.value)}>
            {["paper", "provider-docs", "book", "write-up", "standard"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {PROSE.map(([k, label, hint]) => (
        <div key={k as string}>
          <label className={labelCls}>{label}</label>
          <textarea
            className={`${input} min-h-[62px] resize-y`}
            value={v[k as string] as string}
            onChange={(e) => set(k as string, e.target.value)}
          />
          <p className="text-[10.5px] text-[var(--ink-soft)] leading-snug mt-1">{hint}</p>
        </div>
      ))}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Author</label>
          <input className={input} value={v.author as string} onChange={(e) => set("author", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>First seen</label>
          <input className={input} value={v.firstSeen as string} onChange={(e) => set("firstSeen", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Reviewed</label>
          <input className={input} value={v.reviewedAt as string} onChange={(e) => set("reviewedAt", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Supersedes</label>
          <input
            className={input}
            value={v.supersedes as string}
            onChange={(e) => set("supersedes", e.target.value)}
            placeholder="entry id, if any"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md bg-[var(--danger-soft)] p-3">
          <ul className="flex flex-col gap-1">
            {errors.map((e, i) => (
              <li key={i} className="text-[11.5px] font-mono text-[var(--danger)] leading-relaxed">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--surface)] cursor-pointer disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save entry"}
        </button>
        <button
          onClick={onCancel}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md border border-[var(--line)] text-[var(--ink-soft)] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
