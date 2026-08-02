/**
 * What en-route diversion is worth — the study behind `eligibility.enRouteDiversion`.
 *
 * ## The defect this measures the repair of
 *
 * A car in flight used to be judged from its **destination**, because that was the only place
 * the kernel could stop it: `Car.departFor` refuses a second move and `Simulation` scheduled one
 * arrival per run. So a down call raised on a floor between a descending car and the lobby
 * scored two direction reversals — the worst `directionReversal` can return — and `collective`'s
 * `noDirectionReversal` hard constraint refused the one car in the building already heading
 * there, facing the right way. Measured on Midtown Office at 3 % of population per five minutes,
 * a load whose AWT is nowhere near saturation, **58.2 % of down-travelling legs were physically
 * driven past by a car moving in their own direction, and every one of those cars had room**.
 * The dispatcher was not choosing badly; the model could not express the choice.
 *
 * The repair is a commit point — the last floor a car can still decelerate into, computed by
 * `sharedPrefixSeconds` from the two motion profiles rather than from a braking approximation —
 * plus a kernel that really cuts the run short there. `eligibility.enRouteDiversion` is the
 * switch, off by default so that every run measured before it existed replays bit-identically.
 *
 * ## Why this file exists rather than a note in the commit message
 *
 * Because "the elevators stop for people now" is exactly the kind of claim that is obviously
 * true, easy to believe, and not measured. CLAUDE.md § Statistical discipline permits declaring
 * one alternative better than another **only** through a paired-t interval that excludes zero,
 * over 50–200 replications under common random numbers. Single runs of this change move AWT in
 * both directions depending on the seed and the rate, which is precisely the regime where the
 * literature's *"increasing lift speed appearing to increase average waiting time"* failure
 * lives.
 *
 * So this reports an interval and lets it say what it says. The arms differ in **one authored
 * field** — `collective` against itself with `enRouteDiversion: true` — so the difference cannot
 * be attributed to a weight, a constraint or a parking strategy.
 *
 * ## What is deliberately not in the arm
 *
 * `dispatch.reassignmentPolicy: 'until-commitment'`. A call is frozen on its car at assignment
 * under every shipped profile, so a call given to a distant car before a nearer one began
 * descending can never move to the car that later flies past — which caps what diversion alone
 * can recover. Turning reassignment on is the obvious companion change and it is **not** made
 * here: measured on this building it drives `collective` into saturation (AWT above 850 s at
 * every rate tried, with `diversions` still zero, so it is not diversion doing it). That is a
 * pre-existing pathology in the reassignment path, it is worth its own investigation, and
 * bundling it into this arm would have made a working mechanism look like a broken one.
 */

import {
  cellOf,
  comparePaired,
  derivedProfile,
  digestsOf,
  loadResources,
  runGateExperiment,
  samplesOf,
  withProfiles,
  type PairedComparison,
} from '../validation/harness.js';
import type { DispatcherProfile, LoadedConfig } from '@elevator-sim/core';
import type { ReplicationMetric } from '../runner/metrics.js';
import type { TrafficArmSpec } from '../runner/types.js';

/** Down-peak at one point. Garden Apartments has one entrance, so it needs no entrance weights. */
function downPeakAt(point: DiversionPoint): TrafficArmSpec {
  return Object.freeze({
    id: `${point.building}-down-peak-${point.rate}`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
      arrivalRatePctPop5min: point.rate,
      peakWindowS: 300,
    }),
  });
}

/** The baseline arm: conventional collective, exactly as shipped. */
export const BASELINE_ID = 'collective';
/** The candidate arm: the same profile with the one field flipped. */
export const CANDIDATE_ID = 'collective-enroute';

/**
 * Down-peak, because that is where the defect lives.
 *
 * Every occupant leaving through the terminal means every car spends its life descending past
 * landings that want to descend. Up-peak would measure the repair on the traffic pattern that
 * least exercises it.
 */
export function midtownDownPeakAt(arrivalRatePctPop5min: number): TrafficArmSpec {
  return Object.freeze({
    id: `down-peak-${arrivalRatePctPop5min}`,
    durationS: 900,
    demand: Object.freeze({
      directionalSplit: Object.freeze({ incoming: 0, outgoing: 1, interfloor: 0 }),
      arrivalRatePctPop5min,
      peakWindowS: 300,
    }),
  });
}

/**
 * A cell: which building, at which rate.
 *
 * One building is a measurement of one building. `garden-apartments` is the second because it is
 * the shipped building least like Midtown Office — six floors against twenty-one, two cars against
 * six, residential traffic — so agreement between them is evidence about the *mechanism* rather
 * than about a tower. It also carries no access zoning, so both arms run the shipped `up-down-buttons`
 * call type and the comparison needs no `withCallType` override to change alongside the setting.
 */
export interface DiversionPoint {
  readonly building: string;
  readonly rate: number;
}

export interface DiversionCell {
  readonly building: string;
  readonly rate: number;
  /** Paired difference, candidate − baseline. Negative is an improvement. */
  readonly waiting: PairedComparison;
  readonly timeToDestination: PairedComparison;
  /**
   * Whether the candidate arm actually did anything.
   *
   * Not decoration. A paired interval containing zero has two readings — "the change is real
   * and small" and "the change never fired" — and only the second is a bug. Under common
   * random numbers two arms that behave identically produce **bit-identical** samples, so a
   * non-zero largest paired difference is proof the mechanism was live on this cell. The first
   * draft of this fix was inert (the eligibility half landed without the cost half, so the
   * right car became legal and stayed uncompetitive) and reported exactly the zeros a
   * successful null result would.
   */
  readonly live: boolean;
  /** True when both arms saw the same traces, replication for replication. */
  readonly commonRandomNumbers: boolean;
  /** Whether either arm suppressed its AWT interval on any replication. */
  readonly awtIsValid: boolean;
}

/**
 * Run the paired study at one arrival rate.
 *
 * Common random numbers are not requested, they are **checked**: the per-replication trace
 * digests of the two arms are compared, and a cell that did not see identical traces says so
 * rather than reporting an interval that is not paired.
 */
export async function measureDiversionAt(
  point: DiversionPoint,
  replications: number,
  config?: LoadedConfig | undefined,
): Promise<DiversionCell> {
  const loaded = config ?? (await loadResources());
  const baseline = loaded.dispatcherProfilesById.get(BASELINE_ID);
  if (baseline === undefined) throw new Error(`no dispatcher profile "${BASELINE_ID}"`);

  // Derived rather than read from `data/`, so the study is a controlled contrast even if the
  // shipped `collective-enroute` profile is later retuned: this arm is `collective` plus one
  // field and nothing else, by construction.
  const candidate: DispatcherProfile = derivedProfile(baseline, CANDIDATE_ID, {
    eligibility: { ...baseline.eligibility, enRouteDiversion: true },
  } as Partial<Omit<DispatcherProfile, 'id'>>);

  const result = await runGateExperiment({
    id: `en-route-diversion-${point.building}-${point.rate}`,
    seed: 20_260_801,
    building: point.building,
    dispatchers: [BASELINE_ID, CANDIDATE_ID],
    traffic: downPeakAt(point),
    replications,
    resources: withProfiles(loaded, [candidate]),
  });

  const compare = (metric: ReplicationMetric): PairedComparison =>
    comparePaired(metric, samplesOf(result, CANDIDATE_ID, metric), samplesOf(result, BASELINE_ID, metric));

  const waiting = compare('awtS');

  const baselineDigests = digestsOf(result, BASELINE_ID);
  const candidateDigests = digestsOf(result, CANDIDATE_ID);

  return Object.freeze({
    building: point.building,
    rate: point.rate,
    waiting,
    timeToDestination: compare('ttdMeanS'),
    live: waiting.maxAbsDifference > 0,
    commonRandomNumbers:
      baselineDigests.length === candidateDigests.length &&
      baselineDigests.every((digest, index) => digest === candidateDigests[index]),
    awtIsValid:
      cellOf(result, BASELINE_ID).aggregate.awtIsValid && cellOf(result, CANDIDATE_ID).aggregate.awtIsValid,
  });
}
