/**
 * `dutyMismatch` — the price of sending a car that is not for this trip (GitHub issue #481,
 * `DECISIONS.md` § D549).
 *
 * The owner's ruling is the whole contract: *"a mismatch between a rider's duty and a car's costs a
 * weighted penalty declared in data, so a profile can express anything from a preference to
 * near-exclusive use."* So the term is an indicator and nothing else — 0 or 1 — bounded at 1, and
 * the weight a profile gives it is the entire price. Everything a preference or a reservation means
 * lives in that one number in `data/dispatcher-profiles.json`, never in this file.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_CAR_DUTY, DUTIES, type Duty } from '../../config/types.js';
import { Car } from '../../model/car/car.js';
import { termReferenceScale } from '../normalize.js';
import type { DispatchCall } from '../types.js';

import { dutyMismatchOf, dutyMismatchTerm } from './dutyMismatch.js';
import {
  CONFIG,
  DESTINATION_CONFIG,
  SPEC,
  call,
  clockAt,
  contextFor,
  plainShaft,
} from './fixtures.test-helper.js';

/** A real car's snapshot, so the duty reaches the term through `CarInit` rather than a spread. */
function carDeclaring(duty: Duty | undefined, id = 'A') {
  return new Car({
    id,
    bankId: 'low',
    spec: SPEC,
    shaft: plainShaft(),
    homeFloorId: '0',
    clock: clockAt(0),
    ...(duty === undefined ? {} : { duty }),
  }).snapshot(0);
}

function callFor(duty: Duty | undefined): DispatchCall {
  return { ...call('5', 'up', 0, '9'), ...(duty === undefined ? {} : { duty }) };
}

describe('dutyMismatch', () => {
  it('is zero when the call carries no duty, whatever the car declares', () => {
    // Which is every call in every building that declares no duty: the generator records a duty
    // only where a car declares one, so this arm is what keeps those runs bit-identical.
    for (const duty of [undefined, ...DUTIES]) {
      expect(dutyMismatchOf(contextFor(carDeclaring(duty), callFor(undefined)))).toBe(0);
    }
  });

  it("is zero when the rider's duty is the car's own", () => {
    for (const duty of DUTIES) {
      expect(dutyMismatchOf(contextFor(carDeclaring(duty), callFor(duty)))).toBe(0);
    }
  });

  it('is one for every pair that differs, in both directions', () => {
    // Symmetric on purpose. A passenger in the goods car and a pallet in the passenger car are the
    // same mistake priced once, and a profile that wants them priced differently has no second
    // weight to reach for — which is the ruling's "one weighted penalty", not an omission.
    let pairs = 0;
    for (const carDuty of DUTIES) {
      for (const riderDuty of DUTIES) {
        if (carDuty === riderDuty) continue;
        expect(dutyMismatchOf(contextFor(carDeclaring(carDuty), callFor(riderDuty)))).toBe(1);
        pairs += 1;
      }
    }
    expect(pairs).toBe(DUTIES.length * (DUTIES.length - 1));
  });

  it('reads a car that declares no duty as a passenger car', () => {
    expect(DEFAULT_CAR_DUTY).toBe('passenger');
    // Omitted rather than defaulted on the snapshot, so a building that declares nothing hands
    // dispatch exactly the snapshot it handed it before the field existed.
    expect('duty' in carDeclaring(undefined)).toBe(false);
    for (const riderDuty of DUTIES) {
      expect(dutyMismatchOf(contextFor(carDeclaring(undefined), callFor(riderDuty)))).toBe(
        riderDuty === DEFAULT_CAR_DUTY ? 0 : 1,
      );
    }
  });

  it('reads the duty off the snapshot a real car takes', () => {
    expect(carDeclaring('bed').duty).toBe('bed');
    expect(carDeclaring('goods').duty).toBe('goods');
  });

  it('is bounded at one, so its weight is the whole price of a mismatch', () => {
    const scale = termReferenceScale(dutyMismatchTerm);
    expect(scale.mode).toBe('bounded');
    expect(scale.fullCostRaw).toBe(1);
    expect(scale.note.length).toBeGreaterThan(20);
  });

  it('declares no activeWhen, because the call carries its duty under every call type', () => {
    expect(dutyMismatchTerm.activeWhen).toBeUndefined();
    expect(dutyMismatchTerm.partiallyActiveWhen).toBeUndefined();
    // Both call types this fixture file offers, named so the claim is about them and not assumed.
    expect(CONFIG.dispatch.callType).toBe('up-down-buttons');
    expect(DESTINATION_CONFIG.dispatch.callType).not.toBe('up-down-buttons');
    for (const config of [CONFIG, DESTINATION_CONFIG]) {
      const context = contextFor(carDeclaring('goods'), callFor('bed'), { config });
      expect(context.request.duty).toBe('bed');
      expect(dutyMismatchOf(context)).toBe(1);
    }
  });

  it('is pure: frozen inputs, the same answer twice, nothing written', () => {
    const context = contextFor(carDeclaring('goods'), callFor('passenger'));
    expect(Object.isFrozen(context.car)).toBe(true);
    expect(Object.isFrozen(context.request)).toBe(true);
    const before = JSON.stringify([context.car.duty, context.request]);
    expect(dutyMismatchTerm.evaluate(context)).toBe(1);
    expect(dutyMismatchTerm.evaluate(context)).toBe(1);
    expect(JSON.stringify([context.car.duty, context.request])).toBe(before);
  });
});
