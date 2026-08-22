import { useEffect, useState } from "react";
import { DEMO, STUDIO } from "../demo";
import EntryForm from "./EntryForm";
import type { Pack, PracticeEntry } from "../types";

/**
 * The practice pack, read.
 *
 * Organised as a decision table rather than a feed, because that is what it is:
 * the question a reader arrives with is "what is our answer for caching", not
 * "what has been published recently". So topics are the spine, the current entry
 * for each is the headline, and everything superseded is folded away behind it —
 * present, because reports that cited it must stay explicable, but never
 * competing with the answer.
 *
 * Recency is a badge, never a ranking. Sorting by date would quietly turn "newest"
 * into "best", which is the exact inversion this pack exists to prevent.
 */

const MATURITY: Record<string, { label: string; hint: string; fg: string; bg: string }> = {
  ga: {
    label: "GA",
    hint: "provider-documented and generally available",
    fg: "var(--ok)",
    bg: "var(--ok-soft)",
  },
  "field-proven": {
    label: "field-proven",
    hint: "multiple public production write-ups",
    fg: "var(--ok)",
    bg: "var(--ok-soft)",
  },
  beta: {
    label: "beta",
    hint: "provider preview — may change or be withdrawn",
    fg: "var(--warn)",
    bg: "var(--warn-soft)",
  },
  emerging: {
    label: "emerging",
    hint: "a paper or preprint, little production use — never auto-applied",
    fg: "var(--ink-soft)",
    bg: "var(--mono-bg)",
  },
};

const SENSITIVITY: Record<string, string> = {
  none: "cannot change model output — cost and latency evidence is enough",
  low: "output can shift slightly — spot-check before shipping",
  high: "output will change — nothing ships without an evaluation",
};

function Badge({ children, fg, bg, title }: { children: React.ReactNode; fg: string; bg: string; title?: string }) {
  return (
    <span
      className="text-[9.5px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: bg, color: fg }}
      title={title}
    >
      {children}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] pt-[3px]">{label}</dt>
      <dd className="text-[12.5px] text-[var(--ink)] leading-relaxed">{value}</dd>
    </>
  );
}

function Entry({ entry, onDelete }: { entry: PracticeEntry; onDelete?: (id: string) => void }) {
  const [open, setOpen] = useState(entry.status === "current");
  const m = MATURITY[entry.maturity] ?? MATURITY.emerging;

  return (
    <div
      className="rounded-lg border bg-[var(--surface)] p-4"
      style={{
        borderColor: entry.status === "current" ? "var(--accent)" : "var(--line)",
        borderWidth: entry.status === "current" ? 2 : 1,
        opacity: entry.status === "superseded" ? 0.72 : 1,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
        {entry.status === "current" ? (
          <Badge fg="var(--accent)" bg="var(--accent-soft)" title="the answer for this topic today">
            current
          </Badge>
        ) : (
          <Badge
            fg="var(--ink-soft)"
            bg="var(--mono-bg)"
            title={
              entry.status === "superseded"
                ? "replaced, and kept so older reports stay explicable"
                : "not yet in force"
            }
          >
            {entry.status}
          </Badge>
        )}
        <h3 className="text-[14px] font-bold flex-1 min-w-[220px]">{entry.title}</h3>
        <Badge fg={m.fg} bg={m.bg} title={m.hint}>
          {m.label}
        </Badge>
        <Badge
          fg={entry.scope === "architecture" ? "var(--warn)" : "var(--ink-soft)"}
          bg={entry.scope === "architecture" ? "var(--warn-soft)" : "var(--mono-bg)"}
          title={
            entry.scope === "architecture"
              ? "changes the shape of the system — weeks, and the trial itself has real setup cost"
              : "local and reversible — trial it cheaply"
          }
        >
          {entry.scope}
        </Badge>
        {entry.layer === "local" && (
          <Badge fg="var(--accent)" bg="var(--accent-soft)" title="from this repository's own overlay, not upstream">
            yours
          </Badge>
        )}
        {entry.stale && (
          <Badge fg="var(--danger)" bg="var(--danger-soft)" title={`not reviewed since ${entry.reviewedAt}`}>
            unreviewed
          </Badge>
        )}
      </div>

      <p className="text-[12.5px] text-[var(--ink)] leading-relaxed mt-2">{entry.claim}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[11.5px] font-semibold text-[var(--accent)] cursor-pointer"
        >
          {open ? "less" : "when it applies, what it costs, what we learned"}
        </button>
        <a
          href={entry.source.url}
          target="_blank"
          rel="noreferrer"
          className="text-[11.5px] text-[var(--ink-soft)] hover:text-[var(--accent)] hover:underline"
        >
          {entry.source.title} ↗
        </a>
        <span className="text-[10.5px] font-mono text-[var(--ink-soft)] ml-auto">
          {entry.id} · reviewed {entry.reviewedAt} · {entry.author}
        </span>
      </div>

      {open && (
        <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-[var(--line)]">
          <Field label="Applies when" value={entry.appliesWhen} />
          <Field label="Does not" value={entry.doesNotApplyWhen} />
          <Field label="Costs to adopt" value={entry.adoptionCost} />
          <Field label="We learned" value={entry.learned} />
          <Field label="Already done if" value={entry.detect} />
          <Field label="Output risk" value={SENSITIVITY[entry.evalSensitivity] ?? entry.evalSensitivity} />
          {entry.supersedes && <Field label="Replaces" value={entry.supersedes} />}
          {entry.note && <Field label="Note" value={entry.note} />}
        </dl>
      )}

      {onDelete && !DEMO && (
        <div className="mt-3 pt-2.5 border-t border-[var(--line)]">
          <button
            onClick={() => onDelete(entry.id)}
            className="text-[11px] text-[var(--ink-soft)] hover:text-[var(--danger)] cursor-pointer"
          >
            remove from the pack
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResearchPage() {
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = () =>
    fetch(DEMO ? "./practice.json" : "/api/practice")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setPack)
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    await fetch(`/api/practice?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  if (error) return <p className="text-[13px] text-[var(--danger)]">{error}</p>;
  if (!pack) return <p className="text-[13px] font-mono text-[var(--ink-soft)]">loading…</p>;

  const topics = [...new Set(pack.entries.map((e) => e.topic))];
  // Three things must all hold: this is the studio, the server agrees it can
  // write, and we are not the read-only demo bundle. The server is the one that
  // actually enforces it — the other two only avoid offering a doomed button.
  const canAuthor = STUDIO && Boolean(pack.canAuthor) && !DEMO;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-[12px] tracking-wider uppercase text-[var(--accent)] mb-2">
          pack {pack.manifest.version}
          {pack.manifest.builtAt ? ` · built ${pack.manifest.builtAt}` : ""}
        </p>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Practice</h1>
        <p className="text-[var(--ink-soft)] max-w-2xl text-[13px] leading-relaxed">
          What this team has researched, implemented, and settled on. One current answer per topic — the agent
          applies that one and cites nothing else. Entries are written by a person, never harvested, and they
          expire: an entry nobody has re-confirmed in six months is shown as unreviewed rather than left looking
          current.
        </p>
      </div>

      {pack.problems.length > 0 && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <h3 className="text-[13px] font-bold text-[var(--danger)] mb-1.5">
            The pack has {pack.problems.length} problem{pack.problems.length === 1 ? "" : "s"}
          </h3>
          <ul className="flex flex-col gap-1">
            {pack.problems.map((p, i) => (
              <li key={i} className="text-[12px] font-mono text-[var(--ink)] leading-relaxed">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Authoring is the maintainers' path, not a reader's. The server refuses
          the write regardless, so this is a matter of not offering something that
          would only fail. */}
      {canAuthor && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            onClick={() => setAdding((a) => !a)}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--surface)] cursor-pointer"
          >
            {adding ? "Cancel" : "Add an entry"}
          </button>
          <span className="text-[11.5px] text-[var(--ink-soft)]">
            writes to <code className="font-mono text-[10.5px]">{pack.target.dir}</code>
          </span>
        </div>
      )}

      {adding && canAuthor && (
        <EntryForm
          onSaved={() => {
            setAdding(false);
            load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {!canAuthor && (
        <p className="text-[11.5px] text-[var(--ink-soft)] leading-relaxed">
          This pack ships with infraviz and is maintained by its authors. It is read-only here — which is the point:
          an entry is a judgement somebody made after implementing the technique, so it carries weight only because
          not everyone can add one.
        </p>
      )}

      {!pack.entries.length && (
        <div className="rounded-lg border border-dashed border-[var(--line)] p-5">
          <h3 className="text-[13.5px] font-bold mb-1">Nothing in the pack yet</h3>
          <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed max-w-2xl">
            Until something is here, the agent has no house answer for any topic — and it is told to say so rather
            than invent one. That is the correct empty state, not a broken one. Add the first entry once you have
            actually implemented the technique and know what it cost you.
          </p>
        </div>
      )}

      {topics.map((t) => (
        <div key={t}>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] opacity-70 mb-2">
            {t}
          </div>
          <div className="flex flex-col gap-2.5">
            {pack.entries
              .filter((e) => e.topic === t)
              .sort((a, b) => (a.status === "current" ? -1 : b.status === "current" ? 1 : 0))
              .map((e) => (
                <Entry key={e.id} entry={e} onDelete={canAuthor ? remove : undefined} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
