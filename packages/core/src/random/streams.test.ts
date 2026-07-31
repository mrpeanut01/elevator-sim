import { describe, expect, it } from 'vitest';

import { Pcg32, type Rng } from './rng.js';
import { STREAM_NAMES, StreamSet, deriveStreamSeed, normalizeSeed, type StreamName } from './streams.js';

const MASTER_SEED = 20260725;

const drawUints = (rng: Rng, n: number): number[] =>
  Array.from({ length: n }, () => rng.nextUint32());

const drawFloats = (rng: Rng, n: number): number[] =>
  Array.from({ length: n }, () => rng.nextFloat());

/** Every stream name except the one given. */
const others = (name: StreamName): readonly StreamName[] =>
  STREAM_NAMES.filter((candidate) => candidate !== name);

describe('StreamSet — required streams', () => {
  it('exposes exactly the sources named in the architecture', () => {
    expect([...STREAM_NAMES]).toEqual([
      'arrivals',
      'origins',
      'destinations',
      'passengerMass',
      'doorObstruction',
      'policyNoise',
      // Appended, never inserted: a name's spelling decides its PCG parameters, so the six above
      // keep theirs. See the COMPATIBILITY LOCK below.
      'batchSize',
      'patience',
      'modeChoice',
    ]);
  });

  it('materializes every one of them on construction', () => {
    const set = new StreamSet(MASTER_SEED);
    expect(set.streamNames()).toEqual([...STREAM_NAMES]);
  });

  it('exposes each stream as both a property and via stream(), as the same instance', () => {
    const set = new StreamSet(MASTER_SEED);
    expect(set.stream('arrivals')).toBe(set.arrivals);
    expect(set.stream('origins')).toBe(set.origins);
    expect(set.stream('destinations')).toBe(set.destinations);
    expect(set.stream('passengerMass')).toBe(set.passengerMass);
    expect(set.stream('doorObstruction')).toBe(set.doorObstruction);
    expect(set.stream('policyNoise')).toBe(set.policyNoise);
    expect(set.stream('batchSize')).toBe(set.batchSize);
  });

  it('keeps the seed available for the run record', () => {
    const set = new StreamSet(MASTER_SEED);
    expect(set.masterSeed).toBe(BigInt(MASTER_SEED));
    expect(set.snapshot().masterSeed).toBe('20260725');
  });
});

describe('StreamSet — reproducibility', () => {
  it('produces identical draws from every stream for the same master seed', () => {
    const a = new StreamSet(MASTER_SEED);
    const b = new StreamSet(MASTER_SEED);

    for (const name of STREAM_NAMES) {
      expect(drawUints(a.stream(name), 500)).toEqual(drawUints(b.stream(name), 500));
    }
  });

  it('reproduces derived distributions too, not just the raw integers', () => {
    const a = new StreamSet(4242);
    const b = new StreamSet(4242);

    expect(drawFloats(a.arrivals, 200)).toEqual(drawFloats(b.arrivals, 200));
    expect(Array.from({ length: 200 }, () => a.passengerMass.normal(75, 15))).toEqual(
      Array.from({ length: 200 }, () => b.passengerMass.normal(75, 15)),
    );
    expect(Array.from({ length: 200 }, () => a.arrivals.exponential(0.4))).toEqual(
      Array.from({ length: 200 }, () => b.arrivals.exponential(0.4)),
    );
    expect(Array.from({ length: 200 }, () => a.origins.nextInt(1, 41))).toEqual(
      Array.from({ length: 200 }, () => b.origins.nextInt(1, 41)),
    );
  });

  it('treats number and bigint master seeds as equivalent', () => {
    const a = new StreamSet(12345);
    const b = new StreamSet(12345n);
    for (const name of STREAM_NAMES) {
      expect(drawUints(a.stream(name), 100)).toEqual(drawUints(b.stream(name), 100));
    }
  });

  it('produces different draws for different master seeds', () => {
    const a = new StreamSet(1);
    const b = new StreamSet(2);
    for (const name of STREAM_NAMES) {
      expect(drawUints(a.stream(name), 200)).not.toEqual(drawUints(b.stream(name), 200));
    }
  });
});

describe('StreamSet — stream independence (the common-random-numbers guarantee)', () => {
  it('consuming 1000 values from arrivals does not perturb destinations', () => {
    // The exact scenario from the acceptance criteria. If this ever fails, every paired
    // comparison the project reports is invalid.
    const disturbed = new StreamSet(MASTER_SEED);
    for (let i = 0; i < 1000; i += 1) {
      disturbed.arrivals.nextUint32();
    }

    const pristine = new StreamSet(MASTER_SEED);
    expect(drawUints(disturbed.destinations, 1000)).toEqual(drawUints(pristine.destinations, 1000));
  });

  it.each(STREAM_NAMES)(
    'consuming 1000 values from %s leaves every other stream bit-identical',
    (disturbedName) => {
      const disturbed = new StreamSet(MASTER_SEED);
      for (let i = 0; i < 1000; i += 1) {
        disturbed.stream(disturbedName).nextUint32();
      }

      for (const name of others(disturbedName)) {
        const pristine = new StreamSet(MASTER_SEED);
        expect(drawUints(disturbed.stream(name), 500)).toEqual(
          drawUints(pristine.stream(name), 500),
        );
      }
    },
  );

  it('is insensitive to how much each stream is consumed, and in what order', () => {
    // Simulates the real failure mode: dispatcher B triggers extra door reopens and extra
    // policy-noise draws. The passenger population must not move because of it.
    const reference = new StreamSet(MASTER_SEED);
    const referenceArrivals = drawFloats(reference.arrivals, 300);
    const referenceOrigins = drawUints(reference.origins, 300);

    const perturbed = new StreamSet(MASTER_SEED);
    const observedArrivals: number[] = [];
    const observedOrigins: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      // Wildly uneven, interleaved consumption of the "elevator behavior" streams.
      for (let k = 0; k < i % 7; k += 1) {
        perturbed.doorObstruction.bernoulli(0.05);
      }
      for (let k = 0; k < (i * 3) % 11; k += 1) {
        perturbed.policyNoise.nextFloat();
      }
      perturbed.passengerMass.normal(75, 15);
      observedArrivals.push(perturbed.arrivals.nextFloat());
      observedOrigins.push(perturbed.origins.nextUint32());
    }

    expect(observedArrivals).toEqual(referenceArrivals);
    expect(observedOrigins).toEqual(referenceOrigins);
  });

  it('gives every pair of streams a different sequence under the same master seed', () => {
    const set = new StreamSet(MASTER_SEED);
    const sequences = new Map<StreamName, string>(
      STREAM_NAMES.map((name) => [name, drawUints(set.stream(name), 100).join(',')]),
    );

    for (const a of STREAM_NAMES) {
      for (const b of others(a)) {
        expect(sequences.get(a)).not.toEqual(sequences.get(b));
      }
    }
    expect(new Set(sequences.values()).size).toBe(STREAM_NAMES.length);
  });

  it('gives streams disjoint value sets in practice, not merely an offset of one another', () => {
    const set = new StreamSet(MASTER_SEED);
    const arrivals = drawUints(set.arrivals, 2000);
    const origins = new Set(drawUints(set.origins, 2000));

    // Two 2000-long uint32 samples share a value with probability ~9e-4 by birthday
    // collision. A shared *run* would mean the streams are the same sequence offset.
    let longestSharedRun = 0;
    let current = 0;
    for (const value of arrivals) {
      current = origins.has(value) ? current + 1 : 0;
      longestSharedRun = Math.max(longestSharedRun, current);
    }
    expect(longestSharedRun).toBeLessThan(3);
  });
});

describe('StreamSet — ad-hoc derived streams', () => {
  it('memoizes derived streams instead of restarting them', () => {
    const set = new StreamSet(MASTER_SEED);
    const first = set.derive('serviceFailures');
    const second = set.derive('serviceFailures');
    expect(second).toBe(first);

    const drawsA = drawUints(first, 10);
    const drawsB = drawUints(second, 10);
    expect(drawsB).not.toEqual(drawsA);
  });

  it('reproduces derived streams across StreamSets with the same seed', () => {
    const a = new StreamSet(MASTER_SEED).derive('serviceFailures');
    const b = new StreamSet(MASTER_SEED).derive('serviceFailures');
    expect(drawUints(a, 200)).toEqual(drawUints(b, 200));
  });

  it('keeps derived streams independent of the required six', () => {
    const disturbed = new StreamSet(MASTER_SEED);
    drawUints(disturbed.derive('serviceFailures'), 1000);

    const pristine = new StreamSet(MASTER_SEED);
    for (const name of STREAM_NAMES) {
      expect(drawUints(disturbed.stream(name), 200)).toEqual(
        drawUints(pristine.stream(name), 200),
      );
    }
  });

  it('rejects an empty stream name', () => {
    const set = new StreamSet(MASTER_SEED);
    expect(() => set.derive('')).toThrow(RangeError);
  });
});

describe('deriveStreamSeed', () => {
  it('is deterministic', () => {
    expect(deriveStreamSeed(MASTER_SEED, 'arrivals')).toEqual(
      deriveStreamSeed(MASTER_SEED, 'arrivals'),
    );
  });

  it('gives every required stream a distinct initState and initSeq', () => {
    const seeds = STREAM_NAMES.map((name) => deriveStreamSeed(MASTER_SEED, name));
    expect(new Set(seeds.map((s) => s.initState)).size).toBe(STREAM_NAMES.length);
    expect(new Set(seeds.map((s) => s.initSeq)).size).toBe(STREAM_NAMES.length);
  });

  it('avalanches on a one-character stream name change', () => {
    const a = deriveStreamSeed(MASTER_SEED, 'origins');
    const b = deriveStreamSeed(MASTER_SEED, 'origin');
    expect(a.initState).not.toBe(b.initState);
    expect(a.initSeq).not.toBe(b.initSeq);
  });

  it('avalanches on a one-bit master seed change', () => {
    const a = deriveStreamSeed(1n, 'arrivals');
    const b = deriveStreamSeed(0n, 'arrivals');
    // Count differing bits; a good mixer flips roughly half of the 64.
    const differing = ((a.initState ^ b.initState).toString(2).match(/1/g) ?? []).length;
    expect(differing).toBeGreaterThan(16);
    expect(differing).toBeLessThan(48);
  });

  it('stays within 64 bits', () => {
    for (const name of STREAM_NAMES) {
      const { initState, initSeq } = deriveStreamSeed(0xffffffffffffffffn, name);
      expect(initState).toBeGreaterThanOrEqual(0n);
      expect(initState).toBeLessThan(1n << 64n);
      expect(initSeq).toBeGreaterThanOrEqual(0n);
      expect(initSeq).toBeLessThan(1n << 64n);
    }
  });
});

/*
 * ============================================================================
 * COMPATIBILITY LOCK — every number below is a stored-run-record contract.
 * ============================================================================
 *
 * `deriveStreamSeed` is the mapping from a persisted seed to the actual PCG parameters of
 * every stream, and CLAUDE.md invariant 5 says any run replays exactly from its seed. That
 * only holds if this mapping never changes. `Pcg32` itself is pinned to the published PCG
 * reference vector in `rng.test.ts`; these vectors pin the derivation layer sitting on top
 * of it — FNV-1a-64 over the stream name, the XOR into the master seed, the two SplitMix64
 * outputs, and which of those becomes `initState` versus `initSeq`.
 *
 * The values were produced by an independent BigInt implementation of FNV-1a-64,
 * SplitMix64 and `pcg_setseq_64_xsh_rr_32`, written from the algorithm specifications
 * rather than from `streams.ts`, then confirmed against this module.
 *
 * IF A CHANGE MAKES THESE TESTS FAIL, DO NOT REBASELINE THE NUMBERS. A failure means every
 * run record persisted before that change now replays with a different passenger
 * population, a different mass distribution and different dispatcher noise — the stored
 * seeds no longer reproduce the results they are attached to. Changing them is a
 * data-format break that has to be made consciously, versioned in the run record, and
 * recorded in the docs. Candidates that look harmless but are not: "fixing" `fnv1a64` to
 * hash real UTF-8 bytes instead of the current low-byte/high-byte-of-each-UTF-16-code-unit
 * scheme, swapping which SplitMix64 output becomes `initState`, reordering `STREAM_NAMES`
 * in a way that changes a name's spelling, or touching any FNV/SplitMix/PCG constant.
 */

/** Frozen forever. Deliberately not `MASTER_SEED`, so editing that constant cannot silently rebaseline this table. */
const GOLDEN_MASTER_SEED = 20260725n;

interface GoldenVector {
  readonly initState: bigint;
  readonly initSeq: bigint;
  /** The first four `nextUint32()` outputs of the stream those parameters produce. */
  readonly firstDraws: readonly number[];
}

const GOLDEN_STREAMS: Readonly<Record<StreamName, GoldenVector>> = {
  arrivals: {
    initState: 5913679179095760997n,
    initSeq: 17927098197666368427n,
    firstDraws: [1269769251, 3550332159, 2919973319, 3220707166],
  },
  origins: {
    initState: 17581131127126267531n,
    initSeq: 10455470523310462623n,
    firstDraws: [727518064, 2233016699, 1879839408, 3164875444],
  },
  destinations: {
    initState: 17183800951614885545n,
    initSeq: 14629175158802612519n,
    firstDraws: [137831193, 3756035819, 4014323935, 3977389169],
  },
  passengerMass: {
    initState: 2457553554358419712n,
    initSeq: 3103698689453978565n,
    firstDraws: [3252565792, 364509337, 977635958, 2978899690],
  },
  doorObstruction: {
    initState: 9395060643752409542n,
    initSeq: 16238204287319774194n,
    firstDraws: [2100875855, 719918130, 1179652980, 2263164917],
  },
  policyNoise: {
    initState: 7999546645786507n,
    initSeq: 5524437755935699479n,
    firstDraws: [3214590096, 3644864734, 3822589677, 2368049409],
  },
  /*
   * Added with the stream itself (docs/14 § 1.3), and produced the same way the six above were:
   * by an independent BigInt implementation of FNV-1a-64, SplitMix64 and
   * `pcg_setseq_64_xsh_rr_32` written from the algorithm specifications, which was first required
   * to reproduce all six of them and the ad-hoc vector below before this seventh was taken from it.
   *
   * That order matters. A value read out of `streams.ts` would pin the code to itself and prove
   * nothing; a value from a program that independently agrees on seven of seven pins the *scheme*.
   */
  batchSize: {
    initState: 10950848240609012255n,
    initSeq: 11551578178733633914n,
    firstDraws: [2215659223, 3273889632, 4109878313, 4090393260],
  },
  /*
   * Added with the streams themselves (docs/14 § 3.1 and § 3.3), and produced by the same
   * independent BigInt program, run under the same rule: it was required to reproduce **all
   * eight** vectors already pinned above — the seven streams and the ad-hoc one — before either
   * of these two was taken from it. It did.
   *
   * That the seven above are untouched is the measurement, not an assumption:
   * `deriveStreamSeed` hashes the stream's **name**, so a name appended to `STREAM_NAMES` cannot
   * move an existing stream's parameters by position. This table is where that claim is checked
   * rather than asserted — every earlier row still holds with two new names in the list.
   */
  patience: {
    initState: 2723526455862252969n,
    initSeq: 7952846625298762981n,
    firstDraws: [1106427436, 3028617148, 1717110874, 4003086497],
  },
  modeChoice: {
    initState: 8546373963621181858n,
    initSeq: 4920448037779798214n,
    firstDraws: [238409173, 3289634889, 937522763, 3447560127],
  },
};

/** An ad-hoc stream, pinned too: `derive()` outputs are just as persisted as the required six. */
const GOLDEN_AD_HOC: GoldenVector = {
  initState: 6179788200142819893n,
  initSeq: 3259306115830592471n,
  firstDraws: [1528119337, 544947115, 863591432, 2734703524],
};

/** `(masterSeed, 'arrivals')` at seeds that exercise the normalization path. */
const GOLDEN_EDGE_SEEDS: [bigint, bigint, bigint][] = [
  [0n, 7265344741233544164n, 13413592699343696700n],
  [1n, 11100421888571466235n, 17687159544351433168n],
  [0xffffffffffffffffn, 2016265919597876141n, 17683839432717968209n],
];

describe('COMPATIBILITY LOCK — seed derivation golden vectors', () => {
  it.each(STREAM_NAMES)('deriveStreamSeed(20260725, %s) is unchanged', (name) => {
    const golden = GOLDEN_STREAMS[name];
    const { initState, initSeq } = deriveStreamSeed(GOLDEN_MASTER_SEED, name);
    expect(initState).toBe(golden.initState);
    expect(initSeq).toBe(golden.initSeq);
  });

  it.each(STREAM_NAMES)('StreamSet(20260725).%s emits its recorded first draws', (name) => {
    const golden = GOLDEN_STREAMS[name];
    const set = new StreamSet(GOLDEN_MASTER_SEED);
    expect(drawUints(set.stream(name), golden.firstDraws.length)).toEqual([...golden.firstDraws]);
  });

  it('derives an ad-hoc stream identically to its recorded parameters and draws', () => {
    const { initState, initSeq } = deriveStreamSeed(GOLDEN_MASTER_SEED, 'serviceFailures');
    expect(initState).toBe(GOLDEN_AD_HOC.initState);
    expect(initSeq).toBe(GOLDEN_AD_HOC.initSeq);

    const set = new StreamSet(GOLDEN_MASTER_SEED);
    expect(drawUints(set.derive('serviceFailures'), GOLDEN_AD_HOC.firstDraws.length)).toEqual([
      ...GOLDEN_AD_HOC.firstDraws,
    ]);
  });

  it.each(GOLDEN_EDGE_SEEDS)(
    'deriveStreamSeed(%s, arrivals) is unchanged',
    (seed, initState, initSeq) => {
      expect(deriveStreamSeed(seed, 'arrivals')).toEqual({ initState, initSeq });
    },
  );

  it('accepts the equivalent number seed and derives the same parameters', () => {
    // Locks the number/bigint normalization path against the same pinned values, so a
    // change to normalizeSeed cannot slip past the bigint-only vectors above.
    expect(deriveStreamSeed(20260725, 'arrivals')).toEqual({
      initState: GOLDEN_STREAMS.arrivals.initState,
      initSeq: GOLDEN_STREAMS.arrivals.initSeq,
    });
    expect(deriveStreamSeed(0, 'arrivals')).toEqual(
      deriveStreamSeed(0n, 'arrivals'),
    );
    expect(deriveStreamSeed(-1, 'arrivals')).toEqual(
      deriveStreamSeed(0xffffffffffffffffn, 'arrivals'),
    );
  });

  it('turns the pinned parameters into the pinned draws through Pcg32 itself', () => {
    // If this passes but the StreamSet cases above fail, the break is in the derivation
    // layer, not in Pcg32 — and vice versa.
    for (const name of STREAM_NAMES) {
      const golden = GOLDEN_STREAMS[name];
      const rng = new Pcg32(golden.initState, golden.initSeq);
      expect(drawUints(rng, golden.firstDraws.length)).toEqual([...golden.firstDraws]);
    }
  });

  it('produces the recorded end-to-end floats a replayed run would see', () => {
    // The seed-to-simulation-value path in full: derivation, PCG, and the 53-bit float
    // construction that arrival gaps and every other continuous draw are built from.
    const set = new StreamSet(GOLDEN_MASTER_SEED);
    expect(drawFloats(set.arrivals, 3)).toEqual([
      0.29564119746257445, 0.6798592712721178, 0.8727979462436027,
    ]);
  });
});

describe('normalizeSeed', () => {
  it('accepts numbers and bigints alike', () => {
    expect(normalizeSeed(7)).toBe(7n);
    expect(normalizeSeed(7n)).toBe(7n);
  });

  it('wraps negative and oversized values into unsigned 64-bit', () => {
    expect(normalizeSeed(-1n)).toBe(0xffffffffffffffffn);
    expect(normalizeSeed(1n << 64n)).toBe(0n);
  });

  it('rejects non-integral numeric seeds', () => {
    expect(() => normalizeSeed(1.5)).toThrow(RangeError);
    expect(() => normalizeSeed(Number.NaN)).toThrow(RangeError);
    expect(() => normalizeSeed(2 ** 53 + 2)).toThrow(RangeError);
  });
});

describe('StreamSet — clone and snapshot', () => {
  it('clone() resumes every stream from its current position', () => {
    const original = new StreamSet(MASTER_SEED);
    drawUints(original.arrivals, 137);
    drawUints(original.policyNoise, 41);
    drawUints(original.derive('serviceFailures'), 9);

    const copy = original.clone();
    for (const name of [...STREAM_NAMES, 'serviceFailures']) {
      expect(drawUints(copy.derive(name), 50)).toEqual(drawUints(original.derive(name), 50));
    }
  });

  it('clone() is independent of the original', () => {
    const original = new StreamSet(MASTER_SEED);
    const copy = original.clone();
    drawUints(copy.arrivals, 5000);

    const pristine = new StreamSet(MASTER_SEED);
    expect(drawUints(original.arrivals, 100)).toEqual(drawUints(pristine.arrivals, 100));
  });

  it('snapshot() is JSON-serializable and captures every materialized stream', () => {
    const set = new StreamSet(MASTER_SEED);
    drawUints(set.arrivals, 3);
    const snapshot = JSON.parse(JSON.stringify(set.snapshot())) as {
      masterSeed: string;
      streams: Record<string, unknown>;
    };

    expect(snapshot.masterSeed).toBe('20260725');
    expect(Object.keys(snapshot.streams)).toEqual([...STREAM_NAMES]);
  });
});

describe('StreamSet — statistical sanity through the named streams', () => {
  it('arrivals produces exponential inter-arrival gaps with the requested mean', () => {
    const set = new StreamSet(MASTER_SEED);
    const rate = 0.5;
    let total = 0;
    const n = 100_000;
    for (let i = 0; i < n; i += 1) {
      total += set.arrivals.exponential(rate);
    }
    expect(total / n).toBeCloseTo(1 / rate, 1);
  });

  it('passengerMass produces a plausible mass distribution', () => {
    const set = new StreamSet(MASTER_SEED);
    const n = 100_000;
    const values = Array.from({ length: n }, () => set.passengerMass.normal(75, 15));
    const m = values.reduce((sum, v) => sum + v, 0) / n;
    const sd = Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n - 1));
    expect(m).toBeCloseTo(75, 0);
    expect(sd).toBeGreaterThan(14.5);
    expect(sd).toBeLessThan(15.5);
  });

  it('origins spreads uniformly over a floor range', () => {
    const set = new StreamSet(MASTER_SEED);
    const floors = 20;
    const counts = new Array<number>(floors).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i += 1) {
      const floor = set.origins.nextInt(0, floors);
      counts[floor] = (counts[floor] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count / n).toBeCloseTo(1 / floors, 2);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The traffic seed — docs/14 § 1.1
 * -------------------------------------------------------------------------- */

describe('a separate traffic seed splits who turns up from how the machine behaves', () => {
  /*
   * `batchSize` is demand: how many people walk in together is a fact about the crowd and nothing
   * about the machine, so a traffic seed that re-rolled who turns up and when but left every group
   * the same size would be re-rolling half a Tuesday.
   */
  const DEMAND = ['arrivals', 'origins', 'destinations', 'passengerMass', 'batchSize'] as const;
  const MACHINE = ['doorObstruction', 'policyNoise'] as const;

  const firstDraws = (set: StreamSet, name: StreamName, count = 8): readonly number[] =>
    Array.from({ length: count }, () => set.stream(name).nextUint32());

  /**
   * The blocking criterion of docs/14 § 5, at the smallest scale it can be stated.
   *
   * Every feature in that program is allowed to exist only because a run that does not ask for it
   * is unchanged. If this fails, 981 pinned estimates and both identity digests are wrong, and no
   * amount of the rest being correct would rescue it.
   */
  it('changes nothing at all when it is absent', () => {
    for (const name of STREAM_NAMES) {
      expect(firstDraws(new StreamSet(20_260_726), name), name).toEqual(
        firstDraws(new StreamSet(20_260_726, {}), name),
      );
    }
  });

  it('re-rolls the crowd while the machine stays put', () => {
    const monday = new StreamSet(7, { trafficSeed: 1 });
    const tuesday = new StreamSet(7, { trafficSeed: 2 });

    for (const name of DEMAND) {
      expect(firstDraws(monday, name), `${name} should differ`).not.toEqual(
        firstDraws(tuesday, name),
      );
    }
    for (const name of MACHINE) {
      expect(firstDraws(monday, name), `${name} should not move`).toEqual(
        firstDraws(tuesday, name),
      );
    }
  });

  /*
   * The other direction, and the one common random numbers actually needs: hold the crowd, change
   * the machine. Two dispatchers meeting the same people is the comparison this project is built
   * on, and until now it could only be had by holding *everything* fixed.
   */
  it('holds the crowd while the machine changes', () => {
    const armA = new StreamSet(11, { trafficSeed: 99 });
    const armB = new StreamSet(22, { trafficSeed: 99 });

    for (const name of DEMAND) {
      expect(firstDraws(armA, name), `${name} should not move`).toEqual(firstDraws(armB, name));
    }
    for (const name of MACHINE) {
      expect(firstDraws(armA, name), `${name} should differ`).not.toEqual(firstDraws(armB, name));
    }
  });

  /*
   * A traffic seed equal to the run seed must reproduce the no-traffic-seed run exactly. It is the
   * boundary between the two branches of `#seedFor`, and the place an off-by-one in that predicate
   * would hide.
   */
  it('is the identity when it equals the run seed', () => {
    for (const name of STREAM_NAMES) {
      expect(firstDraws(new StreamSet(4242), name), name).toEqual(
        firstDraws(new StreamSet(4242, { trafficSeed: 4242 }), name),
      );
    }
  });

  it('carries both seeds through a clone, so a branched run keeps its crowd', () => {
    const original = new StreamSet(5, { trafficSeed: 6 });
    original.arrivals.nextUint32();
    const copy = original.clone();

    expect(copy.masterSeed).toBe(original.masterSeed);
    expect(copy.trafficSeed).toBe(original.trafficSeed);
    // The clone resumes where the original stood, and on the original's crowd. A copy that lost
    // the traffic seed would silently re-derive `arrivals` from the master seed and branch into a
    // different population — which is the one failure a clone must not have.
    expect(copy.arrivals.nextUint32()).toBe(original.arrivals.nextUint32());
  });

  /* Invariant 5: a record that cannot name both seeds cannot replay the run. */
  it('reports the traffic seed in a snapshot, and omits it when there is none', () => {
    expect(new StreamSet(5, { trafficSeed: 6 }).snapshot().trafficSeed).toBe('6');
    expect(new StreamSet(5).snapshot().trafficSeed).toBeUndefined();
    expect('trafficSeed' in new StreamSet(5).snapshot()).toBe(false);
  });

  it('normalizes a traffic seed the way it normalizes a master seed', () => {
    expect(new StreamSet(1, { trafficSeed: -1 }).trafficSeed).toBe(
      BigInt.asUintN(64, -1n),
    );
  });
});
