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

/**
 * The **shipped** `collective-enroute` against **shipped** `collective`, at one point.
 *
 * A different question from {@link measureDiversionAt}, and both are needed. That one isolates the
 * mechanism — one authored field apart — and answers *"what does diversion do?"*. This one answers
 * *"what does choosing this profile do?"*, which is the question an operator actually asks, and it
 * moves the `detourPenalty` weight along with the setting because that is what choosing the profile
 * does.
 *
 * The two gave different answers, which is the whole reason this exists. Isolated, diversion is a
 * **trade**: AWT better everywhere, TTD significantly worse at three of five quotable cells. Chosen
 * as shipped, it is not a trade at all — better or null on both metrics at every cell — because the
 * profile prices the detour the mechanism causes. Measuring only the first would have shipped a
 * regression; measuring only the second would have hidden what the mechanism does.
 */
export async function measureShippedAt(
  point: DiversionPoint,
  replications: number,
  config?: LoadedConfig | undefined,
  seed: number = DIVERSION_SEED,
): Promise<DiversionCell> {
  const loaded = config ?? (await loadResources());
  const control = loaded.dispatcherProfilesById.get(SOURCE_ID);
  const shipped = loaded.dispatcherProfilesById.get('collective-enroute');
  if (control === undefined || shipped === undefined) throw new Error('missing shipped profile');

  const dispatch =
    point.callType === undefined
      ? undefined
      : { callType: point.callType };
  const reference = derivedProfile(control, BASELINE_ID, {
    ...(dispatch === undefined ? {} : { dispatch: { ...control.dispatch, ...dispatch } }),
  } as Partial<Omit<DispatcherProfile, 'id'>>);
  const candidate = derivedProfile(shipped, CANDIDATE_ID, {
    ...(dispatch === undefined ? {} : { dispatch: { ...shipped.dispatch, ...dispatch } }),
  } as Partial<Omit<DispatcherProfile, 'id'>>);

  const result = await runGateExperiment({
    id: `shipped-diversion-${point.building}-${point.rate}-${seed}`,
    seed,
    building: point.building,
    dispatchers: [BASELINE_ID, CANDIDATE_ID],
    traffic: downPeakAt(point),
    replications,
    resources: withProfiles(loaded, [reference, candidate]),
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

/**
 * The seed both studies run at unless a caller names another.
 *
 * Named rather than inlined because [`DECISIONS.md` § D209](../../../../DECISIONS.md) § 1 turns the
 * seed into a load-bearing choice: `detourPenalty: 0.2` was *fitted* on this seed, so the adoption
 * verdict is taken on a disjoint one and this becomes the in-sample figure reported beside it. A
 * seed that appears twice as a literal is a seed that can be changed in one place.
 */
export const DIVERSION_SEED = 20_260_801;

/** The baseline arm: conventional collective, exactly as shipped. */
export const SOURCE_ID = 'collective';
/** The reference arm's id. Derived from {@link SOURCE_ID}; see `measureDiversionAt`. */
export const BASELINE_ID = 'collective-reference';
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
 * than about a tower.
 */
export interface DiversionPoint {
  readonly building: string;
  readonly rate: number;
  /**
   * The call type both arms run, for a building whose access-restricted landings are unservable
   * under the shipped `up-down-buttons` default — a landing call carries no credential, so every
   * car reports `accessDenied` and the call is unassignable.
   *
   * Applied to **both** arms, which is what keeps the contrast controlled: the passenger model
   * moves together and only `eligibility.enRouteDiversion` differs. It does make the cell
   * uncomparable with an up/down-button cell — `metrics/comparability.ts`'s point — so cells are
   * read down their own column, never across.
   */
  readonly callType?: 'destination-entry' | 'mobile-credential' | undefined;
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
  seed: number = DIVERSION_SEED,
): Promise<DiversionCell> {
  const loaded = config ?? (await loadResources());
  const baseline = loaded.dispatcherProfilesById.get(SOURCE_ID);
  if (baseline === undefined) throw new Error(`no dispatcher profile "${SOURCE_ID}"`);

  // Derived rather than read from `data/`, so the study is a controlled contrast even if the
  // shipped `collective-enroute` profile is later retuned: this arm is `collective` plus one
  // field and nothing else, by construction.
  // **Both arms are derived, even when the call type is untouched.** The baseline could have been
  // the shipped `collective` id, and was: the cost is that a cell needing a call-type override has
  // to change one arm and not the other, which is the one thing a controlled contrast may not do.
  // Deriving both keeps every cell the same shape — one profile, one field apart.
  const withType = (patch: Partial<Omit<DispatcherProfile, 'id'>>): Partial<Omit<DispatcherProfile, 'id'>> =>
    point.callType === undefined
      ? patch
      : { ...patch, dispatch: { ...baseline.dispatch, callType: point.callType } };
  const reference: DispatcherProfile = derivedProfile(baseline, BASELINE_ID, withType({}));
  const candidate: DispatcherProfile = derivedProfile(
    baseline,
    CANDIDATE_ID,
    withType({ eligibility: { ...baseline.eligibility, enRouteDiversion: true } }) as Partial<
      Omit<DispatcherProfile, 'id'>
    >,
  );

  const result = await runGateExperiment({
    id: `en-route-diversion-${point.building}-${point.rate}-${seed}`,
    seed,
    building: point.building,
    dispatchers: [BASELINE_ID, CANDIDATE_ID],
    traffic: downPeakAt(point),
    replications,
    resources: withProfiles(loaded, [reference, candidate]),
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
