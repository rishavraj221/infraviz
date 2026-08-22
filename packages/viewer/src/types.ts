// Mirrors @infraviz/schema, kept as plain types so the viewer stays a static
// bundle with no runtime dependency on zod.

export type Severity = "ok" | "warn" | "critical";
export type Tier = "A" | "B" | "C";
export type Verification = "verified" | "failed" | "unverifiable";

export interface Finding {
  addresses?: string[];
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
  profiles?: string[];
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
  assessed?: string[];
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

export interface Optimisation {
  id: string;
  title: string;
  dimension: ("latency" | "cost" | "reliability" | "ux" | "scale" | "security")[];
  effort: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
  costsToday: string;
  gain: string;
  how: string;
  risk?: string;
  basis?: "measured" | "principle" | "practice";
  addresses?: string[];
  fingerprint?: string;
  reference?: string;
  referenceNote?: string;
  file?: string;
  line?: number;
  verification?: "verified" | "failed" | "unverifiable";
}

export interface Optimisations {
  schemaVersion: 1;
  items: Optimisation[];
  note?: string;
  _meta?: Record<string, unknown>;
}

export interface Observation {
  connector?: "aws" | "openshift" | "kubernetes" | "manual";
  command?: string;
  observedAt?: string;
}

export interface Workload extends Observation {
  name: string;
  kind?: string;
  replicas?: number;
  cpu?: string;
  memory?: string;
  utilisation?: string;
  scaling?: string;
}

export interface CostLine extends Observation {
  label: string;
  amount: number;
  currency?: string;
  period: string;
  basis: "actual" | "estimated";
}

export interface Deployment {
  schemaVersion: 1;
  platform: string;
  summary: string;
  environment?: string;
  workloads?: Workload[];
  cost?: CostLine[];
  observability?: {
    metrics?: string;
    logs?: string;
    alerts?: string;
    tracing?: string;
    gaps?: string[];
  };
  recommendations?: Optimisation[];
  notes?: string;
  _meta?: Record<string, unknown>;
}

export type AiStageKind =
  | "guard"
  | "classify"
  | "decompose"
  | "embed"
  | "retrieve"
  | "rerank"
  | "generate"
  | "tool"
  | "chunk"
  | "index"
  | "store"
  | "other";

export interface AiStage {
  id: string;
  name: string;
  kind: AiStageKind;
  model?: string;
  detail: string;
  calls?: string;
  repeats?: boolean;
  opportunity?: string;
  stepId?: string;
  reads?: string[];
  file?: string;
  line?: number;
  fingerprint?: string;
  verification?: Verification;
  verificationNote?: string;
}

export interface AiPipeline {
  id: string;
  name: string;
  when: "request" | "offline" | "scheduled" | "event";
  summary: string;
  unitOfWork?: string;
  dependsOn?: string[];
  stages: AiStage[];
}

export interface Ai {
  schemaVersion: 1;
  summary: string;
  pipelines: AiPipeline[];
  volumeNote: string;
  evals?: { present: boolean; note: string; file?: string; line?: number; fingerprint?: string };
  note?: string;
  _meta?: Record<string, unknown>;
}

export type BenchUnit =
  | "calls-per-request"
  | "calls-per-month"
  | "tokens-per-request"
  | "tokens-per-month"
  | "seconds-per-request"
  | "usd-per-month"
  | "qualitative";

export interface BenchItem {
  id: string;
  stageId: string;
  techniqueId: string;
  applies: string;
  today: { value: string; unit: BenchUnit; basis: "structural" | "estimated" | "measured" };
  after: string;
  migration: string;
  qualityRisk: string;
  evidenceNeeded?: string;
  assumptions?: string[];
  confidence: "high" | "medium" | "low";
  file?: string;
  line?: number;
  fingerprint?: string;
  verification?: Verification;
  verificationNote?: string;
}

export interface Bench {
  schemaVersion: 1;
  packVersion: string;
  summary: string;
  items?: BenchItem[];
  note?: string;
}

export type PracticeTopic = string;

export interface PracticeEntry {
  id: string;
  kind: "technique" | "principle";
  topic: PracticeTopic;
  title: string;
  status: "current" | "superseded" | "draft";
  supersedes?: string;
  maturity: "ga" | "field-proven" | "beta" | "emerging";
  scope: "knob" | "architecture";
  evalSensitivity: "none" | "low" | "high";
  source: { title: string; url: string; kind: "paper" | "provider-docs" | "book" | "write-up" | "standard" };
  firstSeen: string;
  reviewedAt: string;
  author: string;
  appliesWhen: string;
  doesNotApplyWhen: string;
  claim: string;
  adoptionCost: string;
  learned: string;
  detect: string;
  note?: string;
  /** added on read, not stored */
  layer: "official" | "local";
  stale: boolean;
}

export interface Pack {
  manifest: { version: string; builtAt?: string | null };
  entries: PracticeEntry[];
  problems: string[];
  /** false for anyone running infraviz as a dependency — the pack is shipped content */
  canAuthor: boolean;
  target: { layer: "official" | "local"; dir?: string; reason?: string };
  overlay: boolean;
}

export interface Progress {
  startedAt?: string;
  updatedAt?: string;
  done?: boolean;
  stale?: boolean;
  source?: string;
  steps?: { at: string; text: string }[];
}

export interface VizData {
  project: Project;
  services: Record<
    string,
    {
      topology: Topology | null;
      sequence: Sequence | null;
      ai: Ai | null;
      bench: Bench | null;
      optimise: Optimisations | null;
      deployment: Deployment | null;
    }
  >;
  progress?: Progress | null;
}
