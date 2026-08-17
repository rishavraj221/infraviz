import { useState } from "react";

/**
 * Nothing touches the codebase until this is acknowledged, and the server
 * enforces it too — /api/run returns 403 without a recorded acceptance, so this
 * is a gate rather than a notice.
 *
 * The wording deliberately separates what infraviz does from what the user's
 * agent does. Saying "no data leaves your machine" would be false: infraviz
 * sends nothing, but the agent generating the diagrams sends code to its own
 * provider. A disclaimer that overstates privacy is worse than none.
 */
export default function ConsentGate({
  repo,
  reason,
  onAccept,
}: {
  repo?: string;
  reason?: string;
  onAccept: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      onAccept();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <p className="font-mono text-[12px] tracking-wider uppercase text-[var(--accent)] mb-2">infraviz</p>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Before analysing this repository</h1>
        {repo && (
          <p className="font-mono text-[11.5px] text-[var(--ink-soft)] mb-5 truncate" title={repo}>
            {repo}
          </p>
        )}

        {reason && (
          <div className="rounded-lg bg-[var(--warn-soft)] text-[var(--warn)] p-3.5 text-[12.5px] mb-4 leading-relaxed">
            <b>An earlier acceptance was not counted.</b> {reason} Acceptance has to come from you, not from an agent
            acting on your behalf, so please confirm below.
          </div>
        )}

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 flex flex-col gap-4 text-[13px] leading-relaxed">
          <Point title="infraviz receives nothing">
            There is no service behind this page. infraviz is software running on your machine — no servers, no
            accounts, no telemetry — and it makes no network requests at all. It writes only to{" "}
            <code>.infraviz/</code> inside this repository. Not a line of your code, not a file name, reaches us,
            because there is no us to reach.
          </Point>

          <Point title="Your coding agent is what reads your code">
            The analysis is produced by the agent you already use — Cursor, Claude Code, Codex. It reads your files and
            sends them to <em>its own</em> provider, exactly as it does for every other request you make of it.
            infraviz never sees that traffic and adds no new recipient to it.
            <br />
            <br />
            It does mean the agent reads more than a normal question would: your routers, the modules they import, your
            infrastructure config and your tests. If your organisation restricts which repositories may be sent to an
            AI provider, that restriction applies here unchanged.
          </Point>

          <Point title="The output is confidential">
            Results include short, verbatim snippets of your code and a ranked list of weak points found in it. Treat{" "}
            <code>.infraviz/</code> as at least as sensitive as the source itself. It is added to{" "}
            <code>.gitignore</code> by default.
          </Point>

          <Point title="The agent may run your tests">
            It checks its conclusions against your test suite where one exists. If your tests reach real services, tell
            it not to run them.
          </Point>
        </div>

        {error && <p className="text-[12.5px] text-[var(--danger)] mt-3">{error}</p>}

        <div className="flex flex-wrap gap-2 mt-5">
          <button
            onClick={accept}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg text-[13px] font-semibold bg-[var(--accent)] text-[var(--surface)] disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Saving…" : "I understand — analyse this repository"}
          </button>
          <a
            href="https://github.com/rishavraj221/infraviz#security"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2.5 rounded-lg text-[13px] font-semibold border border-[var(--line)] text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
          >
            Read the details
          </a>
        </div>

        <p className="text-[11px] text-[var(--ink-soft)] mt-4 leading-relaxed">
          Recorded per repository in <code>.infraviz/consent.json</code>, so connecting a different repository asks
          again. Nothing reads or writes your code until you accept.
        </p>
      </div>
    </div>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-bold text-[13.5px] mb-0.5">{title}</h2>
      <p className="text-[var(--ink-soft)]">{children}</p>
    </div>
  );
}
