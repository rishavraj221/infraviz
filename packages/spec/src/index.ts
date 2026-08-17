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

export const WORKFLOW = `1. Scan  → .infraviz/project.json          (once per repo)
2. Per service, generate:
     .infraviz/services/<id>/sequence.json
     .infraviz/services/<id>/topology.json
3. Verify → npx infraviz verify
4. View   → npx infraviz view`;
