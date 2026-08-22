import { useEffect, useState } from "react";
import ResearchPage from "./ResearchPage";
import ErrorBoundary from "./ErrorBoundary";

/**
 * The maintainers' workbench: the pack, plus what git makes of it.
 *
 * The commit panel exists because writing an entry and shipping one are
 * different acts, and the gap between them is where review happens. Entries land
 * on disk immediately — that is how you iterate — and go onto the `practice`
 * branch only when someone decides they are ready.
 *
 * Nothing here pushes. The last step out to a PR stays a deliberate command a
 * person types, because that is the point at which the pack becomes something
 * clients receive.
 */

interface GitFile {
  path: string;
  change: "added" | "modified" | "removed" | string;
}
interface GitState {
  isRepo: boolean;
  reason?: string;
  currentBranch?: string | null;
  practiceExists?: boolean;
  practiceTip?: string | null;
  base?: { ref: string; sha: string } | null;
  branch?: string;
  files: GitFile[];
}

const CHANGE: Record<string, { label: string; fg: string }> = {
  added: { label: "new", fg: "var(--ok)" },
  modified: { label: "changed", fg: "var(--warn)" },
  removed: { label: "removed", fg: "var(--danger)" },
};

export default function PackStudio() {
  const [git, setGit] = useState<GitState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<{ sha: string; branch: string; push: string; pr: string | null } | null>(null);

  const load = () =>
    fetch("/api/pack/git")
      .then((r) => r.json())
      .then(setGit)
      .catch(() => setGit(null));

  useEffect(() => {
    load();
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        if (JSON.parse(e.data).type === "practice-changed") load();
      } catch {
        /* a malformed frame is not worth failing the panel over */
      }
    };
    return () => es.close();
  }, []);

  async function commit() {
    setBusy(true);
    setErrors([]);
    const r = await fetch("/api/pack/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const j = await r.json().catch(() => ({ errors: [`HTTP ${r.status}`] }));
    setBusy(false);
    if (!r.ok) return setErrors(j.errors ?? ["commit failed"]);
    setDone(j);
    setMessage("");
    load();
  }

  const files = git?.files ?? [];

  return (
    <div className="min-h-screen">
      <div className="max-w-[880px] mx-auto px-6 py-12 flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[11px] uppercase tracking-wider px-2 py-1 rounded bg-[var(--warn-soft)] text-[var(--warn)]">
            studio
          </span>
          <span className="text-[12px] text-[var(--ink-soft)]">
            maintainers only · clients run <code className="font-mono">infraviz view</code>, which has no authoring
            routes
          </span>
        </div>

        <ErrorBoundary label="The practice pack">
          <ResearchPage />
        </ErrorBoundary>

        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
            <h2 className="text-[14px] font-bold">Ship these</h2>
            {git?.isRepo && (
              <span className="text-[11px] text-[var(--ink-soft)] ml-auto font-mono">
                → {git.branch}
                {git.practiceExists ? ` @ ${git.practiceTip}` : " (new)"} · on top of {git.base?.ref} {git.base?.sha}
              </span>
            )}
          </div>

          {git && !git.isRepo && (
            <p className="text-[12.5px] text-[var(--warn)] leading-relaxed">{git.reason}</p>
          )}

          {git?.isRepo && (
            <p className="text-[11.5px] text-[var(--ink-soft)] leading-relaxed mb-3">
              You are on <strong className="font-semibold">{git.currentBranch}</strong>. Committing here builds the
              commit out of band — it moves <code className="font-mono">{git.branch}</code> without checking anything
              out, so your working tree and everything else you have in progress stay exactly as they are.
            </p>
          )}

          {git?.isRepo && !files.length && (
            <p className="text-[12.5px] text-[var(--ink-soft)]">
              Nothing in the pack differs from <code className="font-mono">{git.branch}</code>.
            </p>
          )}

          {files.length > 0 && (
            <>
              <div className="flex flex-col gap-1 mb-3">
                {files.map((f) => (
                  <div key={f.path} className="flex items-baseline gap-2">
                    <span
                      className="text-[9.5px] font-mono font-bold uppercase tracking-wider w-[62px] shrink-0"
                      style={{ color: CHANGE[f.change]?.fg ?? "var(--ink-soft)" }}
                    >
                      {CHANGE[f.change]?.label ?? f.change}
                    </span>
                    <code className="text-[11.5px] font-mono text-[var(--ink)] truncate">{f.path}</code>
                  </div>
                ))}
              </div>

              <input
                className="w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)] mb-2"
                placeholder="Commit message — what changed in the pack, and why"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />

              <button
                onClick={commit}
                disabled={busy || !message.trim() || !git?.isRepo}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--surface)] cursor-pointer disabled:opacity-50"
              >
                {busy ? "Committing…" : `Commit ${files.length} file${files.length === 1 ? "" : "s"} to ${git?.branch}`}
              </button>
            </>
          )}

          {errors.length > 0 && (
            <div className="rounded-md bg-[var(--danger-soft)] p-3 mt-3">
              {errors.map((e, i) => (
                <p key={i} className="text-[11.5px] font-mono text-[var(--danger)] leading-relaxed">
                  {e}
                </p>
              ))}
            </div>
          )}

          {done && (
            <div className="rounded-md bg-[var(--ok-soft)] p-3 mt-3">
              <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">
                Committed <code className="font-mono">{done.sha}</code> to{" "}
                <code className="font-mono">{done.branch}</code>. Push and open the PR yourself — that is the step
                where this becomes something clients receive:
              </p>
              <pre className="mt-2 text-[11.5px] font-mono bg-[var(--bg)] rounded px-2.5 py-1.5 overflow-x-auto">
                {done.push}
              </pre>
              {done.pr && (
                <a
                  href={done.pr}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] text-[var(--accent)] hover:underline"
                >
                  open the compare view on GitHub ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
