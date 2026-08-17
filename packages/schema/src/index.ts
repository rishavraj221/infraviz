// The contract. Every agent that produces infraviz data conforms to this, and
// every consumer (viewer, CLI, MCP) reads it.
//
// Validation errors are written to be ACTIONABLE BY AN AGENT, because the agent
// is the one that has to fix them. "lanes[3].id 'redis' is not declared in
// lanes" is useful; "invalid_union" is not.

import { z } from "zod";

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
    code: z.string().optional().describe("human-readable location, e.g. 'utils.py → save()'"),
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
  tierNote: z.string().optional(),
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
    detail: z.string().optional(),
  })
  .merge(Evidence.partial());

export const Project = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  stack: z
    .object({
      language: z.string().optional(),
      framework: z.string().optional(),
      entrypoint: z.string().optional(),
    })
    .optional(),
  infra: z
    .object({
      summary: z.string().optional(),
      resources: z.array(InfraResource).default([]),
    })
    .optional(),
  services: z.array(ServiceDef).default([]),
  platformFindings: z.array(Finding).default([]),
  generatedAt: z.string().optional(),
  generatedBy: z.string().optional().describe("e.g. 'cursor/claude-opus-5' — for provenance"),
});

// ---------------------------------------------------------------- topology

export const TopoNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: z.string().optional(),
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
    loadNote: z
      .string()
      .optional()
      .describe("REQUIRED unless real measurements exist — say it is not measured"),
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
    risk: z.string().optional().describe("what could go wrong or regress — omit if genuinely none"),
  })
  .merge(Evidence.partial());

export const Optimisations = z.object({
  schemaVersion: z.literal(1),
  /** ordered best-first: highest gain per unit of effort */
  items: z.array(Optimisation).default([]),
  /** state plainly when the service is already appropriate for its job */
  note: z
    .string()
    .optional()
    .describe("use this to say 'nothing worth changing' rather than inventing filler"),
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

export const SCHEMAS = {
  project: Project,
  topology: Topology,
  sequence: Sequence,
  optimise: Optimisations,
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
