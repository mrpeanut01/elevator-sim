/**
 * **Stage 5's load-driven trigger, measured rather than asserted.**
 *
 * docs/06-parameterization-and-tuning.md § Stage 5 states the mechanism in one sentence — *"when a
 * car crosses its load threshold, its uncommitted calls migrate"* — and docs/01-architecture.md names
 * it as the second of the three reasons a pure agent-per-elevator model fails. Phase 5 built
 * `CapacityReassignmentMonitor`, unit-tested it, and connected it to nothing; the integration step
 * gave `Simulation.#finishStop` a `reconsider` call site. This module answers the question that
 * follows and that no unit test can: **on a real building, at a load a real report may quote, how
 * often does it fire and what is it worth?**
 *
 * ## Why this study runs `Simulation` directly rather than through `runExperiment`
 *
 * `StageActivity` — `capacityCrossings`, `capacityMigrations`, `capacityHeld` — lives on the
 * `Simulation` object and is not carried by `ReplicationRecord`, so the replication runner cannot
 * see it. Those three counters are the whole point of the study: a migration count of zero and a
 * mechanism that is not wired look identical in an AWT mean, which is exactly how this project lost
 * four behaviours to a missing call site. So the study seeds itself with the runner's own
 * {@link replicationSeed} — the same function `crn.ts` uses, so replication `i` here is byte-for-byte
 * the population replication `i` of any experiment at the same master seed — and audits the pairing
 * with the runner's own {@link traceDigest} rather than trusting it.
 *
 * ## What is isolated, and what that costs
 *
 * The control is the treatment profile with **`dispatch.reassignmentPolicy` set to `never`** and
 * nothing else changed (CLAUDE.md invariant 7: it is a derived profile, not a code path). That
 * switch is honest but *broad*: it gates all of stage 5, not only the load-crossing trigger. So the
 * paired interval is an interval on **reassignment**, and the counters are what separate the
 * load-crossing trigger from the rest of it. Both are reported, and the report says which is which.
 *
 * ## The measured result
 *
 * Midtown Office up-peak, `capacity-aware`, n = 60 per cell under CRN:
 *
 * | load | crossings/run | **load-crossing migrations/run** | AWT quotable on both arms | reassignment worth, AWT |
 * |---|---|---|---|---|
 * | 1 % | 0.00 | **0.00** | yes | `0.0000 [0.0000, 0.0000]` — 60/60 bit-identical |
 * | 2 % | 0.55 | **0.00** | no — the control saturates 1/60 | (suppressed) |
 * | 3 % | 2.77 | **0.00** | yes | `−0.52 [−1.04, +0.00]` — INDISTINGUISHABLE at n = 60 |
 * | 4 % | 6.07 | **0.00** | no — the control saturates 2/60 | (suppressed) |
 * | 8 % | 19.27 | 0.15 | no — 56/60 replications diverge | (suppressed) |
 * | 16 % | 40.98 | 1.18 | no — 60/60 diverge | (suppressed) |
 *
 * Three findings, and the first is the headline.
 *
 * **1. The load-crossing trigger fires on 0 % of load crossings at every load where an AWT interval
 * may be quoted.** It is reached — `capacityCrossings` rises from 0 to 41 per run across the sweep
 * and `capacityHeld` shows the monitor looking at 5 to 34 calls per run — but under every shipped
 * profile it hands none of them on. The first load at which it migrates anything is 8 %, where 56 of
 * 60 replications have a diverging queue and no mean may be quoted. This is the same shape as the
 * tail terms in `tailStudy.ts`: **the regime where the mechanism works is past the regime where any
 * result may be reported.**
 *
 * **2. Reassignment as a whole moves AWT by `−0.52 s [−1.04, +0.00]` at 3 %**, the highest load
 * quotable on both arms — an **unresolved** effect at n = 60, not a gain: the paired-t interval
 * contains zero by 0.0002 s, so the sign is stable and the significance is not. (It read
 * `[−1.03, −0.01]` while published intervals used a normal quantile past n = 25; review finding
 * #14 put them back on Student-t and the upper bound crossed zero. n = 60 is the study's budget
 * because the control saturates immediately above this load, so more replications are not
 * available here as a remedy.) Whatever it is worth, none of it is the load-crossing trigger. Counted through the shipped
 * engine at that load, the treatment arm swaps a call from one car to another **0.017 times per run**
 * and widens an already-assigned landing across a second car under `split-demand` **0.367 times per
 * run**; the control does neither, because `never` short-circuits the gate before scoring. So the
 * value of stage 5 on this building is *split-demand reaching a call that was already assigned*, not
 * capacity-driven bypass.
 *
 * **3. The seam test's operating point is not a reportable one.** `core/src/sim/seam.test.ts` runs
 * `capacity-aware` at the traffic profile's own default demand and asserts `capacityMigrations > 0`;
 * measured there, migrations run at 10.98 per run (22.4 % of crossings) — but AWT is 788 s and 60 of
 * 60 replications diverge. The assertion is correct as a wiring guard and must not be read as
 * evidence that the mechanism pays.
 */

import { Simulation, type DispatcherProfile, type ResolvedBuilding } from '@elevator-sim/core';

import { pairedDifferenceEstimate } from '../reports/statistics.js';
import type { MeanEstimate } from '../reports/types.js';
import { replicationSeed } from '../runner/crn.js';
import { traceDigest } from '../runner/replication.js';
import type { TrafficArmSpec } from '../runner/types.js';
import { derivedProfile, loadResources } from '../validation/harness.js';

import { BENCHMARK_SEED } from './suite.js';

/* -------------------------------------------------------------------------- *
 * The arms and the operating points — all data
 * -------------------------------------------------------------------------- */

/**
 * The profile under study.
 *
 * `capacity-aware` because it is the shipped profile whose whole reason for existing is the load
 * sensor: `loadFactor` and `crowding` weights, `assignmentMode: split-demand`, and
 * `reassignmentPolicy: until-commitment` with `commitmentPoint: on-deceleration`, which is the
 * configuration docs/06 § Stage 5 describes as the one that makes capacity-driven bypass work.
 */
export const STAGE5_PROFILE = 'capacity-aware';

/** The building. Midtown Office is the only shipped building whose cars fill at a plausible load. */
export const STAGE5_BUILDING = 'midtown-office';

/**
 * The loads swept, as a percentage of population per five minutes.
 *
 * Chosen to bracket the quotable/unquotable boundary rather than to make a point: 1–4 % is the range
 * `saturationCensus.test.ts` measures as quotable for this building, and 8 % and 16 % are past it and
 * are here precisely so the report can say *where* the mechanism starts firing and what the state of
 * the queues is when it does.
 */
export const STAGE5_LOADS: readonly number[] = Object.freeze([1, 2, 3, 4, 8, 16]);

/** Midtown Office up-peak at one rate. The benchmark's own operating point, parameterized by load. */
export function stage5Traffic(arrivalRatePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    id: `up-peak-${String(arrivalRatePctPop5min)}pct`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
      entranceWeights: Object.freeze({ G: 1, P1: 0 }),
      arrivalRatePctPop5min,
      peakWindowS: 300,
    }),
  });
}

/**
 * The treatment profile with stage 5 switched off, and **nothing else changed**.
 *
 * Data, not code. `dispatch.reassignmentPolicy: never` is the documented off switch
 * (`DISPATCH_DEFAULTS`' own default), so the control is a configuration a building could ship rather
 * than a crippled build.
 */
export function withoutReassignment(base: DispatcherProfile): DispatcherProfile {
  return derivedProfile(base, `${base.id}-no-reassignment`, {
    name: `${base.name} (reassignmentPolicy: never)`,
    dispatch: { ...(base.dispatch ?? {}), reassignmentPolicy: 'never' },
  });
}

/* -------------------------------------------------------------------------- *
 * What one arm of one load produced
 * -------------------------------------------------------------------------- */

/** One (profile, load) cell: the stage-5 counters, the metric samples, and their validity. */
export interface Stage5Cell {
  readonly profileId: string;
  readonly arrivalRatePctPop5min: number;
  readonly replications: number;
  /** Cars observed crossing their own hall-call bypass threshold, summed over the run. */
  readonly crossingsPerRun: number;
  /** Calls the load-crossing trigger actually moved off a filled car. **The firing rate's numerator.** */
  readonly migrationsPerRun: number;
  /** Calls it looked at and left where they were. Non-zero proves the sweep ran. */
  readonly heldPerRun: number;
  /** Replications in which at least one call migrated. */
  readonly runsWithMigration: number;
  /** `migrations / crossings`, as a fraction. `NaN` when no car ever crossed. */
  readonly fireRate: number;
  /** Replications whose AWT survived `RunSummary.awtIsValid`. */
  readonly validAwtCount: number;
  /** Replications whose queue diverged. */
  readonly saturatedCount: number;
  /** `true` only when **every** replication has a quotable AWT, per docs/03 § Part 3. */
  readonly quotable: boolean;
  readonly awt: readonly number[];
  readonly wt95: readonly number[];
  readonly ttd: readonly number[];
  readonly pctOverLongWait: readonly number[];
  /** Per-replication trace digests, in index order. The CRN audit trail. */
  readonly digests: readonly string[];
}

/** One load's treatment-versus-control comparison. */
export interface Stage5Row {
  readonly arrivalRatePctPop5min: number;
  readonly treatment: Stage5Cell;
  readonly control: Stage5Cell;
  /** `treatment - control`, paired-t at 95 %, one entry per metric. */
  readonly differences: Readonly<Record<'awtS' | 'wt95S' | 'ttdMeanS' | 'pctOverLongWait', MeanEstimate>>;
  /** Paired AWT differences that were exactly zero. `n` of them means the arms ran identically. */
  readonly exactZeroCount: number;
  /** `true` when both arms had a quotable AWT on every replication. */
  readonly quotable: boolean;
  /** Whether replication `i` of both arms saw the same passenger population. */
  readonly crnAligned: boolean;
}

/** What the stage-5 study measured. */
export interface Stage5Study {
  readonly building: string;
  readonly profileId: string;
  readonly replications: number;
  readonly rows: readonly Stage5Row[];
  /** Loads at which the monitor observed at least one car crossing its threshold. */
  readonly loadsWithCrossings: readonly number[];
  /** Loads at which it actually migrated a call. */
  readonly loadsWithMigrations: readonly number[];
  /** Loads at which both arms were quotable. The only rows whose interval may be read. */
  readonly quotableLoads: readonly number[];
  /**
   * `true` when the load-crossing trigger migrated **nothing** at every quotable load.
   *
   * The study's headline finding, expressed as a flag so a test can fail if it ever stops being
   * true — in either direction. A mechanism that starts paying is as much a result as one that
   * does not.
   */
  readonly inertWhereQuotable: boolean;
  /** The lowest load at which any migration happened, or `undefined` if none did. */
  readonly firstFiringLoad: number | undefined;
}

export interface Stage5Options {
  readonly replications?: number | undefined;
  readonly loads?: readonly number[] | undefined;
  readonly seed?: number | string | undefined;
  readonly profileId?: string | undefined;
  readonly building?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * Running
 * -------------------------------------------------------------------------- */

function runCell(
  building: ResolvedBuilding,
  profile: DispatcherProfile,
  traffic: TrafficArmSpec,
  resources: Awaited<ReturnType<typeof loadResources>>,
  seed: number | string,
  replications: number,
): Stage5Cell {
  const awt: number[] = [];
  const wt95: number[] = [];
  const ttd: number[] = [];
  const pct: number[] = [];
  const digests: string[] = [];
  let crossings = 0;
  let migrations = 0;
  let held = 0;
  let runsWithMigration = 0;
  let validAwtCount = 0;
  let saturatedCount = 0;

  for (let index = 0; index < replications; index += 1) {
    const simulation = new Simulation({
      building,
      dispatcherProfile: profile,
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      seed: replicationSeed(seed, index),
      durationS: traffic.durationS,
      demand: traffic.demand,
      // A diverging queue is the measurement here, not an error. `report` lets the run come back
      // with `awtIsValid: false` instead of throwing, which is what makes the unquotable rows
      // reportable at all.
      onTimeout: 'report',
    });
    const result = simulation.run();
    const activity = simulation.stageActivity;
    crossings += activity.capacityCrossings;
    migrations += activity.capacityMigrations;
    held += activity.capacityHeld;
    if (activity.capacityMigrations > 0) runsWithMigration += 1;
    if (result.summary.awtIsValid) validAwtCount += 1;
    if (result.summary.saturation.saturated) saturatedCount += 1;
    awt.push(result.summary.waiting.meanS);
    wt95.push(result.summary.waiting.p95S);
    ttd.push(result.summary.timeToDestination.meanS);
    pct.push(result.summary.waiting.pctOverLongWait);
    digests.push(traceDigest(simulation.trace));
  }

  return Object.freeze({
    profileId: profile.id,
    arrivalRatePctPop5min: traffic.demand?.arrivalRatePctPop5min ?? Number.NaN,
    replications,
    crossingsPerRun: crossings / replications,
    migrationsPerRun: migrations / replications,
    heldPerRun: held / replications,
    runsWithMigration,
    fireRate: crossings === 0 ? Number.NaN : migrations / crossings,
    validAwtCount,
    saturatedCount,
    quotable: validAwtCount === replications,
    awt: Object.freeze(awt),
    wt95: Object.freeze(wt95),
    ttd: Object.freeze(ttd),
    pctOverLongWait: Object.freeze(pct),
    digests: Object.freeze(digests),
  });
}

/**
 * Sweep the load, and at each step compare the shipped profile against itself with stage 5 off.
 *
 * CRN throughout: replication `i` of both arms is driven by `replicationSeed(seed, i)`, and
 * {@link Stage5Row.crnAligned} audits that afterwards from the trace digests rather than assuming it.
 */
export async function runCapacityReassignmentStudy(
  options: Stage5Options = {},
): Promise<Stage5Study> {
  const resources = await loadResources();
  const buildingId = options.building ?? STAGE5_BUILDING;
  const profileId = options.profileId ?? STAGE5_PROFILE;
  const replications = options.replications ?? 60;
  const seed = options.seed ?? BENCHMARK_SEED;
  const loads = options.loads ?? STAGE5_LOADS;

  const building = resources.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`No building "${buildingId}" in data/buildings.`);
  const treatmentProfile = resources.dispatcherProfilesById.get(profileId);
  if (treatmentProfile === undefined) {
    throw new Error(`data/dispatcher-profiles.json has no profile "${profileId}".`);
  }
  if ((treatmentProfile.dispatch?.reassignmentPolicy ?? 'never') === 'never') {
    throw new Error(
      `Profile "${profileId}" does not opt into stage 5 (dispatch.reassignmentPolicy is "never"), so a study of reassignment has nothing to switch off.`,
    );
  }
  const controlProfile = withoutReassignment(treatmentProfile);

  const rows: Stage5Row[] = [];
  for (const load of loads) {
    const traffic = stage5Traffic(load);
    const treatment = runCell(building, treatmentProfile, traffic, resources, seed, replications);
    const control = runCell(building, controlProfile, traffic, resources, seed, replications);
    const estimate = (a: readonly number[], b: readonly number[]): MeanEstimate =>
      pairedDifferenceEstimate(a, b, { confidence: 0.95 });
    rows.push(
      Object.freeze({
        arrivalRatePctPop5min: load,
        treatment,
        control,
        differences: Object.freeze({
          awtS: estimate(treatment.awt, control.awt),
          wt95S: estimate(treatment.wt95, control.wt95),
          ttdMeanS: estimate(treatment.ttd, control.ttd),
          pctOverLongWait: estimate(treatment.pctOverLongWait, control.pctOverLongWait),
        }),
        exactZeroCount: treatment.awt.filter(
          (value, index) => value - (control.awt[index] as number) === 0,
        ).length,
        quotable: treatment.quotable && control.quotable,
        crnAligned:
          treatment.digests.length === control.digests.length &&
          treatment.digests.every((digest, index) => digest === control.digests[index]),
      }),
    );
  }

  const quotableLoads = rows.filter((row) => row.quotable).map((row) => row.arrivalRatePctPop5min);
  return Object.freeze({
    building: buildingId,
    profileId,
    replications,
    rows: Object.freeze(rows),
    loadsWithCrossings: Object.freeze(
      rows.filter((row) => row.treatment.crossingsPerRun > 0).map((row) => row.arrivalRatePctPop5min),
    ),
    loadsWithMigrations: Object.freeze(
      rows.filter((row) => row.treatment.migrationsPerRun > 0).map((row) => row.arrivalRatePctPop5min),
    ),
    quotableLoads: Object.freeze(quotableLoads),
    inertWhereQuotable: rows
      .filter((row) => row.quotable)
      .every((row) => row.treatment.migrationsPerRun === 0),
    firstFiringLoad: rows.find((row) => row.treatment.migrationsPerRun > 0)?.arrivalRatePctPop5min,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

const num = (value: number, places = 2): string =>
  Number.isFinite(value) ? value.toFixed(places) : 'n/a';

/** The study as a markdown table. Every interval carries its own quotability. */
export function formatCapacityReassignment(study: Stage5Study): string {
  const lines: string[] = [];
  lines.push(
    `### Stage 5 on \`${study.building}\`, profile \`${study.profileId}\` vs the same profile at \`reassignmentPolicy: never\``,
  );
  lines.push('');
  lines.push(`n = ${study.replications} per cell, CRN, paired-t at 95 %.`);
  lines.push('');
  lines.push(
    '| load %pop/5min | crossings/run | **migrations/run** | held/run | fire rate | runs w/ migration | AWT quotable? | d AWT (treatment − control) | exactly-zero pairs |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of study.rows) {
    const d = row.differences.awtS;
    const interval = row.quotable
      ? `${num(d.mean, 4)} [${num(d.lower, 4)}, ${num(d.upper, 4)}]`
      : `**suppressed** — ${row.treatment.validAwtCount}/${row.treatment.replications} and ${row.control.validAwtCount}/${row.control.replications} valid`;
    lines.push(
      `| ${row.arrivalRatePctPop5min} | ${num(row.treatment.crossingsPerRun)} | **${num(row.treatment.migrationsPerRun)}** | ` +
        `${num(row.treatment.heldPerRun)} | ${Number.isFinite(row.treatment.fireRate) ? `${(row.treatment.fireRate * 100).toFixed(1)} %` : 'n/a'} | ` +
        `${row.treatment.runsWithMigration}/${row.treatment.replications} | ${row.quotable ? 'yes' : 'no'} | ${interval} | ` +
        `${row.exactZeroCount}/${row.treatment.replications} |`,
    );
  }
  lines.push('');
  lines.push(
    `Loads with a load crossing: ${study.loadsWithCrossings.join(', ') || 'none'}. ` +
      `Loads where the trigger migrated a call: ${study.loadsWithMigrations.join(', ') || 'none'}. ` +
      `Loads quotable on both arms: ${study.quotableLoads.join(', ') || 'none'}.`,
  );
  lines.push('');
  lines.push(
    study.inertWhereQuotable
      ? '> **The load-crossing trigger migrated nothing at any load where an AWT interval may be quoted.** It is reached and it looks at calls; it hands none of them on until the queues have already diverged.'
      : '> The load-crossing trigger fired at a quotable load. Read the interval above.',
  );
  return lines.join('\n');
}
