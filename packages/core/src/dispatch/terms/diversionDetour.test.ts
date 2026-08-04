/**
 * `diversionDetour`, driven through each of the four separate reasons it must read zero.
 *
 * The reasons are tested apart on purpose. A term that returned zero because the car was at rest
 * would pass a single "it is zero when nothing diverts" test while being broken for the other
 * three, and *"the switch does nothing"* reported as *"the effect is small"* is the failure mode
 * `DECISIONS.md` § D205 shipped a first draft of and § D211 clause 6′ exists to prevent.
 *
 * The positive case matters as much: this term is only worth its code if it is non-zero exactly
 * where `detourPenalty` is non-zero **and** the run is truncated. Both halves are asserted.
 */

import { describe, expect, it } from 'vitest';

import { requestedStop, runCutShortAt } from '../../model/car/estimateCost.js';
import type { CarSnapshot, CommittedStop } from '../../model/car/types.js';
import type { TermContext } from '../types.js';

import { detourPassengerSeconds } from './detourPenalty.js';
import { callCausesDiversion, diversionDetourPassengerSeconds } from './diversionDetour.js';
import {
  bothWaysContext,
  movingCarContext,
  stoppedCarContext,
} from './diversionFixtures.test-helper.js';

/* -------------------------------------------------------------------------- *
 * The four zeros
 * -------------------------------------------------------------------------- */

describe('diversionDetour is zero unless the call truncates a run', () => {
  it('is zero for a car standing still, however much detour the call causes', () => {
    const context = stoppedCarContext();
    // The control that gives the assertion meaning: there IS a detour to charge, and the
    // unconditional term charges it. Without this the zero below would be vacuous.
    expect(detourPassengerSeconds(context)).toBeGreaterThan(0);
    expect(callCausesDiversion(context)).toBe(false);
    expect(diversionDetourPassengerSeconds(context)).toBe(0);
  });

  it('is zero when the profile forbids diversion, and non-zero when it does not', () => {
    // `divertFrontierIndex` absent is how a profile says no — presence is permission (§ D205).
    //
    // Asserted as a **pair**, because a lone zero here would prove nothing. With diversion off the
    // route projects from the car's destination, so the call is served after the passengers have
    // got out and there is genuinely no detour to charge — § D205's original defect, not this
    // term's gate. Same car, same call, same instant, two snapshots: the only difference is the
    // permission, so the difference in the score is the gate.
    const { off, on } = bothWaysContext();
    expect(runCutShortAt(off.car, requestedStop(off.car, off.request))).toBeUndefined();
    expect(diversionDetourPassengerSeconds(off)).toBe(0);
    expect(diversionDetourPassengerSeconds(on)).toBeGreaterThan(0);
  });

  it('is zero when the call floor is one the car is already going to stop short at', () => {
    // The car is diverting anyway, for a stop it already holds. The call joins that stop rather
    // than causing a new truncation, so there is nothing to charge it for.
    const context = movingCarContext({ enRouteDiversion: true, callAtExistingDivertStop: true });
    expect(callCausesDiversion(context)).toBe(false);
    expect(diversionDetourPassengerSeconds(context)).toBe(0);
  });

  it('is zero when the call is beyond where the car is already committed to stop', () => {
    // Not divertible: past the destination, so serving it is an ordinary onward stop and the run
    // plays out in full. `divertibleTo` refuses it and so must this.
    const context = movingCarContext({ enRouteDiversion: true, callBeyondDestination: true });
    expect(callCausesDiversion(context)).toBe(false);
    expect(diversionDetourPassengerSeconds(context)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The one non-zero
 * -------------------------------------------------------------------------- */

describe('diversionDetour charges the detour when the call cuts the run short', () => {
  it('equals detourPenalty exactly, on a diverting assignment', () => {
    const context = movingCarContext({ enRouteDiversion: true });
    expect(callCausesDiversion(context)).toBe(true);

    const charged = diversionDetourPassengerSeconds(context);
    expect(charged).toBeGreaterThan(0);
    // The term's whole claim: same measurement, different gate. If these ever diverge, the term
    // has quietly grown arithmetic of its own and its docstring is wrong.
    expect(charged).toBe(detourPassengerSeconds(context));
  });

  it('names a real floor to be cut short at, and one short of the destination', () => {
    const context = movingCarContext({ enRouteDiversion: true });
    const extra = requestedStop(context.car, context.request);
    const cut = runCutShortAt(context.car, extra) as CommittedStop;
    expect(cut).toBeDefined();

    const motion = context.car.motion;
    expect(motion).toBeDefined();
    const sign = motion!.direction === 'up' ? 1 : -1;
    // Strictly short of where the car was going, and at or beyond the commit point — the two
    // halves of `divertibleTo`, restated here so a change to that predicate that made this term
    // price an impossible stop fails in this file too.
    expect(sign * (cut.floorIndex - motion!.toFloorIndex)).toBeLessThan(0);
    expect(sign * (cut.floorIndex - (context.car.divertFrontierIndex ?? 0))).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Purity, and agreement with the projection
 * -------------------------------------------------------------------------- */

describe('the term is pure and agrees with what the kernel would do', () => {
  it('does not mutate the snapshot it reads', () => {
    const context = movingCarContext({ enRouteDiversion: true });
    const before = JSON.stringify(snapshotShape(context.car));
    diversionDetourPassengerSeconds(context);
    expect(JSON.stringify(snapshotShape(context.car))).toBe(before);
  });

  it('is deterministic — the same context scores the same twice', () => {
    const context: TermContext = movingCarContext({ enRouteDiversion: true });
    expect(diversionDetourPassengerSeconds(context)).toBe(diversionDetourPassengerSeconds(context));
  });
});

/** The parts of a snapshot this term can see, for the mutation check. */
function snapshotShape(car: CarSnapshot): unknown {
  return {
    floorIndex: car.floorIndex,
    heightM: car.heightM,
    direction: car.direction,
    motion: car.motion,
    divertFrontierIndex: car.divertFrontierIndex,
    stops: car.stops,
    load: car.load,
  };
}
