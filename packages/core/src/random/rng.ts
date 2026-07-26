/**
 * PCG32 — a seedable, statistically sound pseudo-random generator.
 *
 * Algorithm: `pcg_setseq_64_xsh_rr_32` (O'Neill 2014). A 64-bit LCG state whose output is
 * permuted by an xorshift followed by a data-dependent rotate. It passes TestU01 BigCrush,
 * has a 2^64 period per stream, and — the property this project actually needs — supports
 * 2^63 provably distinct streams selected by the increment.
 *
 * Why not the obvious alternatives:
 * - `Math.random()` cannot be seeded, so nothing replays. Forbidden by CLAUDE.md invariant 2.
 * - A bare LCG has famously bad low bits and lattice structure in successive tuples, which
 *   would show up directly in correlated inter-arrival times and floor choices.
 * - `xoshiro256++` is equally good quality but has no cheap stream-selection mechanism; you
 *   have to jump the state, which makes per-source stream derivation clumsier.
 *
 * ## Implementation note: no BigInt in the hot path
 *
 * The 64-bit LCG step is implemented with 32-bit limbs (`Math.imul` plus 16-bit partial
 * products) rather than `BigInt`, because draws happen millions of times per replication.
 * `rng.test.ts` cross-checks every output against a straightforward `BigInt` reference
 * implementation of the same algorithm, and against the published PCG reference vector for
 * `(initstate=42, initseq=54)`.
 *
 * ## State and purity
 *
 * A generator is a mutable object — drawing advances it. There is no module-level state and
 * no shared instance: everything is reachable only through an explicitly constructed
 * generator, per CLAUDE.md invariant 2. `getState()`/`fromState()`/`clone()` make the state
 * fully observable and restorable so a run can be snapshotted or replayed.
 */

/** 2^32, as a float. Used for exact carry arithmetic, never as a bit mask. */
const TWO_32 = 4294967296;

/** 2^53, the float mantissa span used to build a full-precision double. */
const TWO_53 = 9007199254740992;

/** 2^26, the shift used when combining two 32-bit draws into a 53-bit double. */
const TWO_26 = 67108864;

/** PCG multiplier 6364136223846793005 = 0x5851F42D4C957F2D, split into 32-bit halves. */
const MULT_HI = 0x5851f42d;
const MULT_LO = 0x4c957f2d;

/**
 * Fully describes a generator's position in its stream.
 *
 * Four unsigned 32-bit integers: the 64-bit LCG state and the 64-bit increment (which
 * selects the stream and is always odd), each as a `[hi, lo]` pair. Plain numbers rather
 * than `bigint` so a snapshot survives `JSON.stringify` unchanged.
 */
export interface RngState {
  readonly stateHi: number;
  readonly stateLo: number;
  readonly incHi: number;
  readonly incLo: number;
}

/**
 * A single independent random stream.
 *
 * Obtained from a {@link StreamSet}, never constructed ad hoc inside simulation code — one
 * stream per stochastic source is what keeps common random numbers synchronized.
 */
export interface Rng {
  /** Uniform unsigned 32-bit integer in `[0, 2^32)`. The primitive draw; everything else composes from it. */
  nextUint32(): number;

  /** Uniform double in `[0, 1)` with full 53-bit resolution. Consumes two `nextUint32()` draws. */
  nextFloat(): number;

  /** Uniform integer in `[minInclusive, maxExclusive)`. Rejection-sampled, so unbiased for every range. */
  nextInt(minInclusive: number, maxExclusive: number): number;

  /** Uniform integer in `[min, max]`, both endpoints reachable. */
  nextIntInclusive(min: number, max: number): number;

  /** `true` with probability `p`. `p <= 0` is always `false`; `p >= 1` is always `true`. */
  bernoulli(p: number): boolean;

  /**
   * Normal (Gaussian) draw. Box–Muller, consuming exactly two `nextFloat()` calls per draw —
   * no cached spare value, so the number of draws consumed is a pure function of the number
   * of calls and `getState()` describes the generator completely.
   */
  normal(mean?: number, stdDev?: number): number;

  /** Exponential draw with the given rate (`lambda`); mean is `1 / rate`. */
  exponential(rate?: number): number;

  /** An independent generator at this generator's exact current position. Neither affects the other afterwards. */
  clone(): Rng;

  /** A serializable snapshot of the current position. */
  getState(): RngState;
}

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= TWO_32) {
    throw new RangeError(`${label} must be an integer in [0, 2^32); received ${value}`);
  }
}

/** Normalize a seed to an unsigned 64-bit `bigint`. Negative and oversized values wrap. */
function toUint64(value: number | bigint, label: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${label} must be a safe integer or a bigint; received ${value}`);
    }
    return BigInt.asUintN(64, BigInt(value));
  }
  return BigInt.asUintN(64, value);
}

/**
 * PCG32 generator.
 *
 * Construct with an initial state and a stream selector. Two generators sharing a state seed
 * but differing in stream selector emit provably different sequences, which is what
 * {@link StreamSet} relies on.
 */
export class Pcg32 implements Rng {
  #stateHi: number;
  #stateLo: number;
  #incHi: number;
  #incLo: number;

  /**
   * @param seed      Initial 64-bit state (`initstate` in the PCG reference).
   * @param streamId  Stream selector (`initseq` in the PCG reference). Distinct values give
   *                  distinct, non-overlapping-by-construction sequences.
   */
  constructor(seed: number | bigint, streamId: number | bigint = 0) {
    const state = toUint64(seed, 'seed');
    const seq = toUint64(streamId, 'streamId');

    // inc = (seq << 1) | 1 — always odd, which is what gives the LCG its full 2^64 period.
    const inc = BigInt.asUintN(64, (seq << 1n) | 1n);
    this.#incHi = Number(inc >> 32n);
    this.#incLo = Number(inc & 0xffffffffn);

    // PCG's standard seeding routine: zero, step, add the seed, step again.
    this.#stateHi = 0;
    this.#stateLo = 0;
    this.#step();
    this.#add(Number(state >> 32n), Number(state & 0xffffffffn));
    this.#step();
  }

  /** Rebuild a generator from a snapshot produced by {@link Pcg32.getState}. */
  static fromState(state: RngState): Pcg32 {
    assertUint32(state.stateHi, 'stateHi');
    assertUint32(state.stateLo, 'stateLo');
    assertUint32(state.incHi, 'incHi');
    assertUint32(state.incLo, 'incLo');
    if ((state.incLo & 1) !== 1) {
      throw new RangeError('incLo must be odd; a PCG increment is always odd');
    }
    const rng = new Pcg32(0, 0);
    rng.setState(state);
    return rng;
  }

  /** Add a 64-bit value to the state, in 32-bit limbs. */
  #add(hi: number, lo: number): void {
    const sum = this.#stateLo + lo;
    this.#stateLo = sum >>> 0;
    this.#stateHi = (this.#stateHi + hi + (sum >= TWO_32 ? 1 : 0)) >>> 0;
  }

  /**
   * One LCG step: `state = state * MULT + inc` (mod 2^64), in 32-bit limbs.
   *
   * The low 32 bits of the product need exact 32x32 multiplication, which exceeds the float
   * mantissa, so it is done in 16-bit partial products. The high 32 bits only need the
   * product modulo 2^32, which `Math.imul` gives directly.
   */
  #step(): void {
    const sHi = this.#stateHi;
    const sLo = this.#stateLo;

    const a0 = sLo & 0xffff;
    const a1 = sLo >>> 16;
    const b0 = MULT_LO & 0xffff;
    const b1 = MULT_LO >>> 16;

    const p00 = a0 * b0;
    const p11 = a1 * b1;
    const mid = a0 * b1 + a1 * b0; // < 2^33, exact
    const lowSum = p00 + (mid & 0xffff) * 0x10000; // < 2^33, exact

    const lo = lowSum >>> 0;
    const carry = lowSum >= TWO_32 ? 1 : 0;

    // Math.imul returns a signed int32, but `>>> 0` on the sum still yields the correct
    // value modulo 2^32, and the intermediate sum stays well inside the safe-integer range.
    const hi =
      (p11 + Math.floor(mid / 0x10000) + carry + Math.imul(sHi, MULT_LO) + Math.imul(sLo, MULT_HI)) >>> 0;

    // + inc
    const sum = lo + this.#incLo;
    this.#stateLo = sum >>> 0;
    this.#stateHi = (hi + this.#incHi + (sum >= TWO_32 ? 1 : 0)) >>> 0;
  }

  nextUint32(): number {
    const oldHi = this.#stateHi;
    const oldLo = this.#stateLo;
    this.#step();

    // xorshifted = (uint32) (((old >> 18) ^ old) >> 27)
    const shHi = oldHi >>> 18;
    const shLo = ((oldHi << 14) | (oldLo >>> 18)) >>> 0;
    const xHi = (shHi ^ oldHi) >>> 0;
    const xLo = (shLo ^ oldLo) >>> 0;
    const xorshifted = ((xHi << 5) | (xLo >>> 27)) >>> 0;

    // rot = (uint32) (old >> 59); rotate right.
    const rot = oldHi >>> 27;
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  nextFloat(): number {
    // 53 significant bits: 27 from the first draw, 26 from the second. Dropping the low bits
    // of each draw is the conventional construction and costs nothing here — PCG's output
    // bits are all equally good.
    const a = this.nextUint32() >>> 5;
    const b = this.nextUint32() >>> 6;
    return (a * TWO_26 + b) / TWO_53;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new RangeError(
        `nextInt bounds must be integers; received [${minInclusive}, ${maxExclusive})`,
      );
    }
    const range = maxExclusive - minInclusive;
    if (range <= 0) {
      throw new RangeError(
        `nextInt requires maxExclusive > minInclusive; received [${minInclusive}, ${maxExclusive})`,
      );
    }
    if (range > TWO_32) {
      throw new RangeError(`nextInt range must not exceed 2^32; received ${range}`);
    }
    if (range === TWO_32) {
      return minInclusive + this.nextUint32();
    }

    // Rejection sampling. Naive `% range` biases the low residues whenever range does not
    // divide 2^32; discarding the ragged tail removes that exactly. For power-of-two ranges
    // the limit is 2^32 and nothing is ever rejected.
    const limit = TWO_32 - (TWO_32 % range);
    let draw = this.nextUint32();
    while (draw >= limit) {
      draw = this.nextUint32();
    }
    return minInclusive + (draw % range);
  }

  nextIntInclusive(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`nextIntInclusive bounds must be integers; received [${min}, ${max}]`);
    }
    if (max < min) {
      throw new RangeError(`nextIntInclusive requires max >= min; received [${min}, ${max}]`);
    }
    return this.nextInt(min, max + 1);
  }

  bernoulli(p: number): boolean {
    if (Number.isNaN(p)) {
      throw new RangeError('bernoulli probability must not be NaN');
    }
    // Always consume exactly one nextFloat() so draw counts stay independent of p — a
    // short-circuit here would desynchronize streams between two configurations under CRN.
    const u = this.nextFloat();
    return u < p;
  }

  normal(mean = 0, stdDev = 1): number {
    if (!Number.isFinite(mean) || !Number.isFinite(stdDev)) {
      throw new RangeError(`normal requires finite parameters; received (${mean}, ${stdDev})`);
    }
    if (stdDev < 0) {
      throw new RangeError(`normal requires stdDev >= 0; received ${stdDev}`);
    }
    // Box–Muller. `1 - nextFloat()` moves the uniform into (0, 1] so the log is never -Inf.
    const u1 = 1 - this.nextFloat();
    const u2 = this.nextFloat();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  exponential(rate = 1): number {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError(`exponential requires a finite rate > 0; received ${rate}`);
    }
    return -Math.log(1 - this.nextFloat()) / rate;
  }

  clone(): Pcg32 {
    const copy = new Pcg32(0, 0);
    copy.#stateHi = this.#stateHi;
    copy.#stateLo = this.#stateLo;
    copy.#incHi = this.#incHi;
    copy.#incLo = this.#incLo;
    return copy;
  }

  getState(): RngState {
    return Object.freeze({
      stateHi: this.#stateHi,
      stateLo: this.#stateLo,
      incHi: this.#incHi,
      incLo: this.#incLo,
    });
  }

  /**
   * Restore a previously captured position, in place.
   *
   * Deliberately not on the {@link Rng} interface: simulation code should only ever draw from
   * a stream. This exists for replay and for {@link StreamSet.clone}.
   */
  setState(state: RngState): void {
    assertUint32(state.stateHi, 'stateHi');
    assertUint32(state.stateLo, 'stateLo');
    assertUint32(state.incHi, 'incHi');
    assertUint32(state.incLo, 'incLo');
    if ((state.incLo & 1) !== 1) {
      throw new RangeError('incLo must be odd; a PCG increment is always odd');
    }
    this.#stateHi = state.stateHi;
    this.#stateLo = state.stateLo;
    this.#incHi = state.incHi;
    this.#incLo = state.incLo;
  }
}
