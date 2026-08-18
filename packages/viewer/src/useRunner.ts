import { create } from "zustand";

export interface ProviderInfo {
  id: string;
  label: string;
  bin: string;
  installed: boolean;
  version?: string | null;
  tested: boolean;
  install?: string;
  note?: string;
  models: { id: string; label: string; hint?: string }[];
  efforts: string[];
  defaultModel: string;
  defaultEffort: string | null;
}

export type RunKind = "scan" | "topology" | "sequence" | "optimise" | "deployment";

interface RunnerState {
  providers: ProviderInfo[];
  provider: string | null;
  model: string | null;
  effort: string | null;
  /** key = kind or `${serviceId}:${kind}` */
  running: Record<string, boolean>;
  log: string[];
  error: string | null;

  loadProviders: () => Promise<void>;
  setEngine: (e: { provider?: string; model?: string; effort?: string | null }) => void;
  run: (kind: RunKind, serviceId?: string) => Promise<void>;
  dismissError: () => void;
}

const keyFor = (kind: RunKind, serviceId?: string) => (serviceId ? `${serviceId}:${kind}` : kind);

export const useRunner = create<RunnerState>((set, get) => ({
  providers: [],
  provider: null,
  model: null,
  effort: null,
  running: {},
  log: [],
  error: null,

  dismissError: () => set({ error: null }),

  loadProviders: async () => {
    try {
      const providers: ProviderInfo[] = await fetch("/api/providers").then((r) => r.json());
      const first = providers.find((p) => p.installed);
      set({
        providers,
        provider: get().provider ?? first?.id ?? null,
        model: get().model ?? first?.defaultModel ?? null,
        effort: get().effort ?? first?.defaultEffort ?? null,
      });
    } catch {
      set({ providers: [] });
    }
  },

  setEngine: (e) => set((s) => ({ ...s, ...e })),

  run: async (kind, serviceId) => {
    const k = keyFor(kind, serviceId);
    const { provider, model, effort } = get();
    set((s) => ({ running: { ...s.running, [k]: true }, log: [], error: null }));
    try {
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, serviceId, provider, model, effort }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      // progress and completion arrive over /api/events; App listens and refetches
    } catch (e) {
      set({ error: (e as Error).message, running: { ...get().running, [k]: false } });
    }
  },
}));

/** Called by App's single EventSource so job state lives in one place. */
export function applyJobEvent(ev: {
  jobId?: string;
  type?: string;
  tool?: string;
  text?: string;
  done?: boolean;
  status?: string;
  error?: string;
}) {
  const s = useRunner.getState();
  // Show what it is actually doing — the files it opens and the commands it runs.
  // A silent five-minute wait is indistinguishable from a hang.
  const line =
    ev.type === "tool"
      ? `${ev.tool ?? "tool"}  ${(ev.text ?? "").slice(0, 90)}`
      : ev.type === "thinking"
        ? (ev.text ?? "").split("\n")[0].slice(0, 110)
        : ev.text;
  if (line) useRunner.setState({ log: [...s.log.slice(-60), line] });
  if (ev.done) {
    useRunner.setState({
      running: {},
      error: ev.status === "error" ? (ev.error ?? "Generation failed") : null,
    });
  }
}
