// GENERATED from @infraviz/schema profiles — do not edit by hand.
// Mirrored into the viewer so the closed check set cannot drift from the one
// the prompts and validator use.
export interface CheckInfo { id: string; profile: string; question: string; reference: string; referenceTitle: string; url: string; }
export const CHECKS: CheckInfo[] = [
  {
    "id": "llm-prompt-injection",
    "profile": "llm",
    "question": "Is retrieved or user content kept separable from instructions in the prompt?",
    "reference": "owasp-llm-top10",
    "referenceTitle": "OWASP Top 10 for LLM Applications",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/"
  },
  {
    "id": "llm-output-handling",
    "profile": "llm",
    "question": "Is model output treated as untrusted before it is rendered, executed or stored?",
    "reference": "owasp-llm-top10",
    "referenceTitle": "OWASP Top 10 for LLM Applications",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/"
  },
  {
    "id": "llm-unbounded-spend",
    "profile": "llm",
    "question": "Is there a ceiling on tokens or calls per request?",
    "reference": "owasp-llm-top10",
    "referenceTitle": "OWASP Top 10 for LLM Applications",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/"
  },
  {
    "id": "llm-excessive-agency",
    "profile": "llm",
    "question": "Are the tools an agent can call scoped to what the task needs?",
    "reference": "owasp-llm-top10",
    "referenceTitle": "OWASP Top 10 for LLM Applications",
    "url": "https://owasp.org/www-project-top-10-for-large-language-model-applications/"
  },
  {
    "id": "llm-sensitive-egress",
    "profile": "llm",
    "question": "Is it known what user data leaves for the provider, and under which terms?",
    "reference": "gdpr",
    "referenceTitle": "GDPR",
    "url": "https://gdpr-info.eu"
  },
  {
    "id": "llm-provider-failure",
    "profile": "llm",
    "question": "What happens when the provider is slow, rate-limits, or is down?",
    "reference": "release-it",
    "referenceTitle": "Release It! — stability patterns (circuit breaker, bulkhead, timeout)",
    "url": "https://pragprog.com/titles/mnee2/release-it-second-edition/"
  },
  {
    "id": "llm-quality-regression",
    "profile": "llm",
    "question": "Is there any evaluation that would catch output quality regressing?",
    "reference": "google-sre",
    "referenceTitle": "Google SRE Book",
    "url": "https://sre.google/books/"
  },
  {
    "id": "api-authz",
    "profile": "api",
    "question": "Does every endpoint enforce authorisation, not merely authentication?",
    "reference": "owasp-top10",
    "referenceTitle": "OWASP Top 10",
    "url": "https://owasp.org/www-project-top-ten/"
  },
  {
    "id": "api-injection",
    "profile": "api",
    "question": "Are all queries parameterised, including identifiers and table names?",
    "reference": "owasp-top10",
    "referenceTitle": "OWASP Top 10",
    "url": "https://owasp.org/www-project-top-ten/"
  },
  {
    "id": "api-rate-limit",
    "profile": "api",
    "question": "Is there a per-user or per-IP limit on expensive endpoints?",
    "reference": "owasp-asvs",
    "referenceTitle": "OWASP Application Security Verification Standard",
    "url": "https://owasp.org/www-project-application-security-verification-standard/"
  },
  {
    "id": "api-timeouts",
    "profile": "api",
    "question": "Does every outbound call have a timeout and a bounded retry?",
    "reference": "release-it",
    "referenceTitle": "Release It! — stability patterns (circuit breaker, bulkhead, timeout)",
    "url": "https://pragprog.com/titles/mnee2/release-it-second-edition/"
  },
  {
    "id": "api-pagination",
    "profile": "api",
    "question": "Are list endpoints bounded rather than returning everything?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "data-idempotent",
    "profile": "data",
    "question": "Is a re-run safe, or does it duplicate and corrupt?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "data-partial-failure",
    "profile": "data",
    "question": "What state is left behind when a job dies halfway?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "data-memory-bound",
    "profile": "data",
    "question": "Does it stream, or load the whole dataset into memory?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "data-schema-drift",
    "profile": "data",
    "question": "What happens when an upstream schema changes?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "rt-backpressure",
    "profile": "realtime",
    "question": "What happens when a consumer is slower than the producer?",
    "reference": "ddia",
    "referenceTitle": "Designing Data-Intensive Applications",
    "url": "https://dataintensive.net"
  },
  {
    "id": "rt-reconnect",
    "profile": "realtime",
    "question": "Can a client resume after a drop without losing or repeating work?",
    "reference": "release-it",
    "referenceTitle": "Release It! — stability patterns (circuit breaker, bulkhead, timeout)",
    "url": "https://pragprog.com/titles/mnee2/release-it-second-edition/"
  },
  {
    "id": "rt-connection-limits",
    "profile": "realtime",
    "question": "Is the number of concurrent connections bounded per instance?",
    "reference": "k8s-production-best-practices",
    "referenceTitle": "Kubernetes Configuration Best Practices",
    "url": "https://kubernetes.io/docs/concepts/configuration/overview/"
  },
  {
    "id": "state-shared",
    "profile": "stateful",
    "question": "Is per-user state shared across replicas rather than held in process?",
    "reference": "12factor",
    "referenceTitle": "The Twelve-Factor App",
    "url": "https://12factor.net"
  },
  {
    "id": "state-restart",
    "profile": "stateful",
    "question": "Does anything important live only in memory or on local disk?",
    "reference": "12factor",
    "referenceTitle": "The Twelve-Factor App",
    "url": "https://12factor.net"
  },
  {
    "id": "obs-alerting",
    "profile": "observability",
    "question": "Would an alert fire before a customer notices?",
    "reference": "google-sre",
    "referenceTitle": "Google SRE Book",
    "url": "https://sre.google/books/"
  },
  {
    "id": "obs-tracing",
    "profile": "observability",
    "question": "Can one request be followed across services?",
    "reference": "opentelemetry",
    "referenceTitle": "OpenTelemetry Specification",
    "url": "https://opentelemetry.io/docs/specs/otel/"
  },
  {
    "id": "obs-retention",
    "profile": "observability",
    "question": "Do logs outlive the window you investigate over?",
    "reference": "cncf-observability",
    "referenceTitle": "CNCF Observability Whitepaper",
    "url": "https://github.com/cncf/tag-observability/blob/main/whitepaper.md"
  }
];

export const PROFILE_LABELS: Record<string,string> = {
  "llm": "LLM / AI application",
  "api": "HTTP API",
  "data": "Data pipeline / batch",
  "realtime": "Realtime / streaming",
  "stateful": "Stateful / autoscaled",
  "observability": "Anything in production"
};
