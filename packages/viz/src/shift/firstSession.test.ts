/**
 * The first session's draw — GitHub issue #208's code half, § D475, § D512, § D514.
 *
 * Three of the issue's four criteria are properties of the run and are held here; the fourth, ten
 * first-time testers, is not a property of code (§ D349). AC1 and AC2 — a building visibly failing
 * inside ninety seconds, legible on the stage before the report — are the legibility instrument's
 * own question asked of every member of the drawn set, on `legibility.test.ts`'s pinned seeds; AC3,
 * one change that measurably helped, is the report's lever path, which `campaign/works.test.ts` and
 * `dev/reportPanel` already pin on the legs and is not re-pinned here.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, resolveBuilding } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { initialState, shiftLengthForContract, shiftRunConfigOf, withFirstSession } from '../dev/state.js';

import { CONTRACTS, FIRST_CONTRACT_ID, contractById } from './contracts.js';
import {
  ELIGIBLE_FIRST_CONTRACT_IDS,
  FIRST_SESSION_LINE,
  FIRST_SESSION_STREAM,
  firstSessionContractFor,
  isFirstDayOnALegibleTower,
} from './firstSession.js';
import { LEGIBILITY_SWEEP, legibilityOf } from './legibility.js';
import { openWeek } from './week.js';

/** All eight shipped buildings — `legibility.sweep.test.ts`'s loader, since `RESOURCES` holds two. */
function allBuildings(): BrowserResources {
  const entries = LEGIBILITY_SWEEP.map((row) => row.buildingId).map((id) => {
    const config = parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

describe('the eligible set — § D512’s table read by arithmetic', () => {
  it('is every contract legible on more than a third of fifty seeds, in contract order', () => {
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).toEqual(['c2', 'c3', 'c4', 'c5', 'c7']);
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const row = LEGIBILITY_SWEEP.find((entry) => entry.contractId === id);
      expect(row?.legibleOf50 ?? 0).toBeGreaterThan(50 / 3);
    }
    /* The three the instrument found never or rarely legible are out, the campaign's opener first. */
    for (const id of ['c1', 'c6', 'c8']) expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(id);
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(FIRST_CONTRACT_ID);
  });

  it('names contracts the product ships, and only those', () => {
    const shipped = new Set(CONTRACTS.map((contract) => contract.id));
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) expect(shipped.has(id)).toBe(true);
    expect(new Set(LEGIBILITY_SWEEP.map((row) => row.contractId))).toEqual(shipped);
  });
});

describe('the draw — a named stream off the session’s seed', () => {
  it('is a function of the seed, lands inside the set, and reaches every member', () => {
    expect(FIRST_SESSION_STREAM).toBe('first-session');
    const seen = new Map<string, number>();
    for (let n = 0; n < 2_000; n += 1) {
      const seed = 20_260_906n + 7_919n * BigInt(n);
      const drawn = firstSessionContractFor(seed);
      expect(firstSessionContractFor(seed)).toBe(drawn);
      expect(ELIGIBLE_FIRST_CONTRACT_IDS).toContain(drawn);
      seen.set(drawn, (seen.get(drawn) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...ELIGIBLE_FIRST_CONTRACT_IDS].sort());
    /* No member is starved: at 2 000 draws over five, each lands at least a fifth of its share. */
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) expect(seen.get(id) ?? 0).toBeGreaterThan(2_000 / 25);
  });

  it('opens a fresh week on the drawn contract, and the building follows the week', () => {
    const seed = 424_242n;
    const drawn = withFirstSession(initialState(RESOURCES, seed), RESOURCES);
    const contract = contractById(firstSessionContractFor(seed));
    expect(contract).toBeDefined();
    expect(drawn.week).toEqual(openWeek(contract?.id));
    expect(drawn.buildingId).toBe(contract?.buildingId);
    expect(drawn.shiftLengthS).toBe(shiftLengthForContract(contract?.id ?? ''));
    expect(drawn.parkedWeeks).toEqual([]);
    expect(isFirstDayOnALegibleTower(drawn.week)).toBe(true);
  });
});

describe('the door’s line — derived from the week, never stored', () => {
  it('is true of a first day nobody has played on a legible tower, and of nothing else', () => {
    expect(isFirstDayOnALegibleTower(openWeek('c2'))).toBe(true);
    expect(isFirstDayOnALegibleTower(openWeek('c1'))).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), day: 2 })).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), attempt: 1 })).toBe(false);
    /* Worded to be true however the player arrived: it names the set, not the draw. */
    expect(FIRST_SESSION_LINE).toContain('five towers');
    expect(FIRST_SESSION_LINE).toContain('400 days');
    expect(FIRST_SESSION_LINE).not.toMatch(/\b(you|your|yours)\b/iu);
  });
});

describe('AC1 and AC2, asked of every member of the set on the pinned seeds', () => {
  it('every eligible contract’s day 1 is legible on most of the first ten seeds, and says when', () => {
    const resources = allBuildings();
    const legibleAt: Record<string, number[]> = {};
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const contract = contractById(id);
      if (contract === undefined) throw new Error(id);
      const moments: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        const state = {
          ...baseState(),
          buildingId: contract.buildingId,
          dispatcherId: 'collective',
          shiftLengthS: shiftLengthForContract(id),
          seed: 20_260_824n + 7_919n * BigInt(n),
          campaignEventId: 'ordinary' as const,
        };
        const plan = shiftRunConfigOf(resources, state);
        const day = legibilityOf(recordRun(plan.config, { recordDecisions: false }).recording);
        if (day.legible) moments.push(day.legibleAtS ?? -1);
        expect(day.legible).toBe(day.legibleAtS !== undefined);
      }
      legibleAt[id] = moments;
    }
    /* The slice `legibility.test.ts` pins, read for the set: c3 is the two-fifths member. */
    expect(Object.fromEntries(Object.entries(legibleAt).map(([id, list]) => [id, list.length]))).toEqual({
      c2: 10,
      c3: 2,
      c4: 6,
      c5: 8,
      c7: 8,
    });
    /* AC1's clock: on every legible day the moment is inside the day, and never before the window. */
    for (const [id, list] of Object.entries(legibleAt)) {
      for (const at of list) {
        expect(at).toBeGreaterThanOrEqual(120);
        expect(at).toBeLessThanOrEqual(shiftLengthForContract(id));
      }
    }
  }, 300_000);
});
