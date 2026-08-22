# Plan — the AI section, the practice pack, and human-judged trials

Status: proposal. Nothing here is built yet.

---

## The governing principle

infraviz does not do the work. It sets the rules an agent follows, the way
`spec/index.ts` and `profiles.ts` already do: prose instructions with ids, plus a
schema thin enough to be checked and rendered.

This has to stay true for the AI work, and it is easy to get wrong. The instinct
is to model LLM applications properly — call sites, prompt shapes, cache
configurations, retrieval parameters — and it is the wrong instinct. A chatbot
with a RAG pipeline, an agentic system with tools, and a nightly classification
job share almost no structure. Any schema rich enough to describe one of them
well will distort the other two, and every new architecture becomes a schema
change.

So the rule for everything below:

> **Schema only for what must be machine-checked**: ids, links between artifacts,
> citations, versions. **Prose for everything that varies by application** — and
> that is most of it.

The agent is a capable engineer reading a briefing. Write the briefing.

---

## Piece 1 — the AI section

Today infraviz draws the resources: what talks to what, and what happens in
order. For a system that uses models, that view stops exactly where the
interesting part starts. `deps.llm: 3` is the whole model of an AI application
right now.

The AI section draws the **pipelines**, in more detail than the topology view,
because that is where the money and the quality live. A production chatbot
usually has two, and they are worth drawing separately:

- **ingestion** — runs offline. Documents in, chunks, embeddings, vector store.
  Nobody is waiting on it, and it is where a re-index cost hides.
- **query** — runs per request. Intent classification, decomposition, embedding,
  retrieval, generation.

Each stage carries what a reviewer needs to judge it: which model, roughly how
many calls per request, whether the result is reused, what happens on failure.
Stages are just a list — a stage has a kind, a name, and a description. An
agentic system has different stages. A batch job has three. Nothing breaks.

**Built, and drawn.** The pipelines render as bands on a canvas rather than as a
list, because both facts that matter here are spatial. Fan-out is a shape: a
repeating stage is drawn as a stack of cards with a bracket under the run of
them, so eight round trips look like eight round trips. And the gap between an
offline pipeline and a per-request one is a gap — separate bands, joined only by
the one dashed edge where a stage declares it `reads` what another pipeline
built. Layout is computed from the ordered list, never carried in the artifact;
asking a model for coordinates it cannot check is how diagrams end up
overlapping.

Two things make this view earn its place, and both are annotations on stages
rather than new structure:

- **repetition** — a stage called once per sub-question in a system that
  decomposes into five is where cost actually accumulates, and it never shows up
  in a topology diagram.
- **opportunity** — a stage the pack has something to say about. The intent
  classifier is a small model answering the same handful of questions all day;
  the pack's current entry on semantic caching applies, and the diagram should
  say so at the stage rather than in a list somewhere else.

The existing sequence/topology contract holds: shared step ids, so the AI view
and the flow diagrams cross-highlight, and every claim cites a file and a
fingerprint like everything else.

---

## Piece 2 — the practice pack

A registry of techniques your team has researched, implemented, and decided is
the current answer. Authored by hand. No agent harvests it and no agent decides
what enters it.

That is the whole value: a model can tell you knowledge graphs exist. It cannot
tell you *"our current answer for retrieval, as of this month, is this approach,
because we implemented it and measured it."* The pack carries a judgement a
person made and can be pointed at.

**Entries are briefings, not configurations.** Mostly prose, because what makes
a technique applicable to a given codebase is a judgement call the agent has to
make by reading the code. An entry says:

- what it is, and the paper or documentation it comes from
- **when it applies** — the conditions, in plain language, that make it worth
  doing. This is the field that does the work.
- **when it does not** — usually more useful than the previous one
- what it costs to adopt, honestly, including the parts that are not code
- what you learned implementing it: the precondition that turned out to matter,
  the failure mode you hit
- how to tell whether the codebase already does it

The structured part is small: an id, a topic, a status, a date, a maturity, and
what it supersedes.

**One current answer per topic.** The pack is a decision table, not a reading
list. Topics are things like retrieval, caching, routing, decomposition,
serving. At most one entry per topic is `current`; a new one supersedes the old,
which is retained and marked superseded so older reports stay explicable. When
the agent reaches the retrieval question, it does not survey the field — it asks
what the current answer is and gets one.

**Knob or architecture.** Every entry declares which it is, because the two lead
to completely different work:

- a **knob** is local and reversible — add semantic caching to the intent
  classifier. An afternoon. Trial it cheaply.
- an **architecture** change touches the shape of the system — replace vector
  retrieval with a knowledge graph, which means rebuilding ingestion, not just
  swapping a call. Weeks, and the trial itself has real setup cost.

Conflating them produces recommendations that read identically and cost 100x
different amounts. The report must never do that.

**Maturity still gates.** Provider-documented and field-proven techniques can be
recommended and trialled. A promising paper nobody has run in production shows on
the research page and goes no further until someone on your side implements it —
which is the bar for entering the pack as `current` anyway.

**Authoring.** A page in the viewer with a form: topic, source, when it applies,
when it does not, adoption cost, what you learned, what it supersedes. Not a file
upload — a PDF is not something an agent can act on. Attach the paper for
provenance if you like; the fields are what ship.

**Two layers.** The pack you author ships with the release. A client can add
their own entries in a local overlay that wins on conflict, and every report
records which layer a recommendation came from, so your judgement and their
internal playbook never blur.

---

## Piece 3 — the trial

The claim to earn is *cheaper or better, and proven on their own data*. The
sequence, using your example:

1. **The gap.** The AI section says retrieval is top-k over a vector store. The
   pack's current retrieval entry is a graph-based approach. The agent explains
   why it might apply *to this system specifically* — and abstains when it does
   not, which for a small flat corpus it often will not.
2. **A test environment, on their premises.** A sample of their indexed data.
   The tool describes how to build it; the agent builds it in their environment.
   Nothing leaves.
3. **Real questions.** Drawn from actual usage, in scope for the sampled data.
   Where they come from and how they are redacted is the customer's call, and it
   is a bigger consent event than reading code — it needs its own gate.
4. **Both answers.** Current architecture and candidate, same questions.
5. **A comparison report a human reads.** Answers side by side, cost per query,
   latency, and where they disagree. Not a score. The engineer judges.
6. **If it wins, a migration plan.** Also human-verified. Cheapest viable path,
   staged, reversible.

### The human is the judge, and that is a feature

I had this as an automated eval with a model scoring outputs. Your version is
better and I was wrong about it. An LLM judge drifts when the judge model
changes, gets gamed by whatever set you tune against, and produces a number
nobody trusts enough to act on anyway. A comparison an engineer reads and rules
on is more honest, and it is the only version that works in a regulated context.

It also removes auto-promotion entirely. Nothing ships because a threshold was
crossed. The report is the product; the decision stays with the person who owns
the system.

### The report must carry three numbers, not two

Quality difference, running cost difference, **and migration cost** — engineer
time, re-indexing, dual-running during cutover. A 20% retrieval improvement that
requires re-indexing 400M chunks and six engineer-weeks is a different
recommendation from the same improvement behind a config flag, and a report
showing only the first two numbers is quietly dishonest.

Every trial is recorded, whether it won or lost. A rejected trial — *we tried
graph retrieval on your corpus, it was 4% better and not worth the migration* —
is as valuable as an accepted one, and it is what stops the same question being
re-asked every quarter.

---

## Naming

- **Continuous Evidence (CE)** — the category, next to CI/CD. Not integration,
  not delivery: evidence, judged by a person before anything moves.
- Commands: `infraviz bench` (find gaps, estimate) → `infraviz trial` (build the
  test environment, run the comparison) → `infraviz migrate` (produce the
  migration plan). `infraviz research` for the pack.

---

## Risks worth naming

- **Real user questions are a much bigger consent event than source code.** Own
  gate, own redaction, default of the customer assembling the question set.
- **A sample is not the corpus.** Graph approaches often win on small curated
  data and behave differently at full scale. The report must say what fraction
  was tested and refuse to extrapolate.
- **Trial cost is real.** Building a parallel index and answering questions twice
  costs money in their account. Show the estimate before starting.
- **Pack rot.** A stale entry is worse than none, because it looks current. Every
  entry carries a review date and visibly decays.
- **Over-recommending.** The pack creates pressure to find applications for
  entries in it. Abstention has to stay a correct answer here exactly as it is
  everywhere else in infraviz: most systems should get no architecture
  recommendation at all.

---

## Sequencing

| Phase | Ships |
|---|---|
| 1 | ✅ AI section — pipeline view, prompts, viewer lens |
| 2 | ✅ Practice pack — data format, authoring page, overlay, research page |
| 3 | `bench` — join the AI section to the pack, estimate what a change is worth |
| 4 | `trial` — test environment recipe, comparison report, trial record |
| 5 | `migrate` — migration plans, reassess before starting |

Phase 1 is the substrate; nothing else stands without it. Phases 1–3 are still
recognisably infraviz: read-only, offline, evidence-cited. Phase 4 is where the
product changes shape and should be entered deliberately.
