import type { VizData, ServiceDef } from "./types";

/**
 * Prompts for the IDE path.
 *
 * The aggregate forms matter more than the per-artifact ones: without them a
 * Cursor user faces a wall of individual copy buttons and has to paste four
 * times for one service. One paste should be able to cover a whole service, or
 * the whole project.
 */
const ORDER = ["sequence", "topology", "optimise", "deployment"] as const;
export type Kind = (typeof ORDER)[number];

const LABEL: Record<Kind, string> = {
  sequence: "sequence.json",
  topology: "topology.json",
  optimise: "optimise.json",
  deployment: "deployment.json",
};

export function promptForService(service: ServiceDef, kinds: Kind[]): string {
  const ordered = ORDER.filter((k) => kinds.includes(k));
  if (ordered.length === 1) {
    const k = ordered[0];
    return `Generate the ${k} artifact for the "${service.name}" service in this repo.

Router: ${service.router}

Run \`npx infraviz spec ${k}\` and follow it exactly. Write the result to
.infraviz/services/${service.id}/${LABEL[k]}, then run \`npx infraviz verify\`
and fix anything it reports.

Only this one service — do not analyse the rest of the repo.`;
  }

  return `Generate all missing infraviz artifacts for the "${service.name}" service.

Router: ${service.router}

Work through these in order, since each informs the next:

${ordered.map((k, i) => `  ${i + 1}. npx infraviz spec ${k}   →  .infraviz/services/${service.id}/${LABEL[k]}`).join("\n")}

Follow each spec exactly. Report progress as you go with
\`npx infraviz progress "…"\` so the open viewer shows what you are doing.
When all are written, run \`npx infraviz verify\` and fix anything it reports.

Only this one service — do not analyse the rest of the repo.`;
}

export function promptForProject(data: VizData, pending: { serviceId: string; kind: Kind }[]): string {
  const byService = new Map<string, Kind[]>();
  for (const p of pending) byService.set(p.serviceId, [...(byService.get(p.serviceId) ?? []), p.kind]);

  const lines = [...byService.entries()].map(([id, kinds]) => {
    const s = data.project.services?.find((x) => x.id === id);
    const ordered = ORDER.filter((k) => kinds.includes(k));
    return `  ${s?.name ?? id}  (${s?.router ?? id})\n      ${ordered.join(", ")}`;
  });

  return `Generate the missing infraviz artifacts across this repository.

${lines.join("\n")}

For each artifact run \`npx infraviz spec <kind>\` and follow it exactly, writing
to .infraviz/services/<service-id>/<kind>.json.

Do one service at a time and finish it before moving on, so partial results are
still useful if you stop. Report progress with \`npx infraviz progress "…"\` —
the viewer is open and shows it live. Run \`npx infraviz verify\` at the end and
fix anything it reports.

This is ${pending.length} artifacts and will take a while. If that is more than
the user wants, do the first service and ask before continuing.`;
}
