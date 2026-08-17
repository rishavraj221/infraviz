#!/usr/bin/env node
// infraviz — view, verify and scaffold architecture artifacts.
//
// Designed so the whole loop works with no install: an agent writes JSON into
// .infraviz/, `npx infraviz verify` checks the citations, `npx infraviz view`
// renders it. Nothing here talks to a network service.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const DIR = ".infraviz";

const args = process.argv.slice(2);
const cmd = args[0] ?? "help";
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : dflt;
};

/** `start` is a cmd.exe builtin rather than an executable, so it cannot be spawned directly. */
function openBrowser(url) {
  const opts = { stdio: "ignore", detached: true };
  const child =
    process.platform === "darwin"
      ? spawn("open", [url], opts)
      : process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], opts)
        : spawn("xdg-open", [url], opts);
  child.on("error", () => {}); // no browser available is not worth failing over
  child.unref();
}

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const { loadAll } = await import("../src/server.mjs");

// ------------------------------------------------------------------ verify

async function cmdVerify() {
  const { validate } = await import("@infraviz/schema");
  const { verifyArtifact, summarize } = await import("@infraviz/schema/verify");

  const data = await loadAll(cwd);
  if (!data) {
    console.error(c.red(`No ${DIR}/project.json found in ${cwd}`));
    console.error(c.dim(`Run an agent over this repo first — see: npx infraviz spec`));
    process.exit(1);
  }

  let problems = 0;
  const report = (label, res) => {
    if (res.ok) return;
    problems += res.errors.length;
    console.log(c.red(`  ✗ ${label}`));
    for (const e of res.errors) console.log(`      ${e}`);
  };

  console.log(c.bold(`\ninfraviz verify  ${c.dim(cwd)}\n`));
  report("project.json", validate("project", data.project));
  for (const [id, a] of Object.entries(data.services)) {
    if (a.topology) report(`services/${id}/topology.json`, validate("topology", a.topology));
    if (a.sequence) report(`services/${id}/sequence.json`, validate("sequence", a.sequence));
    if (a.optimise) report(`services/${id}/optimise.json`, validate("optimise", a.optimise));
  }

  // fingerprints: the part that catches drift and invention
  const total = { verified: 0, failed: 0, unverifiable: 0 };
  const failures = [];
  const check = async (label, artifact) => {
    const { artifact: out, stats } = await verifyArtifact(cwd, artifact);
    for (const k of Object.keys(total)) total[k] += stats[k];
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === "object") {
        if (n.verification === "failed") failures.push(`${label}: ${n.title ?? n.name ?? "claim"} — ${n.verificationNote}`);
        Object.values(n).forEach(walk);
      }
    };
    walk(out);
  };

  await check("project.json", data.project);
  for (const [id, a] of Object.entries(data.services)) {
    if (a.topology) await check(`services/${id}`, a.topology);
    if (a.sequence) await check(`services/${id}`, a.sequence);
    if (a.optimise) await check(`services/${id}`, a.optimise);
  }

  if (failures.length) {
    console.log(c.yellow(`\n  Claims that do not match the code:\n`));
    for (const f of failures) console.log(`    ${c.yellow("!")} ${f}`);
  }

  const schemaLine = problems === 0 ? c.green("schema ok") : c.red(`${problems} schema problem(s)`);
  console.log(`\n  ${schemaLine}  ·  ${summarize(total)}\n`);

  const strict = args.includes("--strict");
  if (strict && (problems || total.failed)) process.exit(1);
}

// ------------------------------------------------------------------ view

async function cmdView() {
  const { startServer } = await import("../src/server.mjs");
  const port = Number(flag("port", 4173));
  // Deliberately does NOT require .infraviz to exist — starting from an empty
  // viewer and driving the first scan from the UI is a supported entry point.
  const { port: actual } = await startServer({ root: cwd, port });
  const url = `http://127.0.0.1:${actual}`;
  const data = await loadAll(cwd);
  const n = data?.project?.services?.length ?? 0;

  console.log(`\n${c.bold("infraviz")}  ${c.dim(data?.project?.name ?? cwd)}`);
  console.log(n ? `${n} service${n === 1 ? "" : "s"}  ·  ${c.cyan(url)}\n` : `${c.dim("nothing scanned yet")}  ·  ${c.cyan(url)}\n`);
  if (!args.includes("--no-open")) {
    const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    spawn(open, [url], { stdio: "ignore", detached: true }).unref();
  }
}

// ------------------------------------------------------------------ status

async function cmdStatus() {
  const { status } = await import("../src/server.mjs");
  const st = await status(cwd);
  if (!st.scanned) {
    console.log(`\n${c.dim(cwd)}`);
    console.log(`  not scanned yet — run the scan step, or ${c.cyan("npx infraviz view")} and start from the UI\n`);
    return;
  }
  console.log(`\n${c.bold(st.name ?? cwd)}  ${c.dim(st.generatedAt ?? "")}`);
  console.log(`  ${st.services.length} service(s)\n`);
  const done = st.services.filter((s) => !s.missing.length).length;
  for (const s of st.services) {
    const marks = ["sequence", "topology", "optimise"]
      .map((k) => (s.have.includes(k) ? c.green("●") : c.dim("○")))
      .join(" ");
    console.log(`  ${marks}  ${s.name}${s.missing.length ? c.dim(`  missing: ${s.missing.join(", ")}`) : ""}`);
  }
  console.log(`\n  ${c.dim("● sequence  ● topology  ● optimise")}`);
  console.log(`  ${done}/${st.services.length} fully generated\n`);
}

// ------------------------------------------------------------------ init / spec

async function cmdInit() {
  const base = join(cwd, DIR);
  await mkdir(join(base, "services"), { recursive: true });
  const f = join(base, "project.json");
  if (!existsSync(f)) {
    await writeFile(
      f,
      JSON.stringify({ schemaVersion: 1, name: basename(cwd), services: [], platformFindings: [] }, null, 2) + "\n"
    );
  }
  console.log(`${c.green("✓")} created ${DIR}/`);

  // Safe default, applied rather than merely suggested: the artifacts contain
  // source snippets and a ranked list of weak points. Opting in to committing
  // them should be a deliberate act.
  const gi = join(cwd, ".gitignore");
  let ignored = false;
  try {
    const cur = existsSync(gi) ? await readFile(gi, "utf8") : "";
    if (!cur.split("\n").some((l) => l.trim() === `${DIR}/` || l.trim() === DIR)) {
      await writeFile(gi, (cur && !cur.endsWith("\n") ? cur + "\n" : cur) + `${DIR}/\n`);
    }
    ignored = true;
  } catch {
    /* no write access — fall through to the advisory note */
  }

  if (ignored) {
    console.log(c.dim(`  added ${DIR}/ to .gitignore`));
  }
  console.log(
    c.yellow("  Note: ") +
      `${DIR}/ will hold verbatim source snippets and a ranked list of your\n` +
      `  system's weak points.${ignored ? " Remove the .gitignore line only if you" : " Gitignore it unless you"}\n` +
      "  deliberately want that in version control. Never in a public repo."
  );
  console.log(c.dim("\nNext: point your coding agent at this repo and ask it to follow `npx infraviz spec`."));
}

const CONSENT_NOTICE = `Before I analyse this repository:

- infraviz itself receives nothing. It is software running on your machine, with
  no servers and no telemetry. It writes only to .infraviz/ in this repo.
- I am the one that reads your code, and I send what I read to my own provider —
  the same one handling this conversation. That is the relationship you already
  have with me; infraviz adds no new recipient. It does mean I will read more
  files than a normal question would: your routers, the modules they import, your
  infrastructure config, and your tests.
- The output contains verbatim snippets of your code and a ranked list of weak
  points, so treat .infraviz/ as confidential. It is gitignored by default.
- I may run your test suite to check my conclusions. Tell me not to if your tests
  reach real services.

May I go ahead?`;

async function requireConsent(action) {
  const { getConsent } = await import("../src/server.mjs");
  const con = await getConsent(cwd);
  if (con.accepted) return true;

  console.error(c.yellow(`\nConsent has not been recorded for this repository, so ${action} is unavailable.\n`));
  console.error("If you are an agent: show the user the following, wait for a clear yes,");
  console.error(`then run ${c.cyan("npx infraviz consent --accept")}. Do not read their code before that.\n`);
  console.error(c.dim("─".repeat(70)));
  console.error(CONSENT_NOTICE);
  console.error(c.dim("─".repeat(70)));
  console.error(`\nOr have the user accept in the UI: ${c.cyan("npx infraviz view")}\n`);
  process.exit(2);
}

async function cmdConsent() {
  const { getConsent, CONSENT_VERSION, DIR: D } = await import("../src/server.mjs");
  if (args.includes("--status")) {
    const con = await getConsent(cwd);
    console.log(con.accepted ? c.green(`accepted ${con.at}`) : c.yellow("not accepted"));
    return;
  }
  if (!args.includes("--accept")) {
    console.log(`\n${CONSENT_NOTICE}\n`);
    console.log(`To record acceptance: ${c.cyan("npx infraviz consent --accept")}`);
    console.log(c.dim("Only the person whose code this is should run that.\n"));
    return;
  }
  await mkdir(join(cwd, D), { recursive: true });
  const rec = { version: CONSENT_VERSION, accepted: true, at: new Date().toISOString(), root: cwd };
  await writeFile(join(cwd, D, "consent.json"), JSON.stringify(rec, null, 2) + "\n");
  console.log(`${c.green("✓")} recorded for ${c.dim(cwd)}`);
}

async function cmdDoctor() {
  const { detectAll } = await import("../src/providers.mjs");
  const { getConsent } = await import("../src/server.mjs");

  console.log(`\n${c.bold("infraviz doctor")}\n`);
  console.log(`  node       ${process.version}`);
  console.log(`  platform   ${process.platform} ${process.arch}`);
  console.log(`  cwd        ${cwd}`);

  const con = await getConsent(cwd);
  console.log(`  consent    ${con.accepted ? c.green("accepted " + con.at) : c.yellow("not accepted")}`);

  console.log(`\n  ${c.bold("Agent CLIs")}`);
  const found = await detectAll();
  for (const p of found) {
    const mark = p.installed ? c.green("✓") : c.dim("✗");
    console.log(`    ${mark} ${p.bin.padEnd(14)} ${p.installed ? p.version ?? "(found)" : c.dim("not on PATH")}`);
    if (!p.installed && p.install) console.log(`        ${c.cyan(p.install)}`);
    if (!p.installed && p.note) console.log(`        ${c.dim(p.note)}`);
  }

  if (!found.some((p) => p.installed)) {
    // The most common cause of "Scan codebase is disabled": PATH here is not the
    // PATH the CLI was installed into, or the editor is installed but not its CLI.
    console.log(`\n  ${c.yellow("No agent CLI found.")} The UI's "Run it here" option needs one.`);
    console.log(`  You can still use your IDE — that path needs nothing installed.\n`);
    console.log(`  ${c.bold("PATH as this process sees it:")}`);
    for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").filter(Boolean)) {
      console.log(`    ${c.dim(dir)}`);
    }
    console.log(
      `\n  If you installed one of the above, it is not in the list — open a new` +
        `\n  terminal, or check where your package manager puts global binaries.\n`
    );
  } else {
    console.log("");
  }
}

async function cmdSpec() {
  await requireConsent("the spec");
  const spec = await import("@infraviz/spec");
  const which = args[1];
  if (which === "scan") return console.log(spec.scanPrompt());
  if (which === "topology") return console.log(spec.topologyPrompt({ name: "<service>", router: "<path>" }));
  if (which === "sequence") return console.log(spec.sequencePrompt({ name: "<service>", router: "<path>" }));
  if (which === "optimise") return console.log(spec.optimisePrompt({ name: "<service>", router: "<path>" }));
  console.log(`infraviz workflow\n\n${spec.WORKFLOW}\n`);
  console.log(
    `Prompts:\n  npx infraviz spec scan\n  npx infraviz spec topology\n  npx infraviz spec sequence\n  npx infraviz spec optimise\n`
  );
  console.log(spec.RULES);
}

function help() {
  console.log(`
${c.bold("infraviz")} — visualise your API's architecture, with every claim cited

  ${c.cyan("npx infraviz view")}        render ${DIR}/ in the browser
  ${c.cyan("npx infraviz status")}      what is generated and what is missing
  ${c.cyan("npx infraviz verify")}      validate schemas and re-check every citation
  ${c.cyan("npx infraviz doctor")}      check environment and detected agent CLIs
  ${c.cyan("npx infraviz consent")}     review and record consent for this repo
  ${c.cyan("npx infraviz spec")}        print the workflow and prompts (needs consent)
  ${c.cyan("npx infraviz init")}        create ${DIR}/

Options
  --port <n>    view: port to serve on (default 4173)
  --no-open     view: don't open a browser
  --strict      verify: exit non-zero on any problem (use in CI)

Artifacts live in ${DIR}/ inside your repo. They contain source snippets and
security findings — gitignore by default, and see the Security section of the
README before committing them anywhere.
`);
}

const commands = {
  view: cmdView,
  verify: cmdVerify,
  status: cmdStatus,
  consent: cmdConsent,
  doctor: cmdDoctor,
  init: cmdInit,
  spec: cmdSpec,
  help,
  "--help": help,
  "-h": help,
};
await (commands[cmd] ?? (() => { console.error(c.red(`Unknown command: ${cmd}`)); help(); process.exit(1); }))();
