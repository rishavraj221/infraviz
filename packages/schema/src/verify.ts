// Fingerprint verification.
//
// A generated finding is a CLAIM until the substring it cites is found in the
// real file. This is what stops a plausible-sounding hallucination from being
// indistinguishable from a real finding — and what makes the whole artifact set
// safe to commit and trust later.
//
// Failed claims are marked, never silently dropped: the reader should be able to
// see that the generator asserted something the code does not support.

import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

export interface Claim {
  file?: string;
  fingerprint?: string;
  line?: number;
  verification?: "verified" | "failed" | "unverifiable";
  verificationNote?: string;
  [k: string]: unknown;
}

export interface VerifyStats {
  verified: number;
  failed: number;
  unverifiable: number;
}

async function verifyClaim(root: string, claim: Claim): Promise<Claim> {
  if (!claim.file || !claim.fingerprint) {
    // judgment with no citation offered — legitimate, but weaker
    return { ...claim, verification: "unverifiable" };
  }

  // a generated path must never escape the project root
  const abs = resolve(root, claim.file);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { ...claim, verification: "failed", verificationNote: "cited path is outside the project" };
  }

  let content: string;
  try {
    content = await readFile(abs, "utf8");
  } catch {
    return { ...claim, verification: "failed", verificationNote: `file not found: ${claim.file}` };
  }

  if (!content.includes(claim.fingerprint)) {
    return {
      ...claim,
      verification: "failed",
      verificationNote: `fingerprint ${JSON.stringify(claim.fingerprint)} is not present in ${claim.file}`,
    };
  }

  const line = content.split("\n").findIndex((l) => l.includes(claim.fingerprint!)) + 1;
  return { ...claim, verification: "verified", line };
}

/** Deep-walk any artifact, verifying every object that carries a fingerprint. */
export async function verifyArtifact<T>(root: string, artifact: T): Promise<{ artifact: T; stats: VerifyStats }> {
  const pending: Promise<void>[] = [];
  const stats: VerifyStats = { verified: 0, failed: 0, unverifiable: 0 };

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
      // a claim is anything offering a fingerprint, or a finding-shaped object
      const isClaim = "fingerprint" in obj || ("breaks" in obj && "fix" in obj);
      if (isClaim) {
        pending.push(
          verifyClaim(root, out as Claim).then((res) => {
            Object.assign(out, res);
            stats[res.verification ?? "unverifiable"]++;
          })
        );
      }
      return out;
    }
    return node;
  };

  const copy = walk(artifact) as T;
  await Promise.all(pending);
  return { artifact: copy, stats };
}

export function summarize(stats: VerifyStats): string {
  return `${stats.verified} verified · ${stats.failed} failed · ${stats.unverifiable} judgment-only`;
}
