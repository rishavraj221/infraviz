import type { VizData, Optimisation, Finding, Deployment } from "./types";

/**
 * What can this tool honestly tell you yet?
 *
 * Coverage is not one number. "40% analysed" tells a product owner nothing,
 * because different questions need different artifacts: the security picture
 * needs risk findings, the cost picture needs a connected deployment. So
 * readiness is expressed per QUESTION, and a partial answer always names which
 * services it covers — a conclusion drawn from two of six services is useful,
 * but only if you know that is what it is.
 *
 * All of this is computed from artifacts already on disk. It costs nothing and
 * needs no model call.
 */
export type Level = "none" | "partial" | "ready";

export interface Answerable {
  id: string;
  question: string;
  /** what unlocks it, in plain language */
  needs: string;
  /** the artifact that closes the gap, so the row can offer to generate it */
  kind: "sequence" | "topology" | "optimise" | "deployment";
  /** a cloud connector is a prerequisite this app cannot satisfy for you */
  needsConnector?: boolean;
  level: Level;
  covered: string[];
  missing: string[];
  /** the actual answer, when there is enough to give one */
  headline?: string;
  sub?: string;
}

/** Tier C is meant to be thin — holding the whole picture hostage to it would
 *  make "ready" unreachable and the tiering meaningless. */
const matters = (tier?: string) => tier !== "C";

function levelFor(covered: number, total: number): Level {
  if (total === 0 || covered === 0) return "none";
  return covered >= total ? "ready" : "partial";
}

export function computeReadiness(data: VizData): Answerable[] {
  const services = (data.project.services ?? []).filter((s) => matters(s.tier));
  const named = (ids: string[]) =>
    ids
      .map((id) => data.project.services?.find((s) => s.id === id)?.name ?? id)
      .slice(0, 3)
      .join(", ");

  const by = (has: (a: NonNullable<VizData["services"][string]>) => boolean) => {
    const covered: string[] = [];
    const missing: string[] = [];
    for (const s of services) {
      const a = data.services[s.id];
      (a && has(a) ? covered : missing).push(s.id);
    }
    return { covered, missing, level: levelFor(covered.length, services.length) };
  };

  const flow = by((a) => Boolean(a.topology || a.sequence));
  const risk = by((a) => Boolean(a.topology));
  const opt = by((a) => Boolean(a.optimise));
  const dep = by((a) => Boolean(a.deployment));

  // ---- Answers aggregate from EVERY service, including tier C.
  // Coverage deliberately excludes tier C (a thin router should not hold the
  // picture hostage), but a finding is a finding — generating a tier C service
  // and seeing nothing appear would read as the tool ignoring your work.
  const findings: Finding[] = [];
  const optimisations: Optimisation[] = [];
  const deployments: Deployment[] = [];
  for (const s of data.project.services ?? []) {
    const a = data.services[s.id];
    if (!a) continue;
    if (a.topology?.risk) {
      findings.push(...a.topology.risk.security, ...a.topology.risk.compliance, ...a.topology.risk.reliability);
    }
    if (a.optimise?.items) optimisations.push(...a.optimise.items);
    if (a.deployment) {
      deployments.push(a.deployment);
      if (a.deployment.recommendations) optimisations.push(...a.deployment.recommendations);
    }
  }
  findings.push(...(data.project.platformFindings ?? []));

  const criticals = findings.filter((f) => f.severity === "critical");
  const quickWins = optimisations.filter((o) => o.effort === "low" && o.confidence === "high");
  const actualCost = deployments
    .flatMap((d) => d.cost ?? [])
    .filter((c) => c.basis === "actual")
    .reduce((a, c) => a + c.amount, 0);
  const gaps = deployments.flatMap((d) => d.observability?.gaps ?? []);

  const scopeNote = (r: { level: Level; covered: string[] }) =>
    r.level === "partial" ? `from ${r.covered.length} service${r.covered.length === 1 ? "" : "s"}: ${named(r.covered)}` : undefined;

  return [
    {
      id: "how",
      question: "How does this system actually work?",
      needs: "sequence diagrams",
      kind: "sequence",
      ...flow,
      headline:
        flow.level === "none"
          ? undefined
          : `${flow.covered.length} of ${services.length} services traced end to end`,
      sub: scopeNote(flow),
    },
    {
      id: "risk",
      question: "Where are the security and compliance gaps?",
      needs: "flow & risk lenses",
      kind: "topology",
      ...risk,
      headline:
        risk.level === "none"
          ? undefined
          : criticals.length
            ? `${criticals.length} critical · ${findings.length} findings in total`
            : `No critical findings across ${risk.covered.length} service${risk.covered.length === 1 ? "" : "s"}`,
      sub: criticals.length ? criticals[0].title : scopeNote(risk),
    },
    {
      id: "fix",
      question: "What should we fix first?",
      needs: "optimisations",
      kind: "optimise",
      ...opt,
      headline:
        opt.level === "none"
          ? undefined
          : `${optimisations.length} improvement${optimisations.length === 1 ? "" : "s"}, ${quickWins.length} low-effort`,
      sub: quickWins[0]?.title ?? scopeNote(opt),
    },
    {
      id: "cost",
      question: "What is it costing, and where?",
      needs: "the deployment lens",
      kind: "deployment",
      needsConnector: true,
      ...dep,
      headline:
        dep.level === "none"
          ? undefined
          : actualCost > 0
            ? `${actualCost.toLocaleString(undefined, { style: "currency", currency: "USD" })} billed across the periods observed`
            : "Deployment observed, no billed figures retrieved",
      sub: gaps.length ? `${gaps.length} monitoring gap${gaps.length === 1 ? "" : "s"} found` : scopeNote(dep),
    },
  ];
}

/** One honest sentence about how far to trust the picture as a whole. */
export function overallVerdict(items: Answerable[], serviceCount: number): { title: string; body: string } {
  const ready = items.filter((i) => i.level === "ready").length;
  const none = items.filter((i) => i.level === "none").length;

  if (none === items.length) {
    return {
      title: "Not enough yet to judge this system",
      body: `${serviceCount} services found, but nothing analysed. Generate a service or two and this becomes a real picture — start with whichever one you would least like to be paged about.`,
    };
  }
  if (ready === items.length) {
    return {
      title: "Enough to judge the whole system",
      body: "Every question below is answered across the services that matter. Treat the findings as a working picture, and re-run after significant changes — citations are re-checked on every load, so drift shows up here.",
    };
  }
  return {
    title: "A partial picture — useful, but not the whole story",
    body: `${ready} of ${items.length} questions can be answered in full. Anything below marked partial is drawn only from the services listed, so read it as a sample rather than a verdict.`,
  };
}
