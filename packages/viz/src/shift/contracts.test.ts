/**
 * Every scenario names a building that exists, and the stat line is derived from it.
 *
 * The first suite is the one that matters: a contract's `buildingId` is a string, and a string
 * that no longer names a file is a scenario the reader can select and never run. It is loaded
 * against the real `data/` for the reason `fixtures.test-helper.ts` gives — a fixture building
 * would prove that a fixture building resolves.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { BUILDING_IDS, DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import {
  CONTRACTS,
  contractById,
  contractForBuilding,
  contractStatus,
  nextContract,
  statLineOf,
} from './contracts.js';
import { openWeek } from './week.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

describe('the scenarios are the shipped buildings, one contract each', () => {
  it('names a building that resolves, for every contract', () => {
    for (const contract of CONTRACTS) {
      const building = config.buildingsById.get(contract.buildingId);
      expect(building, `${contract.id} names "${contract.buildingId}"`).toBeDefined();
    }
  });

  it('covers every shipped building exactly once', () => {
    // Both directions. A contract for a building that does not ship is the first suite's
    // failure; a shipped building with no contract is a scenario the reader can never take.
    // `docs/12` § 4.4 said the set is the FIVE, not a subset of them — and three buildings landed
    // after the handoff was written, so the campaign is eight and the deviation is recorded in
    // `docs/12` § 4.7. The rule the guard enforces is unchanged: coverage, in both directions.
    //
    // Compared as sets, not as sequences: the handoff's teaching order puts Secure Tower before
    // Mixed-Use High-Rise (zoning before transfers), which is not `data/buildings/`'s
    // alphabetical load order. The curriculum is the design's to choose; the coverage is not.
    const sorted = (ids: readonly string[]): readonly string[] =>
      [...ids].sort((a, b) => a.localeCompare(b));
    expect(sorted(CONTRACTS.map((contract) => contract.buildingId))).toEqual(sorted(BUILDING_IDS));
  });

  it('teaches zoning before transfers, which is the handoff’s order and not the filesystem’s', () => {
    // The handoff's five, in the handoff's teaching order, followed by the three that landed
    // after it was written. The prefix is asserted separately from the tail so a change to the
    // designed curriculum fails distinctly from a change to the extension.
    expect(CONTRACTS.slice(0, 5).map((contract) => contract.buildingId)).toEqual([
      'garden-apartments',
      'midtown-office',
      'secure-tower',
      'mixed-use-high-rise',
      'vertical-city',
    ]);
    expect(CONTRACTS.slice(5).map((contract) => contract.buildingId)).toEqual([
      'chancery-house',
      'crown-hotel',
      'st-jude-hospital',
    ]);
  });

  it('asks for between one and three clean shifts, rising', () => {
    // Non-decreasing, and the three appended contracts may not ask for LESS than the arc they
    // follow — a campaign that gets easier after its finale is a campaign with two finales.
    expect(CONTRACTS.map((contract) => contract.needClean)).toEqual([1, 2, 2, 2, 3, 3, 3, 3]);
    for (let index = 1; index < CONTRACTS.length; index += 1) {
      const previous = CONTRACTS[index - 1]?.needClean ?? 0;
      expect(CONTRACTS[index]?.needClean ?? 0).toBeGreaterThanOrEqual(previous);
    }
  });

  it('keeps the handoff’s own ids and labels', () => {
    expect(CONTRACTS.map((contract) => contract.id)).toEqual([
      'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
    ]);
    expect(CONTRACTS.map((contract) => contract.label)).toEqual([
      'Scenario 1',
      'Scenario 2',
      'Scenario 3',
      'Scenario 4',
      'Scenario 5',
      'Scenario 6',
      'Scenario 7',
      'Scenario 8',
    ]);
  });

  it('carries a brief and a teaching point on every one', () => {
    for (const contract of CONTRACTS) {
      expect(contract.brief.length, contract.id).toBeGreaterThan(120);
      expect(contract.teaches.length, contract.id).toBeGreaterThan(10);
      expect(contract.reward.length, contract.id).toBeGreaterThan(10);
    }
  });
});

describe('lookup', () => {
  it('finds a contract by id and by building', () => {
    expect(contractById('c3')?.buildingId).toBe('secure-tower');
    expect(contractForBuilding('secure-tower')?.id).toBe('c3');
  });

  it('returns undefined rather than throwing for an id nobody ships', () => {
    expect(contractById('c99')).toBeUndefined();
    expect(contractForBuilding('a-building-somebody-drew')).toBeUndefined();
  });

  it('runs out at the end of the list rather than wrapping', () => {
    // Derived from the list rather than naming its last member, so appending a contract does not
    // silently turn this into an assertion about the middle of the campaign.
    const last = CONTRACTS[CONTRACTS.length - 1];
    const penultimate = CONTRACTS[CONTRACTS.length - 2];
    expect(last).toBeDefined();
    expect(penultimate).toBeDefined();
    expect(nextContract(penultimate?.id ?? '')?.id).toBe(last?.id);
    expect(nextContract(last?.id ?? '')).toBeUndefined();
  });
});

describe('every scenario is open from the start', () => {
  it('never answers "locked" — scenarios teach, they do not gate', () => {
    const week = openWeek('c1');
    // `design.html` :1616. The status union has no `locked` member, so this asserts the
    // behaviour the type already forbids: a fresh week on the first contract still reports the
    // fifth as selectable.
    expect(contractStatus(week, 'c1')).toBe('current');
    expect(contractStatus(week, 'c5')).toBe('open');
    const cleared = { ...week, completed: ['c1'] };
    expect(contractStatus(cleared, 'c1')).toBe('cleared');
  });
});

describe('statLineOf is generated from the building, not authored', () => {
  it('agrees with the building it was given, on every contract', () => {
    for (const contract of CONTRACTS) {
      const building = requireBuilding(config, contract.buildingId);
      const line = statLineOf(building);
      const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
      expect(line, contract.buildingId).toContain(`${String(building.floors.length)} floors`);
      expect(line, contract.buildingId).toContain(`${String(cars)} cars`);
      expect(line, contract.buildingId).toMatch(/ · [\d.]+ m\/s · /);
      expect(line.split(' · ')).toHaveLength(4);
    }
  });

  it('reports the file’s numbers, not the handoff’s authored ones', () => {
    // § 4.4: "the file wins and the line is generated from it". Midtown Office is the case the
    // handoff spells out, so it is the one pinned here.
    const midtown = requireBuilding(config, 'midtown-office');
    expect(statLineOf(midtown)).toBe(
      `${String(midtown.floors.length)} floors · 4 cars · 2.5 m/s · 1,710 people`,
    );
  });

  it('quotes the fastest car, which is what a spec sheet leads with', () => {
    // Mixed-Use High-Rise runs an 8 m/s shuttle beside much slower local cars. A mean over the
    // fleet would describe no car in the building.
    const mixed = requireBuilding(config, 'mixed-use-high-rise');
    const speeds = mixed.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
    const fastest = Math.max(...speeds);
    expect(Math.min(...speeds)).toBeLessThan(fastest);
    expect(statLineOf(mixed)).toContain(`${String(fastest)} m/s`);
  });

  it('groups thousands without asking the machine what locale it is in', () => {
    // `toLocaleString` would make the string depend on the host, which is the same class of
    // non-determinism invariant 2 forbids one layer down.
    const vertical = requireBuilding(config, 'vertical-city');
    expect(statLineOf(vertical)).toContain('4,887 people');
  });
});
