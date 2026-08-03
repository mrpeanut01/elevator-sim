/**
 * En-route diversion: the commit point, and the stop it makes possible.
 *
 * The defect these cover is the one described in `terms/directionReversal.ts`: a car descending
 * to the lobby used to be judged from the lobby, so a down call on a floor it was about to fly
 * through scored two reversals — the worst the term can return — and conventional collective
 * refused the one car in the building already going there facing the right way.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { createDispatchPolicy } from '../../dispatch/index.js';
import { assessDirectionReversal } from '../../dispatch/terms/directionReversal.js';
import type { DispatchCall } from '../../dispatch/types.js';
import type { LoadedConfig } from '../../config/types.js';
import { buildProfile, kinematicsAt, sharedPrefixSeconds } from '../../physics/motion/index.js';
import { load } from '../../sim/fixtures.test-helper.js';
import { Simulation } from '../../sim/simulation.js';
import { ModelError } from '../types.js';

import type { Car } from './car.js';
import type { ServedFloor } from './types.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/**
 * Midtown Office's first car, standing at its home floor.
 *
 * Built through `Simulation` rather than by calling the `Car` constructor directly, so the shaft
 * is the real indexed geometry the runner uses. A hand-built car is a different building.
 */
function subject(): { car: Car; floors: readonly ServedFloor[] } {
  const building = config.buildingsById.get('midtown-office');
  const dispatcherProfile = config.dispatcherProfilesById.get('collective');
  if (building === undefined || dispatcherProfile === undefined) throw new Error('fixture');
  const simulation = new Simulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 1,
  });
  const car = simulation.building.cars[0];
  if (car === undefined) throw new Error('no car');
  return { car, floors: car.shaft.floors };
}

/* -------------------------------------------------------------------------- *
 * The physics
 * -------------------------------------------------------------------------- */

describe('sharedPrefixSeconds', () => {
  const constraints = { ratedSpeedMps: 2.5, acceleration: 1.0, jerk: 1.2 };

  it('is the whole of the shorter profile when both reach rated speed', () => {
    const long = buildProfile(-60, constraints);
    const short = buildProfile(-30, constraints);
    expect(long.kind).toBe('speedLimited');
    expect(short.kind).toBe('speedLimited');

    const shared = sharedPrefixSeconds(short, long);
    // Agreement ends where the shorter profile starts braking, and not before.
    expect(shared).toBeCloseTo(short.phases[4].startTime, 12);
    expect(shared).toBeGreaterThan(0);
  });

  it('describes a trajectory the two profiles genuinely agree on, sample by sample', () => {
    const long = buildProfile(-60, constraints);
    const short = buildProfile(-30, constraints);
    const shared = sharedPrefixSeconds(short, long);

    for (let step = 0; step <= 20; step += 1) {
      const t = (shared * step) / 20;
      const a = kinematicsAt(short, t);
      const b = kinematicsAt(long, t);
      // Bit-identical, not merely close: inside the shared prefix the two are computed by the
      // same arithmetic on the same phase records. That exactness is what makes relabelling a
      // car from one profile onto the other a no-op rather than a teleport.
      expect(a.position).toBe(b.position);
      expect(a.velocity).toBe(b.velocity);
      expect(a.acceleration).toBe(b.acceleration);
    }
  });

  it('collapses to the opening ramp for a short hop, and ends before that hop would brake', () => {
    // Not zero, which is what this test first asserted and what the physics contradicts. Both
    // profiles leave rest under the same constant jerk, so they agree for as long as the
    // shorter one's `jerkToAccel` lasts — a car in the first moments of a long run has not yet
    // committed to a peak and can still be re-planned onto a near floor. The window is short
    // and real, and the conservative half is what matters: it closes well before the hop's own
    // deceleration, so no diversion is ever granted past the point of stopping.
    const long = buildProfile(-60, constraints);
    const hop = buildProfile(-1, constraints);
    expect(hop.kind).toBe('jerkLimited');

    const shared = sharedPrefixSeconds(hop, long);
    expect(shared).toBeGreaterThan(0);
    expect(shared).toBe(Math.min(hop.phases[0].endTime, long.phases[0].endTime));
    expect(shared).toBeLessThan(hop.phases[4].startTime);
    // And far shorter than a long diversion's window: nearness costs opportunity.
    expect(shared).toBeLessThan(sharedPrefixSeconds(buildProfile(-30, constraints), long));
  });

  it('is zero for opposite directions', () => {
    expect(sharedPrefixSeconds(buildProfile(30, constraints), buildProfile(-30, constraints))).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * The commit point
 * -------------------------------------------------------------------------- */

describe('Car.divertFrontier', () => {
  it('is undefined for a standing car', () => {
    const { car } = subject();
    expect(car.divertFrontier(0)).toBeUndefined();
  });

  it('recedes as the car gets closer to its target', () => {
    const { car, floors } = subject();
    const top = floors[floors.length - 1] as ServedFloor;
    const bottom = floors[0] as ServedFloor;

    car.departFor(top.id, 0);
    const atTop = car.snapshot(0).motion?.arrivesAt ?? 0;
    car.completeArrival(atTop);
    const motion = car.departFor(bottom.id, atTop + 1);

    const early = car.divertFrontier(motion.startedAt + 0.1);
    const late = car.divertFrontier(motion.arrivesAt - 0.5);
    expect(early).toBeDefined();
    // Monotone in the right direction: later in the run, fewer floors remain stoppable, so the
    // frontier can only move *down* the shaft on a descending run.
    expect((late?.index ?? bottom.index)).toBeLessThan(early?.index ?? 0);
  });

  it('leaves the destination itself out — arriving is not diverting', () => {
    const { car, floors } = subject();
    const top = floors[floors.length - 1] as ServedFloor;
    const bottom = floors[0] as ServedFloor;
    car.departFor(top.id, 0);
    car.completeArrival(car.snapshot(0).motion?.arrivesAt ?? 0);
    const motion = car.departFor(bottom.id, 100);
    const frontier = car.divertFrontier(motion.startedAt + 0.1);
    expect(frontier?.index).toBeLessThan(top.index);
    expect(frontier?.index).toBeGreaterThan(bottom.index);
  });
});

/* -------------------------------------------------------------------------- *
 * The diversion
 * -------------------------------------------------------------------------- */

describe('Car.divertTo', () => {
  it('arrives earlier, at the new floor, without moving the run it is already on', () => {
    const { car, floors } = subject();
    const top = floors[floors.length - 1] as ServedFloor;
    const bottom = floors[0] as ServedFloor;
    car.departFor(top.id, 0);
    car.completeArrival(car.snapshot(0).motion?.arrivesAt ?? 0);
    const original = car.departFor(bottom.id, 100);

    const frontier = car.divertFrontier(original.startedAt + 0.1);
    expect(frontier).toBeDefined();
    const diverted = car.divertTo((frontier as ServedFloor).id, original.startedAt + 0.1);

    expect(diverted.toFloorId).toBe((frontier as ServedFloor).id);
    expect(diverted.arrivesAt).toBeLessThan(original.arrivesAt);
    // The run keeps its identity: same start, same direction, same origin. Only the end moves.
    expect(diverted.startedAt).toBe(original.startedAt);
    expect(diverted.fromFloorId).toBe(original.fromFloorId);
    expect(diverted.direction).toBe(original.direction);
    expect(car.diversions).toBe(1);
  });

  it('refuses a floor the car is already past the point of stopping at', () => {
    const { car, floors } = subject();
    const top = floors[floors.length - 1] as ServedFloor;
    const bottom = floors[0] as ServedFloor;
    car.departFor(top.id, 0);
    car.completeArrival(car.snapshot(0).motion?.arrivesAt ?? 0);
    const motion = car.departFor(bottom.id, 100);

    // One floor below the start: the shortest possible diversion, and the first to become
    // impossible. Asked for near the end of the run it must throw rather than round off — a
    // granted-but-impossible stop is a car that arrives at a speed the envelope forbids.
    const justBelow = floors[floors.length - 2] as ServedFloor;
    expect(() => car.divertTo(justBelow.id, motion.arrivesAt - 0.1)).toThrow(ModelError);
  });

  it('refuses when the car is not moving at all', () => {
    const { car, floors } = subject();
    expect(() => car.divertTo((floors[1] as ServedFloor).id, 0)).toThrow(ModelError);
  });
});

/* -------------------------------------------------------------------------- *
 * What the dispatcher makes of it
 * -------------------------------------------------------------------------- */

describe('a descending car and a down call it is about to fly past', () => {
  /** The car mid-descent, and a down call on a floor between it and the lobby. */
  function scene(enRouteDiversion: boolean) {
    const { car, floors } = subject();
    const top = floors[floors.length - 1] as ServedFloor;
    const bottom = floors[0] as ServedFloor;
    const middle = floors[Math.floor(floors.length / 2)] as ServedFloor;

    car.departFor(top.id, 0);
    car.completeArrival(car.snapshot(0).motion?.arrivesAt ?? 0);
    const motion = car.departFor(bottom.id, 100);
    const at = motion.startedAt + 0.1;

    const call: DispatchCall = {
      id: 'call-1',
      floorId: middle.id,
      floorIndex: middle.index,
      direction: 'down',
      registeredAt: at,
    };
    return { snapshot: car.snapshot(at, { enRouteDiversion }), call, at };
  }

  it('is refused two reversals deep when nothing may divert it', () => {
    const { snapshot, call, at } = scene(false);
    const assessment = assessDirectionReversal(snapshot, call);

    expect(assessment.reversesToReach).toBe(true);
    expect(assessment.opposesCallDirection).toBe(true);
    expect(assessment.reversals).toBe(2);

    const profile = config.dispatcherProfilesById.get('collective');
    if (profile === undefined) throw new Error('no profile');
    const verdicts = createDispatchPolicy(profile).eligible(call, [snapshot], at);
    expect(verdicts[0]?.eligible).toBe(false);
    expect(verdicts[0]?.constraintId).toBe('noDirectionReversal');
  });

  it('costs nothing and is eligible when it may', () => {
    const { snapshot, call, at } = scene(true);
    const assessment = assessDirectionReversal(snapshot, call);

    expect(assessment.reversesToReach).toBe(false);
    expect(assessment.opposesCallDirection).toBe(false);
    expect(assessment.reversals).toBe(0);

    const profile = config.dispatcherProfilesById.get('collective');
    if (profile === undefined) throw new Error('no profile');
    const verdicts = createDispatchPolicy(profile).eligible(call, [snapshot], at);
    expect(verdicts[0]?.eligible).toBe(true);
  });

  it('is priced as a stop on the way rather than as a round trip', () => {
    // The half that made the first draft of this fix inert. Eligibility alone let the right car
    // take the call; while `projectRoute` still started the route at the destination, the ETA
    // was "fly to the lobby, turn round, come back up" and the car lost every auction it was
    // now legally allowed to enter.
    const committed = scene(true);
    const uncommitted = scene(false);

    const profile = config.dispatcherProfilesById.get('collective');
    if (profile === undefined) throw new Error('no profile');
    const withDiversion = createDispatchPolicy(profile).eligible(
      committed.call,
      [committed.snapshot],
      committed.at,
    )[0];
    const without = createDispatchPolicy(profile).eligible(
      uncommitted.call,
      [uncommitted.snapshot],
      uncommitted.at,
    )[0];

    expect(withDiversion?.estimate.etaSeconds).toBeLessThan(
      without?.estimate.etaSeconds ?? Number.POSITIVE_INFINITY,
    );
  });
});
