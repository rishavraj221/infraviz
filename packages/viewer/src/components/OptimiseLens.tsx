import { useState } from "react";
import { DEMO } from "../demo";
import type { Optimisations, Optimisation, ServiceDef } from "../types";

/**
 * Turns a finding into an implementation brief. The point of this lens is not to
 * be read and admired — it is to be handed to an agent that does the work, so
 * every item carries the location, the mechanism, and the risk to watch for.
 */
function taskFor(o: Optimisation, service: ServiceDef) {
  return [
    `Implement this optimisation in the "${service.name}" service.`,
    ``,
    `## ${o.title}`,
    ``,
    `Why it matters: ${o.costsToday}`,
    `Expected gain:  ${o.gain}`,
    `How:            ${o.how}`,
    o.risk ? `Watch out for:  ${o.risk}` : null,
    o.file ? `Location:       ${o.file}${o.line ? `:${o.line}` : ""}` : null,
    o.reference && REFERENCES[o.reference]
      ? `Basis:          ${REFERENCES[o.reference].title} (${REFERENCES[o.reference].url})${o.referenceNote ? ` — ${o.referenceNote}` : ""}`
      : o.basis === "measured"
        ? `Basis:          measured from this system`
        : null,
    `Router:         ${service.router}`,
    ``,
    `Make only this change — do not refactor beyond it. Run the test suite if one`,
    `exists, then tell me exactly what you changed and anything you chose not to.`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function allTasks(items: Optimisation[], service: ServiceDef) {
  const body = items
    .map((o, i) =>
      [
        `### ${i + 1}. ${o.title}  [${o.effort} effort]`,
        `Why:  ${o.costsToday}`,
        `Gain: ${o.gain}`,
        `How:  ${o.how}`,
        o.risk ? `Risk: ${o.risk}` : null,
        o.file ? `File: ${o.file}${o.line ? `:${o.line}` : ""}` : null,
      ]
        .filter((l) => l !== null)
        .join("\n")
    )
    .join("\n\n");

  return [
    `Implement these ${items.length} optimisations in the "${service.name}" service`,
    `(${service.router}). They are ordered best-first by gain per unit of effort.`,
    ``,
    body,
    ``,
    `Work through them in order. After each one, stop and tell me what changed so I`,
    `can review before you continue. Run the test suite if one exists. Do not`,
    `refactor beyond what each item describes.`,
  ].join("\n");
}

// Effort is the denominator of "is this worth it", so it gets the strongest
// visual weight after the title.
const EFFORT: Record<string, { label: string; fg: string; bg: string }> = {
  low: { label: "low effort", fg: "var(--ok)", bg: "var(--ok-soft)" },
  medium: { label: "medium effort", fg: "var(--warn)", bg: "var(--warn-soft)" },
  high: { label: "high effort", fg: "var(--danger)", bg: "var(--danger-soft)" },
};

/** Mirrors REFERENCES in @infraviz/schema — a closed set, so nothing can be invented. */
const REFERENCES: Record<string, { title: string; url: string }> = {
  "12factor": { title: "The Twelve-Factor App", url: "https://12factor.net" },
  "aws-well-architected": { title: "AWS Well-Architected", url: "https://aws.amazon.com/architecture/well-architected/" },
  "google-sre": { title: "Google SRE Book", url: "https://sre.google/books/" },
  "owasp-top10": { title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/" },
  "owasp-llm-top10": { title: "OWASP Top 10 for LLMs", url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/" },
  "owasp-asvs": { title: "OWASP ASVS", url: "https://owasp.org/www-project-application-security-verification-standard/" },
  "cncf-observability": { title: "CNCF Observability Whitepaper", url: "https://github.com/cncf/tag-observability/blob/main/whitepaper.md" },
  opentelemetry: { title: "OpenTelemetry Spec", url: "https://opentelemetry.io/docs/specs/otel/" },
  "k8s-production-best-practices": { title: "Kubernetes Config Best Practices", url: "https://kubernetes.io/docs/concepts/configuration/overview/" },
  "release-it": { title: "Release It! — stability patterns", url: "https://pragprog.com/titles/mnee2/release-it-second-edition/" },
  ddia: { title: "Designing Data-Intensive Applications", url: "https://dataintensive.net" },
  "nist-800-53": { title: "NIST SP 800-53", url: "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final" },
  gdpr: { title: "GDPR", url: "https://gdpr-info.eu" },
  "postgres-perf": { title: "PostgreSQL Performance Tips", url: "https://www.postgresql.org/docs/current/performance-tips.html" },
};

const BASIS: Record<string, { label: string; fg: string; bg: string; hint: string }> = {
  measured: { label: "measured", fg: "var(--ok)", bg: "var(--ok-soft)", hint: "derived from your own code or deployment" },
  principle: { label: "principle", fg: "var(--accent)", bg: "var(--accent-soft)", hint: "grounded in a named reference" },
  practice: { label: "judgement", fg: "var(--ink-soft)", bg: "var(--mono-bg)", hint: "engineering judgement, no source claimed" },
};

const DIM_LABEL: Record<string, string> = {
  latency: "latency",
  cost: "cost",
  reliability: "reliability",
  ux: "user experience",
  scale: "scale",
  security: "security",
};

export default function OptimiseLens({ data, service }: { data: Optimisations; service: ServiceDef }) {
  const items = data.items ?? [];
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] p-5">
        <h3 className="text-[13.5px] font-bold mb-1">Nothing worth changing</h3>
        <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed max-w-2xl">
          {data.note ??
            "No optimisations were identified for this service. That is a real result — padding this list would train you to skim past the items that matter."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[12px] text-[var(--ink-soft)] flex-1 min-w-[260px]">
          Ordered best-first by gain per unit of effort. Stop reading whenever the effort stops being worth the gain.
        </p>
        {!DEMO && (
        <button
          onClick={() => copy("all", allTasks(items, service))}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--surface)] cursor-pointer whitespace-nowrap"
        >
          {copied === "all" ? "Copied ✓" : `Copy all ${items.length} as tasks`}
        </button>
        )}
      </div>

      {items.map((it: Optimisation, i: number) => {
        // Not just typed-optional defensiveness: this schema is enforced by zod on
        // write, but the server intentionally serves an artifact through even when
        // it fails validation (partial output beats nothing) — so a malformed item
        // reaching here is a real, expected case, not a hypothetical one. Every
        // field below degrades to blank text if missing; only the ones a bare
        // `.map`/`.join` would throw on need an explicit fallback.
        const dims = it.dimension ?? [];
        const ef = EFFORT[it.effort] ?? EFFORT.medium;
        return (
          <div key={it.id ?? i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 mb-3">
              <span className="font-mono text-[11px] text-[var(--ink-soft)] tabular-nums">{i + 1}</span>
              <h3 className="font-bold text-[14px] flex-1 min-w-[240px]">{it.title}</h3>
              <span
                className="text-[10px] font-mono font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: ef.bg, color: ef.fg }}
              >
                {ef.label}
              </span>
              {it.basis && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: BASIS[it.basis]?.bg, color: BASIS[it.basis]?.fg }}
                  title={BASIS[it.basis]?.hint}
                >
                  {BASIS[it.basis]?.label ?? it.basis}
                </span>
              )}
              {it.confidence !== "high" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--mono-bg)] text-[var(--ink-soft)]">
                  {it.confidence} confidence
                </span>
              )}
            </div>

            {/* the before/after pair is the actual decision content */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
              <div className="rounded-md bg-[var(--bg)] p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--warn)] mb-1">
                  Costing you now
                </div>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{it.costsToday}</p>
              </div>
              <div className="rounded-md bg-[var(--bg)] p-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ok)] mb-1">
                  After the change
                </div>
                <p className="text-[12.5px] text-[var(--ink)] leading-relaxed">{it.gain}</p>
              </div>
            </div>

            <dl className="grid grid-cols-[46px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] pt-[3px]">How</dt>
              <dd className="text-[var(--ink-soft)] leading-relaxed">{it.how}</dd>
              {it.risk && (
                <>
                  <dt className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] pt-[3px]">Risk</dt>
                  <dd className="text-[var(--ink-soft)] leading-relaxed">{it.risk}</dd>
                </>
              )}
            </dl>

            {it.reference && REFERENCES[it.reference] && (
              <p className="mt-2.5 text-[11.5px] text-[var(--ink-soft)] leading-relaxed">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-soft)] mr-2">Source</span>
                <a
                  href={REFERENCES[it.reference].url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  {REFERENCES[it.reference].title}
                </a>
                {it.referenceNote ? ` — ${it.referenceNote}` : ""}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2.5 border-t border-[var(--line)]">
              <div className="flex flex-wrap gap-1">
                {dims.map((d) => (
                  <span
                    key={d}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)]"
                  >
                    {DIM_LABEL[d] ?? d}
                  </span>
                ))}
              </div>
              {!DEMO && (
              <button
                onClick={() => copy(it.id, taskFor(it, service))}
                className="text-[11px] font-semibold px-2 py-1 rounded-md border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                title="Copy this as an implementation task for your coding agent"
              >
                {copied === it.id ? "Copied ✓" : "Copy as task"}
              </button>
              )}

              {it.file && (
                <span className="text-[10.5px] font-mono text-[var(--ink-soft)] ml-auto">
                  <code>
                    {it.file}
                    {it.line ? `:${it.line}` : ""}
                  </code>
                  {it.verification === "failed" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)]">
                      unverified
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {data.note && (
        <p className="text-[11.5px] text-[var(--ink-soft)] leading-relaxed">{data.note}</p>
      )}
    </div>
  );
}
