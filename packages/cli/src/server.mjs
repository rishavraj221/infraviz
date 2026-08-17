// The local server behind `infraviz view`.
//
// Two ways to get work done, one shared source of truth:
//
//   UI-driven  → POST /api/run spawns your agent CLI, writes .infraviz/
//   IDE-driven → Cursor writes .infraviz/ directly
//
// Both write the same files, so neither needs to know about the other. The
// filesystem is the sync mechanism: this server watches .infraviz/ and pushes
// changes over SSE, so work done in your IDE shows up in an already-open page
// without a reload — and `infraviz status` lets an agent resume from wherever
// the UI left off.

import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { runAgent } from "./runner.mjs";
import { detectAll, PROVIDERS } from "./providers.mjs";

export const DIR = ".infraviz";
const KINDS = ["topology", "sequence", "optimise"];

// Consent is recorded per repository, not globally: sensitivity is a property of
// the codebase, so connecting a new repo asks again. Bump this when the terms
// materially change, and prior acceptances stop counting.
export const CONSENT_VERSION = 1;

/**
 * Consent must come from a human, so provenance is part of the record.
 *
 * Only two routes count: a click in the viewer ("ui") or a typed confirmation at
 * an interactive terminal ("tty"). A file that appears by any other means — an
 * agent writing it directly, or a copied record — is treated as NOT accepted.
 * Without this an agent simply grants consent on the user's behalf, which is
 * exactly what happened when the CLI advertised an --accept flag to it.
 */
const HUMAN_ROUTES = new Set(["ui", "tty"]);

export async function getConsent(root) {
  const f = join(root, DIR, "consent.json");
  if (!existsSync(f)) return { accepted: false };
  try {
    const c = JSON.parse(await readFile(f, "utf8"));
    if (c.version !== CONSENT_VERSION || !c.accepted) return { accepted: false, staleVersion: c.version };
    if (!HUMAN_ROUTES.has(c.via)) {
      return { accepted: false, reason: "recorded without a human confirmation — re-accepting is required" };
    }
    return { accepted: true, at: c.at, via: c.via };
  } catch {
    return { accepted: false };
  }
}

/**
 * Progress reported by an IDE-driven agent via `infraviz progress`.
 *
 * When the work happens in Cursor rather than through this server, nothing here
 * can observe it — the first sign of life would otherwise be the finished file
 * appearing minutes later. So the agent reports in, and the existing .infraviz
 * watcher turns each report into a live push for free.
 */
export async function loadProgress(root) {
  const f = join(root, DIR, "progress.json");
  if (!existsSync(f)) return null;
  try {
    const p = JSON.parse(await readFile(f, "utf8"));
    // a report older than five minutes means the agent stopped without saying so
    const stale = Date.now() - new Date(p.updatedAt ?? 0).getTime() > 5 * 60_000;
    return { ...p, stale: stale && !p.done };
  } catch {
    return null;
  }
}

export async function appendProgress(root, text, opts = {}) {
  const f = join(root, DIR, "progress.json");
  await mkdir(join(root, DIR), { recursive: true });
  let cur = { startedAt: new Date().toISOString(), steps: [] };
  if (existsSync(f)) {
    try {
      cur = JSON.parse(await readFile(f, "utf8"));
    } catch {
      /* corrupt file — start over rather than fail the agent's command */
    }
  }
  if (opts.reset) cur = { startedAt: new Date().toISOString(), steps: [] };
  cur.steps = [...(cur.steps ?? []), { at: new Date().toISOString(), text }].slice(-60);
  cur.updatedAt = new Date().toISOString();
  cur.done = Boolean(opts.done);
  cur.source = "ide";
  await writeFile(f, JSON.stringify(cur, null, 2) + "\n");
  return cur;
}

export async function loadAll(root) {
  const base = join(root, DIR);
  const project = existsSync(join(base, "project.json"))
    ? JSON.parse(await readFile(join(base, "project.json"), "utf8"))
    : null;
  const services = {};
  const svcDir = join(base, "services");
  if (existsSync(svcDir)) {
    for (const id of await readdir(svcDir)) {
      services[id] = {};
      for (const kind of KINDS) {
        const f = join(svcDir, id, `${kind}.json`);
        services[id][kind] = existsSync(f) ? JSON.parse(await readFile(f, "utf8")) : null;
      }
    }
  }
  return { project, services };
}

/** What's done and what's missing — the resume point for humans and agents alike. */
export async function status(root) {
  const { project, services } = await loadAll(root);
  const consent = await getConsent(root);
  if (!project) return { scanned: false, consent, root, services: [] };
  return {
    scanned: true,
    consent,
    root,
    name: project.name,
    generatedAt: project.generatedAt ?? null,
    services: (project.services ?? []).map((s) => {
      const a = services[s.id] ?? {};
      return {
        id: s.id,
        name: s.name,
        tier: s.tier,
        severity: s.severity,
        have: KINDS.filter((k) => a[k]),
        missing: KINDS.filter((k) => !a[k]),
      };
    }),
  };
}

/**
 * Re-check citations every time the data is read.
 *
 * Artifacts written by an IDE agent never pass through this server, so they
 * carry no verification state — which meant the trust badges only ever appeared
 * for UI-generated output, i.e. not the common path. Checking on read also keeps
 * the result honest as the code changes underneath, rather than freezing a
 * verdict from whenever the file was written.
 */
async function verifyOnRead(root, data) {
  const { verifyArtifact } = await import("@infraviz/schema/verify");
  const out = { project: null, services: {} };
  if (data.project) out.project = (await verifyArtifact(root, data.project)).artifact;
  for (const [id, arts] of Object.entries(data.services ?? {})) {
    out.services[id] = {};
    for (const [kind, art] of Object.entries(arts)) {
      out.services[id][kind] = art ? (await verifyArtifact(root, art)).artifact : null;
    }
  }
  return out;
}

export async function startServer({ root, port, onReady }) {
  const jobs = new Map();
  const sse = new Set();

  const broadcast = (ev) => {
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const res of sse) res.write(line);
  };

  // ---- watch .infraviz so IDE-side work appears in an open page
  const base = join(root, DIR);
  await mkdir(join(base, "services"), { recursive: true });
  let debounce;
  watch(base, { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => broadcast({ type: "data-changed" }), 300);
  });

  // fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." with a
  // leading slash, which is not a valid path — the viewer assets are never found.
  const viewerDist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "viewer");
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  };

  const json = (res, code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((r) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        try {
          r(JSON.parse(b || "{}"));
        } catch {
          r({});
        }
      });
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (p === "/api/data") {
      const [data, progress] = await Promise.all([loadAll(root), loadProgress(root)]);
      return json(res, 200, { ...(await verifyOnRead(root, data)), progress });
    }

    if (p === "/api/consent") {
      if (req.method === "POST") {
        const body = await readBody(req);
        if (!body.accepted) return json(res, 400, { error: "not accepted" });
        await mkdir(join(root, DIR), { recursive: true });
        const record = { version: CONSENT_VERSION, accepted: true, via: "ui", at: new Date().toISOString(), root };
        await writeFile(join(root, DIR, "consent.json"), JSON.stringify(record, null, 2) + "\n");
        return json(res, 200, { accepted: true, at: record.at });
      }
      return json(res, 200, await getConsent(root));
    }
    if (p === "/api/status") return json(res, 200, await status(root));
    if (p === "/api/providers") return json(res, 200, await detectAll());

    if (p === "/api/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write("data: {\"type\":\"hello\"}\n\n");
      sse.add(res);
      req.on("close", () => sse.delete(res));
      return;
    }

    // ---- UI-driven generation
    if (p === "/api/run" && req.method === "POST") {
      const { kind, serviceId, provider, model, effort } = await readBody(req);
      if (!["scan", "topology", "sequence", "optimise"].includes(kind)) {
        return json(res, 400, { error: "kind must be scan|topology|sequence|optimise" });
      }
      const consent = await getConsent(root);
      if (!consent.accepted) {
        return json(res, 403, {
          error: "Not permitted yet — this repository has not been acknowledged for analysis.",
        });
      }
      const detected = (await detectAll()).filter((d) => d.installed);
      if (!detected.length) {
        return json(res, 400, {
          error: "No agent CLI found on PATH. Install Claude Code, Codex or Cursor CLI — or generate from your IDE instead.",
        });
      }
      const providerId = provider && PROVIDERS[provider] ? provider : detected[0].id;

      const jobId = randomUUID();
      jobs.set(jobId, { id: jobId, status: "running", events: [] });
      json(res, 200, { jobId });
      runJob({ jobId, kind, serviceId, providerId, model, effort }).catch((e) =>
        finish(jobId, { status: "error", error: String(e?.message ?? e) })
      );
      return;
    }

    if (p.startsWith("/api/jobs/")) {
      const job = jobs.get(p.split("/")[3]);
      return job ? json(res, 200, job) : json(res, 404, { error: "no such job" });
    }

    // ---- static viewer
    //
    // Resolve then compare with relative(), rather than a startsWith() prefix
    // check: on Windows a decoded backslash in the URL can traverse out of the
    // asset directory in ways a string prefix test does not catch.
    let file = resolve(viewerDist, "." + decodeURIComponent(p === "/" ? "/index.html" : p));
    const rel = relative(viewerDist, file);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(file)) file = join(viewerDist, "index.html");
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream" });
    res.end(await readFile(file));
  });

  function push(jobId, ev) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.events.push(ev);
    if (job.events.length > 300) job.events.splice(0, job.events.length - 300);
    // NB: do not wrap in a `type` field — ev.type is meaningful ("tool",
    // "thinking", "status") and a spread would clobber it. jobId is the
    // discriminator instead.
    broadcast({ ...ev, jobId });
  }
  function finish(jobId, patch) {
    const job = jobs.get(jobId);
    if (!job) return;
    Object.assign(job, patch);
    broadcast({ ...patch, jobId, done: true });
    broadcast({ type: "data-changed" });
  }

  async function runJob({ jobId, kind, serviceId, providerId, model, effort }) {
    const spec = await import("@infraviz/spec");
    const { validate } = await import("@infraviz/schema");
    const { verifyArtifact } = await import("@infraviz/schema/verify");

    let prompt;
    let service;
    if (kind === "scan") {
      prompt = spec.scanPrompt();
    } else {
      const { project } = await loadAll(root);
      service = (project?.services ?? []).find((s) => s.id === serviceId);
      if (!service) return finish(jobId, { status: "error", error: `Unknown service: ${serviceId}` });
      prompt =
        kind === "topology"
          ? spec.topologyPrompt(service)
          : kind === "sequence"
            ? spec.sequencePrompt(service)
            : spec.optimisePrompt(service);
    }
    // the agent returns JSON to us; we do the writing and verifying
    prompt += `\n\nIMPORTANT: do not write any files. Return the JSON object as your final message.`;

    push(jobId, { type: "status", text: `Running ${kind}${service ? ` for ${service.name}` : ""} via ${providerId}` });
    const r = await runAgent({ providerId, model, effort, cwd: root, prompt, onEvent: (ev) => push(jobId, ev) });
    if (!r.ok) return finish(jobId, { status: "error", error: r.error });

    const schemaKind = kind === "scan" ? "project" : kind;
    const payload = r.json;
    payload.schemaVersion = 1;
    const v = validate(schemaKind, payload);
    if (!v.ok) {
      push(jobId, { type: "status", text: `Schema problems: ${v.errors.slice(0, 4).join("; ")}` });
    }

    const { artifact, stats } = await verifyArtifact(root, payload);
    artifact._meta = { generatedAt: new Date().toISOString(), provider: providerId, model: r.model, ...stats };

    if (kind === "scan") {
      // mkdir here, not only at startup — the directory can be removed while the
      // server is running, and a lost result after a paid model run is inexcusable
      await mkdir(base, { recursive: true });
      await writeFile(join(base, "project.json"), JSON.stringify(artifact, null, 2) + "\n");
    } else {
      const d = join(base, "services", serviceId);
      await mkdir(d, { recursive: true });
      await writeFile(join(d, `${kind}.json`), JSON.stringify(artifact, null, 2) + "\n");
    }

    push(jobId, {
      type: "status",
      text: `Done · ${stats.verified} verified, ${stats.failed} failed${v.ok ? "" : " · schema warnings"}`,
    });
    finish(jobId, { status: "done" });
  }

  return new Promise((res2, rej) => {
    const onErr = (err) => {
      if (err.code === "EADDRINUSE" && port !== 0) {
        server.removeListener("error", onErr);
        return startServer({ root, port: 0, onReady }).then(res2, rej);
      }
      rej(err);
    };
    server.once("error", onErr);
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      onReady?.(actual);
      res2({ server, port: actual });
    });
  });
}
