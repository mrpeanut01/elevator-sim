/**
 * Shared fixtures for `tuning/report`'s tests.
 *
 * Not a `*.test.ts` file on purpose: vitest's `include` is `src/**\/*.test.ts`, so a helper named
 * this way is imported by tests and never collected as a suite. Same convention as
 * `reports/fixtures.test-helper.ts`.
 *
 * ## Everything here is synthetic, and that is the point
 *
 * The claims this module makes — a front with a known non-dominated subset, a candidate that is
 * overfitted *by construction*, a pair whose difference is provably inside the noise floor — cannot
 * be demonstrated with a simulation, because a simulation does not come with a known answer. A
 * fixture built from literals does. `reports/fixtures.test-helper.ts` makes the same split for the
 * same reason and its `observation()` is the model for {@link observation} here.
 */

import type { CandidateEvaluation, SeedSetEvaluation, TuningObservation } from './types.js';

/**
 * One replication's headline numbers, from literals.
 *
 * Defaults describe an unremarkable valid replication. Every field is overridable, including the
 * validity flags and the energy proxy, so a test can construct the exact situation it is about.
 */
export function observation(
  seed: string | number,
  overrides: Partial<TuningObservation> = {},
): TuningObservation {
  const seedText = String(seed);
  return {
    runId: `run-${seedText}`,
    seed: seedText,
    windowSeconds: 300,
    arrivals: 120,
    served: 120,
    unserved: 0,
    awtS: 16,
    wt95S: 32,
    pctOverLongWait: 1,
    ttdS: 45,
    achievedIntervalS: 25,
    personsPer5Min: 60,
    saturated: false,
    awtIsValid: true,
    ...overrides,
  };
}

export interface SeriesRequest {
  readonly seedSetId: string;
  readonly role: 'tuning' | 'holdout';
  readonly seeds: readonly (string | number)[];
  /** One AWT per seed. */
  readonly awt: readonly number[];
  /** One WT95 per seed. Defaults to `2 × awt`, which keeps the two axes correlated as they are. */
  readonly wt95?: readonly number[] | undefined;
  /** One energy proxy per seed. Omit to leave the axis unmeasured, as the simulator does today. */
  readonly energy?: readonly number[] | undefined;
  readonly overrides?: Partial<TuningObservation> | undefined;
}

/** A seed set's worth of replications, one per seed. */
export function series(request: SeriesRequest): SeedSetEvaluation {
  return {
    seedSetId: request.seedSetId,
    role: request.role,
    observations: request.seeds.map((seed, index) => {
      const awtS = request.awt[index] as number;
      const wt95S = request.wt95?.[index] ?? awtS * 2;
      const energy = request.energy?.[index];
      return observation(seed, {
        awtS,
        wt95S,
        ...(energy === undefined ? {} : { energyProxy: energy }),
        ...(request.overrides ?? {}),
      });
    }),
  };
}

/** Twelve tuning seeds and twelve disjoint holdout seeds. Enough for a `t(11)` interval. */
export const TUNING_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
export const HOLDOUT_SEEDS: readonly number[] = Object.freeze([
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
]);

/**
 * A gently varying AWT series around `base`, deterministic and with no RNG.
 *
 * CLAUDE.md invariant 2 forbids a global RNG anywhere in this project, and a fixture that reached
 * for `Math.random()` would also make a failing statistical assertion unreproducible. The wobble is
 * a fixed pattern so every series is paired with every other by construction, which is what a
 * common-random-numbers comparison needs.
 */
export function wobble(base: number, count: number, amplitude = 0.6): readonly number[] {
  const pattern = [0, 1, -1, 0.5, -0.5, 0.75, -0.75, 0.25, -0.25, 1, -1, 0];
  return Array.from(
    { length: count },
    (_unused, index) => base + amplitude * (pattern[index % pattern.length] as number),
  );
}

export interface CandidateRequest {
  readonly candidateId: string;
  readonly tuningAwt: readonly number[];
  readonly holdoutAwt?: readonly number[] | undefined;
  readonly tuningWt95?: readonly number[] | undefined;
  readonly holdoutWt95?: readonly number[] | undefined;
  readonly tuningEnergy?: readonly number[] | undefined;
  readonly holdoutEnergy?: readonly number[] | undefined;
  readonly parameters?: Readonly<Record<string, number | string | boolean>> | undefined;
  readonly tuningSeeds?: readonly (string | number)[] | undefined;
  readonly holdoutSeeds?: readonly (string | number)[] | undefined;
}

/** One candidate on the standard disjoint seed sets. */
export function candidate(request: CandidateRequest): CandidateEvaluation {
  const tuningSeeds = request.tuningSeeds ?? TUNING_SEEDS;
  const holdoutSeeds = request.holdoutSeeds ?? HOLDOUT_SEEDS;
  return {
    candidateId: request.candidateId,
    ...(request.parameters === undefined ? {} : { parameters: request.parameters }),
    tuning: series({
      seedSetId: 'tune-a',
      role: 'tuning',
      seeds: tuningSeeds.slice(0, request.tuningAwt.length),
      awt: request.tuningAwt,
      ...(request.tuningWt95 === undefined ? {} : { wt95: request.tuningWt95 }),
      ...(request.tuningEnergy === undefined ? {} : { energy: request.tuningEnergy }),
    }),
    ...(request.holdoutAwt === undefined
      ? {}
      : {
          holdout: series({
            seedSetId: 'hold-b',
            role: 'holdout',
            seeds: holdoutSeeds.slice(0, request.holdoutAwt.length),
            awt: request.holdoutAwt,
            ...(request.holdoutWt95 === undefined ? {} : { wt95: request.holdoutWt95 }),
            ...(request.holdoutEnergy === undefined ? {} : { energy: request.holdoutEnergy }),
          }),
        }),
  };
}

/** `a[i] + delta` for every element — a candidate offset from another by a known amount. */
export function shift(values: readonly number[], delta: number): readonly number[] {
  return values.map((value) => value + delta);
}
