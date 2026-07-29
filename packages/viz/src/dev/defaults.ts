/**
 * Which dispatcher a newcomer-facing control opens on when nothing else says.
 *
 * ## Why this is a module rather than three `const`s in three files
 *
 * It *was* three `const`s in two files, and none of them had a test. [§ D134](../../../../DECISIONS.md)
 * moved the viewer's opening dispatcher off `nearest-car` — which is first in
 * `data/dispatcher-profiles.json` and which [`docs/07-handoff.md`](../../../../docs/07-handoff.md)
 * § 4 measures as *"the **only** profile that saturates"* — and nothing in the suite pinned the
 * result. A later edit could have put it back, or a rename could have silently dropped the
 * preference to the file-order fallback, and every test in this repository would still have been
 * green. That is a guard that does not exist, which is the cheapest of the false-negative shapes
 * to find and the easiest to ship.
 *
 * ## The shape, and why a list rather than an id
 *
 * A preference *list* with a fallback to whatever `data/` lists first, because a hard-coded id
 * turns a renamed profile into a broken viewer. {@link preferredDispatcherId} returns `undefined`
 * when no preference is present, and each caller then leaves the control on its file-order
 * default — which is what a `<select>` does on its own.
 *
 * ## The reason, and it is measured rather than inherited
 *
 * `docs/07` § 4 records `nearest-car` as a poor reference arm on four buildings and
 * [§ D147](../../../../DECISIONS.md) adds a fifth: its first invalid replication on
 * `vertical-city` is at **26** (1 % pop/5 min) and at **6** (1.5 %), so no budget in CLAUDE.md's
 * 50–200 band fits under it. A newcomer's first act should not be to run the one profile whose
 * headline number the project would refuse to quote.
 *
 * Non-test callers: {@link PREFERRED_VIEWER_DISPATCHERS} in `dev/main.ts`'s `boot`;
 * {@link PREFERRED_BATCH_BASELINE} and {@link PREFERRED_BATCH_CANDIDATE} in
 * `dev/batchPanel.ts`'s `mountBatchPanel`.
 */

/**
 * The Run viewer's opening dispatcher — `docs/10` § 14 item 4, closed by § D134.
 *
 * `collective` first because `docs/07` § 4 recommends it or `eta` as the reference arm; `eta`
 * second so a `data/` without `collective` still opens on a measured arm rather than on file
 * order.
 */
export const PREFERRED_VIEWER_DISPATCHERS: readonly string[] = Object.freeze(['collective', 'eta']);

/** The Compare surface's A arm. Same reason, same order. */
export const PREFERRED_BATCH_BASELINE: readonly string[] = Object.freeze(['collective', 'eta']);

/**
 * The Compare surface's B arm — the *other* recommended arm, so the panel opens on a pair rather
 * than on one dispatcher against itself.
 */
export const PREFERRED_BATCH_CANDIDATE: readonly string[] = Object.freeze(['eta', 'collective']);

/**
 * The first id in `preferred` that `available` actually ships, or `undefined`.
 *
 * `undefined` is the fallback signal, not an error: the caller leaves the control alone and the
 * browser's own first-option default stands.
 */
export function preferredDispatcherId(
  preferred: readonly string[],
  available: readonly { readonly id: string }[],
): string | undefined {
  return preferred.find((id) => available.some((profile) => profile.id === id));
}
