import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import DiagramCard from "./components/DiagramCard";
import RequestPanel from "./components/RequestPanel";
import SequenceDiagram from "./components/SequenceDiagram";
import Sidebar from "./components/Sidebar";
import OverallView from "./components/OverallView";
import { useVizStore } from "./store/useVizStore";
import type { VizData } from "./types";

export default function App() {
  const [data, setData] = useState<VizData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeService = useVizStore((s) => s.activeService);

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => (d?.project ? setData(d) : setError("No .infraviz/project.json found in this directory.")))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold mb-2">Nothing to show yet</h1>
          <p className="text-[13px] text-[var(--ink-soft)] leading-relaxed mb-4">{error}</p>
          <p className="text-[12px] text-[var(--ink-soft)] leading-relaxed">
            Ask your coding agent to analyse this repository — it can get the full spec by running{" "}
            <code>npx infraviz spec</code>. Then run <code>npx infraviz verify</code> and reload.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[13px] text-[var(--ink-soft)] font-mono">loading…</p>
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
