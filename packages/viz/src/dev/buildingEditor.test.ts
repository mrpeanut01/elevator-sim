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
  specFromBuilding,
  validateSpec,
  withZoneGroup,
  type BuildingSpec,
} from '../authoring/buildingSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import { STATE_GLYPHS, STATE_WORDS } from '../access/zoning.js';

import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { SANDBOX_CONTRACT_ID } from '../shift/week.js';

import type { MountContext, ViewAt } from './mountTypes.js';
import { buildingConfigOf, type ViewerState } from './state.js';
import { mountRecorder } from './mountRecorder.test-helper.js';
import {
  SHAFT_LEFT_PX,
  buildingEditorSeedOf,
  elevationStageWidthPx,
  CAPACITY_TICK_PCT,
  OCCUPANCY_MAX_PCT,
  accessMatrixOf,
  checkBuilding,
  elevationCarsOf,
  mountBuildingEditor,
  elevationNoteOf,
  elevationRowHeightPx,
  elevationRowsOf,
  floorAtFraction,
  loadChipsOf,
  occupancyAtFraction,
  savedBuildingFrom,
  selectedTransportOf,
  selectedZoneOf,
  SHAFT_TINTS,
  shaftTintOf,
  stateRunningSaved,
  skyChipsOf,
  skyFloorsEvery,
  specFieldOf,
  specPatchFor,
  shaftCountAfter,
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

  /**
   * **The + shaft button cannot cost a reader shafts.**
   *
   * The two handlers held the `cars` row's bounds as literals — `Math.min(12, …)` and
   * `Math.max(1, …)`. Invisible while `specFromBuilding` clamped a shipped building's car count on
   * the way *in*, and a silent data loss the moment one reads back its true count:
   * **`vertical-city` is 35 cars**, and one press of *+ shaft* against a copied ceiling of 12 makes
   * it a twelve-car building with no warning and no undo.
   *
   * Both halves are asserted, and the ceiling is read off `SPEC_ROWS` here too — a test that wrote
   * `12` would be the third copy of the number and would go green on the day the row moves.
   */
  describe('the shaft buttons', () => {
    const carsRow = SPEC_ROWS.find((row) => row.key === 'cars');
    if (carsRow === undefined) throw new Error('SPEC_ROWS declares no cars row');

    it('honours the cars row’s own ceiling rather than a literal', () => {
      expect(shaftCountAfter(carsRow.max - 1, 1)).toBe(carsRow.max);
      expect(shaftCountAfter(carsRow.max, 1)).toBe(carsRow.max);
      expect(shaftCountAfter(4, 1)).toBe(5);
    });

    it('honours the floor, because a bank with no car is a set of floors nobody can reach', () => {
      expect(shaftCountAfter(carsRow.min + 1, -1)).toBe(carsRow.min);
      expect(shaftCountAfter(carsRow.min, -1)).toBe(carsRow.min);
      expect(shaftCountAfter(4, -1)).toBe(3);
    });

    it('never takes shafts away from a building that already has more than the ceiling', () => {
      /*
       * The destructive case, written as the building it was measured on. Adding is refused —
       * which is what a ceiling means — and refused *visibly*, by nothing happening, rather than by
       * deleting the difference.
       *
       * Watched failing against the shipped `Math.min(12, current.cars + 1)`:
       *   AssertionError: expected 12 to be 35
       */
      const over = carsRow.max + 23;
      expect(shaftCountAfter(over, 1)).toBe(over);
      // And − shaft still works on one: a decrease is what that button is for.
      expect(shaftCountAfter(over, -1)).toBe(carsRow.max);
    });
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
    expect(rows.find((row) => row.floor === 6)?.label).toBe(`⇄ ${floorIdOf(TOWER, 6)}`);
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

  /**
   * **The mark says what is true; the dot says what may be changed.**
   *
   * `isSky` answered both with `!isEntrance && skies.has(floor)`, so a lobby that genuinely *is* a
   * transfer level drew no ⇄ — `secure-tower`'s `G` is one, and is simulated as one. The dot being
   * inert there is a separate fact and `skyToggles` already carried it; the guard was the answer to
   * the wrong question in the wrong place.
   *
   * Watched failing against `!isEntrance && skies.has(floor)`:
   *   AssertionError: the lobby is a transfer level and the elevation does not say so:
   *   expected '' to be '⇄'
   */
  it('marks a lobby that really is a transfer level, and leaves its dot inert', () => {
    const lobby = elevationRowsOf({ ...TOWER, skyFloors: [0, 6] }).find((row) => row.floor === 0);
    expect(
      lobby?.skyMark,
      'the lobby is a transfer level and the elevation does not say so',
    ).toBe('⇄');
    expect(lobby?.isSky).toBe(true);
    // Unchanged, and it is the half that keeps the control honest: `toggleSky` returns early on an
    // entrance, so a dot drawn as writable there would be an inert control.
    expect(lobby?.skyToggles).toBe(false);
    // The entrance badge still wins the label — a lobby is a lobby first.
    expect(lobby?.badge).toBe('⌂');
  });

  it('says what the dot writes rather than what the loader supposedly never does', () => {
    /*
     * CLAUDE.md's *a stated mechanism goes stale*. The tooltip claimed *"buildingFromSpec never
     * marks an entrance a transfer level"*, which stopped being true when a lobby-level
     * `isTransferFloor` began surviving the round trip. What is true is narrower and is about the
     * **dot**: it writes `skyFloors`, which the loader reads only above the lobby.
     */
    const plain = elevationRowsOf(TOWER).find((row) => row.floor === 0);
    expect(plain?.skyTitle).toContain('writes skyFloors');
    expect(plain?.skyTitle).toContain('reads only above the lobby');
    expect(plain?.skyTitle).not.toContain('never marks an entrance');
    // And where a flag is in fact carried, the tooltip says so rather than leaving the ⇄ unexplained.
    const carried = elevationRowsOf({ ...TOWER, skyFloors: [0] }).find((row) => row.floor === 0);
    expect(carried?.skyTitle).toContain('carried through from the document');
    expect(carried?.skyTitle).toContain('⇄');
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
    // Guide § 19's `Shaft tints` line has **eight**, so the wrap is at eight — it was six until
    // `docs/21` § 2.2 (3)'s migration. Derived from the exported set rather than written as a
    // literal, so the day a ninth tint lands this reads the wrap it actually has.
    expect(shaftTintOf(0)).toBe(shaftTintOf(SHAFT_TINTS.length));
    expect(shaftTintOf(0)).not.toBe(shaftTintOf(1));
    expect(SHAFT_TINTS.length).toBe(8);
  });

  it('names a token for every tint, so the elevation follows the theme — § D251', () => {
    // The defect this closes: the six were hex literals, and this editor writes them into inline
    // styles, which no `:root[data-theme]` block reaches. A literal here is a colour no mode can
    // repaint, and `dev/paletteLiterals.test.ts` is the sweep that keeps it that way.
    for (const tint of SHAFT_TINTS) expect(tint).toMatch(/^var\(--shaft-[1-8]\)$/);
    expect(new Set(SHAFT_TINTS).size).toBe(SHAFT_TINTS.length);
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
      elevationRowsOf(TOWER).map((row) => floorIdOf(TOWER, row.floor)),
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
      elevationRowsOf(TOWER).map((row) => floorIdOf(TOWER, row.floor)),
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
 * Adding a shaft changes the picture — issue #52
 * -------------------------------------------------------------------------- */

/**
 * *Move the control and require the drawing to change*, which is the elevation's form of the rule.
 *
 * The report: adding four shafts took the building from 4 to 8, the summary line correctly said
 * `8 shafts in 1 bank`, and *"the grid still shows only the same clipped sliver."* The cause is that
 * `.elev-shaft` is `flex: 1; min-width: 0` inside a stage pinned at `min-width: 400px`, so the bars
 * divided a fixed column between them — the picture could not grow, only subdivide.
 *
 * The elevation is the surface whose own instruction line says *"drag a shaft's top or bottom edge
 * to restrict it to a band of floors"*, so a bar too thin to put a pointer on is a documented
 * interaction that is not offered.
 */
describe('the elevation makes room for the shafts it is told to draw — issue #52', () => {
  it('grows the stage as shafts are added, rather than subdividing a fixed column', () => {
    const widths = [1, 2, 4, 8, 12].map((cars) => elevationStageWidthPx(cars));
    // Monotone, and strictly so once the floor is cleared: adding a shaft may never shrink the
    // picture, and past the floor it must actually widen it.
    for (let index = 1; index < widths.length; index += 1) {
      expect(widths[index]).toBeGreaterThanOrEqual(widths[index - 1] as number);
    }
    expect(elevationStageWidthPx(12)).toBeGreaterThan(elevationStageWidthPx(4));
    expect(elevationStageWidthPx(8)).toBeGreaterThan(elevationStageWidthPx(4));
  });

  it('never goes below the width the fixed columns need', () => {
    // A one-shaft building must still lay out FLOOR, SKY, OCCUPIED and PEOPLE.
    expect(elevationStageWidthPx(1)).toBeGreaterThanOrEqual(400);
    expect(elevationStageWidthPx(0)).toBeGreaterThanOrEqual(400);
    expect(elevationStageWidthPx(-3)).toBeGreaterThanOrEqual(400);
  });

  it('leaves every shaft a bar wide enough to put a pointer on', () => {
    /*
     * The property that matters, stated as the geometry rather than as a number: whatever the shaft
     * count, the stage must hold that many bars at the minimum width, their gaps, and the fixed
     * columns to their left. `35` is the largest shipped car count (Vertical City), so the ceiling
     * the editor's own `cars` slider allows is comfortably inside what this covers.
     */
    for (const cars of [1, 2, 4, 8, 12, 35]) {
      const room = elevationStageWidthPx(cars) - SHAFT_LEFT_PX - 8;
      const perShaft = (room - (cars - 1) * 6) / cars;
      expect(perShaft, `${String(cars)} shafts get ${perShaft.toFixed(1)}px each`).toBeGreaterThanOrEqual(
        14,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Casual view is not a label — issue #43
 * -------------------------------------------------------------------------- */

/**
 * The standing requirement pointed at a **disclosure** control.
 *
 * *Move the control and require the run to change* has no meaning for the view selector — `mode/`
 * exists to prove the two modes produce **the same run**, and a disclosure control that changed one
 * would be a difficulty setting. So the analogue is the one the reporter measured: move it and
 * require the **rendering** to change. Their finding was that it does not — *"Engineer: innerText
 * 2936 chars, 2523 elements / Casual: innerText 2936 chars, 2523 elements → byte-for-byte
 * identical"* — and the cause is that nothing in `buildingEditor.ts` read `state.mode` at all.
 *
 * That is this repository's most-repeated defect wearing a different hat. A control that binds
 * nothing passes every other check here, and the eleven counted instances were all *behaviour* with
 * no caller; this one is a *control* with no reader. The test that would have caught it is this one.
 */
describe('the view selector reaches the building tab — issue #43', () => {
  const captions = (showFieldPaths: boolean): readonly string[] =>
    specRowsOf(TOWER, showFieldPaths).map((entry) => entry.sub);

  it('renders different captions in the two modes', () => {
    // The reporter's measurement, as an assertion: the two modes may not be byte-for-byte identical.
    expect(captions(true)).not.toStrictEqual(captions(false));
    expect(captions(false).join('')).not.toBe(captions(true).join(''));
  });

  it('shows no schema path to a casual reader, and every one to an engineer', () => {
    /*
     * `floors[].heightM` and `banks[].cars[]` are the field names of a file the player will never
     * open. They stay in Engineer, because *name the field it writes* is what keeps a row's claim
     * checkable — the discipline is right and it was simply pointed at the wrong reader.
     */
    for (const caption of captions(false)) {
      expect(caption, `casual caption "${caption}" leaks a schema path`).not.toMatch(/\[\]/);
    }
    const engineer = captions(true).join(' ');
    expect(engineer).toContain('floors[].heightM');
    expect(engineer).toContain('banks[].cars[]');
  });

  it('tells the two occupancy rows apart, which the shared caption did not', () => {
    /*
     * Both read `floors[].population = capacity × occupancy` — true of the pair and a description of
     * neither. *How many desks fit* and *how many are let* are different questions.
     */
    const casual = specRowsOf(TOWER, false);
    const capacity = casual.find((entry) => entry.row.key === 'capacityPerFloor')?.sub;
    const occupancy = casual.find((entry) => entry.row.key === 'occupancyPct')?.sub;
    expect(capacity).toBeDefined();
    expect(occupancy).toBeDefined();
    expect(capacity).not.toBe(occupancy);
    expect(capacity).toMatch(/built to hold/);
    expect(occupancy).toMatch(/let today/);
  });

  it('gives every row a caption in both modes, so neither is the empty one', () => {
    for (const showFieldPaths of [true, false]) {
      const rows = specRowsOf(TOWER, showFieldPaths);
      expect(rows).toHaveLength(SPEC_ROWS.length);
      for (const entry of rows) expect(entry.sub.length).toBeGreaterThan(0);
    }
  });

  it('lets the over-capacity warning win in both modes — it is not an engineer’s detail', () => {
    // The building telling a reader it is let past what it was designed for is not a caption about
    // what the row writes, so the disclosure split does not get to hide it.
    const overfull: BuildingSpec = { ...TOWER, occupancyPct: 115 };
    for (const showFieldPaths of [true, false]) {
      const row = specRowsOf(overfull, showFieldPaths).find(
        (entry) => entry.row.key === 'occupancyPct',
      );
      expect(row?.overCapacity).toBe(true);
      expect(row?.sub).toContain('over design capacity');
    }
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

/* -------------------------------------------------------------------------- *
 * Seeding from the stage — docs/19 defect 11
 * -------------------------------------------------------------------------- */

/**
 * The rule behind *Open building editor →* and the report's *Add a car* card: seed the staged
 * building when — and only when — doing so clobbers nothing. Each refusing arm is asserted, since
 * the no-clobber rule is the half the audit conceded was sound and the half a regression would
 * silently drop.
 */
describe('buildingEditorSeedOf — docs/19 defect 11', () => {
  const viewOf = (over: Partial<ViewerState>): ViewAt => ({
    state: { ...baseState(), ...over },
    resources: RESOURCES,
    recording: undefined,
    simTimeS: 0,
    building: undefined,
    playing: false,
  });

  it('seeds the staged building over a clean draft of another one', () => {
    // The audit's screen: Midtown on stage, the editor still holding Garden Apartments.
    const at = viewOf({ buildingId: 'midtown-office' });
    const seed = buildingEditorSeedOf(at);
    expect(seed?.editingBuildingId).toBe('midtown-office');
    expect(seed?.buildingSpec?.name).toBe('Midtown Office');
    // And the seeded spec is exactly what picking Midtown in the editor's own list produces.
    const config = buildingConfigOf(RESOURCES, [], 'midtown-office');
    expect(config).toBeDefined();
    if (config !== undefined) {
      expect(seed?.buildingSpec).toStrictEqual(specFromBuilding(config, 'midtown-office'));
    }
  });

  it('leaves a dirty draft alone — the no-clobber rule stands unweakened', () => {
    const at = viewOf({ buildingId: 'midtown-office' });
    const clean = buildingEditorSeedOf(at);
    expect(clean).toBeDefined();
    const dirty = viewOf({
      buildingId: 'midtown-office',
      buildingSpec: { ...at.state.buildingSpec, floors: at.state.buildingSpec.floors + 1 },
    });
    expect(buildingEditorSeedOf(dirty)).toBeUndefined();
  });

  it('does nothing when the editor is already on the staged building', () => {
    const at = viewOf({ buildingId: 'garden-apartments', editingBuildingId: 'garden-apartments' });
    expect(buildingEditorSeedOf(at)).toBeUndefined();
  });

  it('does nothing for a staged id this catalogue does not hold', () => {
    // A recording loaded from a file can stage a building the catalogue lacks; seeding BLANK_SPEC
    // under that name would look like the staged building while being an empty tower.
    expect(buildingEditorSeedOf(viewOf({ buildingId: 'no-such-building' }))).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The sizing block reaches the page — slice 6
 * -------------------------------------------------------------------------- */

/**
 * The non-test caller, named and driven: `mountBuildingEditor` builds the sizing block during
 * construction and inserts it before the advice line with `parentElement?.insertBefore` — the
 * insert the document recorder answers. What this proves is `dev/scopeNotes.test.ts`'s tier and
 * no more: the node is in the page, beside the element the mount named, with the framing note the
 * stylesheet cannot fake. The *figures* are written during `render`, which no Node recorder can
 * drive (`sliderHandlesOf` needs a real `HTMLInputElement`), so the moved-control half of the
 * requirement is pinned on the producer in `authoring/upPeak.test.ts` — change cars or speed and
 * the printed line changes — and `render` passes that producer's output to `drawSizing` verbatim.
 */
describe('the sizing block reaches the page — slice 6', () => {
  const inertContext = (): MountContext => ({
    update: () => undefined,
    runShift: () => undefined,
    openTab: () => undefined,
    fail: () => undefined,
  });

  it('inserts the block before the advice line, carrying its framing note', () => {
    const made = mountRecorder();
    mountBuildingEditor(made.elements.buildingEditor, inertContext());
    const siblings = made.around(made.elements.buildingEditor.advice);
    const block = siblings.find((sibling) => sibling.className === 'sizing-block');
    expect(block, 'the mount inserted no sizing block beside #building-advice').toBeDefined();
    /*
     * The framing line is the block's honesty: where the numbers come from (the oracle's closed
     * form) and what they cannot say (anything about waiting). Both halves are asserted, so a
     * copy edit cannot quietly drop the refusal half and leave a figures panel that overpromises.
     */
    const texts = (block?.children ?? []).map((child) => child.textContent).join(' ');
    expect(texts).toContain('same closed-form up-peak arithmetic');
    expect(texts).toContain('says nothing about how long anyone waits');
    // Before the advice line, not merely somewhere in the parent.
    const at = siblings.indexOf(block as (typeof siblings)[number]);
    const advice = siblings.findIndex((sibling) => sibling.id === 'building-advice');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(advice).toBeGreaterThan(at);
  });

  it('starts with an empty rows container — the figures are render’s, never construction’s', () => {
    /*
     * A block seeded with figures at construction would be a stale number the moment the first
     * render disagreed with it. Construction owes the page the container and the framing note;
     * the numbers belong to the spec on screen, which only `render` has.
     */
    const made = mountRecorder();
    mountBuildingEditor(made.elements.buildingEditor, inertContext());
    const block = made
      .around(made.elements.buildingEditor.advice)
      .find((sibling) => sibling.className === 'sizing-block');
    const rows = (block?.children ?? []).find((child) => child.className === 'sizing-rows');
    expect(rows).toBeDefined();
    expect(rows?.children).toHaveLength(0);
    expect(rows?.textContent).toBe('');
  });
});
