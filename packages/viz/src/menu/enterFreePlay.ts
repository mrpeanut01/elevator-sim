/**
 * What pressing **Start** means — as a pure function, because it was a click handler and that is why
 * it was wrong twice.
 *
 * ## The two defects this module exists to end
 *
 * `docs/16` § 5 clauses 2 and 3, both of which lived in `dev/main.ts`'s `menuHost.start`:
 *
 * 1. **Start did not start.** It applied the selection to `ViewerState` and called `renderAll()`.
 *    Every other state changer in that file calls `runShift()`, so the screen kept the *previous*
 *    recording and the player's selection reached the simulator only if they happened to touch some
 *    other control afterwards.
 * 2. **The run was not the run the menu described.** `start` never touched `state.week`, and
 *    `shiftRunConfigOf` reads `week.day` for `grownBuilding` (11 % more tenants per day, linearly)
 *    and `(day, dayIdx)` for `eventFor` (a car out of service, a rate multiplier, a swung
 *    directional mix). Entering Free Play from a campaign sitting on day 7 therefore ran a building
 *    **two thirds fuller** than the one on screen, possibly with a car held, and said nothing.
 *
 * Neither had a test, and neither *could*: reaching the decision needed a document, a canvas and a
 * click. That is § D214 § 2's own argument for why `menu/` exists, and this file is that argument
 * applied to the one decision the menu had left inside a handler.
 *
 * ## Why the week is reset rather than warned about
 *
 * `docs/16` S6 — *entering a play mode resets every scope that mode does not permit.* `free-play`
 * forbids `between-days`, and `viewer.week` is the whole of that scope. A warning would leave the
 * player looking at a figure that is not what its own screen claims; resetting makes the claim true.
 *
 * It is also what makes a free-play run **postable at all**. The leaderboard verifies by replaying
 * the submitted selection on the server's own `data/`, and a run carrying growth or an event cannot
 * reproduce — so before this, an honest submission would have been rejected as a forgery.
 */

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { openWeek } from '../shift/week.js';
import { contractForBuilding } from '../shift/contracts.js';
import type { BrowserResources } from '../dev/data.js';
import { withBuilding, type ViewerState } from '../dev/state.js';

import { canStart } from './menu.js';
import type { FreePlaySelection, MenuCatalogue } from './types.js';

/**
 * The state a Free Play selection produces, or `undefined` when the selection is not startable.
 *
 * `undefined` rather than a thrown error: the caller is a click handler on a button the model has
 * already disabled, so reaching this is a mis-wire rather than a player mistake, and a blank screen
 * is a worse diagnosis than nothing happening. `freePlayIssues` is what puts the reason on screen.
 */
export function enterFreePlay(
  state: ViewerState,
  resources: BrowserResources,
  selection: FreePlaySelection,
  catalogue: MenuCatalogue,
): ViewerState | undefined {
  if (!canStart(selection, catalogue)) return undefined;

  /*
   * `withBuilding` first, because it owns two things this function must not duplicate: taking the
   * week to the building's own scenario, and re-seeding the building editor's draft only when that
   * draft is pristine. Re-implementing either here would be the second answer to a question
   * `dev/state.ts` has already answered.
   */
  const withNewBuilding = withBuilding(state, resources, selection.buildingId);

  return {
    ...withNewBuilding,
    dispatcherId: selection.dispatcherProfileId,
    seed: BigInt(selection.seed),
    shiftLengthS: selection.durationS,
    freePlay: {
      demandTemplateId: selection.demandTemplateId,
      arrivalRatePctPop5min: selection.arrivalRatePctPop5min,
    },
    /*
     * Day one, and a fresh week — S6.
     *
     * `openWeek` rather than `{ ...week, day: 1 }`: the streak, the banked count and the seven-day
     * history belong to a campaign week, and carrying them into a free-play run would put somebody
     * else's sparkline under a run that is not part of that week. `contractForBuilding` keeps the
     * scenario label honest for a building that has one, and leaves it alone for one the reader drew.
     */
    week: openWeek(contractForBuilding(selection.buildingId)?.id),
    /*
     * The two `within-day` fields Free Play does not offer — and the argument for clearing them is
     * *not* S6, which is worth stating because the obvious reading gets it backwards.
     *
     * `free-play` **permits** `within-day`: a player is meant to be able to hold a car or pull a
     * lever and re-run, and that is the mode's whole point. So S6 does not require these to be
     * reset. What requires it is the *selection*: neither field is one of the six axes the menu
     * offered, so a run that inherited Thursday's held car from a campaign week would not be the run
     * the screen just described — the same defect as the week, arriving through a different field.
     *
     * The consequence is checkable rather than argued: `runIdentityIssues` refuses a run carrying
     * either, so without this a freshly-started free-play run would be unpostable on arrival while
     * looking perfectly ordinary.
     */
    outOfServiceCarIds: [],
    levers: DEFAULT_LEVERS,
  };
}
