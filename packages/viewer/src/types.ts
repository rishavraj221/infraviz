// Mirrors @infraviz/schema, kept as plain types so the viewer stays a static
// bundle with no runtime dependency on zod.

export type Severity = "ok" | "warn" | "critical";
export type Tier = "A" | "B" | "C";
export type Verification = "verified" | "failed" | "unverifiable";

export interface Finding {
  id: string;
  title: string;
  severity: "warn" | "critical";
  code?: string;
  breaks: string;
  fix: string;
  edges?: string[];
  file?: string;
  line?: number;
  fingerprint?: string;
  verification?: Verification;
  verificationNote?: string;
}

export interface ServiceDef {
  id: string;
  name: string;
  router: string;
  loc?: number;
  tier: Tier;
  severity: Severity;
  verdict: string;
  tierNote?: string;
  deps?: { llm?: number; vector?: number; db?: boolean; efs?: boolean; redis?: boolean; external?: string[] };
}

export interface InfraResource {
  kind: string;
  name: string;
  detail?: string;
  file?: string;
  line?: number;
  verification?: Verification;
  verificationNote?: string;
}

export interface Project {
  schemaVersion: 1;
  name: string;
  stack?: { language?: string; framework?: string; entrypoint?: string };
  infra?: { summary?: string; resources?: InfraResource[] };
  services: ServiceDef[];
  platformFindings?: Finding[];
  generatedAt?: string;
  generatedBy?: string;
}

export type NodeKind = "client" | "lb" | "task" | "openai" | "db" | "vector" | "cache" | "external" | "storage";

export interface TopoNode {
  id: string;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  x: number;
  y: number;
}
export interface TopoEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}
export interface TopoStep {
  id: string;
  title: string;
  code?: string;
  desc: string;
  edges: string[];
}

export interface Topology {
  schemaVersion: 1;
  taskNodeId: string;
  summary: string;
  lenses: string[];
  loadNote?: string;
  nodes: TopoNode[];
  edges: TopoEdge[];
  steps: TopoStep[];
  reliabilityModel: {
    groups: { label: string; n: number }[];
    fanOut?: { label: string; unitLabel: string; defaultUnits: number; maxUnits: number };
  };
  kpis: { label: string; value: string; tone?: Severity }[];
  risk: { security: Finding[]; compliance: Finding[]; reliability: Finding[] };
  _meta?: Record<string, unknown>;
}

export type SeqRow =
  | { t: "msg"; from: string; to: string; label?: string; sub?: string; dashed?: boolean; tone?: "warn" }
  | { t: "note"; lane: string; label?: string; sub?: string[] };

export interface Sequence {
  schemaVersion: 1;
  title: string;
  blurb: string;
  lanes: { id: string; label: string }[];
  intro: SeqRow[];
  steps: { id: string; box?: { title: string; tone: "accent" | "warn" }; rows: SeqRow[] }[];
  summary: { title: string; lines: string[] };
  _meta?: Record<string, unknown>;
}

export interface VizData {
  project: Project;
  services: Record<string, { topology: Topology | null; sequence: Sequence | null }>;
}
