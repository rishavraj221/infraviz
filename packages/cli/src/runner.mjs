// Provider-agnostic agent runner. Spawns whichever CLI the project selected,
// normalises its event stream, and returns parsed JSON.
//
// NOT a sandbox: every provider is configured to allow shell execution so the
// analyzer can run the project's tests. See capabilities.mjs.

// cross-spawn, not node:child_process — on Windows the agent CLIs are installed
// as .cmd shims, which bare spawn() cannot execute (ENOENT). Using shell:true
// instead would mean hand-escaping an arbitrary prompt into a command line, so
// this is both the correct and the safer fix.
import spawn from "cross-spawn";
import { PROVIDERS } from "./providers.mjs";

export async function runAgent({ providerId = "claude", model, effort, cwd, prompt, onEvent, signal, mcpConfigPath }) {
  const provider = PROVIDERS[providerId];
  if (!provider) return { ok: false, raw: "", error: `Unknown provider: ${providerId}` };

  const chosenModel = model || provider.defaultModel;
  const chosenEffort = provider.efforts?.length ? effort || provider.defaultEffort : null;

  const mcpAllow = [];
  const args = provider.buildArgs({ prompt, model: chosenModel, effort: chosenEffort, cwd, mcpConfigPath, mcpAllow });

  return new Promise((resolve) => {
    const child = spawn(provider.bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let buf = "";
    let stderr = "";
    let final = "";
    let costUsd;
    let durationMs;
    let sawJsonLine = false;

    signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue; // non-JSON chatter (banners, warnings)
        }
        sawJsonLine = true;
        for (const e of provider.parseLine(ev) ?? []) {
          if (e._final !== undefined) {
            if (e._final) final = e._final;
            if (e._cost !== undefined) costUsd = e._cost;
            if (e._duration !== undefined) durationMs = e._duration;
          } else {
            onEvent?.(e);
          }
        }
      }
    });

    child.stderr.on("data", (c) => (stderr += c.toString()));

    child.on("error", (err) =>
      resolve({
        ok: false,
        raw: "",
        error:
          err.code === "ENOENT"
            ? `'${provider.bin}' is not installed or not on PATH. Install ${provider.label} and reopen the app.`
            : `Could not start ${provider.bin}: ${err.message}`,
      })
    );

    child.on("close", (code) => {
      // last resort: some providers print the final message as plain text
      const text = final || (!sawJsonLine ? buf.trim() : "");
      if (code !== 0 && !text) {
        return resolve({ ok: false, raw: stderr, error: stderr.trim().slice(0, 600) || `${provider.bin} exited with code ${code}` });
      }
      const json = extractJson(text);
      if (!json) {
        return resolve({
          ok: false,
          raw: text || stderr,
          error: `${provider.label} did not return parseable JSON.`,
          costUsd,
          durationMs,
        });
      }
      resolve({ ok: true, json, raw: text, costUsd, durationMs, model: chosenModel, effort: chosenEffort });
    });
  });
}

/** Models like to wrap JSON in prose or fences — dig it out rather than failing. */
export function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  for (const c of [fence?.[1], text]) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim());
    } catch {
      /* fall through */
    }
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(c.slice(start, end + 1));
      } catch {
        /* keep trying */
      }
    }
  }
  return null;
}
