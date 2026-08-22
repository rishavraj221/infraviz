# @infraviz/practice

The practice pack. One JSON file per entry in `pack/`, hand-authored.

**Maintainers only.** The pack is shipped content: `npx infraviz research` reads
it everywhere, but the write paths — the authoring page and the POST/DELETE
routes behind it — exist only when infraviz runs from a checkout of this
repository. Installed as a dependency the pack is read-only, and that is enforced
in `packages/cli/src/practice.mjs`, not by hiding a button.

An entry carries weight precisely because not everyone can add one.

**No agent writes here either.** A person reads the literature, implements the
technique, confirms it works, and writes the entry. The tool's job is to make
that entry binding on every analysis that follows — not to have opinions about
which research is good. That constraint is the whole reason the pack is worth
more than the model's own knowledge: a model can tell you a technique exists, it
cannot tell you that *your team* tried it and this is what happened.

Copy `entry.template.json` into `pack/<id>.json`, or use the authoring page in
`npx infraviz view` from this repo. Then:

```
npx infraviz research --check
```

Rules the pack enforces, beyond the per-entry schema:

- **At most one `current` entry per topic.** The pack is a decision table, not a
  reading list. Two current answers for `retrieval` means there is no answer.
- **`supersedes` must name an entry that exists.** Superseded entries stay in the
  pack so reports that cited them remain explicable.
- **An `emerging` entry cannot be `current`.** The bar for current is that
  somebody here implemented it — which is also the bar for leaving `emerging`.
- **Entries decay.** `reviewedAt` older than 180 days renders as unreviewed. A
  stale entry is worse than a missing one, because it still looks current.

## The client overlay

An organisation can keep its own entries in `.infraviz/practice/` of the repo
being analysed, but this is **off unless `INFRAVIZ_PRACTICE_OVERLAY=1`** is set.
Off is the right default: an entry a client drops in is one their agent will then
cite as house practice, and that should be a deliberate choice by whoever runs
the tool rather than something that happens because a directory exists.
