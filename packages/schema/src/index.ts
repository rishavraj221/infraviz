// The contract. Every agent that produces infraviz data conforms to this, and
// every consumer (viewer, CLI, MCP) reads it.
//
// Validation errors are written to be ACTIONABLE BY AN AGENT, because the agent
// is the one that has to fix them. "lanes[3].id 'redis' is not declared in
// lanes" is useful; "invalid_union" is not.

import { z } from "zod";
import { PROFILE_IDS, CHECK_IDS } from "./profiles.js";
import { PracticeEntry } from "./practice.js";

export * from "./profiles.js";
export * from "./practice.js";

/**
 * Optional text field that tolerates an explicit `null`.
 *
 * Models routinely emit `"framework": null` to mean "not applicable" rather than
 * omitting the key. Rejecting that fails otherwise-correct output on a
 * technicality, so normalise null to undefined instead.
 */
const optText = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined);

// ---------------------------------------------------------------- primitives

export const Severity = z.enum(["ok", "warn", "critical"]);
export const Tier = z.enum(["A", "B", "C"]);
export const NodeKind = z.enum([
  "client",
  "lb",
  "task",
  "openai",
  "db",
  "vector",
  "cache",
  "external",
  "storage",
]);

/** A claim about the codebase, checkable against a real file. */
export const Evidence = z.object({
  file: z.string().min(1).describe("repo-relative path you actually opened"),
  fingerprint: z
    .string()
    .min(4)
    .max(200)
    .describe("EXACT substring copied from that file — this gets re-checked against disk"),
  line: z.number().int().positive().optional().describe("filled in by the verifier; do not guess"),
  verification: z.enum(["verified", "failed", "unverifiable"]).optional(),
  verificationNote: z.string().optional(),
});

export const Finding = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(120),
    severity: z.enum(["warn", "critical"]),
    code: optText.describe("human-readable location, e.g. 'utils.py → save()'"),
    breaks: z.string().min(1).describe("what actually goes wrong — one sentence"),
    fix: z.string().min(1).describe("what to do about it — one sentence"),
    edges: z.array(z.string()).default([]).describe("topology edge ids this implicates"),
    addresses: z
      .array(z.enum(CHECK_IDS as [string, ...string[]]))
      .default([])
      .describe("production check ids this finding assesses — declared, never guessed"),
  })
  .merge(Evidence.partial());

// ---------------------------------------------------------------- project

export const ServiceDef = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]+$/, "id must be snake_case: lowercase letters, digits and underscores only"),
  name: z.string().min(1),
  router: z.string().min(1).describe("repo-relative path to the router/controller"),
  loc: z.number().int().nonnegative().optional(),
  tier: Tier,
  severity: Severity,
  // one sentence, but a dense one — real verdicts run long and the content is
  // worth more than an arbitrary cap
  verdict: z.string().min(1).max(500).describe("one sentence a senior engineer would care about"),
  tierNote: optText,
  deps: z
    .object({
      llm: z.number().int().nonnegative().optional(),
      vector: z.number().int().nonnegative().optional(),
      db: z.boolean().optional(),
      efs: z.boolean().optional(),
      redis: z.boolean().optional(),
      external: z.array(z.string()).optional(),
    })
    .default({}),
});

export const InfraResource = z
  .object({
    kind: z.string().min(1),
    name: z.string().min(1),
    detail: optText,
  })
  .merge(Evidence.partial());

export const Project = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  stack: z
    .object({ language: optText, framework: optText, entrypoint: optText })
    .optional(),
  infra: z
    .object({
      summary: optText,
      resources: z.array(InfraResource).default([]),
    })
    .optional(),
  profiles: z
    .array(z.enum(PROFILE_IDS as [string, ...string[]]))
    .default([])
    .describe("what kind of system this is — drives which production checks apply"),
  services: z.array(ServiceDef).default([]),
  platformFindings: z.array(Finding).default([]),
  generatedAt: optText,
  generatedBy: optText.describe("e.g. 'cursor/claude-opus-5' — for provenance"),
});

// ---------------------------------------------------------------- topology

export const TopoNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: optText,
  kind: NodeKind,
  x: z.number(),
  y: z.number(),
});

export const TopoEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
});

export const TopoStep = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  code: z.string().optional(),
  desc: z.string().min(1),
  edges: z.array(z.string()).default([]),
});

export const Topology = z
  .object({
    schemaVersion: z.literal(1),
    taskNodeId: z.string().min(1).describe("the node that autoscales"),
    summary: z.string().min(1),
    lenses: z
      .array(
        z.enum(["flow", "load", "ratelimit", "cost", "security", "compliance", "reliability", "optimise"])
      )
      .min(1),
    loadNote: optText.describe("REQUIRED unless real measurements exist — say it is not measured"),
    nodes: z.array(TopoNode).min(2),
    edges: z.array(TopoEdge).min(1),
    steps: z.array(TopoStep).default([]),
    reliabilityModel: z
      .object({
        groups: z.array(z.object({ label: z.string(), n: z.number().int().positive() })).default([]),
        fanOut: z
          .object({
            label: z.string(),
            unitLabel: z.string(),
            defaultUnits: z.number().int().positive(),
            maxUnits: z.number().int().positive(),
          })
          .optional()
          .describe("only when the call count genuinely varies per request"),
      })
      .default({ groups: [] }),
    kpis: z
      .array(z.object({ label: z.string(), value: z.string(), tone: Severity.optional() }))
      .default([]),
    risk: z
      .object({
        security: z.array(Finding).default([]),
        compliance: z.array(Finding).default([]),
        reliability: z.array(Finding).default([]),
      })
      .default({ security: [], compliance: [], reliability: [] }),
    assessed: z
      .array(z.enum(CHECK_IDS as [string, ...string[]]))
      .default([])
      .describe("checks you actually examined for this service, including ones that came back clean"),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((t, ctx) => {
    const nodeIds = new Set(t.nodes.map((n) => n.id));
    if (!nodeIds.has(t.taskNodeId)) {
      ctx.addIssue({
        code: "custom",
        path: ["taskNodeId"],
        message: `taskNodeId "${t.taskNodeId}" is not one of the declared nodes (${[...nodeIds].join(", ")})`,
      });
    }
    t.edges.forEach((e, i) => {
      for (const end of ["source", "target"] as const) {
        if (!nodeIds.has(e[end])) {
          ctx.addIssue({
            code: "custom",
            path: ["edges", i, end],
            message: `edges[${i}].${end} "${e[end]}" is not a declared node id. Declared: ${[...nodeIds].join(", ")}`,
          });
        }
      }
    });
    const edgeIds = new Set(t.edges.map((e) => e.id));
    t.steps.forEach((s, i) => {
      s.edges.forEach((eid) => {
        if (!edgeIds.has(eid)) {
          ctx.addIssue({
            code: "custom",
            path: ["steps", i, "edges"],
            message: `steps[${i}] references edge "${eid}" which is not declared in edges`,
          });
        }
      });
    });
  });

// ---------------------------------------------------------------- optimise

/**
 * One concrete improvement. The two fields that carry the value are `costsToday`
 * (what NOT doing it costs) and `gain` (what doing it buys) — a recommendation
 * without both is an opinion, not a decision aid.
 */
/**
 * Where a recommendation comes from.
 *
 * Asking a model to cite its reasoning invites invented citations — "per Fowler
 * (2019)" for a paper that does not exist — which is the exact failure this
 * project exists to prevent. So the basis is a closed set, and the strongest
 * value is the one grounded in the user's own system rather than in literature:
 *
 *   measured  — derived from THIS codebase or deployment. Strongest.
 *   principle — a named, well-known reference from REFERENCES below. Checkable.
 *   practice  — ordinary engineering judgement, no source claimed. Honest.
 *
 * "practice" is a first-class answer. Dressing judgement up as a citation is
 * worse than admitting it is judgement.
 */
export const Basis = z.enum(["measured", "principle", "practice"]);

/**
 * A closed set of genuinely well-known references. Closed on purpose: an agent
 * picking from a list cannot invent a title, and a reader can check any of them.
 * Anything not here should be "practice" rather than a plausible-looking URL.
 */
export const REFERENCES = {
  "12factor": { title: "The Twelve-Factor App", url: "https://12factor.net" },
  "aws-well-architected": {
    title: "AWS Well-Architected Framework",
    url: "https://aws.amazon.com/architecture/well-architected/",
  },
  "google-sre": { title: "Google SRE Book", url: "https://sre.google/books/" },
  "owasp-top10": { title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/" },
  "owasp-llm-top10": {
    title: "OWASP Top 10 for LLM Applications",
    url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
  },
  "owasp-asvs": { title: "OWASP Application Security Verification Standard", url: "https://owasp.org/www-project-application-security-verification-standard/" },
  "cncf-observability": { title: "CNCF Observability Whitepaper", url: "https://github.com/cncf/tag-observability/blob/main/whitepaper.md" },
  "opentelemetry": { title: "OpenTelemetry Specification", url: "https://opentelemetry.io/docs/specs/otel/" },
  "k8s-production-best-practices": {
    title: "Kubernetes Configuration Best Practices",
    url: "https://kubernetes.io/docs/concepts/configuration/overview/",
  },
  "release-it": { title: "Release It! — stability patterns (circuit breaker, bulkhead, timeout)", url: "https://pragprog.com/titles/mnee2/release-it-second-edition/" },
  "ddia": { title: "Designing Data-Intensive Applications", url: "https://dataintensive.net" },
  "nist-800-53": { title: "NIST SP 800-53 Security Controls", url: "https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final" },
  "gdpr": { title: "GDPR", url: "https://gdpr-info.eu" },
  "postgres-perf": { title: "PostgreSQL Performance Documentation", url: "https://www.postgresql.org/docs/current/performance-tips.html" },
} as const;

export const ReferenceId = z.enum(Object.keys(REFERENCES) as [string, ...string[]]);

export const Optimisation = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(120).describe("imperative and short: 'Parallelise the three retrieval round trips'"),
    dimension: z
      .array(z.enum(["latency", "cost", "reliability", "ux", "scale", "security"]))
      .min(1)
      .describe("what this improves"),
    effort: z.enum(["low", "medium", "high"]).describe("engineering effort, honestly assessed"),
    confidence: z.enum(["high", "medium", "low"]).describe("how sure you are the gain is real"),
    costsToday: z
      .string()
      .min(1)
      .describe("what NOT doing this costs right now — quantified where the code allows it"),
    gain: z.string().min(1).describe("what improves, and by roughly how much"),
    how: z.string().min(1).describe("the actual change, 1-2 sentences. Mechanism, not platitude."),
    risk: optText.describe("what could go wrong or regress — omit if genuinely none"),
    basis: Basis.default("practice").describe("where this comes from — see Basis"),
    reference: ReferenceId.optional().describe(
      "REQUIRED when basis is 'principle'. Must be an id from REFERENCES — never a URL you composed."
    ),
    referenceNote: optText.describe("which part of that reference applies, in one clause"),
    addresses: z
      .array(z.enum(CHECK_IDS as [string, ...string[]]))
      .default([])
      .describe("production check ids this addresses — declared, never guessed"),
  })
  .merge(Evidence.partial())
  .superRefine((o, ctx) => {
    if (o.basis === "principle" && !o.reference) {
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: `basis "principle" requires a reference id from: ${Object.keys(REFERENCES).join(", ")}`,
      });
    }
  });

export const Optimisations = z.object({
  schemaVersion: z.literal(1),
  /** ordered best-first: highest gain per unit of effort */
  items: z.array(Optimisation).default([]),
  /** state plainly when the service is already appropriate for its job */
  note: optText.describe("use this to say 'nothing worth changing' rather than inventing filler"),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------- ai

/**
 * The AI section: the pipelines a model-using system actually runs.
 *
 * Deliberately thin. A chatbot over RAG, an agentic system with tools and a
 * nightly classification job share almost no structure, so anything rich enough
 * to model one of them properly distorts the other two and turns every new
 * architecture into a schema change. The shape here is only what the viewer must
 * draw and the verifier must check; everything that varies between systems lives
 * in prose the agent writes after reading the code.
 *
 * Two fields carry the value, and both are annotations rather than structure:
 *
 *   repeats      — a stage run once per sub-question in a system that decomposes
 *                  into five is where cost actually accumulates, and it is
 *                  invisible in a topology diagram.
 *   opportunity  — something worth changing, said at the stage it applies to
 *                  rather than in a list somewhere else on the page.
 */
export const AiStageKind = z.enum([
  "guard",
  "classify",
  "decompose",
  "embed",
  "retrieve",
  "rerank",
  "generate",
  "tool",
  "chunk",
  "index",
  "store",
  "other",
]);

export const AiStage = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    kind: AiStageKind,
    model: optText.describe("the actual model id where one is called — never a guess"),
    detail: z.string().min(1).describe("what happens here and why it matters, in plain language"),
    calls: optText.describe(
      "how often this runs per unit of work, in words: 'once', 'once per sub-question — 3 to 8'"
    ),
    repeats: z
      .boolean()
      .default(false)
      .describe("true when this runs more than once per unit of work — the viewer marks it"),
    opportunity: optText.describe(
      "something worth changing HERE, specific to this stage. Omit rather than pad."
    ),
    stepId: optText.describe("matching sequence/topology step id, so the views cross-highlight"),
    reads: z
      .array(z.string())
      .default([])
      .describe(
        "pipeline ids whose output THIS stage consumes — the retrieval stage reading the index that ingestion built. Names the seam between two pipelines instead of leaving the diagram to guess it."
      ),
  })
  .merge(Evidence.partial());

export const AiPipeline = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  when: z
    .enum(["request", "offline", "scheduled", "event"])
    .describe("request = someone is waiting on it; offline = nobody is"),
  summary: z.string().min(1).describe("one sentence. Lead with the surprising part."),
  unitOfWork: optText.describe("what one run of this pipeline processes: 'one user question', 'one document'"),
  dependsOn: z
    .array(z.string())
    .default([])
    .describe("pipeline ids this one consumes the output of — e.g. a query pipeline reading an index"),
  stages: z.array(AiStage).min(1),
});

export const Ai = z
  .object({
    schemaVersion: z.literal(1),
    summary: z.string().min(1).describe("1-2 sentences on how this system uses models. Lead with the surprising part."),
    pipelines: z.array(AiPipeline).min(1),
    volumeNote: z
      .string()
      .min(1)
      .describe(
        "REQUIRED. How much traffic these pipelines take. Say plainly that it is not measured rather than implying a number exists."
      ),
    evals: z
      .object({
        present: z.boolean(),
        note: z.string().min(1).describe("what exists, or plainly that nothing exercises model output"),
      })
      .merge(Evidence.partial())
      .optional(),
    note: optText.describe("use this to say the model usage is already appropriate, rather than inventing concerns"),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((a, ctx) => {
    const pipelineIds = new Set(a.pipelines.map((p) => p.id));
    const seenStage = new Set<string>();
    a.pipelines.forEach((p, i) => {
      p.dependsOn.forEach((d) => {
        if (!pipelineIds.has(d)) {
          ctx.addIssue({
            code: "custom",
            path: ["pipelines", i, "dependsOn"],
            message: `pipelines[${i}] depends on "${d}" which is not a declared pipeline. Declared: ${[...pipelineIds].join(", ")}`,
          });
        }
      });
      p.stages.forEach((st, j) => {
        st.reads.forEach((r) => {
          if (!pipelineIds.has(r)) {
            ctx.addIssue({
              code: "custom",
              path: ["pipelines", i, "stages", j, "reads"],
              message: `stage "${st.id}" reads "${r}" which is not a declared pipeline. Declared: ${[...pipelineIds].join(", ")}`,
            });
          }
        });
        if (seenStage.has(st.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["pipelines", i, "stages", j, "id"],
            message: `stage id "${st.id}" is used twice — ids must be unique across all pipelines`,
          });
        }
        seenStage.add(st.id);
      });
    });
  });

// ---------------------------------------------------------------- deployment

/**
 * Cloud facts cannot be fingerprint-verified the way code can: there is no file
 * to re-read, and the answer changes underneath you. So provenance here is the
 * command that produced it plus when — and everything carries an age, because a
 * cost figure from three weeks ago is a different kind of claim from one taken
 * this morning.
 */
export const Observation = z.object({
  connector: z.enum(["aws", "openshift", "kubernetes", "manual"]),
  command: optText.describe("the exact read-only command run, so it can be repeated"),
  observedAt: z.string().describe("ISO timestamp — the viewer shows how stale this is"),
});

export const Workload = z
  .object({
    name: z.string().min(1),
    kind: optText.describe("ECS service, Deployment, Lambda, EC2 ASG…"),
    replicas: z.number().int().nonnegative().optional(),
    cpu: optText.describe("as provisioned, e.g. '4 vCPU' or 'requests 500m / limits 2'"),
    memory: optText,
    utilisation: optText.describe("observed, when metrics were available — otherwise omit"),
    scaling: optText.describe("autoscaling policy in force, or 'none'"),
  })
  .merge(Observation.partial());

export const CostLine = z
  .object({
    label: z.string().min(1),
    amount: z.number().describe("in the currency below"),
    currency: z.string().default("USD"),
    period: z.string().describe("e.g. '2026-07-01..2026-07-31' — never a bare month name"),
    basis: z.enum(["actual", "estimated"]).describe("actual = from a billing API; estimated = derived"),
  })
  .merge(Observation.partial());

export const Deployment = z.object({
  schemaVersion: z.literal(1),
  platform: z.string().min(1).describe("where this actually runs: ECS Fargate, OpenShift, Lambda…"),
  summary: z.string().min(1).describe("1-2 sentences on how it is deployed today. Lead with what is surprising."),
  environment: optText.describe("which environment was inspected — say so, since costs differ wildly"),
  workloads: z.array(Workload).default([]),
  cost: z.array(CostLine).default([]),
  observability: z
    .object({
      metrics: optText,
      logs: optText,
      alerts: optText,
      tracing: optText,
      gaps: z.array(z.string()).default([]).describe("what is missing that would matter in an incident"),
    })
    .optional(),
  /** what the deployment itself should change — distinct from code-level optimisations */
  recommendations: z.array(Optimisation).default([]),
  notes: optText.describe("caveats: partial access, one environment only, metrics unavailable…"),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------- bench

/**
 * bench.json — what a pack entry would be worth to THIS service.
 *
 * The join between two things that are individually inert: `ai.json` says this
 * system embeds each sub-question in a loop; the pack says here is our answer
 * for batching. Neither is a recommendation on its own. This is where they meet,
 * and it is the last honest step before anything is measured.
 *
 * THREE THINGS KEEP IT FROM BECOMING A WISHLIST:
 *
 * 1. Both ends must exist. `stageId` has to name a stage in the service's own
 *    ai.json and `techniqueId` a CURRENT entry in the pack. Those are checked
 *    across files by `verify`, so "you recommended something we do not ship" and
 *    "you recommended it for a stage that does not exist" are mechanical
 *    failures rather than things a reader has to notice.
 *
 * 2. Three numbers, not two. What it costs today, what changes after, and what
 *    ADOPTING it costs. A 20% improvement behind a config flag and the same 20%
 *    behind a re-index of 400M chunks are different recommendations, and a
 *    report showing only the first two is quietly dishonest.
 *
 * 3. No number without its assumptions. There is no price table in this repo, so
 *    any figure in money is the agent's own arithmetic and has to be legible as
 *    such. Units of work are the honest default: calls and tokens are read off
 *    the code, they do not expire, and a reader can multiply.
 */
export const BenchUnit = z.enum([
  "calls-per-request",
  "calls-per-month",
  "tokens-per-request",
  "tokens-per-month",
  "seconds-per-request",
  "usd-per-month",
  "qualitative",
]);

export const BenchBasis = z
  .enum(["structural", "estimated", "measured"])
  .describe(
    "structural = counted from the code, true regardless of traffic. estimated = arithmetic on an assumption. measured = from a real run."
  );

export const BenchItem = z
  .object({
    id: z.string().min(1),
    stageId: z.string().min(1).describe("a stage id from this service's ai.json — checked across files"),
    techniqueId: z.string().min(1).describe("a CURRENT entry id from the practice pack — checked across files"),

    applies: z
      .string()
      .min(1)
      .describe("why the entry's 'applies when' is true OF THIS CODE, naming what you saw. Not a restatement of it."),

    today: z.object({
      value: z.string().min(1).describe("what it costs now, with the number in it"),
      unit: BenchUnit,
      basis: BenchBasis,
    }),
    after: z.string().min(1).describe("what it becomes, in the same unit, so the two compare"),
    migration: z
      .string()
      .min(1)
      .describe("what adopting costs — engineer time, re-indexing, dual-running. Never omitted for being small."),
    qualityRisk: z
      .string()
      .min(1)
      .describe("what could get worse. 'Nothing — output is unchanged by construction' is valid and common."),

    evidenceNeeded: optText.describe(
      "the comparison that would have to be run before shipping. Required when the cited entry can change output."
    ),
    assumptions: z
      .array(z.string())
      .default([])
      .describe("REQUIRED for anything estimated. If the figure is money, name the price used and where it came from."),

    confidence: z.enum(["high", "medium", "low"]),
  })
  .merge(Evidence.partial())
  .superRefine((it, ctx) => {
    if (it.today.basis === "estimated" && !it.assumptions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["assumptions"],
        message:
          'an estimated figure must state what it assumed — otherwise the number cannot be checked or argued with',
      });
    }
    if (it.today.unit === "usd-per-month" && it.today.basis === "structural") {
      ctx.addIssue({
        code: "custom",
        path: ["today", "basis"],
        message:
          'money is never "structural": converting calls to currency requires a price, which is an assumption. Use "estimated" and name the price, or report the figure in calls or tokens.',
      });
    }
  });

export const Bench = z.object({
  schemaVersion: z.literal(1),
  packVersion: z
    .string()
    .min(1)
    .describe("the pack this was computed against — a bench result outlives the pack that produced it"),
  summary: z.string().min(1).describe("1-2 sentences. Lead with the largest honest number."),
  items: z.array(BenchItem).default([]),
  note: optText.describe("use this to say nothing in the pack applies here, rather than reaching for the nearest entry"),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------- sequence

export const SeqRow = z.union([
  z.object({
    t: z.literal("msg"),
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().optional(),
    sub: z.string().optional(),
    dashed: z.boolean().optional(),
    tone: z.enum(["warn"]).optional(),
  }),
  z.object({
    t: z.literal("note"),
    lane: z.string().min(1),
    label: z.string().optional(),
    sub: z.array(z.string()).optional(),
  }),
]);

export const SeqStep = z.object({
  id: z.string().min(1),
  box: z.object({ title: z.string(), tone: z.enum(["accent", "warn"]) }).optional(),
  rows: z.array(SeqRow).min(1),
});

export const Sequence = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1),
    blurb: z.string().min(1),
    lanes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2).max(10),
    intro: z.array(SeqRow).default([]),
    steps: z.array(SeqStep).min(1),
    summary: z.object({ title: z.string(), lines: z.array(z.string()).default([]) }),
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((s, ctx) => {
    const laneIds = new Set(s.lanes.map((l) => l.id));
    const checkRow = (row: z.infer<typeof SeqRow>, where: (string | number)[]) => {
      const used = row.t === "msg" ? [row.from, row.to] : [row.lane];
      for (const id of used) {
        if (!laneIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: where,
            message: `lane "${id}" is used but not declared in lanes. Declared: ${[...laneIds].join(", ")}`,
          });
        }
      }
    };
    s.intro.forEach((r, i) => checkRow(r, ["intro", i]));
    s.steps.forEach((st, i) => st.rows.forEach((r, j) => checkRow(r, ["steps", i, "rows", j])));
  });

// ---------------------------------------------------------------- helpers

export type Project = z.infer<typeof Project>;
export type ServiceDef = z.infer<typeof ServiceDef>;
export type Topology = z.infer<typeof Topology>;
export type Sequence = z.infer<typeof Sequence>;
export type Finding = z.infer<typeof Finding>;
export type Optimisation = z.infer<typeof Optimisation>;
export type Optimisations = z.infer<typeof Optimisations>;
export type Deployment = z.infer<typeof Deployment>;
export type Ai = z.infer<typeof Ai>;
export type Bench = z.infer<typeof Bench>;
export type BenchItem = z.infer<typeof BenchItem>;
export type AiPipeline = z.infer<typeof AiPipeline>;
export type AiStage = z.infer<typeof AiStage>;

export const SCHEMAS = {
  project: Project,
  topology: Topology,
  sequence: Sequence,
  optimise: Optimisations,
  deployment: Deployment,
  ai: Ai,
  bench: Bench,
  "practice-entry": PracticeEntry,
} as const;
export type ArtifactKind = keyof typeof SCHEMAS;

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  /** one line per problem, phrased so an agent can act on it directly */
  errors: string[];
}

export function validate<K extends ArtifactKind>(kind: K, input: unknown): ValidationResult<unknown> {
  const schema = SCHEMAS[kind];
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data, errors: [] };
  return {
    ok: false,
    errors: r.error.issues.map((i) => {
      const at = i.path.length ? i.path.join(".") : "(root)";
      return `${at}: ${i.message}`;
    }),
  };
}
