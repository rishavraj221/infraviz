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
import { join, resolve, dirname } from "node:path";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { runAgent } from "./runner.mjs";
import { detectAll, PROVIDERS } from "./providers.mjs";

export const DIR = ".infraviz";
const KINDS = ["topology", "sequence", "optimise"];

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
  if (!project) return { scanned: false, services: [] };
  return {
    scanned: true,
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

  const viewerDist = resolve(dirname(new URL(import.meta.url).pathname), "..", "viewer");
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

    if (p === "/api/data") return json(res, 200, await loadAll(root));
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
    let file = join(viewerDist, p === "/" ? "/index.html" : p);
    if (!file.startsWith(viewerDist) || !existsSync(file)) file = join(viewerDist, "index.html");
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": mime[ext] ?? "application/octet-stream" });
    res.end(await readFile(file));
  });

  function push(jobId, ev) {
    const job = jobs.get(jobId);
    if (!job) return;
    job.events.push(ev);
    if (job.events.length > 300) job.events.splice(0, job.events.length - 300);
    broadcast({ type: "job", jobId, ...ev });
  }
  function finish(jobId, patch) {
    const job = jobs.get(jobId);
    if (!job) return;
    Object.assign(job, patch);
    broadcast({ type: "job", jobId, ...patch, done: true });
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
