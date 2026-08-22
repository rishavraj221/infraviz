// Cross-file checks for bench.json.
//
// The schema can only see one file. Everything that makes a bench item
// trustworthy lives across three: the stage it points at is in ai.json, the
// technique it cites is in the pack, and whether that technique can change model
// output decides whether the item must name a trial. So the interesting checks
// are all here.
//
// This is the same idea as a fingerprint, applied to recommendations rather than
// to code. A fabricated technique with a plausible name is the most damaging
// thing this feature could produce — it reads exactly like a real one — and the
// only defence is that both ends of every claim have to resolve.

import { loadPack } from "./practice.mjs";

export async function checkBench(root, serviceId, bench, ai) {
  const problems = [];
  const items = bench?.items ?? [];
  if (!items.length) return problems;

  const where = `services/${serviceId}/bench.json`;
  const { manifest, entries } = await loadPack(root);
  const byId = new Map(entries.map((e) => [e.id, e]));

  const stages = new Set();
  for (const p of ai?.pipelines ?? []) for (const s of p.stages ?? []) stages.add(s.id);

  if (!ai) {
    problems.push(
      `${where}: there is no ai.json for this service, so every stageId below is unverifiable. Generate the AI section first.`
    );
  }

  if (bench.packVersion && manifest.version !== "unknown" && bench.packVersion !== manifest.version) {
    problems.push(
      `${where}: computed against pack ${bench.packVersion}, but the pack is now ${manifest.version} — the house answers may have changed underneath this. Re-run the bench.`
    );
  }

  items.forEach((it, i) => {
    const at = `${where} items[${i}] (${it.id})`;

    if (ai && !stages.has(it.stageId)) {
      problems.push(
        `${at}: stageId "${it.stageId}" is not a stage in this service's ai.json. Declared: ${[...stages].join(", ") || "none"}`
      );
    }

    const entry = byId.get(it.techniqueId);
    if (!entry) {
      problems.push(
        `${at}: techniqueId "${it.techniqueId}" is not in the practice pack. Recommendations may only cite entries the pack ships.`
      );
      return;
    }
    if (entry.status !== "current") {
      problems.push(
        `${at}: cites "${it.techniqueId}", which is ${entry.status} rather than current. Only the current answer for a topic may be recommended.`
      );
    }
    if (entry.stale) {
      problems.push(
        `${at}: cites "${it.techniqueId}", last reviewed ${entry.reviewedAt} and now unreviewed. Confirm it before shipping advice based on it.`
      );
    }
    // The pack decides whether output can move; the bench item has to answer for
    // it. Leaving this to prose would let "cheaper, no downside" be asserted for
    // a change that swaps the model.
    if (entry.evalSensitivity !== "none" && !it.evidenceNeeded) {
      problems.push(
        `${at}: "${it.techniqueId}" has evalSensitivity "${entry.evalSensitivity}", so this item must set "evidenceNeeded" — the comparison that would have to be run before shipping.`
      );
    }
  });

  return problems;
}

/** A compact digest of what a bench found, for the CLI. */
export function summarise(bench) {
  const items = bench?.items ?? [];
  if (!items.length) return "nothing in the pack applies here";
  const structural = items.filter((i) => i.today.basis === "structural").length;
  return `${items.length} item${items.length === 1 ? "" : "s"} · ${structural} counted from the code`;
}
