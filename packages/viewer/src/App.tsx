import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import DiagramCard from "./components/DiagramCard";
import OptimiseLens from "./components/OptimiseLens";
import DeploymentLens from "./components/DeploymentLens";
import RequestPanel from "./components/RequestPanel";
import SequenceDiagram from "./components/SequenceDiagram";
import Sidebar from "./components/Sidebar";
import OverallView from "./components/OverallView";
import StartScreen from "./components/StartScreen";
import ProgressPanel from "./components/ProgressPanel";
import ConsentGate from "./components/ConsentGate";
import { useVizStore } from "./store/useVizStore";
import { applyJobEvent } from "./useRunner";
import type { VizData } from "./types";

export default function App() {
  const [data, setData] = useState<VizData | null>(null);
  const [consent, setConsent] = useState<{ accepted: boolean; reason?: string } | null>(null);
  const [repo, setRepo] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeService = useVizStore((s) => s.activeService);

  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          // Keep the whole payload. Nulling it when project.json is absent also
          // threw away `progress`, which is exactly what arrives DURING a scan —
          // so the page looked idle for the entire run.
          setData(d ?? null);
          setLoaded(true);
        })
        .catch((e) => {
          setError(e.message);
          setLoaded(true);
        });
    fetch("/api/status")
      .then((r) => r.json())
      .then((st) => {
        setConsent(st.consent ?? { accepted: false });
        setRepo(st.root);
      })
      .catch(() => setConsent({ accepted: false }));
    load();

    // Live sync. The server watches .infraviz/, so work done in your IDE lands
    // here without a reload — and UI-driven jobs stream progress the same way.
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      // anything carrying a jobId is progress from a run; the rest is file state
      if (ev.jobId) applyJobEvent(ev);
      else if (ev.type === "data-changed") load();
    };
    return () => es.close();
  }, []);

  if (!loaded || !consent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-[var(--ink-soft)] font-mono">loading…</p>
      </div>
    );
  }

  // Consent first, always. The server enforces the same gate, so this is not
  // merely cosmetic — nothing reads the codebase until it is recorded.
  if (!consent.accepted) {
    return <ConsentGate repo={repo} reason={consent.reason} onAccept={() => setConsent({ accepted: true })} />;
  }

  // A scan that found nothing is not a dashboard of zeros. Either it has not run
  // or it failed to identify services — both are "start here" states, not results.
  if (!data?.project || !(data.project.services?.length > 0)) {
    return <StartScreen emptyScan={Boolean(data?.project)} progress={data?.progress ?? null} />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-[13px] text-[var(--danger)]">{error}</p>
      </div>
    );
  }

  const services = data.project.services ?? [];
  const service = services.find((s) => s.id === activeService);
  const isOverall = !service;
  const art = service ? data.services[service.id] : undefined;
  const topology = art?.topology ?? null;
  const sequence = art?.sequence ?? null;

  return (
    <div className="min-h-screen">
      <div className="max-w-[1180px] mx-auto px-6 py-12 flex gap-9">
        <Sidebar data={data} />

        <main className="min-w-0 flex-1">
          {data.progress && !data.progress.done && (
            <div className="mb-5">
              <ProgressPanel progress={data.progress} />
            </div>
          )}
          <p className="font-mono text-[12px] tracking-wider uppercase text-[var(--accent)] mb-2">
            {data.project.name} ·{" "}
            {isOverall
              ? `${services.length} service${services.length === 1 ? "" : "s"}`
              : `${services.findIndex((s) => s.id === activeService) + 1} of ${services.length}`}
          </p>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {isOverall ? "Architecture overview" : service!.name}
          </h1>

          {isOverall ? (
            <OverallView data={data} />
          ) : (
            <div className="flex flex-col gap-6">
              <p className="text-[var(--ink-soft)] max-w-2xl">{topology?.summary ?? service!.verdict}</p>

              {/* Always offer the generate controls for whatever is missing. These
                  used to appear only once something already existed, which is
                  exactly backwards: the moment you most need them is when the
                  service has nothing yet. */}
              <RequestPanel
                service={service!}
                has={{
                  topology: Boolean(topology),
                  sequence: Boolean(sequence),
                  optimise: Boolean(art?.optimise),
                  deployment: Boolean(art?.deployment),
                }}
              />

              {(sequence || topology) && (
                <ReactFlowProvider key={activeService}>
                  {sequence && <SequenceDiagram seq={sequence} />}
                  {topology && <DiagramCard
                    topology={topology}
                    optimise={art?.optimise ?? null}
                    deployment={art?.deployment ?? null}
                    service={service!}
                  />}
                </ReactFlowProvider>
              )}

              {/* Optimisations normally live as a tab inside the topology card, but
                  they can be generated on their own — in which case there is no
                  card to host them and they would render nowhere. */}
              {art?.deployment && !topology && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-bold">Deployment</h2>
                    <span className="text-[10.5px] font-mono text-[var(--ink-soft)]">
                      generate the flow lenses to see this alongside the diagram
                    </span>
                  </div>
                  <DeploymentLens data={art.deployment} service={service!} />
                </div>
              )}

              {art?.optimise && !topology && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-bold">Optimisations</h2>
                    <span className="text-[10.5px] font-mono text-[var(--ink-soft)]">
                      generate the flow lenses to see these alongside the diagram
                    </span>
                  </div>
                  <OptimiseLens data={art.optimise} service={service!} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
