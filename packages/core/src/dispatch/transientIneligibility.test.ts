/**
 * Stage 5's escape hatch, and the distinction that had to be drawn inside it.
 *
 * A call is taken off its incumbent without hysteresis when that car is no longer eligible for it,
 * on the reasoning that *"holding a call on an ineligible car is how a floor starves"*. That is
 * right for a car that filled up or left service and wrong for a car refused by
 * `noDirectionReversal`, which is refused for **where it is pointing right now** — the one thing
 * about it guaranteed to change, since it is on its way somewhere and settles its direction on
 * arrival. The call moves to another car under the same constraint, which becomes ineligible in
 * its turn, and the clock restarts each time.
 *
 * These two suites are the two halves that have to hold together: the transient refusal must
 * defend its call, and the durable one must still surrender it. Getting only the first would trade
 * a thrash for a stranding.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DispatcherProfile, LoadedConfig } from '../config/types.js';
import { load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import type { ServiceMode } from '../model/types.js';
import { hallCall, makeCar, snapshotAt } from './policies/fixtures.test-helper.js';

import { WeightedCostDispatchPolicy, createDispatchPolicy, resolveDispatchConfig } from './index.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
});

/** Midtown Office down-peak — the cell the saturation was found on. */
function measure(profile: DispatcherProfile) {
  let reassigned = 0;
  let viaIneligibleIncumbent = 0;
  let heldByHysteresis = 0;
  const held = new Map<string, string>();

  class Traced extends WeightedCostDispatchPolicy {
    override dispatch(
      callId: string,
      cars: Parameters<WeightedCostDispatchPolicy['dispatch']>[1],
      at: number,
      context?: Parameters<WeightedCostDispatchPolicy['dispatch']>[3],
    ): ReturnType<WeightedCostDispatchPolicy['dispatch']> {
      const before = held.get(callId);
      const decision = super.dispatch(callId, cars, at, context);
      if (decision.outcome === 'reassigned') {
        reassigned += 1;
        // The signature of the defect: the call moved while its holder was *absent from the
        // scores*, i.e. ineligible, rather than merely beaten by a cheaper rival.
        if (before !== undefined && !decision.scores.some((score) => score.carId === before)) {
          viaIneligibleIncumbent += 1;
        }
      }
      if (decision.reason === 'below-hysteresis') heldByHysteresis += 1;
      if (decision.carIds.length > 0) held.set(callId, decision.carIds[0] as string);
      return decision;
    }
  }

  const building = config.buildingsById.get('midtown-office');
  if (building === undefined) throw new Error('no building');
  const result = runSimulation({
    building,
    dispatcherProfile: profile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 20260801,
    onTimeout: 'report',
    durationS: 900,
    demand: {
      directionalSplit: { incoming: 0, outgoing: 1, interfloor: 0 },
      arrivalRatePctPop5min: 3,
      peakWindowS: 300,
    },
    createPolicy: (candidate, options) => new Traced(resolveDispatchConfig(candidate, options)),
  });
  return { result, reassigned, viaIneligibleIncumbent, heldByHysteresis };
}

const collective = (): DispatcherProfile =>
  config.dispatcherProfilesById.get('collective') as DispatcherProfile;

describe('a direction refusal is transient, so the incumbent keeps defending its call', () => {
  it('does not saturate a bank that reassigns under noDirectionReversal', () => {
    const profile: DispatcherProfile = {
      ...collective(),
      dispatch: { ...collective().dispatch, reassignmentPolicy: 'until-commitment' },
    };
    const { result, reassigned, viaIneligibleIncumbent, heldByHysteresis } = measure(profile);

    // The measured failure was AWT 332.2 s against a 32.3 s control, saturation flagged, and a
    // longest wait of 876 s. Bounded generously against the control rather than pinned, because
    // the claim is "this configuration is usable", not "it is worth this many seconds".
    expect(result.summary.saturation.saturated).toBe(false);
    expect(result.summary.waiting.meanS ?? Number.POSITIVE_INFINITY).toBeLessThan(60);
    expect(result.summary.waiting.maxS ?? Number.POSITIVE_INFINITY).toBeLessThan(200);

    // The mechanism, not just the symptom: no call may be taken from a holder that was merely
    // pointing the wrong way, and hysteresis must actually be doing work.
    expect(viaIneligibleIncumbent).toBe(0);
    expect(heldByHysteresis).toBeGreaterThan(reassigned);
  });

  it('leaves a profile without the constraint exactly as it was', () => {
    // The control for the control. `eta` is `collective`'s weight vector without the hard
    // constraint, so if the change touched anything beyond direction refusals it would show here.
    const eta = config.dispatcherProfilesById.get('eta') as DispatcherProfile;
    const { viaIneligibleIncumbent, result } = measure({
      ...eta,
      dispatch: { ...eta.dispatch, reassignmentPolicy: 'until-commitment' },
    });
    expect(viaIneligibleIncumbent).toBe(0);
    expect(result.summary.saturation.saturated).toBe(false);
  });
});

describe('a durable refusal still surrenders the call, which is the half that must not break', () => {
  /**
   * Driven at the policy rather than through a run, because the two halves differ by *one field on
   * one snapshot* and a simulation would have to be steered into the state instead of placed in it.
   * Same call, same two cars, same instant; only the incumbent's reason for being ineligible moves.
   */
  function decideWithIncumbent(mode: ServiceMode, at: number) {
    const policy = createDispatchPolicy({
      ...(config.dispatcherProfilesById.get('collective') as DispatcherProfile),
      dispatch: {
        ...(config.dispatcherProfilesById.get('collective') as DispatcherProfile).dispatch,
        reassignmentPolicy: 'until-commitment',
      },
    });

    // A down call at 10, and two cars that could take it.
    const subject = hallCall('10', 'down', 0);
    policy.register(subject, 0);

    // Round one: both standing and idle *away from the call floor*, so both are eligible and
    // neither latches `committedAt` — `on-deceleration` treats a car standing at the call's own
    // floor as committed, which would end the test before stage 5 ever ran.
    const first = policy.dispatch(subject.id, [snapshotAt('A', '8', 0), snapshotAt('B', '6', 0)], 0);
    const incumbentId = first.carIds[0];
    expect(incumbentId).toBeDefined();

    // Round two: the incumbent is ineligible. `out-of-service` is durable — it cannot take a hall
    // call however it moves. The rival is idle and eligible.
    const incumbent = makeCar(incumbentId as string, '8');
    incumbent.setMode(mode);
    const rivalId = incumbentId === 'A' ? 'B' : 'A';
    return {
      incumbentId: incumbentId as string,
      decision: policy.dispatch(
        subject.id,
        [incumbent.snapshot(at), snapshotAt(rivalId, '6', at)],
        at,
      ),
    };
  }

  it('moves the call off a car that has left service', () => {
    const { incumbentId, decision } = decideWithIncumbent('out-of-service', 30);
    expect(decision.outcome).toBe('reassigned');
    expect(decision.carIds).not.toContain(incumbentId);
    // And for the right reason: the withdrawn car is refused, not merely outbid.
    expect(decision.rejected.find((v) => v.carId === incumbentId)?.reason).toBe('serviceMode');
  });

  it('keeps it on a car that is only pointing the wrong way', () => {
    // The contrast. Same shape, transient reason, opposite outcome — this is the whole change,
    // and asserting only the first test would have passed before it was made.
    const policy = createDispatchPolicy({
      ...(config.dispatcherProfilesById.get('collective') as DispatcherProfile),
      dispatch: {
        ...(config.dispatcherProfilesById.get('collective') as DispatcherProfile).dispatch,
        reassignmentPolicy: 'until-commitment',
      },
    });
    const subject = hallCall('10', 'down', 0);
    policy.register(subject, 0);
    const first = policy.dispatch(subject.id, [snapshotAt('A', '8', 0), snapshotAt('B', '6', 0)], 0);
    const incumbentId = first.carIds[0] as string;

    // Send the incumbent upward past the call floor: `noDirectionReversal` now refuses it.
    const moving = makeCar(incumbentId, '2');
    moving.departFor('20', 1);
    const at = 3;
    const rivalId = incumbentId === 'A' ? 'B' : 'A';
    const decision = policy.dispatch(
      subject.id,
      [moving.snapshot(at), snapshotAt(rivalId, '11', at)],
      at,
    );

    expect(
      decision.rejected.find((v) => v.carId === incumbentId)?.constraintId,
      'the incumbent must actually be refused by the constraint, or this asserts nothing',
    ).toBe('noDirectionReversal');
    expect(decision.outcome).toBe('retained');
    expect(decision.reason).toBe('below-hysteresis');
    expect(decision.carIds).toContain(incumbentId);
  });
});
