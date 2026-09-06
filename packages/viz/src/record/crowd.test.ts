/**
 * The shared crowd check, driven on fixtures — and mutation-shaped, since GitHub issue #350's own
 * acceptance is *perturbing one leg turns the check red, naming which leg*. The three shipped
 * call sites are exercised where they live (`fixit/cases.test.ts` on real run pairs, and the
 * browser tier on the stage); this file is about the predicate.
 */

import { describe, expect, it } from 'vitest';

import type { VizLeg } from '../contract/types.js';
import { assertSameCrowd, crowdDifferencesOf, CROWD_DIFFERENCE_LIMIT, sameCrowd } from './crowd.js';

function leg(
  passengerId: string,
  arrivedAt: number,
  origin: string,
  destination: string,
  boardedAt?: number,
): VizLeg {
  return {
    passengerId,
    originFloorId: origin,
    destinationFloorId: destination,
    direction: 'up',
    arrivedAt,
    ...(boardedAt === undefined ? {} : { boardedAt }),
  };
}

const CROWD = [leg('p1', 10, 'G', '5'), leg('p2', 12, 'G', '7'), leg('p3', 30, '7', 'G')];

describe('sameCrowd', () => {
  it('holds when only what the dispatcher decided differs', () => {
    const left = { legs: CROWD.map((entry) => ({ ...entry, boardedAt: entry.arrivedAt + 20 })) };
    const right = { legs: CROWD.map((entry) => ({ ...entry, boardedAt: entry.arrivedAt + 45 })) };
    expect(sameCrowd(left, right)).toBe(true);
    expect(() => assertSameCrowd(left, right, 'the test pair')).not.toThrow();
  });

  it('does not depend on leg order', () => {
    expect(sameCrowd({ legs: CROWD }, { legs: [...CROWD].reverse() })).toBe(true);
  });

  /*
   * The finding the module was built on: a transfer leg's arrival is the dispatcher's doing. Two
   * runs whose second legs land at different instants — and are even minted in a different order —
   * are still the same crowd, and two runs whose *first* legs differ are not, transfer legs or no.
   */
  it('leaves every transfer leg out, and reads every first leg', () => {
    const transferA = { ...leg('leg7', 403.4, '76', 'G'), legIndex: 1 };
    const transferB = { ...leg('leg7', 384.1, '26', '33'), legIndex: 1 };
    const firsts = CROWD.map((entry) => ({ ...entry, legIndex: 0 }));
    expect(sameCrowd({ legs: [...firsts, transferA] }, { legs: [...firsts, transferB] })).toBe(true);
    expect(sameCrowd({ legs: [...firsts, transferA] }, { legs: firsts })).toBe(true);
    const movedFirst = [...firsts.slice(1), { ...(firsts[0] as VizLeg), arrivedAt: 11 }];
    expect(sameCrowd({ legs: [...firsts, transferA] }, { legs: [...movedFirst, transferA] })).toBe(false);
    // Two recordings that carry only transfer legs have no crowd to compare.
    expect(crowdDifferencesOf({ legs: [transferA] }, { legs: [transferB] }).join('')).toContain('no crowd to compare');
  });

  it('reads where the journey ends, not where the leg does — a route is the building’s', () => {
    const direct = { ...leg('p1', 10, '3', '21'), legIndex: 0, finalDestinationFloorId: '21' };
    const viaLobby = { ...leg('p1', 10, '3', 'G'), legIndex: 0, finalDestinationFloorId: '21' };
    const second = { ...leg('leg1', 40, 'G', '21'), legIndex: 1, finalDestinationFloorId: '21' };
    expect(sameCrowd({ legs: [direct] }, { legs: [viaLobby, second] })).toBe(true);
    const elsewhere = { ...viaLobby, finalDestinationFloorId: '22' };
    expect(crowdDifferencesOf({ legs: [direct] }, { legs: [elsewhere, second] })).toEqual([
      'passenger p1 arriving at 10 s on 3 for 21 in the first run is passenger p1 arriving at 10 s on 3 for 22 in the second',
    ]);
  });

  it('refuses two empty recordings — non-vacuity is part of the contract', () => {
    expect(sameCrowd({ legs: [] }, { legs: [] })).toBe(false);
    expect(crowdDifferencesOf({ legs: [] }, { legs: [] }).join('')).toContain('no crowd to compare');
  });

  it('names a leg only one side carries, in either direction', () => {
    const missingRight = crowdDifferencesOf({ legs: CROWD }, { legs: CROWD.slice(0, 2) });
    expect(missingRight).toEqual(['only the first run carries passenger p3 arriving at 30 s on 7 for G']);
    const missingLeft = crowdDifferencesOf({ legs: CROWD.slice(1) }, { legs: CROWD });
    expect(missingLeft).toEqual(['only the second run carries passenger p1 arriving at 10 s on G for 5']);
  });

  it('names a passenger whose arrival or floors moved, once', () => {
    const perturbed = [CROWD[0] as VizLeg, leg('p2', 13, 'G', '7'), CROWD[2] as VizLeg];
    const differences = crowdDifferencesOf({ legs: CROWD }, { legs: perturbed });
    expect(differences).toEqual([
      'passenger p2 arriving at 12 s on G for 7 in the first run is passenger p2 arriving at 13 s on G for 7 in the second',
    ]);
    const movedFloor = [CROWD[0] as VizLeg, leg('p2', 12, '2', '7'), CROWD[2] as VizLeg];
    expect(crowdDifferencesOf({ legs: CROWD }, { legs: movedFloor })).toHaveLength(1);
  });

  it('throws with the pair named in front, so a red says where to look', () => {
    expect(() =>
      assertSameCrowd({ legs: CROWD }, { legs: CROWD.slice(1) }, 'the intervention pair'),
    ).toThrow(
      /^the intervention pair claims both runs met the same crowd, and they did not: only the first run carries passenger p1/u,
    );
  });

  it('caps the list and counts the rest', () => {
    const many = Array.from({ length: CROWD_DIFFERENCE_LIMIT + 5 }, (_, i) =>
      leg(`q${String(i)}`, i, 'G', '3'),
    );
    const differences = crowdDifferencesOf({ legs: many }, { legs: [] });
    expect(differences).toHaveLength(CROWD_DIFFERENCE_LIMIT + 1);
    expect(differences.at(-1)).toBe('and 5 more');
  });
});
