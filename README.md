# infraviz

Visualise your API's real architecture — request flow, load, and risk — generated
by whatever coding agent you already use, with **every claim cited and verified
against your source**.

No account. No app to install. No data leaves your machine.

---

## Start from the UI

```bash
npx infraviz view
```

Opens on an empty repo and first asks you to acknowledge how your data is
handled — nothing reads your code until you do, and the local server enforces
that, not just the page. From there you pick either path — **run it here** (if an
agent CLI is on your PATH) or **copy a prompt for your IDE**. Both write the same
files, so you can switch mid-way: scan from the UI, generate diagrams in Cursor,
or the reverse.

The page stays in sync. The server watches `.infraviz/`, so work your IDE does
appears in an already-open tab without a reload. And `npx infraviz status` shows
what is done and what is missing — that is how an agent resumes from wherever you
left off:

```
● ○ ○  Chat Bots & Query-Doc Indexing   missing: topology, optimise
○ ● ●  Risk Management Uploads          missing: sequence
```

## Or start from your AI IDE

Paste this as your **first message** — the wording matters, and the reason is
worth knowing:

> Before reading any of my code, run `npx infraviz view` and give me the URL.
> Wait until I confirm I have accepted the notice in the browser. Then follow
> `npx infraviz spec` and scan this repo — stop after the scan and report.

### Why the phrasing matters

If you simply ask "visualise my system design", your agent will start reading
your codebase immediately. That is the correct instinct for a coding agent and
**infraviz cannot prevent it** — the agent already has access to your files, and
no third-party package can gate its built-in file tools. Neither `AGENTS.md` nor
an MCP server changes that.

What infraviz *can* do is refuse to hand over the prompts until you have
acknowledged the data-handling notice, so the analysis proper cannot proceed
without you:

```
$ npx infraviz spec scan
Consent has not been recorded for this repository, so the spec is unavailable.
```

But the broad reading happens earlier than that. If you want nothing touched
before you have read the notice, put it in your first message — that is the only
instruction with enough weight, and it works.

---

## Why the output is trustworthy

Anything an LLM writes about your code is a **claim**. This format requires every
claim to carry a `fingerprint` — an exact substring from the file it cites:

```json
{
  "title": "Unsanitised device_name is joined into a path that gets rmtree'd",
  "file": "app/api/routers/risk.py",
  "fingerprint": "risk_file_output_folder, device_name",
  "breaks": "A device_name containing ../ escapes the per-user folder, and recreate_folder() then deletes that arbitrary tree.",
  "fix": "Run device_name through sanitize_filename and assert the resolved path stays under the user's folder."
}
```

`npx infraviz verify` re-reads the real file and confirms the substring is still
there:

```
infraviz verify  /path/to/your-api

  schema ok  ·  20 verified · 0 failed · 0 judgment-only
```

Claims that fail are **shown as `unverified claim`**, never silently dropped — so
you can see when the generator asserted something your code doesn't support.

Two consequences worth the trouble:

- **Hallucinations are visible** rather than indistinguishable from real findings.
- **The docs can't rot silently.** `npx infraviz verify --strict` is a CI gate
  that fails when the diagrams drift away from the code they describe — if you
  choose to commit `.infraviz/`. Read [Security](#security) before you do: the
  output includes verbatim source snippets and a prioritised list of your
  system's weak points.

The spec also explicitly permits an agent to report **nothing**. A generator
forced to produce N findings will invent them, and one invented finding devalues
every real one beside it.

---

## Security

Read this before pointing it at a work codebase.

### Consent comes first

Connecting a repository shows a summary of how data is handled and requires an
explicit acknowledgement before anything reads your code. It is recorded per
repository in `.infraviz/consent.json`, so a different repo asks again, and the
run endpoint returns `403` until it exists.

### infraviz receives nothing

There is no service behind this tool, so there is nothing for your code to be
sent to:

| | |
|---|---|
| Network calls in the CLI | **none** — verified by inspecting the published package |
| `view` server binding | `127.0.0.1` only — not reachable from your network |
| Telemetry / analytics | none |
| Third-party dependencies | two (`zod`, `cross-spawn`) |

The npm download is the only network activity. Not a line of your code, and not a
file name, reaches the project's authors.

### Your agent is what reads your code

The analysis is produced by the coding agent you already use. It reads your files
and sends them to **its own** provider — Anthropic, OpenAI, Cursor — exactly as it
does for every other request you make of it. infraviz never sees that traffic and
adds no new recipient.

What it does change is *volume*: the spec asks the agent to follow imports out of
your routers, read your infrastructure config, and run your tests. That is more of
your repository than a typical question would touch. If your organisation
restricts which repositories may be sent to an AI provider, that restriction
applies here unchanged.

### The output is sensitive — more sensitive than your source

`.infraviz/` contains two things worth thinking about:

- **Verbatim source snippets.** Every `fingerprint` is an exact substring copied
  out of your code.
- **A prioritised map of your weak points.** Findings are file-and-line accurate
  descriptions of what breaks and how. A real example from a scan:

  ```json
  { "title": "Unsanitised device_name is joined into a path that gets rmtree'd",
    "file": "app/routers/risk.py",
    "breaks": "A device_name containing ../ escapes the per-user folder, and
               recreate_folder() then deletes that arbitrary tree." }
  ```

That is useful to you and equally useful to an attacker. Treat `.infraviz/` as at
least as confidential as the source it describes.

**Recommended default: `.gitignore` it.**

```bash
echo ".infraviz/" >> .gitignore
```

Commit it only when you have decided deliberately that a private repo is the
right home for a curated list of your own vulnerabilities. **Never** commit it to
a public repo.

### Your code goes to whichever AI vendor you use

This is inherent to using a coding agent, not to infraviz — but infraviz
**increases exposure**, because the spec asks the agent to read broadly: routers,
the modules they import, your IaC, and to run your test suite. That is more of
the codebase than a typical targeted question.

Before running it on employer-owned code:

- Confirm your company permits sending that repository to your agent's vendor
- Check whether privacy / zero-retention mode is enabled on your account
- Know that your IaC gets read too — instance sizes, service names, regions

### The agent may run your tests

The spec tells it to, because tests reveal what is actually exercised. On a work
machine that could reach real dev or staging services, write cache files, or
consume API quota. If that matters, tell the agent explicitly not to run tests.

### Suggested first run

Try it on a non-sensitive repository first, so you see the shape of the output
before pointing it at anything confidential.

---

## What you get

| Lens | Shows |
|---|---|
| **Flow** | The real call graph. Click a step, the matching hop highlights, with its code location |
| **Load / scaling** | Measured numbers when they exist — otherwise says plainly that load is *not measured* |
| **Security** | Findings anchored to the hop they affect, in severity colour |
| **Compliance** | Data handling, retention, egress |
| **Reliability** | Compounding failure across dependencies. Drag the fan-out slider and watch end-to-end success collapse |
| **Optimise** | Ranked improvements: what each costs you *today*, what you *gain*, effort, and the mechanism — each copyable as a task for your agent to implement |

The Optimise lens closes the loop: **Copy as task** turns any item into an
implementation brief — the location, the mechanism, and the specific gotcha to
avoid — that you paste straight into your agent. Or copy the whole ranked list at
once and work through it in order.

Plus a **sequence diagram** per service, auto-laid-out — including work that
continues *after* the HTTP response, which is where the interesting failure modes
usually live.

Depth is tiered on purpose. A 25-line router gets a one-line verdict, not five
lenses of padding.

---

## Packages

| Package | Purpose |
|---|---|
| [`infraviz`](packages/cli) | The CLI — `view`, `verify`, `spec`, `init` |
| [`@infraviz/schema`](packages/schema) | The artifact contract: zod schemas + the fingerprint verifier |
| [`@infraviz/spec`](packages/spec) | Portable prompts, provider-agnostic |
| [`@infraviz/viewer`](packages/viewer) | The React viewer (built into the CLI) |

`AGENTS.md` is the entry point agents read. `.cursor/rules/` wires it into Cursor.

## Status

Working today: scan → per-service sequence + topology → verify → view, driven by
any agent, validated end-to-end against a real 12-service FastAPI codebase.

Not there yet, and deliberately not faked:

- **Cost and rate-limit lenses.** The earlier prototype had these, but they were
  hardcoded to one company's AWS bill. Doing them portably needs pricing and
  quota data in the schema — until then the lenses aren't offered rather than
  showing someone else's numbers.
- **MCP server.** Under consideration rather than planned. An agent with shell
  access can already run `npx infraviz verify` and self-correct, so MCP's real
  value is narrower than it first appears: discovery (the agent sees the tools
  without being told the repo exists), reaching clients that have no shell, and
  turning "please include a fingerprint" from a request into a hard rejection.
- **Desktop app.** An Electron shell exists in prototype and isn't ported yet.

## Licence

MIT
