/**
 * The practice pack: what your team has researched, implemented, and decided is
 * the current answer.
 *
 * This is the successor to REFERENCES, and it exists to resolve a conflict that
 * constant could not. REFERENCES is closed on purpose — an agent picking from a
 * list cannot invent a title — but a closed constant cannot be updated without a
 * release of this package, and the whole point of the pack is that it moves.
 *
 * The resolution is that the set stays closed AT ANY GIVEN MOMENT, and the
 * moment is a version. An agent may only cite ids present in the pinned pack.
 * Adding an entry is a human writing a file and reviewing a diff, never an agent
 * deciding what research matters.
 *
 * ENTRIES ARE BRIEFINGS, NOT CONFIGURATIONS. Almost every field below is prose,
 * because whether a technique applies to a given codebase is a judgement an
 * agent has to make by reading that codebase. Structure is here only where
 * something must be machine-checked: identity, topic, status, dates, and the
 * supersession chain.
 */

import { z } from "zod";

/**
 * Topics are closed so the pack is a decision table rather than a reading list.
 *
 * The agent does not survey the field at the retrieval question — it asks what
 * the current answer for `retrieval` is and gets exactly one. That only works if
 * "retrieval" means the same thing to every entry.
 */
export const TOPICS = {
  retrieval: "How relevant context is found",
  caching: "What is reused instead of recomputed",
  routing: "Which model handles which request",
  decomposition: "How a request is broken up before work starts",
  batching: "What is grouped into one call or one job",
  serving: "How the model itself is hosted and reached",
  "structured-output": "How machine-readable output is obtained",
  guardrails: "How input and output are constrained",
  evaluation: "How output quality is measured",
  ingestion: "How source data becomes retrievable",
  observability: "What is recorded about model behaviour",
  "system-design": "General architecture, not model-specific",
} as const;

export const TOPIC_IDS = Object.keys(TOPICS) as (keyof typeof TOPICS)[];

/**
 * Maturity gates what the tool may do with an entry — "latest" never does.
 *
 * A three-week-old preprint is the opposite of an industry standard, and
 * recommending one to production inverts the evidence posture this project is
 * built on. Recency is a badge on the research page; maturity is the permission.
 */
export const Maturity = z.enum(["ga", "field-proven", "beta", "emerging"]);

export const MATURITY_MEANING: Record<string, string> = {
  ga: "provider-documented and generally available",
  "field-proven": "multiple public production write-ups",
  beta: "provider preview — may change or be withdrawn",
  emerging: "a paper or preprint, little production use",
};

/**
 * Knob or architecture, because the two produce work that differs by orders of
 * magnitude and reads identically on the page if nobody says which it is.
 */
export const Scope = z.enum(["knob", "architecture"]);

/**
 * Whether adopting this can change what the model actually outputs.
 *
 * The single most important field here. It is what lets the tool be honest about
 * "cheaper without compromising accuracy": half of these techniques cannot
 * compromise it by construction, and saying which half is most of the
 * trustworthiness. `none` means a cost and latency comparison is sufficient
 * evidence; `high` means nothing ships without an evaluation.
 */
export const EvalSensitivity = z.enum(["none", "low", "high"]);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date, YYYY-MM-DD — a bare year or month name is not checkable");

export const PracticeEntry = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/, "id must be kebab-case: lowercase letters, digits and hyphens only"),
    kind: z
      .enum(["technique", "principle"])
      .describe("technique = a concrete change with a claimed effect; principle = a durable design rule"),
    topic: z.enum(TOPIC_IDS as [string, ...string[]]),
    title: z.string().min(1).max(120).describe("what it is, in a phrase a reader can scan"),

    status: z
      .enum(["current", "superseded", "draft"])
      .describe("current = the answer for this topic today. At most one per topic."),
    supersedes: z
      .string()
      .optional()
      .describe("id of the entry this replaces — kept in the pack so older reports stay explicable"),

    maturity: Maturity,
    scope: Scope,
    evalSensitivity: EvalSensitivity,

    source: z.object({
      title: z.string().min(1),
      url: z.string().url("must be a real URL you can open — not a composed-looking citation"),
      kind: z.enum(["paper", "provider-docs", "book", "write-up", "standard"]),
    }),

    firstSeen: isoDate.describe("when this became known to you"),
    reviewedAt: isoDate.describe("when a human last confirmed this is still the right answer"),
    author: z.string().min(1).describe("who wrote this entry — the judgement is attributable"),

    // ---- the briefing. Prose, because applicability is a judgement call.
    appliesWhen: z
      .string()
      .min(1)
      .describe("the conditions that make this worth doing, in plain language. This field does the work."),
    doesNotApplyWhen: z
      .string()
      .min(1)
      .describe("when to leave it alone — usually more useful than the field above"),
    claim: z.string().min(1).describe("what improves, and roughly by how much"),
    adoptionCost: z
      .string()
      .min(1)
      .describe("honestly, including the parts that are not code: re-indexing, dual-running, review"),
    learned: z
      .string()
      .min(1)
      .describe("what you found implementing it — the precondition that mattered, the failure mode you hit"),
    detect: z
      .string()
      .min(1)
      .describe("how to tell whether a codebase already does this"),

    note: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    // An unproven thing cannot be the current answer. The bar for `current` is
    // that someone here implemented it, which is also the bar for leaving
    // `emerging` — so the two states are mutually exclusive by construction.
    if (e.status === "current" && e.maturity === "emerging") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message:
          'an "emerging" entry cannot be "current" — it belongs on the research page until someone here has implemented it, at which point its maturity changes',
      });
    }
    if (e.supersedes === e.id) {
      ctx.addIssue({ code: "custom", path: ["supersedes"], message: "an entry cannot supersede itself" });
    }
    if (e.reviewedAt < e.firstSeen) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: `reviewedAt (${e.reviewedAt}) is before firstSeen (${e.firstSeen})`,
      });
    }
  });

export type PracticeEntry = z.infer<typeof PracticeEntry>;

export const PackManifest = z.object({
  version: z.string().min(1).describe("bumped on every published change — artifacts record which pack they used"),
  builtAt: isoDate,
});
export type PackManifest = z.infer<typeof PackManifest>;

/** How long an entry stays trustworthy without a human looking at it again. */
export const REVIEW_WINDOW_DAYS = 180;

/**
 * Stale entries are worse than absent ones, because they still look current.
 * So decay is computed on read and shown, never left implicit.
 */
export function isStale(entry: { reviewedAt: string }, now = new Date()): boolean {
  const age = (now.getTime() - new Date(entry.reviewedAt).getTime()) / 86_400_000;
  return age > REVIEW_WINDOW_DAYS;
}

/**
 * Pack-wide rules that no single entry can check on its own.
 *
 * The decision-table property lives here: two `current` entries on one topic
 * means the agent has no answer to give, which is the failure this whole
 * structure exists to prevent.
 */
export function validatePack(entries: PracticeEntry[]): string[] {
  const errors: string[] = [];
  const byId = new Map(entries.map((e) => [e.id, e]));

  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.id)) errors.push(`duplicate entry id "${e.id}"`);
    seen.add(e.id);
  }

  const currentByTopic = new Map<string, string[]>();
  for (const e of entries) {
    if (e.status !== "current") continue;
    currentByTopic.set(e.topic, [...(currentByTopic.get(e.topic) ?? []), e.id]);
  }
  for (const [topic, ids] of currentByTopic) {
    if (ids.length > 1) {
      errors.push(
        `topic "${topic}" has ${ids.length} current entries (${ids.join(", ")}) — exactly one entry per topic may be current, or there is no answer to give`
      );
    }
  }

  for (const e of entries) {
    if (!e.supersedes) continue;
    const prev = byId.get(e.supersedes);
    if (!prev) {
      errors.push(`entry "${e.id}" supersedes "${e.supersedes}", which is not in the pack`);
    } else if (e.status === "current" && prev.status === "current") {
      errors.push(
        `entry "${e.id}" supersedes "${prev.id}" but both are marked current — set "${prev.id}" to superseded`
      );
    }
  }

  return errors;
}

/** The one current answer for a topic, if there is one. */
export function currentFor(entries: PracticeEntry[], topic: string): PracticeEntry | undefined {
  return entries.find((e) => e.topic === topic && e.status === "current");
}
