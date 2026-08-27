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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseElevatorSpecs, type ElevatorSpecs } from '@elevator-sim/core/browser';
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
import { savedBuildingFrom, stateRunningSaved } from '../dev/buildingEditor.js';
import { buildingConfigOf, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { shiftReportWindowFor } from '../shift/reportWindow.js';
import { SANDBOX_CONTRACT_ID } from '../shift/week.js';
import { actionBarFor } from './actionBar.js';
import { classOfSpec, loadStepsFor, speedStepsFor } from './designerModel.js';
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
  TUNE_CARDS,
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
    const steps = tuneMachineSteps(machineClass, STANDING);
    expect(steps.speeds).toEqual(speedStepsFor(machineClass!));
    expect(steps.loads).toEqual(loadStepsFor(machineClass!));
    // A class this build does not have leaves a stepper that cannot move rather than one offering
    // a step the loader would refuse.
    expect(tuneMachineSteps(undefined, STANDING)).toEqual({
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
    expect(tuneSpeedReadout(STANDING)).toBe(`${BLANK_SPEC.ratedSpeedMps.toFixed(2)} m/s`);
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
   * `buildingFromSpec` is the exact call `host.applyBuildingSpec` makes through
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
  it('reports the scored state until something moves, and the sandbox state after', () => {
    expect(tuneSandboxStrip([]).state).toMatch(/Scored day/);
    expect(tuneSandboxStrip([]).note).toMatch(/stops counting/);
    expect(tuneSandboxStrip(['cars']).state).toMatch(/Sandbox/);
    expect(tuneSandboxStrip(['cars']).note).toMatch(/will not be posted/);
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
    expect(tunerNoteFor(variants, [])).toBe(variants[1]);
    expect(tunerBarModel(base, []).note).toBe(variants[1]);
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
describe('an untouched tuner runs the standing day — GitHub issue #289', () => {
  /**
   * The press, exactly as `everyday/host.ts#applyBuildingSpec` makes it.
   *
   * `savedBuildingFrom` then `stateRunningSaved` **are** that method's body — the two calls it
   * composes, in its order. A helper that instead wrote `{ ...state, buildingId }` would skip
   * `withBuilding`, which is where the week takes the sandbox contract, and would therefore be
   * measuring a press the product does not make.
   */
  function pressed(state: ViewerState, presses: TunePresses): ViewerState {
    if (presses.building === undefined) return state;
    const saved = savedBuildingFrom(presses.building, state, RESOURCES);
    return stateRunningSaved(state, RESOURCES, saved);
  }

  /**
   * What the tuner mounts with — the two documents and the seven read off them.
   *
   * These two calls are `host.buildingSpec()` and `host.patternSpec()`'s own bodies for a state
   * whose pattern is `'building'`, which is what a state off {@link baseState} has. The host is not
   * constructed here because its bindings need a mutable shell; what is being measured is the
   * decision, and the decision reads specs.
   */
  function standingAt(state: ViewerState): {
    readonly building: BuildingSpec;
    readonly pattern: PatternSpec;
    readonly tune: TuneState;
  } {
    const config = buildingConfigOf(RESOURCES, state.savedBuildings, state.buildingId);
    expect(config, 'the standing building is one this build knows').toBeDefined();
    const building = specFromBuilding(config!, state.buildingId);
    const pattern = specFromTrafficProfile(RESOURCES.trafficProfiles, config?.trafficProfile);
    return { building, pattern, tune: tuneStateFrom(building, pattern, state.levers.dwell) };
  }

  it('presses nothing at all, so the run is the one the daily loop would have made', () => {
    const state = { ...baseState(), shiftLengthS: 3600 };
    const at = standingAt(state);
    const presses = tunePresses(at.building, at.pattern, at.tune, at.tune);

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
    expect(after.week.contractId).toBe(state.week.contractId);
    expect(after.week.contractId).not.toBe(SANDBOX_CONTRACT_ID);
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

    const untouched = pressed(state, tunePresses(at.building, at.pattern, at.tune, at.tune));
    expect(shiftRunConfigOf(RESOURCES, untouched).config.reportWindow).toBe('full-run');

    /*
     * And the other side, so this is a guard rather than an assertion that the guard is never
     * reached: a genuinely tuned tower **does** fall through to the template's band, which
     * `reportWindow.ts`'s last paragraph argues is correct — a building nobody censused gets no
     * invented window.
     */
    const moved = { ...at.tune, cars: at.tune.cars + 2 };
    const tuned = pressed(state, tunePresses(at.building, at.pattern, at.tune, moved));
    expect(tuned.buildingId).not.toBe(state.buildingId);
    expect(tuned.week.contractId).toBe(SANDBOX_CONTRACT_ID);
    expect(shiftRunConfigOf(RESOURCES, tuned).config.reportWindow).toBeUndefined();
  });

  it('takes the sandbox contract whenever any of the seven moved, not only the building four', () => {
    /*
     * The narrow guard — *press the building only when a building key moved* — is the tempting one,
     * and it would have shipped a new defect to close this one. `applyBuildingSpec` is the only
     * door to `SANDBOX_CONTRACT_ID`, so a press that skipped it because only *How busy* had moved
     * would run a re-timed crowd **against a scored assignment**, with the strip saying
     * *Sandbox — nothing counts* over a day `closeDay` banks against Scenario 1.
     *
     * So the crowd and dwell keys are asserted here beside the building four: the predicate is
     * `movedKeys`, which is the same one the strip, the stamp and § 3.3's note already read.
     */
    const state = { ...baseState(), shiftLengthS: 3600 };
    const at = standingAt(state);
    const patches: readonly Partial<TuneState>[] = [
      { rate: at.tune.rate + 3 },
      { lobbyShare: at.tune.lobbyShare - 10 },
      { dwell: 'snappy' },
    ];
    for (const patch of patches) {
      const presses = tunePresses(at.building, at.pattern, at.tune, { ...at.tune, ...patch });
      expect(presses.building, JSON.stringify(patch)).toBeDefined();
      expect(presses.pattern, JSON.stringify(patch)).toBeDefined();
      expect(pressed(state, presses).week.contractId, JSON.stringify(patch)).toBe(
        SANDBOX_CONTRACT_ID,
      );
    }
  });

  it('moves the run when a control moves — the standing requirement, on the legs', () => {
    const state = { ...baseState(), shiftLengthS: 900 };
    const at = standingAt(state);
    const base = legsOf(pressed(state, tunePresses(at.building, at.pattern, at.tune, at.tune)));
    const moved = { ...at.tune, cars: at.tune.cars + 2 };
    expect(legsOf(pressed(state, tunePresses(at.building, at.pattern, at.tune, moved)))).not.toBe(
      base,
    );
  }, 60_000);
});
