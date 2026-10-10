/**
 * **A sandbox day: the scored day with the player's changes, standing over the week and never on
 * it** — wave AO, lane AO-2, [§ D1368](../../../../DECISIONS.md), the post-AN panel's seat D (D3).
 *
 * ## What was wrong
 *
 * *Change it anyway — the day stops counting* opens *Tune the tower*, and its primary used to press
 * `applyBuildingSpec` and `applyPatternSpec` straight into the player's state. Three things followed,
 * all measured on the built bundle:
 *
 * 1. **No change could run.** Every press saved a pattern, and on a building with an authored day
 *    the run uses the day's record, which `core` refuses a pattern's peak hold and off-peak level
 *    against; the stage said *"Today's day could not be simulated"* to *How busy* 12 → 11.5 and to
 *    door dwell *patient* alike (`authoring/patternSpec.ts#demandTheTemplateTakes` is that fix).
 * 2. **The week was the sandbox's.** `applyBuildingSpec` goes through `withBuilding`, which stood the
 *    live week on `SANDBOX_CONTRACT_ID` and the building on a copy (`bld-1`). The save wrote that pair
 *    the moment the week moved, so a reload opened on a sandbox week with no tower behind it, which
 *    the restore answers with the state's default building: Garden Apartments, and *"you have not
 *    played here"* on Midtown. Until the reload the brief read the copy: *People 1,900*, *tower bld-1*.
 * 3. **Door dwell was written on the press of the chip**, before any run, straight into the levers
 *    the scored day runs under; leaving the tuner without running kept it.
 *
 * ## What it is now
 *
 * The tuner holds every change until *Run it and watch*, and that press hands them here, through the
 * host's `runSandbox`. {@link sandboxBeforeOf} keeps what any press writes; {@link sandboxPatchOf}
 * stands the run on a copy of the week's day on `shift/week.ts#SANDBOX_DAY_CONTRACT_ID` (one of the
 * mode weeks the save never writes) with the week itself parked, and writes the changes; and
 * {@link sandboxRestorePatchOf} puts every one of those fields back when the player leaves the stage
 * and the report. So the week's tower, day, crowd and building id are the ones the brief had, in the
 * page and after a reload, whatever the sandbox did.
 *
 * **A building the player did not change is not copied.** The run then stands on the week's own
 * tower id, and `shift/ladder.ts#rungFor` hands a week on no contract that tower's rung, so a sandbox
 * day that moved only the crowd or the doors meets the tower its day hands over: the same population,
 * the same bank and the same booked car. A changed tower is a copy, saved to the library as the
 * designer saves one, and it is copied from the tower as the day hands it over (the host's
 * `sandboxStanding`), so it keeps the day's population; what a copy cannot keep is the contract's
 * own bookings, because a rung belongs to the tower it names.
 *
 * Pure, so the session's three halves are checked without a document (`sandbox.test.ts`); the host
 * owns the session and the run, and `everyday/shell.ts#go` owns when it ends.
 */

import type { BuildingSpec } from '../authoring/buildingSpec.js';
import type { DwellChoice } from '../authoring/dispatcherSpec.js';
import type { PatternSpec } from '../authoring/patternSpec.js';
import { savedBuildingFrom } from '../dev/buildingEditor.js';
import type { BrowserResources } from '../dev/data.js';
import { nextSavedId } from '../dev/dispatcherEditor.js';
import type { ViewerState } from '../dev/state.js';
import { openSandboxDay } from '../shift/week.js';

/**
 * What *Run it and watch* hands the host: each part only where its own controls moved, so an
 * unmoved tower stays the week's tower and an unmoved crowd stays the day's.
 */
export interface SandboxPresses {
  /** The tower card's and machine card's four, written onto the standing tower; `undefined` when none moved. */
  readonly building: BuildingSpec | undefined;
  /** The crowd card's two, written onto the standing pattern; `undefined` when neither moved. */
  readonly pattern: PatternSpec | undefined;
  /**
   * The door dwell chip, boxed, because *the dispatcher's own* is `undefined` and is a real choice:
   * `undefined` here is *not moved*, `{ choice: undefined }` is *moved to the dispatcher's own*.
   */
  readonly dwell: { readonly choice: DwellChoice | undefined } | undefined;
}

/** Whether a press moves anything at all — an untouched tuner runs the day itself, as the brief does. */
export function sandboxMoves(presses: SandboxPresses): boolean {
  return presses.building !== undefined || presses.pattern !== undefined || presses.dwell !== undefined;
}

/**
 * Every field a sandbox press writes, as it stood — {@link sandboxRestorePatchOf}'s input.
 *
 * Not the recording: the run standing is the sandbox's once it lands, and the host refuses it on the
 * way out (`abandonDay`) rather than swapping a recording under a playback it does not own, which is
 * the same split the replay keeps. The library is not put back either: a changed tower and a tuned
 * pattern are saved to it as the designer and the traffic editor save theirs, and that is where the
 * Engineer surface finds them.
 */
export type SandboxBefore = Pick<
  ViewerState,
  | 'week'
  | 'parkedWeeks'
  | 'buildingId'
  | 'commissioning'
  | 'pattern'
  | 'patternSpec'
  | 'levers'
  | 'seed'
  | 'shiftLengthS'
  | 'windowStartS'
  | 'report'
  | 'tomorrow'
>;

export function sandboxBeforeOf(state: ViewerState): SandboxBefore {
  return {
    week: state.week,
    parkedWeeks: state.parkedWeeks,
    buildingId: state.buildingId,
    commissioning: state.commissioning,
    pattern: state.pattern,
    patternSpec: state.patternSpec,
    levers: state.levers,
    seed: state.seed,
    shiftLengthS: state.shiftLengthS,
    windowStartS: state.windowStartS,
    report: state.report,
    tomorrow: state.tomorrow,
  };
}

/**
 * The state a sandbox day runs on: the week's day copied onto the sandbox day's id with the week
 * parked, and then the parts of `presses` that moved.
 *
 * The building goes in by id and without `withBuilding`, whose week arm would stand the run on the
 * player's own `SANDBOX_CONTRACT_ID` week and park the sandbox day behind it, which is the defect.
 * `commissioning` is cleared with it, as `withBuilding` clears it for any new building: a choice set
 * is keyed by the bank ids of the tower it was made for, and on a copy it would override the very
 * shafts and speed the player just set.
 */
export function sandboxPatchOf(
  state: ViewerState,
  resources: BrowserResources,
  presses: SandboxPresses,
): Partial<ViewerState> {
  const day = openSandboxDay(state.week, state.parkedWeeks);
  const building =
    presses.building === undefined
      ? {}
      : (() => {
          const saved = savedBuildingFrom(presses.building, state, resources);
          return {
            savedBuildings: [
              ...state.savedBuildings.filter((entry) => entry.id !== saved.id),
              { id: saved.id, config: saved.config },
            ],
            buildingId: saved.id,
            commissioning: [],
          };
        })();
  const pattern =
    presses.pattern === undefined
      ? {}
      : (() => {
          const id = nextSavedId('pat', [
            ...state.savedPatterns.map((entry) => entry.id),
            ...resources.trafficProfiles.profiles.map((profile) => profile.id),
          ]);
          /* `savedPatterns` and `pattern` in one patch — `host.ts#applyPatternSpec`'s rule, kept. */
          return {
            savedPatterns: [...state.savedPatterns, { id, spec: presses.pattern }],
            pattern: id,
            patternSpec: presses.pattern,
          };
        })();
  const dwell = presses.dwell === undefined ? {} : { levers: { ...state.levers, dwell: presses.dwell.choice } };
  return {
    week: day.week,
    parkedWeeks: day.parked,
    ...building,
    ...pattern,
    ...dwell,
  };
}

/** Everything {@link sandboxBeforeOf} kept, back exactly as it was. */
export function sandboxRestorePatchOf(before: SandboxBefore): Partial<ViewerState> {
  return { ...before };
}
