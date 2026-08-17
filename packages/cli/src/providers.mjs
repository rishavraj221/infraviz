// Agent CLI adapters.
//
// Each provider normalises three things: how to build a non-interactive
// invocation, how to read its event stream, and where the final text lives.
// Everything above this layer is provider-agnostic.
//
// TESTED STATUS — stated honestly, because a wrong flag fails at runtime:
//   claude  VERIFIED end-to-end on this machine (scan + generate both ran).
//   codex   UNTESTED. Flags from OpenAI's published CLI reference.
//   cursor  UNTESTED. Flags from Cursor's published CLI docs.
// The UI surfaces this so nobody is surprised by a provider that needs a tweak.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import spawn from "cross-spawn";

const execFileAsync = promisify(execFile);

/** Version probe that survives Windows .cmd shims. */
function probeVersion(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill(), 8000);
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.on("error", () => (clearTimeout(timer), resolve(null)));
    child.on("close", () => (clearTimeout(timer), resolve(out.trim().split("\n")[0] || null)));
  });
}

/** Common tool policy expressed per-provider in each adapter's own vocabulary. */
const CLAUDE_TOOLS = ["Read", "Grep", "Glob", "Bash", "Task", "TodoWrite", "WebSearch", "WebFetch"];
const CLAUDE_DENY = ["Edit", "Write", "NotebookEdit"];

export const PROVIDERS = {
  claude: {
    id: "claude",
    label: "Claude Code",
    bin: "claude",
    tested: true,
    docs: "https://docs.claude.com/en/docs/claude-code",
    install: "npm i -g @anthropic-ai/claude-code",
    note: "Separate from the Claude desktop app.",
    defaultModel: "claude-opus-5",
    models: [
      { id: "claude-opus-5", label: "Opus 5", hint: "deepest reasoning" },
      { id: "claude-sonnet-5", label: "Sonnet 5", hint: "balanced" },
      { id: "claude-fable-5", label: "Fable 5" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", hint: "fastest, cheapest" },
    ],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",

    buildArgs({ prompt, model, effort, cwd, mcpConfigPath, mcpAllow = [] }) {
      return [
        "-p",
        prompt,
        "--model",
        model,
        ...(effort ? ["--effort", effort] : []),
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-mode",
        "dontAsk",
        "--allowed-tools",
        [...CLAUDE_TOOLS, ...mcpAllow].join(","),
        "--disallowed-tools",
        CLAUDE_DENY.join(","),
        "--add-dir",
        cwd,
        ...(mcpConfigPath ? ["--mcp-config", mcpConfigPath, "--strict-mcp-config"] : []),
      ];
    },

    parseLine(ev) {
      if (ev.type === "assistant" && ev.message?.content) {
        return ev.message.content
          .map((b) => {
            if (b.type === "text" && b.text?.trim()) return { type: "thinking", text: b.text.slice(0, 400) };
            if (b.type === "tool_use") {
              const i = b.input ?? {};
              const target = i.file_path || i.pattern || i.path || i.command || i.query || i.url || i.description || "";
              return { type: "tool", tool: b.name, text: String(target).slice(0, 160) };
            }
            return null;
          })
          .filter(Boolean);
      }
      if (ev.type === "result") {
        return [{ _final: ev.result ?? "", _cost: ev.total_cost_usd, _duration: ev.duration_ms }];
      }
      return [];
    },
  },

  codex: {
    id: "codex",
    label: "OpenAI Codex",
    bin: "codex",
    tested: false,
    docs: "https://developers.openai.com/codex/cli",
    install: "npm i -g @openai/codex",
    note: "Separate from the ChatGPT app.",
    defaultModel: "gpt-5.6-terra",
    models: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", hint: "flagship, complex tasks" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", hint: "balanced everyday" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", hint: "fast, affordable" },
      { id: "gpt-5.5", label: "GPT-5.5", hint: "previous generation" },
    ],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "medium",

    buildArgs({ prompt, model, effort, cwd }) {
      return [
        "exec",
        prompt,
        "--model",
        model,
        "--json",
        // parity with the Claude policy: may run tests and write within the
        // workspace, never prompts for approval in a headless run
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "never",
        "--cd",
        cwd,
        ...(effort ? ["-c", `model_reasoning_effort=${effort}`] : []),
      ];
    },

    // --json emits newline-delimited events; shapes vary by version, so match
    // defensively rather than assuming one schema.
    parseLine(ev) {
      const out = [];
      const msg = ev.msg ?? ev;
      const t = msg.type ?? ev.type;
      if (t === "agent_message" || t === "assistant_message") {
        const text = msg.message ?? msg.text ?? "";
        if (text) out.push({ type: "thinking", text: String(text).slice(0, 400) });
      } else if (t === "exec_command_begin" || t === "command_start") {
        out.push({ type: "tool", tool: "Bash", text: String(msg.command ?? "").slice(0, 160) });
      } else if (t === "patch_apply_begin" || t === "file_change") {
        out.push({ type: "tool", tool: "Edit", text: String(msg.path ?? "").slice(0, 160) });
      } else if (t === "task_complete" || t === "turn_complete" || t === "result") {
        out.push({ _final: msg.last_agent_message ?? msg.result ?? msg.message ?? "" });
      }
      return out;
    },
  },

  cursor: {
    id: "cursor",
    label: "Cursor CLI",
    bin: "cursor-agent",
    tested: false,
    docs: "https://cursor.com/docs/cli/headless",
    install: "curl https://cursor.com/install -fsS | bash",
    note: "The CLI is a separate install from the Cursor editor — having the editor does not put `cursor-agent` on your PATH.",
    defaultModel: "auto",
    models: [
      { id: "auto", label: "Auto", hint: "let Cursor choose" },
      { id: "claude-opus-5", label: "Opus 5" },
      { id: "claude-sonnet-5", label: "Sonnet 5" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
    ],
    efforts: [],
    defaultEffort: null,

    buildArgs({ prompt, model, cwd }) {
      return [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        ...(model && model !== "auto" ? ["--model", model] : []),
        "--workspace",
        cwd,
      ];
    },

    parseLine(ev) {
      const out = [];
      if (ev.type === "assistant" && ev.message?.content) {
        for (const b of ev.message.content) {
          if (b.text?.trim()) out.push({ type: "thinking", text: b.text.slice(0, 400) });
        }
      } else if (ev.type === "tool_call") {
        out.push({ type: "tool", tool: ev.name ?? ev.tool ?? "tool", text: String(ev.subtype ?? "").slice(0, 160) });
      } else if (ev.type === "result") {
        out.push({ _final: ev.result ?? "", _duration: ev.duration_ms });
      }
      return out;
    },
  },
};

/** Is the binary on PATH, and what version? */
export async function detectProvider(p) {
  // No shell: passing args through a shell is both a deprecation warning and an
  // injection surface. `which`/`where` exit non-zero when the binary is absent.
  try {
    const { stdout } = await execFileAsync(process.platform === "win32" ? "where" : "which", [p.bin], { timeout: 4000 });
    if (!stdout.trim()) return { installed: false };
  } catch {
    return { installed: false };
  }
  const version = await probeVersion(p.bin);
  return { installed: true, version };
}

export async function detectAll() {
  const entries = await Promise.all(
    Object.values(PROVIDERS).map(async (p) => {
      const d = await detectProvider(p);
      return {
        id: p.id,
        label: p.label,
        bin: p.bin,
        tested: p.tested,
        docs: p.docs,
        install: p.install,
        note: p.note,
        models: p.models,
        efforts: p.efforts,
        defaultModel: p.defaultModel,
        defaultEffort: p.defaultEffort,
        ...d,
      };
    })
  );
  return entries;
}
