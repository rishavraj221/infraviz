// Git, for the practice studio only.
//
// THE WORKING TREE IS NEVER TOUCHED. No checkout, no branch switch, no writes to
// the real index. Committing an entry has to be safe to do in the middle of
// unrelated work — a maintainer editing the pack is usually mid-change on
// something else, and a tool that switched branches under them would drag
// dozens of unrelated modified files onto `practice` and turn a one-line entry
// into a merge problem.
//
// So commits are built out of band: read the target branch's tree into a
// TEMPORARY index, apply only the pack paths to it, write a tree, commit it, and
// move refs/heads/practice. The checkout you are sitting in does not move and
// does not notice.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const exec = promisify(execFile);

/** Never shells out through a shell — every argument is passed as an array element. */
async function git(root, args, extraEnv = {}) {
  const { stdout } = await exec("git", ["-C", root, ...args], {
    env: { ...process.env, ...extraEnv },
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

async function tryGit(root, args, extraEnv) {
  try {
    return { ok: true, out: await git(root, args, extraEnv) };
  } catch (e) {
    return { ok: false, error: String(e?.stderr || e?.message || e).trim() };
  }
}

export const PRACTICE_BRANCH = "practice";

/**
 * Where a new practice commit should sit.
 *
 * The practice branch when it exists, otherwise main — never the branch you
 * happen to be on. Basing on HEAD would silently fork the pack off whatever
 * feature branch was checked out, and the resulting PR would carry that work
 * with it.
 */
async function baseCommit(root) {
  for (const ref of [PRACTICE_BRANCH, "main", "master", "HEAD"]) {
    const r = await tryGit(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
    if (r.ok) return { ref, sha: r.out };
  }
  return null;
}

export async function repoInfo(root) {
  const inside = await tryGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.out !== "true") {
    return { isRepo: false, reason: "not a git repository — entries are written to disk but cannot be committed" };
  }
  const branch = await tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const practice = await tryGit(root, ["rev-parse", "--verify", `${PRACTICE_BRANCH}^{commit}`]);
  const base = await baseCommit(root);
  const remote = await tryGit(root, ["remote", "get-url", "origin"]);

  return {
    isRepo: true,
    currentBranch: branch.ok ? branch.out : null,
    practiceExists: practice.ok,
    practiceTip: practice.ok ? practice.out.slice(0, 8) : null,
    // what a new commit lands on top of, which is not necessarily where you are
    base: base ? { ref: base.ref, sha: base.sha.slice(0, 8) } : null,
    remote: remote.ok ? remote.out : null,
    branch: PRACTICE_BRANCH,
  };
}

/**
 * What has changed in the pack relative to the practice branch — not relative to
 * HEAD, because HEAD is wherever the maintainer happens to be and says nothing
 * about what the pack branch already contains.
 */
export async function packStatus(root, packDir) {
  const info = await repoInfo(root);
  if (!info.isRepo) return { ...info, files: [] };

  const rel = relative(root, packDir).split("\\").join("/");
  const base = await baseCommit(root);
  if (!base) return { ...info, files: [] };

  // diff the working tree against the base commit, limited to the pack
  const d = await tryGit(root, ["diff", "--name-status", base.sha, "--", rel]);
  const files = [];
  if (d.ok && d.out) {
    for (const line of d.out.split("\n")) {
      const [code, path] = line.split("\t");
      files.push({ path, change: { A: "added", M: "modified", D: "removed" }[code[0]] ?? code });
    }
  }
  // untracked entries never appear in a diff, and a brand-new entry is the
  // single most common thing here — so they are collected separately
  const u = await tryGit(root, ["ls-files", "--others", "--exclude-standard", "--", rel]);
  if (u.ok && u.out) {
    for (const path of u.out.split("\n").filter(Boolean)) {
      if (!files.some((f) => f.path === path)) files.push({ path, change: "added" });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ...info, files };
}

/**
 * Commit the pack onto refs/heads/practice, out of band.
 *
 * Nothing here runs `checkout`, `switch`, `add` or `stash`. The only mutation
 * outside the temporary index is the final update-ref, and that moves a branch
 * you are not standing on.
 */
export async function commitPack(root, packDir, { message, author } = {}) {
  const info = await repoInfo(root);
  if (!info.isRepo) return { ok: false, errors: [info.reason] };

  const status = await packStatus(root, packDir);
  if (!status.files.length) return { ok: false, errors: ["nothing in the pack has changed"] };
  if (!message?.trim()) return { ok: false, errors: ["a commit message is required"] };

  const base = await baseCommit(root);
  const rel = relative(root, packDir).split("\\").join("/");
  const tmp = await mkdtemp(join(tmpdir(), "infraviz-pack-"));
  const idx = join(tmp, "index");
  const env = { GIT_INDEX_FILE: idx };

  try {
    // start from the branch we are landing on, so unrelated files are preserved
    const read = await tryGit(root, ["read-tree", base.sha], env);
    if (!read.ok) return { ok: false, errors: [`read-tree failed: ${read.error}`] };

    for (const f of status.files) {
      const abs = join(root, f.path);
      if (f.change === "removed" || !existsSync(abs)) {
        const r = await tryGit(root, ["update-index", "--force-remove", "--", f.path], env);
        if (!r.ok) return { ok: false, errors: [`update-index --force-remove ${f.path}: ${r.error}`] };
      } else {
        const r = await tryGit(root, ["update-index", "--add", "--", f.path], env);
        if (!r.ok) return { ok: false, errors: [`update-index --add ${f.path}: ${r.error}`] };
      }
    }

    const tree = await tryGit(root, ["write-tree"], env);
    if (!tree.ok) return { ok: false, errors: [`write-tree failed: ${tree.error}`] };

    const authorEnv = author?.name
      ? {
          GIT_AUTHOR_NAME: author.name,
          GIT_AUTHOR_EMAIL: author.email || `${author.name.replace(/\s+/g, ".").toLowerCase()}@local`,
          GIT_COMMITTER_NAME: author.name,
          GIT_COMMITTER_EMAIL: author.email || `${author.name.replace(/\s+/g, ".").toLowerCase()}@local`,
        }
      : {};

    const commit = await tryGit(
      root,
      ["commit-tree", tree.out, "-p", base.sha, "-m", message.trim()],
      { ...env, ...authorEnv }
    );
    if (!commit.ok) return { ok: false, errors: [`commit-tree failed: ${commit.error}`] };

    const ref = await tryGit(root, [
      "update-ref",
      `refs/heads/${PRACTICE_BRANCH}`,
      commit.out,
      ...(info.practiceExists ? [base.sha] : []),
    ]);
    if (!ref.ok) return { ok: false, errors: [`update-ref failed: ${ref.error}`] };

    return {
      ok: true,
      sha: commit.out.slice(0, 8),
      branch: PRACTICE_BRANCH,
      files: status.files.map((f) => f.path),
      // deliberately not run — pushing is outward-facing and stays a manual step
      push: `git push -u origin ${PRACTICE_BRANCH}`,
      pr: info.remote?.includes("github.com")
        ? `${info.remote.replace(/\.git$/, "").replace(/^git@github\.com:/, "https://github.com/")}/compare/main...${PRACTICE_BRANCH}?expand=1`
        : null,
      errors: [],
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
