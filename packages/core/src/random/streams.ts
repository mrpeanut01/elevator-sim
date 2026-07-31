/**
 * Per-source random streams derived from a single master seed.
 *
 * This is CLAUDE.md invariant 2 made concrete. With one global generator, a dispatcher that
 * causes one extra door reopen shifts every subsequent draw, and two runs that were supposed
 * to see the same passengers diverge into entirely different populations — common random
 * numbers are destroyed and every paired comparison loses 5–20x of its power. With one
 * stream per stochastic source, the arrival stream emits an identical passenger list no
 * matter what the elevators do.
 *
 * The independence guarantee this module exists to provide:
 *
 *   > Consuming any number of values from one stream leaves every other stream's sequence
 *   > bit-identical to a freshly constructed `StreamSet` with the same master seed.
 *
 * `streams.test.ts` asserts exactly that, for every stream, in both directions.
 *
 * ## How streams are separated
 *
 * Each stream's PCG parameters are derived from `(masterSeed, streamName)`:
 *
 *   1. FNV-1a-64 over the name's UTF-8-ish bytes gives a well-spread 64-bit name digest.
 *   2. That digest is XORed into the master seed and fed to SplitMix64.
 *   3. Two SplitMix64 outputs become the stream's `initstate` and `initseq`.
 *
 * SplitMix64 has full avalanche, so a one-character difference in a stream name — or a
 * one-bit difference in the master seed — produces unrelated parameters. Because the streams
 * differ in `initseq`, PCG guarantees they are genuinely distinct sequences rather than
 * offsets into one sequence. Derivation runs once per stream at construction, so `bigint`
 * arithmetic here costs nothing at draw time.
 */

import { Pcg32, type Rng, type RngState } from './rng.js';

const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit parameters. */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/** SplitMix64 constants (Steele, Lea & Flood 2014). */
const SPLITMIX_GAMMA = 0x9e3779b97f4a7c15n;
const SPLITMIX_MIX_1 = 0xbf58476d1ce4e5b9n;
const SPLITMIX_MIX_2 = 0x94d049bb133111ebn;

/**
 * The stochastic sources this simulator models, from docs/01-architecture.md § Determinism.
 *
 * Adding a source means adding a name here — never reusing an existing stream, which would
 * couple two sources and reintroduce the desynchronization this module prevents.
 */
export const STREAM_NAMES = [
  'arrivals',
  'origins',
  'destinations',
  'passengerMass',
  'doorObstruction',
  'policyNoise',
] as const;

export type StreamName = (typeof STREAM_NAMES)[number];

/** The PCG parameters a given `(masterSeed, streamName)` pair maps to. */
export interface StreamSeed {
  readonly initState: bigint;
  readonly initSeq: bigint;
}

/** A diagnostic snapshot: where every stream currently sits, plus the seed that produced them. */
export interface StreamSetSnapshot {
  /** Decimal string, because a `bigint` does not survive `JSON.stringify`. */
  readonly masterSeed: string;
  /**
   * Decimal string, present only when the set was built with one.
   *
   * Absent rather than equal to `masterSeed` when unset: "there was no traffic seed" and "the
   * traffic seed happened to match the run seed" are different runs, and a snapshot that conflated
   * them would replay one as the other.
   */
  readonly trafficSeed?: string;
  readonly streams: Readonly<Record<string, RngState>>;
}

/** FNV-1a over the string's bytes (low byte then high byte of each UTF-16 code unit). */
function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK_64;
    hash = ((hash ^ BigInt(unit >>> 8)) * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/** One SplitMix64 output from the given internal state; returns the output and the next state. */
function splitMix64(state: bigint): { value: bigint; next: bigint } {
  const next = (state + SPLITMIX_GAMMA) & MASK_64;
  let z = next;
  z = ((z ^ (z >> 30n)) * SPLITMIX_MIX_1) & MASK_64;
  z = ((z ^ (z >> 27n)) * SPLITMIX_MIX_2) & MASK_64;
  return { value: (z ^ (z >> 31n)) & MASK_64, next };
}

/** Normalize a seed to unsigned 64-bit. Negative and oversized values wrap rather than throw. */
export function normalizeSeed(seed: number | bigint): bigint {
  if (typeof seed === 'number') {
    if (!Number.isSafeInteger(seed)) {
      throw new RangeError(`Master seed must be a safe integer or a bigint; received ${seed}`);
    }
    return BigInt.asUintN(64, BigInt(seed));
  }
  return BigInt.asUintN(64, seed);
}

/**
 * Map `(masterSeed, streamName)` to a stream's PCG parameters.
 *
 * Pure and total: the same pair always yields the same parameters, on any platform, forever.
 * Exported because reproducibility of this mapping is part of the module's contract — a
 * stored run record replays only if this function is stable.
 *
 * That contract is enforced, not merely documented: `streams.test.ts` pins golden vectors for
 * this mapping (see "COMPATIBILITY LOCK"). Any edit here or to {@link fnv1a64},
 * {@link splitMix64}, {@link normalizeSeed} or the FNV/SplitMix constants that moves those
 * numbers invalidates every run record already persisted, and is a versioned data-format
 * break rather than a refactor.
 */
export function deriveStreamSeed(masterSeed: number | bigint, streamName: string): StreamSeed {
  const seed = normalizeSeed(masterSeed);
  let state = BigInt.asUintN(64, seed ^ fnv1a64(streamName));

  const first = splitMix64(state);
  state = first.next;
  const second = splitMix64(state);

  return { initState: first.value, initSeq: second.value };
}

/**
 * The streams that describe **who turns up**, as opposed to how the machine behaves.
 *
 * The split is the whole content of {@link StreamSetOptions.trafficSeed}: give these four a
 * separate seed and you can re-roll the crowd while the building, the doors and the dispatcher's
 * own noise stay exactly where they were — or hold the crowd and change the machine, which is
 * common random numbers expressed as a knob rather than as a convention.
 *
 * `doorObstruction` is deliberately **not** here. An obstruction is a property of the door and the
 * moment, not of the person: putting it on the traffic seed would mean "the same crowd" also meant
 * "the same doors jamming", and the two questions would stop being separable.
 */
const TRAFFIC_STREAM_NAMES: ReadonlySet<string> = new Set([
  'arrivals',
  'origins',
  'destinations',
  'passengerMass',
]);

/** Optional second seed, for separating demand from machine. See {@link StreamSet}. */
export interface StreamSetOptions {
  /**
   * Seeds the demand-side streams ({@link TRAFFIC_STREAM_NAMES}) independently of the run seed.
   *
   * **Omit it and nothing changes.** Every stream then derives from the master seed exactly as it
   * did before this option existed, which is what keeps every pinned figure and both identity
   * digests reproducing byte for byte (docs/14 § 0).
   */
  readonly trafficSeed?: number | bigint | undefined;
}

/**
 * The six named streams required by the architecture, plus on-demand derivation for any
 * additional source.
 *
 * Construct one per replication and inject it. Never create generators inline in simulation
 * code, and never share a stream between two sources.
 *
 * ```ts
 * const streams = new StreamSet(20260725);
 * const gapSeconds = streams.arrivals.exponential(lambda);
 * const massKg = streams.passengerMass.normal(75, 15);
 * ```
 *
 * For common random numbers, hand every candidate configuration a `new StreamSet(sameSeed)`.
 * Each will see the identical passenger trace regardless of how differently the cars behave.
 *
 * ## Two seeds, when you want to vary one thing at a time
 *
 * A second, optional seed splits *who turns up* from *how the machine behaves*
 * ({@link StreamSetOptions.trafficSeed}):
 *
 * ```ts
 * new StreamSet(runSeed, { trafficSeed: 7 });  // same building, a different Tuesday
 * new StreamSet(otherRunSeed, { trafficSeed: 7 });  // the same Tuesday, a different machine
 * ```
 *
 * Omit it and every stream derives from the master seed exactly as before, which is what keeps
 * every published figure reproducing (docs/14 § 0).
 */
export class StreamSet {
  /** The seed this set was built from. Persist it with every run record (invariant 5). */
  readonly masterSeed: bigint;

  /**
   * The demand-side seed, when one was given.
   *
   * `undefined` means the demand streams derive from {@link masterSeed}, which is the default and
   * the pre-existing behaviour. **When it is set, invariant 5 requires both seeds on the run
   * record** — a record carrying only the master seed cannot replay a run whose crowd came from
   * somewhere else, and that is a corrupt record rather than a terse one.
   */
  readonly trafficSeed: bigint | undefined;

  /** Passenger arrival times. */
  readonly arrivals: Rng;
  /** Origin floor selection. */
  readonly origins: Rng;
  /** Destination floor selection. */
  readonly destinations: Rng;
  /** Body mass, which is what the car's load sensor actually measures. */
  readonly passengerMass: Rng;
  /** Door reopen / obstruction events. */
  readonly doorObstruction: Rng;
  /** Stochastic dispatcher exploration. */
  readonly policyNoise: Rng;

  readonly #streams = new Map<string, Pcg32>();

  constructor(seed: number | bigint, options: StreamSetOptions = {}) {
    this.masterSeed = normalizeSeed(seed);
    this.trafficSeed =
      options.trafficSeed === undefined ? undefined : normalizeSeed(options.trafficSeed);

    this.arrivals = this.#derive('arrivals');
    this.origins = this.#derive('origins');
    this.destinations = this.#derive('destinations');
    this.passengerMass = this.#derive('passengerMass');
    this.doorObstruction = this.#derive('doorObstruction');
    this.policyNoise = this.#derive('policyNoise');
  }

  /** Typed accessor for the required streams. Returns the same instance as the property. */
  stream(name: StreamName): Rng {
    return this.#derive(name);
  }

  /**
   * Get (creating on first use) a stream for a source outside the required six.
   *
   * Memoized, so repeated calls with the same name return the same generator rather than
   * restarting the sequence. Prefer adding the name to {@link STREAM_NAMES} once a source is
   * a permanent part of the model.
   */
  derive(name: string): Rng {
    return this.#derive(name);
  }

  /** Names of every stream materialized so far, in creation order. */
  streamNames(): readonly string[] {
    return [...this.#streams.keys()];
  }

  /**
   * An independent copy with every stream at its current position.
   *
   * For branching a run mid-flight. To *replay* a run, construct a fresh `StreamSet` from the
   * stored seed instead — that is the sanctioned path and it needs no snapshot.
   */
  clone(): StreamSet {
    // Both seeds, or the copy would silently re-derive the demand streams from the master seed and
    // branch into a different crowd — the one failure a clone must not have.
    const copy = new StreamSet(
      this.masterSeed,
      this.trafficSeed === undefined ? {} : { trafficSeed: this.trafficSeed },
    );
    for (const [name, rng] of this.#streams) {
      copy.#derive(name).setState(rng.getState());
    }
    return copy;
  }

  /** Diagnostic snapshot of the seed and every materialized stream's position. */
  snapshot(): StreamSetSnapshot {
    const streams: Record<string, RngState> = {};
    for (const [name, rng] of this.#streams) {
      streams[name] = rng.getState();
    }
    return Object.freeze({
      masterSeed: this.masterSeed.toString(),
      ...(this.trafficSeed === undefined ? {} : { trafficSeed: this.trafficSeed.toString() }),
      streams: Object.freeze(streams),
    });
  }

  /**
   * Which seed a stream derives from.
   *
   * Returns {@link masterSeed} for every stream unless a traffic seed was supplied *and* the stream
   * is a demand stream — so with no traffic seed this is the identity function on the old
   * behaviour, and byte-identity is structural rather than tested for.
   */
  #seedFor(name: string): bigint {
    return this.trafficSeed !== undefined && TRAFFIC_STREAM_NAMES.has(name)
      ? this.trafficSeed
      : this.masterSeed;
  }

  #derive(name: string): Pcg32 {
    const existing = this.#streams.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (name.length === 0) {
      throw new RangeError('Stream name must not be empty');
    }
    const { initState, initSeq } = deriveStreamSeed(this.#seedFor(name), name);
    const rng = new Pcg32(initState, initSeq);
    this.#streams.set(name, rng);
    return rng;
  }
}
