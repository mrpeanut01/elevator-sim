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
import { readFile } from 'node:fs/promises';
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
  withZoneGroup,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import { STATE_GLYPHS, STATE_WORDS } from '../access/zoning.js';

import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { SANDBOX_CONTRACT_ID } from '../shift/week.js';

import {
  CAPACITY_TICK_PCT,
  OCCUPANCY_MAX_PCT,
  accessMatrixOf,
  checkBuilding,
  elevationCarsOf,
  elevationNoteOf,
  elevationRowHeightPx,
  elevationRowsOf,
  floorAtFraction,
  loadChipsOf,
  occupancyAtFraction,
  savedBuildingFrom,
  selectedTransportOf,
  selectedZoneOf,
  shaftTintOf,
  stateRunningSaved,
  skyChipsOf,
  skyFloorsEvery,
  specFieldOf,
  specPatchFor,
  specRowsOf,
  specTrackOf,
  speedChipsOf,
  transportChoicesOf,
  transportFloorChoicesOf,
  transportNoteOf,
  zoneChoicesOf,
  zoneFloorChoicesOf,
  zoneGroupChoicesOf,
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
      // Two cars on the same band that disagree about the lobby: two banks, not one, and the
      // legend has to name the right one for each of them.
      { ...TOWER, bandByCar: { 0: [6, 12], 1: [6, 12] }, noLobby: { 0: true } },
      { ...TOWER, floors: 40, skyFloors: [10, 20, 30], noLobby: { 1: true, 2: true } },
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
    /*
     * The sentence above is the *default*, not a law, and now that the express toggle exists it has
     * to stop being said when it stops being true. This is the stronger form of the claim: the
     * default still lands in the lobby, and the same band with the toggle off does not — asserted
     * on the descriptor and on the note, in both directions.
     */
    const off: BuildingSpec = { ...spec, noLobby: { 0: true } };
    const closed = elevationCarsOf(off);
    expect(closed[0]?.role).toBe('band only');
    expect(closed[0]?.serves).toBe('7–13');
    expect(closed[0]?.legend).toBe('A · band only · 7–13');
    expect(elevationNoteOf(off)).not.toContain('still lands in the lobby and runs non-stop');
    expect(elevationNoteOf(off)).toContain('never calls at the lobby');
    // The untouched car is untouched — the flag is per car, not per building.
    expect(closed[1]?.role).toBe('every floor');
  });

  it('offers the express toggle exactly where the choice exists, and labels which way it is thrown', () => {
    const express = elevationCarsOf({ ...TOWER, bandByCar: { 0: [6, 12] } });
    expect(express[0]?.canExpress).toBe(true);
    expect(express[0]?.expressOn).toBe(true);
    // Band low = 6 is floor id `7`; the floors it runs past are indices 1–5, ids `2`–`6`.
    expect(express[0]?.expressLabel).toBe('✓ express from the lobby, skipping 2–6');
    // The car that has no band above the lobby gets no button at all, rather than a dead one.
    expect(express[1]?.canExpress).toBe(false);
    expect(express[1]?.expressLabel).toBe('');

    const closed = elevationCarsOf({ ...TOWER, bandByCar: { 0: [6, 12] }, noLobby: { 0: true } });
    expect(closed[0]?.canExpress).toBe(true);
    expect(closed[0]?.expressOn).toBe(false);
    expect(closed[0]?.expressLabel).toBe('stays in its band — click to run express from the lobby');

    // A band starting at floor 1 is offered nothing: its express form is the band that starts at
    // the lobby, so the "choice" would be between a building and itself.
    expect(elevationCarsOf({ ...TOWER, bandByCar: { 0: [1, 12] } })[0]?.canExpress).toBe(false);
  });

  it('takes the toggle’s tooltip verbatim from the handoff rather than paraphrasing it', () => {
    /*
     * The handoff wins every disagreement about what the screen says (§ D174), and this sentence is
     * the only place the default is explained — a reader who has never dragged a band has no way to
     * know that a band above the lobby already lands in it. Pinned against the vendored prototype
     * itself, so a reworded copy here is a failing test rather than a silent drift.
     */
    const prototype = readFileSync(
      fileURLToPath(new URL('../../../../docs/design/elevator-sim-reimagined.dc.html', import.meta.url)),
      'utf8',
    );
    const title = elevationCarsOf({ ...TOWER, bandByCar: { 0: [6, 12] } })[0]?.expressTitle ?? '';
    expect(title).not.toBe('');
    expect(prototype).toContain(title);
    // And it is the same sentence whichever way the toggle is thrown — the tooltip explains the
    // control, not its current state; the state is in the label.
    expect(
      elevationCarsOf({ ...TOWER, bandByCar: { 0: [6, 12] }, noLobby: { 0: true } })[0]?.expressTitle,
    ).toBe(title);
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

/* ========================================================================== *
 * Access zoning — docs/10 § 10.2's two controls
 * ========================================================================== */

const ZONED: BuildingSpec = {
  ...TOWER,
  accessZones: [
    { id: 'zone-1', floors: [3, 4, 5], credentialGroups: ['alpha', 'facilities'] },
    { id: 'zone-2', floors: [9, 10, 11, 12], credentialGroups: ['bravo'] },
  ],
};

describe('the floor multi-select', () => {
  it('offers this building’s own floors, top first, and nothing else', () => {
    const choices = zoneFloorChoicesOf(ZONED, 'zone-1');
    // Every floor including the lobby, so a reader can restrict the entrance if they mean to.
    expect(choices).toHaveLength(TOWER.floors + 1);
    expect(choices[0]?.floor).toBe(TOWER.floors);
    expect(choices.at(-1)?.floor).toBe(0);
    expect(choices.at(-1)?.isEntrance).toBe(true);
    // There is no id here the document does not have — `ED-14`'s error made unreachable, § 10.2.
    expect(choices.map((choice) => choice.floorId)).toStrictEqual(
      elevationRowsOf(TOWER).map((row) => floorIdOf(row.floor)),
    );
  });

  it('marks exactly the floors in the selected zone, and names the zones that share one', () => {
    const choices = zoneFloorChoicesOf(ZONED, 'zone-1');
    const held = choices.filter((choice) => choice.inZone).map((choice) => choice.floor);
    expect(held).toStrictEqual([5, 4, 3]);
    /*
     * Permission on a floor is the **union** over every zone covering it, so the other zones a floor
     * already belongs to have to be visible at the control: a reader adding floor 10 to zone-1 is
     * widening its permission, not moving it out of zone-2, and a control that hid that would be
     * offering an edit whose effect is not the one it draws.
     */
    for (const choice of choices) {
      expect([choice.floor, choice.otherZoneIds]).toStrictEqual([
        choice.floor,
        choice.floor >= 9 && choice.floor <= 12 ? ['zone-2'] : [],
      ]);
    }
    expect(zoneFloorChoicesOf(ZONED, 'zone-2').filter((choice) => choice.inZone)).toHaveLength(4);
  });

  it('drops a floor the tower no longer has rather than offering it', () => {
    const shortened: BuildingSpec = { ...ZONED, floors: 6 };
    const choices = zoneFloorChoicesOf(shortened, 'zone-2');
    expect(choices).toHaveLength(7);
    expect(choices.some((choice) => choice.inZone)).toBe(false);
    expect(zoneChoicesOf(shortened, 'zone-2')[1]?.floorCount).toBe(0);
  });
});

describe('the credential control', () => {
  it('offers the groups the building already names, in declared order, and no fixed vocabulary', () => {
    expect(zoneGroupChoicesOf(ZONED, 'zone-1').map((choice) => choice.group)).toStrictEqual([
      'alpha',
      'facilities',
      'bravo',
    ]);
    expect(zoneGroupChoicesOf(ZONED, 'zone-1').map((choice) => choice.inZone)).toStrictEqual([
      true,
      true,
      false,
    ]);
    // A building with no zone has no vocabulary at all, which is the state the free-entry box is for.
    expect(zoneGroupChoicesOf(TOWER, 'zone-1')).toStrictEqual([]);
  });
});

describe('the coverage matrix', () => {
  it('is floors × credential groups, top floor first, with every group as a column', () => {
    const matrix = accessMatrixOf(ZONED);
    expect(matrix.groups).toStrictEqual(['alpha', 'facilities', 'bravo']);
    expect(matrix.rows).toHaveLength(TOWER.floors + 1);
    expect(matrix.rows[0]?.floor).toBe(TOWER.floors);
    for (const row of matrix.rows) expect(row.cells).toHaveLength(3);
  });

  it('says unrestricted, permitted and not permitted as three different things', () => {
    const matrix = accessMatrixOf(ZONED);
    const at = (floorId: string) => matrix.rows.find((row) => row.floorId === floorId);

    // A floor in no zone: open to every column, and marked as *unrestricted* rather than as granted.
    const lobby = at('G');
    expect(lobby?.restricted).toBe(false);
    expect(lobby?.cells.map((cell) => cell.unrestricted)).toStrictEqual([true, true, true]);
    expect(lobby?.cells.every((cell) => cell.permitted)).toBe(true);

    // A floor in zone-1: alpha and facilities open it, bravo does not.
    const inZone = at('4');
    expect(inZone?.restricted).toBe(true);
    expect(inZone?.zoneIds).toStrictEqual(['zone-1']);
    expect(inZone?.cells.map((cell) => cell.permitted)).toStrictEqual([true, true, false]);
    expect(inZone?.cells.map((cell) => cell.unrestricted)).toStrictEqual([false, false, false]);
  });

  it('carries a glyph *and* a word in every cell — KB-15, not a colour-only signal', () => {
    const matrix = accessMatrixOf(ZONED);
    for (const row of matrix.rows) {
      for (const cell of row.cells) {
        expect(cell.glyph).not.toBe('');
        expect(cell.word).not.toBe('');
      }
    }
    const inZone = matrix.rows.find((row) => row.floorId === '4');
    const refused = inZone?.cells.find((cell) => !cell.permitted);
    // The lens's own vocabulary, not a second spelling of a fact the viewer already draws — and
    // `▩` rather than `⊘`, because `⊘` means *no shaft reaches this floor* on every other surface.
    expect(refused?.state).toBe('not-permitted');
    expect(refused?.glyph).toBe(STATE_GLYPHS['not-permitted']);
    expect(refused?.word).toBe(STATE_WORDS['not-permitted']);
    expect(refused?.glyph).not.toBe(STATE_GLYPHS['not-served']);
    const granted = inZone?.cells.find((cell) => cell.permitted);
    expect(granted?.glyph).toBe(STATE_GLYPHS.reachable);
    // And the unrestricted mark is a third shape, distinguishable with the colour removed.
    const free = matrix.rows.find((row) => row.floorId === 'G')?.cells[0];
    expect(free?.glyph).not.toBe(STATE_GLYPHS.reachable);
    expect(free?.glyph).not.toBe(STATE_GLYPHS['not-permitted']);
    expect(free?.word).not.toBe(STATE_WORDS.reachable);
  });

  it('makes a floor no group opens visible, which is the state that strands demand', () => {
    // Reachable by withdrawing every group from a zone — which the schema refuses on save, so the
    // matrix showing it and `validateSpec` refusing it are the same fact said twice.
    const emptied: BuildingSpec = {
      ...ZONED,
      accessZones: withZoneGroup(ZONED, 'zone-2', 'bravo'),
    };
    const matrix = accessMatrixOf(emptied);
    expect(matrix.strandedIds).toStrictEqual(['13', '12', '11', '10']);
    const row = matrix.rows.find((entry) => entry.floorId === '10');
    expect(row?.stranded).toBe(true);
    expect(row?.cells.every((cell) => !cell.permitted)).toBe(true);
    expect(validateSpec(emptied, undefined).join(' ')).toMatch(/names no credential group/);
    // And the loader really does refuse it, so the editor's sentence is not a false claim.
    expect(checkBuilding(emptied, SPECS).error).not.toBe('');
  });

  it('names the restricted floors as runs, not as a comma-separated census', () => {
    const matrix = accessMatrixOf(ZONED);
    expect(matrix.restrictedIds).toStrictEqual(['4', '5', '6', '10', '11', '12', '13']);
    expect(matrix.restrictedRuns).toBe('4–6, 10–13');
  });

  it('has no column and no restricted floor on a building with no zone', () => {
    const matrix = accessMatrixOf(TOWER);
    expect(matrix.groups).toStrictEqual([]);
    expect(matrix.restrictedIds).toStrictEqual([]);
    expect(matrix.strandedIds).toStrictEqual([]);
    expect(matrix.rows.every((row) => row.cells.length === 0)).toBe(true);
  });
});

describe('the elevation’s note keeps the two zonings apart', () => {
  it('says nothing about credentials on a building with no zone', () => {
    const note = elevationNoteOf(TOWER);
    expect(note).toContain('bank is the set of cars');
    expect(note).not.toMatch(/credential/);
  });

  it('names the credential barrier as a credential, and the floors as served', () => {
    const note = elevationNoteOf(ZONED);
    expect(note).toMatch(/credential and not a shaft/);
    expect(note).toMatch(/physically served/);
    expect(note).toContain('4–6, 10–13');
    // The sentence a reader needs most: an unanswerable call is not a slow one.
    expect(note).toMatch(/never generated/);
  });

  it('says how many floors no group opens, when that is the state', () => {
    const emptied: BuildingSpec = { ...ZONED, accessZones: withZoneGroup(ZONED, 'zone-2', 'bravo') };
    expect(elevationNoteOf(emptied)).toMatch(/open to no group at all/);
  });
});

describe('the zone selector', () => {
  it('counts what each zone will carry, and falls back to the first when the id is stale', () => {
    const choices = zoneChoicesOf(ZONED, 'zone-2');
    expect(choices.map((choice) => choice.id)).toStrictEqual(['zone-1', 'zone-2']);
    expect(choices.map((choice) => choice.selected)).toStrictEqual([false, true]);
    expect(choices[0]?.floorCount).toBe(3);
    expect(choices[0]?.groupCount).toBe(2);
    expect(choices[0]?.runs).toBe('4–6');
    // A removal leaves a stale id behind; the form must draw the surviving zone, not an empty one.
    expect(selectedZoneOf(ZONED, 'zone-9')?.id).toBe('zone-1');
    expect(selectedZoneOf(TOWER, 'zone-1')).toBeUndefined();
  });
});

/* ========================================================================== *
 * Sky lobbies — docs/14 § 5a's controls
 * ========================================================================== */

const LOBBIES: BuildingSpec = {
  ...TOWER,
  skyFloors: [6],
  transportModes: [
    // A two-level sky lobby, and a machine between two ordinary floors — the two states the
    // selector and the note have to tell apart.
    { id: 'escalator-1', connects: [6, 7], traversalTimeS: 21.2 },
    { id: 'escalator-2', connects: [2, 3], traversalTimeS: 21.2 },
  ],
};

describe('the escalator selector', () => {
  it('says which machines are written and which are a way through, and falls back when the id is stale', () => {
    const choices = transportChoicesOf(LOBBIES, 'escalator-2');
    expect(choices.map((choice) => choice.id)).toStrictEqual(['escalator-1', 'escalator-2']);
    expect(choices.map((choice) => choice.selected)).toStrictEqual([false, true]);
    expect(choices.map((choice) => [choice.lowerId, choice.upperId])).toStrictEqual([
      ['7', '8'],
      ['3', '4'],
    ]);
    /*
     * The distinction the whole block exists to draw. `traffic/route.ts` lets a journey change onto
     * a lift only at a transfer level, so the first machine is a way through the building and the
     * second carries only the people who start on one of its two floors — and the reader can see
     * neither of those facts from the floor numbers.
     */
    expect(choices.map((choice) => choice.wayThrough)).toStrictEqual([true, false]);
    expect(choices.every((choice) => choice.written)).toBe(true);

    // A removal leaves a stale id behind; the form draws the survivor rather than an empty one.
    expect(selectedTransportOf(LOBBIES, 'escalator-9')?.id).toBe('escalator-1');
    expect(selectedTransportOf(TOWER, 'escalator-1')).toBeUndefined();
  });

  it('marks a machine the tower has outgrown as unwritten rather than dropping it from the list', () => {
    /*
     * The floor slider and the machines are the same building. A shortened tower omits the machine
     * from the *document* (`transportModesOf`), and the selector must keep drawing it — a control
     * that silently lost the row would leave a reader with no way to move the landing back.
     */
    const shortened: BuildingSpec = { ...LOBBIES, floors: 4 };
    const choices = transportChoicesOf(shortened, '');
    expect(choices).toHaveLength(2);
    expect(choices.map((choice) => choice.written)).toStrictEqual([false, true]);
  });
});

describe('the landing pickers', () => {
  it('offer this building’s own floors, top first, with the transfer levels marked', () => {
    const choices = transportFloorChoicesOf(LOBBIES, 'escalator-1', 0);
    expect(choices).toHaveLength(TOWER.floors + 1);
    expect(choices.map((choice) => choice.floorId)).toStrictEqual(
      elevationRowsOf(TOWER).map((row) => floorIdOf(row.floor)),
    );
    expect(choices.filter((choice) => choice.chosen).map((choice) => choice.floor)).toStrictEqual([6]);
    expect(choices.filter((choice) => choice.isTransfer).map((choice) => choice.floor)).toStrictEqual([6]);
  });

  it('blocks the floor the other landing already stands on, rather than hiding it', () => {
    /*
     * `transportModeSchema` refuses a connection whose two ends name one floor. The picker offers
     * the floor and refuses the click, because dropping the row would leave a gap in a ladder of
     * floor numbers — a control that has silently changed shape is harder to read than one that
     * says no.
     */
    const lower = transportFloorChoicesOf(LOBBIES, 'escalator-1', 0);
    const upper = transportFloorChoicesOf(LOBBIES, 'escalator-1', 1);
    expect(lower.filter((choice) => choice.blocked).map((choice) => choice.floor)).toStrictEqual([7]);
    expect(upper.filter((choice) => choice.blocked).map((choice) => choice.floor)).toStrictEqual([6]);
    expect(lower.some((choice) => choice.blocked && choice.chosen)).toBe(false);
  });
});

/**
 * The static `title` on a landing picker, from the shipped page.
 *
 * Located by the control it labels rather than by position: the eyebrow sits immediately before
 * the container it describes, so the last `title` opened before the id is that control's.
 */
function landingTitle(html: string, id: string): string {
  const at = html.indexOf(`id="${id}"`);
  expect(at, id).toBeGreaterThan(0);
  const titles = [...html.slice(0, at).matchAll(/title="([^"]*)"/g)];
  return titles.at(-1)?.[1] ?? '';
}

describe('the landing pickers say what they do', () => {
  it('describes single-select, and a blocked floor that is listed rather than withheld', async () => {
    /*
     * Two sentences in `index.html` were **false about the mechanism they describe** — the failure
     * mode `CLAUDE.md` opens with, landing in the one prose location this repository does not
     * sweep. They said the picker was a *multi-select* (it is single-select) and that the blocked
     * floor *is not offered* (it is offered, disabled).
     *
     * `honesty/derive.ts` classifies **producers** — functions that return strings — and a static
     * `title` attribute has no producer, so nothing generic can reach these. This is therefore a
     * targeted pin and not a sweep: each claim is asserted against the model fact it is a claim
     * about, in **both** directions, so a copy edit that reintroduces either phrase turns red and
     * so does a mechanism change that makes the corrected phrase false.
     *
     * The half this cannot see is the rendering: `drawTransport` maps each choice to a button and
     * sets `disabled` on the blocked one, and that mount is not driven by any test here. What is
     * pinned is that the choice reaches the mount at all.
     */
    const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    const lower = landingTitle(html, 'building-transport-lower');
    const upper = landingTitle(html, 'building-transport-upper');

    // Single-select, said and true: an end holds one floor, so at most one choice is ever chosen.
    for (const end of [0, 1] as const) {
      const chosen = transportFloorChoicesOf(LOBBIES, 'escalator-1', end).filter(
        (choice) => choice.chosen,
      );
      expect(chosen).toHaveLength(1);
    }
    expect(lower).toMatch(/Pick one floor/);
    expect(upper).toMatch(/Pick one floor/);
    expect(`${lower} ${upper}`).not.toMatch(/multi-select/);

    // Offered-but-blocked, said and true: the floor is in the list the mount draws from.
    const blocked = transportFloorChoicesOf(LOBBIES, 'escalator-1', 1).filter(
      (choice) => choice.blocked,
    );
    expect(blocked).toHaveLength(1);
    expect(upper).toMatch(/still listed, disabled/);
    expect(upper).not.toMatch(/is not offered/);
  });
});

describe('the escalator note', () => {
  it('is silent on a building with no machine, and counts the ways through on one that has them', () => {
    expect(transportNoteOf(TOWER)).toBe('');
    const said = transportNoteOf(LOBBIES);
    expect(said).toMatch(/2 of 2 escalators written/);
    expect(said).toMatch(/1 of 2 touch a transfer level/);
    // A machine the tower has outgrown is counted as unwritten, which is what the reader needs to
    // know: it is declared in the editor and absent from the run.
    expect(transportNoteOf({ ...LOBBIES, floors: 4 })).toMatch(/1 of 2 escalators written/);
  });
});

/* -------------------------------------------------------------------------- *
 * Saving is a thing that happens, and can be run — issue #54
 * -------------------------------------------------------------------------- */

/**
 * The editor's terminal action, and the standing requirement pointed at it.
 *
 * Issue #54's report is three claims. Two reproduce: the save produced **no visible change of any
 * kind**, and there was **no route from the editor to running what you built**. The third — that a
 * typed name is silently replaced by *My building* — **does not reproduce**, and the first test
 * below is what says so: `buildingFromSpec` writes `spec.name` and falls back only on an empty one.
 * The reporter could not have known, which is the actual defect: with nothing confirmed, there was
 * no moment at which a wrong name could have been noticed.
 *
 * The last test is § D177's rule applied to a *button* rather than to a slider. Pressing *Run a day
 * on it* has to change the run, compared on the legs — a confirmation over a building the week does
 * not run would be a nicer-looking version of the same complaint.
 */
describe('the save confirms, names, and can be run — issue #54', () => {
  const DRAWN: BuildingSpec = {
    ...BLANK_SPEC,
    name: 'Playtest Tower',
    floors: 14,
    cars: 5,
    capacityPerFloor: 90,
  };

  it('carries the name the reader typed into the saved document', () => {
    const saved = savedBuildingFrom(DRAWN, baseState(), RESOURCES);
    expect(saved.config.name).toBe('Playtest Tower');
    expect(saved.id).toMatch(/^bld/);
  });

  it('falls back to the default only when the name is actually empty', () => {
    expect(savedBuildingFrom({ ...DRAWN, name: '   ' }, baseState(), RESOURCES).config.name).toBe(
      'My building',
    );
  });

  it('gives the saved building a distinct id rather than overwriting the last one', () => {
    const first = savedBuildingFrom(DRAWN, baseState(), RESOURCES);
    const after = stateRunningSaved(baseState(), RESOURCES, first);
    const second = savedBuildingFrom({ ...DRAWN, floors: 15 }, after, RESOURCES);
    expect(second.id).not.toBe(first.id);
    expect(
      stateRunningSaved(after, RESOURCES, second).savedBuildings.map((entry) => entry.id),
    ).toStrictEqual([first.id, second.id]);
  });

  it('makes it the running building, on the sandbox contract rather than the week’s scenario', () => {
    /*
     * The half that would have been a forgery if it had been written as a bare `buildingId` write:
     * a building the reader drew belongs to no assignment, and inheriting the week's `contractId`
     * is how an invented tower comes to bank a clean shift against Scenario 2.
     */
    const before = baseState();
    const saved = savedBuildingFrom(DRAWN, before, RESOURCES);
    const after = stateRunningSaved(before, RESOURCES, saved);
    expect(after.buildingId).toBe(saved.id);
    expect(after.week.contractId).toBe(SANDBOX_CONTRACT_ID);
    // Not confiscated, either — the reader has changed what the week is *of*, not left it.
    expect(after.week.day).toBe(before.week.day);
  });

  it('and the run really moves — § D177, compared on the legs', () => {
    const before = baseState();
    const saved = savedBuildingFrom(DRAWN, before, RESOURCES);
    const after = stateRunningSaved(before, RESOURCES, saved);
    const control = legsOf(before);
    const moved = legsOf(after);
    // Neither arm may be empty: two silent runs have the same fingerprint, so an instrument that
    // can go quiet passes exactly when the button dies.
    expect(JSON.parse(control)).not.toHaveLength(0);
    expect(JSON.parse(moved)).not.toHaveLength(0);
    expect(moved).not.toBe(control);
  });
});
