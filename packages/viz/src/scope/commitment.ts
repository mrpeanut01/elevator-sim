/**
 * When a move on a control reaches the run — GitHub issue #104.
 *
 * Not `permits.ts`'s missing half, and the difference is worth stating because the two look alike.
 * That file's closing comment records a `refusalSentenceFor` deleted for want of a caller, and it
 * answers *may this move in this mode at all* — a question about permission, whose surface is the
 * menu's affordance model and which is still unbuilt. This one answers *what happens to the shift I
 * am watching when it does move*, which every one of these panels already permits.
 *
 * ## The issue, and why one note could not have answered it
 *
 * The report is *"no in-context explanation for why dispatcher and building controls lock during a
 * run"*, and it asks for one note reading **locked for this shift, changes apply to your next run**.
 * Verified against this tree, **no control on any of those panels is disabled while a shift plays**,
 * and the panels the report treats as one thing turn out to hold three different behaviours sitting
 * inches apart. § D227 rates a wrong refusal above a missing one, so the same sentence over all
 * three would have been the defect this fix is for, with better manners.
 *
 * 1. **It re-runs now.** The right rail's three lists and the stage's out-of-service badge write and
 *    then call `MountContext.runShift`, and `dev/main.ts#runShift` builds a **new `Playback`** off
 *    the new recording. The day on screen is not steered and not paused — it is discarded, and the
 *    playhead goes back to zero. This is `docs/16` § 1's first consequence, which that document
 *    already states and then says nobody says: *"a control does not steer a day, it re-rolls one …
 *    `dev/main.ts` is honest about this in its wiring, but no surface says it."*
 * 2. **It applies to the next run.** The group levers, the door dwell and the weight-set selector
 *    write a field `shiftRunConfigOf` really does read, and call no `runShift` — `dev/main.ts`'s own
 *    comment on the selector mount says *"an edit takes effect on the next Run rather than re-running
 *    under the reader."* **Here the reporter's wording is exactly right**, and it is drawn in their
 *    words.
 * 3. **It is a draft.** The four editors' working copies reach no run at all until a named verb
 *    files or selects them. That is the control the report describes touching — *"nudge a weight
 *    while watching a queue build"* — and the one whose silence reads as a broken control rather
 *    than as a rule.
 *
 * ## Why this is derived from `SCOPE_OF` rather than written next to each panel
 *
 * A sentence about what a control does is a claim about the code, and this repository has the
 * standing rule that such a claim is pinned by a run rather than by another sentence — the traffic
 * editor drew *mean group size* as a refusal for every wave after the seam went live (§ D227).
 * `scope/surface.ts` is the one table that already answers *what does moving this reach, and when*,
 * it is asserted against the state's own keys in both directions (`surface.test.ts`), and
 * `scope.test.ts` decides every row by running both arms and comparing **the legs**. So a note
 * indexed by this function inherits that pinning: re-scope a field and the note changes with it.
 *
 * The failure direction is deliberate. A caller asks for the answer it expects and draws nothing
 * when it does not get it, so a re-scoped field takes the sentence **off** the screen rather than
 * leaving a false one on it. An absent sentence is not a false sentence; the tests beside each
 * panel are what keep the absence from being permanent.
 *
 * ## Prose-free on purpose
 *
 * `honesty/derive.test-helper.ts` derives the player-facing text producers from the source, and an
 * exported declaration carrying prose — directly or through a sibling — owes `honesty/surfaces.ts`
 * an adapter or a stated exclusion. This module returns a **code**, on the precedent
 * `dev/dispatcherEditor.ts#runThisDispatcherStateOf` set and for the reason its docstring gives:
 * the decision is exported and testable, and the wording stays beside the control it is about,
 * inside a mount the derivation already classifies.
 */

import { SCOPE_OF } from './surface.js';
import type { SurfaceKey } from './types.js';

/**
 * The four answers a surface can draw, in the order a player meets them.
 *
 * Named rather than derived, on `scope/types.ts`'s own rule for `CHANGE_SCOPES`: a fifth answer is a
 * compile error at every exhaustive `switch` over this union, and a fifth *member* — a newly scoped
 * field — is caught by `surface.test.ts` instead.
 *
 * These are not the change scopes renamed. A scope answers *when may this move*; this answers *what
 * a player watching a shift sees when it does*, and the two do not line up one to one in either
 * direction. `within-day` and `between-games` give the same answer here, because from a player's
 * chair a re-run is a re-run whichever axis it moved; and one scope gives **two** answers here,
 * because whether the day on screen survives is a fact about the wiring rather than about the field.
 */
export const COMMITMENTS = ['re-runs-now', 'next-run', 'draft', 'shown-only'] as const;

export type Commitment = (typeof COMMITMENTS)[number];

/**
 * Whether the control's own handler asks for a run, which is the half `SCOPE_OF` cannot answer.
 *
 * A boolean was written here first and replaced: `commitmentOf(key, true)` at a call site says
 * nothing about *what* is true, and this argument is a claim the caller is making about its own
 * wiring three lines away. Naming it makes the claim readable where it is made, and
 * `rightRail.test.ts` and `dispatcherEditor.test.ts` check it against the module's own source rather
 * than trusting it.
 */
export type Wiring = 'runs-the-shift' | 'writes-only';

/**
 * What moving the control that writes `key` does to the shift on screen.
 *
 * - `re-runs-now` — the day being watched is discarded and a different one is simulated from zero.
 * - `next-run` — the field reaches a run and this control does not ask for one, so nothing on screen
 *   moves until something else does. **The report's own *locked for this shift* case.**
 * - `draft` — reaches no run at all until the field named by `LatentEntry.realisedBy` does.
 * - `shown-only` — the legs are byte-identical; only what is drawn changes.
 *
 * `wiring` is consulted on the `control` arm and nowhere else, and that is the shape of the fact
 * rather than an oversight: a draft cannot re-run the shift however its handler is written, because
 * there is nothing in it for a run to read.
 *
 * `undefined` has exactly two causes and both are honest silences rather than defaults. An
 * **output** is written by the shell and moved by no control, so there is nothing to say about
 * moving it; and a key the table does not carry cannot be described at all, which `surface.test.ts`
 * makes impossible for a field that exists. Returning a fifth `Commitment` for either would put a
 * sentence in a caller's copy table that no shipped call site can reach — the dead branch this
 * package has a rule about, arriving in the module written to serve the rule.
 */
export function commitmentOf(key: SurfaceKey, wiring: Wiring): Commitment | undefined {
  const entry = SCOPE_OF[key];
  if (entry === undefined) return undefined;
  switch (entry.kind) {
    case 'control':
      if (entry.scope === 'presentation') return 'shown-only';
      return wiring === 'runs-the-shift' ? 're-runs-now' : 'next-run';
    case 'latent':
      return 'draft';
    case 'output':
      return undefined;
  }
}
