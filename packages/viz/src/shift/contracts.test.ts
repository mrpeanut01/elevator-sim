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

/**
 * Buildings that ship without a Career contract, and why — GitHub issue **#376**.
 *
 * The coverage rule below is *every shipped building has exactly one contract*, and its stated
 * reason is that **a shipped building with no contract is a scenario the reader can never take**.
 * That was true of all eight, and it stopped being the whole truth when a **reference** building
 * landed: `burj-class-reference` exists so that § D527's five measurements have something to be
 * taken on — the engine's cost at 165 floors, the oracle at 10 m/s, the escalators' hop count —
 * and #376 says in terms that *which mode first uses the building* is not its to decide.
 *
 * So the choice was to author a ninth Career contract nobody asked for — a month's goals, pay and
 * difficulty for a 165-floor tower, which is design work with an owner — or to say plainly that
 * one building is not a scenario. This is the second, and it is a list rather than a silence: the
 * set is asserted non-empty below, every member is asserted to ship, and every member is asserted
 * to have no contract, so the exception cannot quietly widen into the rule.
 *
 * **A contract for this building would remove it from here**, which is the direction this is meant
 * to move in.
 */
const REFERENCE_ONLY: ReadonlySet<string> = new Set(['burj-class-reference']);

/**
 * The contracts whose day-1 miss rate measures **1.00**, in the order the curriculum reading puts
 * them — `DECISIONS.md` § D581 and § D599, `docs/33` § 4.7k.
 *
 * Eight of the sixteen, and they are the tail of the ladder by construction: a contract the
 * measurement cannot order goes after every contract it can. Bank count orders six of them and ties
 * twice; the car count breaks both ties. Named here rather than derived because the rates are a
 * sweep's output and this file runs no sweep — what it can check is that the tail is still the tail
 * and that the two keys still hold inside it.
 */
const TIED_AT_THE_CEILING: readonly string[] = Object.freeze([
  'c4',
  'c13',
  'c11',
  'c14',
  'c12',
  'c5',
  'c16',
  'c15',
]);

  it('covers every shipped building exactly once', () => {
    // Both directions. A contract for a building that does not ship is the first suite's
    // failure; a shipped building with no contract is a scenario the reader can never take.
    // `docs/12` § 4.4 said the set is the FIVE, not a subset of them — and eight buildings landed
    // after the handoff was written, so the campaign is thirteen and the deviation is recorded in
    // `docs/12` § 4.7. The rule the guard enforces is unchanged: coverage, in both directions.
    //
    // Compared as sets, not as sequences: the handoff's teaching order puts Secure Tower before
    // Mixed-Use High-Rise (zoning before transfers), which is not `data/buildings/`'s
    // alphabetical load order. The curriculum is the design's to choose; the coverage is not.
    const sorted = (ids: readonly string[]): readonly string[] =>
      [...ids].sort((a, b) => a.localeCompare(b));
    expect(sorted(CONTRACTS.map((contract) => contract.buildingId))).toEqual(
      sorted(BUILDING_IDS.filter((id) => !REFERENCE_ONLY.has(id))),
    );

    /*
     * The exception is asserted rather than merely applied: an empty set here would mean the
     * filter above had quietly become a no-op, and the coverage rule would be back to passing
     * because nothing was excluded rather than because everything was covered.
     */
    expect(REFERENCE_ONLY.size).toBeGreaterThan(0);
    for (const id of REFERENCE_ONLY) {
      expect(BUILDING_IDS, `${id} is excused a contract and does not ship`).toContain(id);
      expect(
        CONTRACTS.map((contract) => contract.buildingId),
        `${id} is excused a contract and has one`,
      ).not.toContain(id);
    }
  });

  it('runs one bank before two, two before a transfer, and a transfer before three', () => {
    /*
     * The order is `docs/33` § 4.7's, measured rather than designed by eye — GitHub issue #382. It
     * is asserted here as a **list** because it is a curriculum and a reader of this test should be
     * able to see it; the property that makes it a curve rather than a list is the sweep's, and the
     * sweep is a compute job rather than a check (`shift/contractCurve.sweep.test.ts`).
     *
     * **Harbour Point and Ashgate were inserted rather than appended** (GitHub issues #500, #501),
     * each at the position its own measured day-1 miss rate puts it: 0.42 of 50 seeds and 0.52,
     * against St Jude's 0.40, Midtown's 0.46 and Secure Tower's 0.52. `docs/33` § 4.7j carries the
     * two rows and the run.
     *
     * **The three reference towers were placed by a tie-break, and that is a different claim**
     * (GitHub issues #424, #425, #430; `docs/33` § 4.7k, `DECISIONS.md` § D581). All three measure
     * **1.00** at the same budget — and so do `c4` and `c5`, re-measured beside them — because the
     * energy bar asks 80 kJ a ride of towers whose rides cost 86.8 to 242.6 kJ. Five contracts tied
     * at the ceiling is a measurement that has stopped ordering, so the five are ordered by **bank
     * count** instead, which is the curriculum reading doing the work the measurement cannot. The
     * eight positions before them are untouched and are still each contract's own measured rate.
     *
     * **Three more joined the tie on 2026-09-15, and bank count stopped being a total order**
     * (GitHub issues #428, #427, #426; `DECISIONS.md` § D599). `c14`, `c15` and `c16` all measure
     * 1.00 too, so the tie is eight contracts — and `one-wtc-class-reference` and
     * `shanghai-class-reference` both have six banks while `vertical-city` and
     * `willis-class-reference` both have seven. The second key is the **car count**, smaller group
     * first: 73 before 106, and 35 before 104. Same reading as § D581's, applied to the only other
     * quantity of the arrangement a reader meets on the screen.
     */
    expect(CONTRACTS.map((contract) => contract.buildingId)).toEqual([
      'garden-apartments',
      'chancery-house',
      'st-jude-hospital',
      'harbour-point',
      'midtown-office',
      'crown-hotel',
      'secure-tower',
      'ashgate',
      'mixed-use-high-rise',
      'merdeka-class-reference',
      'ctf-class-reference',
      'one-wtc-class-reference',
      'shanghai-class-reference',
      'vertical-city',
      'willis-class-reference',
      'empire-state-class-reference',
    ]);
  });

  it('never asks a reader to run more banks than the scenario before it', () => {
    /*
     * The curriculum reading of the measured order, and the one thing about it a table can check
     * without running a simulation: 1, 1, 1, 1, 1, 1, 2, 2, 3, 7. Six single-bank buildings of
     * rising subtlety, then two banks and a credential, then two banks and a service zone, then one
     * transfer, then three. If a rebalance ever moves a three-bank tower above a one-bank one, this
     * fails and the curriculum claim in `contracts.ts`'s docstring has to be re-argued rather than
     * quietly dropped.
     *
     * **It survived two insertions, and that was not free.** Harbour Point is a one-bank tower and
     * Ashgate a two-bank one, and each was placed by its measured miss rate rather than by its bank
     * count — so a one-bank tower landing after a three-bank one was a live possibility this case
     * was watching for. It did not happen; had it, the honest move would have been to re-argue the
     * reading here rather than to reorder the ladder against its own measurement.
     *
     * **It survived three more, and this time it did the ordering rather than merely surviving it**
     * (GitHub issues #424, #425 and #430). The reading used to end `…, 3, 7` — a jump of four banks
     * between the ninth contract and the tenth, which was what a two-building ladder had room for.
     * The three reference towers all measure 1.00, as `c4` and `c5` do, so the measurement could
     * not place them; ordering that tie by bank count fills the jump exactly and the sequence runs
     * **1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7** with no step larger than one. If a rebalance ever
     * moves a tower against this, the honest move is still the one above: re-argue the reading,
     * never reorder the ladder against its own measurement.
     *
     * **And three more again, where the reading needed a second key** (GitHub issues #428, #427 and
     * #426; § D599). The sequence is now **1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 7, 8**: two
     * repeats rather than a jump, because bank count ties twice and the car count breaks it. The
     * non-decreasing property below is what carries the claim through a repeat — a list alone
     * cannot say whether `6, 6` is a curriculum or an accident, and the loop can.
     */
    const banksOf = (buildingId: string): number =>
      config.buildingsById.get(buildingId)?.banks.length ?? 0;
    const carsOf = (buildingId: string): number =>
      config.buildingsById.get(buildingId)?.banks.reduce((n, bank) => n + bank.cars.length, 0) ?? 0;
    const counts = CONTRACTS.map((contract) => banksOf(contract.buildingId));
    expect(counts).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 7, 8]);
    /*
     * The second key, asserted **only where it is the key** — inside the eight contracts that all
     * measure 1.00 and are therefore placed by the curriculum reading rather than by their own
     * rate. The first eight positions are each a measured miss rate, and a bank-count repeat there
     * (`chancery-house` then `st-jude-hospital`, both one bank) is the measurement doing the
     * ordering; requiring the car count to rise across it would be this test overruling the sweep.
     * That is the distinction § D581 draws and this case has to draw with it.
     */
    const firstTied = CONTRACTS.findIndex((contract) => contract.id === TIED_AT_THE_CEILING[0]);
    expect(
      CONTRACTS.slice(firstTied).map((contract) => contract.id),
      'the tie at the ceiling is no longer the tail of the ladder',
    ).toEqual([...TIED_AT_THE_CEILING]);
    for (let index = firstTied + 1; index < counts.length; index += 1) {
      if (counts[index] !== counts[index - 1]) continue;
      const here = CONTRACTS[index]?.buildingId ?? '';
      const before = CONTRACTS[index - 1]?.buildingId ?? '';
      expect(carsOf(here), `${before} then ${here}`).toBeGreaterThanOrEqual(carsOf(before));
    }
    // Non-decreasing, stated as the property rather than left to be read off the list — which is
    // what the list above is for and what a reader of a rebalance needs the test to hold.
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index] ?? 0, `position ${String(index + 1)}`).toBeGreaterThanOrEqual(
        counts[index - 1] ?? 0,
      );
    }
  });

  it('asks for between one and three clean shifts, rising', () => {
    // Non-decreasing, and an inserted contract may not ask for LESS than the arc it lands in — a
    // campaign that gets easier after its finale is a campaign with two finales. The shape is the
    // eight-contract ladder's at sixteen: one opener, then four at two, then eleven at three.
    expect(CONTRACTS.map((contract) => contract.needClean)).toEqual([
      1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    ]);
    for (let index = 1; index < CONTRACTS.length; index += 1) {
      const previous = CONTRACTS[index - 1]?.needClean ?? 0;
      expect(CONTRACTS[index]?.needClean ?? 0).toBeGreaterThanOrEqual(previous);
    }
  });

  it('keeps the handoff’s own ids, and labels every contract by its position', () => {
    /*
     * The ids are **names** and do not move with the order (issue #382): a saved week, a career
     * tower and `data/contract-ladder.json` all hold them, and renumbering would make one id mean
     * two things. The labels are *positions*, so they are re-derived when the order moves — which
     * is why the two lists below no longer read in step.
     */
    expect(CONTRACTS.map((contract) => contract.id)).toEqual([
      'c1', 'c6', 'c8', 'c9', 'c2', 'c7', 'c3', 'c10', 'c4', 'c13', 'c11', 'c14', 'c12', 'c5', 'c16', 'c15',
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
      'Scenario 9',
      'Scenario 10',
      'Scenario 11',
      'Scenario 12',
      'Scenario 13',
      'Scenario 14',
      'Scenario 15',
      'Scenario 16',
    ]);
    // The ids are names and the labels are positions, which is only visible where the two
    // disagree: `c5` is the fourteenth scenario, `c13` is the tenth, and `c15` — the last id
    // allocated — is the sixteenth while `c16` is the fifteenth.
    expect(CONTRACTS[9]?.id).toBe('c13');
    expect(CONTRACTS[9]?.label).toBe('Scenario 10');
    expect(CONTRACTS[13]?.id).toBe('c5');
    expect(CONTRACTS[13]?.label).toBe('Scenario 14');
    expect(CONTRACTS[14]?.id).toBe('c16');
    expect(CONTRACTS[15]?.id).toBe('c15');
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
