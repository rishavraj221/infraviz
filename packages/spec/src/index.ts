// The prompts. Provider-agnostic on purpose: these are instructions for *any*
// agent, whether it's Cursor's, Claude Code, Codex, or a human following along.
//
// Two rules carry the whole product:
//   EVIDENCE  — every claim cites a file plus an exact substring, which gets
//               re-checked against disk. Invented citations are caught.
//   ABSTENTION — "nothing found" is an accepted answer. A generator forced to
//               produce N findings will invent them, and one invented finding
//               discredits every real one beside it.

export const RULES = `EVIDENCE RULES — these override any instinct to be comprehensive or impressive:
- Every finding MUST carry "file" (repo-relative) and "fingerprint": an EXACT
  substring, copied character-for-character, that currently exists in that file.
  Keep fingerprints 10-60 characters and distinctive. Never paraphrase them.
- Never cite a file you did not actually open.
- If you are not sure something is true, leave it out.
- An empty findings array is a CORRECT answer when the code is fine. Do not pad,
  and do not invent concerns to fill space.
- Prefer specific mechanism over generic advice: "unbounded fan-out, one LLM call
  per row" beats "consider optimising performance".
- Never guess the "line" field. The verifier fills it in.

USE YOUR TOOLS — they materially improve the result:
- Follow imports out of thin routers into the modules that do the real work.
  Handlers are often 20 lines wrapping something far more interesting.
- Run the project's tests if they exist; check for load tests before claiming
  anything about performance.
- Read the IaC (Terraform/CDK/compose/k8s) for real sizes and limits.
- Look things up on the web when a vendor price or documented behaviour changes
  your conclusion.

REPORT YOUR PROGRESS — the user is watching a viewer that cannot see you:

    npx infraviz progress --start "Reading routers under app/api"
    npx infraviz progress "Found 12 services, checking infrastructure"
    npx infraviz progress "Writing project.json" --done

Call it when you begin, at each meaningful step, and when you finish. Without
this the page sits idle for the several minutes you are working, which is
indistinguishable from a hang. One short line per step is enough; do not narrate
every file you open.

OUTPUT: one JSON object, nothing else. No prose, no markdown fence.`;

export function scanPrompt(): string {
  return `Analyse this codebase so it can be visualised as an infrastructure and request-flow map.

Identify:
1. The HTTP services it exposes — routers, controllers, handlers, lambdas.
2. The infrastructure it deploys onto, if any IaC is present.

${RULES}

Write the result to .infraviz/project.json in this shape:
{
  "schemaVersion": 1,
  "name": "<project name>",
  "stack": { "language": "...", "framework": "...", "entrypoint": "..." },
  "infra": {
    "summary": "2-3 concrete sentences. Name real resources and real sizes. If there is no IaC in this repo, say so plainly.",
    "resources": [
      { "kind": "compute|database|cache|storage|queue|loadbalancer|vector|other",
        "name": "...", "detail": "size/class read from IaC", "file": "...", "fingerprint": "..." }
    ]
  },
  "services": [
    { "id": "snake_case", "name": "Human Name", "router": "path/to/router.ext", "loc": 123,
      "tier": "A|B|C", "severity": "ok|warn|critical",
      "verdict": "ONE sentence a senior engineer would care about, specific to THIS service",
      "tierNote": "why this depth is right",
      "deps": { "llm": 0, "vector": 0, "db": false, "redis": false, "external": [] } }
  ],
  "platformFindings": [
    { "id": "...", "title": "...", "severity": "warn|critical", "breaks": "...", "fix": "...",
      "file": "...", "fingerprint": "..." }
  ]
}

TIER means depth of treatment, and should match substance rather than being uniform:
  A = complex or critical: many external calls, real blast radius
  B = moderate: some external deps or notable behaviour
  C = trivial: thin CRUD or passthrough. It is correct and expected for several
      services to be tier C with a short verdict and no findings.

platformFindings are things true of the whole system rather than one service —
the ones that stay unfixed precisely because they belong to nobody.

Severity reflects risk you actually evidenced. Most services are "ok".`;
}

export function topologyPrompt(service: { name: string; router: string }): string {
  return `Describe ONE service's request topology as a node/edge graph.

SERVICE: ${service.name}
ROUTER: ${service.router}

Read the router AND follow its imports into the modules doing the real work.

${RULES}

Write to .infraviz/services/<service-id>/topology.json:
{
  "schemaVersion": 1,
  "taskNodeId": "task",
  "summary": "1-2 sentences on what actually happens per request. Lead with the surprising part.",
  "lenses": ["flow","load","ratelimit","cost","security","compliance","reliability"],
  "loadNote": "REQUIRED unless you found real measurements: say plainly that load is not measured.",
  "nodes": [{ "id": "browser", "label": "Browser", "sublabel": "client", "kind": "client", "x": 0, "y": 220 }],
  "edges": [{ "id": "e-alb-task", "source": "alb", "target": "task", "label": "① short label" }],
  "steps": [{ "id": "kebab-id", "title": "① Short title", "code": "file.py → fn()",
              "desc": "What happens and why it matters.", "edges": ["e-alb-task"] }],
  "reliabilityModel": {
    "groups": [{ "label": "Postgres", "n": 1 }],
    "fanOut": { "label": "OpenAI", "unitLabel": "rows processed", "defaultUnits": 50, "maxUnits": 1000 }
  },
  "kpis": [{ "label": "...", "value": "...", "tone": "warn" }],
  "risk": { "security": [], "compliance": [], "reliability": [] }
}

Node kinds: client, lb, task, openai, db, vector, cache, external, storage.
Layout: x grows with call depth (client 0, lb ~320, task ~660, downstreams ~1040);
space downstream nodes ~130 apart on y.
Include "fanOut" ONLY when the call count genuinely varies per request.
Every edge id in "steps" must exist in "edges"; every edge endpoint must be a node id.
Each risk finding: { id, title, severity, code, breaks, fix, edges, file, fingerprint }.

Only list lenses you can actually support. If load is unmeasured, still include
"load" but set loadNote — the viewer shows "not measured" rather than a fake curve.`;
}

export function sequencePrompt(service: { name: string; router: string }, stepIds: string[] = []): string {
  return `Describe ONE service's request lifecycle as a sequence diagram.

SERVICE: ${service.name}
ROUTER: ${service.router}
${stepIds.length ? `REUSE THESE STEP IDS so both diagrams stay linked: ${stepIds.join(", ")}` : ""}

Show the REAL order of operations — including any work that continues after the
HTTP response is returned.

${RULES}

Write to .infraviz/services/<service-id>/sequence.json:
{
  "schemaVersion": 1,
  "title": "Full sequence — one <unit of work>",
  "blurb": "1-2 sentences. Lead with the structurally surprising thing.",
  "lanes": [{ "id": "browser", "label": "Browser" }, { "id": "api", "label": "API" }],
  "intro": [{ "t": "msg", "from": "browser", "to": "api", "label": "POST /path" }],
  "steps": [
    { "id": "step-id",
      "box": { "title": "shown for loops or distinct phases", "tone": "accent|warn" },
      "rows": [
        { "t": "msg", "from": "api", "to": "db", "label": "above arrow", "sub": "below arrow", "tone": "warn" },
        { "t": "note", "lane": "api", "label": "main line", "sub": ["dim line"] }
      ] }
  ],
  "summary": { "title": "round trips for one <unit>:", "lines": ["...", "..."] }
}

- 4-9 lanes, ordered left→right by when each is first contacted.
- Every lane id used in a row MUST be declared in "lanes". This is validated.
- "box" only for loops or genuinely distinct phases; tone "warn" for the phase
  carrying the risk. If work continues after the response, box it — that visual
  gap is usually the most important thing on the diagram.
- Use "sub" on a msg for the response detail instead of drawing a return arrow
  when the return is uninteresting.`;
}

export function optimisePrompt(service: { name: string; router: string }): string {
  return `Identify concrete optimisations for ONE service.

SERVICE: ${service.name}
ROUTER: ${service.router}

This is the most useful artifact in the set, and the easiest to fill with
platitudes. The bar: a senior engineer reads an item and immediately knows
whether to do it. "Add caching" fails that bar. "The same question re-embeds and
re-retrieves on every ask; a 5-minute cache on the question hash removes 3 of the
9 calls" passes it.

${RULES}

Write to .infraviz/services/<service-id>/optimise.json:
{
  "schemaVersion": 1,
  "note": "Use this to say nothing is worth changing, if that is the truth.",
  "items": [
    {
      "id": "kebab-id",
      "title": "Imperative and short — 'Parallelise the three retrieval round trips'",
      "dimension": ["latency"],
      "effort": "low",
      "confidence": "high",
      "costsToday": "What NOT doing this costs, quantified where the code allows.",
      "gain": "What improves, and roughly by how much.",
      "how": "The actual change, 1-2 sentences. Mechanism, not advice.",
      "risk": "What could regress. Omit if genuinely none.",
      "file": "...", "fingerprint": "..."
    }
  ]
}

Rules that make this worth reading:

- ORDER BEST FIRST — highest gain per unit of effort at the top. The reader
  should be able to stop after item 2 and still have the wins.
- QUANTIFY FROM THE CODE. "3 sequential calls become 1 round trip" is derivable.
  "40% faster" is not, unless you measured it. Never invent a percentage; say
  "roughly 3x fewer round trips on this path" instead.
- \`costsToday\` is the whole point. An optimisation with no stated cost of
  inaction is just a preference. If you cannot say what it costs today, drop it.
- BE HONEST ABOUT EFFORT. "low" means an afternoon. If it needs a schema
  migration or a new service, say "high" — a cheap-looking suggestion that is
  actually a month of work destroys trust in the whole list.
- dimension: latency | cost | reliability | ux | scale | security. Use the ones
  that genuinely apply, not all of them.
- SAY WHEN IT IS ALREADY FINE. A thin, correct CRUD endpoint should return
  \`items: []\` with a note saying so. Padding this file is worse than leaving it
  empty, because it trains the reader to skim past the real items.
- Prefer removing work over adding machinery. Deleting a redundant call beats
  adding a cache; adding a cache beats adding a queue.
- IF .infraviz/services/<id>/deployment.json EXISTS, read it first and ground
  your numbers in it. Real provisioned sizes, real utilisation and a real bill
  turn "this looks heavy" into "this runs at 12% CPU on 4 vCPU and costs $412 a
  month". Say when an item depends on the deployment being what that file says.

Also set "optimise" in the topology's "lenses" array so the viewer shows the tab.`;
}

export function deploymentPrompt(service: { name: string; router: string }, connector?: string): string {
  return `Inspect how ONE service is ACTUALLY deployed right now, and what it costs.

SERVICE: ${service.name}
ROUTER: ${service.router}
${connector ? `CONNECTOR: ${connector}` : "CONNECTOR: run `npx infraviz connect` to see what is authenticated"}

This is the only artifact based on running infrastructure rather than source. The
code says what was intended; this says what is true. Where they disagree, that
disagreement is usually the most valuable thing on the page.

HOW TO LOOK — you decide the commands, not us:

    npx infraviz connect run <connector> <your command>

You know this project and its platform; we do not. Work out what to ask from the
IaC, the deploy config and what you find as you go. The channel only enforces one
thing: the action must be read-only. Anything that creates, modifies, scales,
restarts or deletes is refused, whatever the service. If something you need is
refused, put it in "notes" rather than reaching around the guard.

NEVER ask the user for credentials, tokens or keys, and never write one to a
file. The connector uses the session they already have. If nothing is
authenticated, stop and tell them which command to run themselves.

${RULES}

Write to .infraviz/services/<service-id>/deployment.json:
{
  "schemaVersion": 1,
  "platform": "wherever it actually runs",
  "environment": "which environment you inspected — costs differ wildly between them",
  "summary": "1-2 sentences. Lead with what is surprising or wrong.",
  "workloads": [
    { "name": "...", "kind": "...", "replicas": 2, "cpu": "as provisioned", "memory": "...",
      "utilisation": "as observed, if metrics were available", "scaling": "the policy in force, or 'none'",
      "connector": "aws|openshift|kubernetes", "command": "the exact command you ran",
      "observedAt": "<ISO timestamp>" }
  ],
  "cost": [
    { "label": "...", "amount": 412.50, "currency": "USD",
      "period": "2026-07-01..2026-07-31", "basis": "actual",
      "connector": "aws", "command": "…", "observedAt": "<ISO>" }
  ],
  "observability": {
    "metrics": "what exists", "logs": "…", "alerts": "…", "tracing": "…",
    "gaps": ["what is missing that would matter at 3am during an incident"]
  },
  "recommendations": [ /* same shape as optimise items */ ],
  "notes": "caveats — partial access, one environment, metrics unavailable"
}

WHAT MAKES THIS WORTH READING:

- COST MUST BE REAL WHERE IT CAN BE. If the platform has a billing API, use it and
  mark basis:"actual" with the exact period. Mark "estimated" only when you
  derived it from sizes and public rates, and say so. Never present an estimate as
  a bill.
- COMPARE PROVISIONED AGAINST USED. "4 vCPU provisioned, p95 CPU 12%" is the
  single most valuable line you can produce, because it converts directly into
  money. Get utilisation from whatever metrics the platform exposes.
- RECOMMENDATIONS MUST NAME THE ARCHITECTURE CHANGE, not just the dial. Good:
  "two always-on tasks serve ~40 requests/minute; on a request-billed runtime the
  same load costs near zero at idle." Or: "one 16 GiB task exists only because a
  nightly batch shares the image — split that out and the fleet drops to 2 GiB."
  Bad: "consider right-sizing."
- COVER OBSERVABILITY HONESTLY. If there are no alerts, say so and name the two
  that would have caught the last plausible failure. Do not invent monitoring that
  is not there.
- SAY WHAT YOU COULD NOT SEE. Partial permissions, one environment, missing
  metrics — put it in "notes". An analysis that hides its blind spots is worse
  than one that admits them.

Record every command you ran in the artifact. A cloud fact cannot be re-checked
against a file the way a code citation can, so the command and the timestamp ARE
its provenance — someone must be able to repeat it and get the same answer.`;
}

export const WORKFLOW = `INCREMENTAL BY DESIGN — do not analyse everything in one pass.

1. Scan            → .infraviz/project.json     then STOP and report
2. npx infraviz view                            user picks a service
3. For ONE service → sequence.json, topology.json, optimise.json
                     (+ deployment.json if a cloud connector is authenticated)
4. npx infraviz verify                          fix anything reported
5. Repeat step 3 only for services the user asks for

Step 1 is cheap and gives the whole map. Steps 3 onward are expensive and only
worth spending on services the user actually cares about. A large repo analysed
end-to-end in one pass burns hours and most of the output goes unread.`;
