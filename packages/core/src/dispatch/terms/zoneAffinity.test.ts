import { describe, expect, it } from 'vitest';

import { FLOOR_PITCH_M, call, contextFor, makeCar } from './fixtures.test-helper.js';
import { zoneDeviationM } from './zoneAffinity.js';

/** Car A's operational zone: the five floors 8 to 12. */
const HIGH_ZONE: ReadonlyMap<string, readonly string[]> = new Map([
  ['A', ['8', '9', '10', '11', '12']],
]);

function scored(callFloorId: string, zones = HIGH_ZONE) {
  const car = makeCar('A', '10');
  return contextFor(car.snapshot(0), call(callFloorId, 'up'), { zoneFloorIdsByCarId: zones });
}

describe('zoneAffinity', () => {
  it('is zero inside the zone and rises with distance outside it', () => {
    // The ordering the term exists to express: a zoned dispatcher prefers its own floors, and
    // prefers a floor just outside its zone to one at the far end of the shaft.
    expect(zoneDeviationM(scored('10'))).toBe(0);
    expect(zoneDeviationM(scored('8'))).toBe(0);
    expect(zoneDeviationM(scored('12'))).toBe(0);

    const justOutside = zoneDeviationM(scored('7'));
    const farOutside = zoneDeviationM(scored('0'));

    expect(justOutside).toBeGreaterThan(0);
    expect(farOutside).toBeGreaterThan(justOutside);
  });

  it('measures the gap to the nearest zone floor, in metres of height', () => {
    // Metres, not floor counts: a building with a double-height lobby really does have floors
    // twice as far apart, and the energy and time costs of crossing them differ accordingly.
    expect(zoneDeviationM(scored('6'))).toBeCloseTo(2 * FLOOR_PITCH_M, 9);
    expect(zoneDeviationM(scored('20'))).toBeCloseTo(8 * FLOOR_PITCH_M, 9);
    expect(zoneDeviationM(scored('0'))).toBeCloseTo(8 * FLOOR_PITCH_M, 9);
  });

  it('is inert when no operational zoning is configured', () => {
    // No zone is not the same as an empty zone: it means nobody asked for zoning, and a term with
    // no information must contribute no cost. Falling back to the shaft's own service zone would
    // collapse two of the three kinds of zoning into one.
    const car = makeCar('A', '10');
    expect(zoneDeviationM(contextFor(car.snapshot(0), call('0', 'up')))).toBe(0);
    expect(zoneDeviationM(scored('0', new Map()))).toBe(0);
    expect(zoneDeviationM(scored('0', new Map([['A', []]])))).toBe(0);
  });

  it('is per car: another car’s zone says nothing about this one', () => {
    const zones: ReadonlyMap<string, readonly string[]> = new Map([['B', ['0', '1', '2']]]);
    expect(zoneDeviationM(scored('20', zones))).toBe(0);
  });

  it('ignores zone floors this shaft cannot reach', () => {
    // A zone naming a floor the car cannot serve says nothing about how far out of position it is.
    // With every named floor unreachable the zone does not constrain the car at all.
    const unreachable: ReadonlyMap<string, readonly string[]> = new Map([
      ['A', ['nowhere', 'also-nowhere']],
    ]);
    expect(zoneDeviationM(scored('0', unreachable))).toBe(0);

    const mixed: ReadonlyMap<string, readonly string[]> = new Map([['A', ['nowhere', '4']]]);
    expect(zoneDeviationM(scored('0', mixed))).toBeCloseTo(4 * FLOOR_PITCH_M, 9);
  });

  it('does not depend on where the car happens to be, only on the call', () => {
    // Operational zoning is about which floors a car should be covering, not about its current
    // position — that is `distanceTravelled`'s business, and duplicating it here would make two
    // terms move together.
    const near = makeCar('A', '10');
    const far = makeCar('A', '0');
    const subject = call('2', 'up');

    expect(
      zoneDeviationM(contextFor(near.snapshot(0), subject, { zoneFloorIdsByCarId: HIGH_ZONE })),
    ).toBe(zoneDeviationM(contextFor(far.snapshot(0), subject, { zoneFloorIdsByCarId: HIGH_ZONE })));
  });

  it('is never negative', () => {
    for (const floorId of ['0', '4', '8', '10', '12', '16', '20']) {
      expect(zoneDeviationM(scored(floorId)), floorId).toBeGreaterThanOrEqual(0);
    }
  });
});
