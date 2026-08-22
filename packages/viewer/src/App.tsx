import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import DiagramCard from "./components/DiagramCard";
import OptimiseLens from "./components/OptimiseLens";
import AiLens from "./components/AiLens";
import ResearchPage from "./components/ResearchPage";
import BenchLens from "./components/BenchLens";
import DeploymentLens from "./components/DeploymentLens";
import RequestPanel from "./components/RequestPanel";
import SequenceDiagram from "./components/SequenceDiagram";
import Sidebar from "./components/Sidebar";
import OverallView from "./components/OverallView";
import StartScreen from "./components/StartScreen";
import ProgressPanel from "./components/ProgressPanel";
import ConsentGate from "./components/ConsentGate";
import ErrorBoundary from "./components/ErrorBoundary";
import { useVizStore } from "./store/useVizStore";
import { DEMO } from "./demo";
import { applyJobEvent } from "./useRunner";
import type { VizData } from "./types";

export default function App() {
  const [data, setData] = useState<VizData | null>(null);
  const [consent, setConsent] = useState<{ accepted: boolean; reason?: string } | null>(null);
  const [repo, setRepo] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeService = useVizStore((s) => s.activeService);
  const setActiveService = useVizStore((s) => s.setActiveService);
  const activeView = useVizStore((s) => s.activeView);
  const setActiveView = useVizStore((s) => s.setActiveView);

  useEffect(() => {
    // The embedded demo has no server: one static payload, no polling, no stream.
    if (DEMO) {
      fetch("./demo-data.json")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          setData(d ?? null);
          setConsent({ accepted: true });
          setRepo(d?.root);
          setLoaded(true);
          // #service-id lets the site embed the same bundle twice and land each
          // copy on the view its surrounding paragraph is talking about.
          const wanted = decodeURIComponent(window.location.hash.replace(/^#/, ""));
          if (wanted && d?.services?.[wanted]) setActiveService(wanted);
        })
        .catch((e) => {
          setError(e.message);
          setLoaded(true);
        });
      return;
    }

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
  }, [setActiveService]);

  if (!loaded || !consent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-[var(--ink-soft)] font-mono">loading…</p>
      </div>
    );
  }

  const scanned = Boolean(data?.project) && (data?.project.services?.length ?? 0) > 0;

  // The practice pack is reachable from every state, including before consent
  // and before any scan.
  //
  // That is not a weakening of the gate: the pack is what an agent would BRING
  // to this repository, holds none of its code, and opening it starts no
  // analysis. Someone deciding whether to accept is better served by seeing what
  // would be applied first.
  //
  // It renders standalone whenever there is no sidebar to host it — which is
  // most of the early life of a repository, and was previously a dead end: the
  // link lived only in a sidebar that does not exist until a scan has produced
  // services, so after accepting consent there was no route to the page at all.
  if (activeView === "research" && (!consent.accepted || !scanned)) {
    return (
      <div className="min-h-screen">
        <div className="max-w-[840px] mx-auto px-6 py-12">
          <button
            onClick={() => setActiveView("repo")}
            className="text-[12px] font-semibold text-[var(--accent)] cursor-pointer mb-6"
          >
            ← back{consent.accepted ? "" : " to the notice"}
          </button>
          <ErrorBoundary label="The practice pack">
            <ResearchPage />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  if (!consent.accepted) {
    return <ConsentGate repo={repo} reason={consent.reason} onAccept={() => setConsent({ accepted: true })} />;
  }

  // A scan that found nothing is not a dashboard of zeros. Either it has not run
  // or it failed to identify services — both are "start here" states, not results.
  // Written as an inline check rather than using `scanned` above, because this
  // is also what narrows `data` from null for everything below it.
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
          {/* The pack is not about this repository, so it carries its own heading
              rather than sitting under the project name. */}
          {activeView !== "research" && (
            <>
              <p className="font-mono text-[12px] tracking-wider uppercase text-[var(--accent)] mb-2">
                {data.project.name} ·{" "}
                {isOverall
                  ? `${services.length} service${services.length === 1 ? "" : "s"}`
                  : `${services.findIndex((s) => s.id === activeService) + 1} of ${services.length}`}
              </p>
              <h1 className="text-3xl font-bold tracking-tight mb-2">
                {isOverall ? "Architecture overview" : service!.name}
              </h1>
            </>
          )}

          {activeView === "research" ? (
            <ErrorBoundary label="The practice pack">
              <ResearchPage />
            </ErrorBoundary>
          ) : isOverall ? (
            <ErrorBoundary label="The overview">
              <OverallView data={data} />
            </ErrorBoundary>
          ) : (
            <div className="flex flex-col gap-6">
              <p className="text-[var(--ink-soft)] max-w-2xl">{topology?.summary ?? service!.verdict}</p>

              {/* Always offer the generate controls for whatever is missing. These
                  used to appear only once something already existed, which is
                  exactly backwards: the moment you most need them is when the
                  service has nothing yet. */}
              {!DEMO && (
              <ErrorBoundary label="The generate panel">
                <RequestPanel
                  service={service!}
                  has={{
                    topology: Boolean(topology),
                    sequence: Boolean(sequence),
                    ai: Boolean(art?.ai),
                    bench: Boolean(art?.bench),
                    optimise: Boolean(art?.optimise),
                    deployment: Boolean(art?.deployment),
                  }}
                />
              </ErrorBoundary>
              )}

              {(sequence || topology) && (
                <ReactFlowProvider key={activeService}>
                  {sequence && (
                    <ErrorBoundary label="The sequence diagram">
                      <SequenceDiagram seq={sequence} />
                    </ErrorBoundary>
                  )}
                  {topology && (
                    <ErrorBoundary label="The topology diagram">
                      <DiagramCard
                        topology={topology}
                        optimise={art?.optimise ?? null}
                        deployment={art?.deployment ?? null}
                        service={service!}
                      />
                    </ErrorBoundary>
                  )}
                </ReactFlowProvider>
              )}

              {/* The AI section stands on its own rather than living inside the
                  topology card: it is a different question from "what talks to
                  what", and for a model-using system it is usually the part the
                  reader came for. */}
              {art?.ai && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-bold">AI pipelines</h2>
                    <span className="text-[10.5px] font-mono text-[var(--ink-soft)]">
                      how models are used, stage by stage
                    </span>
                  </div>
                  <ErrorBoundary label="The AI lens">
                    <AiLens data={art.ai} />
                  </ErrorBoundary>
                </div>
              )}

              {/* Directly under the pipelines it refers to, because every item
                  names a stage drawn up there and the two are read together. */}
              {art?.bench && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-[15px] font-bold">What our practice is worth here</h2>
                    <span className="text-[10.5px] font-mono text-[var(--ink-soft)]">
                      pack {art.bench.packVersion}
                    </span>
                  </div>
                  <ErrorBoundary label="The bench lens">
                    <BenchLens data={art.bench} />
                  </ErrorBoundary>
                </div>
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
                  <ErrorBoundary label="The deployment lens">
                    <DeploymentLens data={art.deployment} service={service!} />
                  </ErrorBoundary>
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
                  <ErrorBoundary label="The optimisations lens">
                    <OptimiseLens data={art.optimise} service={service!} />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
