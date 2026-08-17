#!/usr/bin/env node
// infraviz — view, verify and scaffold architecture artifacts.
//
// Designed so the whole loop works with no install: an agent writes JSON into
// .infraviz/, `npx infraviz verify` checks the citations, `npx infraviz view`
// renders it. Nothing here talks to a network service.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
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

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

async function loadAll(root) {
  const base = join(root, DIR);
  if (!existsSync(join(base, "project.json"))) return null;
  const project = JSON.parse(await readFile(join(base, "project.json"), "utf8"));
  const services = {};
  const svcDir = join(base, "services");
  if (existsSync(svcDir)) {
    for (const id of await readdir(svcDir)) {
      services[id] = {};
      for (const kind of ["topology", "sequence", "optimise"]) {
        const f = join(svcDir, id, `${kind}.json`);
        services[id][kind] = existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null;
      }
    }
  }
  return { project, services };
}

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
  const data = await loadAll(cwd);
  if (!data) {
    console.error(c.red(`No ${DIR}/project.json found in ${cwd}`));
    console.error(c.dim("Nothing to view yet. Generate artifacts first — see: npx infraviz spec"));
    process.exit(1);
  }

  const dist = resolve(here, "..", "viewer");
  if (!existsSync(join(dist, "index.html"))) {
    console.error(c.red("Viewer assets are missing from this install."));
    process.exit(1);
  }

  const port = Number(flag("port", 4173));
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/data") {
      // re-read on every request so regenerating shows up on refresh
      const fresh = await loadAll(cwd);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(fresh ?? {}));
    }
    let p = url.pathname === "/" ? "/index.html" : url.pathname;
    let file = join(dist, p);
    if (!file.startsWith(dist) || !existsSync(file)) file = join(dist, "index.html"); // SPA fallback
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream" });
    res.end(await readFile(file));
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    const n = data.project.services?.length ?? 0;
    console.log(`\n${c.bold("infraviz")}  ${c.dim(data.project.name ?? cwd)}`);
    console.log(`${n} service${n === 1 ? "" : "s"}  ·  ${c.cyan(url)}\n`);
    if (!args.includes("--no-open")) {
      const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      spawn(open, [url], { stdio: "ignore", detached: true }).unref();
    }
  });
}

// ------------------------------------------------------------------ init / spec

async function cmdInit() {
  const base = join(cwd, DIR);
  await mkdir(join(base, "services"), { recursive: true });
  const f = join(base, "project.json");
  if (!existsSync(f)) {
    await writeFile(
      f,
      JSON.stringify({ schemaVersion: 1, name: cwd.split("/").pop(), services: [], platformFindings: [] }, null, 2) + "\n"
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

async function cmdSpec() {
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
  ${c.cyan("npx infraviz verify")}      validate schemas and re-check every citation
  ${c.cyan("npx infraviz spec")}        print the workflow and prompts for your agent
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

const commands = { view: cmdView, verify: cmdVerify, init: cmdInit, spec: cmdSpec, help, "--help": help, "-h": help };
await (commands[cmd] ?? (() => { console.error(c.red(`Unknown command: ${cmd}`)); help(); process.exit(1); }))();
