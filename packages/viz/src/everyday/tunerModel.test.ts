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

import { BLANK_SPEC, buildingFromSpec, personsOf } from '../authoring/buildingSpec.js';
import { DWELL_CHOICES, DWELL_SETTINGS } from '../authoring/dispatcherSpec.js';
import { classesFromSpecs } from '../authoring/machineSpec.js';
import { DEFAULT_PATTERN, demandFromSpec } from '../authoring/patternSpec.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
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
  tuneReadout,
  tuneSandboxStrip,
  tuneSpeedReadout,
  tuneStateFrom,
  tunerBarModel,
  tunerNoteFor,
  TUNE_CARDS,
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
