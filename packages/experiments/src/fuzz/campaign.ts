/// <reference types="node" />

/**
 * Running many cases, and saying what it cost.
 *
 * ## The always-on / deep split, stated rather than capped
 *
 * `CLAUDE.md` budgets 50–200 replications for a *comparison*; a fuzz campaign is not a
 * comparison and its budget is wall clock. The full suite is ~200 s of CI time on an idle
 * machine, and a fuzz track that added ten minutes would be disabled within a week and would
 * then protect nothing. So the campaign runs at two sizes:
 *
 * - **always-on** — {@link STANDARD_CORPUS}, a pinned list of seeds in {@link STANDARD_SPACE}.
 *   Every topology, both entrance arrangements, access zones with and without a credential at
 *   the landing, both extremes of floor pitch, single-car banks, the two-floor building, cars
 *   that start the run out of group control, and mid-run service-mode schedules.
 *   What it does **not** cover is stated on the corpus itself, asserted by `generate.test.ts`,
 *   and repeated in the report.
 * - **deep** — {@link DEEP_SPACE}, opt-in via `ELEVATOR_SIM_FUZZ=deep`, hundreds of cases up to
 *   40 floors, 28 %/5 min and 30-minute horizons — which is also the only place `constant-iso`
 *   is reachable. This is where a campaign that is allowed to take minutes goes.
 *
 * Nothing is silently truncated: {@link CampaignResult.stats} reports the cases run, the
 * passengers generated and the simulated seconds, and the always-on suite prints them.
 */

import {
  caseFromSeed,
  DEEP_HYBRID_SPACE,
  DEEP_SPACE,
  HYBRID_SPACE,
  STANDARD_SPACE,
  type FuzzSpace,
} from './generate.js';
import { evaluateCase, generateOptionsFrom, isFailure, type RunOptions } from './run.js';
import { shrinkCase, type ShrinkResult } from './shrink.js';
import type { CampaignStats, FuzzOutcome } from './types.js';

export interface CampaignOptions extends RunOptions {
  /** Generator seeds. One case each; the case is a pure function of the seed. */
  readonly seeds: readonly number[];
  readonly space?: FuzzSpace | undefined;
  /** Shrink every failure to a minimal counterexample. On by default; failures are rare. */
  readonly shrink?: boolean | undefined;
  readonly shrinkBudget?: number | undefined;
}

export interface CampaignResult {
  readonly outcomes: readonly FuzzOutcome[];
  /** One entry per failing case, shrunk unless shrinking was turned off. */
  readonly failures: readonly ShrinkResult[];
  readonly stats: CampaignStats;
}

/** Run every seed, check all six properties on each, and shrink whatever failed. */
export function runCampaign(options: CampaignOptions): CampaignResult {
  const space = options.space ?? STANDARD_SPACE;
  const generateOptions = generateOptionsFrom(options.config, space);
  const outcomes: FuzzOutcome[] = [];
  const failures: ShrinkResult[] = [];

  const topologies: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  let generatedPassengers = 0;
  let simulatedSeconds = 0;
  let skipped = 0;

  for (const seed of options.seeds) {
    const fuzzCase = caseFromSeed(seed, generateOptions);
    const outcome = evaluateCase(fuzzCase, options);
    outcomes.push(outcome);

    topologies[fuzzCase.topology] = (topologies[fuzzCase.topology] ?? 0) + 1;
    statuses[outcome.status] = (statuses[outcome.status] ?? 0) + 1;
    generatedPassengers += outcome.generatedPassengers;
    simulatedSeconds += outcome.simulatedSeconds;
    if (outcome.skipped !== undefined) skipped += 1;

    if (!isFailure(outcome)) continue;
    failures.push(
      options.shrink === false
        ? { original: outcome, minimal: outcome, steps: 0, evaluations: 0 }
        : shrinkCase(outcome, {
            ...options,
            ...(options.shrinkBudget === undefined ? {} : { budget: options.shrinkBudget }),
          }),
    );
  }

  return {
    outcomes: Object.freeze(outcomes),
    failures: Object.freeze(failures),
    stats: Object.freeze({
      cases: options.seeds.length,
      evaluated: options.seeds.length - skipped,
      skipped,
      failures: failures.length,
      generatedPassengers,
      simulatedSeconds,
      topologies: Object.freeze(topologies),
      statuses: Object.freeze(statuses),
    }),
  };
}

/** One-line-per-fact summary of what a campaign actually ran. Printed, never inferred. */
export function formatStats(stats: CampaignStats): string {
  const topologies = Object.entries(stats.topologies)
    .map(([id, count]) => `${id}=${String(count)}`)
    .join(' ');
  const statuses = Object.entries(stats.statuses)
    .map(([id, count]) => `${id}=${String(count)}`)
    .join(' ');
  return [
    `cases            ${String(stats.cases)} (${String(stats.evaluated)} evaluated, ${String(stats.skipped)} skipped)`,
    `failures         ${String(stats.failures)}`,
    `passengers       ${String(stats.generatedPassengers)}`,
    `simulated time   ${(stats.simulatedSeconds / 3600).toFixed(2)} h (${stats.simulatedSeconds.toFixed(0)} s)`,
    `topologies       ${topologies}`,
    `run statuses     ${statuses}`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- *
 * Corpora
 * -------------------------------------------------------------------------- */

/**
 * The always-on corpus: 64 pinned generator seeds.
 *
 * Pinned rather than random so the always-on suite is a **regression** suite — the same
 * buildings on every machine, forever — and so a failure is a seed somebody can type.
 * `generate.test.ts` asserts the coverage claims below hold of exactly these seeds, so a
 * generator change that quietly narrows the corpus fails there rather than going unnoticed.
 *
 * The last four are chosen rather than consecutive: they are the seeds that produce the
 * **two-floor** building, the smallest a bank can serve, which the consecutive block happened
 * to miss. A corpus that never generates the degenerate case is a corpus that cannot find the
 * bug that only lives there.
 *
 * **What this corpus does not cover**, and what `ELEVATOR_SIM_FUZZ=deep` is for:
 *
 * - buildings above {@link STANDARD_SPACE.maxFloors} floors — the deep space reaches 40;
 * - demand horizons above {@link STANDARD_SPACE.maxDurationS} s, which also means the corpus is
 *   entirely `rise-and-fall`: `constant-iso` discards its first 15 minutes and last 5, so it
 *   has no measurement window at all below 20 minutes and is unreachable here;
 *   arrival rates above {@link STANDARD_SPACE.maxArrivalRatePctPop5min} % of population per
 *   5 minutes, and banks of more than {@link STANDARD_SPACE.maxCarsPerBank} cars;
 * - anything about *statistics*: one replication per case, so nothing here says a mean is
 *   right, only that the mechanics under it are sound;
 * - **a bank with no serving car.** Service mode is generated, but never to the point of leaving
 *   a bank unable to collect its own landings — `generate.ts` § "Service mode is generated"
 *   gives the reason, and the corner itself is covered deliberately in
 *   `validation/adversarial.test.ts` and `core/src/sim/serviceMode.test.ts`, where the expected
 *   `timed-out` status is asserted rather than avoided.
 *
 * See `DECISIONS.md` § "What remains unfuzzed" for the axes neither corpus reaches, and
 * `validation/the root DECISIONS.md` for the two rows of that table which are no longer true —
 * out-of-service cars and mid-run mode changes are both generated as of this corpus.
 */
export const STANDARD_CORPUS: readonly number[] = Object.freeze([
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
  120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138,
  139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157,
  158, 159, 160,
  // two-floor buildings — the smallest a bank may serve
  161, 168, 181, 193,
]);

/**
 * **The hybrid family: 48 pinned generator seeds in {@link HYBRID_SPACE}** — GitHub issue #534
 * item 1, `DECISIONS.md` § D553, § D570.
 *
 * The axis § D553 opened and no fuzz case reached. A landing may carry its own hall fixture, and
 * until this corpus existed the generator drew none — so `costRequestFor` and `batchKeyOf` were
 * never asked per call, `Simulation.#assignsAt` was never anything but the run-wide gate, the bare
 * kiosk's refusal was never asked at one landing and not another, conservation claim 5 was never
 * counted over a proper subset of the landings, and no case ever produced the `hybrid` comparability
 * object at all. All six properties are checked on every case here, exactly as on
 * {@link STANDARD_CORPUS}.
 *
 * **Pinned, and the last sixteen are chosen rather than consecutive** — the same shape
 * {@link STANDARD_CORPUS}'s two-floor seeds have, for the same reason. A hybrid run needs a
 * dispatcher that *names a car* (`metrics/comparability.ts#landingPassengerModelOf`: a landing is
 * conventional under anything but `passengerAssignment: 'panel'`, whatever its fixture discloses),
 * and `data/dispatcher-profiles.json` ships one such profile of thirteen. Measured over seeds
 * 2 000 001–2 000 400: **18 produce a hybrid**, about one case in twenty-two. A consecutive block
 * alone would therefore have carried two, so the sixteen hybrid seeds outside the block are named
 * here and the family carries **18 hybrid cases of 48**.
 *
 * What the whole corpus measured when it landed, on this tree: 48 cases, 0 failures, 0 skipped,
 * 6 037 generated passengers, 10.91 simulated hours, in 3.7 s — 44 cases declaring fixtures,
 * 44 with at least one panel, 18 of them hybrid, 47 `completed` and 1 `timed-out`.
 *
 * **The census is asserted rather than described**: `hybrid.test.ts` requires those counts of these
 * seeds, so a thirteenth-profile change, a re-ordered draw or a narrowed space fails there instead
 * of quietly making this a corpus of uniform runs with a hybrid name.
 */
export const HYBRID_CORPUS: readonly number[] = Object.freeze([
  2_000_001, 2_000_002, 2_000_003, 2_000_004, 2_000_005, 2_000_006, 2_000_007, 2_000_008,
  2_000_009, 2_000_010, 2_000_011, 2_000_012, 2_000_013, 2_000_014, 2_000_015, 2_000_016,
  2_000_017, 2_000_018, 2_000_019, 2_000_020, 2_000_021, 2_000_022, 2_000_023, 2_000_024,
  2_000_025, 2_000_026, 2_000_027, 2_000_028, 2_000_029, 2_000_030, 2_000_031, 2_000_032,
  // …and the seeds that produce a run whose landings disagree, which a consecutive block reaches
  // about once in twenty-two.
  2_000_060, 2_000_072, 2_000_108, 2_000_121, 2_000_122, 2_000_171, 2_000_202, 2_000_210,
  2_000_244, 2_000_280, 2_000_300, 2_000_329, 2_000_343, 2_000_351, 2_000_370, 2_000_379,
]);

/** Seeds for the opt-in deep hybrid campaign. Disjoint from {@link HYBRID_CORPUS}, by construction. */
export function deepHybridSeeds(count: number, from = 2_100_001): readonly number[] {
  return deepSeeds(count, from);
}

/** Seeds for the opt-in deep campaign. `count` cases starting from `from`. */
export function deepSeeds(count: number, from = 1_000_001): readonly number[] {
  const seeds: number[] = [];
  for (let i = 0; i < count; i += 1) seeds.push(from + i);
  return Object.freeze(seeds);
}

/** Whether the deep campaign was asked for. The only environment read in this directory. */
export function deepCampaignRequested(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env['ELEVATOR_SIM_FUZZ'] === 'deep';
}

/** How many cases the deep campaign runs. `ELEVATOR_SIM_FUZZ_CASES`, or 250. */
export function deepCampaignSize(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const declared = Number(env['ELEVATOR_SIM_FUZZ_CASES'] ?? '');
  return Number.isInteger(declared) && declared > 0 ? declared : 250;
}

export { DEEP_HYBRID_SPACE, DEEP_SPACE, HYBRID_SPACE, STANDARD_SPACE };
