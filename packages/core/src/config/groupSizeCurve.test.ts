/**
 * **An authored group-size curve is validated where it is written, not where it is drawn.**
 * docs/14 § 2.2, the `data/traffic-profiles.json` half.
 *
 * `traffic/poissonBatch.ts` owns the samplers and refuses a curve it cannot draw from. That is the
 * last line, not the first: by the time `drawBatchSize` sees a bad curve the plan has been built,
 * the rates have been computed from a mean, and the failure is a thousand batches into a trace.
 * Everything here fails at `parseTrafficProfiles` instead, which is where an author finds out.
 *
 * ## The one refinement that is not a shape check
 *
 * `mean` is required for every family, `explicit` included, and is **cross-checked against the
 * weights** rather than trusted. The reason is the rate coupling docs/14 § 2.2 names as the trap:
 * `batchesPerSecond = passengerRate / meanBatchSize`, so a mean that drifted from its own vector
 * would leave every group exactly as authored and quietly change how many people the building
 * generates. The sampler derives the mean; the schema refuses to let a second, stale copy of it
 * exist beside the vector.
 *
 * It is carried at all — rather than omitted and derived at load — because `mean` is on the
 * published surface: `elevator-sim list` prints it and the viewer's traffic panel reads it, and a
 * `number | undefined` there would be a display bug in three places to save a line of JSON.
 *
 * ## What the shipped data does, and why
 *
 * Nothing. Every shipped profile stays `geometric`, unchanged, because criterion 1 of docs/14 § 5
 * is the blocking one: moving a shipped curve re-derives 981 pinned estimates and both identity
 * digests. The authoring surface is proved here on profiles this file builds, which is the honest
 * separation — the schema can accept a hotel that arrives in fours without this repository having
 * to ship one.
 */

import { describe, expect, it } from 'vitest';

import { parseTrafficProfiles } from './parse.js';
import type { TrafficProfiles } from './types.js';

/** A minimal but complete traffic-profiles document, with one profile's curve replaceable. */
const documentWith = (batchSize: unknown): unknown => ({
  version: 1,
  arrivalProcess: { type: 'poisson-batch' },
  profiles: [
    {
      id: 'conference-hotel',
      name: 'Conference hotel',
      blurb: 'Delegates leave a session together, so the lobby fills in fours rather than in ones.',
      governingPeak: 'down-peak',
      arrivalRatePctPop5min: { min: 6, max: 14, typical: 10 },
      targetIntervalS: 40,
      targetAvgWaitS: 30,
      batchSize,
      directionalSplit: { incoming: 0.2, outgoing: 0.7, interfloor: 0.1 },
    },
  ],
  demandTemplates: [
    { id: 'rise-and-fall', name: 'Rise and fall', recommended: true, durationMin: 30 },
  ],
  passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 15, minKg: 20 },
});

const parse = (batchSize: unknown): TrafficProfiles =>
  parseTrafficProfiles(documentWith(batchSize), 'groupSizeCurve.test.ts');

describe('an authored group-size curve', () => {
  it('accepts the geometric curve every shipped profile declares', () => {
    const profiles = parse({ distribution: 'geometric', mean: 1.4 });
    expect(profiles.profiles[0]?.batchSize.mean).toBe(1.4);
    expect(profiles.profiles[0]?.batchSize.weights).toBeUndefined();
  });

  it('accepts a hotel that arrives in fours', () => {
    // The case § 2.2 says no mean can express: every group is exactly four, and the mean the rate
    // divides by is 4 rather than the 1.4 an office would use at the same passenger rate.
    const profiles = parse({ distribution: 'explicit', weights: [0, 0, 0, 1], mean: 4 });
    expect(profiles.profiles[0]?.batchSize.weights).toEqual([0, 0, 0, 1]);
    expect(profiles.profiles[0]?.batchSize.mean).toBe(4);
  });

  it('accepts a mixed vector whose mean is the one its weights imply', () => {
    expect(parse({ distribution: 'explicit', weights: [3, 1], mean: 1.25 }).profiles[0]?.batchSize.mean)
      .toBe(1.25);
    // Weights are relative, so the same curve at a different scale carries the same mean.
    expect(parse({ distribution: 'explicit', weights: [30, 10], mean: 1.25 }).profiles[0]?.batchSize.weights)
      .toEqual([30, 10]);
  });

  it('refuses a mean that has drifted from its own weights, and says which number is right', () => {
    // The stale-copy failure this refinement exists for. Every group is still authored as a four;
    // only the number the batch rate divides by moved, so the building would generate 3.2x the
    // demand it says it does with nothing in the trace looking wrong.
    expect(() => parse({ distribution: 'explicit', weights: [0, 0, 0, 1], mean: 1.25 })).toThrow(
      /mean must equal the mean these weights imply, 4/,
    );
  });

  it('refuses an explicit curve with no weights, and weights on a family that ignores them', () => {
    expect(() => parse({ distribution: 'explicit', mean: 2 })).toThrow(/needs a weights vector/);
    expect(() => parse({ distribution: 'geometric', mean: 2, weights: [1, 1] })).toThrow(
      /read only by the explicit distribution/,
    );
  });

  it('refuses a vector nobody could arrive in', () => {
    expect(() => parse({ distribution: 'explicit', weights: [], mean: 1 })).toThrow(
      /at least one group size/,
    );
    expect(() => parse({ distribution: 'explicit', weights: [0, 0], mean: 1 })).toThrow(
      /positive weight/,
    );
    expect(() => parse({ distribution: 'explicit', weights: [1, -1], mean: 1 })).toThrow();
  });

  it('leaves an unknown family to the sampler, which names it', () => {
    // Deliberately *not* an enum here: `drawBatchSize` refuses an unknown name and lists what it
    // supports, which is a better error than a schema path, and tightening this would move the
    // failure earlier at the cost of making it less legible.
    expect(parse({ distribution: 'weibull', mean: 2 }).profiles[0]?.batchSize.distribution).toBe(
      'weibull',
    );
  });
});
