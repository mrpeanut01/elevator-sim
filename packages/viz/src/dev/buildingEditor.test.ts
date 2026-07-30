/**
 * The building editor's decisions, and the elevation's geometry.
 *
 * The elevation is the largest single component in the handoff and almost all of it is arithmetic:
 * which floor a row is, how much of a 0–120 track is filled, where a shaft band's top edge sits.
 * All of it is here, because none of it needs a document — and because the two things that would
 * be silently wrong in a browser are exactly the two a test can pin: **an over-capacity floor must
 * produce a red segment and a full one must not**, and **the bands drawn must be the banks the
 * document will carry**.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseElevatorSpecs, type ElevatorSpecs } from '@elevator-sim/core/browser';

import {
  BLANK_SPEC,
  RATED_LOADS,
  SPEC_ROWS,
  banksOf,
  bandOf,
  floorIdOf,
  orphanFloors,
  personsOf,
  validateSpec,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';

import {
  CAPACITY_TICK_PCT,
  OCCUPANCY_MAX_PCT,
  checkBuilding,
  elevationCarsOf,
  elevationNoteOf,
  elevationRowHeightPx,
  elevationRowsOf,
  floorAtFraction,
  loadChipsOf,
  occupancyAtFraction,
  shaftTintOf,
  skyChipsOf,
  skyFloorsEvery,
  specFieldOf,
  specPatchFor,
  specRowsOf,
  specTrackOf,
  speedChipsOf,
} from './buildingEditor.js';
import { speedLadderOf } from './machinesEditor.js';

const DATA = new URL('../../../../data/', import.meta.url);
const SPECS: ElevatorSpecs = parseElevatorSpecs(
  JSON.parse(readFileSync(fileURLToPath(new URL('elevator-specs.json', DATA)), 'utf8')) as unknown,
);
const CLASSES = classesFromSpecs(SPECS);
const LADDER = speedLadderOf(SPECS);

const classOf = (id: string): MachineClass => {
  const found = CLASSES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no class ${id}`);
  return found;
};

const TOWER: BuildingSpec = { ...BLANK_SPEC, floors: 12, cars: 4, capacityPerFloor: 100 };

/* ========================================================================== *
 * The spec column
 * ========================================================================== */

describe('the five spec rows', () => {
  it('draws exactly the model’s rows and heads each group once', () => {
    const rows = specRowsOf(TOWER);
    expect(rows.map((row) => row.row.key)).toStrictEqual(SPEC_ROWS.map((row) => row.key));
    const headings = rows.filter((row) => row.heading !== '').map((row) => row.heading);
    expect(headings).toStrictEqual(['GEOMETRY', 'OCCUPANCY', 'THE LIFTS']);
  });

  it('names the field each row reaches', () => {
    expect(specFieldOf('floorHeightM')).toBe('floors[].heightM');
    expect(specFieldOf('occupancyPct')).toContain('capacity × occupancy');
    expect(specFieldOf('cars')).toBe('banks[].cars[]');
  });

  it('draws an over-capacity track and note only past 100% let', () => {
    const occupancyRow = (spec: BuildingSpec): ReturnType<typeof specRowsOf>[number] => {
      const found = specRowsOf(spec).find((row) => row.row.key === 'occupancyPct');
      if (found === undefined) throw new Error('no occupancy row');
      return found;
    };
    const full = occupancyRow({ ...TOWER, occupancyPct: 100 });
    expect(full.overCapacity).toBe(false);
    expect(full.track).not.toContain('var(--over)');
    expect(full.sub).toContain('capacity × occupancy');

    const over = occupancyRow({ ...TOWER, occupancyPct: 120 });
    expect(over.overCapacity).toBe(true);
    expect(over.track).toContain('var(--over)');
    expect(over.sub).toContain('over design capacity');
  });

  it('gives every other row no track at all', () => {
    for (const row of specRowsOf(TOWER)) {
      if (row.row.key === 'occupancyPct') continue;
      expect(row.track).toBe('');
      expect(specTrackOf(TOWER, row.row)).toBe('');
    }
  });

  it('patches the field the row names, rounding the integer ones', () => {
    expect(specPatchFor('floors', 20.4)).toStrictEqual({ floors: 20 });
    expect(specPatchFor('floorHeightM', 3.7)).toStrictEqual({ floorHeightM: 3.7 });
    expect(specPatchFor('cars', 6)).toStrictEqual({ cars: 6 });
  });
});

/* ========================================================================== *
 * The chips
 * ========================================================================== */

describe('the load chips', () => {
  it('never offers a load outside the class’s capacityLbRange', () => {
    for (const machineClass of CLASSES) {
      for (const chip of loadChipsOf(TOWER, machineClass)) {
        expect(chip.ratedLoadLb).toBeGreaterThanOrEqual(machineClass.loadMinLb);
        expect(chip.ratedLoadLb).toBeLessThanOrEqual(machineClass.loadMaxLb);
        expect(RATED_LOADS).toContain(chip.ratedLoadLb);
      }
    }
  });

  it('labels each with the capacities table’s persons, not lb ÷ 150', () => {
    const chip = loadChipsOf(TOWER, classOf('hydraulic')).find(
      (entry) => entry.ratedLoadLb === 1600,
    );
    // 1600 / 150 is 10.67; the table says 10, and a car capacity is a denominator.
    expect(chip?.persons).toBe(10);
    expect(chip?.label).toBe('1600 lb · 10p');
    expect(personsOf(1600)).toBe(10);
  });

  it('presses exactly the current load when the class offers it', () => {
    const pressed = loadChipsOf({ ...TOWER, ratedLoadLb: 2500 }, classOf('geared-traction')).filter(
      (chip) => chip.pressed,
    );
    expect(pressed.map((chip) => chip.ratedLoadLb)).toStrictEqual([2500]);
  });
});

describe('the speed chips', () => {
  it('never offers a speed outside the class’s band', () => {
    for (const machineClass of CLASSES) {
      const spec: BuildingSpec = { ...TOWER, specClass: machineClass.id, ratedSpeedMps: 99 };
      const chips = speedChipsOf(spec, machineClass, LADDER);
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) {
        expect(chip.speed).toBeGreaterThanOrEqual(machineClass.speedMinMps);
        expect(chip.speed).toBeLessThanOrEqual(machineClass.speedMaxMps);
      }
    }
  });

  it('presses nothing when the current speed sits outside the class it is fitted to', () => {
    const chips = speedChipsOf({ ...TOWER, ratedSpeedMps: 99 }, classOf('hydraulic'), LADDER);
    expect(chips.filter((chip) => chip.pressed)).toStrictEqual([]);
  });

  it('offers the class’s typical, so a freshly fitted car always has a pressed chip', () => {
    const machineClass = classOf('gearless-traction');
    const chips = speedChipsOf(
      { ...TOWER, ratedSpeedMps: machineClass.speedTypicalMps },
      machineClass,
      LADDER,
    );
    expect(chips.filter((chip) => chip.pressed).map((chip) => chip.speed)).toStrictEqual([
      machineClass.speedTypicalMps,
    ]);
  });
});

describe('the sky-lobby chips', () => {
  it('names the floors an “every N” rule seeds, excluding the lobby and the roof', () => {
    expect(skyFloorsEvery({ ...TOWER, floors: 40 }, 10)).toStrictEqual([10, 20, 30]);
    expect(skyFloorsEvery(TOWER, 0)).toStrictEqual([]);
  });

  it('presses “none” on a building with no transfer levels', () => {
    const pressed = skyChipsOf({ ...TOWER, floors: 40 }).filter((chip) => chip.pressed);
    expect(pressed.map((chip) => chip.every)).toStrictEqual([0]);
  });

  it('drops a rule that names no floor on this building, rather than offering an inert chip', () => {
    // Twelve storeys: *every 15* and *every 20* seed nothing, so all three would light at once and
    // pressing any of them would write nothing.
    expect(skyChipsOf(TOWER).map((chip) => chip.every)).toStrictEqual([0, 10]);
    expect(skyChipsOf({ ...TOWER, floors: 40 }).map((chip) => chip.every)).toStrictEqual([
      0, 10, 15, 20,
    ]);
    for (const chip of skyChipsOf(TOWER)) {
      if (chip.every !== 0) expect(chip.floors.length).toBeGreaterThan(0);
    }
  });

  it('presses nothing once a dot has been toggled off a rule', () => {
    const hand: BuildingSpec = { ...TOWER, floors: 40, skyFloors: [10, 20, 31] };
    expect(skyChipsOf(hand).filter((chip) => chip.pressed)).toStrictEqual([]);
  });
});

/* ========================================================================== *
 * The elevation
 * ========================================================================== */

describe('the elevation’s floor rows', () => {
  it('draws one row per floor, top floor first, with the lobby last', () => {
    const rows = elevationRowsOf(TOWER);
    expect(rows).toHaveLength(TOWER.floors + 1);
    expect(rows[0]?.floor).toBe(TOWER.floors);
    expect(rows[rows.length - 1]?.floor).toBe(0);
    expect(rows[rows.length - 1]?.isEntrance).toBe(true);
  });

  it('badges the entrance and every transfer level', () => {
    const rows = elevationRowsOf({ ...TOWER, skyFloors: [6] });
    expect(rows.find((row) => row.floor === 0)?.badge).toBe('⌂');
    expect(rows.find((row) => row.floor === 6)?.badge).toBe('⇄');
    expect(rows.find((row) => row.floor === 6)?.label).toBe(`⇄ ${floorIdOf(6)}`);
    expect(rows.find((row) => row.floor === 5)?.badge).toBe('');
  });

  it('produces a non-zero overage at 120% and none at 100%', () => {
    const at = (pct: number): ReturnType<typeof elevationRowsOf>[number] => {
      const row = elevationRowsOf({ ...TOWER, occupancyByFloor: { 4: pct } }).find(
        (entry) => entry.floor === 4,
      );
      if (row === undefined) throw new Error('no row 4');
      return row;
    };
    expect(at(120).overPct).toBeGreaterThan(0);
    expect(at(120).fillPct).toBe(100);
    expect(at(100).overPct).toBe(0);
    expect(at(60).overPct).toBe(0);
    // The red segment starts at the design-capacity tick and runs to the knob.
    expect(at(120).knobPct).toBeCloseTo(CAPACITY_TICK_PCT + at(120).overPct, 6);
  });

  it('counts a hand-set floor and leaves the rest on the building-wide slider', () => {
    const rows = elevationRowsOf({ ...TOWER, occupancyPct: 80, occupancyByFloor: { 3: 40 } });
    expect(rows.find((row) => row.floor === 3)?.occupancyPct).toBe(40);
    expect(rows.find((row) => row.floor === 3)?.handSet).toBe(true);
    expect(rows.find((row) => row.floor === 2)?.occupancyPct).toBe(80);
    expect(rows.find((row) => row.floor === 2)?.handSet).toBe(false);
  });

  it('draws the lobby’s bar and dot inert, because buildingFromSpec reads neither', () => {
    const lobby = elevationRowsOf(TOWER).find((row) => row.floor === 0);
    expect(lobby?.draggable).toBe(false);
    expect(lobby?.skyToggles).toBe(false);
    expect(lobby?.fillPct).toBe(0);
    expect(lobby?.peopleText).toBe('entrance');
    expect(lobby?.occTitle).toContain('population = 0');
  });

  it('shows people as today’s population over the floor’s design capacity', () => {
    const row = elevationRowsOf({ ...TOWER, occupancyPct: 50 }).find((entry) => entry.floor === 1);
    expect(row?.people).toBe(50);
    expect(row?.peopleText).toBe('50 / 100');
  });

  it('shrinks the row height for a tall tower rather than overflowing the panel', () => {
    expect(elevationRowHeightPx(13)).toBeGreaterThan(elevationRowHeightPx(102));
    expect(elevationRowHeightPx(102)).toBeGreaterThanOrEqual(11);
    expect(elevationRowHeightPx(4)).toBeLessThanOrEqual(24);
  });
});

describe('the elevation’s shaft bands', () => {
  it('agrees with banksOf about every car’s band', () => {
    const specs: readonly BuildingSpec[] = [
      TOWER,
      { ...TOWER, bandByCar: { 0: [6, 12] } },
      { ...TOWER, floors: 40, skyFloors: [10, 20, 30] },
      { ...TOWER, cars: 1 },
    ];
    for (const spec of specs) {
      const banks = banksOf(spec);
      for (const car of elevationCarsOf(spec)) {
        expect(car.band).toStrictEqual(bandOf(spec, car.car));
        const bank = banks[car.bankIndex];
        expect(bank).toBeDefined();
        expect(bank?.band).toStrictEqual(car.band);
        expect(bank?.cars).toContain(car.car);
      }
      // Cars in one bank share a tint; the tint is a bank fact, not a car fact.
      for (const bank of banks) {
        const tints = new Set(
          elevationCarsOf(spec)
            .filter((car) => bank.cars.includes(car.car))
            .map((car) => car.tint),
        );
        expect(tints.size).toBe(1);
      }
    }
  });

  it('positions a band against the same row grid the floors are drawn on', () => {
    const spec: BuildingSpec = { ...TOWER, bandByCar: { 0: [6, 12] } };
    const car = elevationCarsOf(spec)[0];
    // Thirteen rows; the band covers floors 6..12, which are the top seven of them.
    expect(car?.topPct).toBeCloseTo(0, 6);
    expect(car?.heightPct).toBeCloseTo((7 / 13) * 100, 6);
    const low = elevationCarsOf(spec)[1];
    expect(low?.topPct).toBeCloseTo(0, 6);
    expect(low?.heightPct).toBeCloseTo(100, 6);
  });

  it('calls a band that starts above the lobby express, and says it still lands in the lobby', () => {
    const spec: BuildingSpec = { ...TOWER, bandByCar: { 0: [6, 12] } };
    const cars = elevationCarsOf(spec);
    expect(cars[0]?.role).toBe('express');
    expect(cars[0]?.serves).toBe('G + 7–13');
    expect(cars[0]?.pinned).toBe(true);
    expect(cars[1]?.role).toBe('every floor');
    expect(cars[1]?.pinned).toBe(false);
    expect(elevationNoteOf(spec)).toContain('2 banks');
    expect(elevationNoteOf(spec)).toContain('still lands in the lobby and runs non-stop');
    expect(elevationNoteOf(TOWER)).toContain('1 bank');
  });

  it('gives every bank index a tint, wrapping rather than running out', () => {
    expect(shaftTintOf(0)).toBe(shaftTintOf(6));
    expect(shaftTintOf(0)).not.toBe(shaftTintOf(1));
  });
});

describe('the drags', () => {
  it('maps a vertical fraction onto the floor its row covers', () => {
    // Thirteen rows, top floor first: the top of the panel is floor 12, the bottom is the lobby.
    expect(floorAtFraction(TOWER, 0)).toBe(12);
    expect(floorAtFraction(TOWER, 1)).toBe(0);
    expect(floorAtFraction(TOWER, 0.5)).toBe(6);
    // Out of range is clamped rather than producing a floor the building does not have.
    expect(floorAtFraction(TOWER, -3)).toBe(12);
    expect(floorAtFraction(TOWER, 7)).toBe(0);
  });

  it('snaps a horizontal fraction to the same 5% step the slider uses', () => {
    expect(occupancyAtFraction(0)).toBe(0);
    expect(occupancyAtFraction(1)).toBe(OCCUPANCY_MAX_PCT);
    expect(occupancyAtFraction(0.5)).toBe(60);
    expect(occupancyAtFraction(0.51)).toBe(60);
    expect(occupancyAtFraction(2)).toBe(OCCUPANCY_MAX_PCT);
    for (const fraction of [0.03, 0.19, 0.44, 0.77, 0.98]) {
      expect(occupancyAtFraction(fraction) % 5).toBe(0);
    }
  });

  it('a band dragged off the bottom of the tower leaves floors nobody serves, and says so', () => {
    /*
     * Exactly the state a reader reaches by dragging one shaft's bottom grip up in a one-car
     * building. A call at an unserved floor is one nobody may answer, which looks nothing like a
     * slow one — so it must never be reported as one.
     */
    const dragged: BuildingSpec = { ...TOWER, cars: 1, bandByCar: { 0: [0, 6] } };
    expect(orphanFloors(dragged)).toContain(12);
    expect(validateSpec(dragged, undefined).join(' ')).toMatch(/No shaft serves/);
    // And the healthy building says nothing.
    expect(validateSpec(TOWER, classOf('geared-traction'))).toStrictEqual([]);
  });

  it('says a rise past the class envelope is an advisory, never a refusal', () => {
    const tall: BuildingSpec = { ...TOWER, floors: 30, specClass: 'hydraulic' };
    const problems = validateSpec(tall, classOf('hydraulic')).join(' ');
    expect(problems).toContain('advisory');
    expect(problems).not.toContain('refuse');
  });
});

/* ========================================================================== *
 * Live validation
 * ========================================================================== */

describe('validating against the real loader', () => {
  it('accepts a building the loader builds, and reports its advisories rather than throwing', () => {
    const check = checkBuilding(TOWER, SPECS);
    expect(check.error).toBe('');
    expect(Array.isArray(check.warnings)).toBe(true);
  });

  it('catches a ConfigError and renders it, because it is a fact about the document', () => {
    // A class nothing declares. The loader refuses; the editor must say so, not fall over.
    const check = checkBuilding({ ...TOWER, specClass: 'no-such-class' }, SPECS);
    expect(check.error).not.toBe('');
    expect(check.error).toContain('no-such-class');
  });

  it('surfaces the rise advisory as a warning while still loading the building', () => {
    const check = checkBuilding(
      { ...TOWER, floors: 30, specClass: 'hydraulic', ratedSpeedMps: 0.63, ratedLoadLb: 1600 },
      SPECS,
    );
    expect(check.error).toBe('');
    expect(check.warnings.join(' ')).toMatch(/rise of/);
  });

  it('accepts a bank split produced by a drag', () => {
    const check = checkBuilding({ ...TOWER, bandByCar: { 0: [6, 12] } }, SPECS);
    expect(check.error).toBe('');
  });
});
