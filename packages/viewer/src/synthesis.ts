import type { VizData, Optimisation, Finding, Deployment } from "./types";

/**
 * Cross-service synthesis — the "so what should we actually do" view.
 *
 * Computed from artifacts already on disk: free, instant, and it cannot go stale
 * the way a generated summary would. It deliberately does not try to be clever
 * about things it cannot know; what it does well is the part that is mechanical
 * and that humans get wrong — noticing that the same root cause appears in five
 * services and is therefore one fix rather than five.
 */

export interface Priority {
  id: string;
  title: string;
  /** which services this lands in; more than one means a shared root cause */
  services: string[];
  kind: "risk" | "improvement";
  severity?: "critical" | "warn";
  effort?: "low" | "medium" | "high";
  why: string;
  score: number;
  file?: string;
  fingerprint?: string;
  basis?: string;
  reference?: string;
}

export interface CostSlice {
  service: string;
  amount: number;
  currency: string;
  basis: "actual" | "estimated";
}

export interface Synthesis {
  priorities: Priority[];
  cost: { total: number; currency: string; anyActual: boolean; slices: CostSlice[] };
  risk: { critical: number; warn: number; byService: { service: string; critical: number; warn: number }[] };
  /** distinct root causes touching more than one service */
  shared: Priority[];
  quickWins: Priority[];
}

/**
 * Two findings are the same root cause when they cite the same exact substring
 * in the same file.
 *
 * File alone is far too coarse — a router hosts many unrelated findings, and
 * grouping on it merged an auth bug with a webhook bug purely because they lived
 * in the same module, then reported the union of their services. The fingerprint
 * is the precise thing: identical cited code really is one fix.
 */
function groupKey(p: { file?: string; fingerprint?: string; title: string }) {
  if (p.file && p.fingerprint) return `fp:${p.file}::${p.fingerprint}`;
  // title is required by both source schemas, but an artifact that failed
  // validation is still served rather than dropped (see server.mjs), so a
  // missing title here is a real case, not a hypothetical one.
  return `title:${(p.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function scoreOf(p: Omit<Priority, "score">): number {
  let n = 0;
  if (p.kind === "risk") n = p.severity === "critical" ? 100 : 55;
  else if (p.effort === "low") n = 70;
  else if (p.effort === "medium") n = 40;
  else n = 20;

  // one change that fixes several services is worth more than the sum of its parts
  if (p.services.length > 1) n += 20 + Math.min(20, p.services.length * 4);
  // grounded in this system beats grounded in literature beats neither
  if (p.basis === "measured") n += 8;
  else if (p.basis === "principle") n += 4;
  return n;
}

export function computeSynthesis(data: VizData): Synthesis {
  const nameOf = (id: string) => data.project.services?.find((s) => s.id === id)?.name ?? id;

  const rawRisk: (Omit<Priority, "score"> & { serviceId: string })[] = [];
  const rawImp: (Omit<Priority, "score"> & { serviceId: string })[] = [];
  const slices: CostSlice[] = [];
  const byService: { service: string; critical: number; warn: number }[] = [];

  const pushFinding = (f: Finding, serviceId: string) => {
    if (f.severity !== "critical" && f.severity !== "warn") return;
    rawRisk.push({
      id: f.id,
      title: f.title,
      services: [serviceId],
      serviceId,
      kind: "risk",
      severity: f.severity,
      why: f.breaks,
      file: f.file,
      fingerprint: f.fingerprint,
    });
  };
  const pushOpt = (o: Optimisation, serviceId: string) => {
    rawImp.push({
      id: o.id,
      title: o.title,
      services: [serviceId],
      serviceId,
      kind: "improvement",
      effort: o.effort,
      why: o.costsToday,
      file: o.file,
      fingerprint: o.fingerprint,
      basis: o.basis,
      reference: o.reference,
    });
  };

  for (const s of data.project.services ?? []) {
    const a = data.services[s.id];
    if (!a) continue;
    let crit = 0;
    let warn = 0;
    if (a.topology?.risk) {
      for (const f of [...a.topology.risk.security, ...a.topology.risk.compliance, ...a.topology.risk.reliability]) {
        pushFinding(f, s.id);
        if (f.severity === "critical") crit++;
        else warn++;
      }
    }
    if (a.optimise?.items) for (const o of a.optimise.items) pushOpt(o, s.id);
    const dep = a.deployment as Deployment | null;
    if (dep) {
      for (const r of dep.recommendations ?? []) pushOpt(r, s.id);
      for (const c of dep.cost ?? []) {
        slices.push({ service: s.id, amount: c.amount, currency: c.currency ?? "USD", basis: c.basis });
      }
    }
    if (crit || warn) byService.push({ service: nameOf(s.id), critical: crit, warn });
  }

  // platform findings belong to everything, which is exactly why they rank high
  for (const f of data.project.platformFindings ?? []) {
    if (f.severity !== "critical" && f.severity !== "warn") continue;
    rawRisk.push({
      id: f.id,
      title: f.title,
      services: (data.project.services ?? []).map((s) => s.id),
      serviceId: "__platform",
      kind: "risk",
      severity: f.severity,
      why: f.breaks,
      file: f.file,
      fingerprint: f.fingerprint,
    });
  }

  // collapse the same root cause appearing in several services into one item
  const merge = (rows: (Omit<Priority, "score"> & { serviceId: string })[]): Priority[] => {
    const byKey = new Map<string, Omit<Priority, "score">>();
    for (const r of rows) {
      const k = groupKey(r);
      const prev = byKey.get(k);
      if (prev) {
        for (const s of r.services) if (!prev.services.includes(s)) prev.services.push(s);
      } else {
        byKey.set(k, { ...r, services: [...r.services] });
      }
    }
    return [...byKey.values()].map((p) => ({ ...p, score: scoreOf(p) }));
  };

  const priorities = [...merge(rawRisk), ...merge(rawImp)].sort((a, b) => b.score - a.score);

  const actual = slices.filter((s) => s.basis === "actual");
  const total = actual.reduce((a, s) => a + s.amount, 0);

  return {
    priorities,
    cost: {
      total,
      currency: slices[0]?.currency ?? "USD",
      anyActual: actual.length > 0,
      slices: [...slices].sort((a, b) => b.amount - a.amount),
    },
    risk: {
      critical: rawRisk.filter((r) => r.severity === "critical").length,
      warn: rawRisk.filter((r) => r.severity === "warn").length,
      byService: byService.sort((a, b) => b.critical - a.critical || b.warn - a.warn),
    },
    shared: priorities.filter((p) => p.services.length > 1),
    quickWins: priorities.filter((p) => p.kind === "improvement" && p.effort === "low"),
  };
}

export const serviceNames = (data: VizData, ids: string[]) =>
  ids.map((id) => data.project.services?.find((s) => s.id === id)?.name ?? id);
