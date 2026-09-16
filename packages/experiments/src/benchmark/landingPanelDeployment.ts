/**
 * **What a destination panel is worth, landing by landing** — GitHub issue
 * [#437](https://github.com/mrpeanut01/elevator-sim/issues/437) stage 2,
 * [`DECISIONS.md` § D619](../../../../DECISIONS.md).
 *
 * ## Why this file exists
 *
 * § D553 made panel presence per-landing data and closed stage 1 with a claim it deliberately did
 * not make: *"nothing here says a hybrid is better. That is stage 2's pinned measurement, on the
 * legs, with a paired interval over common random numbers."* This is that measurement.
 *
 * The question is the one Al-Kodmany (Buildings 2015, 5(3), 1070–1104) § 2.2.1 raises and #437
 * quotes: a *hybrid configuration* puts destination panels on the busiest landings — *"mainly the
 * ground or lobby floor"* — and leaves conventional buttons on the rest. That is an allocation
 * problem rather than a switch, and an allocation problem needs a price and a measurement before it
 * is a decision. The price is `data/price-schedule.json`'s `landing-panels` row; this is the
 * measurement.
 *
 * ## The three deployments, and why the dispatcher is held fixed
 *
 * Every arm runs `destination-panel`, the Level-1 profile, and differs **only** in which landings
 * carry its fixture:
 *
 * | arm | landings with a panel | what `comparabilityOfLandings` calls the run |
 * |---|---|---|
 * | `none` | none — every landing declares `up-down-buttons` | `conventional` |
 * | `entrance` | the building's own `isEntrance` landings | `hybrid` |
 * | `full` | every landing, by declaring nothing (§ D553 clause 1) | `destination-dispatch` |
 *
 * The dispatcher is fixed because a landing panel only names a car when the dispatcher assigns one:
 * under a conventional profile all three arms are the same run, and the comparison would be of
 * nothing. Holding it fixed is what makes the difference *the panels* rather than the policy.
 *
 * **`entrance` is derived from the building, never listed here.** `isEntrance` is the building's own
 * statement about which landings the crowd arrives at, and on Midtown Office it names two — `G` and
 * `P1`. A hand-written `['G']` would be this file choosing the busiest landing on the paper's behalf
 * and then measuring its own choice.
 *
 * ## Two cells, because one of them cannot separate the arms and that is the finding
 *
 * | cell | shape | rate | why |
 * |---|---|---|---|
 * | {@link UP_PEAK_CELL} | `rise-and-fall`, 900 s, incoming only through `G` | 1 %POP/5 min | the apparatus `matrixCells.ts`'s `midtown-up-peak` already runs, and the highest rate at which every arm returns a valid AWT at this budget — censused, see below |
 * | {@link MIXED_CELL} | 40/30/30, 1800 s, whole run reported | 1.5 %POP/5 min | `docs/09` § 2.2's operating point, the mix in which a destination says more than a direction, and the one `core`'s `sim/landingPanels.test.ts` moves the control at |
 *
 * ## The result, measured at seed 20 260 726, n = 200 under common random numbers
 *
 * Candidate − baseline on the gate, on the tree this file landed on. Every arm of both cells is
 * quotable with **zero** replications saturated, and both cells report `crnAligned`.
 *
 * | cell | pair | ΔTTD (s) | verdict | `requiredReplications` |
 * |---|---|---|---|---|
 * | up-peak 1 % | `entrance` − `none` | −0.1516 [−0.5603, +0.2571] | INDISTINGUISHABLE | 1 436 |
 * | up-peak 1 % | `full` − `none` | −0.1516 [−0.5603, +0.2571] | INDISTINGUISHABLE | 1 436 |
 * | up-peak 1 % | `entrance` − `full` | 0.0000 [0.0000, 0.0000] | IDENTICAL | — |
 * | mixed 1.5 % | `entrance` − `none` | −0.3180 [−0.5246, −0.1113] | BETTER | 1 |
 * | mixed 1.5 % | `full` − `none` | −1.6121 [−1.9039, −1.3202] | BETTER | 1 |
 * | mixed 1.5 % | `entrance` − `full` | +1.2941 [+0.9936, +1.5945] | WORSE | 1 |
 *
 * **Under the up-peak cell `entrance` and `full` are bit-identical**, on every metric, at every one
 * of the 200 replications. That is not a null result and it is not a defect, and the reading is the
 * arm's own declaration rather than an inference about behaviour: {@link UP_PEAK_CELL} declares
 * `incoming: 1` and `entranceWeights: { G: 1, P1: 0 }`, so every leg in the run begins at `G` and no
 * call is ever registered anywhere else. The other nineteen panels are never pressed. **Two panels buy exactly what twenty-one do**, and the run says so rather than this
 * sentence saying it — {@link LandingPanelPair.exactZeroCount} is 200 of 200 on all four metrics.
 * Neither deployment is distinguishable from buttons on the gate at that cell. Two things are
 * counted rather than argued about that: **144 of the 200 replications are *exactly* unchanged** by
 * the panels on the gate, and a replication at this rate carries about **twenty-six** legs. **Why
 * the panels change nothing on those 144 is not measured**, and no sentence is offered in place of
 * a measurement — [§ D256](../../../../DECISIONS.md).
 *
 * **Under the mixed cell they separate, and the ordering is monotone in panels.** Both deployments
 * beat the button-only one on time-to-destination with intervals clear of zero at n = 1, and full
 * beats the hybrid. So the paper's claim is reproduced in the direction it is made — panels on the
 * busiest landings are where the benefit is — and its limit is measured too: away from a pure
 * up-peak the landings a hybrid leaves out are landings that generate calls, and leaving them out
 * costs **+1.294 s** of time-to-destination against the full deployment.
 *
 * **The cost is reported beside the gate and is not folded into it** (§ D106, § D27). Energy per
 * served leg is **WORSE** for both deployments at both cells — up-peak `+3.1594 [+1.6342, +4.6846]`
 * for either deployment, mixed `+0.7860 [+0.0184, +1.5537]` for the hybrid and
 * `+4.7895 [+3.7543, +5.8248]` for the full one — so the hybrid buys a fifth of the full
 * deployment's time for a sixth of its energy penalty and a tenth of its panels. AWT and WT95 are
 * **refused**, not reported as verdicts: see below.
 *
 * **No mechanism is offered beyond what is counted.** Why the effect is the size it is, on this
 * building, is not measured here, and a plausible sentence in place of a measurement is what
 * [§ D256](../../../../DECISIONS.md) refuses. Nothing here is a claim about any other building: the
 * pair § D595 measured on a second tower is the standing reminder that a destination effect can be
 * building-dependent.
 *
 * ## What may be paired, decided by `core` rather than by this file
 *
 * All three arms run different passenger models, so `metrics/comparability.ts#comparabilityBetween`
 * refuses the **nine** model-sensitive metrics on **every** pair here — including `entrance`
 * against `full`, which a label comparison would also refuse, and including `entrance` against a
 * second hybrid with panels elsewhere, which it would not. The gate is therefore `ttdMeanS`, the
 * span `journeyStartedAt → alightedAt` that means the same thing under all three, and every pair
 * carries the refusal it was computed under ({@link LandingPanelPair.comparable}). AWT and WT95 are
 * still *measured* and still reported, because § D27 requires a cost to be shown rather than
 * hidden — but the refusal is carried as a **value** rather than as a warning a reader may skip:
 * {@link LandingPanelPair.verdict} reads `NOT-COMPARABLE` on every one of them, so no caller of
 * this study can obtain `BETTER` from an AWT taken across two passenger models.
 * `landingPanelDeployment.test.ts` asserts that in both directions.
 *
 * Energy is beside the gate and never folded into it ([§ D106](../../../../DECISIONS.md)), and it
 * is `energyPerServedLegKJ` rather than raw `energyKJ` for that entry's own reason.
 *
 * ## Common random numbers, asserted rather than assumed
 *
 * The three arms are three *buildings*, and `crn.ts#traceKeyOf` keys a cohort on the building's
 * **id** — so each arm is registered under `midtown-office`'s own id in resources of its own, and
 * the three runs share a seed. That is honest rather than convenient: a landing fixture is not read
 * by the trace generator, so the three arms genuinely see one crowd, and the file proves it instead
 * of arguing it — {@link LandingPanelCellResult.crnAligned} compares the per-replication trace
 * digests across all three arms, and the suite requires it.
 *
 * ## Runtime
 *
 * Two cells × three arms × 200 replications — 1 200 runs. Measured on this tree at **13.4 s**
 * running alone, which is why this study is cheap enough to be pinned rather than dated.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  comparabilityBetween,
  comparabilityOfLandings,
  parseBuilding,
  resolveBuilding,
  type CallType,
  type LoadedConfig,
  type PassengerModel,
  type ResolvedBuilding,
} from '@elevator-sim/core';

import type { ReplicationMetric } from '../runner/metrics.js';
import type { ExperimentResources, TrafficArmSpec } from '../runner/types.js';
import {
  DATA_DIR,
  cellOf,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
} from '../validation/harness.js';

import { BENCHMARK_SEED } from './suite.js';
import { compareCell, type CellComparison, type CellVerdict } from './verdict.js';

/* -------------------------------------------------------------------------- *
 * The operating points
 * -------------------------------------------------------------------------- */

/** The building. #437's own choice, and the one every destination figure in this tree is stated on. */
export const LANDING_PANEL_BUILDING = 'midtown-office';

/**
 * The dispatcher, fixed across every arm.
 *
 * Level 1 — `callType: mobile-credential`, `passengerAssignment: panel`. Under Level 0 a landing
 * panel discloses a destination and names no car, so `landingPassengerModelOf` returns
 * `conventional` for every landing whatever it declares, and the three arms would be one run.
 */
export const LANDING_PANEL_DISPATCHER = 'destination-panel';

/** The budget. The top of `CLAUDE.md`'s 50–200 band, admissible because the census below says so. */
export const LANDING_PANEL_REPLICATIONS = 200;

/** `BENCHMARK_SEED`, the seed every destination study in this directory is stated at. */
export const LANDING_PANEL_SEED = BENCHMARK_SEED;

/**
 * Midtown Office's up-peak, at `matrixCells.ts`'s own `midtown-up-peak` shape.
 *
 * `rise-and-fall` is the default template, so this is #437's *"under `rise-and-fall`"* at the
 * apparatus the matrix already states this building's figures on: 900 s, incoming only, entrance
 * weighted entirely to `G`, the peak five minutes reported.
 *
 * **1 % rather than 4 %, censused at this budget rather than inherited.** At n = 200 on this tree,
 * `panels-none` first loses its AWT at 2 % (one replication invalidated of two hundred) and every
 * arm is clean at 1 %; at 3 % sixteen of the panel arms' replications go and at 4 % twenty-nine. So
 * 1 % is the highest quotable rate here, and § D595's lesson is the reason the census is run at the
 * budget the study spends: at n = 20 this cell looks quotable at 2 %.
 */
export const UP_PEAK_CELL: TrafficArmSpec = Object.freeze({
  id: 'up-peak-1pct',
  durationS: 900,
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 1, outgoing: 0, interfloor: 0 }),
    entranceWeights: Object.freeze({ G: 1, P1: 0 }),
    arrivalRatePctPop5min: 1,
    peakWindowS: 300,
  }),
});

/**
 * The mixed day: 40 % incoming, 30 % outgoing, 30 % interfloor, over half an hour reported whole.
 *
 * `docs/09` § 2.2's operating point, and the one `core`'s `sim/landingPanels.test.ts` uses as its
 * interfloor mix. It is in this study because the up-peak cell cannot ask the question #437 is
 * about: where every call is registered at one landing, a panel on that landing *is* the full
 * deployment, and the allocation puzzle has one answer. Here every landing generates calls, so the
 * landings a hybrid leaves out are landings that are used.
 *
 * 1.5 % is `docs/09`'s rate, and at this budget every arm is quotable there.
 */
export const MIXED_CELL: TrafficArmSpec = Object.freeze({
  id: 'mixed-1.5pct',
  durationS: 1800,
  reportWindow: 'full-run',
  demand: Object.freeze({
    directionalSplit: Object.freeze({ incoming: 0.4, outgoing: 0.3, interfloor: 0.3 }),
    arrivalRatePctPop5min: 1.5,
    peakWindowS: 300,
  }),
});

/** The two cells, in the order the header's table reads. */
export const LANDING_PANEL_CELLS: readonly TrafficArmSpec[] = Object.freeze([
  UP_PEAK_CELL,
  MIXED_CELL,
]);

/**
 * The metrics read off every arm.
 *
 * `ttdMeanS` first because it is the gate: it is the one span that means the same thing under all
 * three passenger models. The other three are reported beside it — the two wait figures as costs
 * § D27 requires to be shown, refused as comparisons by `comparabilityBetween`, and the energy
 * figure on § D106's footing, per served leg rather than raw.
 */
export const LANDING_PANEL_METRICS: readonly ReplicationMetric[] = Object.freeze([
  'ttdMeanS',
  'awtS',
  'wt95S',
  'energyPerServedLegKJ',
]);

/** The gate. Every verdict this study draws is drawn from this metric and no other. */
export const LANDING_PANEL_GATE: ReplicationMetric = 'ttdMeanS';

/* -------------------------------------------------------------------------- *
 * The deployments
 * -------------------------------------------------------------------------- */

/** The three deployments, in ascending panel count. */
export const LANDING_PANEL_ARMS = Object.freeze(['none', 'entrance', 'full'] as const);

export type LandingPanelArmId = (typeof LANDING_PANEL_ARMS)[number];

/**
 * The pairs compared, candidate first.
 *
 * `none` is the baseline for the two deployments because #437 asks what a hybrid *buys*; the third
 * pair is the one the issue's allocation question turns on, and it is the pair that is
 * bit-identical under a pure up-peak.
 */
export const LANDING_PANEL_PAIRS: readonly (readonly [LandingPanelArmId, LandingPanelArmId])[] =
  Object.freeze([
    Object.freeze(['entrance', 'none'] as const),
    Object.freeze(['full', 'none'] as const),
    Object.freeze(['entrance', 'full'] as const),
  ]);

/**
 * A shipped building re-authored with `landingCallType` declared on the named landings.
 *
 * Re-authored through `parseBuilding` and `resolveBuilding` exactly as `loadConfig` calls them, and
 * with the shipped file path, so a building that declares nothing comes back byte-identical to the
 * shipped one — § D553 clause 1's identity, which `core`'s `sim/landingPanelIdentity.test.ts` holds
 * over every shipped building. Mutating a `ResolvedBuilding` instead would build a configuration no
 * loader would accept and would prove nothing about the shipped path.
 *
 * **The id is deliberately unchanged.** `crn.ts#traceKeyOf` keys a CRN cohort on the building's id,
 * so three arms under three ids are three cohorts and a paired difference across them would be
 * unaudited by construction. A landing fixture is not read by the trace generator, so the arms
 * genuinely share a crowd; keeping the id is what lets the runner say so, and
 * {@link LandingPanelCellResult.crnAligned} is what checks it.
 *
 * `core` carries the same function as a test helper (`sim/fixtures.test-helper.ts`), which this
 * package cannot import: it is neither exported from `@elevator-sim/core` nor shipped in its
 * `dist`. The duplication is named here rather than left for a reader to find.
 */
function reauthoredWithLandings(
  config: LoadedConfig,
  buildingId: string,
  declared: Readonly<Record<string, CallType>>,
): ResolvedBuilding {
  const file = join(DATA_DIR, 'buildings', `${buildingId}.json`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { floors?: Record<string, unknown>[] };
  const seen = new Set<string>();
  const floors = (raw.floors ?? []).map((floor) => {
    const id = String(floor['id']);
    const landingCallType = declared[id];
    if (landingCallType === undefined) return floor;
    seen.add(id);
    return { ...floor, landingCallType };
  });
  const missing = Object.keys(declared).filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`${buildingId} authors no explicit floor ${missing.join(', ')}`);
  }
  return resolveBuilding(parseBuilding({ ...raw, floors }, file), config.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/** What one deployment declares at each landing, and how many panels that is. */
export interface LandingPanelDeployment {
  readonly armId: LandingPanelArmId;
  /** The building this arm runs, re-authored. */
  readonly building: ResolvedBuilding;
  /** Landing ids carrying a destination fixture, in building order. The price's quantity. */
  readonly panelFloorIds: readonly string[];
  /** `panelFloorIds.length` — what a per-landing price multiplies (`docs/38` § 2.1). */
  readonly panelCount: number;
  /** What `comparabilityOfLandings` calls a run of this building under this dispatcher. */
  readonly passengerModel: PassengerModel;
}

/**
 * The three deployments for a building and a dispatcher.
 *
 * `full` declares **nothing**, rather than declaring the dispatcher's own call type everywhere: the
 * two are byte-identical by § D553 clause 1, and the undeclared one is the shipped building, so the
 * arm that is *today's behaviour* is today's building rather than a re-authored copy of it.
 */
export function landingPanelDeploymentsFor(
  config: LoadedConfig,
  buildingId: string,
  dispatcherId: string,
): readonly LandingPanelDeployment[] {
  const shipped = config.buildingsById.get(buildingId);
  if (shipped === undefined) throw new Error(`no building "${buildingId}"`);
  const profile = config.dispatcherProfilesById.get(dispatcherId);
  if (profile === undefined) throw new Error(`no dispatcher profile "${dispatcherId}"`);
  const stage = {
    callType: profile.dispatch?.callType ?? 'up-down-buttons',
    passengerAssignment: profile.dispatch?.passengerAssignment ?? 'none',
  } as const;

  const ids = shipped.floors.map((floor) => floor.id);
  const entrances = shipped.floors.filter((floor) => floor.isEntrance).map((floor) => floor.id);
  if (entrances.length === 0) throw new Error(`building "${buildingId}" flags no entrance`);

  const buttons = Object.fromEntries(ids.map((id) => [id, 'up-down-buttons' as CallType]));
  const entranceOnly: Record<string, CallType> = { ...buttons };
  for (const id of entrances) entranceOnly[id] = stage.callType;

  const declarations: Readonly<Record<LandingPanelArmId, Readonly<Record<string, CallType>>>> = {
    none: buttons,
    entrance: entranceOnly,
    full: {},
  };

  return Object.freeze(
    LANDING_PANEL_ARMS.map((armId) => {
      const building =
        armId === 'full' ? shipped : reauthoredWithLandings(config, buildingId, declarations[armId]);
      const landings = building.floors.map((floor) => ({
        id: floor.id,
        landingCallType: floor.landingCallType,
      }));
      const comparability = comparabilityOfLandings(stage, landings);
      // The assigning landings are exactly what the run's own comparability object carries for a
      // hybrid. For the two uniform arms it carries none, by construction, so the count is derived
      // from the model rather than from an absent field.
      const panelFloorIds =
        comparability.passengerModel === 'hybrid'
          ? (comparability.assigningFloorIds ?? [])
          : comparability.passengerModel === 'destination-dispatch'
            ? ids
            : [];
      return Object.freeze({
        armId,
        building,
        panelFloorIds: Object.freeze([...panelFloorIds]),
        panelCount: panelFloorIds.length,
        passengerModel: comparability.passengerModel,
      });
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * The study
 * -------------------------------------------------------------------------- */

/** One arm of one cell, as run. */
export interface LandingPanelArmResult {
  readonly armId: LandingPanelArmId;
  readonly panelCount: number;
  readonly passengerModel: PassengerModel;
  /** Whether this cell's AWT survived every replication. `false` makes every pair `UNQUOTABLE`. */
  readonly awtIsValid: boolean;
  /** Replications whose run saturated. Reported whether or not it is zero. */
  readonly saturatedCount: number;
}

/** One pair of deployments, on one metric. */
export interface LandingPanelPair {
  readonly metric: ReplicationMetric;
  readonly candidateId: LandingPanelArmId;
  readonly baselineId: LandingPanelArmId;
  readonly comparison: CellComparison;
  /**
   * Whether `core` permits this metric to be paired between these two runs — the verdict of
   * `comparabilityBetween` on the two arms' own comparability objects, read for this metric id.
   *
   * `false` on all nine model-sensitive metrics for every pair in this study, because no two arms
   * run the same landing models. A `false` here is not a weaker result: it is the statement that
   * the number below measures two different constructs and may not be read as a difference.
   */
  readonly comparable: boolean;
  /**
   * The verdict this pair may be read as — `'NOT-COMPARABLE'` wherever {@link comparable} is false.
   *
   * The refusal is expressed as a **value** rather than as a docstring asking the reader to check
   * `comparable` first. `comparison.verdict` is still whatever the arithmetic says, because the
   * estimate is still a real paired difference and § D27 requires the cost to be shown; what this
   * field refuses is reading that difference as *better* or *worse*, which is precisely what
   * § D553's pairing rule forbids on the nine. A study that published `BETTER` from an AWT across
   * two passenger models would be the silent failure `metrics/comparability.ts` was written to make
   * impossible, and a field is harder to skip than a sentence.
   */
  readonly verdict: CellVerdict | 'NOT-COMPARABLE';
  /** Replications on which the two arms produced exactly the same value. */
  readonly exactZeroCount: number;
}

/** One cell of the study. */
export interface LandingPanelCellResult {
  readonly cellId: string;
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly replications: number;
  readonly arms: readonly LandingPanelArmResult[];
  readonly pairs: readonly LandingPanelPair[];
  /** Whether all three arms saw the same passenger trace at every replication index. */
  readonly crnAligned: boolean;
}

export interface LandingPanelDeploymentStudy {
  readonly seed: number;
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly cells: readonly LandingPanelCellResult[];
}

export interface LandingPanelStudyOptions {
  readonly resources?: LoadedConfig | undefined;
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
  readonly cells?: readonly TrafficArmSpec[] | undefined;
}

/** A resources object carrying this arm's building under the shipped building's own id. */
function resourcesFor(config: LoadedConfig, building: ResolvedBuilding): ExperimentResources {
  const buildingsById = new Map(config.buildingsById);
  buildingsById.set(building.id, building);
  return Object.freeze({
    buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  });
}

/**
 * Run the study.
 *
 * Its non-test caller is `regeneratePins.ts`, which is how every interval in `benchmark/` becomes a
 * figure a reader can re-derive rather than one somebody typed.
 */
export async function runLandingPanelDeploymentStudy(
  options: LandingPanelStudyOptions = {},
): Promise<LandingPanelDeploymentStudy> {
  const config = options.resources ?? (await loadResources());
  const replications = options.replications ?? LANDING_PANEL_REPLICATIONS;
  const seed = options.seed ?? LANDING_PANEL_SEED;
  const deployments = landingPanelDeploymentsFor(
    config,
    LANDING_PANEL_BUILDING,
    LANDING_PANEL_DISPATCHER,
  );
  const byArm = new Map(deployments.map((deployment) => [deployment.armId, deployment]));

  const cells: LandingPanelCellResult[] = [];
  for (const traffic of options.cells ?? LANDING_PANEL_CELLS) {
    const runs = new Map<LandingPanelArmId, Awaited<ReturnType<typeof runGateExperiment>>>();
    for (const deployment of deployments) {
      runs.set(
        deployment.armId,
        await runGateExperiment({
          id: `landing-panel-deployment/${traffic.id}/${deployment.armId}`,
          seed,
          building: deployment.building.id,
          dispatchers: [LANDING_PANEL_DISPATCHER],
          traffic,
          replications,
          resources: resourcesFor(config, deployment.building),
        }),
      );
    }

    const cellFor = (armId: LandingPanelArmId) => {
      const run = runs.get(armId);
      if (run === undefined) throw new Error(`arm "${armId}" did not run`);
      return cellOf(run, LANDING_PANEL_DISPATCHER);
    };
    const samplesFor = (armId: LandingPanelArmId, metric: ReplicationMetric) => {
      const run = runs.get(armId);
      if (run === undefined) throw new Error(`arm "${armId}" did not run`);
      return samplesOf(run, LANDING_PANEL_DISPATCHER, metric);
    };

    const arms: LandingPanelArmResult[] = deployments.map((deployment) => {
      const cell = cellFor(deployment.armId);
      return Object.freeze({
        armId: deployment.armId,
        panelCount: deployment.panelCount,
        passengerModel: deployment.passengerModel,
        awtIsValid: cell.aggregate.awtIsValid,
        saturatedCount: cell.replications.filter((record) => record.saturated).length,
      });
    });
    const quotable = new Map(arms.map((arm) => [arm.armId, arm.awtIsValid]));

    const pairs: LandingPanelPair[] = [];
    for (const [candidateId, baselineId] of LANDING_PANEL_PAIRS) {
      const candidate = byArm.get(candidateId);
      const baseline = byArm.get(baselineId);
      if (candidate === undefined || baseline === undefined) throw new Error('missing arm');
      // The refusal is `core`'s, read off the two runs' own comparability objects rather than
      // decided here. No `equipment` argument: every arm runs the same banks, so § D539's second
      // axis cannot bite and passing a pair of identical bases would only claim it was checked.
      const permitted = comparabilityBetween(
        comparabilityOfLandings(stageOf(config, LANDING_PANEL_DISPATCHER), landingsOf(candidate)),
        comparabilityOfLandings(stageOf(config, LANDING_PANEL_DISPATCHER), landingsOf(baseline)),
      );
      for (const metric of LANDING_PANEL_METRICS) {
        const candidateSamples = samplesFor(candidateId, metric);
        const baselineSamples = samplesFor(baselineId, metric);
        const comparison = compareCell({
          metric,
          armId: candidateId,
          baselineId,
          candidate: candidateSamples,
          baseline: baselineSamples,
          quotable: (quotable.get(candidateId) ?? false) && (quotable.get(baselineId) ?? false),
        });
        const comparable = permitted.comparableMetrics.includes(metric);
        pairs.push(
          Object.freeze({
            metric,
            candidateId,
            baselineId,
            comparison,
            comparable,
            verdict: comparable ? comparison.verdict : ('NOT-COMPARABLE' as const),
            exactZeroCount: candidateSamples.filter(
              (value, index) => value === baselineSamples[index],
            ).length,
          }),
        );
      }
    }

    const digests = LANDING_PANEL_ARMS.map((armId) => {
      const run = runs.get(armId);
      if (run === undefined) throw new Error(`arm "${armId}" did not run`);
      return digestsOf(run, LANDING_PANEL_DISPATCHER);
    });
    const reference = digests[0] ?? [];
    cells.push(
      Object.freeze({
        cellId: traffic.id,
        buildingId: LANDING_PANEL_BUILDING,
        dispatcherId: LANDING_PANEL_DISPATCHER,
        replications,
        arms: Object.freeze(arms),
        pairs: Object.freeze(pairs),
        crnAligned: digests.every(
          (arm) => arm.length === reference.length && arm.every((d, i) => d === reference[i]),
        ),
      }),
    );
  }

  return Object.freeze({
    seed,
    buildingId: LANDING_PANEL_BUILDING,
    dispatcherId: LANDING_PANEL_DISPATCHER,
    cells: Object.freeze(cells),
  });
}

/** The resolved dispatch stage a profile runs, as far as a landing's model is concerned. */
function stageOf(config: LoadedConfig, dispatcherId: string) {
  const profile = config.dispatcherProfilesById.get(dispatcherId);
  if (profile === undefined) throw new Error(`no dispatcher profile "${dispatcherId}"`);
  return {
    callType: profile.dispatch?.callType ?? ('up-down-buttons' as CallType),
    passengerAssignment: profile.dispatch?.passengerAssignment ?? ('none' as const),
  };
}

/** One deployment's landings, in the shape `comparabilityOfLandings` reads. */
function landingsOf(deployment: LandingPanelDeployment) {
  return deployment.building.floors.map((floor) => ({
    id: floor.id,
    landingCallType: floor.landingCallType,
  }));
}

/* -------------------------------------------------------------------------- *
 * Reading a study
 * -------------------------------------------------------------------------- */

/** The key a figure is pinned under: `<cell>/<candidate>-<baseline>/<metric>`. */
export function landingPanelPairKey(
  cellId: string,
  pair: Pick<LandingPanelPair, 'candidateId' | 'baselineId' | 'metric'>,
): string {
  return `${cellId}/${pair.candidateId}-${pair.baselineId}/${pair.metric}`;
}

/** One cell of a study, by id. @throws Error when there is not exactly one. */
export function landingPanelCell(
  study: LandingPanelDeploymentStudy,
  cellId: string,
): LandingPanelCellResult {
  const found = study.cells.filter((cell) => cell.cellId === cellId);
  if (found.length !== 1) {
    throw new Error(`expected exactly one cell "${cellId}"; found ${String(found.length)}`);
  }
  return found[0] as LandingPanelCellResult;
}

/** One pair of a cell, by candidate, baseline and metric. @throws Error when there is not one. */
export function landingPanelPair(
  cell: LandingPanelCellResult,
  candidateId: LandingPanelArmId,
  baselineId: LandingPanelArmId,
  metric: ReplicationMetric,
): LandingPanelPair {
  const found = cell.pairs.filter(
    (pair) =>
      pair.candidateId === candidateId && pair.baselineId === baselineId && pair.metric === metric,
  );
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one ${candidateId} − ${baselineId} pair on ${metric} in cell "${cell.cellId}"; found ${String(found.length)}`,
    );
  }
  return found[0] as LandingPanelPair;
}
