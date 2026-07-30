/**
 * The machine-class editor's decisions, against the shipped class table.
 *
 * The one that matters is the chip row: a rated speed outside the class's own band is a car
 * `resolveBuilding` refuses, and offering one so it can be refused later is worse UX than not
 * offering it. Everything else here is the row list — nine controls over fields the record has, and
 * no control for the door and transfer times, which are file-level and shared by every class.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseElevatorSpecs, type ElevatorSpecs } from '@elevator-sim/core/browser';

import {
  MACHINE_ROWS,
  classesFromSpecs,
  specFromClass,
  type MachineSpec,
} from '../authoring/machineSpec.js';

import {
  machineFieldOf,
  machinePatchFor,
  machineRowsOf,
  ratedSpeedChipsOf,
  speedLadderOf,
} from './machinesEditor.js';

const DATA = new URL('../../../../data/', import.meta.url);
const SPECS: ElevatorSpecs = parseElevatorSpecs(
  JSON.parse(readFileSync(fileURLToPath(new URL('elevator-specs.json', DATA)), 'utf8')) as unknown,
);
const CLASSES = classesFromSpecs(SPECS);
const LADDER = speedLadderOf(SPECS);

const specOf = (id: string): MachineSpec => {
  const found = CLASSES.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no class ${id}`);
  return specFromClass(found);
};

describe('the nine rows', () => {
  it('draws exactly the model’s rows, and no control for a file-level field', () => {
    const rows = machineRowsOf(specOf('geared-traction'));
    expect(rows.map((row) => row.row.key)).toStrictEqual(MACHINE_ROWS.map((row) => row.key));
    expect(rows).toHaveLength(9);
    const keys = rows.map((row) => row.row.key).join(' ');
    // `doors` and `timing` are shared by every class; a per-class control would write nothing.
    expect(keys).not.toContain('dwell');
    expect(keys).not.toContain('transfer');
  });

  it('heads each group exactly once, in the model’s order', () => {
    const headings = machineRowsOf(specOf('hydraulic'))
      .filter((row) => row.heading !== '')
      .map((row) => row.heading);
    expect(headings).toStrictEqual(['SPEED BAND', 'RIDE', 'LIMITS']);
  });

  it('names the record field each row writes', () => {
    expect(machineFieldOf('speedTypicalMps')).toBe('ratedSpeedMps.typical');
    expect(machineFieldOf('loadMinLb')).toBe('capacityLbRange[0]');
    // The rise ceiling is an advisory the loader builds through, and the sub-line says so rather
    // than implying a refusal — the false-mechanism defect `documentation.test.ts` guards.
    expect(machineFieldOf('maxRiseM')).toContain('advisory');
  });

  it('reads each value off the spec and formats it in the row’s unit', () => {
    const rows = machineRowsOf(specOf('geared-traction'));
    const value = (key: string): string | undefined =>
      rows.find((row) => row.row.key === key)?.value;
    expect(value('speedTypicalMps')).toBe('2.50 m/s');
    expect(value('maxFloors')).toBe('25');
    expect(value('loadMaxLb')).toBe('4000 lb');
  });

  it('patches the field the row names', () => {
    expect(machinePatchFor('jerkMps3', 1.4)).toStrictEqual({ jerkMps3: 1.4 });
    expect(machinePatchFor('maxFloors', 32)).toStrictEqual({ maxFloors: 32 });
    // `name` is in the key type and has a text box rather than a slider.
    expect(machinePatchFor('name', 1)).toStrictEqual({});
  });
});

describe('the rated-speed chips', () => {
  it('takes its ladder from the shipped table rather than inventing one', () => {
    for (const entry of SPECS.classes) {
      expect(LADDER).toContain(entry.ratedSpeedMps.min);
      expect(LADDER).toContain(entry.ratedSpeedMps.typical);
      expect(LADDER).toContain(entry.ratedSpeedMps.max);
    }
    expect([...LADDER]).toStrictEqual([...LADDER].sort((a, b) => a - b));
  });

  it('never offers a speed outside the class’s own band', () => {
    for (const machineClass of CLASSES) {
      const spec = specFromClass(machineClass);
      for (const chip of ratedSpeedChipsOf(spec, LADDER)) {
        expect(chip.speed).toBeGreaterThanOrEqual(spec.speedMinMps);
        expect(chip.speed).toBeLessThanOrEqual(spec.speedMaxMps);
      }
    }
  });

  it('always offers the band’s two ends, so a narrow class still has chips', () => {
    const spec: MachineSpec = { ...specOf('hydraulic'), speedMinMps: 0.9, speedMaxMps: 0.95 };
    const offered = ratedSpeedChipsOf(spec, LADDER).map((chip) => chip.speed);
    expect(offered).toStrictEqual([0.9, 0.95]);
  });

  it('presses exactly the current typical, and offers it when it is inside the band', () => {
    for (const machineClass of CLASSES) {
      const spec = specFromClass(machineClass);
      const pressed = ratedSpeedChipsOf(spec, LADDER).filter((chip) => chip.pressed);
      expect(pressed.map((chip) => chip.speed)).toStrictEqual([spec.speedTypicalMps]);
    }
  });
});
