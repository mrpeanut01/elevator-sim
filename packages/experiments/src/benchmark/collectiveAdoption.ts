/**
 * **Should `collective` itself carry `eligibility.enRouteDiversion`?** The study that decides it,
 * against a criterion written before it ran.
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/collectiveAdoption.js
 * ```
 *
 * [`DECISIONS.md` § D205](../../../../DECISIONS.md) built the mechanism, measured it, shipped it as
 * the opt-in profile `collective-enroute`, and closed with the question it deliberately did not
 * answer: *"what remains is whether `collective` itself should carry the setting — expensive,
 * because every published `collective` figure would be invalidated — and that wants the study
 * re-run at n = 200 across more than one building first."*
 *
 * [§ D209](../../../../DECISIONS.md) is that criterion, and this module implements it and nothing
 * else. Every constant here is a transcription: the ladders, the two seeds, the budget and the six
 * clauses are all § D209's, and {@link adoptionVerdict} decides by them rather than by a judgement
 * made after the numbers arrived.
 *
 * ## Why this is not a config edit
 *
 * Because adoption does not *add* a dispatcher, it changes what an existing one **means**, and
 * `collective` is the fixed point most of this package measures against — `MATRIX_BASELINE`,
 * `ARM_PROFILES`, and the arm `censusSelectionPoint` elects at all eight § D151 sweep cells. § D205
 * already recorded what happens when the reference moves unannounced: forty figures changed
 * bit-identically with **no simulation having changed**, and it took four eliminated hypotheses to
 * find out why. So the setting is worth a study rather than a preference.
 *
 * ## The three things about the measurement that are choices
 *
 * **The contrast is the shipped pair, not the isolated mechanism.** `measureShippedAt` moves
 * `detourPenalty: 0.2` along with the setting, because that is what adoption would do. § D205
 * measured both and they disagree: isolated, diversion is a *trade* (AWT better, TTD significantly
 * worse at three of five cells); shipped, it is not a trade at all, because the profile prices the
 * detour the mechanism causes. Only the second is the adoption question.
 *
 * **The verdict is taken out of sample.** `detourPenalty: 0.2` was chosen by a four-point sweep at
 * {@link ADOPTION_STUDY_SEED}, so judging it there is validating a weight on the traffic it was
 * fitted to. {@link ADOPTION_HOLDOUT_SEED} is where the verdict lives; the study seed is reported
 * beside it, and a gap between the two is itself a result.
 *
 * **The cell comes from a ladder, not a choice.** Quotability is a property of the cell *and* of
 * `n` — § D205 lost five of ten cells between n = 50 and n = 200, including the one that produced
 * its own headline — so no single rate survives being fixed in advance. Each building declares a
 * descending ladder and {@link resolveLadder} takes the highest rung whose `awtIsValid` holds on
 * **both** arms. The rule reads `awtIsValid` and never a difference, which is the only thing that
 * stops a descending ladder being a way of shopping for a cell.
 */

import type { LoadedConfig } from '@elevator-sim/core';

import { comparePaired, digestsOf, loadResources, runGateExperiment, samplesOf } from '../validation/harness.js';
import type { PairedComparison } from '../validation/harness.js';
import type { ReplicationMetric } from '../runner/metrics.js';

import { BENCHMARK_CASES, type BenchmarkCase } from './arms.js';
import {
  CANDIDATE_ID,
  DIVERSION_SEED,
  SOURCE_ID,
  measureShippedAt,
  type DiversionCell,
  type DiversionPoint,
} from './enRouteDiversion.js';

/* -------------------------------------------------------------------------- *
 * § D209 § 1 and § 2 — the budget, the seeds and the ladders
 * -------------------------------------------------------------------------- */

/** § D209 § 1. The top of the budget CLAUDE.md § Statistical discipline permits. */
export const ADOPTION_REPLICATIONS = 200;

/**
 * The seed § D205's study runs at — and the seed `detourPenalty: 0.2` was **fitted** at, by the
 * four-point sweep (0.0, 0.2, 0.5, 1.0) on `vertical-city` 4 %. Reported, never decisive.
 */
export const ADOPTION_STUDY_SEED = DIVERSION_SEED;

/**
 * Where the verdict is taken. `+811` is the offset `SWEEP_HOLDOUT_SEED` already uses, reused so
 * that "disjoint" means the same thing in both places rather than being re-invented per study.
 */
export const ADOPTION_HOLDOUT_SEED = ADOPTION_STUDY_SEED + 811;

/** One rung: a building at a rate, with the call type that building's arms both run. */
export interface LadderRung extends DiversionPoint {}

/**
 * § D209 § 2's ladders, in descending order, one per shipped building.
 *
 * The rates are § D205's own, extended downward by one rung each so that a building losing its top
 * two cells at n = 200 still contributes rather than silently dropping out — which is the failure
 * clause 2 of the decision rule exists to catch.
 *
 * The three access-controlled buildings run `mobile-credential` on **both** arms. Their
 * access-restricted landings are unservable under the shipped `up-down-buttons` default (a landing
 * call carries no credential, so every car reports `accessDenied`), and applying it to both arms is
 * what keeps the contrast controlled: the passenger model moves together and only the diversion
 * setting and its weight differ.
 */
export const ADOPTION_LADDERS: readonly (readonly LadderRung[])[] = Object.freeze([
  Object.freeze([
    Object.freeze({ building: 'midtown-office', rate: 2 }),
    Object.freeze({ building: 'midtown-office', rate: 1 }),
    Object.freeze({ building: 'midtown-office', rate: 0.5 }),
  ]),
  Object.freeze([
    Object.freeze({ building: 'garden-apartments', rate: 14 }),
    Object.freeze({ building: 'garden-apartments', rate: 10 }),
    Object.freeze({ building: 'garden-apartments', rate: 6 }),
  ]),
  Object.freeze([
    Object.freeze({ building: 'secure-tower', rate: 4, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'secure-tower', rate: 2, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'secure-tower', rate: 1, callType: 'mobile-credential' as const }),
  ]),
  Object.freeze([
    Object.freeze({ building: 'mixed-use-high-rise', rate: 4, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'mixed-use-high-rise', rate: 2, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'mixed-use-high-rise', rate: 1, callType: 'mobile-credential' as const }),
  ]),
  Object.freeze([
    Object.freeze({ building: 'vertical-city', rate: 4, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'vertical-city', rate: 2, callType: 'mobile-credential' as const }),
    Object.freeze({ building: 'vertical-city', rate: 1, callType: 'mobile-credential' as const }),
  ]),
]);

/**
 * The building § D209 § 2 requires a quotable rung from, by name.
 *
 * `vertical-city` is the only building that refused the mechanism outright — ΔTTD `+4.591` and
 * ΔAWT `+0.762` at 4 %, both excluding zero and both against, before the `detourPenalty` weight
 * existed — and it is the only one with a double-deck shuttle and sky-lobby transfers, where a
 * diverted first leg delays a second leg that has not started. It is the building the weight was
 * invented to answer, so a criterion that lets it drop out for saturating is a criterion designed
 * to pass.
 */
export const REQUIRED_BUILDING = 'vertical-city';

/** § D209 § 3 clause 4. ΔAWT must exclude zero and be negative at this many holdout cells. */
export const REQUIRED_SIGNIFICANT_CELLS = 3;

/* -------------------------------------------------------------------------- *
 * The result shapes
 * -------------------------------------------------------------------------- */

/** One rung, measured. `chosen` is true for the rung the ladder stopped at. */
export interface LadderAttempt {
  readonly rung: LadderRung;
  readonly awtIsValid: boolean;
  readonly chosen: boolean;
}

/** A building's ladder, resolved. `cell` is absent when no rung was quotable at this budget. */
export interface ResolvedLadder {
  readonly building: string;
  readonly attempts: readonly LadderAttempt[];
  readonly cell?: DiversionCell | undefined;
}

/** A building's chosen cell, on both seeds. */
export interface AdoptionCell {
  readonly rung: LadderRung;
  /** § D209 § 1. Where the verdict is taken: a seed the weight was not fitted on. */
  readonly holdout: DiversionCell;
  /** The same cell at the seed § D205 measured, and the weight was chosen at. Reported only. */
  readonly inSample: DiversionCell;
}

/**
 * § D209 § 3 clause 5, at one of the benchmark gate's pure up-peak cells.
 *
 * Up-peak is the pattern that least exercises en-route pickup — cars run to the lobby empty and
 * climb full, so a landing call in the direction a car is already travelling past is rare — and
 * § D205 measured the two arms **bit-identical** at both of these cells. So this clause is free if
 * that survives, and a live finding if it does not: a change appearing here is a change the
 * down-peak study never saw.
 */
export interface UpPeakCheck {
  readonly caseId: string;
  readonly waiting: PairedComparison;
  readonly timeToDestination: PairedComparison;
  readonly identical: boolean;
  readonly commonRandomNumbers: boolean;
}

export interface AdoptionStudy {
  readonly replications: number;
  readonly studySeed: number;
  readonly holdoutSeed: number;
  readonly ladders: readonly ResolvedLadder[];
  readonly cells: readonly AdoptionCell[];
  readonly upPeak: readonly UpPeakCheck[];
}

/** § D209 § 3, clause by clause. `accepted` is the conjunction and nothing else. */
export interface AdoptionVerdict {
  readonly accepted: boolean;
  /** Every clause that failed, in § D209's order. Empty exactly when `accepted`. */
  readonly failures: readonly string[];
  readonly pairedAndLive: boolean;
  readonly allBuildingsQuotable: boolean;
  readonly worseOnNeither: boolean;
  readonly betterOutOfSample: boolean;
  readonly upPeakHolds: boolean;
}

/* -------------------------------------------------------------------------- *
 * The ladder
 * -------------------------------------------------------------------------- */

/**
 * Walk one building's ladder top-down and stop at the first rung whose AWT is quotable.
 *
 * **The stopping rule reads `awtIsValid` and nothing else.** Every rung's full comparison is kept
 * in the attempt list so a reader can see what was skipped, but no difference — significant or
 * otherwise — participates in the choice. That is the whole reason § D209 wrote the ladders down
 * before this function existed.
 */
export async function resolveLadder(
  ladder: readonly LadderRung[],
  replications: number,
  config: LoadedConfig,
  seed: number,
): Promise<ResolvedLadder> {
  const attempts: LadderAttempt[] = [];
  let cell: DiversionCell | undefined;
  for (const rung of ladder) {
    if (cell !== undefined) break;
    const measured = await measureShippedAt(rung, replications, config, seed);
    if (measured.awtIsValid) cell = measured;
    attempts.push({ rung, awtIsValid: measured.awtIsValid, chosen: measured.awtIsValid });
  }
  const building = ladder[0]?.building ?? '';
  return Object.freeze({ building, attempts: Object.freeze(attempts), cell });
}

/* -------------------------------------------------------------------------- *
 * Clause 5 — the up-peak cells
 * -------------------------------------------------------------------------- */

/** The gate's two pure up-peak cells. `garden-residential` is mixed traffic and is not one. */
export const UP_PEAK_CASE_IDS: readonly string[] = Object.freeze(['midtown-up-peak', 'secure-up-peak']);

/** The shipped diverting profile against shipped `collective`, at one gate case, under CRN. */
export async function checkUpPeak(
  benchmark: BenchmarkCase,
  config: LoadedConfig,
  seed: number,
): Promise<UpPeakCheck> {
  const result = await runGateExperiment({
    id: `adoption-up-peak-${benchmark.id}`,
    seed,
    building: benchmark.building,
    dispatchers: [SOURCE_ID, CANDIDATE_ID],
    traffic: benchmark.traffic,
    replications: benchmark.replications,
    resources: {
      buildingsById: config.buildingsById,
      dispatcherProfilesById: config.dispatcherProfilesById,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
    },
  });
  const compare = (metric: ReplicationMetric): PairedComparison =>
    comparePaired(metric, samplesOf(result, CANDIDATE_ID, metric), samplesOf(result, SOURCE_ID, metric));
  const waiting = compare('awtS');
  const timeToDestination = compare('ttdMeanS');
  const baseline = digestsOf(result, SOURCE_ID);
  const candidate = digestsOf(result, CANDIDATE_ID);
  return Object.freeze({
    caseId: benchmark.id,
    waiting,
    timeToDestination,
    // § D205's "bit-identical at both up-peak cells", re-derived rather than quoted.
    identical: waiting.maxAbsDifference === 0 && timeToDestination.maxAbsDifference === 0,
    commonRandomNumbers:
      baseline.length === candidate.length && baseline.every((digest, index) => digest === candidate[index]),
  });
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

export interface AdoptionStudyOptions {
  readonly replications?: number | undefined;
  readonly config?: LoadedConfig | undefined;
  /** Progress, for a run that takes long enough that silence is indistinguishable from a hang. */
  readonly onProgress?: ((line: string) => void) | undefined;
}

/**
 * Run § D209's study: resolve every ladder on the holdout seed, re-measure the chosen cells on the
 * study seed, and check the two up-peak cells.
 *
 * **The ladder is resolved on the holdout seed and not on the study seed**, because that is where
 * the verdict is taken and a cell that is quotable in sample and saturated out of sample is a cell
 * the verdict cannot use. The in-sample figure is then measured at whatever rung the holdout chose,
 * so the two columns are the same cell and can be read against each other.
 */
export async function runCollectiveAdoptionStudy(
  options: AdoptionStudyOptions = {},
): Promise<AdoptionStudy> {
  const config = options.config ?? (await loadResources());
  const replications = options.replications ?? ADOPTION_REPLICATIONS;
  const say = options.onProgress ?? ((): void => {});

  const ladders: ResolvedLadder[] = [];
  const cells: AdoptionCell[] = [];
  for (const ladder of ADOPTION_LADDERS) {
    const resolved = await resolveLadder(ladder, replications, config, ADOPTION_HOLDOUT_SEED);
    ladders.push(resolved);
    const skipped = resolved.attempts.filter((attempt) => !attempt.awtIsValid).map((attempt) => `${attempt.rung.rate}%`);
    say(
      `  ${resolved.building.padEnd(20)} ${
        resolved.cell === undefined
          ? 'no quotable rung'
          : `${resolved.cell.rate}%${skipped.length === 0 ? '' : ` (skipped ${skipped.join(', ')} — saturated)`}`
      }`,
    );
    if (resolved.cell === undefined) continue;
    const rung = ladder.find((entry) => entry.rate === resolved.cell?.rate);
    if (rung === undefined) throw new Error(`resolved rung ${resolved.cell.rate} is not on ${resolved.building}'s ladder`);
    cells.push({
      rung,
      holdout: resolved.cell,
      inSample: await measureShippedAt(rung, replications, config, ADOPTION_STUDY_SEED),
    });
  }

  const upPeak: UpPeakCheck[] = [];
  for (const caseId of UP_PEAK_CASE_IDS) {
    const benchmark = BENCHMARK_CASES.find((entry) => entry.id === caseId);
    if (benchmark === undefined) throw new Error(`no benchmark case "${caseId}"`);
    upPeak.push(await checkUpPeak(benchmark, config, ADOPTION_HOLDOUT_SEED));
    say(`  up-peak ${caseId} done`);
  }

  return Object.freeze({
    replications,
    studySeed: ADOPTION_STUDY_SEED,
    holdoutSeed: ADOPTION_HOLDOUT_SEED,
    ladders: Object.freeze(ladders),
    cells: Object.freeze(cells),
    upPeak: Object.freeze(upPeak),
  });
}

/* -------------------------------------------------------------------------- *
 * The verdict — § D209 § 3, and nothing that is not in it
 * -------------------------------------------------------------------------- */

/**
 * Apply § D209 § 3's six clauses.
 *
 * Written as a pure function of the study so that the criterion and the numbers can be read apart:
 * a reader checking whether the verdict was earned reads this against § D209 and never has to
 * reconstruct it from a narrative. Clause 6 — *the re-baselining is paid in full* — is the one
 * clause no function can decide, because it is a claim about pins regenerated and phase verdicts
 * re-derived; it is checked by hand and recorded in the decision.
 */
export function adoptionVerdict(study: AdoptionStudy): AdoptionVerdict {
  const failures: string[] = [];

  const both = study.cells.flatMap((cell) => [cell.holdout, cell.inSample]);
  const pairedAndLive = both.every((cell) => cell.commonRandomNumbers && cell.live);
  if (!pairedAndLive) {
    const bad = study.cells
      .filter((cell) => ![cell.holdout, cell.inSample].every((seen) => seen.commonRandomNumbers && seen.live))
      .map((cell) => `${cell.rung.building}@${cell.rung.rate}%`);
    failures.push(`clause 1 — not paired or not live at ${bad.join(', ')}`);
  }

  const quotable = new Set(study.cells.map((cell) => cell.rung.building));
  const missing = ADOPTION_LADDERS.map((ladder) => ladder[0]?.building ?? '').filter(
    (building) => !quotable.has(building),
  );
  const allBuildingsQuotable = missing.length === 0;
  if (!allBuildingsQuotable) {
    failures.push(
      `clause 2 — no quotable rung at ${missing.join(', ')}` +
        (missing.includes(REQUIRED_BUILDING)
          ? `; ${REQUIRED_BUILDING} is the building that refused the mechanism, so this is a refusal for want of evidence`
          : ''),
    );
  }

  // "Not significantly worse" is `lower <= 0` — the interval reaches zero or sits below it.
  // Checked on **both** seeds and on both metrics: a regression that appears only in sample is
  // still a regression, and the whole reason two seeds are measured is to be able to see it.
  const worse = study.cells.flatMap((cell) =>
    (
      [
        ['holdout', cell.holdout],
        ['in-sample', cell.inSample],
      ] as const
    ).flatMap(([label, seen]) =>
      (
        [
          ['AWT', seen.waiting],
          ['TTD', seen.timeToDestination],
        ] as const
      )
        .filter(([, comparison]) => comparison.estimate.lower > 0)
        .map(([metric]) => `${cell.rung.building}@${cell.rung.rate}% ${metric} (${label})`),
    ),
  );
  const worseOnNeither = worse.length === 0;
  if (!worseOnNeither) failures.push(`clause 3 — significantly worse at ${worse.join(', ')}`);

  const gains = study.cells.filter(
    (cell) => cell.holdout.waiting.significant && cell.holdout.waiting.estimate.mean < 0,
  ).length;
  const betterOutOfSample = gains >= REQUIRED_SIGNIFICANT_CELLS;
  if (!betterOutOfSample) {
    failures.push(
      `clause 4 — ΔAWT excludes zero and is negative at ${String(gains)} holdout cells, ` +
        `below the ${String(REQUIRED_SIGNIFICANT_CELLS)} required`,
    );
  }

  const upPeakFailures = study.upPeak.filter(
    (check) =>
      !check.commonRandomNumbers ||
      check.waiting.estimate.lower > 0 ||
      check.timeToDestination.estimate.lower > 0,
  );
  const upPeakHolds = upPeakFailures.length === 0 && study.upPeak.length === UP_PEAK_CASE_IDS.length;
  if (!upPeakHolds) {
    failures.push(
      `clause 5 — up-peak regressed or was not measured at ` +
        `${upPeakFailures.map((check) => check.caseId).join(', ') || 'a missing cell'}`,
    );
  }

  return Object.freeze({
    accepted: failures.length === 0,
    failures: Object.freeze(failures),
    pairedAndLive,
    allBuildingsQuotable,
    worseOnNeither,
    betterOutOfSample,
    upPeakHolds,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function interval(comparison: PairedComparison): string {
  const sign = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
  return (
    `${sign(comparison.estimate.mean)} [${sign(comparison.estimate.lower)}, ${sign(comparison.estimate.upper)}]` +
    `${comparison.significant ? ' *' : ''}`
  );
}

/** The study as a table, for the decision that quotes it. */
export function formatAdoptionStudy(study: AdoptionStudy, verdict: AdoptionVerdict): string {
  const lines: string[] = [
    ``,
    `§ D209 — should \`collective\` carry en-route diversion?`,
    `Shipped diverting profile − shipped collective, down-peak, paired-t 95 %, n = ${String(study.replications)}.`,
    `Verdict seed ${String(study.holdoutSeed)} (disjoint); study seed ${String(study.studySeed)} reported beside it.`,
    ``,
    `  ${'building'.padEnd(20)} ${'rate'.padStart(5)}  ${'ΔAWT holdout'.padEnd(28)} ${'ΔTTD holdout'.padEnd(28)} ${'ΔAWT in-sample'.padEnd(28)} ${'ΔTTD in-sample'.padEnd(28)}`,
  ];
  for (const cell of study.cells) {
    lines.push(
      `  ${cell.rung.building.padEnd(20)} ${`${String(cell.rung.rate)}%`.padStart(5)}  ` +
        `${interval(cell.holdout.waiting).padEnd(28)} ${interval(cell.holdout.timeToDestination).padEnd(28)} ` +
        `${interval(cell.inSample.waiting).padEnd(28)} ${interval(cell.inSample.timeToDestination).padEnd(28)}`,
    );
  }
  lines.push(``, `  ladders (resolved on the holdout seed, by awtIsValid alone):`);
  for (const ladder of study.ladders) {
    lines.push(
      `    ${ladder.building.padEnd(20)} ` +
        ladder.attempts
          .map((attempt) => `${String(attempt.rung.rate)}%=${attempt.awtIsValid ? 'quotable' : 'saturated'}`)
          .join('  '),
    );
  }
  lines.push(``, `  up-peak (clause 5):`);
  for (const check of study.upPeak) {
    lines.push(
      `    ${check.caseId.padEnd(20)} AWT ${interval(check.waiting).padEnd(28)} ` +
        `TTD ${interval(check.timeToDestination).padEnd(28)} bit-identical=${String(check.identical)}`,
    );
  }
  lines.push(
    ``,
    `  VERDICT: ${verdict.accepted ? 'ADOPT' : 'DO NOT ADOPT'}`,
    ...verdict.failures.map((failure) => `    ${failure}`),
    ``,
  );
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The driver
 * -------------------------------------------------------------------------- */

/**
 * The non-test caller (docs/05-roadmap.md § Standing requirement).
 *
 * `livenessSuite.ts` drives the categorical half of `benchmark/` and `regeneratePins.ts` drives the
 * interval half, and this study fits neither: it publishes intervals, and it costs hours rather
 * than the minutes both of those budget for. So it is its own command, and the `main` guard below
 * is what makes running it a thing a reader can do rather than a thing a test does.
 */
export async function main(): Promise<void> {
  const study = await runCollectiveAdoptionStudy({
    onProgress: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(formatAdoptionStudy(study, adoptionVerdict(study)));
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
