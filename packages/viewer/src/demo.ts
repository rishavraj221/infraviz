/**
 * Read-only demo mode.
 *
 * The marketing site embeds this exact viewer rather than screenshots of it, so
 * a visitor explores a real analysis instead of looking at a picture of one.
 * Nothing on that page can drive an agent — there is no server behind it — so
 * every control that would start a run, copy a prompt, or otherwise imply an
 * action is hidden. What stays is navigation: services, lenses, steps, findings.
 *
 * The flag is set by the demo's own index.html before the bundle loads, so a
 * normal `infraviz view` build is completely unaffected.
 */
export const DEMO: boolean =
  typeof window !== "undefined" && (window as unknown as { __INFRAVIZ_DEMO__?: boolean }).__INFRAVIZ_DEMO__ === true;

/**
 * Studio mode — the maintainers' pack workbench, served by `infraviz pack` on
 * its own port and its own process.
 *
 * A separate mode rather than a separate app: the pack UI is the same component
 * either way, and duplicating a frontend to change who may press a button is how
 * the two copies start disagreeing. The isolation that matters is the server's —
 * `infraviz view` has no authoring routes at all — and that is enforced there,
 * not by this flag.
 */
export const STUDIO: boolean =
  typeof window !== "undefined" && (window as unknown as { __INFRAVIZ_STUDIO__?: boolean }).__INFRAVIZ_STUDIO__ === true;
