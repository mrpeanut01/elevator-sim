import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { StreamSet, loadConfig, runSimulation } from '@elevator-sim/core';
import type { DispatcherProfile, LoadedConfig, ResolvedBuilding } from '@elevator-sim/core';

import {
  activeParameters,
  candidateFromProfile,
  defaultCandidate,
  isActive,
  readerFor,
  searchSpace,
  subspace,
} from './collect.js';
import { buildingFeasibility, candidatesEqual, toVector } from './encode.js';
import {
  candidateSampler,
  materializer,
  perturbCandidate,
  perturbValue,
  policyNoiseStream,
  sampleCandidate,
  sampleCandidates,
  sampleValue,
  vectorSpace,
} from './sample.js';
import { SearchSpaceError } from './types.js';
import type { Candidate, NumericParameter, SearchParameter } from './types.js';

const SPACE = searchSpace();

/** The Phase 3 and Phase 5 gates' master seed, reused so a failure here is reproducible there. */
const SEED = 20_260_726;

/** One draw, sampled without the feasibility check where the check is not what is under test. */
const draw = (seed = SEED, count = 200): readonly Candidate[] =>
  sampleCandidates(SPACE, policyNoiseStream(seed), count, { validate: false });

/** The repository's real `data/` directory, the same one the Phase 3 and Phase 5 gates use. */
const DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));

let CONFIG: LoadedConfig;

beforeAll(async () => {
  CONFIG = await loadConfig(DATA_DIR);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- *
 * The stream
 * -------------------------------------------------------------------------- */

describe('every draw comes from an injected stream', () => {
  it('never reaches for the global generator', () => {
    // CLAUDE.md invariant 2, asserted rather than reviewed. A single `Math.random()` anywhere in
    // the sampler would make a tuning run unreplayable and — worse, because it is silent —
    // would desynchronize the common random numbers the whole comparison rests on.
    const global = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random() is forbidden: draw from the injected StreamSet.');
    });
    const rng = policyNoiseStream(SEED);
    const candidate = sampleCandidate(SPACE, rng);
    perturbCandidate(SPACE, candidate, rng);
    expect(global).not.toHaveBeenCalled();
  });

  it('is the policyNoise stream, not one the passenger trace uses', () => {
    // `policyNoise` is the stream `StreamSet` names for stochastic dispatcher exploration. Using
    // `arrivals` instead would advance the trace stream by a candidate-dependent amount, and two
    // candidates would stop seeing the same passengers — which is 324× of variance reduction
    // thrown away, with nothing visible but a comparison that needs more replications.
    const streams = new StreamSet(SEED);
    const fromSet = sampleCandidate(SPACE, streams.policyNoise, { validate: false });
    const fromHelper = sampleCandidate(SPACE, policyNoiseStream(SEED), { validate: false });
    expect(candidatesEqual(fromSet, fromHelper)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Determinism
 * -------------------------------------------------------------------------- */

describe('the same seed draws the same candidates', () => {
  it('reproduces a whole sequence', () => {
    const first = draw(SEED, 50);
    const second = draw(SEED, 50);
    expect(first).toHaveLength(50);
    for (let index = 0; index < first.length; index += 1) {
      expect(
        candidatesEqual(first[index] as Candidate, second[index] as Candidate),
        `candidate ${index}`,
      ).toBe(true);
    }
  });

  it('draws differently from a different seed', () => {
    const first = draw(SEED, 20);
    const other = draw(SEED + 1, 20);
    const same = first.filter((candidate, index) =>
      candidatesEqual(candidate, other[index] as Candidate),
    );
    expect(same).toHaveLength(0);
  });

  it('enumerates a candidate in the space’s own order', () => {
    for (const candidate of draw(SEED, 20)) {
      const order = SPACE.ids.filter((id) => candidate.has(id));
      expect([...candidate.keys()]).toStrictEqual(order);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Type, range and scale
 * -------------------------------------------------------------------------- */

describe('a draw respects the declared type, range and scale', () => {
  it('stays inside every declared bound, for every kind', () => {
    for (const candidate of draw(SEED, 300)) {
      for (const [id, value] of candidate) {
        const parameter = SPACE.byId.get(id) as SearchParameter;
        switch (parameter.type) {
          case 'continuous':
            expect(typeof value, id).toBe('number');
            expect(value as number, id).toBeGreaterThanOrEqual(parameter.min);
            expect(value as number, id).toBeLessThanOrEqual(parameter.max);
            break;
          case 'integer':
            expect(Number.isInteger(value), id).toBe(true);
            expect(value as number, id).toBeGreaterThanOrEqual(parameter.min);
            expect(value as number, id).toBeLessThanOrEqual(parameter.max);
            break;
          case 'categorical':
            expect(parameter.values, id).toContain(value);
            break;
          case 'boolean':
            expect(typeof value, id).toBe('boolean');
            break;
        }
      }
    }
  });

  it('draws a log dimension log-uniformly, not linearly', () => {
    // `idle.predictorCycleS` runs 600 s to 86 400 s. Under a linear draw 99.3 % of the mass sits
    // above ten minutes and the bottom two orders of magnitude are never explored; under a
    // log-uniform one the median is the geometric mean, about 7 200 s.
    const cycle = SPACE.byId.get('idle.predictorCycleS') as NumericParameter;
    expect(cycle.scale).toBe('log');
    const rng = policyNoiseStream(SEED);
    const drawn = Array.from({ length: 2000 }, () => sampleValue(cycle, rng) as number).sort(
      (a, b) => a - b,
    );
    const median = drawn[Math.floor(drawn.length / 2)] as number;
    const geometric = Math.sqrt(cycle.min * cycle.max);
    expect(median / geometric).toBeGreaterThan(0.9);
    expect(median / geometric).toBeLessThan(1.1);
    // And the linear midpoint is nowhere near it, which is the whole point of the scale.
    expect(median).toBeLessThan((cycle.min + cycle.max) / 4);
    expect(drawn[0] as number).toBeGreaterThanOrEqual(cycle.min);
    expect(drawn.at(-1) as number).toBeLessThanOrEqual(cycle.max);
  });

  it('reaches both ends of an integer dimension', () => {
    const rounds = SPACE.byId.get('auction.rounds') as NumericParameter;
    const rng = policyNoiseStream(SEED);
    const drawn = new Set(Array.from({ length: 400 }, () => sampleValue(rounds, rng) as number));
    expect(drawn.has(rounds.min)).toBe(true);
    expect(drawn.has(rounds.max)).toBe(true);
    expect([...drawn].every((value) => Number.isInteger(value))).toBe(true);
  });

  it('reaches every value of a categorical dimension', () => {
    const strategy = SPACE.byId.get('idle.parkingStrategy') as SearchParameter;
    if (strategy.type !== 'categorical') throw new Error('idle.parkingStrategy is categorical');
    const rng = policyNoiseStream(SEED);
    const drawn = new Set(Array.from({ length: 200 }, () => sampleValue(strategy, rng)));
    expect([...drawn].sort()).toStrictEqual([...strategy.values].sort());
  });
});

/* -------------------------------------------------------------------------- *
 * activeWhen gating
 * -------------------------------------------------------------------------- */

describe('a candidate carries exactly the dimensions that are live', () => {
  it('omits every gated dimension whose gate the draw did not satisfy', () => {
    // The budget argument, and it is not small: at 50–200 replications an evaluation, a search
    // that tuned `auction.rounds` under `central-argmin` would spend a whole arm proving that a
    // knob nothing reads does nothing — and against a piecewise-constant objective it would get
    // exactly-zero differences and might well believe them.
    let gatedOut = 0;
    for (const candidate of draw(SEED, 300)) {
      const read = readerFor(SPACE, candidate);
      for (const parameter of SPACE.parameters) {
        const live = isActive(parameter, read);
        expect(candidate.has(parameter.id), `${parameter.id} live=${String(live)}`).toBe(live);
        if (!live) gatedOut += 1;
      }
    }
    // Sanity: gating actually happened. A sampler that ignored `activeWhen` would pass the loop
    // above only if every dimension were always live.
    expect(gatedOut).toBeGreaterThan(300);
  });

  it('activates the auction reserve only on both halves of its gate', () => {
    let seenBoth = false;
    let seenOneRound = false;
    for (const candidate of draw(SEED, 400)) {
      const aggregation = candidate.get('auction.aggregation');
      const rounds = candidate.get('auction.rounds');
      const reserve = candidate.has('auction.reserveMarginalDelayS');
      if (aggregation !== 'contract-net') {
        expect(reserve).toBe(false);
        expect(candidate.has('auction.rounds')).toBe(false);
        continue;
      }
      expect(reserve).toBe((rounds as number) >= 2);
      if (reserve) seenBoth = true;
      if (rounds === 1) seenOneRound = true;
    }
    expect(seenBoth, 'no draw activated the reserve').toBe(true);
    expect(seenOneRound, 'no draw hit the single-round case the reserve is inert under').toBe(true);
  });

  it('honours a base for gates outside a narrowed space', () => {
    // The pre-positioning search: tune the deadband and the energy weight, leave the parking
    // strategy where the incumbent profile put it. The gate is then outside the space being
    // drawn from, and it has to be read off the base — or both dimensions deactivate and the
    // search silently becomes a search over nothing.
    const deadband = subspace(SPACE, ['idle.repositionThresholdS', 'idle.repositionEnergyWeight']);
    const rng = policyNoiseStream(SEED);

    const parked = sampleCandidate(deadband, rng, {
      base: new Map([['idle.parkingStrategy', 'stay']]),
      validate: false,
    });
    expect([...parked.keys()]).toStrictEqual([]);

    const moving = sampleCandidate(deadband, rng, {
      base: new Map([['idle.parkingStrategy', 'predicted-demand']]),
      validate: false,
    });
    expect(moving.has('idle.repositionThresholdS')).toBe(true);
    expect(moving.has('idle.repositionEnergyWeight')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * Feasibility
 * -------------------------------------------------------------------------- */

describe('a validated draw is one core will build', () => {
  it('never returns an infeasible candidate', () => {
    const rng = policyNoiseStream(SEED);
    for (let index = 0; index < 120; index += 1) {
      const candidate = sampleCandidate(SPACE, rng);
      expect(SPACE.validate(candidate), `candidate ${index}`).toBeUndefined();
    }
  });

  it('rejects rather than repairs, so the draw stays uniform on the feasible set', () => {
    // Rejection sampling means the infeasible combination simply never appears; a repair would
    // pile probability mass onto whatever it repaired *to*, and the search would inherit an
    // opinion nobody wrote down.
    const rng = policyNoiseStream(SEED);
    let deferred = 0;
    for (let index = 0; index < 200; index += 1) {
      const candidate = sampleCandidate(SPACE, rng);
      const both =
        candidate.get('dispatch.callType') === 'destination-entry' &&
        candidate.get('dispatch.assignmentTiming') === 'deferred';
      expect(both).toBe(false);
      if (candidate.get('dispatch.assignmentTiming') === 'deferred') deferred += 1;
    }
    // Deferral is still reachable — the rejection removes one combination, not one value.
    expect(deferred).toBeGreaterThan(20);
  });

  it('respects an extra feasibility oracle the caller supplies', () => {
    const rng = policyNoiseStream(SEED);
    const feasible = (values: Candidate): string | undefined =>
      values.get('idle.parkingStrategy') === 'stay' ? undefined : 'only parking is allowed to stay';
    for (let index = 0; index < 40; index += 1) {
      expect(sampleCandidate(SPACE, rng, { feasible }).get('idle.parkingStrategy')).toBe('stay');
    }
  });

  it('gives up with the reason rather than looping forever', () => {
    const rng = policyNoiseStream(SEED);
    expect(() =>
      sampleCandidate(SPACE, rng, { feasible: () => 'nothing here is ever acceptable' }),
    ).toThrow(/no feasible candidate in 64 draws.*nothing here is ever acceptable/s);
    expect(() => sampleCandidate(SPACE, rng, { maxAttempts: 0 })).toThrow(SearchSpaceError);
    expect(() => sampleCandidates(SPACE, rng, -1)).toThrow(SearchSpaceError);
  });
});

/* -------------------------------------------------------------------------- *
 * Neighbourhoods, and the plateau
 * -------------------------------------------------------------------------- */

describe('a neighbour is a different point, by a step above the plateau width', () => {
  it('never returns its own parent', () => {
    // Phase 3 measured the objective as piecewise constant: a step at or below 0.03 on
    // `distanceTravelled` produced 100/100 exactly-zero paired differences at `rho = 1`, a
    // bit-identical run. A neighbour that *is* its parent is the same reading with none of the
    // measurement, and a search reading it as "no improvement in that direction" stalls.
    const rng = policyNoiseStream(SEED);
    let parent = sampleCandidate(SPACE, rng);
    for (let index = 0; index < 60; index += 1) {
      const child = perturbCandidate(SPACE, parent, rng);
      expect(candidatesEqual(child, parent), `neighbour ${index}`).toBe(false);
      expect(SPACE.validate(child), `neighbour ${index}`).toBeUndefined();
      parent = child;
    }
  });

  it('steps a weight well clear of the measured 0.03 decision-flip threshold', () => {
    // The default step is 0.15 of the declared range. `weights.*` is `[0, 5]`, so one standard
    // deviation is 0.75 — 25× the measured plateau. Asserted as a median rather than a minimum,
    // because a Gaussian step is sometimes small and the guarantee is distributional.
    const weight = SPACE.byId.get('weights.distanceTravelled') as NumericParameter;
    const rng = policyNoiseStream(SEED);
    const steps = Array.from({ length: 2000 }, () =>
      Math.abs((perturbValue(weight, 2.5, rng, 0.15) as number) - 2.5),
    ).sort((a, b) => a - b);
    const median = steps[Math.floor(steps.length / 2)] as number;
    expect(median).toBeGreaterThan(0.03 * 10);
    // And landing *inside* the plateau — where the run comes back bit-identical and the search
    // learns nothing — must be rare rather than merely uncommon.
    expect(steps.filter((step) => step <= 0.03).length / steps.length).toBeLessThan(0.05);
  });

  it('states the same step arithmetic on an integer and on a log dimension', () => {
    // The 25× above is one dimension family, and the docstring used to generalize from it. Two
    // more kinds, measured beside it, so the reader can see what "0.15 of the declared range"
    // means where the range is not `[0, 5]` and the geometry is not linear.
    const rng = policyNoiseStream(SEED);

    // **Integer.** `auction.rounds` spans `[1, 8]`, so 0.15 of its range is a sigma of 1.05 —
    // about one whole unit. Measured from the midpoint: **84.5 %** of neighbours move by exactly
    // 1, the largest move is 3, and none is 0. There is no finer step available on an integer
    // dimension and none is wanted; the unit *is* the floor, and "shrink the step to refine" has
    // no meaning here at all.
    const rounds = SPACE.byId.get('auction.rounds') as NumericParameter;
    expect(rounds.type).toBe('integer');
    expect([rounds.min, rounds.max]).toStrictEqual([1, 8]);
    expect(0.15 * (rounds.max - rounds.min)).toBeCloseTo(1.05, 10);
    const from = Math.round((rounds.min + rounds.max) / 2);
    const integerSteps = Array.from(
      { length: 2000 },
      () => Math.abs((perturbValue(rounds, from, rng, 0.15) as number) - from),
    );
    expect(integerSteps.every((step) => step >= 1)).toBe(true);
    expect(Math.max(...integerSteps)).toBeLessThanOrEqual(4);
    const adjacent = integerSteps.filter((step) => step === 1).length / integerSteps.length;
    expect(adjacent).toBeGreaterThan(0.75);
    expect(adjacent).toBeLessThan(0.92);

    // **Log.** The step is 0.15 of the *log* range, so it is a **ratio** step: sigma is
    // `0.15 × ln(86400/600) = 0.745`, and the median absolute move is `0.6745 × sigma = 0.503`
    // in log space — a factor of about 1.65 either way. Read as a fraction of the linear range
    // it would be meaningless; the whole reason the scale is declared is that it is not one.
    const cycle = SPACE.byId.get('idle.predictorCycleS') as NumericParameter;
    expect(cycle.scale).toBe('log');
    const parent = Math.sqrt(cycle.min * cycle.max);
    const ratios = Array.from({ length: 2000 }, () =>
      Math.abs(Math.log((perturbValue(cycle, parent, rng, 0.15) as number) / parent)),
    ).sort((a, b) => a - b);
    const medianRatio = Math.exp(ratios[Math.floor(ratios.length / 2)] as number);
    expect(medianRatio).toBeGreaterThan(1.4);
    expect(medianRatio).toBeLessThan(1.9);

    // **And the known-answer dimension, where the arithmetic does not save it.**
    // `idle.repositionThresholdS` is `[0, 60]`, so sigma is 9 s — against a measured objective
    // plateau of roughly `[4, 60]`, some 56 s wide. That is a step **six times smaller** than the
    // flat region, not 25 times larger than it. The next test runs the simulator and shows what
    // that costs.
    const deadband = SPACE.byId.get('idle.repositionThresholdS') as NumericParameter;
    expect([deadband.min, deadband.max]).toStrictEqual([0, 60]);
    const sigma = 0.15 * (deadband.max - deadband.min);
    expect(sigma).toBe(9);
    expect(sigma / (deadband.max - 4)).toBeLessThan(0.2);
  });

  it('guarantees a distinct point and not a distinct reading, on the known-answer dimension', () => {
    // The claim this module may make, and the claim it may not, separated by a measurement.
    //
    // Garden Apartments, `predictive-balanced`, seed 4242, 1800 s, comparing
    // `summary.waiting.meanS` with `===`. Twelve default-step neighbours of the shipped 8 s
    // deadband: every one of them is a **different point** — that is `candidatesEqual`, and it is
    // what `perturbCandidate` promises — and a majority come back as a **bit-identical run**,
    // which it does not promise and could not without running the simulator. The objective is a
    // step function on this dimension; only neighbours below about 4 s move it at all.
    //
    // At 50–200 replications an evaluation, that is most of a round spent learning nothing, and
    // it is `tuning/search/plateau.ts`'s `isFlat` that can see it happening.
    const garden = CONFIG.buildingsById.get('garden-apartments') as ResolvedBuilding;
    const profile = CONFIG.dispatcherProfilesById.get('predictive-balanced') as DispatcherProfile;
    const incumbent = candidateFromProfile(SPACE, profile);
    const deadband = subspace(SPACE, ['idle.repositionThresholdS']);
    const materialize = materializer(deadband, profile);

    const awt = (candidate: Candidate, id: string): number =>
      runSimulation({
        building: garden,
        dispatcherProfile: materialize(candidate, id),
        trafficProfiles: CONFIG.trafficProfiles,
        elevatorSpecs: CONFIG.elevatorSpecs,
        seed: 4242,
        durationS: 1800,
      }).summary.waiting.meanS;

    // The incumbent's own 8 s, which is left as shipped so Phase 7 has a ground truth.
    const parent: Candidate = new Map([['idle.repositionThresholdS', 8]]);
    expect(incumbent.get('idle.repositionThresholdS')).toBe(8);
    const parentAwt = awt(parent, 'parent');

    const rng = policyNoiseStream(4242);
    let identical = 0;
    let moved = 0;
    for (let index = 0; index < 12; index += 1) {
      const child = perturbCandidate(deadband, parent, rng, { base: incumbent });
      // The guarantee: a different point, every time.
      expect(candidatesEqual(child, parent), `neighbour ${index}`).toBe(false);
      const value = child.get('idle.repositionThresholdS') as number;
      expect(value, `neighbour ${index}`).not.toBe(8);
      // The non-guarantee: often the same reading.
      if (awt(child, `child-${index}`) === parentAwt) identical += 1;
      else moved += 1;
    }
    expect(identical + moved).toBe(12);
    // A majority land on the plateau — the point of the test, and the reason the module docstring
    // may not claim a step "25× clear" of it in general.
    expect(identical, 'no default-step neighbour was bit-identical').toBeGreaterThanOrEqual(6);
    // And the dimension is not simply inert: some neighbours do move the objective, so a search
    // over it is worth running. If this ever reads 0, the plateau claim is understated, not
    // overstated, and the docstring must be re-measured either way.
    expect(moved, 'the dimension read as completely inert').toBeGreaterThan(0);
  }, 120_000);

  it('refuses a step of zero, which is a neighbourhood of one point', () => {
    const rng = policyNoiseStream(SEED);
    const parent = sampleCandidate(SPACE, rng);
    expect(() => perturbCandidate(SPACE, parent, rng, { step: 0 })).toThrow(
      /piecewise constant|finite positive/,
    );
  });

  it('never returns an integer neighbour equal to its parent', () => {
    // Rounding a small step to zero is the plateau in miniature: the "neighbour" is the point.
    const rounds = SPACE.byId.get('auction.rounds') as NumericParameter;
    const rng = policyNoiseStream(SEED);
    for (let index = 0; index < 500; index += 1) {
      for (const parent of [rounds.min, 4, rounds.max]) {
        const moved = perturbValue(rounds, parent, rng, 0.15) as number;
        expect(moved, `from ${parent}`).not.toBe(parent);
        expect(moved).toBeGreaterThanOrEqual(rounds.min);
        expect(moved).toBeLessThanOrEqual(rounds.max);
        expect(Number.isInteger(moved)).toBe(true);
      }
    }
  });

  it('reflects at a bound instead of clamping to it', () => {
    // Clamping piles probability onto the endpoints, and the low endpoint of a weight range is
    // `0` — which removes the term from the sum entirely. A neighbourhood that quietly favours
    // "term off" is a neighbourhood with an opinion.
    const weight = SPACE.byId.get('weights.waitTime') as NumericParameter;
    const rng = policyNoiseStream(SEED);
    const atZero = Array.from({ length: 2000 }, () => perturbValue(weight, 0, rng, 0.15) as number);
    expect(atZero.every((value) => value >= weight.min && value <= weight.max)).toBe(true);
    expect(atZero.filter((value) => value === 0)).toHaveLength(0);
  });

  it('acquires and drops dimensions as the move changes a gate', () => {
    const rng = policyNoiseStream(SEED);
    const parked = new Map(defaultCandidate(SPACE));
    expect(parked.has('idle.repositionThresholdS')).toBe(false);

    // Force the gate across, and the two knobs it gates must arrive with it — drawn fresh, since
    // the parent never held them. Carrying a stale value into the profile would let the resolver
    // read a knob the search believes is off.
    let sawAcquired = false;
    let sawDropped = false;
    let point: Candidate = parked;
    for (let index = 0; index < 200 && !(sawAcquired && sawDropped); index += 1) {
      point = perturbCandidate(SPACE, point, rng, { validate: false });
      const moving = point.get('idle.parkingStrategy') !== 'stay';
      expect(point.has('idle.repositionThresholdS')).toBe(moving);
      expect(point.has('idle.repositionEnergyWeight')).toBe(moving);
      if (moving) sawAcquired = true;
      else sawDropped = true;
    }
    expect(sawAcquired && sawDropped).toBe(true);
  });

  it('perturbs a subset when asked, and honours a base', () => {
    const rng = policyNoiseStream(SEED);
    const parent = sampleCandidate(SPACE, rng, { validate: false });
    const child = perturbCandidate(SPACE, parent, rng, { probability: 0.1, validate: false });
    const moved = [...child].filter(([id, value]) => !Object.is(parent.get(id), value));
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(parent.size);

    const idle = subspace(SPACE, (parameter) => parameter.section === 'idle');
    const base: Candidate = new Map([['idle.parkingStrategy', 'lobby']]);
    const narrowedParent = sampleCandidate(idle, rng, { base, validate: false });
    const narrowedChild = perturbCandidate(idle, narrowedParent, rng, { base, validate: false });
    expect([...narrowedChild.keys()].every((id) => idle.byId.has(id))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The ports tuning/search draws through
 * -------------------------------------------------------------------------- */

describe('the space satisfies the ports a search declares', () => {
  it('samples through a one-method port', () => {
    const port = candidateSampler(SPACE, { validate: false });
    expect(candidatesEqual(port.sample(policyNoiseStream(SEED)), draw(SEED, 1)[0] as Candidate))
      .toBe(true);
  });

  it('embeds every dimension in a real box, in gate order', () => {
    const port = vectorSpace(SPACE, { validate: false });
    expect(port.dimensions.map((dimension) => dimension.id)).toStrictEqual([...SPACE.ids]);
    for (const dimension of port.dimensions) {
      const [low, high] = dimension.range;
      expect(Number.isFinite(low), dimension.id).toBe(true);
      expect(high, dimension.id).toBeGreaterThan(low);
    }
    // A log dimension is embedded in log coordinates, so a Gaussian step is a ratio step.
    const cycle = port.dimensions.find((dimension) => dimension.id === 'idle.predictorCycleS');
    expect(cycle?.range).toStrictEqual([Math.log(600), Math.log(86_400)]);
    // A categorical is relaxed to `[0, n)`; a boolean to `[0, 2)`.
    expect(
      port.dimensions.find((dimension) => dimension.id === 'idle.parkingStrategy')?.range,
    ).toStrictEqual([0, 4]);
    expect(
      port.dimensions.find((dimension) => dimension.id === 'constraints.noDirectionReversal')?.range,
    ).toStrictEqual([0, 2]);
  });

  it('projects: encode∘decode is idempotent, and every decode is a live candidate', () => {
    // `cmaes.ts` re-encodes what it decoded so its distribution tracks what was *evaluated*. That
    // is only meaningful if a second round trip moves nothing — rounding an integer, flooring a
    // categorical and dropping a gated dimension each move a coordinate once and never twice.
    const port = vectorSpace(SPACE, { validate: false });
    const rng = policyNoiseStream(SEED);
    for (let index = 0; index < 200; index += 1) {
      const proposal = port.dimensions.map((dimension) => {
        const [low, high] = dimension.range;
        // Deliberately outside the box a fifth of the time: a continuous optimizer proposes
        // outside its bounds routinely, and a throw is a score it cannot interpret.
        const span = high - low;
        return low - 0.2 * span + rng.nextFloat() * 1.4 * span;
      });
      const once = port.decode(proposal);
      const twice = port.decode(port.encode(once));
      expect(candidatesEqual(twice, once), `proposal ${index}`).toBe(true);
      for (const [id, value] of once) {
        const parameter = SPACE.byId.get(id) as SearchParameter;
        if (parameter.type === 'continuous' || parameter.type === 'integer') {
          expect(value as number, id).toBeGreaterThanOrEqual(parameter.min);
          expect(value as number, id).toBeLessThanOrEqual(parameter.max);
        }
        if (parameter.type === 'categorical') expect(parameter.values).toContain(value);
      }
      // And gating survived the embedding: the decoded point carries exactly what is live.
      const read = readerFor(SPACE, once);
      for (const parameter of SPACE.parameters) {
        expect(once.has(parameter.id), parameter.id).toBe(isActive(parameter, read));
      }
    }
  });

  it('round-trips a sampled candidate through the vector and back', () => {
    const port = vectorSpace(SPACE, { validate: false });
    for (const candidate of draw(SEED, 100)) {
      const back = port.decode(port.encode(candidate));
      for (const [id, value] of candidate) {
        const parameter = SPACE.byId.get(id) as SearchParameter;
        if (parameter.type === 'continuous') {
          // Log dimensions go through `exp(log(x))`, which is not always bit-exact.
          expect(back.get(id) as number, id).toBeCloseTo(value as number, 9);
        } else {
          expect(back.get(id), id).toStrictEqual(value);
        }
      }
      expect([...back.keys()]).toStrictEqual([...candidate.keys()]);
    }
  });

  it('refuses a point of the wrong length rather than padding it', () => {
    expect(() => vectorSpace(SPACE).decode([1, 2, 3])).toThrow(SearchSpaceError);
  });

  it('reports why a decoded point is not runnable, rather than returning it unmarked', () => {
    // `decode` cannot throw — an exception is a score CMA-ES cannot interpret — so the box's
    // infeasible corners come back looking exactly like runnable points. Before `reasonFor`,
    // `vectorSpace` accepted the whole of `SampleOptions`, `feasible` included, and threaded it
    // only into `sample`; a caller who wired a building oracle into the port got it silently
    // ignored on the one path CMA-ES uses. Roughly one proposal in eight is affected.
    const port = vectorSpace(SPACE);
    const centre = toVector(SPACE, defaultCandidate(SPACE));

    // A feasible point reports nothing.
    expect(port.reasonFor(port.decode(centre))).toBeUndefined();

    // The one combination `core` refuses, reached from the box rather than hand-built: push
    // `dispatch.callType` onto destination entry and `dispatch.assignmentTiming` onto deferred.
    const corner = [...centre];
    const callType = SPACE.byId.get('dispatch.callType') as SearchParameter;
    const timing = SPACE.byId.get('dispatch.assignmentTiming') as SearchParameter;
    if (callType.type !== 'categorical' || timing.type !== 'categorical') {
      throw new Error('dispatch.callType and dispatch.assignmentTiming are categorical');
    }
    corner[SPACE.ids.indexOf('dispatch.callType')] =
      callType.values.indexOf('destination-entry') + 0.5;
    corner[SPACE.ids.indexOf('dispatch.assignmentTiming')] = timing.values.indexOf('deferred') + 0.5;
    const decoded = port.decode(corner);
    expect(decoded.get('dispatch.callType')).toBe('destination-entry');
    expect(decoded.get('dispatch.assignmentTiming')).toBe('deferred');
    expect(port.reasonFor(decoded)).toMatch(/defers assignment under destination entry/);

    // And the caller's own oracle is asked too, on the merged point — the option `vectorSpace`
    // has always accepted and never used.
    const building = CONFIG.buildingsById.get('midtown-office') as ResolvedBuilding;
    const withBuilding = vectorSpace(SPACE, {
      feasible: buildingFeasibility(SPACE, building, CONFIG.elevatorSpecs),
    });
    const dwell = [...centre];
    const policy = SPACE.byId.get('answer.dwellPolicy') as SearchParameter;
    if (policy.type !== 'categorical') throw new Error('answer.dwellPolicy is categorical');
    dwell[SPACE.ids.indexOf('answer.dwellPolicy')] = policy.values.indexOf('adaptive') + 0.5;
    dwell[SPACE.ids.indexOf('answer.maxDwellS')] = 4;
    const adaptive = withBuilding.decode(dwell);
    expect(adaptive.get('answer.maxDwellS')).toBe(4);
    // The space alone cannot see it: the constraint is against a *car*.
    expect(SPACE.validate(adaptive)).toBeUndefined();
    expect(withBuilding.reasonFor(adaptive)).toMatch(/maxDwellS/);
    // Without the oracle wired in, the same point reads as runnable — which is what the whole
    // CMA-ES path used to do with the oracle wired in.
    expect(port.reasonFor(adaptive)).toBeUndefined();
  });

  it('reports a below-box proposal rather than folding it onto an inadmissible endpoint', () => {
    // The two halves of the same defect. `answer.bypassLoadThreshold` declares `[0, 1]` and
    // `resolveLoadSensor` refuses `0`, so the old clamping fold manufactured an infeasible point
    // out of an ordinary below-box proposal — 67 of 500 CMA-ES-shaped proposals decoded to exactly
    // `0`. Reflection stops manufacturing it; `reasonFor` is what answers for the corners of the
    // box that are genuinely infeasible.
    const building = CONFIG.buildingsById.get('midtown-office') as ResolvedBuilding;
    const port = vectorSpace(SPACE, {
      feasible: buildingFeasibility(SPACE, building, CONFIG.elevatorSpecs),
    });
    const centre = toVector(SPACE, defaultCandidate(SPACE));
    const index = SPACE.ids.indexOf('answer.bypassLoadThreshold');

    let zeros = 0;
    for (let step = 1; step <= 200; step += 1) {
      const vector = [...centre];
      vector[index] = -(step / 200);
      const value = port.decode(vector).get('answer.bypassLoadThreshold') as number;
      if (value === 0) zeros += 1;
      expect(value, `proposal ${step}`).toBeGreaterThan(0);
    }
    expect(zeros).toBe(0);

    // And when a point genuinely is at the inadmissible endpoint, it is *reported*, not returned
    // as a runnable point. This is the value the fold used to invent.
    const atZero = new Map(defaultCandidate(SPACE));
    atZero.set('answer.bypassLoadThreshold', 0);
    expect(port.reasonFor(atZero)).toMatch(/bypassLoadThreshold/);
  });

  it('materializes a candidate under the id the search gave it', () => {
    // The runner attributes a run to an arm by profile id, so a materializer that renamed the
    // candidate would attribute a result to the wrong point in the space.
    const materialize = materializer(SPACE);
    const candidate = sampleCandidate(SPACE, policyNoiseStream(SEED));
    const profile = materialize(candidate, 'generation-2-4');
    expect(profile.id).toBe('generation-2-4');
    expect(profile.weights['waitTime']).toBe(candidate.get('weights.waitTime'));
  });
});

/* -------------------------------------------------------------------------- *
 * Batches
 * -------------------------------------------------------------------------- */

describe('a round of candidates', () => {
  it('draws the requested count, independently', () => {
    const rng = policyNoiseStream(SEED);
    const round = sampleCandidates(SPACE, rng, 33, { validate: false });
    expect(round).toHaveLength(33);
    const distinct = new Set(round.map((candidate) => JSON.stringify([...candidate])));
    expect(distinct.size).toBe(33);
    expect(sampleCandidates(SPACE, rng, 0)).toStrictEqual([]);
  });

  it('agrees with activeParameters about what each candidate searched', () => {
    for (const candidate of draw(SEED, 30)) {
      expect(activeParameters(SPACE, candidate).map((parameter) => parameter.id)).toStrictEqual([
        ...candidate.keys(),
      ]);
    }
  });
});
