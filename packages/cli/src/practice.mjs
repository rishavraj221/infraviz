// Loading and writing the practice pack.
//
// AUTHORING IS NOT A USER-FACING FEATURE. The pack is what this team researches,
// implements and ships; a client reads it. That asymmetry is the product, so it
// is enforced here rather than by hiding a button: the write routes exist only
// when infraviz is running from its own source tree, which is to say only for
// the people who maintain the pack. Installed from npm, the pack is read-only
// and there is no path — UI, API or otherwise — to change it.
//
// A client overlay in .infraviz/practice/ is still supported, but off unless
// INFRAVIZ_PRACTICE_OVERLAY=1 is set. It exists for an organisation that wants
// its own internal standards alongside ours, and it is opt-in because the
// default answer to "can this be edited locally" should be no: an entry a client
// dropped in is an entry their agent will then cite as house practice.

import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The shipped pack, resolved from this package's own location. */
export function officialPackDir() {
  return resolve(here, "../../practice/pack");
}

/**
 * The client overlay. Under .infraviz/, which is gitignored in full — so entries
 * here are local to the machine unless someone deliberately un-ignores them or
 * copies them elsewhere. That is the same default the artifacts get.
 */
export function localPackDir(root) {
  return join(root, ".infraviz", "practice");
}

/**
 * Whether this installation may write to the pack, and where.
 *
 * The test is whether the pack resolves outside node_modules — true only when
 * running from a checkout of infraviz itself. Anywhere the tool was installed as
 * a dependency, writes are refused: the pack is shipped content, and a write
 * there would be silently discarded by the next install even if it were allowed.
 */
export function authorTarget() {
  const dir = officialPackDir();
  const allowed = existsSync(dir) && !dir.includes("node_modules");
  return {
    allowed,
    dir: allowed ? dir : null,
    reason: allowed
      ? null
      : "the practice pack is read-only here — entries are authored and shipped by the infraviz team",
  };
}

/** Opt-in, off by default. See the note at the top of this file. */
export function overlayEnabled() {
  return process.env.INFRAVIZ_PRACTICE_OVERLAY === "1";
}

async function readDir(dir, layer) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push({ ...JSON.parse(await readFile(join(dir, f), "utf8")), _layer: layer, _file: f });
    } catch (e) {
      out.push({ _layer: layer, _file: f, _parseError: String(e?.message ?? e) });
    }
  }
  return out;
}

/**
 * The merged pack, with per-entry validation and pack-wide rules applied.
 *
 * Invalid entries are returned rather than dropped: an entry that fails to parse
 * is a thing the author needs to see and fix, and silently omitting it would
 * make the research page show a pack that is quietly missing something.
 */
export async function loadPack(root) {
  const { validate, validatePack, isStale, PackManifest } = await import("@infraviz/schema");

  const official = await readDir(officialPackDir(), "official");
  const local = overlayEnabled() ? await readDir(localPackDir(root), "local") : [];

  // local wins on id conflict — a client's own standard overrides ours
  const merged = new Map();
  for (const e of [...official, ...local]) if (e.id) merged.set(e.id, e);

  const entries = [];
  const problems = [];
  for (const raw of [...merged.values(), ...official.filter((e) => !e.id), ...local.filter((e) => !e.id)]) {
    if (raw._parseError) {
      problems.push(`${raw._layer}/${raw._file}: not valid JSON — ${raw._parseError}`);
      continue;
    }
    const { _layer, _file, ...body } = raw;
    const r = validate("practice-entry", body);
    if (!r.ok) {
      problems.push(...r.errors.map((m) => `${_layer}/${_file}: ${m}`));
      continue;
    }
    entries.push({ ...r.data, layer: _layer, stale: isStale(r.data) });
  }

  problems.push(...validatePack(entries));

  let manifest = { version: "unknown", builtAt: null };
  const mf = resolve(officialPackDir(), "../pack.json");
  if (existsSync(mf)) {
    try {
      const parsed = PackManifest.safeParse(JSON.parse(await readFile(mf, "utf8")));
      if (parsed.success) manifest = parsed.data;
    } catch {
      /* a broken manifest is reported as "unknown", not a crash */
    }
  }

  entries.sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
  const target = authorTarget();
  return {
    manifest,
    entries,
    problems,
    canAuthor: target.allowed,
    // never leak a filesystem path to a reader who cannot write to it anyway
    target: target.allowed ? { layer: "official", dir: target.dir } : { layer: "official", reason: target.reason },
    overlay: overlayEnabled(),
  };
}

/** Writes one entry, validating before it touches disk. */
export async function writeEntry(root, body) {
  const { allowed, dir, reason } = authorTarget();
  if (!allowed) return { ok: false, forbidden: true, errors: [reason] };

  const { validate } = await import("@infraviz/schema");
  const r = validate("practice-entry", body);
  if (!r.ok) return { ok: false, errors: r.errors };

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${r.data.id}.json`), JSON.stringify(r.data, null, 2) + "\n");
  return { ok: true, id: r.data.id, layer: "official", errors: [] };
}

export async function deleteEntry(root, id) {
  const { allowed, dir, reason } = authorTarget();
  if (!allowed) return { ok: false, forbidden: true, errors: [reason] };

  const f = join(dir, `${id}.json`);
  if (!existsSync(f)) return { ok: false, errors: [`no entry "${id}" in the pack`] };
  await rm(f);
  return { ok: true, errors: [] };
}

/**
 * The pack rendered for an agent.
 *
 * Only `current` entries, because the agent's question is never "what has been
 * tried" — it is "what is the answer for caching", and a decision table with two
 * answers is not one. Superseded and draft entries exist for the reader on the
 * research page, not for the agent mid-analysis.
 */
export function briefing({ manifest, entries }) {
  const current = entries.filter((e) => e.status === "current");
  if (!current.length) {
    return `CURRENT PRACTICE (pack ${manifest.version}): the pack is empty.

Nobody has recorded a house answer for any topic yet, so do not invent one.
Assess this system on its own terms and leave technique recommendations out.`;
  }

  const body = current
    .map((e) =>
      [
        `  ${e.topic} → ${e.id}   [${e.maturity} · ${e.scope}${e.stale ? " · UNREVIEWED" : ""}]`,
        `    ${e.title}`,
        `    Applies when:     ${e.appliesWhen}`,
        `    Does not apply:   ${e.doesNotApplyWhen}`,
        `    Claim:            ${e.claim}`,
        `    Costs to adopt:   ${e.adoptionCost}`,
        `    We learned:       ${e.learned}`,
        `    Already done if:  ${e.detect}`,
        `    Output can change: ${e.evalSensitivity}`,
        `    Source:           ${e.source.title} — ${e.source.url}`,
      ].join("\n")
    )
    .join("\n\n");

  return `CURRENT PRACTICE (pack ${manifest.version}, built ${manifest.builtAt}):

These are the answers this team has researched, implemented and settled on. There
is at most one per topic, and it is the one to apply — do not survey alternatives
and do not cite anything that is not listed here.

${body}

HOW TO USE THIS:
- Apply an entry only when its "applies when" is TRUE OF THIS CODEBASE, judged by
  reading the code. Most entries will not apply to most services, and saying so
  is the correct result.
- Check "already done if" before recommending anything. Recommending something
  the code already does is worse than staying quiet.
- An entry marked UNREVIEWED has not been confirmed by a human recently. Say so
  if you rely on it.
- Never invent an entry, a source, or a claimed magnitude. If the right answer for
  a topic is not in the pack, there is no house answer and you should not imply
  there is one.`;
}
