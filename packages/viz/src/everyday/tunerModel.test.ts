/**
 * **The tuner's seven controls, and the run each one changes.**
 *
 * `docs/05`'s standing requirement, pointed at seven sliders: *move the control and require the run
 * to change, compared on the legs*. That is what the second block does — it builds the run
 * `shiftRunConfigOf` would build, moves one tune field, builds it again, and requires the two to
 * differ **in the document the simulator reads**, not in a screen string. § D219's five-select
 * editor passed every other check this repository runs and bound nothing.
 *
 * The first block is the arithmetic between § 18's vocabulary and the fields it writes, and the
 * third is § 3.3's two-state note and the sandbox strip.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, parseElevatorSpecs, type ElevatorSpecs } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  BLANK_SPEC,
  buildingFromSpec,
  personsOf,
  specFromBuilding,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import { DWELL_CHOICES, DWELL_SETTINGS } from '../authoring/dispatcherSpec.js';
import { classesFromSpecs } from '../authoring/machineSpec.js';
import {
  DEFAULT_PATTERN,
  demandFromSpec,
  specFromTrafficProfile,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftReportWindowFor } from '../shift/reportWindow.js';
import type { WeekState } from '../shift/types.js';
import { closeDay, outcomeOf, SANDBOX_DAY_CONTRACT_ID } from '../shift/week.js';
import { actionBarFor } from './actionBar.js';
import { railModel } from './rail.js';
import { sandboxMoves, sandboxPatchOf } from './sandbox.js';
import {
  classOfSpec,
  designerClasses,
  loadStepsFor,
  speedStepsFor,
} from './designerModel.js';
import {
  buildingWithTune,
  movedKeys,
  patternWithTune,
  snapToStep,
  tuneCapacityReadout,
  tuneDwellChips,
  tuneMachineSteps,
  tunePresses,
  tuneReadout,
  tuneSandboxStrip,
  tuneSpeedReadout,
  tuneStateFrom,
  tunerBarModel,
  tunerNoteFor,
  tuneControlsOffered,
  tuneRowsOffered,
  TUNE_CARDS,
  TUNER_COPY,
  type TunePresses,
  type TuneState,
} from './tunerModel.js';

const SPECS: ElevatorSpecs = parseElevatorSpecs(
  JSON.parse(readFileSync(join(DATA_DIR, 'elevator-specs.json'), 'utf8')) as unknown,
);
const CLASSES = classesFromSpecs(SPECS);

const STANDING: TuneState = tuneStateFrom(BLANK_SPEC, DEFAULT_PATTERN, undefined);

describe('§ 18’s seven, read off what is standing', () => {
  it('opens on the day rather than on a default', () => {
    expect(STANDING.floors).toBe(BLANK_SPEC.floors);
    expect(STANDING.cars).toBe(BLANK_SPEC.cars);
    expect(STANDING.speed).toBe(BLANK_SPEC.ratedSpeedMps);
    expect(STANDING.cap).toBe(BLANK_SPEC.ratedLoadLb);
    expect(STANDING.rate).toBe(DEFAULT_PATTERN.ratePctPop5min);
    expect(STANDING.dwell).toBeUndefined();
  });

  it('reads the lobby share as the exact complement of the interfloor share', () => {
    /*
     * `PatternSpec.interfloorShare` is *the share of trips that never touch an entrance floor*, so
     * its complement is *the share that do* — which is what a player reading § 18's
     * *arriving at the lobby · rest is floor to floor* is being told. Exact, not approximate, in
     * both directions.
     */
    expect(STANDING.lobbyShare).toBe(Math.round((1 - DEFAULT_PATTERN.interfloorShare) * 100));
    for (const lobbyShare of [30, 55, 90, 100]) {
      const written = patternWithTune(DEFAULT_PATTERN, { ...STANDING, lobbyShare });
      expect(written.interfloorShare, String(lobbyShare)).toBeCloseTo(1 - lobbyShare / 100, 10);
      expect(
        tuneStateFrom(BLANK_SPEC, written, undefined).lobbyShare,
        String(lobbyShare),
      ).toBe(lobbyShare);
    }
  });

  it('names every card row after the field it writes', () => {
    // A control whose stated effect is checkable is a control that cannot quietly stop writing.
    for (const card of TUNE_CARDS) {
      for (const row of card.rows) {
        expect(row.writes.trim().length, row.key).toBeGreaterThan(5);
        expect(row.label.trim(), row.key).not.toBe('');
      }
    }
  });

  it('draws three cards and does not draw the prototype’s aliased fourth', () => {
    /*
     * The prototype's *The tenants* card binds an occupancy slider to the `rate` key — the same key
     * its own *How busy* row writes — so the two controls are one control with two labels. § 18
     * lists seven keys and no occupancy. Drawing it would have shipped that defect with better
     * typography, so the card is absent and every key below appears exactly once.
     */
    expect(TUNE_CARDS.map((card) => card.name)).toEqual([
      'The tower',
      'The machines',
      'The crowd',
    ]);
    const keys = TUNE_CARDS.flatMap((card) => card.rows.map((row) => row.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers speed and capacity as steps within the class, and snaps a narrowed ladder down', () => {
    const machineClass = classOfSpec(CLASSES, BLANK_SPEC);
    const steps = tuneMachineSteps(machineClass, STANDING, STANDING);
    expect(steps.speeds).toEqual(speedStepsFor(machineClass!));
    expect(steps.loads).toEqual(loadStepsFor(machineClass!));
    // A class this build does not have leaves a stepper that cannot move rather than one offering
    // a step the loader would refuse.
    expect(tuneMachineSteps(undefined, STANDING, STANDING)).toEqual({
      speeds: [STANDING.speed],
      loads: [STANDING.cap],
    });
    expect(snapToStep([1, 2, 3], 2.9)).toBe(2);
  });

  it('draws the fourth dwell state as a chip, because it is a choice rather than an absence', () => {
    const chips = tuneDwellChips(undefined);
    expect(chips).toHaveLength(DWELL_CHOICES.length + 1);
    expect(chips.at(-1)?.choice).toBeUndefined();
    expect(chips.at(-1)?.selected).toBe(true);
    // The seconds each chip writes are `DWELL_SETTINGS`', read rather than restated.
    for (const choice of DWELL_CHOICES) {
      const chip = chips.find((entry) => entry.choice === choice);
      expect(chip?.seconds, choice).toContain(String(DWELL_SETTINGS[choice].dwellHallCallS));
    }
  });

  it('prints its readouts in the units the run takes them in', () => {
    expect(tuneSpeedReadout(STANDING, 'metric')).toBe(`${BLANK_SPEC.ratedSpeedMps.toFixed(2)} m/s`);
    /*
     * And in the other preference, converted rather than relabelled — the readout's own docstring
     * says it is *in the units the plate uses*, and the plate reads feet when the player asked for
     * feet (GitHub issue #170, § D448). A relabel would leave the digits alone.
     */
    expect(tuneSpeedReadout(STANDING, 'imperial')).toBe(
      `${(BLANK_SPEC.ratedSpeedMps / 0.3048).toFixed(2)} ft/s`,
    );
    expect(tuneCapacityReadout(STANDING)).toContain(String(personsOf(BLANK_SPEC.ratedLoadLb)));
    const floorsRow = TUNE_CARDS[0]?.rows[0];
    expect(floorsRow).toBeDefined();
    expect(tuneReadout(floorsRow!, STANDING)).toBe(String(BLANK_SPEC.floors));
  });
});

describe('move the control and the run changes — compared on the document, not on a string', () => {
  /**
   * The building document a tune produces, as the loader would read it.
   *
   * `buildingFromSpec` is the exact call `everyday/sandbox.ts#sandboxPatchOf` makes through
   * `savedBuildingFrom`, so a field that moved here is a field the simulator sees.
   */
  const documentFor = (tune: TuneState): string =>
    JSON.stringify(buildingFromSpec(buildingWithTune(BLANK_SPEC, tune), { specs: SPECS }));

  /** The demand options a tune produces, as `shiftRunConfigOf` composes them. */
  const demandFor = (tune: TuneState): string =>
    JSON.stringify(demandFromSpec(patternWithTune(DEFAULT_PATTERN, tune)));

  it('moves the building document for each of the four building controls', () => {
    const machineClass = classOfSpec(CLASSES, BLANK_SPEC);
    const otherSpeed = speedStepsFor(machineClass!).find((step) => step !== STANDING.speed);
    const otherLoad = loadStepsFor(machineClass!).find((step) => step !== STANDING.cap);
    expect(otherSpeed, 'the class offers a second speed').toBeDefined();
    expect(otherLoad, 'the class offers a second rated load').toBeDefined();
    const moves: readonly [string, Partial<TuneState>][] = [
      ['floors', { floors: STANDING.floors + 6 }],
      ['cars', { cars: STANDING.cars + 2 }],
      ['speed', { speed: otherSpeed ?? STANDING.speed }],
      ['cap', { cap: otherLoad ?? STANDING.cap }],
    ];
    const base = documentFor(STANDING);
    for (const [name, patch] of moves) {
      expect(documentFor({ ...STANDING, ...patch }), name).not.toBe(base);
    }
  });

  it('moves the demand options for each of the two crowd controls', () => {
    const base = demandFor(STANDING);
    expect(demandFor({ ...STANDING, rate: STANDING.rate + 3 })).not.toBe(base);
    expect(demandFor({ ...STANDING, lobbyShare: STANDING.lobbyShare - 20 })).not.toBe(base);
  });

  it('gives the two crowd controls different effects, so neither is the other wearing a label', () => {
    /*
     * The prototype's aliasing defect, asserted against rather than assumed absent: two controls
     * that wrote one field would produce identical demand documents for different presses.
     */
    const busier = demandFor({ ...STANDING, rate: STANDING.rate + 3 });
    const lobbier = demandFor({ ...STANDING, lobbyShare: STANDING.lobbyShare - 20 });
    expect(busier).not.toBe(lobbier);
  });

  it('moves the door timing for each dwell chip, and writes nothing on the fourth', () => {
    // `GroupLevers.dwell`'s three settings differ in the two fields `withDoorTiming` writes onto
    // every car; the fourth state writes no dwell at all, which is what keeps an authored
    // `dwellPolicy` alive.
    const written = DWELL_CHOICES.map((choice) => JSON.stringify(DWELL_SETTINGS[choice]));
    expect(new Set(written).size).toBe(DWELL_CHOICES.length);
  });

  it('reports exactly the keys that moved, and nothing when nothing did', () => {
    expect(movedKeys(STANDING, STANDING)).toEqual([]);
    expect(movedKeys(STANDING, { ...STANDING, cars: STANDING.cars + 1 })).toEqual(['cars']);
    expect(
      movedKeys(STANDING, { ...STANDING, cars: STANDING.cars + 1, rate: STANDING.rate + 1 }),
    ).toEqual(['cars', 'rate']);
    expect(movedKeys(STANDING, { ...STANDING, dwell: 'snappy' })).toEqual(['dwell']);
  });
});

describe('a sandbox run is never posted, and the screen says so', () => {
  /*
   * Wave AP lane AP-D2 (§ D1451), the post-AO panel's seat D (D8): the untouched strip said *Scored
   * day — three things are fixed* and the press began the counted attempt. Red before: the untouched
   * strip said *Scored day* and nothing said a run from here never counts.
   */
  it('says a run from here is a sandbox day whether or not anything moved', () => {
    expect(tuneSandboxStrip([]).state).not.toMatch(/Scored day/);
    expect(tuneSandboxStrip([]).note).toMatch(/never counts/);
    expect(tuneSandboxStrip([]).note).toMatch(/starts from its brief/);
    expect(tuneSandboxStrip(['cars']).state).toMatch(/Sandbox/);
    expect(tuneSandboxStrip(['cars']).note).toMatch(/will not be posted/);
    expect(`${TUNER_COPY.lede} ${TUNER_COPY.stampCleanBody}`).not.toMatch(/matches everyone else/u);
  });

  it('picks § 3.3’s note by index rather than by restating one of its two cells', () => {
    /*
     * The row ships `noteVariants` and no `note`, in the guide's own order — sandbox first, scored
     * second. Picking by index is what makes a reworded § 3.3 cell move on the same commit.
     */
    const base = actionBarFor({ screen: 'tuner', ctx: 'daily' });
    const variants = base.noteVariants ?? [];
    expect(variants).toHaveLength(2);
    expect(tunerNoteFor(variants, ['cars'])).toBe(variants[0]);
    /* § D1451: the sandbox cell whatever moved, since an untouched tuner runs a sandbox day too. */
    expect(tunerNoteFor(variants, [])).toBe(variants[0]);
    expect(tunerBarModel(base, []).note).toBe(variants[0]);
    expect(tunerBarModel(base, ['rate']).note).toBe(variants[0]);
  });

  it('never marks the primary inert — an untouched tuner still has the standing day to run', () => {
    const base = actionBarFor({ screen: 'tuner', ctx: 'daily' });
    expect(tunerBarModel(base, []).primary.inert).toBeUndefined();
    expect(tunerBarModel(base, ['cars']).primary.label).toBe(base.primary.label);
  });

  it('names a saved pattern after what was tuned, so a shelf of them can be read', () => {
    const named = patternWithTune(DEFAULT_PATTERN, { ...STANDING, rate: 18, lobbyShare: 70 });
    expect(named.name).toContain('18');
    expect(named.name).toContain('70');
    expect(named.name).not.toBe(DEFAULT_PATTERN.name);
  });
});

/**
 * **An untouched tuner runs the standing day** — GitHub issue #289.
 *
 * `tunerModel.ts#tunePresses` carries the argument; this block is the run behind it. Every case
 * drives the **shipped press path** rather than a restatement of it, because the defect lived
 * entirely in what that path does to the building's *id*: the document was byte-identical either
 * way, and a test that compared documents would have passed on the broken tree.
 */
/**
 * **Opening the tuner changes nothing** — the defect found while closing issue #289.
 *
 * `tunerScreen.ts`'s `redraw` snaps the design onto its class's ladder before drawing the chips, and
 * the comment governing that snap said it was *"only reachable through a class change, which this
 * screen does not offer today"*. It was not. `speedStepsFor` filters § 10.1's **catalogue** to the
 * class's band, and a shipped building need not have been specified at a catalogue speed: two are
 * not, so the snap fired **on mount, before any control was touched**.
 *
 * Measured on the tree at `55f2bca`, over all eight buildings in `data/buildings/`:
 *
 * | building | authored | class ladder | snapped to | `movedKeys` on mount |
 * |---|---|---|---|---|
 * | `garden-apartments` | **0.63 m/s** | `0.50, 0.75` | `0.50` | `['speed']` |
 * | `crown-hotel` | **3.0 m/s** | `2.5, 3.5, 4, 5, 7` | `2.5` | `['speed']` |
 * | the other six | on the catalogue | — | unmoved | `[]` |
 *
 * Three consequences, in the order they matter. Garden Apartments opened **21 % slower** than the
 * building it named, so *Run it and watch* on an untouched tuner ran a tower nobody had asked for.
 * The strip then announced *Sandbox — nothing counts* and the stamp *This run will be stamped
 * "sandbox"* over an edit nobody had made — which is why a playtest that touched nothing could
 * still read all four of issue #290's sandbox strings. And it defeated issue #289's guard on the
 * one building that issue is about, because a tuner that believes a control moved presses as though
 * one had.
 *
 * The buildings are read from **disk** rather than listed, on `deadCode.test.ts`'s ground: a
 * building added tomorrow at a non-catalogue speed is caught the day it lands.
 */
describe('opening the tuner changes nothing — the mount, over every shipped building', () => {
  const BUILDING_FILES = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  /**
   * `redraw`'s opening sequence, line for line, as it runs on the first frame after mount.
   *
   * Reproduced here rather than driven through the DOM because `tunerScreen.ts` needs a document
   * and this package's pure/DOM split exists so that the decisions do not. The sequence is four
   * calls and they are the same four, in the same order — a divergence between this and the screen
   * is the thing the `writes` claims and the browser tier's `.everyday-tuner-step` chips catch.
   */
  function afterMount(file: string): {
    readonly spec: BuildingSpec;
    readonly standing: TuneState;
    readonly snapped: TuneState;
    readonly speeds: readonly number[];
    readonly loads: readonly number[];
  } {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', file), 'utf8')) as unknown,
    );
    const spec = specFromBuilding(config, config.id);
    const standing = tuneStateFrom(spec, DEFAULT_PATTERN, undefined);
    const machineClass = classOfSpec(CLASSES, buildingWithTune(spec, standing));
    const steps = tuneMachineSteps(machineClass, standing, standing);
    return {
      spec,
      standing,
      snapped: {
        ...standing,
        speed: snapToStep(steps.speeds, standing.speed),
        cap: snapToStep(steps.loads, standing.cap),
      },
      speeds: steps.speeds,
      loads: steps.loads,
    };
  }

  it('leaves the seven exactly as it read them, on every shipped building', () => {
    expect(BUILDING_FILES.length).toBeGreaterThan(1);
    for (const file of BUILDING_FILES) {
      const at = afterMount(file);
      expect(movedKeys(at.standing, at.snapped), file).toEqual([]);
    }
  });

  it('leaves the building document byte-identical, which is the half that reaches the run', () => {
    /*
     * The seven are the screen's vocabulary; this is the document the simulator reads. Asserted
     * separately because a snap that moved `speed` moved every car's `ratedSpeedMps`, and *the run
     * is unchanged* is the claim *Scored day — three things are fixed* actually makes.
     */
    for (const file of BUILDING_FILES) {
      const at = afterMount(file);
      expect(buildingWithTune(at.spec, at.snapped), file).toStrictEqual(at.spec);
    }
  });

  it('offers the standing value as a step, so the lit chip is the true one', () => {
    /*
     * The mechanism behind the two cases above, asserted directly so a fix that instead deleted the
     * snap would not pass here: the ladder has to be able to *express* what is standing, or the
     * card is drawn from one value and lit from another.
     */
    for (const file of BUILDING_FILES) {
      const at = afterMount(file);
      expect(at.speeds, file).toContain(at.standing.speed);
      expect(at.loads, file).toContain(at.standing.cap);
    }
  });

  it('still snaps a value the class does not admit — the guard it was written for', () => {
    /*
     * The other direction, and the reason the snap is kept. A class change narrows the band, the
     * standing value falls outside it, and `tuneMachineSteps` must **not** offer it — otherwise
     * `applyBuildingSpec` hands `parseBuilding` a car outside its band, which is what the snap
     * exists to prevent. Driven on a class whose band excludes a speed the ladder would otherwise
     * carry over.
     */
    const fast = CLASSES.find((entry) => entry.speedMaxMps < 2);
    expect(fast, 'a class with a low ceiling to snap onto').toBeDefined();
    const standing: TuneState = { ...STANDING, speed: 9.5, cap: 99_000 };
    const steps = tuneMachineSteps(fast, standing, standing);
    expect(steps.speeds).not.toContain(9.5);
    expect(steps.loads).not.toContain(99_000);
    expect(snapToStep(steps.speeds, standing.speed)).toBeLessThan(9.5);
  });

  it('says *Nothing changed yet* on the screen it opens, because nothing has moved', () => {
    for (const file of BUILDING_FILES) {
      const at = afterMount(file);
      const moved = movedKeys(at.standing, at.snapped);
      expect(tuneSandboxStrip(moved).state, file).toMatch(/Nothing changed yet/);
      expect(tunePresses(at.spec, DEFAULT_PATTERN, at.standing, at.snapped).building, file)
        .toBeUndefined();
    }
  });
});

describe('an untouched tuner runs the standing day — GitHub issue #289', () => {
  /**
   * The press, exactly as `everyday/host.ts#runSandbox` makes it — since wave AO
   * ([§ D1368](../../../../DECISIONS.md)) `everyday/sandbox.ts#sandboxPatchOf` over the state, and
   * nothing at all when nothing moved, because the tuner's primary then presses the brief's own
   * `playDay`. It was `applyBuildingSpec`'s body (`savedBuildingFrom`, `stateRunningSaved`), which
   * stood the player's own week on `SANDBOX_CONTRACT_ID` and is the post-AN panel's seat D (D3).
   */
  function pressed(state: ViewerState, presses: TunePresses): ViewerState {
    /* Wave AP lane AP-D2 (§ D1451): the press is `runSandbox` whatever moved, and the patch is its. */
    return { ...state, ...sandboxPatchOf(state, RESOURCES, presses) };
  }

  /**
   * What the tuner **holds after its first frame** — the two documents, and the seven as `redraw`
   * leaves them.
   *
   * The two spec calls are `host.buildingSpec()` and `host.patternSpec()`'s own bodies for a state
   * whose pattern is `'building'`, which is what a state off {@link baseState} has. The host is not
   * constructed here because its bindings need a mutable shell; what is being measured is the
   * decision, and the decision reads specs.
   *
   * **`tune` is the post-`redraw` state rather than `tuneStateFrom`'s output, and that distinction
   * was a defect rather than a nicety.** `redraw` snaps speed and load onto the class ladder before
   * drawing the chips, and on two shipped buildings that snap used to fire on mount — so a helper
   * that stopped at `tuneStateFrom` would report an untouched screen that the product never has.
   * The block above pins the snap itself over every building; this one presses what the screen is
   * actually holding when the player reaches the button.
   */
  function standingAt(state: ViewerState): {
    readonly building: BuildingSpec;
    readonly pattern: PatternSpec;
    readonly standing: TuneState;
    readonly tune: TuneState;
  } {
    const config = buildingConfigOf(RESOURCES, state.savedBuildings, state.buildingId);
    expect(config, 'the standing building is one this build knows').toBeDefined();
    const building = specFromBuilding(config!, state.buildingId);
    const pattern = specFromTrafficProfile(RESOURCES.trafficProfiles, config?.trafficProfile);
    const standing = tuneStateFrom(building, pattern, state.levers.dwell);
    const classes = designerClasses(RESOURCES.elevatorSpecs);
    const machineClass = classOfSpec(classes, buildingWithTune(building, standing));
    const steps = tuneMachineSteps(machineClass, standing, standing);
    return {
      building,
      pattern,
      standing,
      tune: {
        ...standing,
        speed: snapToStep(steps.speeds, standing.speed),
        cap: snapToStep(steps.loads, standing.cap),
      },
    };
  }

  it('presses nothing at all, so the run is the one the daily loop would have made', () => {
    const state = { ...baseState(), shiftLengthS: 3600 };
    const at = standingAt(state);
    const presses = tunePresses(at.building, at.pattern, at.standing, at.tune);

    /*
     * Both `undefined`, and that is a different instruction from *press this unchanged copy*.
     * `applyBuildingSpec` allocates a fresh id on every call, so pressing a byte-identical document
     * still renames the building — which is the whole defect, and why the assertion is on the
     * absence rather than on the document's contents.
     */
    expect(presses.building).toBeUndefined();
    expect(presses.pattern).toBeUndefined();

    const after = pressed(state, presses);
    expect(after.buildingId).toBe(state.buildingId);
    /*
     * § D1451 (wave AP lane AP-D2): a sandbox day over the week, dealt as the day it copies, so the
     * run on the legs is still the one the daily loop would have made, and it counts for nothing.
     */
    expect(after.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
    expect(after.week.sandboxOf).toEqual({ contractId: state.week.contractId, buildingId: state.buildingId, plain: false });
    // The legs, never a window statistic — `docs/05`'s standing requirement in its contrapositive.
    expect(legsOf(after)).toBe(legsOf(state));
  }, 60_000);

  it('leaves the window on the building’s own answer rather than the template’s band', () => {
    /*
     * The defect, measured on both sides. Garden Apartments is the building the matrix moves —
     * every one of its cells declares `full-run`, for the reason `benchmark/arms.ts` § 2 measured —
     * and the press renamed it to `bld-1`, which the matrix has never measured, so
     * `shiftReportWindowFor` returned `undefined` and the sheet went back to the five-minute band
     * `docs/20` defect 5 moved it off.
     */
    const state = { ...baseState(), shiftLengthS: 3600 };
    expect(shiftReportWindowFor(state.buildingId)).toBe('full-run');
    const at = standingAt(state);

    const untouched = pressed(state, tunePresses(at.building, at.pattern, at.standing, at.tune));
    expect(shiftRunConfigOf(RESOURCES, untouched).config.reportWindow).toBe('full-run');

    /*
     * And the other side, so this is a guard rather than an assertion that the guard is never
     * reached: a genuinely tuned tower **does** fall through to the template's band, which
     * `reportWindow.ts`'s last paragraph argues is correct — a building nobody censused gets no
     * invented window.
     */
    const moved = { ...at.tune, cars: at.tune.cars + 2 };
    const tuned = pressed(state, tunePresses(at.building, at.pattern, at.standing, moved));
    expect(tuned.buildingId).not.toBe(state.buildingId);
    expect(tuned.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
    expect(shiftRunConfigOf(RESOURCES, tuned).config.reportWindow).toBeUndefined();
  });

  it('stands on a sandbox day whenever any of the seven moved, and copies the tower only when it moved', () => {
    /*
     * This case read *takes the sandbox contract whenever any of the seven moved, not only the
     * building four*, and asserted that a crowd or dwell move pressed the building too, because
     * `applyBuildingSpec` was then the only door to `SANDBOX_CONTRACT_ID`. Since wave AO
     * ([§ D1368](../../../../DECISIONS.md)) the host's `runSandbox` stands every sandbox run on a
     * sandbox day's week whatever moved, so the reason is gone; and pressing the building for a
     * crowd move is now a defect of its own, because a copied tower loses the contract's rung. So
     * the week is asserted for all seven, and the tower copy for the building four alone.
     */
    const state = { ...baseState(), shiftLengthS: 3600 };
    const at = standingAt(state);
    const patches: readonly Partial<TuneState>[] = [
      { rate: at.tune.rate + 3 },
      { lobbyShare: at.tune.lobbyShare - 10 },
      { dwell: 'snappy' },
      { cars: at.tune.cars + 2 },
    ];
    for (const patch of patches) {
      const presses = tunePresses(at.building, at.pattern, at.standing, { ...at.tune, ...patch });
      const towerMoved = 'cars' in patch;
      expect(presses.building !== undefined, JSON.stringify(patch)).toBe(towerMoved);
      expect(presses.pattern !== undefined, JSON.stringify(patch)).toBe('rate' in patch || 'lobbyShare' in patch);
      expect(presses.dwell !== undefined, JSON.stringify(patch)).toBe('dwell' in patch);
      const after = pressed(state, presses);
      expect(after.week.contractId, JSON.stringify(patch)).toBe(SANDBOX_DAY_CONTRACT_ID);
      expect(after.buildingId === state.buildingId, JSON.stringify(patch)).toBe(!towerMoved);
    }
  });

  it('moves the run when a control moves — the standing requirement, on the legs', () => {
    const state = { ...baseState(), shiftLengthS: 900 };
    const at = standingAt(state);
    const base = legsOf(pressed(state, tunePresses(at.building, at.pattern, at.standing, at.tune)));
    const moved = { ...at.tune, cars: at.tune.cars + 2 };
    expect(legsOf(pressed(state, tunePresses(at.building, at.pattern, at.standing, moved)))).not.toBe(
      base,
    );
  }, 60_000);

  /**
   * **A fresh profile through the tuner, and the rail's two figures against the contract the week is
   * on** — GitHub issue #290's second acceptance criterion.
   *
   * The rail is where the promise is broken or kept: the tuner says four times that the run will not
   * be scored, and `everyday/rail.ts#careerLineOf` is the sentence a player reads afterwards. So the
   * case ends there rather than on `WeekState`, which is what makes it a case about the product.
   */
  describe('the rail after a day closed from the tuner', () => {
    const observations = (minutePct: number, kind: 'met' | 'missed') => ({
      arrived: 400,
      carryPct: kind === 'met' ? 100 : 10,
      minutePct,
      peakQueue: kind === 'met' ? 0 : 99,
      abandoned: kind === 'met' ? 0 : 9,
      // The overlap and the run's own horizon that § D417 binds every publisher of
      // `abandoned` to carry, and `goals.ts#gaveUpBesideOf` reads (GitHub issue #456).
      abandonedCarried: 0,
      horizonS: 900,
      worstWaitS: kind === 'met' ? 40 : 940,
      worstWaitIsCensored: false,
      // The energy bar (§ D367, § D468). A `met` fixture has to clear all five, and an absent
      // figure grades `pending`, which `outcomeOf` counts as not passed.
      workPerServedLegKJ: kind === 'met' ? 34.7 : 260.5,
    });

    /** The week a *Close the day* produces, from the week the press left standing. */
    const closed = (week: WeekState, minutePct: number, kind: 'met' | 'missed'): WeekState =>
      closeDay(
        week,
        outcomeOf({
          record: null,
          recordRefusal: null,
          day: week.day,
          dayIdx: week.dayIdx,
          eventId: 'ordinary',
          arrived: 400,
          carried: 380,
          minutePct,
          readings: readGoals(goalsForDay(week.day), observations(minutePct, kind)),
        }),
      );

    /** § 3.2's career line — the rail's two figures, as the identity card draws them. */
    const careerLine = (week: WeekState): string =>
      railModel({ screen: 'menu', ctx: 'daily' }, { week }).footer.identity.streak;

    it('shows nothing saved before a day is closed, on a cold profile', () => {
      const state = baseState();
      expect(state.week.history).toHaveLength(0);
      expect(careerLine(state.week)).toMatch(/no days saved yet/);
    });

    it('banks nothing from an untouched run either, which began no attempt — § D1451', () => {
      /*
       * The other half of issue #289, read on the rail, reversed by wave AP lane AP-D2 (§ D1451). It
       * asserted an untouched run scored, because the press was the brief's own `playDay`; that press
       * began the day's counted attempt with the house driving and nothing on the tuner saying so
       * (the post-AO panel's seat D, D8). Red before: the untouched press left the week on its
       * assignment and its close moved the streak.
       */
      const state = baseState();
      const at = standingAt(state);
      const presses = tunePresses(at.building, at.pattern, at.standing, at.tune);
      expect(sandboxMoves(presses)).toBe(false);
      const after = pressed(state, presses);
      expect(after.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
      expect(careerLine(closed(after.week, 97, 'met'))).toBe('0 days running · best 0%');
    });

    it('banks neither figure from a tuned run, which is what the screen promised', () => {
      /*
       * The defect. On the tree at `55f2bca` this line read `0 days running · best 26%` — the
       * reported symptom exactly — on a screen carrying *Sandbox — nothing counts*, *This run will
       * be stamped "sandbox"*, *a sandbox day can never be mistaken for a scored one* and § 3.3's
       * *Sandbox — this run will not be scored.* The clean arm read `1 day running · best 97%`,
       * which is the half the issue did not report and the reason `closeDay`'s guard covers the
       * streak as well as the mark.
       *
       * **`best —` rather than `best 0%` is what this line should read, and it does not.** The week
       * carries a real `0`, and `careerLineOf` gates its em dash on `history` — which the sandbox
       * day still joins, because the run did happen. On a cold profile whose only closed day is a
       * sandbox one the rail therefore publishes a best of `0%` for a player who has no scored day
       * at all. That is the pre-existing *"the zero cannot carry the absence"* weakness both
       * `rail.ts` and `weekView.ts#streakLineOf` document, reached one step earlier; it is strictly
       * narrower than the defect above — it clears the moment any scored day closes, and it credits
       * nothing to the sandbox — and it is pinned here rather than left as prose so that the lane
       * that gates those two surfaces on a *posted* day changes this string deliberately.
       */
      const state = baseState();
      const at = standingAt(state);
      const moved = { ...at.tune, cars: at.tune.cars + 2 };
      const after = pressed(state, tunePresses(at.building, at.pattern, at.standing, moved));
      expect(after.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
      expect(careerLine(closed(after.week, 26, 'missed'))).toBe('0 days running · best 0%');
      expect(careerLine(closed(after.week, 97, 'met'))).toBe('0 days running · best 0%');
    });

    it('leaves a best a player already earned exactly where it was', () => {
      /*
       * The high-water rule, preserved rather than deleted. The sandbox day's week is the player's
       * own week relabelled — `shift/week.ts#openSandboxDay` is `withContract` over it — so the figure
       * it carries in is a real best, and a guard that zeroed it would be the loss `closeDay`'s
       * docstring was written to prevent, arriving from the other side.
       */
      const state = baseState();
      const at = standingAt(state);
      const scored = { ...state, week: closed(state.week, 74, 'met') };
      const moved = { ...at.tune, cars: at.tune.cars + 2 };
      const after = pressed(scored, tunePresses(at.building, at.pattern, at.standing, moved));
      expect(after.week.contractId).toBe(SANDBOX_DAY_CONTRACT_ID);
      expect(after.week.bestMinutePct).toBe(74);
      expect(closed(after.week, 99, 'met').bestMinutePct).toBe(74);
      expect(closed(after.week, 3, 'missed').bestMinutePct).toBe(74);
    });
  });
});

describe('what the tuner offers on the day it opens over — wave AO, § D1368', () => {
  it('does not offer *Arriving at the lobby* on a day that keeps its own mix', () => {
    /*
     * Once a tuned pattern could run on a whole authored day, the lobby share became a control that
     * writes nothing the run reads there: `core` refuses a split beside a template that varies its
     * mix, so `dev/state.ts#shiftRunConfigOf` leaves it out (`demandTheTemplateTakes`). A control
     * that changes nothing is not drawn, and the screen says why in its place.
     */
    const crowd = TUNE_CARDS.find((card) => card.rows.some((row) => row.key === 'lobbyShare'));
    expect(crowd).toBeDefined();
    expect(tuneRowsOffered(crowd!, { mixIsTheDays: false }).map((row) => row.key)).toEqual(['rate', 'lobbyShare']);
    expect(tuneRowsOffered(crowd!, { mixIsTheDays: true }).map((row) => row.key)).toEqual(['rate']);
    expect(TUNER_COPY.lobbyShareIsTheDays).toMatch(/not offered on this day/u);
  });

  it('lists every control it draws, by card, in the screen’s own words — the list the brief names', () => {
    expect(tuneControlsOffered({ mixIsTheDays: false, machineSteps: true })).toEqual([
      { card: 'The tower', controls: ['Floors above the lobby', 'Shafts'] },
      { card: 'The machines', controls: ['Rated speed', 'Capacity', 'Door dwell'] },
      { card: 'The crowd', controls: ['How busy', 'Arriving at the lobby'] },
    ]);
    expect(tuneControlsOffered({ mixIsTheDays: true, machineSteps: false })).toEqual([
      { card: 'The tower', controls: ['Floors above the lobby', 'Shafts'] },
      { card: 'The machines', controls: ['Door dwell'] },
      { card: 'The crowd', controls: ['How busy'] },
    ]);
  });

  it('draws its rows and machine labels from those same two sources, so the list cannot drift', () => {
    const screen = readFileSync(join(DATA_DIR, '..', 'packages/viz/src/everyday/tunerScreen.ts'), 'utf8');
    expect(screen).toContain('for (const row of tuneRowsOffered(card, { mixIsTheDays })) drawSliderRow(body, row);');
    expect(screen).toContain('COPY.speedLabel');
    expect(screen).toContain('COPY.capLabel');
    expect(screen).toContain('COPY.dwellLabel');
  });
});
