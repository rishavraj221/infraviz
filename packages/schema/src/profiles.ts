/**
 * What to check, by what kind of system this is.
 *
 * A RAG service and a CRUD endpoint fail in different ways, so a single generic
 * checklist is either too vague to act on or wrong half the time.
 *
 * Every check names a reference from the closed REFERENCES set. That constraint
 * is the point: "research what matters in production" is an invitation to
 * confident-sounding invention, and a fabricated best practice is harder to
 * catch than a fabricated code citation because nothing contradicts it. If a
 * check cannot be tied to an established source, it does not belong here.
 *
 * Coverage is DECLARED, never inferred. An artifact says which checks it
 * assessed via `addresses`; we do not keyword-match findings and guess. Marking
 * something "assessed" when nobody looked is the worst possible failure for a
 * checklist — it converts an unknown into a false all-clear.
 */

export interface Check {
  id: string;
  /** the question to answer, phrased so "no" is actionable */
  question: string;
  reference: string;
  /** why it bites in production, one clause */
  matters: string;
}

export interface Profile {
  id: string;
  label: string;
  /** how the scan should recognise this kind of system */
  detect: string;
  checks: Check[];
}

export const PROFILES: Profile[] = [
  {
    id: "llm",
    label: "LLM / AI application",
    detect: "calls a model provider, embeds text, retrieves from a vector store, or orchestrates agents",
    checks: [
      {
        id: "llm-prompt-injection",
        question: "Is retrieved or user content kept separable from instructions in the prompt?",
        reference: "owasp-llm-top10",
        matters: "text pulled from a document can issue instructions the model obeys",
      },
      {
        id: "llm-output-handling",
        question: "Is model output treated as untrusted before it is rendered, executed or stored?",
        reference: "owasp-llm-top10",
        matters: "markup or SQL emitted by a model reaches a browser or a database",
      },
      {
        id: "llm-unbounded-spend",
        question: "Is there a ceiling on tokens or calls per request?",
        reference: "owasp-llm-top10",
        matters: "one broad input fans out into a bill nobody approved",
      },
      {
        id: "llm-excessive-agency",
        question: "Are the tools an agent can call scoped to what the task needs?",
        reference: "owasp-llm-top10",
        matters: "a model with write access does something irreversible on a bad turn",
      },
      {
        id: "llm-sensitive-egress",
        question: "Is it known what user data leaves for the provider, and under which terms?",
        reference: "gdpr",
        matters: "personal data crosses a processor boundary without a basis",
      },
      {
        id: "llm-provider-failure",
        question: "What happens when the provider is slow, rate-limits, or is down?",
        reference: "release-it",
        matters: "a dependency with no timeout or fallback takes the product down with it",
      },
      {
        id: "llm-quality-regression",
        question: "Is there any evaluation that would catch output quality regressing?",
        reference: "google-sre",
        matters: "a prompt or model change degrades answers with nothing to detect it",
      },
    ],
  },
  {
    id: "api",
    label: "HTTP API",
    detect: "exposes HTTP endpoints for clients or other services",
    checks: [
      {
        id: "api-authz",
        question: "Does every endpoint enforce authorisation, not merely authentication?",
        reference: "owasp-top10",
        matters: "a valid token reaches another tenant's records",
      },
      {
        id: "api-injection",
        question: "Are all queries parameterised, including identifiers and table names?",
        reference: "owasp-top10",
        matters: "string-built SQL turns one input into full database access",
      },
      {
        id: "api-rate-limit",
        question: "Is there a per-user or per-IP limit on expensive endpoints?",
        reference: "owasp-asvs",
        matters: "one authenticated client can exhaust capacity or budget",
      },
      {
        id: "api-timeouts",
        question: "Does every outbound call have a timeout and a bounded retry?",
        reference: "release-it",
        matters: "one slow dependency consumes every worker and stalls the service",
      },
      {
        id: "api-pagination",
        question: "Are list endpoints bounded rather than returning everything?",
        reference: "ddia",
        matters: "a table that grew turns a fast endpoint into an outage",
      },
    ],
  },
  {
    id: "data",
    label: "Data pipeline / batch",
    detect: "runs scheduled jobs, ingests datasets, or transforms data in bulk",
    checks: [
      {
        id: "data-idempotent",
        question: "Is a re-run safe, or does it duplicate and corrupt?",
        reference: "ddia",
        matters: "the fix for a failed run is a re-run, and it has to be safe",
      },
      {
        id: "data-partial-failure",
        question: "What state is left behind when a job dies halfway?",
        reference: "ddia",
        matters: "half-applied work is worse than none, and harder to detect",
      },
      {
        id: "data-memory-bound",
        question: "Does it stream, or load the whole dataset into memory?",
        reference: "ddia",
        matters: "the job works until the data grows, then OOMs in production",
      },
      {
        id: "data-schema-drift",
        question: "What happens when an upstream schema changes?",
        reference: "ddia",
        matters: "silent column changes corrupt downstream data before anyone notices",
      },
    ],
  },
  {
    id: "realtime",
    label: "Realtime / streaming",
    detect: "holds long-lived connections — websockets, SSE, or streamed responses",
    checks: [
      {
        id: "rt-backpressure",
        question: "What happens when a consumer is slower than the producer?",
        reference: "ddia",
        matters: "unbounded buffering becomes memory exhaustion",
      },
      {
        id: "rt-reconnect",
        question: "Can a client resume after a drop without losing or repeating work?",
        reference: "release-it",
        matters: "deploys and network blips are routine, not exceptional",
      },
      {
        id: "rt-connection-limits",
        question: "Is the number of concurrent connections bounded per instance?",
        reference: "k8s-production-best-practices",
        matters: "connection count, not request rate, is what actually saturates the process",
      },
    ],
  },
  {
    id: "stateful",
    label: "Stateful / autoscaled",
    detect: "keeps state in process memory or on local disk while running more than one replica",
    checks: [
      {
        id: "state-shared",
        question: "Is per-user state shared across replicas rather than held in process?",
        reference: "12factor",
        matters: "scaling out silently breaks sessions that worked on one instance",
      },
      {
        id: "state-restart",
        question: "Does anything important live only in memory or on local disk?",
        reference: "12factor",
        matters: "a routine restart loses work nobody realised was ephemeral",
      },
    ],
  },
  {
    id: "observability",
    label: "Anything in production",
    detect: "always applies once something is deployed",
    checks: [
      {
        id: "obs-alerting",
        question: "Would an alert fire before a customer notices?",
        reference: "google-sre",
        matters: "the alternative is finding out by email",
      },
      {
        id: "obs-tracing",
        question: "Can one request be followed across services?",
        reference: "opentelemetry",
        matters: "without it, every incident starts with guesswork",
      },
      {
        id: "obs-retention",
        question: "Do logs outlive the window you investigate over?",
        reference: "cncf-observability",
        matters: "the evidence expires before the question is asked",
      },
    ],
  },
];

export const PROFILE_IDS = PROFILES.map((p) => p.id);
export const ALL_CHECKS = PROFILES.flatMap((p) => p.checks.map((c) => ({ ...c, profile: p.id })));
export const CHECK_IDS = ALL_CHECKS.map((c) => c.id);

export function checksFor(profileIds: string[]): (Check & { profile: string })[] {
  const wanted = new Set(profileIds);
  // "observability" applies to anything deployed, so it is never opted out of
  wanted.add("observability");
  return ALL_CHECKS.filter((c) => wanted.has(c.profile));
}
