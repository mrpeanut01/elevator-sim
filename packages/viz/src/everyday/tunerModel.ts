/**
 * **Tune the tower's controls and words, as pure decisions** — GAMEPLAY § 3.3's tuner row and
 * § 18's `tune{floors,cars,speed,dwell,cap,rate,lobbyShare}`, split from the DOM for the reason the
 * whole of `everyday/` is split.
 *
 * ## It is a thing you do to a day, not a place you live
 *
 * § 3.2 is explicit: **Tune the tower is not a rail item.** It is reached from the brief
 * (*Take it to the sandbox*) and from the report's third lever, and an earlier draft of the guide
 * listed it in the rail — which that section names as its own mistake. `rail.ts` therefore has no
 * row for it and this lane adds none; the screen is registered and routable, and the two doors into
 * it arrive with the brief and the report.
 *
 * ## Seven controls, and every one of them writes
 *
 * `docs/05`'s standing requirement, pointed at a slider: *move the control and require the run to
 * change, compared on the legs*. Each of § 18's seven names the seam it writes, here rather than in
 * a comment, so {@link TUNE_ROWS} is checkable against the run:
 *
 * | § 18 key | control | writes | reaches the run as |
 * |---|---|---|---|
 * | `floors` | Floors above the lobby | `BuildingSpec.floors` | the building's `floors[]` |
 * | `cars` | Shafts | `BuildingSpec.cars` | `banks[].cars[]` |
 * | `speed` | Rated speed | `BuildingSpec.ratedSpeedMps` | every car's `ratedSpeedMps` |
 * | `cap` | Capacity | `BuildingSpec.ratedLoadLb` | every car's `capacityLb` |
 * | `dwell` | Door dwell | `GroupLevers.dwell` | every car's `dwellCarCallS`/`dwellHallCallS` |
 * | `rate` | How busy | `PatternSpec.ratePctPop5min` | `demand.arrivalRatePctPop5min` |
 * | `lobbyShare` | Arriving at the lobby | `PatternSpec.interfloorShare` | `demand.directionalSplit` |
 *
 * ## Three places the prototype's controls are refused, each with the reason
 *
 * - **`dwell` is three chips, not a 2–8 s slider.** The seam that reaches the run is
 *   `GroupLevers.dwell`, a three-valued choice with a fourth *inherit* state; a continuous slider
 *   over it would quantise to three values while showing sixty, which is a control that lies about
 *   its own resolution. The chips print the seconds they write, from `DWELL_SETTINGS`.
 * - **`speed` and `cap` are steps within the machine class.** ENGINE_CONTRACT § 10.1 says so, and
 *   `parseBuilding` refuses a car outside its class's band — a free slider would author documents
 *   the loader rejects, arriving as a refusal from a control the reader was not touching. The
 *   ladders are `designerModel.ts`'s, so the tuner and the drawing board offer one answer.
 * - **The prototype's fourth card is not drawn.** *The tenants* binds an occupancy slider to the
 *   `rate` key — the same key its own *How busy* row writes — so the two controls are one control
 *   with two labels, and moving either moves the other. § 18 lists seven keys and no occupancy, so
 *   the card is the prototype's own aliasing defect rather than an eighth field, and drawing it
 *   would have shipped that defect with better typography.
 *
 * ## A sandbox run is never posted, and the screen says so
 *
 * It is not a claim this module makes about itself: `tunerScreen.ts`'s primary routes every building
 * change through the host's `applyBuildingSpec`, which selects the drawn tower through
 * `withBuilding` and puts the week on `shift/week.ts#SANDBOX_CONTRACT_ID`. That is the mechanism,
 * and {@link tuneSandboxStrip}'s sentence beside it is a description of it.
 *
 * **And the converse now holds too, which it did not until GitHub issue #289.** The press was
 * unconditional, so *entering the sandbox and changing nothing* was also a sandbox run — the screen
 * said *Scored day — three things are fixed* over a day the state had already moved onto the sandbox
 * contract and re-measured on the wrong window. {@link tunePresses} is the guard, and it reads
 * {@link movedKeys} — the same predicate the strip, the stamp and § 3.3's note read — so the
 * sentence and the mechanism cannot disagree.
 *
 * **That guard needed a second fix to be worth anything, and it is the more interesting one.**
 * `movedKeys` was already non-empty on two shipped buildings *before the player touched anything*,
 * because the machine card's ladder could not express what they are specified at and
 * `tunerScreen.ts` snapped the document onto it on mount. See {@link tuneMachineSteps}: a predicate
 * that believes a control moved is a guard that presses as though one had.
 */

import { personsOf, type BuildingSpec } from '../authoring/buildingSpec.js';
import {
  DWELL_CHOICES,
  DWELL_SETTINGS,
  type DwellChoice,
} from '../authoring/dispatcherSpec.js';
import type { MachineClass } from '../authoring/machineSpec.js';
import type { PatternSpec } from '../authoring/patternSpec.js';
import type { ActionBarModel } from './actionBar.js';
import { loadStepsFor, speedStepsFor, stepAtOrBelow } from './designerModel.js';
import { speedFigure, type EverydayUnits } from './units.js';

/* -------------------------------------------------------------------------- *
 * The state — § 18's seven, and nothing else
 * -------------------------------------------------------------------------- */

/** § 18's `tune{…}`, as this screen holds it. Seven fields; the guide names seven. */
export interface TuneState {
  readonly floors: number;
  readonly cars: number;
  readonly speed: number;
  readonly cap: number;
  readonly dwell: DwellChoice | undefined;
  readonly rate: number;
  /** Percent of trips that touch an entrance floor. The complement of `interfloorShare`. */
  readonly lobbyShare: number;
}

export type TuneKey = keyof TuneState;

/**
 * Read the seven out of what is standing, so the screen opens on the day rather than on a default.
 *
 * `lobbyShare` is `100 − interfloorShare × 100`, and the two are exact complements rather than
 * approximately so: `PatternSpec.interfloorShare`'s own help calls it *the share of trips that never
 * touch an entrance floor*, so its complement is the share that do — which is what a player reading
 * *arriving at the lobby · rest is floor to floor* is being told. Both directions round to whole
 * percent because the control's step is a percent.
 */
export function tuneStateFrom(
  building: BuildingSpec,
  pattern: PatternSpec,
  dwell: DwellChoice | undefined,
): TuneState {
  return {
    floors: building.floors,
    cars: building.cars,
    speed: building.ratedSpeedMps,
    cap: building.ratedLoadLb,
    dwell,
    rate: pattern.ratePctPop5min,
    lobbyShare: Math.round((1 - pattern.interfloorShare) * 100),
  };
}

/** The drawn building, with the four fields the tower and machine cards own written onto it. */
export function buildingWithTune(spec: BuildingSpec, tune: TuneState): BuildingSpec {
  return {
    ...spec,
    floors: tune.floors,
    cars: tune.cars,
    ratedSpeedMps: tune.speed,
    ratedLoadLb: tune.cap,
  };
}

/**
 * The demand, with the crowd card's two written onto it.
 *
 * The name carries the tuning so a saved pattern is recognisable in the Engineer traffic list — a
 * shelf of five entries all called *Standard office up-peak* is a list that cannot be read.
 */
export function patternWithTune(spec: PatternSpec, tune: TuneState): PatternSpec {
  return {
    ...spec,
    name: `Tuned — ${String(tune.rate)}%pop/5 min, ${String(tune.lobbyShare)}% through the lobby`,
    ratePctPop5min: tune.rate,
    interfloorShare: Math.round((100 - tune.lobbyShare)) / 100,
  };
}

/** Which of the seven differ from what is standing — the *what you changed* set. */
export function movedKeys(from: TuneState, to: TuneState): readonly TuneKey[] {
  const keys: TuneKey[] = ['floors', 'cars', 'speed', 'cap', 'dwell', 'rate', 'lobbyShare'];
  return keys.filter((key) => from[key] !== to[key]);
}

/**
 * What *Run it and watch* writes before it runs — GitHub issue **#289**.
 *
 * ## The defect: entering the sandbox and changing nothing re-measured the building
 *
 * The primary pressed `applyBuildingSpec(buildingWithTune(standing, tune))` **unconditionally**, on
 * every press, whether or not a control had been touched. `applyBuildingSpec` allocates a *fresh
 * id* and selects the result through `withBuilding`, so an untouched press turned
 * `garden-apartments` into `bld-1` — a document byte-identical to the one it was copied from,
 * wearing a name the matrix has never measured.
 *
 * `shift/reportWindow.ts#shiftReportWindowFor` is keyed on that name. Garden Apartments is the one
 * shipped building whose every matrix cell declares `full-run`, and the reason is measured rather
 * than stylistic: at its rates the peak five minutes holds **0 to 25** arrivals of a day averaging
 * 38.6, so the narrow band is empty on 14 seeds in 500 and the sheet then withholds *both* headline
 * figures under *"the reporting window held no arrivals"*. Copied to `bld-1` the rule returns
 * `undefined` — *leave the template's band alone* — and `docs/20` defect 5 came back on the one
 * screen that had never been on `reportWindow.ts`'s list of callers. Measured: the same day, run
 * from the tuner, reported `peak-5min` where the scored route reported `full-run`.
 *
 * ## Why the guard is *anything moved* rather than *the building moved*
 *
 * The narrower guard is the tempting one and it is wrong. Standing the week on
 * `shift/week.ts#SANDBOX_CONTRACT_ID` is something only `applyBuildingSpec` does — it is
 * `withBuilding`'s doing, and there is no other door to it. So a press that skipped the building
 * because only *How busy* had moved would run a **re-timed crowd against a scored assignment**:
 * {@link tuneSandboxStrip} would say *Sandbox — nothing counts* while `closeDay` banked the day
 * against Scenario 1. That is the forgery `dev/buildingEditor.ts#stateRunningSaved` exists to
 * prevent, arriving from the opposite direction, and it would have been a *new* defect shipped to
 * close this one.
 *
 * So one predicate decides everything: {@link movedKeys}. It already drives the strip, the stamp
 * and § 3.3's two-state note, and now it drives the presses too — which is what makes the screen and
 * the state agree **by construction** rather than by two authors remembering the same rule.
 *
 * ## Both documents or neither, and an untouched tuner runs the standing day
 *
 * {@link tunerBarModel}'s docstring already stated this as the contract — *"an untouched tuner runs
 * the standing day, which is what Scored day — three things are fixed means"* — and the code
 * contradicted it. It does not any more: with nothing moved, nothing is written, the run is the one
 * the daily loop would have made, and the id `shiftReportWindowFor` is asked about is the authored
 * one.
 *
 * A **genuinely tuned** building keeps the old behaviour exactly, including the fall-through to the
 * template's band, and that is correct rather than tolerated: a drawn tower has no matrix cell, and
 * inventing a window for a building nobody censused is what `reportWindow.ts`'s last paragraph
 * refuses.
 *
 * @param building what is standing, as {@link tuneStateFrom} read it
 * @param pattern the demand that is standing, likewise
 * @param standing the tune read off those two on mount — the *before* side of {@link movedKeys}
 * @param tune what the seven controls hold now
 */
export function tunePresses(
  building: BuildingSpec,
  pattern: PatternSpec,
  standing: TuneState,
  tune: TuneState,
): TunePresses {
  if (movedKeys(standing, tune).length === 0) return { building: undefined, pattern: undefined };
  return { building: buildingWithTune(building, tune), pattern: patternWithTune(pattern, tune) };
}

/**
 * The documents {@link tunePresses} hands the primary. `undefined` is *press nothing*, which is a
 * different instruction from *press this unchanged copy* — the copy takes a new id and a new
 * contract, which is the whole of issue #289.
 */
export interface TunePresses {
  readonly building: BuildingSpec | undefined;
  readonly pattern: PatternSpec | undefined;
}

/* -------------------------------------------------------------------------- *
 * The rows — the prototype's copy, over the seams above
 * -------------------------------------------------------------------------- */

/** One stepped control. `steps` is the ladder; the DOM half draws it as a range over indices. */
export interface TuneRow {
  readonly key: Exclude<TuneKey, 'dwell'>;
  readonly label: string;
  readonly hint: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** Named so the claim is checkable against the run — see the module docstring's table. */
  readonly writes: string;
}

/** One card of § 3.3's tuner screen — the prototype's three, minus its aliased fourth. */
export interface TuneCard {
  readonly name: string;
  readonly sub: string;
  readonly effect: string;
  readonly rows: readonly TuneRow[];
  /** True on the card that also carries the dwell chips. */
  readonly dwellChips: boolean;
}

/**
 * The rows, in the prototype's cards. Bounds follow the shipped authoring model's own sliders
 * (`SPEC_ROWS`, `PATTERN_ROWS`) wherever it has one for the same field, because a tuner that
 * offered a floor count the building editor refuses would be two surfaces disagreeing about what a
 * building can be.
 */
export const TUNE_CARDS: readonly TuneCard[] = Object.freeze([
  {
    name: 'The tower',
    sub: 'shape and height',
    effect:
      'Taller means longer round trips; the same cars cover more ground and everybody waits a ' +
      'little more.',
    dwellChips: false,
    rows: [
      {
        key: 'floors',
        label: 'Floors above the lobby',
        hint: 'the lobby stays at the bottom',
        unit: '',
        min: 3,
        max: 120,
        step: 1,
        writes: 'floors[] — plus the lobby, which is always floor 0',
      },
      {
        key: 'cars',
        label: 'Shafts',
        hint: 'how many cars run at all',
        unit: '',
        min: 1,
        max: 12,
        step: 1,
        writes: 'banks[].cars[]',
      },
    ],
  },
  {
    name: 'The machines',
    sub: 'speed, capacity, doors',
    effect:
      'Faster cars help tall buildings. On a short tower the doors matter far more than the speed ' +
      'does.',
    dwellChips: true,
    rows: [],
  },
  {
    name: 'The crowd',
    sub: 'who arrives, and where from',
    effect:
      'The morning is the test. Push arrivals up and every dispatcher looks the same: overwhelmed.',
    dwellChips: false,
    rows: [
      {
        key: 'rate',
        label: 'How busy',
        hint: 'percent of the population arriving every five minutes',
        unit: ' %pop/5 min',
        min: 1,
        max: 25,
        step: 0.5,
        writes: 'demand.arrivalRatePctPop5min',
      },
      {
        key: 'lobbyShare',
        label: 'Arriving at the lobby',
        hint: 'the rest is floor to floor',
        unit: '%',
        min: 30,
        max: 100,
        step: 1,
        writes: 'demand.directionalSplit — the complement of its interfloor share',
      },
    ],
  },
]);

/** How a row's value reads on screen, in the unit the run takes it in. */
export function tuneReadout(row: TuneRow, tune: TuneState): string {
  const value = tune[row.key];
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
  return `${shown}${row.unit}`;
}

/** The machine card's two stepped controls, as the ladders the current class is built in. */
export interface TuneMachineSteps {
  readonly speeds: readonly number[];
  readonly loads: readonly number[];
}

/**
 * The ladders, from the design's own class — `designerModel.ts`'s, so the two screens offer one
 * answer about what a machine comes in — **plus whatever the standing building actually has.**
 *
 * A class this build does not have leaves both ladders holding only what is currently set, which is
 * a stepper that cannot move rather than one that offers a step the loader would refuse.
 *
 * ## Why the standing value joins the ladder, which is a defect fix rather than a nicety
 *
 * `speedStepsFor` filters § 10.1's **catalogue** to the class's band, and a shipped building is
 * under no obligation to have been specified at a catalogue speed. Two of the eight are not:
 * `garden-apartments` runs at **0.63 m/s** where its hydraulic class offers `0.50` and `0.75`, and
 * `crown-hotel` at **3.0** where gearless offers `2.5, 3.5, 4, 5, 7`. Both values are inside their
 * class's band — `parseBuilding` loads them, which is how they ship — they are simply not chips.
 *
 * Without them the ladder cannot express what is standing, and `tunerScreen.ts`'s `redraw` then
 * snapped the *document* down to the nearest chip **on mount, before the player touched anything**:
 * Garden Apartments opened 21 % slower than the building it claimed to be, `movedKeys` reported
 * `['speed']` on an untouched screen, and the strip said *Sandbox — nothing counts* over an edit
 * nobody had made. It also defeated issue #289's guard on the one building that issue is about,
 * because a tuner that believes a control moved presses as though one had.
 *
 * The comment that governed that snap said it was *"only reachable through a class change, which
 * this screen does not offer today"*. That was a stated mechanism that had gone stale — it is
 * reachable on two shipped buildings with no class change at all, which is measured in
 * `tunerModel.test.ts` over every building in `data/buildings/` rather than asserted here.
 *
 * **The snap is kept, and it still guards what it was written to guard.** A class change narrows
 * the band, the standing value then falls outside it, this function does not offer it, and
 * {@link snapToStep} moves the design onto a step the loader will accept. What changes is only that
 * a value the loader *already accepts* is no longer treated as one it would refuse.
 *
 * @param standing the seven as {@link tuneStateFrom} read them off the building — the values that
 *   have to be expressible, as opposed to `tune`, which is where the controls are now. Adding
 *   `tune`'s own values instead would make the ladder contain every value it is ever asked about
 *   and the snap could never fire, which is the class-change guard deleted by accident. It is
 *   **required rather than defaulted to `tune`** for exactly that reason: a default is that mistake
 *   pre-made, waiting for the first caller who does not read this paragraph.
 */
export function tuneMachineSteps(
  machineClass: MachineClass | undefined,
  tune: TuneState,
  standing: TuneState,
): TuneMachineSteps {
  if (machineClass === undefined) return { speeds: [tune.speed], loads: [tune.cap] };
  return {
    speeds: withStanding(
      speedStepsFor(machineClass),
      standing.speed,
      machineClass.speedMinMps,
      machineClass.speedMaxMps,
    ),
    loads: withStanding(
      loadStepsFor(machineClass),
      standing.cap,
      machineClass.loadMinLb,
      machineClass.loadMaxLb,
    ),
  };
}

/** A ladder with `value` in it, if the class admits it and it is not a step already. Sorted. */
function withStanding(
  steps: readonly number[],
  value: number,
  min: number,
  max: number,
): readonly number[] {
  if (value < min || value > max || steps.includes(value)) return steps;
  return [...steps, value].sort((a, b) => a - b);
}

/** Snap a value onto a ladder — used when a class change narrows one under a set value. */
export function snapToStep(steps: readonly number[], value: number): number {
  return stepAtOrBelow(steps, value);
}

/**
 * The machine card's speed readout, in the units the plate uses.
 *
 * *In the units the plate uses* was a sentence about precision when it was written and is a
 * sentence about the `Units` preference now (GitHub issue #170,
 * [§ D448](../../../../DECISIONS.md)): § 13.2's rating plate reads metres or feet, and this readout
 * is the same machine specification on another screen. Two answers to that would be a player
 * setting feet on Settings and meeting `m/s` here.
 */
export function tuneSpeedReadout(tune: TuneState, units: EverydayUnits): string {
  return speedFigure(tune.speed, units);
}

export function tuneCapacityReadout(tune: TuneState): string {
  return `${String(tune.cap)} lb · ${String(personsOf(tune.cap))} people`;
}

/* -------------------------------------------------------------------------- *
 * Door dwell — three chips and a fourth state
 * -------------------------------------------------------------------------- */

/** One dwell chip. `undefined` is the fourth state and is a chip too, because it is a choice. */
export interface TuneDwellChip {
  readonly choice: DwellChoice | undefined;
  readonly label: string;
  /** What it writes, in seconds, so the chip's own effect is on the chip. */
  readonly seconds: string;
  readonly selected: boolean;
}

/**
 * The dwell chips: the three settings, plus *the dispatcher's own*.
 *
 * The fourth is drawn as a chip rather than as an absence because it is a real value —
 * `GroupLevers.dwell`'s `undefined` means *do not write a dwell at all*, which is what lets a
 * profile that authored `dwellPolicy: 'adaptive'` keep it. A screen that offered only three would
 * have no way back to it once a chip was pressed, which is the state this repository lost once
 * already (`dispatcherSpec.ts#GroupLevers.dwell`'s own docstring records it).
 *
 * The seconds are `DWELL_SETTINGS`', read rather than restated.
 */
export function tuneDwellChips(selected: DwellChoice | undefined): readonly TuneDwellChip[] {
  const chips: TuneDwellChip[] = DWELL_CHOICES.map((choice) => ({
    choice,
    label: choice,
    seconds: `${String(DWELL_SETTINGS[choice].dwellCarCallS)} s / ${String(DWELL_SETTINGS[choice].dwellHallCallS)} s`,
    selected: selected === choice,
  }));
  chips.push({
    choice: undefined,
    label: 'the dispatcher’s own',
    seconds: 'whatever the profile authored',
    selected: selected === undefined,
  });
  return chips;
}

/* -------------------------------------------------------------------------- *
 * The sandbox strip, and § 3.3's note
 * -------------------------------------------------------------------------- */

/** The strip above the cards — the prototype's `sandboxState` / `sandboxNote` pair, derived. */
export interface TuneSandboxStrip {
  readonly state: string;
  readonly note: string;
}

/**
 * The strip, **derived from what has moved** rather than from a toggle.
 *
 * The prototype has an *Unlock everything* button and a `sandbox` flag, and this build has neither:
 * a run becomes a sandbox run by the fact of the tower being drawn rather than by a switch, because
 * `applyBuildingSpec` selects a saved building through `withBuilding`, which puts the week on the
 * sandbox contract. So the strip reports the state the seven controls have already produced, which
 * is a statement about the run rather than a promise about it — and a switch beside it would be a
 * second, disagreeing, source for the same fact.
 */
export function tuneSandboxStrip(moved: readonly TuneKey[]): TuneSandboxStrip {
  if (moved.length === 0) {
    return {
      state: 'Scored day — three things are fixed',
      note: 'The tower, the machines and the crowd match everyone else. Move any of them and today stops counting.',
    };
  }
  return {
    state: 'Sandbox — nothing counts',
    note: 'Change anything you like. The run will not be posted, and the bench still works.',
  };
}

/** The screen's own chrome, beside the strip. */
export const TUNER_COPY = Object.freeze({
  title: 'Tune the tower',
  lede:
    'Everything here is live. Change any of it and the day still runs — it just stops counting on ' +
    'today’s board.',
  stampMoved: 'This run will be stamped “sandbox”',
  stampClean: 'Nothing changed yet',
  stampMovedBody:
    'Every figure it produces carries the changes you made, so a sandbox day can never be mistaken ' +
    'for a scored one.',
  stampCleanBody: 'The day still matches everyone else’s. Run it whenever you are ready.',
  dwellLabel: 'Door dwell',
  dwellHint: 'how long the doors stay open',
  speedLabel: 'Rated speed',
  capLabel: 'Capacity',
  stepsHint: 'Rated speed and capacity are steps within the machine class, not free numbers.',
  writesEyebrow: 'WHAT IT WRITES',
  noBuilding: 'the standing building is one this build does not know, so there is nothing to tune',
} as const);

/**
 * § 3.3's tuner note, picked between the row's own two variants **by index**.
 *
 * The guide gives the cell two states — *Sandbox — this run will not be scored.* and
 * *Scored day — three things are fixed.* — and picking by index rather than by restating a string
 * is `fixitBarModel`'s rule: a reworded § 3.3 cell moves here on the same commit.
 */
export function tunerNoteFor(variants: readonly string[], moved: readonly TuneKey[]): string {
  const [sandbox, scored] = variants;
  return (moved.length > 0 ? sandbox : scored) ?? '';
}

/**
 * § 3.3's tuner row, resolved — the `bar()` refinement `screens.ts` contracts.
 *
 * One cell edited: the note, which the table ships as a two-state `noteVariants` pair with no
 * `note`. The primary (*Run it and watch*) is the row's own and is never inert here, because there
 * is always a run to make — an untouched tuner runs the standing day, which is what *Scored day —
 * three things are fixed* means.
 */
export function tunerBarModel(base: ActionBarModel, moved: readonly TuneKey[]): ActionBarModel {
  return { ...base, note: tunerNoteFor(base.noteVariants ?? [], moved) };
}
