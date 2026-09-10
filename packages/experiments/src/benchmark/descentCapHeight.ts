/**
 * **At what building height does buying the next speed class stop paying?** — GitHub issue #444's
 * *"the measurement worth pinning"*.
 *
 * ```ts
 * console.log(formatDescentCapHeightStudy(await runDescentCapHeightStudy()));
 * ```
 *
 * ## The question, and why it is a game-design question rather than a fidelity one
 *
 * Rated speed is a dominant buy: more is always better, it costs units, and only the budget stops
 * a player. `data/elevator-specs.json`'s `airPressure` block breaks that — above 300 m of travel an
 * unpressurised cabin descends at no more than 10 m/s however the machine is rated — so the money
 * spent on speed above that stops buying anything on the way down, and the way down is where the
 * evening egress lives. The player then buys cabin pressurisation (11 units, equipment tier) or
 * stops buying speed. This study measures the size of that decision.
 *
 * ## The design
 *
 * One shaft, swept over travel. The tower is a single bank at a constant 4 m floor pitch, so
 * *height* is the storey count and the population scales with it exactly as a real tower's does;
 * the demand template is a fraction of population per five minutes, so the arrival rate scales with
 * the building rather than being held artificially flat. Everything else — cars, doors, dispatcher,
 * demand shape, horizon — is identical across every cell.
 *
 * Three arms per height, and the third is what makes the other two mean anything:
 *
 * | arm | rated | descent | what it is |
 * |---|---|---|---|
 * | `base` | 10 m/s | 10 m/s | the speed class already owned. At the cap, so never limited. |
 * | `capped` | 14 m/s | 10 m/s above 300 m | the next speed class, bought and unpressurised |
 * | `lifted` | 14 m/s | 14 m/s | the same purchase with the cabins pressurised |
 *
 * **Paired, under common random numbers.** At each height the three arms are the same building with
 * one field changed, so replication *i* feeds all three the identical passenger trace and the
 * difference is taken per replication before it is averaged — `docs/03` Part 3's 5–20× in required
 * run count, and the only form CLAUDE.md permits a comparison to take. Each cell is a paired-t
 * interval at 95 %; a cell whose interval contains zero **has not paid**, and is reported that way
 * rather than by its point estimate.
 *
 * ## What it does not claim
 *
 * It does not claim a *price* for the decision. Whether 11 units is worth the seconds this study
 * measures is the product owner's, and `data/price-schedule.json` says so in the row's own note.
 * It does not sweep the cap or the threshold: both are one figure in `data/`, and a sweep over
 * them would be measuring an authored constant against itself.
 *
 * The gate metric is **time to destination**, not AWT. A descent limit lengthens the ride rather
 * than the wait for most riders, and AWT would report a fraction of the effect while looking like
 * the whole of it. Both are computed; TTD is what the verdict is read off.
 *
 * ## The measurement, as run
 *
 * Measured 2026-09-10, `n = 60`, seed `20260910`, ΔTTD in seconds, paired-t at 95 %. Negative is
 * better. `descentCapHeight.test.ts` re-derives the structural half of this table on a reduced
 * budget; the digits below are a dated record of one run rather than a pin, because a full sweep is
 * eight heights times three arms times sixty replications on two templates.
 *
 * **Down-peak (`residential`, 75 % outgoing) — the template GitHub issue #444's own acceptance
 * clause names.** Every row below quotable; 600 m saturated and suppressed.
 *
 * | travel | next class, unpressurised | next class, pressurised | the cabin itself |
 * |---|---|---|---|
 * | 120 m | −0.056 [−0.072, −0.041] | −0.056 [−0.072, −0.041] | **+0.000 [+0.000, +0.000]** |
 * | 200 m | −0.852 [−1.122, −0.582] | −0.852 [−1.122, −0.582] | **+0.000 [+0.000, +0.000]** |
 * | 260 m | −2.408 [−3.109, −1.707] | −2.408 [−3.109, −1.707] | **+0.000 [+0.000, +0.000]** |
 * | 296 m | −3.466 [−4.626, −2.307] | −3.466 [−4.626, −2.307] | **+0.000 [+0.000, +0.000]** |
 * | 304 m | −2.060 [−2.888, −1.232] | −3.096 [−4.282, −1.911] | −1.036 [−1.823, −0.250] |
 * | 360 m | −3.951 [−5.391, −2.510] | −6.069 [−7.544, −4.593] | −2.118 [−2.599, −1.637] |
 * | 480 m | −5.900 [−8.133, −3.667] | −9.252 [−11.339, −7.165] | −3.352 [−4.387, −2.317] |
 * | 600 m | suppressed | suppressed | suppressed (1 of 180 refused an AWT) |
 *
 * **Three things to read off it, and the third is the answer to the issue's question.**
 *
 * 1. **Below the threshold the cabin buys exactly zero** — `+0.000 [+0.000, +0.000]` at four
 *    heights, which is sixty bit-identical paired differences each time rather than a small
 *    number. That is the negative control in its strongest available form, and it is what says the
 *    seam is the *cap* rather than the field.
 * 2. **Above it the cabin buys seconds, and more of them the taller the tower** — −1.04 s at
 *    304 m to −3.35 s at 480 m, every interval excluding zero.
 * 3. **The next speed class never stops paying outright on this template; what it stops buying is
 *    a share, and the share is visible at the threshold itself.** Between 296 m and 304 m the
 *    building gets *taller* and the unpressurised purchase gets *worse*, −3.466 s to −2.060 s.
 *    That discontinuity is the cap arriving. Past it the cap withholds 33 % of the purchase at
 *    304 m (1.036 of 3.096), 35 % at 360 m and 36 % at 480 m. So the honest headline is not *"speed
 *    stops paying above X metres"* — it is **the money spent on the next speed class stops buying
 *    about a third of what it bought, from 300 m up, and the shortfall grows with height**.
 *
 * **Up-peak (`office-standard`, 85 % incoming) — refused, and the refusal is the finding.** Three
 * of the four rows above the threshold saturate at this fleet (2, 32 and 118 of 180 replications
 * refused an AWT) and **two rows below it already contain zero** — 200 m at
 * −0.637 [−3.037, +1.764] and 296 m at −2.973 [−6.177, +0.231]. So the purchase is unresolvable
 * under this template *before* the cap is in force, and a crossover found above 300 m could not be
 * attributed to the cap. {@link HeightSweep.stopsPayingUnavailableBecause} says exactly that rather
 * than reporting the 304 m row's contains-zero interval as a result: a first draft of this study
 * did report it, and it would have credited the cap with noise.
 */

import { Simulation, parseBuilding, resolveBuilding } from '@elevator-sim/core';
import type { LoadedConfig, ResolvedBuilding } from '@elevator-sim/core';

import { replicationSeed } from '../runner/crn.js';
import { pairedDifferenceEstimate } from '../reports/statistics.js';
import type { PublishedMeanEstimate } from '../reports/statistics.js';
import { loadResources } from '../validation/harness.js';

/* -------------------------------------------------------------------------- *
 * The design, as constants
 * -------------------------------------------------------------------------- */

/**
 * The travels swept, metres. Four below `airPressure.appliesAboveTravelM` and four above it, with
 * the two nearest points a single storey either side of the 300 m threshold so the discontinuity
 * is bracketed rather than inferred from distant points.
 */
export const HEIGHT_SWEEP_TRAVEL_M: readonly number[] = Object.freeze([
  120, 200, 260, 296, 304, 360, 480, 600,
]);

/** Replications per cell. Inside `docs/03`'s 50–200 budget; ten is not enough. */
export const HEIGHT_SWEEP_REPLICATIONS = 60;

/** The experiment seed. Fixed, so the study is reproducible rather than resampled. */
export const HEIGHT_SWEEP_SEED = 20_260_910;

/** The speed class already owned — at the cap exactly, so it is never the thing being limited. */
export const BASE_SPEED_MPS = 10;
/** The next speed class up, inside `ultra-high-speed`'s declared band (10.0–20.5 m/s). */
export const NEXT_SPEED_MPS = 14;

/** Floor pitch, metres. Constant across the sweep, so height is storeys. */
const FLOOR_PITCH_M = 4;
/** Headcount per upper floor. */
const POPULATION_PER_FLOOR = 8;
/** Cars in the single bank. Enough that no cell saturates; asserted per cell, never assumed. */
const CARS = 8;

/**
 * The down-peak template. `residential` is the only shipped profile whose split is majority
 * outgoing (75 %), which is the *"evening egress"* the issue is about and the template its own
 * acceptance clause names. `office-standard` is run beside it as the up-peak control.
 */
export const DOWN_PEAK_PROFILE = 'residential';
export const UP_PEAK_PROFILE = 'office-standard';

export type SweepArm = 'base' | 'capped' | 'lifted';

/* -------------------------------------------------------------------------- *
 * The tower
 * -------------------------------------------------------------------------- */

/**
 * One tower of the given travel, with one field varied per arm.
 *
 * Built through `parseBuilding` + `resolveBuilding` — the door a shipped file enters by — so the
 * air-pressure cap is applied by `config/parse.ts#resolveBuilding` and by nothing this module
 * owns. That is the point: the study measures the shipped mechanism, not a reimplementation of it.
 */
export function sweepTower(
  config: LoadedConfig,
  options: {
    readonly travelM: number;
    readonly arm: SweepArm;
    readonly trafficProfile: string;
  },
): ResolvedBuilding {
  const upperFloors = Math.round(options.travelM / FLOOR_PITCH_M);
  const floors = Array.from({ length: upperFloors + 1 }, (_, index) => ({
    id: index === 0 ? 'G' : `L${index}`,
    index,
    heightM: index * FLOOR_PITCH_M,
    population: index === 0 ? 0 : POPULATION_PER_FLOOR,
    ...(index === 0 ? { isEntrance: true } : {}),
  }));
  const authored = {
    id: `sweep-${options.travelM}`,
    name: `Sweep tower ${options.travelM} m`,
    // The type resolves `passengerTransferS`; residential is 1.75 s, which is what a tower run
    // under the residential template should be charging.
    type: options.trafficProfile === DOWN_PEAK_PROFILE ? 'residential' : 'office',
    trafficProfile: options.trafficProfile,
    floors,
    totalPopulation: POPULATION_PER_FLOOR * upperFloors,
    banks: [
      {
        id: 'shuttle',
        servesFloors: floors.map((floor) => floor.id),
        cars: Array.from({ length: CARS }, (_, index) => ({
          id: String.fromCharCode(65 + index),
          spec: 'ultra-high-speed',
          ratedSpeedMps: options.arm === 'base' ? BASE_SPEED_MPS : NEXT_SPEED_MPS,
          ratedLoadLb: 3500,
          ...(options.arm === 'lifted' ? { cabinPressurised: true } : {}),
        })),
      },
    ],
    accessZones: [],
  };
  const file = `${authored.id}.json`;
  return resolveBuilding(parseBuilding(authored, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/* -------------------------------------------------------------------------- *
 * Results
 * -------------------------------------------------------------------------- */

/** One arm's per-replication readings at one height. */
interface ArmSeries {
  readonly ttdS: readonly number[];
  readonly awtS: readonly number[];
  /** Replications whose AWT the run itself refused to quote. Must be zero for a cell to count. */
  readonly suppressed: number;
  /** The descent speed `resolveBuilding` gave this arm's cars, or `undefined` for symmetric. */
  readonly descentSpeedMps: number | undefined;
}

export interface HeightSweepRow {
  readonly travelM: number;
  readonly floors: number;
  /** True where `airPressure.appliesAboveTravelM` is exceeded. */
  readonly aboveThreshold: boolean;
  /** Buying the next speed class, unpressurised: `capped − base`, seconds of TTD. Negative is better. */
  readonly cappedGain: PublishedMeanEstimate;
  /** The same purchase with the cabins pressurised: `lifted − base`. */
  readonly liftedGain: PublishedMeanEstimate;
  /** What the cabin buys once the speed is owned: `lifted − capped`. */
  readonly pressurisationGain: PublishedMeanEstimate;
  /** The descent speed each arm resolved to, for the record. */
  readonly descentSpeedMps: Readonly<Record<SweepArm, number | undefined>>;
  /** Replications any arm refused an AWT on. Non-zero invalidates the row. */
  readonly suppressed: number;
  /**
   * Whether this row's intervals may be quoted at all.
   *
   * False the moment **any** replication of **any** arm came back with `awtIsValid: false` — a
   * saturated group's mean is not a mean of anything, and CLAUDE.md § Statistical discipline says
   * to flag and suppress rather than report. A row is dropped whole rather than per arm, because
   * the interval is *paired*: dropping one arm's replication and keeping the other's would break
   * the pairing that makes the interval worth having.
   */
  readonly quotable: boolean;
}

export interface HeightSweep {
  readonly trafficProfileId: string;
  readonly replications: number;
  readonly seed: number;
  readonly rows: readonly HeightSweepRow[];
  /**
   * The shallowest swept travel at which the capped arm's interval **contains zero** while the
   * lifted arm's still excludes it — *"the height at which buying the next speed class stops
   * paying, unless you also buy the cabin"*. `undefined` when no swept height reaches that state.
   *
   * Three conditions, and the second and third are what stop this attributing noise to the cap:
   *
   * 1. the row is **quotable** — nothing saturated;
   * 2. the row is **above the threshold**, so the cap is actually in force there;
   * 3. every quotable row **below** the threshold paid unpressurised. Without that clause a sweep
   *    whose shallow rows are simply too noisy to resolve would report a crossover the cap had
   *    nothing to do with, which is exactly what the first run of this study did on the up-peak
   *    template — where 200 m and 296 m already contained zero, well under the 300 m threshold.
   */
  readonly stopsPayingAboveM: number | undefined;
  /**
   * Why {@link stopsPayingAboveM} is `undefined`, when it is — so a caller reads *no crossover*
   * apart from *the question could not be asked*. `undefined` when a crossover was found.
   */
  readonly stopsPayingUnavailableBecause: string | undefined;
}

/** Interval excludes zero and the mean is negative: the purchase bought seconds. */
export const paid = (estimate: PublishedMeanEstimate): boolean =>
  estimate.upper < 0 && estimate.mean < 0;

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

function seriesFor(
  config: LoadedConfig,
  options: {
    readonly travelM: number;
    readonly arm: SweepArm;
    readonly trafficProfile: string;
    readonly replications: number;
    readonly seed: number;
  },
): ArmSeries {
  const building = sweepTower(config, options);
  const dispatcherProfile = config.dispatcherProfilesById.get('eta');
  if (dispatcherProfile === undefined) {
    throw new Error('data/dispatcher-profiles.json has no profile "eta"; the sweep has no arm to run.');
  }
  const ttdS: number[] = [];
  const awtS: number[] = [];
  let suppressed = 0;
  for (let replication = 0; replication < options.replications; replication += 1) {
    const result = new Simulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      // The pairing. Derived from `(experimentSeed, replication)` and from nothing else, so the
      // three arms at one replication index see the identical trace — the arms differ in the
      // building's cars, never in the demand.
      seed: replicationSeed(options.seed, replication),
      onTimeout: 'report',
    }).run();
    ttdS.push(result.summary.timeToDestination.meanS);
    awtS.push(result.summary.waiting.meanS);
    if (!result.summary.awtIsValid) suppressed += 1;
  }
  return {
    ttdS,
    awtS,
    suppressed,
    descentSpeedMps: building.banks[0]?.cars[0]?.descentSpeedMps,
  };
}

export interface HeightSweepOptions {
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
  readonly travelsM?: readonly number[] | undefined;
  readonly trafficProfile?: string | undefined;
  readonly config?: LoadedConfig | undefined;
}

/** The sweep. One row per travel; every cell a paired-t interval at 95 %. */
export async function runDescentCapHeightStudy(
  options: HeightSweepOptions = {},
): Promise<HeightSweep> {
  const config = options.config ?? (await loadResources());
  const replications = options.replications ?? HEIGHT_SWEEP_REPLICATIONS;
  const seed = options.seed ?? HEIGHT_SWEEP_SEED;
  const travelsM = options.travelsM ?? HEIGHT_SWEEP_TRAVEL_M;
  const trafficProfile = options.trafficProfile ?? DOWN_PEAK_PROFILE;
  const thresholdM = config.elevatorSpecs.airPressure?.appliesAboveTravelM ?? Infinity;

  const rows: HeightSweepRow[] = [];
  for (const travelM of travelsM) {
    const shared = { travelM, trafficProfile, replications, seed } as const;
    const base = seriesFor(config, { ...shared, arm: 'base' });
    const capped = seriesFor(config, { ...shared, arm: 'capped' });
    const lifted = seriesFor(config, { ...shared, arm: 'lifted' });
    rows.push({
      travelM,
      floors: Math.round(travelM / FLOOR_PITCH_M) + 1,
      aboveThreshold: travelM > thresholdM,
      cappedGain: pairedDifferenceEstimate(capped.ttdS, base.ttdS),
      liftedGain: pairedDifferenceEstimate(lifted.ttdS, base.ttdS),
      pressurisationGain: pairedDifferenceEstimate(lifted.ttdS, capped.ttdS),
      descentSpeedMps: Object.freeze({
        base: base.descentSpeedMps,
        capped: capped.descentSpeedMps,
        lifted: lifted.descentSpeedMps,
      }),
      suppressed: base.suppressed + capped.suppressed + lifted.suppressed,
      quotable: base.suppressed + capped.suppressed + lifted.suppressed === 0,
    });
  }

  const quotable = rows.filter((row) => row.quotable);
  const below = quotable.filter((row) => !row.aboveThreshold);
  const unresolvedBelow = below.filter((row) => !paid(row.cappedGain));
  let stopped: HeightSweepRow | undefined;
  let because: string | undefined;
  if (below.length === 0) {
    because = 'no quotable row sits below the threshold, so there is no baseline to cross from';
  } else if (unresolvedBelow.length > 0) {
    because = `the purchase is already unresolvable below the threshold (at ${unresolvedBelow
      .map((row) => `${row.travelM} m`)
      .join(', ')}), so a crossover above it could not be attributed to the cap`;
  } else {
    stopped = quotable.find(
      (row) => row.aboveThreshold && !paid(row.cappedGain) && paid(row.liftedGain),
    );
    if (stopped === undefined) {
      because = 'the next speed class still pays unpressurised at every quotable swept height';
    }
  }

  return Object.freeze({
    trafficProfileId: trafficProfile,
    replications,
    seed,
    rows: Object.freeze(rows),
    stopsPayingAboveM: stopped?.travelM,
    stopsPayingUnavailableBecause: because,
  });
}

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

const s = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
const cell = (estimate: PublishedMeanEstimate): string =>
  `${s(estimate.mean)} [${s(estimate.lower)}, ${s(estimate.upper)}]${paid(estimate) ? '' : ' (contains 0)'}`;

/** The study as a table. The only renderer; nothing here re-derives a figure. */
export function formatDescentCapHeightStudy(study: HeightSweep): string {
  const lines = [
    `descent cap · height sweep · ${study.trafficProfileId} · n = ${study.replications} · seed ${study.seed}`,
    'travel  floors  cap?  sat  next class (unpressurised)        next class (pressurised)          the cabin itself',
  ];
  for (const row of study.rows) {
    lines.push(
      [
        `${String(row.travelM).padStart(5)} m`,
        String(row.floors).padStart(6),
        row.aboveThreshold ? ' yes' : '  no',
        row.quotable ? '   ' : 'SAT',
        row.quotable ? cell(row.cappedGain).padEnd(33) : 'suppressed'.padEnd(33),
        row.quotable ? cell(row.liftedGain).padEnd(33) : 'suppressed'.padEnd(33),
        row.quotable ? cell(row.pressurisationGain) : `suppressed (${row.suppressed} of ${study.replications * 3} replications refused an AWT)`,
      ].join('  '),
    );
  }
  lines.push(
    study.stopsPayingAboveM === undefined
      ? `no crossover: ${study.stopsPayingUnavailableBecause ?? 'unstated'}`
      : `the next speed class stops paying above ${study.stopsPayingAboveM} m unless the cabins are pressurised`,
  );
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The non-test caller
 * -------------------------------------------------------------------------- */

/**
 * The non-test caller (docs/05-roadmap.md § Standing requirement), and the command the table in
 * this module's header came from.
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/descentCapHeight.js
 * ```
 *
 * `collectiveAdoption.ts`'s shape and its reason. `regeneratePins.ts` drives the half of
 * `benchmark/` whose figures are pinned and `livenessSuite.ts` drives the categorical half; this
 * study fits neither. It **computes** intervals, so it is not categorical — but the assertions its
 * suite makes on it are structural (the arms are the configurations claimed; the cabin buys exactly
 * zero below the threshold; a saturated row is refused), the digits are published as a dated record
 * rather than as a pin, and a full sweep is eight heights times three arms times sixty replications
 * on two templates. Pinning that would be minutes of simulation on every regeneration to hold
 * digits nothing else quotes. So it is its own command, classified `'no-intervals'` in
 * `published.ts` with that reason written beside it.
 *
 * Both templates, because the up-peak arm's **refusal** is half the finding: the purchase is
 * unresolvable there before the cap is in force, and printing only the template that worked would
 * be publishing the arm that agreed.
 */
export async function main(): Promise<void> {
  const config = await loadResources();
  for (const trafficProfile of [DOWN_PEAK_PROFILE, UP_PEAK_PROFILE]) {
    const study = await runDescentCapHeightStudy({ config, trafficProfile });
    process.stdout.write(`${formatDescentCapHeightStudy(study)}\n\n`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
