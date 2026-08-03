/**
 * Common random numbers: the highest-leverage thing in Phase 3.
 *
 * ## The claim
 *
 * When dispatcher A is compared with dispatcher B, both must be driven by the *same* passenger
 * populations. Then the comparison is a paired difference `Dᵢ = AWT_A(i) − AWT_B(i)`, and
 *
 * ```
 * Var(A − B) = Var(A) + Var(B) − 2·Cov(A, B)
 * ```
 *
 * Independent runs make `Cov = 0` and you pay for both variances. CRN induces positive
 * correlation, the covariance term subtracts, and the variance of the *difference* collapses —
 * published reductions reach ~94 %, i.e. 5–20× fewer replications for the same confidence on a
 * comparison (docs/03-traffic-and-statistics.md § Part 4). On a system whose individual-run AWT
 * spans 4.1–7.4 s while the gap between two decent dispatchers is a few tenths of a second, that
 * factor is the difference between a conclusion and a coin flip.
 *
 * ## The mechanism, in one sentence
 *
 * A replication's seed is a function of `(experimentSeed, replicationIndex)` and **nothing
 * else** — {@link replicationSeed} takes no other argument, which is the enforcement rather than
 * a convention. Core then does the rest: `Simulation` generates the whole passenger trace in its
 * constructor from the `arrivals`/`origins`/`destinations`/`passengerMass` streams *before a car
 * moves*, and exposes it as `.trace` before `.run()`. So the population is a function of the
 * seed alone and cannot be perturbed by anything the elevators do, however differently two
 * dispatchers behave.
 *
 * ## Where CRN stops holding, and why that has a name
 *
 * Two cells are trace-comparable only if everything the *trace generator* reads is identical —
 * the building, the demand template, the horizon and every demand option. The dispatcher is not
 * on that list; the traffic arm is. {@link traceKeyOf} computes that equivalence class from
 * exactly the fields core's `traceConfigFor` reads, {@link crnCohortsOf} groups the plan by it,
 * and {@link verifyCrnAlignment} audits a *finished* result against it by comparing the
 * per-replication trace digests. A paired-t interval taken across two cohorts would be
 * arithmetic on unrelated populations, and nothing about the numbers would look wrong.
 */

import { deriveStreamSeed, normalizeSeed } from '@elevator-sim/core';

import type {
  CellResult,
  CellSimulationConfig,
  CrnCohort,
  ExperimentCell,
  ReplicationRecord,
} from './types.js';
import { RunnerError } from './types.js';

/* -------------------------------------------------------------------------- *
 * Seeds
 * -------------------------------------------------------------------------- */

/**
 * The stream name every replication seed is derived through.
 *
 * Part of the reproducibility contract: change it and every stored run record's seed becomes
 * unreachable from its experiment. `crn.test.ts` pins golden vectors so that an edit here fails
 * a test rather than silently re-seeding the world.
 */
export const REPLICATION_STREAM_PREFIX = 'replication:';

/** Accept a seed as a number, a decimal string (so 64 bits survive JSON) or a `bigint`. */
export function normalizeExperimentSeed(seed: number | string | bigint): bigint {
  if (typeof seed === 'string') {
    const text = seed.trim();
    if (!/^-?\d+$/.test(text)) {
      throw new RunnerError(
        `Experiment seed "${seed}" is not a decimal integer. A seed is written as a number or as a decimal string so that 64 bits survive JSON.`,
        'seed',
      );
    }
    return normalizeSeed(BigInt(text));
  }
  return normalizeSeed(seed);
}

/**
 * The master seed for replication `i` of **every** cell in the experiment.
 *
 * Depends on `(experimentSeed, replication)` and on nothing else — no building, no dispatcher, no
 * cell index, no plan size. That is the whole of CRN: two cells asked for replication 7 get the
 * same seed, hand it to `new StreamSet(seed)`, and generate byte-identical passenger populations.
 *
 * Derived through core's `deriveStreamSeed`, which is compatibility-locked with golden vectors,
 * rather than through a hash of this module's own invention. Reproducibility of a stored record
 * is only as stable as the weakest mapping between its seed and its numbers, and there is no
 * reason to add a second one.
 *
 * @throws RunnerError for a negative or non-integer replication index.
 */
export function replicationSeed(
  experimentSeed: number | string | bigint,
  replication: number,
): bigint {
  if (!Number.isSafeInteger(replication) || replication < 0) {
    throw new RunnerError(
      `Replication index must be a non-negative safe integer; received ${replication}.`,
    );
  }
  const master = normalizeExperimentSeed(experimentSeed);
  return deriveStreamSeed(master, `${REPLICATION_STREAM_PREFIX}${replication}`).initState;
}

/**
 * Seeds for replications `[0, count)`.
 *
 * Collision-checked. A repeat would mean two "independent" replications were the same run, which
 * would deflate every standard deviation in the experiment while looking entirely normal; at
 * 64 bits it will not happen, and if it ever does it must be loud rather than latent.
 */
export function replicationSeeds(
  experimentSeed: number | string | bigint,
  count: number,
): readonly bigint[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RunnerError(`Replication count must be a non-negative safe integer; received ${count}.`);
  }
  const seeds: bigint[] = [];
  const seen = new Set<bigint>();
  for (let i = 0; i < count; i += 1) {
    const seed = replicationSeed(experimentSeed, i);
    if (seen.has(seed)) {
      throw new RunnerError(
        `Replication seeds collided at index ${i} (${seed.toString()}). Two replications sharing a seed are the same run, which would deflate every variance in the experiment.`,
      );
    }
    seen.add(seed);
    seeds.push(seed);
  }
  return Object.freeze(seeds);
}

/* -------------------------------------------------------------------------- *
 * Canonical form
 * -------------------------------------------------------------------------- */

/**
 * `JSON.stringify` with object keys sorted, recursively.
 *
 * Two uses, both about not letting an incidental ordering become a semantic difference: trace
 * keys, where `{ incoming: 1, outgoing: 0 }` and `{ outgoing: 0, incoming: 1 }` are the same
 * demand; and result fingerprints, where a record assembled by iterating a differently-ordered
 * `Map` must still compare equal. `undefined`-valued properties are dropped, exactly as
 * `JSON.stringify` drops them, so an explicitly-passed `undefined` and an absent key agree.
 *
 * `bigint` is rendered as a decimal string rather than throwing, because seeds are `bigint`s and
 * a fingerprint that cannot include a seed would be missing the one field CLAUDE.md invariant 5
 * requires.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null';
}

function canonicalize(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()]
        .map(([key, entry]) => [String(key), canonicalize(entry)] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    );
  }
  if (value instanceof Set) return [...value].map(canonicalize);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) continue;
    out[key] = canonicalize(entry);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Trace equivalence classes
 * -------------------------------------------------------------------------- */

/**
 * The CRN equivalence class of a cell: everything the passenger trace is a function of, apart
 * from the seed.
 *
 * The field list mirrors core's `traceConfigFor`, and the omissions below the `demand.*` row are
 * the point. **That mirroring is maintained by hand and has drifted before**: the two docs/14
 * §§ 2.1-2.2 knobs and `mixAmplitude` were all absent from this key while being live on the demand
 * surface, so two cells running different populations shared a cohort and were paired. A field
 * missing here does not fail — it *merges*, which is why `crn.test.ts` now derives the field list
 * from `keyof SimulationDemandOptions` with a `satisfies` rather than trusting this sentence.
 *
 * | Field | In the key? | Why |
 * |---|---|---|
 * | `building.id` | yes | different buildings, different populations and destinations |
 * | `demandTemplate`, `durationS` | yes | the demand shape and horizon |
 * | `demand.*` | yes | rate, directional split, entrance weights, batching, credentials, legs |
 * | `dispatcherProfile`, `dispatcherOptions` | **no** | the trace is generated before a car moves |
 * | `reportWindow`, `summarize` | **no** | post-hoc windowing of an already-generated run |
 * | `transferWalkS`, `drainGraceS`, `maxEvents`, `onTimeout` | **no** | run-loop mechanics |
 * | `doorObstructionProbability` | **no** | draws from `doorObstruction`, not from the trace streams |
 * | `patience` | **no** | draws from `patience`, its own stream, **after** the trace is generated |
 * | `lobbyCrowding` | **no** | a term on the dwell; it draws nothing at all |
 * | `demand.dayVariation` | **yes** | draws *before* the trace and scales the rate it is generated at |
 *
 * **`dayVariation` and `patience` are the pair to compare, and they land on opposite sides.**
 * Both draw from a stream in `TRAFFIC_STREAM_NAMES`, so stream membership decides nothing. What
 * decides it is *when* the draw happens relative to the trace. `patience` is drawn after the trace
 * exists and displaces no arrival instant, so two cells differing in it see the same passengers
 * and must be paired. `dayVariation` is drawn before anything else in `generateTrace` and its
 * multiplier goes through `planDemand`'s `rateOf`, so two cells differing in it see a different
 * number of people arriving at different times — a *different Monday*. Pairing those would be the
 * arithmetic-across-unrelated-populations this module exists to refuse.
 *
 * **Being in the key is also what makes docs/14 § 5 criterion 3 achievable rather than lucky.**
 * The criterion is that a paired comparison under day variation shows variance no larger than the
 * same comparison without it. Two cells that share a `dayVariation` block share a cohort, are
 * handed the same replication seeds, and therefore draw the *same* factor and the same peak shift:
 * the day is common to both arms and cancels out of every paired difference. A `dayVariation`
 * left out of this key would put a varying cell and a non-varying cell in one cohort, and the
 * difference would carry the day's variance — the exact silent inflation the criterion tests for.
 *
 * **The two older omissions are worth reading twice, because one of them is a trap.**
 * `patience` draws from a *demand-side* stream (`TRAFFIC_STREAM_NAMES`), which makes it look like
 * it belongs in the key. It does not: the trace is generated in full before the patience table is
 * drawn, and the draws come from a separate stream, so they cannot displace a single arrival
 * instant. Two cells differing only in patience see **exactly the same passengers**, which is
 * precisely the pairing common random numbers exists to give.
 *
 * What they do *not* see is the same **served population** — a rider who gives up in one arm and
 * boards in the other is one passenger in two states, and every window statistic is then taken
 * over two different cohorts. That is a comparability question rather than a trace question, and
 * it is answered where comparability is answered: `RunSummary.abandonment` beside the mean, and
 * `awtIsValid`'s fifth ground refusing the mean outright past the declared rate. Putting patience
 * in the trace key would not have helped and would have destroyed the pairing that makes the
 * comparison possible at all.
 *
 * The building is keyed by **id** rather than by content, which is safe here because
 * {@link ExperimentResources} is experiment-wide: every cell resolves an id through the same map,
 * so equal ids are the same object. A caller that registered two different buildings under one id
 * across two experiments would break that, and would also have made the ids meaningless.
 */
export function traceKeyOf(simulation: CellSimulationConfig): string {
  const demand = simulation.demand ?? {};
  return canonicalJson({
    building: simulation.building.id,
    template: simulation.demandTemplate,
    durationS: simulation.durationS,
    demandLevel: demand.demandLevel,
    arrivalRatePctPop5min: demand.arrivalRatePctPop5min,
    directionalSplit: demand.directionalSplit,
    batchSharesDestination: demand.batchSharesDestination,
    entranceWeights: demand.entranceWeights,
    interfloorWeighting: demand.interfloorWeighting,
    credentialAssignment: demand.credentialAssignment,
    maxLegs: demand.maxLegs,
    peakWindowS: demand.peakWindowS,
    baselineFraction: demand.baselineFraction,
    // `canonicalize` drops `undefined` entries, so a cell that sets none of these three produces
    // exactly the key it produced before they existed — no cohort in any existing experiment moves.
    mixAmplitude: demand.mixAmplitude,
    batchSize: demand.batchSize,
    passengerMass: demand.passengerMass,
    // docs/14 § 2.3. **In**, and this is the field the docstring above says to reason about
    // rather than to file by analogy. It draws from a demand-side stream exactly as `patience`
    // does — and unlike `patience` it draws *before* the trace exists and multiplies the rate the
    // trace is generated at, so two cells differing in it see different people. Measured, not
    // argued: `core/src/sim/dayVariationSeam.test.ts` compares the two structural trace digests.
    dayVariation: demand.dayVariation,
  });
}

/** Group cells into trace-equivalence classes, in plan order. */
export function crnCohortsOf(cells: readonly ExperimentCell[]): readonly CrnCohort[] {
  const cohorts = new Map<string, { cohort: CrnCohort; cellIds: string[] }>();
  for (const cell of cells) {
    const existing = cohorts.get(cell.traceKey);
    if (existing === undefined) {
      const cellIds: string[] = [cell.cellId];
      cohorts.set(cell.traceKey, {
        cellIds,
        cohort: {
          traceKey: cell.traceKey,
          buildingId: cell.buildingId,
          trafficArmId: cell.trafficArmId,
          cellIds,
        },
      });
    } else {
      existing.cellIds.push(cell.cellId);
    }
  }
  return Object.freeze([...cohorts.values()].map((entry) => Object.freeze(entry.cohort)));
}

/* -------------------------------------------------------------------------- *
 * Auditing a finished experiment
 * -------------------------------------------------------------------------- */

/** One replication index at which a cohort's cells disagreed about their passenger population. */
export interface CrnMismatch {
  readonly traceKey: string;
  readonly replication: number;
  /** Cell id to the digest it reported. More than one distinct value is the fault. */
  readonly digestsByCellId: Readonly<Record<string, string>>;
}

/** Whether a finished experiment actually delivered common random numbers. */
export interface CrnAlignmentReport {
  /** Cohorts with at least two cells — the ones where alignment is a claim rather than a truism. */
  readonly comparableCohorts: number;
  /** Replication indices checked across all cohorts. */
  readonly checkedReplications: number;
  readonly mismatches: readonly CrnMismatch[];
  readonly aligned: boolean;
}

/**
 * Audit a finished experiment for CRN alignment.
 *
 * Cheap, and worth running on every result: it compares the per-replication
 * {@link ReplicationRecord.traceDigest} across the cells of each cohort, which is the observable
 * consequence of the seeding discipline. A future refactor that let a dispatcher id leak into a
 * seed would show up here as a mismatch instead of as a quietly widened confidence interval.
 *
 * Only replication indices present in **every** cell of the cohort are compared; a cohort whose
 * arms stopped at different replication counts is normal (one may have saturated) and is not a
 * fault. The count of what was actually checked is reported so an empty mismatch list cannot be
 * mistaken for a strong result when nothing was comparable.
 */
export function verifyCrnAlignment(cells: readonly CellResult[]): CrnAlignmentReport {
  const byTraceKey = new Map<string, CellResult[]>();
  for (const cell of cells) {
    const bucket = byTraceKey.get(cell.traceKey);
    if (bucket === undefined) byTraceKey.set(cell.traceKey, [cell]);
    else bucket.push(cell);
  }

  const mismatches: CrnMismatch[] = [];
  let comparableCohorts = 0;
  let checkedReplications = 0;

  for (const [traceKey, cohort] of byTraceKey) {
    if (cohort.length < 2) continue;
    comparableCohorts += 1;
    const byIndex = cohort.map((cell) => indexRecords(cell.replications));
    const shared = [...(byIndex[0] ?? new Map()).keys()].filter((replication) =>
      byIndex.every((map) => map.has(replication)),
    );
    shared.sort((a, b) => a - b);

    for (const replication of shared) {
      checkedReplications += 1;
      const digestsByCellId: Record<string, string> = {};
      const distinct = new Set<string>();
      for (const [position, cell] of cohort.entries()) {
        const record = byIndex[position]?.get(replication);
        if (record === undefined) continue;
        digestsByCellId[cell.cellId] = record.traceDigest;
        distinct.add(record.traceDigest);
      }
      if (distinct.size > 1) {
        mismatches.push({ traceKey, replication, digestsByCellId });
      }
    }
  }

  return {
    comparableCohorts,
    checkedReplications,
    mismatches: Object.freeze(mismatches),
    aligned: mismatches.length === 0,
  };
}

function indexRecords(
  records: readonly ReplicationRecord[],
): ReadonlyMap<number, ReplicationRecord> {
  const map = new Map<number, ReplicationRecord>();
  for (const record of records) map.set(record.replication, record);
  return map;
}

/**
 * Throw unless a finished experiment delivered common random numbers.
 *
 * For a caller that is about to compute a paired-t interval: a silent misalignment there would
 * produce a plausible number from unrelated populations, which is the one outcome
 * CLAUDE.md § Statistical discipline forbids.
 */
export function assertCrnAligned(cells: readonly CellResult[]): CrnAlignmentReport {
  const report = verifyCrnAlignment(cells);
  if (!report.aligned) {
    const first = report.mismatches[0];
    throw new RunnerError(
      `Common random numbers are broken: ${report.mismatches.length} of ${report.checkedReplications} compared replications saw different passenger populations across cells that should share one. First at replication ${first?.replication}: ${canonicalJson(first?.digestsByCellId)}. A paired comparison across these cells would be arithmetic on unrelated runs.`,
    );
  }
  return report;
}
