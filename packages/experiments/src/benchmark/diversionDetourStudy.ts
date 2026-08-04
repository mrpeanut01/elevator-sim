/**
 * **Does a diversion-conditional detour term earn `collective` the setting a constant one could
 * not?** [§ D211](../../../../DECISIONS.md)'s study, against a criterion committed before the term
 * was written.
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/diversionDetourStudy.js
 * ```
 *
 * [§ D210](../../../../DECISIONS.md) refused adoption on clause 5 and decomposed the refusal
 * exactly: at up-peak the mechanism fires **zero** times, the isolated-mechanism contrast is
 * `[0.000, 0.000]` at two seeds, and the whole regression is `detourPenalty: 0.2` — a constant
 * re-ordering car choices to pay for something that is not running. `diversionDetour` is the term
 * that charges the same passenger-seconds **only** when the call truncates a run, and this is the
 * study that decides whether that is enough.
 *
 * ## The one thing this study does that § D209's could not
 *
 * § D209 clause 5 asked for *"not significantly worse at up-peak"*. § D211 clause 5′ replaces it
 * with **bit-identical wherever `diversions == 0`** — exact rather than statistical, because a
 * correctly scoped term contributes precisely zero there. {@link DiversionDetourCell.identical} is
 * that check, and it is the reason the candidate arm can be compared to shipped `collective` on a
 * gate cell at all: a zero largest paired difference under CRN is proof, not evidence.
 *
 * The strengthening opens the hole it has to close. A term that is *always* zero passes clause 5′
 * perfectly — which is § D205's own first draft, inert and reporting the zeros a successful null
 * would. Clause 6′ is the counterweight and it lives in `core`, where it belongs:
 * `terms/liveness.test.ts` and `sim/seam.test.ts` both drive the term through the shipped engine
 * and require a non-zero raw *and* a spread between candidate cars.
 */

import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';

import {
  cellOf,
  comparePaired,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from '../validation/harness.js';
import type { PairedComparison } from '../validation/harness.js';
import type { ReplicationMetric } from '../runner/metrics.js';
import type { TrafficArmSpec } from '../runner/types.js';

import { BENCHMARK_CASES } from './arms.js';
import {
  ADOPTION_LADDERS,
  ADOPTION_REPLICATIONS,
  UP_PEAK_CASE_IDS,
  type LadderRung,
} from './collectiveAdoption.js';
import { SOURCE_ID } from './enRouteDiversion.js';

/* -------------------------------------------------------------------------- *
 * § D211 § 4 — the grid, and the three seeds
 * -------------------------------------------------------------------------- */

/**
 * The four weights § D211 § 4 declared **before** any of them was run.
 *
 * Four points, fixed in advance, so that *"we tried until it worked"* is not available as a
 * description of what happened.
 */
export const WEIGHT_GRID: readonly number[] = Object.freeze([0.2, 0.5, 1.0, 2.0]);

/** Where the weight is searched: the seed the *constant* weight was fitted at, so the two designs are tuned on the same traffic. */
export const DETOUR_TUNING_SEED = 20_260_801;

/**
 * Where the verdict is taken. Disjoint from the tuning seed **and** from § D209/§ D210's holdout,
 * which § D211 § 0's premise probe has also now looked at. Two seeds were spent; this is the third.
 */
export const DETOUR_VERDICT_SEED = 20_262_423;

/** The term the whole study is about. */
export const TERM_ID = 'diversionDetour';

/* -------------------------------------------------------------------------- *
 * The arms
 * -------------------------------------------------------------------------- */

/**
 * Shipped `collective`, and the same profile with diversion enabled and the conditional weight.
 *
 * Both derived from `collective`, so the contrast is exactly the two authored things adoption would
 * add and nothing else. `detourPenalty` is **not** among them: that is the whole point of the
 * design, and a candidate that carried it too would be measuring § D210's profile again.
 */
export function detourArms(
  base: DispatcherProfile,
  weight: number,
  callType?: LadderRung['callType'],
): readonly [DispatcherProfile, DispatcherProfile] {
  const dispatch = callType === undefined ? base.dispatch : { ...base.dispatch, callType };
  return [
    derivedProfile(base, REFERENCE_ID, { dispatch } as Partial<Omit<DispatcherProfile, 'id'>>),
    derivedProfile(base, CANDIDATE_ID, {
      dispatch,
      weights: { ...base.weights, [TERM_ID]: weight },
      eligibility: { ...base.eligibility, enRouteDiversion: true },
    } as Partial<Omit<DispatcherProfile, 'id'>>),
  ];
}

export const REFERENCE_ID = 'detour-reference';
export const CANDIDATE_ID = 'detour-candidate';

/* -------------------------------------------------------------------------- *
 * One cell
 * -------------------------------------------------------------------------- */

export interface DiversionDetourCell {
  readonly building: string;
  readonly rate: number;
  readonly weight: number;
  readonly seed: number;
  readonly waiting: PairedComparison;
  readonly timeToDestination: PairedComparison;
  /** Clause 5′: a zero largest paired difference. Under CRN this is proof the arms behaved alike. */
  readonly identical: boolean;
  readonly live: boolean;
  readonly commonRandomNumbers: boolean;
  readonly awtIsValid: boolean;
}

/** Down-peak at one point, the same spec `enRouteDiversion.ts` uses so the cells are comparable. */
function downPeakAt(rung: LadderRung): TrafficArmSpec {
  return Object.freeze({
    id: `${rung.building}-down-peak-${rung.rate}`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
      arrivalRatePctPop5min: rung.rate,
      peakWindowS: 300,
    }),
  });
}

/** The candidate against shipped `collective` at one cell, under verified common random numbers. */
export async function measureDetourAt(input: {
  readonly building: string;
  readonly rate: number;
  readonly callType?: LadderRung['callType'];
  readonly traffic?: TrafficArmSpec | undefined;
  readonly weight: number;
  readonly replications: number;
  readonly seed: number;
  readonly config: LoadedConfig;
}): Promise<DiversionDetourCell> {
  const base = input.config.dispatcherProfilesById.get(SOURCE_ID);
  if (base === undefined) throw new Error(`no dispatcher profile "${SOURCE_ID}"`);
  const arms = detourArms(base, input.weight, input.callType);

  const result = await runGateExperiment({
    id: `diversion-detour-${input.building}-${input.rate}-${input.weight}-${input.seed}`,
    seed: input.seed,
    building: input.building,
    dispatchers: [REFERENCE_ID, CANDIDATE_ID],
    traffic: input.traffic ?? downPeakAt({ building: input.building, rate: input.rate }),
    replications: input.replications,
    resources: withProfiles(input.config, [...arms]),
  });

  const compare = (metric: ReplicationMetric): PairedComparison =>
    comparePaired(metric, samplesOf(result, CANDIDATE_ID, metric), samplesOf(result, REFERENCE_ID, metric));
  const waiting = compare('awtS');
  const referenceDigests = digestsOf(result, REFERENCE_ID);
  const candidateDigests = digestsOf(result, CANDIDATE_ID);

  return Object.freeze({
    building: input.building,
    rate: input.rate,
    weight: input.weight,
    seed: input.seed,
    waiting,
    timeToDestination: compare('ttdMeanS'),
    identical: waiting.maxAbsDifference === 0 && compare('ttdMeanS').maxAbsDifference === 0,
    live: waiting.maxAbsDifference > 0,
    commonRandomNumbers:
      referenceDigests.length === candidateDigests.length &&
      referenceDigests.every((digest, index) => digest === candidateDigests[index]),
    awtIsValid:
      cellOf(result, REFERENCE_ID).aggregate.awtIsValid &&
      cellOf(result, CANDIDATE_ID).aggregate.awtIsValid,
  });
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

export interface DiversionDetourStudy {
  readonly weight: number;
  readonly replications: number;
  readonly verdictSeed: number;
  readonly cells: readonly DiversionDetourCell[];
  readonly upPeak: readonly DiversionDetourCell[];
}

export interface DiversionDetourVerdict {
  readonly accepted: boolean;
  readonly failures: readonly string[];
  readonly upPeakIdentical: boolean;
  readonly significantAwtGains: number;
}

/** § D211 § 3: clauses 1–4 carried over from § D209, with clause 5 replaced by 5′. */
export const REQUIRED_SIGNIFICANT_CELLS = 3;

export function detourVerdict(study: DiversionDetourStudy): DiversionDetourVerdict {
  const failures: string[] = [];
  const quotable = study.cells.filter((cell) => cell.awtIsValid);

  for (const cell of quotable) {
    const label = `${cell.building}@${String(cell.rate)}%`;
    if (!cell.commonRandomNumbers) failures.push(`clause 1 — ${label} did not see identical traces`);
    if (!cell.live) failures.push(`clause 1 — ${label} was inert; the candidate changed nothing`);
    if (cell.waiting.estimate.lower > 0) failures.push(`clause 3 — ${label} AWT is significantly worse`);
    if (cell.timeToDestination.estimate.lower > 0) {
      failures.push(`clause 3 — ${label} TTD is significantly worse`);
    }
  }

  const buildings = new Set(quotable.map((cell) => cell.building));
  if (buildings.size !== ADOPTION_LADDERS.length) {
    failures.push(
      `clause 2 — only ${String(buildings.size)} of ${String(ADOPTION_LADDERS.length)} buildings produced a quotable cell`,
    );
  }

  const significantAwtGains = quotable.filter(
    (cell) => cell.waiting.significant && cell.waiting.estimate.mean < 0,
  ).length;
  if (significantAwtGains < REQUIRED_SIGNIFICANT_CELLS) {
    failures.push(
      `clause 4 — ΔAWT excludes zero and is negative at only ${String(significantAwtGains)} of ` +
        `${String(REQUIRED_SIGNIFICANT_CELLS)} required holdout cells`,
    );
  }

  // Clause 5′. Exact, not statistical: the term must contribute nothing where nothing diverts.
  const notIdentical = study.upPeak.filter((cell) => !cell.identical);
  if (notIdentical.length > 0) {
    failures.push(
      `clause 5′ — not bit-identical at ${notIdentical.map((cell) => cell.building).join(', ')}`,
    );
  }

  return Object.freeze({
    accepted: failures.length === 0,
    failures: Object.freeze(failures),
    upPeakIdentical: notIdentical.length === 0,
    significantAwtGains,
  });
}

export interface DetourStudyOptions {
  readonly weight: number;
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
  readonly config?: LoadedConfig | undefined;
  readonly onProgress?: ((line: string) => void) | undefined;
}

/**
 * Run § D211's study at one weight: every ladder's highest quotable rung, plus the two up-peak
 * cells clause 5′ is exact about.
 */
export async function runDiversionDetourStudy(
  options: DetourStudyOptions,
): Promise<DiversionDetourStudy> {
  const config = options.config ?? (await loadResources());
  const replications = options.replications ?? ADOPTION_REPLICATIONS;
  const seed = options.seed ?? DETOUR_VERDICT_SEED;
  const say = options.onProgress ?? ((): void => {});

  const cells: DiversionDetourCell[] = [];
  for (const ladder of ADOPTION_LADDERS) {
    for (const rung of ladder) {
      const measured = await measureDetourAt({
        building: rung.building,
        rate: rung.rate,
        ...(rung.callType === undefined ? {} : { callType: rung.callType }),
        weight: options.weight,
        replications,
        seed,
        config,
      });
      if (measured.awtIsValid) {
        cells.push(measured);
        say(`  ${rung.building.padEnd(20)} ${String(rung.rate)}%`);
        break;
      }
    }
  }

  const upPeak: DiversionDetourCell[] = [];
  for (const caseId of UP_PEAK_CASE_IDS) {
    const benchmark = BENCHMARK_CASES.find((entry) => entry.id === caseId);
    if (benchmark === undefined) throw new Error(`no benchmark case "${caseId}"`);
    upPeak.push(
      await measureDetourAt({
        building: benchmark.building,
        rate: 0,
        traffic: benchmark.traffic,
        weight: options.weight,
        replications: benchmark.replications,
        seed,
        config,
      }),
    );
    say(`  up-peak ${caseId}`);
  }

  return Object.freeze({
    weight: options.weight,
    replications,
    verdictSeed: seed,
    cells: Object.freeze(cells),
    upPeak: Object.freeze(upPeak),
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

function interval(comparison: PairedComparison): string {
  const { mean, lower, upper } = comparison.estimate;
  return (
    `${mean >= 0 ? '+' : ''}${mean.toFixed(3)} [${lower.toFixed(3)}, ${upper.toFixed(3)}]` +
    `${comparison.significant ? ' *' : ''}`
  );
}

export function formatDetourStudy(study: DiversionDetourStudy): string {
  const verdict = detourVerdict(study);
  const lines: string[] = [
    ``,
    `§ D211 — does a diversion-conditional detour term earn the default?`,
    `collective + enRouteDiversion + ${TERM_ID}:${String(study.weight)} − shipped collective.`,
    `Down-peak, paired-t 95 %, n = ${String(study.replications)}, verdict seed ${String(study.verdictSeed)}.`,
    ``,
    `  building              rate  ΔAWT                          ΔTTD`,
  ];
  for (const cell of study.cells) {
    lines.push(
      `  ${cell.building.padEnd(20)} ${String(cell.rate).padStart(3)}%  ` +
        `${interval(cell.waiting).padEnd(29)} ${interval(cell.timeToDestination).padEnd(29)}`,
    );
  }
  lines.push(``, `  clause 5′ — exact, not statistical:`);
  for (const cell of study.upPeak) {
    lines.push(
      `    ${cell.building.padEnd(20)} bit-identical=${String(cell.identical).padEnd(6)} ` +
        `ΔAWT ${interval(cell.waiting)}`,
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

/** The non-test caller. § D211's numbers are this command's output. */
async function main(): Promise<void> {
  const weight = Number(process.argv[2] ?? 2.0);
  const replications = Number(process.argv[3] ?? ADOPTION_REPLICATIONS);
  const study = await runDiversionDetourStudy({
    weight,
    replications,
    onProgress: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(formatDetourStudy(study));
}

if (process.argv[1]?.endsWith('diversionDetourStudy.js') === true) {
  await main();
}
