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
 *
 * ## Reset, and the week it replaced is **put down rather than dropped** — GitHub issue #125
 *
 * The reset above is unchanged and is not the defect. What was wrong is what happened to the week it
 * displaced: this function wrote `week:` in its own returned object, *after* `withBuilding` had
 * already decided one, so the departing week went nowhere. `dev/state.ts#withFreePlayWeek` now owns
 * that transition and carries the whole argument, including why the obvious one-line repair is a
 * measured no-op.
 *
 * **Two sentences that used to be here are withdrawn rather than moved**, because both are now
 * false of the code:
 *
 * - *"`contractForBuilding` keeps the scenario label honest for a building that has one"* — it did
 *   the opposite. A free-play run on `midtown-office` carried `c2`, so `contractById` resolved,
 *   the coach ribbon read **Scenario · day 1** and the rail read **0/3 banked this scenario** over a
 *   run that banks nothing and belongs to no week. A free-play week now carries
 *   `shift/week.ts#FREE_PLAY_CONTRACT_ID`, which resolves to no contract, and both surfaces say so.
 * - *"`openWeek` rather than `{ ...week, day: 1 }`"* — the distinction is kept and the function is
 *   not. `switchWeek`'s `restart` arrival is `takeContract`, which is `openWeek` plus one field:
 *   `completed`, every scenario the player has ever cleared. Carrying it is a **fix** rather than a
 *   side effect — `openWeek` emptied it, so a player who entered free play and then took a scenario
 *   card had their clearing record wiped in memory by `takeContract`'s own carry-across.
 */

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import type { BrowserResources } from '../dev/data.js';
import { withBuilding, withFreePlayWeek, type ViewerState } from '../dev/state.js';

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
   *
   * Then `withFreePlayWeek`, which is the same sentence applied to the week — GitHub issue #125.
   * This line was `week: openWeek(contractForBuilding(selection.buildingId)?.id)` in the object
   * below, and a spread that overwrites what `withBuilding` just decided is a second answer wearing
   * the first one's clothes: on the campaign's **own** building it discarded the week the player had
   * been banking against, and on any other it discarded the destination week `switchWeek` had just
   * resumed. Both are now put down rather than dropped, and the whole argument is in
   * `dev/state.ts#withFreePlayWeek`.
   */
  const withNewBuilding = withFreePlayWeek(withBuilding(state, resources, selection.buildingId));

  return {
    ...withNewBuilding,
    /*
     * Named, not inferred — `docs/16` S1, and the reason it is named survived issue #125 while its
     * evidence did not.
     *
     * It read: *"the week this returns keeps the building's contract id, so 'no contract' has never
     * meant 'no week', and the report's own defect was exactly that inference."* The first clause is
     * no longer true — a free-play week carries `FREE_PLAY_CONTRACT_ID` and resolves to nothing — and
     * the rule it was arguing for is now **more** load-bearing rather than less: with the contract
     * gone, a consumer could derive *single run* from *no contract* and be right for every case that
     * exists today, then be silently wrong the first time a sandbox run needs a sheet of its own.
     * `shift/report.ts` makes the same argument about `ReportSubject` at more length: a required
     * field cannot be forgotten by the next mode that arrives.
     */
    playMode: 'free-play',
    /*
     * **And the shell lands on the simulation** — GitHub issue #23.
     *
     * `closeMenu` hides the overlay and selects nothing, so Start dropped the player on whatever tab
     * the shell happened to be on. Reaching Free Play from the Day report therefore hid the menu and
     * left `panel-run` hidden: the reporter pressed *Start*, the screen went back to a sheet about
     * the **previous** run, and the shift they had just configured was playing on a canvas nobody
     * could see.
     *
     * It is here rather than in the shell's arm for this module's founding reason — a decision
     * written inside a click handler needs a document and a click to reach, so it cannot be tested
     * and it drifts. It is also the same fix as `docs/16` § 5 clause 6's, one arm over:
     * `open-campaign` already selects `scenarios` explicitly, because a commit that leaves the page
     * where it was is a commit whose result is somewhere else.
     */
    tab: 'run',
    dispatcherId: selection.dispatcherProfileId,
    seed: BigInt(selection.seed),
    shiftLengthS: selection.durationS,
    /*
     * The other half of the one selection, and the only place a start and a length become two ends
     * of a window. § D286.
     *
     * `null` — the whole period — is carried as `null` rather than resolved to `0`: `core` reads the
     * absence as *no window*, and a `[0, durationS)` window would be the same run carrying a key it
     * did not need, which is the byte-identity § D285 is built on.
     */
    windowStartS: selection.windowStartS,
    freePlay: {
      demandTemplateId: selection.demandTemplateId,
      arrivalRatePctPop5min: selection.arrivalRatePctPop5min,
    },
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
    /*
     * **The same argument as the two fields above, two fields over — and they were missed.**
     *
     * `viewer.calendar` and `viewer.commissioning` are not axes this menu offers either. The
     * calendar select lives on the *Scenarios* screen (`screens.ts#campaignRows`) and the fabric on
     * its own; neither appears among the six a Free Play selection names. So a player who put a
     * vacation week over their campaign, or commissioned an extra shaft, and then started a free-play
     * run got that week's population factor and that fabric's cars applied to a run the screen had
     * just described as *"the building as it ships"*. `dev/state.ts#shiftRunConfigOf` reads both —
     * `commissionedBuilding(authored, state.commissioning, classes)` and
     * `calendarDayFor(state.calendar, …)` — so this is a live chain, not a dormant field.
     *
     * `withBuilding` above clears the fabric **only when the building actually moves**, which is
     * right for a re-pick and wrong here: taking a leaderboard row's configuration is very often the
     * building already loaded, and that is precisely the case where the commissioned shaft would have
     * survived into a run claiming to be the authored one.
     *
     * ## Why this is not the decision GitHub issue #129 is holding open
     *
     * #129 asks whether a *deliberately* commissioned or calendared run should be **refused** by
     * `scope/runIdentity.ts` or **carried** by `RunSubmission`, and warns that answering it in one
     * consumer and not the other is the two-answer state a replay-verified board cannot survive.
     * Nothing here answers it: no refusal is added, no field is added, and a campaign run under a
     * vacation week is exactly as postable as it was. What changes is only what a **free-play**
     * selection inherits, which is this module's own stated rule and was already applied to the held
     * car and the levers.
     *
     * `commissioningConstraintId` is deliberately **not** reset. It decides what the commissioning
     * screen will *let* a player move and reaches no run — `state.ts` says so where it is declared —
     * so clearing it would throw away a preference to no effect on the legs.
     */
    calendar: null,
    commissioning: [],
  };
}
