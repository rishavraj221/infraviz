// Cloud connectors.
//
// TWO HARD RULES, both structural rather than advisory:
//
// 1. WE NEVER TAKE CREDENTIALS. No token fields, no key prompts, nothing stored.
//    Connectors run the CLI you have *already* authenticated — `aws` with your
//    existing profile, `oc` with your existing session. A token pasted into this
//    tool would end up in a file beside your source; reusing the CLI's own
//    credential store avoids inventing a second, worse one. If you are not
//    logged in, we print the command for YOU to run. We never accept the secret.
//
// 2. READ ONLY — BY VERB, NOT BY CATALOGUE. We do not enumerate which services
//    or commands are interesting; the agent knows the project and we do not.
//    What we check is the ACTION: describe/list/get and friends pass, anything
//    that creates, modifies, scales or deletes does not. That keeps the safety
//    property without pretending to know whether this project runs on ECS, App
//    Runner, Batch or something that shipped last week.
//
//    Note this guard binds commands routed through `infraviz connect run`. An
//    agent with shell access can call the cloud CLIs directly, so treat this as
//    a safety net for the guided path, not as containment.

import spawn from "cross-spawn";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CONNECTORS = {
  aws: {
    id: "aws",
    label: "AWS",
    bin: "aws",
    install: "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
    /** how the user authenticates — we only ever tell them to run this */
    authHint: "aws configure  (or aws sso login --profile <name>)",
    /** action verbs that only read; the service is none of our business */
    readVerbs: [
      /^(describe|list|get|batch-get|head|lookup|search|query|scan|select|preview|estimate|simulate|summarize|export|generate-.*-report)\b/,
      /^(ls)$/, // `aws s3 ls` — the one high-level s3 verb that is read-only
    ],
    /** where the action sits in argv: `aws <service> <action>` */
    verbAt: 1,
    async whoami(profile) {
      const args = ["sts", "get-caller-identity", "--output", "json"];
      if (profile) args.push("--profile", profile);
      const { stdout } = await execFileAsync("aws", args, { timeout: 20000 });
      const j = JSON.parse(stdout);
      return { identity: j.Arn ?? j.UserId, account: j.Account };
    },
    async contexts() {
      try {
        const { stdout } = await execFileAsync("aws", ["configure", "list-profiles"], { timeout: 10000 });
        return stdout.trim().split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  },

  openshift: {
    id: "openshift",
    label: "OpenShift",
    bin: "oc",
    install: "https://docs.openshift.com/container-platform/latest/cli_reference/openshift_cli/getting-started-cli.html",
    authHint: "oc login <cluster-url>   — run this yourself; do not paste the token here",
    readVerbs: [/^(get|describe|status|whoami|api-resources|api-versions|top|logs|explain|version|config|auth)\b/],
    verbAt: 0,
    async whoami() {
      const { stdout } = await execFileAsync("oc", ["whoami"], { timeout: 20000 });
      const server = await execFileAsync("oc", ["whoami", "--show-server"], { timeout: 20000 }).catch(() => ({
        stdout: "",
      }));
      return { identity: stdout.trim(), account: server.stdout.trim() };
    },
    async contexts() {
      try {
        const { stdout } = await execFileAsync("oc", ["config", "get-contexts", "-o", "name"], { timeout: 10000 });
        return stdout.trim().split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  },

  kubernetes: {
    id: "kubernetes",
    label: "Kubernetes",
    bin: "kubectl",
    install: "https://kubernetes.io/docs/tasks/tools/",
    authHint: "kubectl config use-context <name>",
    readVerbs: [/^(get|describe|top|logs|explain|api-resources|api-versions|version|config|auth)\b/],
    verbAt: 0,
    async whoami() {
      const { stdout } = await execFileAsync("kubectl", ["config", "current-context"], { timeout: 20000 });
      return { identity: stdout.trim(), account: null };
    },
    async contexts() {
      try {
        const { stdout } = await execFileAsync("kubectl", ["config", "get-contexts", "-o", "name"], { timeout: 10000 });
        return stdout.trim().split("\n").filter(Boolean);
      } catch {
        return [];
      }
    },
  },
};

function onPath(bin) {
  return execFileAsync(process.platform === "win32" ? "where" : "which", [bin], { timeout: 4000 })
    .then((r) => Boolean(r.stdout.trim()))
    .catch(() => false);
}

/** Present, and already logged in? We never help with the second part. */
export async function detectConnector(c, context) {
  if (!(await onPath(c.bin))) {
    return { installed: false, authenticated: false };
  }
  try {
    const who = await c.whoami(context);
    const contexts = await c.contexts();
    return { installed: true, authenticated: true, ...who, contexts };
  } catch (e) {
    return {
      installed: true,
      authenticated: false,
      // surface the CLI's own message: it usually says exactly what is wrong
      authError: String(e.stderr ?? e.message ?? "")
        .split("\n")[0]
        .slice(0, 200),
      contexts: await c.contexts(),
    };
  }
}

export async function detectAllConnectors() {
  return Promise.all(
    Object.values(CONNECTORS).map(async (c) => ({
      id: c.id,
      label: c.label,
      bin: c.bin,
      install: c.install,
      authHint: c.authHint,
      ...(await detectConnector(c)),
    }))
  );
}

/**
 * Read-only guard. Judges the action verb and nothing else — any service, any
 * resource, as long as the verb only looks. Returns null to allow, or a reason.
 */
export function refuseReason(connectorId, argv) {
  const c = CONNECTORS[connectorId];
  if (!c) return `Unknown connector: ${connectorId}`;

  const positional = argv.filter((a) => !a.startsWith("-"));
  const line = argv.join(" ");

  // a shell metacharacter would let a permitted verb carry an arbitrary payload
  if (/[;&|`$><\n]/.test(line)) return "Shell metacharacters are not permitted in connector commands";

  const verb = positional[c.verbAt];
  if (!verb) return `Refused: no action given. Expected something like "${c.bin} <service> describe-…".`;

  // `kubectl config`/`oc config` and `auth` have both read and write forms
  if (verb === "config" || verb === "auth") {
    const sub = positional[c.verbAt + 1] ?? "";
    if (!/^(get-|current-|view$|can-i$)/.test(sub)) {
      return `Refused: "${c.bin} ${verb} ${sub}" can modify configuration. Only get-*, current-*, view and can-i are permitted.`;
    }
    return null;
  }

  if (!c.readVerbs.some((re) => re.test(verb))) {
    return (
      `Refused: "${verb}" is not a read-only action, so this command could change your infrastructure. ` +
      `Connectors only observe — use a describe/list/get form instead.`
    );
  }
  return null;
}

/** Run one read-only command. Rejects anything the allowlist does not cover. */
export function runConnector({ connectorId, argv, context, timeout = 60000 }) {
  return new Promise((resolve) => {
    const refusal = refuseReason(connectorId, argv);
    if (refusal) return resolve({ ok: false, error: refusal, refused: true });

    const c = CONNECTORS[connectorId];
    const full = [...argv];
    if (context && connectorId === "aws") full.push("--profile", context);
    if (context && connectorId !== "aws") full.push("--context", context);

    const child = spawn(c.bin, full, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => (clearTimeout(timer), resolve({ ok: false, error: e.message })));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve({ ok: false, error: err.trim().slice(0, 500) || `exit ${code}` });
      try {
        resolve({ ok: true, data: JSON.parse(out) });
      } catch {
        resolve({ ok: true, data: out.trim() });
      }
    });
  });
}
