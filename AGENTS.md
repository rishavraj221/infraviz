# infraviz — instructions for coding agents

You are reading this because someone asked you to visualise their system
architecture and pointed you at this repository. This file is the complete
specification. **You do not need to clone or install this repo to do the work.**

Your job: read their codebase, write JSON artifacts into `.infraviz/` in *their*
repo, then tell them to run `npx infraviz view`.

---

## The contract

Everything hinges on one rule:

> **Every claim you make must cite a file and an exact substring from that file.**

That substring is called a `fingerprint`. `npx infraviz verify` re-reads the real
file and confirms the substring is still there. This is what makes the output
trustworthy instead of merely plausible — and what lets these artifacts be
committed as living documentation that fails CI when it drifts from reality.

If you invent a citation, verification catches it and the reader sees
`unverified claim` next to your finding. Don't do that.

**Abstaining is a correct answer.** An empty findings array for a simple service
is the right output. If you pad with invented concerns, you devalue the real
findings sitting next to them. Several services in any codebase should be tier C
with a one-line verdict and nothing else.

---

## Workflow

```
1. Scan            → .infraviz/project.json
2. Per service     → .infraviz/services/<id>/sequence.json
                   → .infraviz/services/<id>/topology.json
3. npx infraviz verify     (fix anything it reports, then re-verify)
4. npx infraviz view       (tell the user to run this)
```

Do step 1 once. Then do step 2 for the services worth it — start with the most
complex one rather than doing all of them, and let the user ask for more.

### Getting the exact prompts

```bash
npx infraviz spec            # workflow + evidence rules
npx infraviz spec scan       # the scan prompt
npx infraviz spec topology   # the topology prompt
npx infraviz spec sequence   # the sequence prompt
```

These print the authoritative schema. Prefer them over paraphrasing this file.

---

## Step 1 — Scan

Find the HTTP services (routers, controllers, handlers, lambdas) and the
infrastructure (Terraform, CDK, CloudFormation, compose, k8s). Write
`.infraviz/project.json`:

```json
{
  "schemaVersion": 1,
  "name": "their-api",
  "stack": { "language": "Python 3.11", "framework": "FastAPI", "entrypoint": "app/main.py" },
  "infra": {
    "summary": "Concrete. Name real resources and real sizes. If there's no IaC in this repo, say so plainly.",
    "resources": [
      { "kind": "compute", "name": "ECS service api", "detail": "4 vCPU / 16 GiB, min 1 max 6",
        "file": "infra/ecs.tf", "fingerprint": "api_task_memory" }
    ]
  },
  "services": [
    { "id": "checkout", "name": "Checkout", "router": "app/routers/checkout.py", "loc": 210,
      "tier": "A", "severity": "warn",
      "verdict": "One sentence a senior engineer would care about, specific to THIS service.",
      "tierNote": "why this depth is right",
      "deps": { "llm": 0, "vector": 0, "db": true, "redis": true, "external": ["Stripe"] } }
  ],
  "platformFindings": [
    { "id": "no-pooling", "title": "Connections are built per request, never pooled",
      "severity": "warn", "breaks": "...", "fix": "...",
      "file": "app/db.py", "fingerprint": "psycopg2.connect" }
  ]
}
```

**Tier is depth of treatment, and should vary:**

| Tier | Meaning |
|---|---|
| `A` | Complex or critical — many external calls, real blast radius |
| `B` | Moderate — some external deps or notable behaviour |
| `C` | Trivial — thin CRUD or passthrough. Short verdict, usually no findings |

`platformFindings` are things true of the whole system rather than any one
service. These are often the most valuable, because they stay unfixed precisely
because they belong to nobody.

## Step 2 — Per service

Write `sequence.json` first (it forces you to understand the real order of
operations), then `topology.json` reusing the same step ids so the two diagrams
cross-highlight.

Get the exact shapes from `npx infraviz spec topology` and `npx infraviz spec
sequence`. Key constraints the validator enforces:

- Every lane id used in a sequence row must be declared in `lanes`
- Every topology edge endpoint must be a declared node id
- Every edge id referenced by a step must be declared in `edges`
- `loadNote` is required unless you found real measurements — say plainly that
  load is not measured rather than implying a number exists

---

## How to actually analyse well

**Follow imports.** Routers are often 20 lines wrapping something far more
interesting. A finding that only reads the router will miss the real behaviour.
In one real codebase, grepping routers for database calls returned zero hits —
every insert lived two modules deeper.

**Check, don't assume.** Before writing "no rate limiting", grep for the
project's limiter. Before writing anything about load, look for load tests. Run
the test suite if it exists — it tells you what's actually exercised.

**Read the IaC for real numbers.** Instance classes, memory limits, autoscaling
bounds and cooldowns are all facts sitting in a file, not things to estimate.
Check whether the database is a fixed instance or serverless — they bill
completely differently, and getting it wrong makes a cost estimate worthless.

**Lead with the surprising thing.** "Returns 202 in milliseconds, then does the
real work in-process with no request holding it open" is a summary worth reading.
"Handles clinical evaluation requests" is not.

**Look for work that outlives the response.** Background tasks, fire-and-forget
jobs, and post-response writes are where the interesting failure modes live. If
you find them, box that phase in the sequence diagram with `tone: "warn"` — the
visual gap between where the request ends and where the work continues is usually
the single most useful thing on the page.

---

## Reporting back

Tell the user:

1. What you found — service count, and the one or two findings that matter most
2. Anything you could not verify, and why
3. `npx infraviz view` to see it
4. That `.infraviz/` is safe to commit, and `npx infraviz verify --strict` works
   as a CI gate that fails when the diagrams drift from the code

Do not claim you verified something you did not. If `npx infraviz verify` reports
failures you could not resolve, say so plainly.
