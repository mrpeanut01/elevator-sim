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
import type { ShiftRunConfig, ViewerState } from '../dev/state.js';
import { weekdayOf, type WeekState } from '../shift/types.js';
import { openSandboxDay } from '../shift/week.js';
import { weekHasClosed } from '../shift/weekStake.js';

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
  /**
   * The player left the day's wrinkle and its booked cars out — wave AP lane AP-D2,
   * [§ D1451](../../../../DECISIONS.md). Absent or `false`, the sandbox day is dealt the day it copies
   * (`shift/types.ts#dealtKeyOf`), which is the default the post-AO panel's seat B (D1) asked for.
   */
  readonly plainDay?: boolean | undefined;
}

/**
 * Whether a press moves anything at all. Since wave AP lane AP-D2 ([§ D1451](../../../../DECISIONS.md))
 * an untouched tuner runs a sandbox day as well, so this decides the strip's words and no longer which
 * press is made.
 */
export function sandboxMoves(presses: SandboxPresses): boolean {
  return (
    presses.building !== undefined ||
    presses.pattern !== undefined ||
    presses.dwell !== undefined ||
    presses.plainDay === true
  );
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
  /* § D1451: the copy keeps what the day was dealt as, and the tower it stood on, unless left out. */
  const day = openSandboxDay(state.week, state.parkedWeeks, {
    buildingId: state.buildingId,
    plain: presses.plainDay === true,
  });
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

/* -------------------------------------------------------------------------- *
 * What the sandbox day carries of the day, and where the week is — § D1451
 * -------------------------------------------------------------------------- */

/** What {@link sandboxCarriedLineOf} compares: a run's wrinkle and the bookings it took. */
export type SandboxDayMakeup = Pick<ShiftRunConfig, 'event' | 'bookings'>;

const carsOf = (makeup: SandboxDayMakeup): readonly string[] =>
  [...new Set((makeup.bookings ?? []).map((incident) => incident.car.carId))].sort((a, b) => a.localeCompare(b));

/** `car D`, `cars C and D`, `cars B, C and D`. */
function carListOf(cars: readonly string[]): string {
  if (cars.length === 1) return `car ${cars[0] ?? ''}`;
  return `cars ${cars.slice(0, -1).join(', ')} and ${cars.at(-1) ?? ''}`;
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
}

/**
 * **What a sandbox day kept of the day it copied, and what it left out, with why** — wave AP lane
 * AP-D2, [§ D1451](../../../../DECISIONS.md), the post-AO panel's seat B (D1): week 2's Monday, car D
 * booked out 10:30–13:00, *Open the sandbox*, 3000 lb, and the close read *An ordinary day — nothing
 * booked* and *Shift cleared*, so the clear read as *bigger cars fixed it*. The sandbox now runs the
 * day's wrinkle and bookings, and this sentence names both on its stage and its close, and names
 * anything it could not carry: everything when the player left them out, and a booking on a car the
 * changed tower no longer has.
 *
 * Read off the two runs' own plans (`dev/state.ts#shiftRunConfigOf`'s `event` and `bookings`), so it
 * says what each run took rather than what this module expects. `undefined` on a day with neither.
 */
export function sandboxCarriedLineOf(day: SandboxDayMakeup, sandbox: SandboxDayMakeup, plain: boolean): string | undefined {
  const wrinkle = day.event.effect.changesNothing ? undefined : day.event.name;
  const wrinkleKept = wrinkle !== undefined && sandbox.event.id === day.event.id;
  const dayCars = carsOf(day);
  const keptCars = carsOf(sandbox).filter((car) => dayCars.includes(car));
  const lostCars = dayCars.filter((car) => !keptCars.includes(car));
  if (wrinkle === undefined && dayCars.length === 0) return undefined;
  const kept = [
    ...(wrinkleKept ? [`the day’s wrinkle (${wrinkle})`] : []),
    ...(keptCars.length === 0 ? [] : [`${carListOf(keptCars)} booked out of passenger service as the day had`]),
  ];
  const left = [
    ...(wrinkle !== undefined && !wrinkleKept ? [`the day’s wrinkle (${wrinkle})`] : []),
    ...(lostCars.length === 0 ? [] : [`the booking of ${carListOf(lostCars)}`]),
  ];
  const why = plain
    ? 'because you left the day’s wrinkle and bookings out'
    : `because the tower you changed has no ${carListOf(lostCars)}`;
  const keeps = kept.length === 0 ? '' : `This sandbox day keeps ${listOf(kept)}.`;
  const leaves = left.length === 0 ? '' : `${kept.length === 0 ? 'This sandbox day leaves out' : 'It leaves out'} ${listOf(left)}, ${why}.`;
  return [keeps, leaves].filter((part) => part !== '').join(' ');
}

/**
 * **Where the week a sandbox day stood over is** — wave AP lane AP-D2, the post-AO panel's seat B
 * (D1): the close said *your week is still on this day* when the day was closed and the week's next
 * press was Tuesday's. Read off the week the sandbox parked (`SandboxBefore.week`).
 */
export function sandboxWeekLineOf(week: WeekState): string {
  const weekday = weekdayOf(week.dayIdx);
  if (weekHasClosed(week)) return 'Your week is where you left it: it has closed, and its sheet is as you left it.';
  if (week.closedDay === week.day) {
    return `Your week is where you left it: ${weekday} is closed as you closed it, and ${weekdayOf((week.dayIdx + 1) % 7)} is next.`;
  }
  return `Your week is where you left it, on ${weekday}, which you have not closed.`;
}
