/**
 * Which building and which dispatcher a newcomer-facing control opens on when nothing else says.
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
 * turns a renamed profile into a broken viewer. {@link preferredId} returns `undefined`
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
 * ## The second door, and the reason this module grew a building list — GitHub issue #99
 *
 * § D134 moved the **Run viewer's** opening dispatcher and nothing else, because nothing else
 * existed to move. The Free Play menu landed afterwards with its own answer — `catalogue.buildings[0]`
 * and `catalogue.dispatchers[0]`, file order, both — so the product had two doors into the same
 * engine that disagreed about what a newcomer opens on, and the door a player reaches from the main
 * menu held the answer § D134 had already retired. That is § D192's shape exactly: *two sites
 * answering "what does the viewer open on" is how one of them goes stale unread.*
 *
 * Non-test callers: {@link PREFERRED_VIEWER_DISPATCHERS} in `dev/state.ts`'s
 * `preferredDispatcher`, which `initialState` resolves the opening dispatcher through;
 * {@link PREFERRED_BATCH_BASELINE} and {@link PREFERRED_BATCH_CANDIDATE} in
 * `dev/batchPanel.ts`'s `mountBatchPanel`; {@link PREFERRED_OPENING_BUILDINGS} and
 * {@link PREFERRED_VIEWER_DISPATCHERS} again in `menu/menu.ts`'s `initialMenuState`. (An earlier
 * version of this sentence named `dev/main.ts`'s `boot` while `state.ts` re-derived the list from a
 * private literal — a docstring naming a caller that did not call, found by the fifth audit,
 * § D192.)
 */

/**
 * The Run viewer's opening dispatcher — `docs/10` § 14 item 4, closed by § D134.
 *
 * `collective` first because `docs/07` § 4 recommends it or `eta` as the reference arm; `eta`
 * second so a `data/` without `collective` still opens on a measured arm rather than on file
 * order.
 */
export const PREFERRED_VIEWER_DISPATCHERS: readonly string[] = Object.freeze(['collective', 'eta']);

/**
 * The building a newcomer-facing control opens on — GitHub issue #99.
 *
 * ## `chancery-house` first, and it is the building file order already produced
 *
 * The move here is **not** a change of building; it is a change from *inherited* to *chosen*, and
 * the two are the same value today only by luck. `data/buildings/` is read in filename order
 * (`packages/viz/vite.config.ts#readBuildings` sorts, and `loadConfig` reads the same directory),
 * so a building whose id sorts before `chancery-house` would silently take the slot the moment it
 * landed — which is the whole of the defect this list closes, one axis over from § D134's.
 *
 * ## Why not the smallest building, which is what the issue asks for
 *
 * Issue #99 recommends *"an easy, winnable building"* and names Garden Apartments, because that is
 * where the campaign starts new players (`data/campaign.json` stage 1, `shift/contracts.ts` `c1`).
 * Measured at Free Play's own opening settings — the building's own traffic profile,
 * `rise-and-fall`, 1 800 s — Garden Apartments serves **2 to 8 riders** in the reported window
 * across six seeds, `WT95` equals `AWT` on three of them because the percentile has one
 * observation, and `nearest-car` and `collective` return **the same numbers**. A calm screen that
 * says nothing is not a good first run, and the one thing a first run has to teach — that the
 * dispatcher is the thing you are choosing — is invisible there. `c1` compensates with a 3 600 s
 * shift and a scaffolded brief (§ D234); Free Play has neither.
 *
 * Chancery House at the same settings serves 81–115, publishes a mean on 6 of 6 seeds under
 * `collective` (AWT 10.3–23.5 s, 0.0–3.5 % of riders over a minute), and is the building where the
 * dispatcher axis is most legible: the same seed and the same 81 riders under `nearest-car` give
 * **146.72 s** and **87.7 %**. So the pair is chosen for what it *shows*, not for looking calm.
 *
 * ## And there is deliberately no difficulty label beside it
 *
 * Issue #99 also asks for *"a plain-language load estimate … population per car, or an easy or hard
 * label"* in the picker. **Not shipped, and the refusal is pinned by a run rather than by this
 * sentence** — `defaults.test.ts`'s *a static load proxy does not order the buildings the way the
 * simulator does*. Population per car ranks Mixed-Use High-Rise (142) easier than Secure Tower
 * (165); measured at the opening settings under `collective`, Secure Tower publishes a mean and
 * Mixed-Use High-Rise **suppresses** its own. A label that told a newcomer the harder building was
 * the easier one would be a worse first run than no label, and it would be this repository's own
 * *"a stated mechanism goes stale"* failure shipped deliberately.
 */
export const PREFERRED_OPENING_BUILDINGS: readonly string[] = Object.freeze([
  'chancery-house',
  'garden-apartments',
]);

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
 *
 * Named for neither buildings nor dispatchers, because it resolves both and a second copy under a
 * second name would be the duplicate this module exists to have exactly one of. It was
 * `preferredDispatcherId` while dispatchers were the only preference here.
 */
export function preferredId(
  preferred: readonly string[],
  available: readonly { readonly id: string }[],
): string | undefined {
  return preferred.find((id) => available.some((entry) => entry.id === id));
}
