# infraviz

Visualise your API's real architecture — request flow, load, and risk — generated
by whatever coding agent you already use, with **every claim cited and verified
against your source**.

No account. No app to install. No data leaves your machine.

---

## Use it from your AI IDE

In Cursor, Claude Code, Codex — anywhere with a coding agent:

> Visualise the system design of this API. Follow the spec at
> `github.com/<you>/infraviz` — run `npx infraviz spec` for the exact format.

The agent reads your code, writes JSON into `.infraviz/`, and you run:

```bash
npx infraviz view
```

That's the whole loop. The agent doing the work is the one you already have, so
there's nothing to install and no second model to pay for.

## Or drive it yourself

```bash
npx infraviz spec       # the workflow and prompts, to paste into any agent
npx infraviz verify     # validate schemas and re-check every citation
npx infraviz view       # render .infraviz/ in your browser
npx infraviz init       # create .infraviz/
```

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
- **The docs can't rot silently.** `.infraviz/` is designed to be committed, and
  `npx infraviz verify --strict` is a CI gate that fails when the diagrams drift
  away from the code they describe.

The spec also explicitly permits an agent to report **nothing**. A generator
forced to produce N findings will invent them, and one invented finding devalues
every real one beside it.

---

## What you get

| Lens | Shows |
|---|---|
| **Flow** | The real call graph. Click a step, the matching hop highlights, with its code location |
| **Load / scaling** | Measured numbers when they exist — otherwise says plainly that load is *not measured* |
| **Security** | Findings anchored to the hop they affect, in severity colour |
| **Compliance** | Data handling, retention, egress |
| **Reliability** | Compounding failure across dependencies. Drag the fan-out slider and watch end-to-end success collapse |

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
- **MCP server.** Planned next: it turns the validation loop into something the
  agent self-corrects against, instead of relying on it to follow prose.
- **Desktop app.** An Electron shell exists in prototype and isn't ported yet.

## Licence

MIT
