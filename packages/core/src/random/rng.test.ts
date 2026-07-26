import { describe, expect, it } from 'vitest';

import { Pcg32, type RngState } from './rng.js';

/**
 * Straightforward BigInt implementation of `pcg_setseq_64_xsh_rr_32`, transcribed from the
 * PCG reference C. Deliberately slow and obvious: it is the oracle that proves the 32-bit
 * limb arithmetic in `rng.ts` is correct. If these two ever disagree, `rng.ts` is wrong.
 */
class ReferencePcg32 {
  static readonly #MASK = (1n << 64n) - 1n;
  static readonly #MULT = 6364136223846793005n;

  #state = 0n;
  readonly #inc: bigint;

  constructor(seed: bigint, streamId: bigint) {
    this.#inc = ((streamId << 1n) | 1n) & ReferencePcg32.#MASK;
    this.#state = 0n;
    this.#step();
    this.#state = (this.#state + BigInt.asUintN(64, seed)) & ReferencePcg32.#MASK;
    this.#step();
  }

  #step(): void {
    this.#state = (this.#state * ReferencePcg32.#MULT + this.#inc) & ReferencePcg32.#MASK;
  }

  nextUint32(): number {
    const old = this.#state;
    this.#step();
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

const stdDev = (values: readonly number[]): number => {
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const draw = (rng: Pcg32, n: number, f: (r: Pcg32) => number): number[] =>
  Array.from({ length: n }, () => f(rng));

describe('Pcg32 — algorithm correctness', () => {
  it('matches the published PCG reference vector for (initstate=42, initseq=54)', () => {
    // From the PCG C reference demo (`pcg32-demo`, round 1, 32-bit outputs).
    const expected = [0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e];
    const rng = new Pcg32(42, 54);
    expect(draw(rng, expected.length, (r) => r.nextUint32())).toEqual(expected);
  });

  it.each([
    [0n, 0n],
    [1n, 0n],
    [42n, 54n],
    [0xdeadbeefn, 0xcafen],
    [0xffffffffffffffffn, 0x7fffffffffffffffn],
    [123456789n, 987654321n],
  ])('agrees with the BigInt reference implementation for seed=%s stream=%s', (seed, stream) => {
    const fast = new Pcg32(seed, stream);
    const reference = new ReferencePcg32(seed, stream);

    // One assertion carrying the first divergence, rather than 20k assertion frames.
    let firstMismatch: { index: number; actual: number; expected: number } | null = null;
    for (let i = 0; i < 20_000 && firstMismatch === null; i += 1) {
      const actual = fast.nextUint32();
      const expectedValue = reference.nextUint32();
      if (actual !== expectedValue) {
        firstMismatch = { index: i, actual, expected: expectedValue };
      }
    }
    expect(firstMismatch).toBeNull();
  });

  it('emits values across the full uint32 range', () => {
    const rng = new Pcg32(7, 1);
    const values = draw(rng, 100_000, (r) => r.nextUint32());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(2 ** 32);
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
    // High and low halves of the range should each be hit roughly half the time.
    const upper = values.filter((v) => v >= 2 ** 31).length;
    expect(upper / values.length).toBeCloseTo(0.5, 2);
  });

  it('spreads the top 4 bits roughly uniformly across 16 buckets', () => {
    const rng = new Pcg32(99, 3);
    const buckets = new Array<number>(16).fill(0);
    const n = 160_000;
    for (let i = 0; i < n; i += 1) {
      const bucket = rng.nextUint32() >>> 28;
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expected = n / 16;
    // Chi-square with 15 df: the 0.999 critical value is ~37.7. Generous by design.
    const chiSquare = buckets.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(37.7);
  });
});

describe('Pcg32 — determinism and independence', () => {
  it('produces identical sequences from identical construction parameters', () => {
    const a = new Pcg32(2024, 11);
    const b = new Pcg32(2024, 11);
    expect(draw(a, 1000, (r) => r.nextUint32())).toEqual(draw(b, 1000, (r) => r.nextUint32()));
  });

  it('treats number and bigint seeds as equivalent', () => {
    const a = new Pcg32(12345, 6);
    const b = new Pcg32(12345n, 6n);
    expect(draw(a, 200, (r) => r.nextUint32())).toEqual(draw(b, 200, (r) => r.nextUint32()));
  });

  it('produces different sequences for different stream selectors', () => {
    const a = draw(new Pcg32(1, 0), 500, (r) => r.nextUint32());
    const b = draw(new Pcg32(1, 1), 500, (r) => r.nextUint32());
    expect(a).not.toEqual(b);
    // Not merely offset by one: no shared prefix at any small lag.
    for (let lag = 1; lag <= 5; lag += 1) {
      expect(a.slice(lag, lag + 20)).not.toEqual(b.slice(0, 20));
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = draw(new Pcg32(1, 0), 500, (r) => r.nextUint32());
    const b = draw(new Pcg32(2, 0), 500, (r) => r.nextUint32());
    expect(a).not.toEqual(b);
  });

  it('holds no module-level state: interleaved generators do not affect each other', () => {
    const solo = draw(new Pcg32(5, 5), 200, (r) => r.nextUint32());

    const interleaved = new Pcg32(5, 5);
    const noise = new Pcg32(99, 99);
    const observed: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      noise.nextUint32();
      noise.nextFloat();
      observed.push(interleaved.nextUint32());
    }
    expect(observed).toEqual(solo);
  });
});

describe('Pcg32 — clone and state', () => {
  it('clone() resumes from the exact current position', () => {
    const original = new Pcg32(31337, 2);
    draw(original, 137, (r) => r.nextUint32());

    const copy = original.clone();
    expect(draw(copy, 100, (r) => r.nextUint32())).toEqual(
      draw(original, 100, (r) => r.nextUint32()),
    );
  });

  it('clone() is independent: advancing the copy does not move the original', () => {
    const original = new Pcg32(8, 8);
    const copy = original.clone();
    draw(copy, 1000, (r) => r.nextUint32());

    const fresh = new Pcg32(8, 8);
    expect(draw(original, 50, (r) => r.nextUint32())).toEqual(
      draw(fresh, 50, (r) => r.nextUint32()),
    );
  });

  it('getState() round-trips through fromState() and survives JSON', () => {
    const rng = new Pcg32(4242, 17);
    draw(rng, 77, (r) => r.nextUint32());

    const state = rng.getState();
    const json = JSON.parse(JSON.stringify(state)) as RngState;
    const restored = Pcg32.fromState(json);

    expect(draw(restored, 100, (r) => r.nextUint32())).toEqual(
      draw(rng, 100, (r) => r.nextUint32()),
    );
  });

  it('getState() reports four unsigned 32-bit integers with an odd increment', () => {
    const state = new Pcg32(1n << 63n, 12345).getState();
    for (const value of [state.stateHi, state.stateLo, state.incHi, state.incLo]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
    expect(state.incLo % 2).toBe(1);
  });

  it('rejects malformed states', () => {
    const valid = new Pcg32(1, 1).getState();
    expect(() => Pcg32.fromState({ ...valid, stateHi: -1 })).toThrow(RangeError);
    expect(() => Pcg32.fromState({ ...valid, stateLo: 2 ** 32 })).toThrow(RangeError);
    expect(() => Pcg32.fromState({ ...valid, stateLo: 1.5 })).toThrow(RangeError);
    expect(() => Pcg32.fromState({ ...valid, incLo: 2 })).toThrow(RangeError);
  });

  it('rejects unsafe numeric seeds', () => {
    expect(() => new Pcg32(2 ** 53 + 2)).toThrow(RangeError);
    expect(() => new Pcg32(1.5)).toThrow(RangeError);
    expect(() => new Pcg32(Number.NaN)).toThrow(RangeError);
  });
});

describe('Pcg32 — nextFloat', () => {
  it('stays in [0, 1)', () => {
    const rng = new Pcg32(11, 11);
    let low = 1;
    let high = 0;
    for (let i = 0; i < 200_000; i += 1) {
      const u = rng.nextFloat();
      if (u < low) low = u;
      if (u > high) high = u;
    }
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThan(1);
    // Both ends of the interval are actually approached.
    expect(low).toBeLessThan(0.0001);
    expect(high).toBeGreaterThan(0.9999);
  });

  it('has mean ~0.5 over 100k draws', () => {
    const values = draw(new Pcg32(2718, 1), 100_000, (r) => r.nextFloat());
    expect(mean(values)).toBeCloseTo(0.5, 2);
  });

  it('has the uniform variance 1/12', () => {
    const values = draw(new Pcg32(1618, 2), 100_000, (r) => r.nextFloat());
    expect(stdDev(values) ** 2).toBeCloseTo(1 / 12, 2);
  });

  it('fills all ten deciles roughly evenly', () => {
    const rng = new Pcg32(1414, 3);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i += 1) {
      const bucket = Math.min(9, Math.floor(rng.nextFloat() * 10));
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count / n).toBeCloseTo(0.1, 2);
    }
  });

  it('resolves finer than 2^-32, confirming the 53-bit construction', () => {
    // With 32-bit floats the value is always a multiple of 2^-32; scaling by 2^32 would
    // leave an integer every time.
    const rng = new Pcg32(6, 6);
    const hasSubUint32Detail = Array.from({ length: 100 }, () => rng.nextFloat()).some(
      (u) => !Number.isInteger(u * 2 ** 32),
    );
    expect(hasSubUint32Detail).toBe(true);
  });
});

describe('Pcg32 — nextInt / nextIntInclusive', () => {
  it('stays within [min, max)', () => {
    const rng = new Pcg32(77, 7);
    const seen = new Set<number>();
    for (let i = 0; i < 50_000; i += 1) {
      seen.add(rng.nextInt(3, 11));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('is unbiased across a non-power-of-two range', () => {
    const rng = new Pcg32(555, 5);
    const counts = new Map<number, number>();
    const n = 210_000;
    for (let i = 0; i < n; i += 1) {
      const v = rng.nextInt(0, 7);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect(counts.size).toBe(7);
    for (const count of counts.values()) {
      expect(count / n).toBeCloseTo(1 / 7, 2);
    }
  });

  it('handles a power-of-two range (no rejection path)', () => {
    const rng = new Pcg32(1024, 4);
    const counts = new Array<number>(8).fill(0);
    const n = 80_000;
    for (let i = 0; i < n; i += 1) {
      const v = rng.nextInt(0, 8);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count / n).toBeCloseTo(0.125, 2);
    }
  });

  it('handles a single-value range and negative bounds', () => {
    const rng = new Pcg32(3, 3);
    expect(rng.nextInt(5, 6)).toBe(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      seen.add(rng.nextInt(-10, -5));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-10, -9, -8, -7, -6]);
  });

  it('covers both endpoints of nextIntInclusive', () => {
    const rng = new Pcg32(21, 12);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      seen.add(rng.nextIntInclusive(1, 4));
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect(rng.nextIntInclusive(9, 9)).toBe(9);
  });

  it('rejects invalid bounds', () => {
    const rng = new Pcg32(1, 1);
    expect(() => rng.nextInt(5, 5)).toThrow(RangeError);
    expect(() => rng.nextInt(5, 4)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 4)).toThrow(RangeError);
    expect(() => rng.nextInt(0, 2 ** 32 + 1)).toThrow(RangeError);
    expect(() => rng.nextIntInclusive(4, 3)).toThrow(RangeError);
  });
});

describe('Pcg32 — bernoulli', () => {
  it('hits the requested probability', () => {
    const rng = new Pcg32(60, 6);
    const n = 100_000;
    let hits = 0;
    for (let i = 0; i < n; i += 1) {
      if (rng.bernoulli(0.3)) hits += 1;
    }
    expect(hits / n).toBeCloseTo(0.3, 2);
  });

  it('is degenerate at the endpoints but still consumes exactly one draw', () => {
    const always = new Pcg32(1, 1);
    const never = new Pcg32(1, 1);
    const control = new Pcg32(1, 1);
    for (let i = 0; i < 100; i += 1) {
      expect(always.bernoulli(1)).toBe(true);
      expect(never.bernoulli(0)).toBe(false);
      control.nextFloat();
    }
    // All three consumed 100 nextFloat()s, so all three sit at the same position.
    expect(always.getState()).toEqual(control.getState());
    expect(never.getState()).toEqual(control.getState());
  });
});

describe('Pcg32 — normal', () => {
  it('has approximately the requested mean and stdDev', () => {
    const values = draw(new Pcg32(314159, 1), 200_000, (r) => r.normal(75, 15));
    expect(mean(values)).toBeCloseTo(75, 0);
    expect(stdDev(values)).toBeGreaterThan(14.5);
    expect(stdDev(values)).toBeLessThan(15.5);
  });

  it('defaults to the standard normal', () => {
    const values = draw(new Pcg32(271828, 2), 200_000, (r) => r.normal());
    expect(Math.abs(mean(values))).toBeLessThan(0.02);
    expect(stdDev(values)).toBeGreaterThan(0.97);
    expect(stdDev(values)).toBeLessThan(1.03);
  });

  it('puts roughly 68% within one sigma and 95% within two', () => {
    const values = draw(new Pcg32(4, 4), 200_000, (r) => r.normal(0, 1));
    const within = (k: number): number =>
      values.filter((v) => Math.abs(v) <= k).length / values.length;
    expect(within(1)).toBeCloseTo(0.6827, 2);
    expect(within(2)).toBeCloseTo(0.9545, 2);
  });

  it('produces only finite values', () => {
    const values = draw(new Pcg32(13, 13), 200_000, (r) => r.normal(0, 1));
    expect(values.every(Number.isFinite)).toBe(true);
  });

  it('consumes exactly two nextFloat() draws per call, independent of the outcome', () => {
    const viaNormal = new Pcg32(1, 1);
    const viaFloat = new Pcg32(1, 1);
    for (let i = 0; i < 500; i += 1) {
      viaNormal.normal(10, 3);
      viaFloat.nextFloat();
      viaFloat.nextFloat();
    }
    expect(viaNormal.getState()).toEqual(viaFloat.getState());
  });

  it('collapses to the mean when stdDev is zero, and rejects a negative stdDev', () => {
    const rng = new Pcg32(2, 2);
    expect(rng.normal(42, 0)).toBe(42);
    expect(() => rng.normal(0, -1)).toThrow(RangeError);
    expect(() => rng.normal(Number.NaN, 1)).toThrow(RangeError);
  });
});

describe('Pcg32 — exponential', () => {
  it.each([0.25, 1, 4])('has mean ~1/rate for rate=%s', (rate) => {
    const values = draw(new Pcg32(9000 + rate * 100, 1), 200_000, (r) => r.exponential(rate));
    expect(mean(values)).toBeCloseTo(1 / rate, 1);
  });

  it('has stdDev equal to its mean, as an exponential must', () => {
    const values = draw(new Pcg32(1717, 1), 200_000, (r) => r.exponential(2));
    expect(stdDev(values) / mean(values)).toBeCloseTo(1, 1);
  });

  it('matches the exponential survival function at the median', () => {
    const rate = 3;
    const values = draw(new Pcg32(606, 6), 200_000, (r) => r.exponential(rate));
    const median = Math.LN2 / rate;
    const below = values.filter((v) => v < median).length / values.length;
    expect(below).toBeCloseTo(0.5, 2);
  });

  it('is non-negative and finite', () => {
    const values = draw(new Pcg32(55, 5), 200_000, (r) => r.exponential(1.5));
    expect(values.every((v) => v >= 0 && Number.isFinite(v))).toBe(true);
  });

  it('rejects a non-positive or non-finite rate', () => {
    const rng = new Pcg32(1, 1);
    expect(() => rng.exponential(0)).toThrow(RangeError);
    expect(() => rng.exponential(-1)).toThrow(RangeError);
    expect(() => rng.exponential(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
