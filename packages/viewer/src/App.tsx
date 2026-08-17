import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import DiagramCard from "./components/DiagramCard";
import RequestPanel from "./components/RequestPanel";
import SequenceDiagram from "./components/SequenceDiagram";
import Sidebar from "./components/Sidebar";
import OverallView from "./components/OverallView";
import StartScreen from "./components/StartScreen";
import { useVizStore } from "./store/useVizStore";
import { applyJobEvent } from "./useRunner";
import type { VizData } from "./types";

export default function App() {
  const [data, setData] = useState<VizData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeService = useVizStore((s) => s.activeService);

  useEffect(() => {
    const load = () =>
      fetch("/api/data")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          setData(d?.project ? d : null);
          setLoaded(true);
        })
        .catch((e) => {
          setError(e.message);
          setLoaded(true);
        });
    load();

    // Live sync. The server watches .infraviz/, so work done in your IDE lands
    // here without a reload — and UI-driven jobs stream progress the same way.
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === "job") applyJobEvent(ev);
      if (ev.type === "data-changed") load();
    };
    return () => es.close();
  }, []);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-[var(--ink-soft)] font-mono">loading…</p>
      </div>
    );
  }

  // No project yet is a normal starting state, not an error — the UI is the
  // entry point, so offer both ways to begin from here.
  if (!data) return <StartScreen />;

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

              {!topology && !sequence ? (
                <div className="rounded-xl border border-dashed border-[var(--line)] p-6">
                  <h2 className="text-[14px] font-bold mb-1.5">No diagrams generated for this service yet</h2>
                  <p className="text-[12.5px] text-[var(--ink-soft)] leading-relaxed mb-3">
                    Ask your agent to generate them, then reload this page:
                  </p>
                  <pre className="text-[11.5px] font-mono bg-[var(--bg)] border border-[var(--line)] rounded-md p-3 overflow-x-auto">
                    {`Generate infraviz artifacts for "${service!.name}" (${service!.router}).
Follow: npx infraviz spec sequence
Then:   npx infraviz spec topology
Write to .infraviz/services/${service!.id}/
Verify with: npx infraviz verify`}
                  </pre>
                </div>
              ) : (
                <>
                  <RequestPanel
                    service={service!}
                    has={{
                      topology: Boolean(topology),
                      sequence: Boolean(sequence),
                      optimise: Boolean(art?.optimise),
                    }}
                  />
                  <ReactFlowProvider key={activeService}>
                    {sequence && <SequenceDiagram seq={sequence} />}
                    {topology && <DiagramCard topology={topology} optimise={art?.optimise ?? null} />}
                  </ReactFlowProvider>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
