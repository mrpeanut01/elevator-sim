/**
 * Running many cases, and saying what it cost.
 *
 * ## The always-on / deep split, stated rather than capped
 *
 * `fuzz/campaign.ts`'s argument applies here unchanged and is not restated: a search that added
 * ten minutes to the suite would be disabled within a week and would then protect nothing. So the
 * search runs at two sizes, and **nothing is silently truncated** — {@link HonestyCampaignStats}
 * reports the cases run, the strings checked, the simulations spent and how many cases landed on
 * a suppressed run, and the always-on suite prints them.
 *
 * - **always-on** — {@link STANDARD_CORPUS}, a pinned list of seeds in `STANDARD_SPACE`. Pinned
 *   rather than random so this is a **regression** suite — the same configurations on every
 *   machine, forever — and so a failure is a seed somebody can type.
 * - **deep** — `DEEP_SPACE`, opt-in, hundreds of cases with campaign stages, 30-minute horizons
 *   and batches inside CLAUDE.md's 50–200 budget. This is where a search that is allowed to take
 *   minutes goes, and it is the only tier that reaches `MIN_REPLICATION_BUDGET`.
 *
 * ## Why the environment is not read here
 *
 * `boundaries.test.ts` confines `node:` imports and the DOM to `dev/` and the test helpers, and a
 * browser-facing module that reached for `process.env` would be the same defect one step to the
 * side. The flag is read by the suite, which is a test, and handed in.
 */

import {
  caseFromSeed,
  DEEP_SPACE,
  formatHonestyCase,
  STANDARD_SPACE,
  type HonestySpace,
} from './generate.js';
import { evaluateCase, isFailure, type HonestyResources } from './run.js';
import { shrinkCase, type HonestyShrinkResult } from './shrink.js';
import type { HonestyCampaignStats, HonestyOutcome } from './types.js';

export interface HonestyCampaignOptions {
  readonly resources: HonestyResources;
  /** Generator seeds. One case each; the case is a pure function of the seed. */
  readonly seeds: readonly number[];
  readonly space?: HonestySpace | undefined;
  /** Shrink every failure to a minimal counterexample. On by default; failures are rare. */
  readonly shrink?: boolean | undefined;
  readonly shrinkBudget?: number | undefined;
}

export interface HonestyCampaignResult {
  readonly outcomes: readonly HonestyOutcome[];
  /** One entry per failing case, shrunk unless shrinking was turned off. */
  readonly failures: readonly HonestyShrinkResult[];
  readonly stats: HonestyCampaignStats;
}

/** Run every seed, render every surface on each, and shrink whatever failed. */
export function runHonestyCampaign(options: HonestyCampaignOptions): HonestyCampaignResult {
  const space = options.space ?? STANDARD_SPACE;
  const outcomes: HonestyOutcome[] = [];
  const failures: HonestyShrinkResult[] = [];

  const surfaces: Record<string, number> = {};
  const buildings: Record<string, number> = {};
  const modes: Record<string, number> = {};
  let texts = 0;
  let simulations = 0;
  let skipped = 0;
  let suppressedCases = 0;
  const temporal = { atPlayhead: 0, early: 0, declaredNow: 0, declaredWholeRun: 0 };
  /*
   * Cells summed, states **maximised**: every case renders the whole matrix independently, so the
   * campaign's figure is the widest any one case reached — a sum would multiply thirty-two by the
   * corpus size and say nothing about coverage. See `types.ts#WithheldReach`.
   */
  let withheldCells = 0;
  let withheldStatesSeen = 0;
  const shrunkSignatures = new Set<string>();

  for (const seed of options.seeds) {
    const honestyCase = caseFromSeed(seed, { space });
    const outcome = evaluateCase(honestyCase, options.resources);
    outcomes.push(outcome);

    buildings[honestyCase.buildingId] = (buildings[honestyCase.buildingId] ?? 0) + 1;
    modes[honestyCase.mode] = (modes[honestyCase.mode] ?? 0) + 1;
    for (const surface of outcome.surfacesExercised) surfaces[surface] = (surfaces[surface] ?? 0) + 1;
    texts += outcome.textCount;
    simulations += outcome.simulations;
    temporal.atPlayhead += outcome.temporal.atPlayhead;
    temporal.early += outcome.temporal.early;
    temporal.declaredNow += outcome.temporal.declaredNow;
    temporal.declaredWholeRun += outcome.temporal.declaredWholeRun;
    withheldCells += outcome.withheld.cells;
    withheldStatesSeen = Math.max(withheldStatesSeen, outcome.withheld.states);
    if (outcome.skipped !== undefined) skipped += 1;
    if (outcome.suppressed) suppressedCases += 1;

    if (!isFailure(outcome)) continue;
    /*
     * Shrink **once per distinct finding**, not once per failing case.
     *
     * Found by running it: the search's one outstanding finding is a schema string on a surface
     * every case renders, so it failed all 48 cases, and shrinking each of them produced 48
     * identical minimal cases at a cost of three minutes. A signature is the set of
     * `property @ surface` pairs the case failed; the first case with a given signature is
     * reduced and the rest are reported whole. Nothing is dropped — every failure is still in
     * {@link HonestyCampaignResult.failures} — and no finding goes unshrunk.
     */
    const signature = [...new Set(outcome.violations.map((found) => `${found.property}@${found.surfaceId}`))]
      .sort()
      .join('|');
    const alreadyShrunk = shrunkSignatures.has(signature);
    shrunkSignatures.add(signature);
    failures.push(
      options.shrink === false || alreadyShrunk
        ? { original: outcome, minimal: outcome, steps: 0, evaluations: 0 }
        : shrinkCase(outcome, options.resources, {
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
      texts,
      simulations,
      suppressedCases,
      surfaces: Object.freeze(surfaces),
      buildings: Object.freeze(buildings),
      modes: Object.freeze(modes),
      temporal: Object.freeze({ ...temporal }),
      withheld: Object.freeze({ cells: withheldCells, states: withheldStatesSeen }),
    }),
  };
}

/** One-line-per-fact summary of what a campaign actually ran. Printed, never inferred. */
export function formatHonestyStats(stats: HonestyCampaignStats): string {
  const entries = (record: Readonly<Record<string, number>>): string =>
    Object.entries(record)
      .map(([id, count]) => `${id}=${String(count)}`)
      .join(' ');
  return [
    `cases            ${String(stats.cases)} (${String(stats.evaluated)} evaluated, ${String(stats.skipped)} skipped)`,
    `failures         ${String(stats.failures)}`,
    `strings checked  ${String(stats.texts)}`,
    `simulations      ${String(stats.simulations)}`,
    `suppressed runs  ${String(stats.suppressedCases)} of ${String(stats.evaluated)}`,
    `buildings        ${entries(stats.buildings)}`,
    `modes            ${entries(stats.modes)}`,
    `surfaces         ${String(Object.keys(stats.surfaces).length)} produced at least one string`,
    /*
     * The temporal axis's own size, printed for the reason the rest of this block is: a property
     * answerable only about strings said at a playhead is green for the wrong reason if the corpus
     * stopped producing them, and `honesty.test.ts` asserts on all four of these numbers.
     */
    `at a playhead    ${String(stats.temporal.atPlayhead)} (${String(stats.temporal.early)} short of endedAt)`,
    `declared basis   now=${String(stats.temporal.declaredNow)} whole-run=${String(stats.temporal.declaredWholeRun)}`,
    // The withheld matrix's own size, for the same reason and asserted the same way (§ 12.2).
    `withheld cells   ${String(stats.withheld.cells)} in ${String(stats.withheld.states)} combinations`,
  ].join('\n');
}

/** A failure printed in full: the property, the surface, the string, and the case that made it. */
export function formatFailure(failure: HonestyShrinkResult): string {
  const lines = [
    `case         ${failure.minimal.case.caseId} (from ${failure.original.case.caseId}, ${String(failure.steps)} reductions in ${String(failure.evaluations)} evaluations)`,
    `reproduce    caseFromSeed(${failure.original.case.honestySeed}) then apply the case below`,
  ];
  if (failure.minimal.threw !== undefined) lines.push(`threw        ${failure.minimal.threw}`);
  for (const found of failure.minimal.violations) {
    lines.push(
      `${found.property.padEnd(24)} ${found.surfaceId} · ${found.field}`,
      `  ${found.message}`,
      `  string: ${JSON.stringify(found.text)}`,
    );
  }
  // The shrunk case in full, through the one printer `shrink.ts`'s replay note promises — a
  // second inline stringify here is how the two prints drift (§ D192, candidate 4).
  lines.push(formatHonestyCase(failure.minimal.case));
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * Corpora
 * -------------------------------------------------------------------------- */

/**
 * The always-on corpus: 48 pinned generator seeds.
 *
 * **What this corpus does not cover**, and what the deep tier is for:
 *
 * - campaign stages — a stage runs 50 replications by its own declaration, and `STANDARD_SPACE`
 *   sets `stageProbability: 0` for that reason. Every campaign surface is therefore unexercised
 *   in the always-on tier, and `honesty.test.ts` asserts that fact rather than letting the
 *   adapter's silence pass for coverage;
 * - batches at or above `MIN_REPLICATION_BUDGET` — every batch here is below it, so **no row in
 *   this tier may carry a `resolved` verdict at all**. Since § D171 that is a fact about the
 *   product rather than about the corpus: `batch/report.ts` withholds the ordering below the
 *   budget and emits `under-budget` instead, so R2's third clause is now defence in depth on
 *   both tiers rather than a leak this tier could still find;
 * - horizons above 900 s, and demand above 12 %/5 min.
 *
 * `mode` is no longer on this list: `HONESTY_MODES` names both values, so the pinned cases
 * distribute across Basic and Advanced and the corpus assertion requires both to appear.
 */
export const STANDARD_CORPUS: readonly number[] = Object.freeze([
  9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012, 9013, 9014, 9015, 9016,
  9017, 9018, 9019, 9020, 9021, 9022, 9023, 9024, 9025, 9026, 9027, 9028, 9029, 9030, 9031, 9032,
  9033, 9034, 9035, 9036, 9037, 9038, 9039, 9040, 9041, 9042, 9043, 9044, 9045, 9046, 9047, 9048,
  /*
   * 9068 — the one seed here chosen for a *surface* rather than drawn in sequence, and it is
   * pinned with the measurement that chose it.
   *
   * `frame/pinnedQueue.ts` describes a landing where more riders are promised one car than it
   * holds — § D29's write-once cost, made visible. The corpus 9001–9048 draws **three**
   * destination-panel cases (9018 secure-tower, 9025 garden-apartments, 9035 mixed-use-high-rise)
   * and the surface fires on **none** of them: measured, 0 of 11 sampled instants each, because a
   * 26-person car needs sustained load to be over-subscribed and those three do not reach it.
   *
   * An adapter that renders nothing certifies a surface it never looked at — which is precisely
   * what `honesty.test.ts`'s *"every adapter produced at least one string"* case exists to catch,
   * and it caught this one. 9068 draws `vertical-city` / `destination-panel` over 840 s at the
   * building's own rate and fires at **9 of 11** sampled instants.
   *
   * Extending the corpus rather than declaring the adapter silent, because *silent in the always-on
   * tier* is the weaker claim: `campaign/judge.ts#judgeStage` earns it by being structurally
   * impossible here (`stageProbability: 0`), and this surface is not — it simply had no case.
   */
  9068,
]);

/** Seeds for the opt-in deep campaign. `count` cases starting from `from`. */
export function deepSeeds(count: number, from = 9_100_001): readonly number[] {
  const seeds: number[] = [];
  for (let i = 0; i < count; i += 1) seeds.push(from + i);
  return Object.freeze(seeds);
}

/** Whether the deep campaign was asked for. The environment is read by the caller, never here. */
export function deepCampaignRequested(env: Readonly<Record<string, string | undefined>>): boolean {
  return env['ELEVATOR_SIM_HONESTY'] === 'deep';
}

/**
 * How many cases the deep campaign runs. `ELEVATOR_SIM_HONESTY_CASES`, or 60.
 *
 * Measured: 24 deep cases is **273 s**, because a case that draws a campaign stage runs the
 * stage's own declared 50 replications on its own declared building — up to Vertical City at
 * 196 ms each. 60 is about eleven minutes, which is what an opt-in tier may cost; the always-on
 * tier is a different number and is stated on {@link STANDARD_CORPUS}.
 */
export function deepCampaignSize(env: Readonly<Record<string, string | undefined>>): number {
  const declared = Number(env['ELEVATOR_SIM_HONESTY_CASES'] ?? '');
  return Number.isInteger(declared) && declared > 0 ? declared : 60;
}

export { DEEP_SPACE, STANDARD_SPACE };
