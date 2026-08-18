// The contract. Every agent that produces infraviz data conforms to this, and
// every consumer (viewer, CLI, MCP) reads it.
//
// Validation errors are written to be ACTIONABLE BY AN AGENT, because the agent
// is the one that has to fix them. "lanes[3].id 'redis' is not declared in
// lanes" is useful; "invalid_union" is not.

import { z } from "zod";

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

export const SCHEMAS = {
  project: Project,
  topology: Topology,
  sequence: Sequence,
  optimise: Optimisations,
  deployment: Deployment,
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
