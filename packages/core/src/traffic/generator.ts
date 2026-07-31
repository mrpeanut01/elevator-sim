/**
 * The passenger trace generator.
 *
 * Turns a building, a set of traffic profiles and one replication's `StreamSet` into a
 * complete, immutable list of everyone who will travel — before a single car moves.
 *
 * ## Demand is attributed to the population that generates it
 *
 * A profile states demand as *percent of building population per five minutes*, and a
 * directional split saying how that demand divides into `incoming` (from an entrance),
 * `outgoing` (to an entrance) and `interfloor`. `data/buildings/README.md` then makes the
 * profile a **per-floor** property: a floor's `trafficProfile` "overrides the building-level
 * trafficProfile for arrivals originating on that floor", because "a mixed-use tower cannot
 * express 'office down-peak and residential up-peak overlap' with one building-level profile".
 *
 * Those two statements only compose one way. Each populated floor `f` contributes
 * `λ_f = pct_f/100 * population_f / 300` passengers per second, governed by **its own**
 * profile, and its directional split decides where those trips start and end:
 *
 * | Share | Origin | Destination |
 * |---|---|---|
 * | `incoming` | an entrance | floor `f` |
 * | `outgoing` | floor `f` | an entrance |
 * | `interfloor` | floor `f` | another populated non-entrance floor |
 *
 * So the generator runs two kinds of Poisson batch process, superposed:
 *
 * - **one entrance source**, whose rate is `Σ_f λ_f · incoming_f` and whose destination table
 *   is weighted by the same products. This is what makes the per-floor override bite on
 *   incoming traffic: Mixed-Use High-Rise's residential floors contribute
 *   `26 · 5% · 0.15` each while its office floors contribute `46 · 12% · 0.85`, a factor of
 *   twenty-four per floor. Which entrance a batch walks through is drawn from the `origins`
 *   stream; the batch's size distribution is that entrance floor's profile.
 * - **one resident source per populated floor**, rate `λ_f · (outgoing_f + interfloor_f)`,
 *   with that floor's batch-size distribution and a destination table mixing entrances and
 *   other floors in the ratio the split declares.
 *
 * Summing over both kinds gives exactly `Σ_f λ_f` — the building's headline arrival rate,
 * with nothing double counted and nothing lost. `generator.test.ts` asserts that identity
 * against the worked figure: office-standard at 12% on Midtown Office's 1710 occupants is
 * 205.2 passengers per five minutes at the peak, and asserts it for every shipped building.
 *
 * ## Conservation, when a trip turns out to be impossible
 *
 * Some `(origin, destination)` pairs cannot be travelled: no chain of banks connects them,
 * the chain is longer than `maxLegs`, or no single credential group is permitted on every
 * restricted floor of the route. Those pairs are removed from the destination tables, and the
 * share they belonged to renormalizes over what is left, so `λ_f` is untouched.
 *
 * A share can also lose *every* candidate — Secure Tower's executive floor is in an access
 * zone whose two credential groups are permitted nowhere else, so its occupants can make no
 * interfloor trip at all. There is nothing to renormalize within, so that share is
 * redistributed across the floor's surviving shares instead, and `λ_f` is still untouched:
 * an exec who cannot visit another floor goes to the lobby rather than evaporating. What that
 * does change is the floor's directional split, and `planDemand` says so in a warning naming
 * the floor and the passengers per second involved. Deleting the share instead would lower
 * the building's headline rate — 0.39632 p/s against the 0.3968 the profiles specify, on
 * shipped data — and the headline rate is the number every capacity comparison and the
 * closed-form RTT oracle are read against.
 *
 * The one thing that cannot be conserved is incoming demand for a floor no entrance can
 * reach: it is demand *for that floor*, so there is no other share to move it to. It is
 * dropped, and the warning quantifies exactly how much.
 *
 * This settles the question `data/buildings/mixed-use-high-rise.json` records as open —
 * "whether an entrance-origin leg is attributed to its destination floor's profile is a
 * config-module decision that is not yet declared". It is: **rate and destination weighting
 * follow the profile of the floor whose population generates the trip**, entrance floor or
 * not. Only the batch-size distribution and the choice of entrance follow the entrance floor,
 * because a group walking in off the street is a property of the door, not of the office its
 * members work in.
 *
 * ## Stream discipline
 *
 * | Stream | Consumed for |
 * |---|---|
 * | `arrivals` | batch arrival times (thinning) and batch sizes |
 * | `origins` | which entrance an incoming batch arrives at |
 * | `destinations` | each passenger's destination floor |
 * | `passengerMass` | one body mass per passenger, in final trace order |
 * | `doorObstruction` | **never** |
 * | `policyNoise` | **never** |
 *
 * The last two rows are the point. Generation must not perturb the streams the *run* draws
 * from, or two dispatchers fed the same seed would see different door obstructions purely
 * because they generated the same trace — and common random numbers would be quietly worth
 * less than they appear. `generator.test.ts` asserts both streams are bit-identical before
 * and after.
 *
 * Batch **size** sharing the `arrivals` stream with batch **times** is a deliberate reading of
 * `random/streams.ts`'s rule ("adding a source means adding a name here — never reusing an
 * existing stream"): a compound Poisson process is one stochastic source — `arrivals` —
 * whose realization is a sequence of `(time, size)` pairs, not two. The cost is that changing
 * a profile's mean batch size shifts the arrival times of every later batch, so common random
 * numbers are worth less across two configurations that differ in batch size specifically.
 * Splitting them would mean a seventh name in `STREAM_NAMES` and a seventh row in
 * docs/01-architecture.md § Determinism, neither of which this module owns; it is a change to
 * make deliberately, in that file, if a batch-size sweep is ever wanted paired.
 *
 * ## Determinism
 *
 * Sources are sampled in a fixed order (the entrance source, then floors ascending by
 * `index`), batches are then sorted by `(time, generation sequence)`, and ids and body masses
 * are assigned in that sorted order. Same seed and same config therefore produce a
 * byte-identical trace, whatever the elevators do with it.
 */

import type {
  AccessZone,
  DirectionalSplit,
  FloorConfig,
  ResolvedBuilding,
  TrafficProfile,
  TrafficProfiles,
} from '../config/types.js';
import type { CredentialGroup, PassengerInit } from '../model/index.js';
import type { Rng } from '../random/index.js';

import {
  expectedPassengers as expectedPassengersOver,
  intensityAt,
  resolveDemandTemplate,
  splitAt,
} from './demandTemplate.js';
import {
  batchesPerSecond,
  drawBatchSize,
  passengersPerSecond,
  sampleBatchArrivalTimes,
} from './poissonBatch.js';
import { RoutePlanner } from './route.js';
import {
  TRAFFIC_DEFAULTS,
  TrafficError,
  type ArrivalEvent,
  type CredentialAssignment,
  type DemandLevel,
  type DemandSource,
  type DestinationWeight,
  type DirectionCategory,
  type GeneratedPassenger,
  type InterfloorWeighting,
  type PassengerTrace,
  type ResolvedDemandTemplate,
  type TraceLeg,
  type TraceTransportHop,
  type TrafficConfig,
  type TrafficModelVersion,
} from './types.js';

/** The arrival process this module implements. Anything else in the data is a hard error. */
const SUPPORTED_ARRIVAL_PROCESS = 'poisson-batch';

/* -------------------------------------------------------------------------- *
 * Weighted sampling
 * -------------------------------------------------------------------------- */

/**
 * A discrete distribution over values, sampled by inverse transform.
 *
 * One uniform draw per sample, always — a rejection scheme would make the draw count depend
 * on the values drawn and desynchronize common random numbers between two configurations
 * whose tables differ.
 */
class WeightedTable<T> {
  readonly #values: readonly T[];
  readonly #cumulative: readonly number[];
  readonly total: number;

  constructor(values: readonly T[], weights: readonly number[]) {
    const keptValues: T[] = [];
    const cumulative: number[] = [];
    let running = 0;
    for (const [index, value] of values.entries()) {
      const weight = weights[index] ?? 0;
      if (!Number.isFinite(weight) || weight < 0) {
        throw new TrafficError(`Sampling weight must be non-negative and finite; received ${weight}`);
      }
      if (weight === 0) continue;
      running += weight;
      keptValues.push(value);
      cumulative.push(running);
    }
    this.#values = keptValues;
    this.#cumulative = cumulative;
    this.total = running;
  }

  get size(): number {
    return this.#values.length;
  }

  /** Sample using one uniform from `rng`. */
  pick(rng: Rng): T {
    if (this.#values.length === 0) {
      throw new TrafficError('Cannot sample from an empty distribution');
    }
    const target = rng.nextFloat() * this.total;
    let low = 0;
    let high = this.#cumulative.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((this.#cumulative[mid] ?? 0) <= target) low = mid + 1;
      else high = mid;
    }
    const value = this.#values[low];
    if (value === undefined) {
      throw new TrafficError('Weighted sampling fell off the end of its table');
    }
    return value;
  }
}

/* -------------------------------------------------------------------------- *
 * Demand planning — everything that needs no randomness
 * -------------------------------------------------------------------------- */

/** One entrance and its share of incoming demand, normalized across the building. */
export interface EntranceShare {
  readonly floorId: string;
  readonly floorIndex: number;
  /** Normalized to sum to 1 across every entrance. */
  readonly weight: number;
  /** Mean batch size of the profile governing this entrance. */
  readonly meanBatchSize: number;
}

/**
 * The deterministic half of trace generation: rates, sources, destination tables and the
 * analytic expectation, with no draws taken.
 *
 * Exported because it is the honest way to check the rate arithmetic. A statistical test that
 * can compare a sampled count against a closed-form expectation from the same configuration
 * is testing the sampler; one that compares it against a number typed into the test is
 * testing the typist.
 */
export interface DemandPlan {
  readonly buildingId: string;
  readonly template: ResolvedDemandTemplate;
  readonly sources: readonly DemandSource[];
  readonly entrances: readonly EntranceShare[];
  /** Building-wide passengers per second at full template intensity. */
  readonly peakPassengersPerSecond: number;
  /** `peakPassengersPerSecond * template.intensityIntegralS`. */
  readonly expectedPassengers: number;
  /** Expected passengers arriving inside the measurement window. */
  readonly expectedPassengersInReportWindow: number;
  readonly warnings: readonly string[];
}

/** Configuration minus the streams: everything {@link planDemand} needs. */
export type DemandConfig = Omit<TrafficConfig, 'streams'>;

/** A candidate destination before the directional share has been applied and renormalized. */
interface DestinationCandidate {
  readonly floorId: string;
  readonly floorIndex: number;
  /** Relative attractiveness within its share: an entrance weight, or a floor population. */
  readonly weight: number;
}

/** One directional share of one floor's demand, and the destinations it can actually reach. */
interface ResolvedShare {
  /** The fraction of the floor's demand the profile gives this direction, `0..1`. */
  readonly fraction: number;
  readonly category: DirectionCategory;
  /** Candidates that survived the feasibility filter. Empty when the share is orphaned. */
  readonly kept: readonly DestinationCandidate[];
  /** Sum of `kept` weights. Zero exactly when the share has nowhere to go. */
  readonly total: number;
}

/**
 * A passengers-per-second figure for a warning, in a unit a reader can check by hand.
 *
 * Demand is stated in the data as percent of population per five minutes, so a warning that
 * says "0.00048 passengers/second" is arithmetic nobody will do. Both forms are given.
 */
function rateText(passengersPerSecondValue: number): string {
  return `${passengersPerSecondValue.toPrecision(3)} passengers/second (${(passengersPerSecondValue * 300).toPrecision(3)} per 5 min)`;
}

/**
 * Spread `categoryRates` onto a source, or **omit the key** when there is nothing to say.
 *
 * Omitted rather than zero-filled for the reason `GeneratedPassenger.transportHops` is: a trace
 * from a run that does not vary its mix must be the object it was before mixes could vary, so that
 * `traffic/mixIdentity.test.ts` can hold a whole run to a digest rather than to a field list.
 */
function withCategoryRates(
  rates: Readonly<Record<DirectionCategory, number>> | undefined,
): { categoryRates?: Readonly<Record<DirectionCategory, number>> } {
  return rates === undefined ? {} : { categoryRates: rates };
}

interface ResolvedOptions {
  readonly demandLevel: DemandLevel;
  readonly interfloorWeighting: InterfloorWeighting;
  readonly credentialAssignment: CredentialAssignment;
  readonly batchSharesDestination: boolean;
  readonly maxLegs: number;
  /** `undefined` means every floor keeps its own profile's split. */
  readonly directionalSplit: DirectionalSplit | undefined;
  readonly idPrefix: string;
  readonly journeyIdPrefix: string;
  readonly batchIdPrefix: string;
  readonly trafficModel: TrafficModelVersion;
}

function resolveOptions(config: DemandConfig): ResolvedOptions {
  const maxLegs = config.maxLegs ?? TRAFFIC_DEFAULTS.maxLegs;
  if (!Number.isInteger(maxLegs) || maxLegs < 1) {
    throw new TrafficError(`maxLegs must be a positive integer; received ${maxLegs}`);
  }
  return {
    demandLevel: config.demandLevel ?? TRAFFIC_DEFAULTS.demandLevel,
    interfloorWeighting: config.interfloorWeighting ?? TRAFFIC_DEFAULTS.interfloorWeighting,
    credentialAssignment: config.credentialAssignment ?? TRAFFIC_DEFAULTS.credentialAssignment,
    batchSharesDestination: config.batchSharesDestination ?? TRAFFIC_DEFAULTS.batchSharesDestination,
    maxLegs,
    directionalSplit: normalizeSplit(config.directionalSplit),
    idPrefix: config.idPrefix ?? 'p',
    journeyIdPrefix: config.journeyIdPrefix ?? 'j',
    batchIdPrefix: config.batchIdPrefix ?? 'b',
    trafficModel: config.trafficModel ?? TRAFFIC_DEFAULTS.trafficModel,
  };
}

/**
 * Validate an explicit directional split and rescale it to sum to 1.
 *
 * Normalizing rather than demanding a sum of exactly 1 is what lets a generic optimizer
 * sample the three shares independently in `[0, 1]`, which is the whole point of declaring
 * them in `TRAFFIC_PARAMETERS`. The one thing it cannot do is invent demand where there is
 * none, so an all-zero split is an error rather than a silently empty trace.
 */
function normalizeSplit(split: DirectionalSplit | undefined): DirectionalSplit | undefined {
  if (split === undefined) return undefined;
  for (const [name, value] of Object.entries(split)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TrafficError(
        `directionalSplit.${name} must be non-negative and finite; received ${value}`,
      );
    }
  }
  const total = split.incoming + split.outgoing + split.interfloor;
  if (total <= 0) {
    throw new TrafficError(
      'directionalSplit must give at least one direction a positive share; all three are zero, which is a building nobody travels in rather than a demand pattern.',
    );
  }
  return {
    incoming: split.incoming / total,
    outgoing: split.outgoing / total,
    interfloor: split.interfloor / total,
  };
}

/** Index traffic profiles by id, failing loudly on a profile a floor names but the data lacks. */
function profileResolver(
  building: ResolvedBuilding,
  profiles: TrafficProfiles,
): (floor: FloorConfig) => TrafficProfile {
  const byId = new Map(profiles.profiles.map((profile) => [profile.id, profile]));
  const known = [...byId.keys()].join(', ');
  const require = (id: string, where: string): TrafficProfile => {
    const profile = byId.get(id);
    if (profile === undefined) {
      throw new TrafficError(
        `${where} names traffic profile "${id}", which data/traffic-profiles.json does not declare. Declared profiles: ${known}.`,
      );
    }
    return profile;
  };
  // Fail on a bad building-level profile even if every floor overrides it.
  require(building.trafficProfile, `Building "${building.id}"`);
  return (floor: FloorConfig): TrafficProfile =>
    floor.trafficProfile === undefined
      ? require(building.trafficProfile, `Building "${building.id}"`)
      : require(floor.trafficProfile, `Building "${building.id}" floor "${floor.id}"`);
}

/**
 * Compute rates, sources and destination tables. Pure: no draws, no simulation state.
 *
 * @throws TrafficError for an unsupported arrival process, an unknown traffic profile, an
 *   entrance weight naming a floor that is not an entrance, or a building with demand but no
 *   entrance to route it through.
 */
export function planDemand(config: DemandConfig): DemandPlan {
  const { building, profiles } = config;
  if (profiles.arrivalProcess.type !== SUPPORTED_ARRIVAL_PROCESS) {
    throw new TrafficError(
      `Unsupported arrival process "${profiles.arrivalProcess.type}". This module implements "${SUPPORTED_ARRIVAL_PROCESS}"; passengers arrive in groups, not singly.`,
    );
  }

  const options = resolveOptions(config);
  const template = resolveDemandTemplate(
    config.template ?? TRAFFIC_DEFAULTS.templateId,
    profiles.demandTemplates,
    config.templateOverrides,
  );
  const profileFor = profileResolver(building, profiles);
  const warnings: string[] = [];

  const rateOf = (profile: TrafficProfile): number =>
    config.arrivalRatePctPop5min ?? profile.arrivalRatePctPop5min[options.demandLevel];

  // A template that varies the mix states the mix, so it takes precedence over every floor's
  // profile — the same relationship `config.directionalSplit` already has, one level up. Combining
  // the two is refused rather than resolved: one of them would have to win silently, and a caller
  // who set an explicit split and got the template's instead would have no way to notice.
  const templateSplit = template.meanDirectionalSplit;
  if (templateSplit !== undefined && options.directionalSplit !== undefined) {
    throw new TrafficError(
      `Demand template "${template.id}" varies the directional mix within the run, and directionalSplit fixes it for the whole run. Set one or the other. To hold this template's mix flat at its own period mean, use templateOverrides.mixAmplitude = 0, which is the negative control rather than a different mean.`,
    );
  }
  const splitOf = (profile: TrafficProfile): DirectionalSplit =>
    templateSplit ?? options.directionalSplit ?? profile.directionalSplit;
  /** Per-category passengers/second, attached only under a mix-varying template. */
  const categoryRatesOf = (
    destinations: readonly DestinationWeight[],
  ): Readonly<Record<DirectionCategory, number>> | undefined => {
    if (templateSplit === undefined) return undefined;
    const rates: Record<DirectionCategory, number> = { incoming: 0, outgoing: 0, interfloor: 0 };
    for (const destination of destinations) rates[destination.category] += destination.weight;
    return Object.freeze(rates);
  };

  const entranceFloors = building.entranceFloors;
  const populatedFloors = building.floors.filter((floor) => floor.population > 0);
  const destinationFloors = populatedFloors.filter((floor) => floor.isEntrance !== true);

  /* ---- entrance weights -------------------------------------------------- */

  const entranceWeightConfig = config.entranceWeights;
  if (entranceWeightConfig !== undefined) {
    const entranceIds = new Set(entranceFloors.map((floor) => floor.id));
    for (const floorId of Object.keys(entranceWeightConfig)) {
      if (!entranceIds.has(floorId)) {
        throw new TrafficError(
          `entranceWeights names floor "${floorId}", which building "${building.id}" does not flag isEntrance. Declared entrances: ${[...entranceIds].join(', ') || '(none)'}.`,
        );
      }
    }
  }
  const rawEntranceWeights = entranceFloors.map((floor) => {
    const weight = entranceWeightConfig?.[floor.id] ?? 1;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new TrafficError(
        `entranceWeights["${floor.id}"] must be non-negative and finite; received ${weight}`,
      );
    }
    return weight;
  });
  const entranceWeightTotal = rawEntranceWeights.reduce((sum, weight) => sum + weight, 0);
  if (entranceFloors.length > 0 && entranceWeightTotal <= 0) {
    throw new TrafficError(
      `Every entrance of building "${building.id}" has weight 0, so no incoming or outgoing demand can be placed.`,
    );
  }
  const entrances: EntranceShare[] = entranceFloors.map((floor, index) => ({
    floorId: floor.id,
    floorIndex: floor.index,
    weight: entranceWeightTotal > 0 ? (rawEntranceWeights[index] ?? 0) / entranceWeightTotal : 0,
    meanBatchSize: profileFor(floor).batchSize.mean,
  }));

  /* ---- feasibility of an (origin, destination) pair ---------------------- */

  // A trip nobody could actually make must not be generated. Two ways that happens: the
  // shafts do not connect the two floors (or connect them only via an absurd chain of legs),
  // and no single credential group is permitted on every restricted floor of the route. The
  // second is not hypothetical — Secure Tower's `facilities` and `security` groups reach all
  // four tenant zones but deliberately not the executive floor, so "floor 12 to floor 30" is
  // a journey no occupant of that building can make. Generating it anyway would put a
  // passenger in a queue that can never legitimately be served, and the wait they accumulate
  // would land in the headline average.
  const planner = RoutePlanner.forBuilding(building);
  const permitted = permittedGroupsByFloor(building.accessZones);
  const enforceAccess = options.credentialAssignment !== 'none';
  const feasibility = new Map<string, TripFeasibility>();
  const rejections = new Map<TripFeasibility, { count: number; example: string }>();

  const feasible = (originFloorId: string, destinationFloorId: string): boolean => {
    const key = `${originFloorId}>${destinationFloorId}`;
    let verdict = feasibility.get(key);
    if (verdict === undefined) {
      verdict = classifyTrip(
        planner,
        permitted,
        enforceAccess,
        options.maxLegs,
        originFloorId,
        destinationFloorId,
      );
      feasibility.set(key, verdict);
    }
    if (verdict === 'ok') return true;
    const seen = rejections.get(verdict);
    if (seen === undefined) {
      rejections.set(verdict, { count: 1, example: `"${originFloorId}" -> "${destinationFloorId}"` });
    } else {
      seen.count += 1;
    }
    return false;
  };

  const positiveEntrances = entrances.filter((entrance) => entrance.weight > 0);

  /* ---- the entrance (incoming) source ------------------------------------ */

  const incomingDestinations: DestinationWeight[] = [];
  const strandedIncoming: { readonly floorId: string; readonly weight: number }[] = [];
  let incomingRate = 0;
  for (const floor of destinationFloors) {
    const profile = profileFor(floor);
    const weight = passengersPerSecond(rateOf(profile), floor.population) * splitOf(profile).incoming;
    if (weight <= 0) continue;
    // Required from *every* weighted entrance, because the entrance a batch arrives at is
    // drawn independently of where its members are going. A floor some doors can reach and
    // others cannot has no single honest arrival rate, so it is dropped rather than guessed.
    // The shipped buildings all satisfy "reaches every populated floor from every entrance"
    // (config/buildingConnectivity.test.ts), so in practice nothing is dropped here.
    if (!positiveEntrances.every((entrance) => feasible(entrance.floorId, floor.id))) {
      strandedIncoming.push({ floorId: floor.id, weight });
      continue;
    }
    incomingRate += weight;
    incomingDestinations.push({
      floorId: floor.id,
      floorIndex: floor.index,
      weight,
      category: 'incoming',
      demandFloorId: floor.id,
      profileId: profile.id,
    });
  }

  const sources: DemandSource[] = [];

  if (incomingRate > 0) {
    if (entrances.length === 0) {
      throw new TrafficError(
        `Building "${building.id}" generates incoming demand but flags no floor isEntrance, so there is nowhere for it to arrive.`,
      );
    }
    // Entrance-weighted mean, so that batches/second x mean batch size reproduces the
    // passenger rate exactly even when two entrances run different profiles.
    const meanBatchSize = entrances.reduce(
      (sum, entrance) => sum + entrance.weight * entrance.meanBatchSize,
      0,
    );
    sources.push({
      id: 'entrance',
      kind: 'entrance',
      originFloorId: undefined,
      profileId: building.trafficProfile,
      peakPassengersPerSecond: incomingRate,
      peakBatchesPerSecond: batchesPerSecond(incomingRate, meanBatchSize),
      meanBatchSize,
      destinations: incomingDestinations,
      ...withCategoryRates(categoryRatesOf(incomingDestinations)),
    });
  }

  /* ---- one resident source per populated floor --------------------------- */

  const interfloorWeightOf = (floor: FloorConfig): number =>
    options.interfloorWeighting === 'uniform' ? 1 : floor.population;

  for (const floor of populatedFloors) {
    const profile = profileFor(floor);
    const floorRate = passengersPerSecond(rateOf(profile), floor.population);
    const { outgoing, interfloor, incoming } = splitOf(profile);

    if (floor.isEntrance === true && incoming > 0 && floorRate > 0) {
      warnings.push(
        `Floor "${floor.id}" is both populated and an entrance; its ${(incoming * 100).toFixed(0)}% incoming share, ${rateText(floorRate * incoming)}, is dropped because a passenger does not ride a lift to the floor they walk in on.`,
      );
    }

    // A share renormalizes over the destinations that survive the feasibility filter, so
    // dropping an impossible pair changes neither the floor's total demand nor its directional
    // split. The behavioural claim is that the split is a property of the population — a
    // tenant who may not visit the executive floor still makes the same number of interfloor
    // trips, just to floors they are allowed into.
    const resolveShare = (
      fraction: number,
      category: DirectionCategory,
      candidates: readonly DestinationCandidate[],
    ): ResolvedShare => {
      const kept =
        fraction <= 0 || floorRate <= 0
          ? []
          : candidates.filter(
              (candidate) =>
                candidate.floorId !== floor.id &&
                candidate.weight > 0 &&
                feasible(floor.id, candidate.floorId),
            );
      return { fraction, category, kept, total: kept.reduce((sum, c) => sum + c.weight, 0) };
    };

    const shares = [
      resolveShare(outgoing, 'outgoing', entrances),
      resolveShare(
        interfloor,
        'interfloor',
        destinationFloors.map((candidate) => ({
          floorId: candidate.id,
          floorIndex: candidate.index,
          weight: interfloorWeightOf(candidate),
        })),
      ),
    ];
    const live = shares.filter((share) => share.fraction > 0 && share.total > 0);
    const orphaned = shares.filter((share) => share.fraction > 0 && share.total <= 0);
    const liveFraction = live.reduce((sum, share) => sum + share.fraction, 0);
    const orphanedFraction = orphaned.reduce((sum, share) => sum + share.fraction, 0);

    // A share that loses *every* candidate has nothing to renormalize within, so the same rule
    // one level up: redistribute it across the shares that survived, which keeps lambda_f
    // exactly. Deleting it instead would quietly lower the building's headline arrival rate —
    // the number every capacity comparison and the closed-form RTT oracle are read against.
    // Secure Tower's executive floor, whose occupants may visit no other floor, then goes to
    // the lobby rather than evaporating. That *does* change the floor's directional split,
    // which is why it is said out loud rather than folded into the generic rejection notice.
    const boost = liveFraction > 0 ? (liveFraction + orphanedFraction) / liveFraction : 0;

    const destinations: DestinationWeight[] = [];
    for (const share of live) {
      for (const candidate of share.kept) {
        destinations.push({
          floorId: candidate.floorId,
          floorIndex: candidate.floorIndex,
          weight: (floorRate * share.fraction * boost * candidate.weight) / share.total,
          category: share.category,
          demandFloorId: floor.id,
          profileId: profile.id,
        });
      }
    }

    if (orphanedFraction > 0 && floorRate > 0) {
      const lost = orphaned
        .map((share) => `${(share.fraction * 100).toFixed(0)}% ${share.category}`)
        .join(' and ');
      warnings.push(
        liveFraction > 0
          ? `Floor "${floor.id}" can place none of its ${lost} demand: no candidate destination is both reachable and permitted. Its ${rateText(floorRate * orphanedFraction)} is redistributed across the floor's surviving ${live.map((share) => share.category).join(' and ')} demand, so the floor's total rate is unchanged but its directional split is not.`
          : `Floor "${floor.id}" generates ${lost} demand but has nowhere to send it: ${rateText(floorRate * orphanedFraction)} is dropped, and the building's total arrival rate is that much lower than its profiles specify.`,
      );
    }

    const rate = destinations.reduce((sum, destination) => sum + destination.weight, 0);
    if (rate <= 0) continue;

    sources.push({
      id: `resident:${floor.id}`,
      kind: 'resident',
      originFloorId: floor.id,
      profileId: profile.id,
      peakPassengersPerSecond: rate,
      peakBatchesPerSecond: batchesPerSecond(rate, profile.batchSize.mean),
      meanBatchSize: profile.batchSize.mean,
      destinations,
      ...withCategoryRates(categoryRatesOf(destinations)),
    });
  }

  // A mix arc rescales each source's rate by `split_c(t) / meanSplit_c`, which conserves the
  // building's total demand *exactly* only while every floor's three shares survive the
  // feasibility filter: a share that was redistributed at the period's mean mix stays redistributed
  // in that proportion at every other instant, rather than following the arc. No shipped building
  // that runs this template raises it — Midtown Office declares no access zones and every floor is
  // reachable from every entrance — so this says so rather than being silently approximate.
  if (
    templateSplit !== undefined &&
    (warnings.length > 0 || strandedIncoming.length > 0 || rejections.size > 0)
  ) {
    warnings.push(
      `Building "${building.id}" runs demand template "${template.id}", whose directional mix varies within the run, and some of its demand was redistributed or dropped by the feasibility filter (see the warnings beside this one). The redistribution is computed once, at the template's period-mean mix; it does not follow the arc. The building's total arrival rate is therefore conserved exactly at the mean mix and only approximately away from it.`,
    );
  }

  if (strandedIncoming.length > 0) {
    const lost = strandedIncoming.reduce((sum, floor) => sum + floor.weight, 0);
    const named = strandedIncoming.slice(0, 3).map((floor) => `"${floor.floorId}"`).join(', ');
    const more = strandedIncoming.length > 3 ? ` and ${strandedIncoming.length - 3} more` : '';
    warnings.push(
      `Building "${building.id}": ${rateText(lost)} of incoming demand is dropped because ${strandedIncoming.length} floor${strandedIncoming.length === 1 ? '' : 's'} (${named}${more}) cannot be reached from every weighted entrance. Incoming demand has no surviving share to fall back on — it is demand for a floor the lifts cannot serve — so the building's total arrival rate is that much lower than its profiles specify.`,
    );
  }

  for (const [reason, { count, example }] of rejections) {
    warnings.push(
      `Building "${building.id}": ${count} origin-destination pair${count === 1 ? '' : 's'} dropped because ${REJECTION_REASONS[reason]} (for example ${example}). Outgoing and interfloor demand is redistributed — within its own share where that share keeps a destination, across the floor's other shares where it keeps none — so each floor's total rate survives, and any floor whose split had to change says so in its own warning above. Incoming demand for an unreachable floor is lost, and is reported the same way.`,
    );
  }

  const peakPassengersPerSecond = sources.reduce(
    (sum, source) => sum + source.peakPassengersPerSecond,
    0,
  );
  if (peakPassengersPerSecond <= 0) {
    warnings.push(
      `Building "${building.id}" generates no demand at all: every floor population or arrival rate is zero.`,
    );
  }

  return Object.freeze({
    buildingId: building.id,
    template,
    sources: Object.freeze(sources),
    entrances: Object.freeze(entrances),
    peakPassengersPerSecond,
    expectedPassengers: expectedPassengersOver(template, peakPassengersPerSecond),
    expectedPassengersInReportWindow: expectedPassengersOver(
      template,
      peakPassengersPerSecond,
      template.reportWindowStartS,
      template.reportWindowEndS,
    ),
    warnings: Object.freeze(warnings),
  });
}

/* -------------------------------------------------------------------------- *
 * Access credentials
 * -------------------------------------------------------------------------- */

/** Floor id to the credential groups permitted there, in declared order. Absent = unrestricted. */
function permittedGroupsByFloor(
  accessZones: readonly AccessZone[],
): ReadonlyMap<string, readonly CredentialGroup[]> {
  const byFloor = new Map<string, CredentialGroup[]>();
  for (const zone of accessZones) {
    for (const floorId of zone.floors) {
      const groups = byFloor.get(floorId) ?? [];
      for (const group of zone.credentialGroups) {
        if (!groups.includes(group)) groups.push(group);
      }
      byFloor.set(floorId, groups);
    }
  }
  return byFloor;
}

/**
 * The credential a passenger travelling this route must hold, or `null` if no single group
 * is permitted on every restricted floor of it.
 *
 * `undefined` means "no credential needed" — nothing on the route is restricted, which is the
 * common case and the correct answer for an unbadged visitor. `null` means the journey is
 * impossible for any occupant and must not be generated at all.
 *
 * Deterministic, and consuming no random draw. A *stochastic* credential mix would need a
 * seventh named stream on `StreamSet`; adding one is a deliberate act (see
 * `random/streams.ts`), not something this module should do implicitly. The rule — first
 * group, in declared zone order, that covers the whole route — has a pleasing consequence in
 * Secure Tower: interfloor trips between two tenant zones come out as `facilities` or
 * `security` staff, which is who actually makes them.
 */
function credentialForRoute(
  route: readonly string[],
  permitted: ReadonlyMap<string, readonly CredentialGroup[]>,
): CredentialGroup | undefined | null {
  const restricted = route.filter((floorId) => permitted.has(floorId));
  const first = restricted[0];
  if (first === undefined) return undefined;

  for (const candidate of permitted.get(first) ?? []) {
    const reachesAll = restricted.every((floorId) => (permitted.get(floorId) ?? []).includes(candidate));
    if (reachesAll) return candidate;
  }
  return null;
}

/** Why an origin-destination pair was rejected, or `ok`. */
type TripFeasibility = 'ok' | 'unreachable' | 'too-many-legs' | 'no-credential' | 'no-lift-leg';

const REJECTION_REASONS: Readonly<Record<TripFeasibility, string>> = {
  ok: 'they are fine',
  unreachable: 'no chain of banks connects them',
  'too-many-legs': 'the shortest route exceeds the maxLegs limit',
  'no-credential': 'no single credential group is permitted on every restricted floor of the route',
  'no-lift-leg':
    'the whole route is served by a declared escalator or stair, so it is not lift demand',
};

/**
 * `maxLegs` bounds **elevator** legs, which is what its error message has always said. A
 * transport hop does not count against it: the limit exists to catch a building whose zoning
 * makes somebody change lifts five times, and an escalator is the opposite of that problem.
 *
 * A route with no elevator leg at all is refused rather than generated. It is a real journey and
 * the building really serves it, but it is not *lift* demand: it would enter no queue, board no
 * car and produce no observation, and a passenger record with zero legs cannot become a
 * `Passenger` at all. Refusing it here puts it in the rejection census beside the other four
 * reasons rather than crashing trace materialization later.
 *
 * `vertical-city` *has* such a pair — `G → 2` is its escalator and nothing else — and never
 * generates it: floor 2 carries no population and is not an entrance, so it is neither an origin
 * nor a destination of any demand source. `transportRoute.test.ts` asserts both halves, because a
 * refusal no configuration can reach and a refusal nothing ever trips look the same from here.
 */
function classifyTrip(
  planner: RoutePlanner,
  permitted: ReadonlyMap<string, readonly CredentialGroup[]>,
  enforceAccess: boolean,
  maxLegs: number,
  originFloorId: string,
  destinationFloorId: string,
): TripFeasibility {
  const plan = planner.plan(originFloorId, destinationFloorId);
  if (plan === undefined) return 'unreachable';
  if (plan.elevatorLegCount > maxLegs) return 'too-many-legs';
  if (plan.elevatorLegCount === 0) return 'no-lift-leg';
  if (enforceAccess && credentialForRoute(plan.floors, permitted) === null) return 'no-credential';
  return 'ok';
}

/* -------------------------------------------------------------------------- *
 * Trace generation
 * -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- *
 * The mix arc, as one source sees it
 * -------------------------------------------------------------------------- */

/**
 * How a mix-varying template rescales one demand source over time.
 *
 * Two numbers come out of the same multiplier, and keeping them together is what stops them
 * drifting apart:
 *
 * - {@link multiplier} reweights the source's **destination table**, so a batch at time `t` picks
 *   its floor in the proportions the mix has at `t`.
 * - {@link thinning} reweights the source's **rate**, because a source that carries only outgoing
 *   trips genuinely has fewer of them when the outgoing share is small. It is normalized by
 *   {@link peakScale} so the thinning intensity stays inside `[0, 1]` — the condition
 *   `sampleBatchArrivalTimes` requires for the acceptance test to be exact rather than
 *   silently lossy.
 *
 * The plan's own base mix cancels out of the destination weights: `weight_d ∝ λ · mean_c` and the
 * multiplier is `split_c(t) / mean_c`, so the product is `λ · split_c(t)` whatever the base was.
 * That is why `planDemand` may plan at the period mean for numerical safety without that choice
 * being a modelling claim.
 *
 * `undefined` for every source under a template that declares no mix, which is the byte-identity
 * path: the caller then uses the single static table and the unscaled rate it always used.
 */
interface MixSchedule {
  /** Largest value {@link thinning} would take before normalization. */
  readonly peakScale: number;
  /** `split_c(t) / meanSplit_c`, the destination-weight multiplier for category `c`. */
  multiplier(timeS: number, category: DirectionCategory): number;
  /** The source's rate at `t` as a fraction of its peak, in `[0, 1]`. */
  thinning(timeS: number): number;
}

/** Exact equality of three shares. Exact, not tolerant: an ulp of mix is an ulp of arrival time. */
function isSameSplit(split: DirectionalSplit | undefined, other: DirectionalSplit): boolean {
  return (
    split !== undefined &&
    split.incoming === other.incoming &&
    split.outgoing === other.outgoing &&
    split.interfloor === other.interfloor
  );
}

function mixScheduleFor(
  template: ResolvedDemandTemplate,
  source: DemandSource,
): MixSchedule | undefined {
  const mean = template.meanDirectionalSplit;
  const rates = source.categoryRates;
  if (mean === undefined || rates === undefined || source.peakPassengersPerSecond <= 0) {
    return undefined;
  }
  // A template that *states* a mix but never moves it — `mixAmplitude: 0`, the negative control —
  // takes the static path, and that is a correctness requirement rather than an optimization.
  // Rescaling by a multiplier that is 1 is not free in floating point: the rate would be summed in
  // a different order from the one `planDemand` used, and the last ulp would move every arrival
  // time. The control must be the *same run* as an ordinary fixed-split one, so it takes the same
  // code path. `traffic/mixIdentity.test.ts` asserts the resulting equality.
  if (template.phases.every((phase) => isSameSplit(phase.startSplit, mean) && isSameSplit(phase.endSplit, mean))) {
    return undefined;
  }

  const multiplier = (timeS: number, category: DirectionCategory): number => {
    const split = splitAt(template, timeS) ?? mean;
    const base = mean[category];
    // A mean share of zero can only arise from two zero endpoints, so the arc is zero there too and
    // the source carries no rate in that category. Returning 0 rather than dividing is the same
    // answer without the NaN.
    return base <= 0 ? 0 : split[category] / base;
  };
  /** The source's rate at `t`, in passengers per second, before the template's intensity. */
  const rateAt = (timeS: number): number =>
    rates.incoming * multiplier(timeS, 'incoming') +
    rates.outgoing * multiplier(timeS, 'outgoing') +
    rates.interfloor * multiplier(timeS, 'interfloor');

  // `rateAt` is piecewise-linear over exactly the phase knots — each `split_c` is — so its maximum
  // is attained at a knot and this enumeration is exact rather than a sampled approximation.
  let peakRate = 0;
  for (const phase of template.phases) {
    peakRate = Math.max(peakRate, rateAt(phase.startS), rateAt(phase.endS));
  }
  if (!(peakRate > 0)) return undefined;
  const peakScale = peakRate / source.peakPassengersPerSecond;

  return {
    peakScale,
    multiplier,
    // Clamped at 1 against floating-point overshoot at the knot that attains the maximum. The
    // clamp can only bind by an ulp: anything larger would mean `peakRate` was not the maximum.
    thinning: (timeS: number): number => Math.min(1, rateAt(timeS) / peakRate),
  };
}

/** A batch before it has been sorted into trace order and given its ids. */
interface RawBatch {
  readonly timeS: number;
  readonly sequence: number;
  readonly sourceId: string;
  readonly originFloor: FloorConfig;
  readonly picks: readonly DestinationWeight[];
}

/**
 * Generate a complete passenger trace.
 *
 * ```ts
 * const trace = generateTrace({
 *   building: loaded.buildingsById.get('midtown-office')!,
 *   profiles: loaded.trafficProfiles,
 *   streams: new StreamSet(20260726),
 * });
 * trace.passengersInReportWindow;   // ~205 for office-standard on 1710 occupants
 * ```
 *
 * The result is a value: nothing in it changes once returned, and re-running with a fresh
 * `StreamSet` on the same seed reproduces it exactly. That is what lets Phase 3 hand the
 * identical trace to every dispatcher under comparison.
 *
 * @throws TrafficError for an unsupported arrival process or batch distribution, an unknown
 *   traffic profile, or a journey no chain of banks can route.
 */
export function generateTrace(config: TrafficConfig): PassengerTrace {
  const { building, streams } = config;
  const options = resolveOptions(config);
  const plan = planDemand(config);
  const { template } = plan;

  const floorsById = building.floorsById;
  const requireFloor = (floorId: string): FloorConfig => {
    const floor = floorsById.get(floorId);
    if (floor === undefined) {
      throw new TrafficError(`Building "${building.id}" does not declare a floor "${floorId}".`);
    }
    return floor;
  };

  const entranceTable = new WeightedTable(
    plan.entrances.map((entrance) => requireFloor(entrance.floorId)),
    plan.entrances.map((entrance) => entrance.weight),
  );
  const profileFor = profileResolver(building, config.profiles);
  const intensity = (timeS: number): number => intensityAt(template, timeS);

  /* ---- sample batches, source by source, in a fixed order ---------------- */

  const rawBatches: RawBatch[] = [];
  let sequence = 0;

  for (const source of plan.sources) {
    if (source.peakBatchesPerSecond <= 0 || source.destinations.length === 0) continue;

    const mix = mixScheduleFor(template, source);
    const staticTable =
      mix === undefined
        ? new WeightedTable(
            source.destinations,
            source.destinations.map((destination) => destination.weight),
          )
        : undefined;

    // Pass A: every arrival time for this source, drawn from `arrivals` alone.
    const times = sampleBatchArrivalTimes({
      rng: streams.arrivals,
      peakBatchesPerSecond: source.peakBatchesPerSecond * (mix?.peakScale ?? 1),
      durationS: template.durationS,
      intensityAt: mix === undefined ? intensity : (timeS) => intensity(timeS) * mix.thinning(timeS),
    });

    // A resident source's origin is fixed and needs no draw; an entrance source's is drawn
    // per batch from `origins`, which is the one origin decision this generator actually makes.
    const fixedOrigin =
      source.originFloorId === undefined ? undefined : requireFloor(source.originFloorId);

    // Which stream the group-size draw comes from — the whole of docs/14 § 1.3, and the one
    // trace-moving change in the building-behaviour program.
    //
    // Under `v1` it is `arrivals`, so group size and arrival instants share a sequence and any
    // change to the group-size curve — even one preserving the mean — consumes a different number
    // of draws and shifts every subsequent arrival instant. That is the ordering all 981 pinned
    // estimates and both identity digests were measured under, and it is the default: a run that
    // does not ask for `v2` is byte-identical to the run before this branch existed.
    //
    // Under `v2` it is `batchSize`, and the two become independent. Resolved once per source
    // rather than per batch because it cannot change within a run.
    const batchSizeStream =
      options.trafficModel === 'v2' ? streams.batchSize : streams.arrivals;

    // Pass B: per batch, its origin (entrance sources only), its size, its destinations.
    for (const timeS of times) {
      const originFloor = fixedOrigin ?? entranceTable.pick(streams.origins);
      const size = drawBatchSize(batchSizeStream, profileFor(originFloor).batchSize);
      // Under a mix arc the table is the batch's own: the same destinations, reweighted by the
      // directional mix at the instant the batch appears. Rebuilt rather than mutated so that
      // `pick` stays one uniform draw whatever the weights are — a rejection scheme here would
      // make the draw count depend on the mix and desynchronize common random numbers between two
      // configurations that differ only in it.
      const destinationTable =
        staticTable ??
        new WeightedTable(
          source.destinations,
          source.destinations.map(
            (destination) => destination.weight * (mix?.multiplier(timeS, destination.category) ?? 1),
          ),
        );
      if (destinationTable.size === 0) {
        throw new TrafficError(
          `Demand source "${source.id}" has no destination with positive weight at t=${timeS} under template "${template.id}". The thinning intensity should have refused this batch; that it did not is a mismatch between the rate schedule and the destination weights.`,
        );
      }

      const picks: DestinationWeight[] = [];
      if (options.batchSharesDestination) {
        const shared = destinationTable.pick(streams.destinations);
        for (let i = 0; i < size; i += 1) picks.push(shared);
      } else {
        for (let i = 0; i < size; i += 1) picks.push(destinationTable.pick(streams.destinations));
      }

      sequence += 1;
      rawBatches.push({ timeS, sequence, sourceId: source.id, originFloor, picks });
    }
  }

  // Deterministic ordering: time first, then generation sequence. Never insertion order into
  // a hash structure (CLAUDE.md invariant 4, applied to the trace the kernel will replay).
  rawBatches.sort((left, right) => left.timeS - right.timeS || left.sequence - right.sequence);

  /* ---- materialize, in trace order --------------------------------------- */

  const planner = RoutePlanner.forBuilding(building);
  const permitted = permittedGroupsByFloor(building.accessZones);
  // `planDemand` has already dropped every pair for which no credential works, so `null` is
  // unreachable here; treat it as an unbadged visitor rather than crashing a whole trace.
  const credentialGroupFor = (route: readonly string[]): CredentialGroup | undefined =>
    options.credentialAssignment === 'none'
      ? undefined
      : (credentialForRoute(route, permitted) ?? undefined);

  const arrivals: ArrivalEvent[] = [];
  const passengers: GeneratedPassenger[] = [];
  let passengerCount = 0;
  let inWindow = 0;

  for (const [batchIndex, batch] of rawBatches.entries()) {
    const batchId = `${options.batchIdPrefix}${batchIndex + 1}`;
    const members: GeneratedPassenger[] = [];

    for (const pick of batch.picks) {
      if (pick.floorId === batch.originFloor.id) {
        throw new TrafficError(
          `Generated a trip from floor "${pick.floorId}" to itself. A trip that goes nowhere has no direction and no waiting time; it must not reach the model layer.`,
        );
      }
      const plan = planner.requirePlan(batch.originFloor.id, pick.floorId, options.maxLegs);
      const route = plan.floors;

      const legs: TraceLeg[] = [];
      const hops: TraceTransportHop[] = [];
      for (const segment of plan.segments) {
        const from = requireFloor(segment.fromFloorId);
        const to = requireFloor(segment.toFloorId);
        if (segment.kind === 'transport') {
          hops.push({
            modeId: segment.modeId,
            originFloorId: from.id,
            originFloorIndex: from.index,
            destinationFloorId: to.id,
            destinationFloorIndex: to.index,
            // The hop sits immediately before whatever leg comes next, which is the number of
            // legs already emitted — and equals `legs.length` at the end, meaning "after the
            // last one".
            beforeLegIndex: legs.length,
            traversalTimeS: segment.traversalTimeS,
          });
          continue;
        }
        legs.push({
          legIndex: legs.length,
          originFloorId: from.id,
          originFloorIndex: from.index,
          destinationFloorId: to.id,
          destinationFloorIndex: to.index,
        });
      }
      if (legs.length === 0) {
        throw new TrafficError(
          `Route ${route.join(' -> ')} has no elevator leg; planDemand should have refused this pair.`,
        );
      }

      passengerCount += 1;
      const arrivalTimeS = batch.timeS;
      const withinWindow =
        arrivalTimeS >= template.reportWindowStartS && arrivalTimeS < template.reportWindowEndS;
      if (withinWindow) inWindow += 1;

      const record: GeneratedPassenger = Object.freeze({
        id: `${options.idPrefix}${passengerCount}`,
        journeyId: `${options.journeyIdPrefix}${passengerCount}`,
        batchId,
        arrivalTimeS,
        originFloorId: batch.originFloor.id,
        originFloorIndex: batch.originFloor.index,
        finalDestinationFloorId: pick.floorId,
        finalDestinationFloorIndex: pick.floorIndex,
        legs: Object.freeze(legs),
        // Omitted, not emptied, when the route used no transport edge: a record from a building
        // that declares none must be the object it was before this field existed.
        ...(hops.length === 0 ? {} : { transportHops: Object.freeze(hops) }),
        // Mass is drawn here, in final trace order, so the mass column is a function of the
        // sorted trace rather than of the order the sources happened to be sampled in.
        massKg: drawMass(streams.passengerMass, config.profiles),
        credentialGroup: credentialGroupFor(route),
        category: pick.category,
        demandFloorId: pick.demandFloorId,
        profileId: pick.profileId,
        inReportWindow: withinWindow,
      });
      members.push(record);
      passengers.push(record);
    }

    arrivals.push(
      Object.freeze({
        id: batchId,
        timeS: batch.timeS,
        originFloorId: batch.originFloor.id,
        originFloorIndex: batch.originFloor.index,
        sourceId: batch.sourceId,
        passengers: Object.freeze(members),
      }),
    );
  }

  return Object.freeze({
    seed: streams.masterSeed.toString(),
    buildingId: building.id,
    template,
    durationS: template.durationS,
    reportWindowStartS: template.reportWindowStartS,
    reportWindowEndS: template.reportWindowEndS,
    arrivals: Object.freeze(arrivals),
    passengers: Object.freeze(passengers),
    passengerCount,
    passengersInReportWindow: inWindow,
    sources: plan.sources,
    peakPassengersPerSecond: plan.peakPassengersPerSecond,
    expectedPassengers: plan.expectedPassengers,
    // Every diagnostic worth raising is raised while planning: sampling adds no new ones,
    // because a trace that samples something the plan did not allow for is a bug, not a warning.
    warnings: plan.warnings,
  });
}

/**
 * One body mass, clamped into the configured range.
 *
 * Mirrors `model/passenger.ts`'s `drawPassengerMass` rather than importing it, so that
 * `traffic/` depends on the model's *types* and not on its runtime — and, more importantly,
 * so the clamping rule (one draw per call, tails clamped rather than rejected) is stated
 * where the trace is built. A rejection loop here would make the `passengerMass` draw count
 * depend on the values drawn.
 */
function drawMass(rng: Rng, profiles: TrafficProfiles): number {
  const config = profiles.passengerMass;
  if (config.distribution !== 'normal') {
    throw new TrafficError(
      `Unsupported passenger mass distribution "${config.distribution}". Supported: normal.`,
    );
  }
  const draw = rng.normal(config.meanKg, config.stdDevKg);
  return Math.min(Math.max(draw, config.minKg), config.maxKg ?? Number.POSITIVE_INFINITY);
}

/* -------------------------------------------------------------------------- *
 * Consuming a trace
 * -------------------------------------------------------------------------- */

/**
 * The floors a journey visits, in order: `[origin, ...transfer floors, destination]`.
 *
 * Transport hops are part of the journey, so they are part of this: a `G → 2` escalator hop
 * followed by a `2 → 27` shuttle leg reads `["G", "2", "27"]`, not `["2", "27"]`.
 */
export function routeOf(record: GeneratedPassenger): readonly string[] {
  const first = record.legs[0];
  if (first === undefined) return [record.originFloorId];
  const hops = record.transportHops ?? [];
  const floors: string[] = [];
  for (const [index, leg] of record.legs.entries()) {
    const before = hops.find((hop) => hop.beforeLegIndex === index);
    if (before !== undefined) floors.push(before.originFloorId);
    floors.push(leg.originFloorId);
    floors.push(leg.destinationFloorId);
  }
  const after = hops.find((hop) => hop.beforeLegIndex === record.legs.length);
  if (after !== undefined) floors.push(after.destinationFloorId);
  // Consecutive duplicates arise where a hop's far end is the next leg's origin, which is
  // always. Collapse them rather than special-casing the join.
  return floors.filter((floorId, index) => index === 0 || floors[index - 1] !== floorId);
}

/**
 * The transport hop immediately before elevator leg `legIndex`, or `undefined`.
 *
 * `legIndex === record.legs.length` asks for the hop that *ends* the journey — the escalator a
 * passenger rides after their last lift ride. See {@link TraceTransportHop.beforeLegIndex}.
 */
export function transportHopBefore(
  record: GeneratedPassenger,
  legIndex: number,
): TraceTransportHop | undefined {
  return (record.transportHops ?? []).find((hop) => hop.beforeLegIndex === legIndex);
}

/**
 * Seconds of non-lift travel a journey still owes after its **last** elevator leg alights.
 *
 * `0` for every journey that ends on a lift, which is every journey in every building that
 * declares no transport mode. Charged onto time-to-destination rather than thrown away: the
 * whole point of removing the spurious leg is to stop charging the *lifts* for it, not to hand
 * the passenger free seconds.
 */
export function egressTransitSecondsOf(record: GeneratedPassenger): number {
  return transportHopBefore(record, record.legs.length)?.traversalTimeS ?? 0;
}

/** The transfer floors a journey passes through. Empty for a single-leg journey. */
export function transferFloorsOf(record: GeneratedPassenger): readonly string[] {
  return routeOf(record).slice(1, -1);
}

/**
 * Turn a trace record into the `PassengerInit` for its **first** leg.
 *
 * Later legs are not built here: a leg beginning at a sky lobby starts when the passenger
 * alights, which is a simulated time the dispatcher influences. The runner materializes them
 * with `PassengerFactory.transfer`, which preserves `journeyId` and `journeyStartedAt` so
 * time-to-destination spans every leg.
 *
 * Note that this bypasses `PassengerFactory.arrive`, deliberately: the factory would draw a
 * fresh mass from the `passengerMass` stream, but the trace already carries one drawn at
 * generation time. Using the trace's value is what keeps the passenger population a pure
 * function of `(seed, config)` and independent of the order the run happens to create people.
 *
 * ## Two fields the transport modes moved, and neither moves on a building without one
 *
 * `arrivedAt` is the batch's instant **plus** any escalator hop that comes before the first lift
 * ride: a passenger walking onto the escalator at `G` is not standing at the `2` landing yet, and
 * a leg whose `arrivedAt` said otherwise would report their escalator ride as *waiting*.
 * `journeyStartedAt` stays the batch instant, so time-to-destination still spans the hop.
 * {@link leadingTransitSecondsOf} is what the runner schedules the delayed admission on.
 *
 * That moves *window membership* for such a leg by the traversal time, because
 * `PassengerRecord.arrivedAt` is the window key. It stays the property that key exists for — a
 * **dispatcher-independent** instant, identical under every configuration being compared, because
 * the traversal time is a constant of the building. A journey arriving inside the window whose
 * first lift leg begins outside it is a journey whose lift service genuinely happened outside it.
 *
 * `finalDestinationFloorId` is the **last elevator leg's** destination rather than the journey's
 * declared one. On every journey that ends on a lift those are the same floor and this is a
 * no-op; on one that ends on an escalator they differ, and it is this field that
 * `Passenger.isFinalLeg` is derived from — so making it the lift terminus is what keeps "the
 * highest-indexed planned leg is the final leg" true, which `fuzz/properties.ts` asserts
 * directly. The seconds to the real destination travel separately, as `egressTransitS`.
 */
export function toPassengerInit(record: GeneratedPassenger): PassengerInit {
  const first = record.legs[0];
  const last = record.legs[record.legs.length - 1];
  if (first === undefined || last === undefined) {
    throw new TrafficError(`Trace record "${record.id}" has no legs; it cannot become a passenger.`);
  }
  const egressTransitS = egressTransitSecondsOf(record);
  return {
    id: record.id,
    journeyId: record.journeyId,
    legIndex: 0,
    originFloorId: first.originFloorId,
    originFloorIndex: first.originFloorIndex,
    destinationFloorId: first.destinationFloorId,
    destinationFloorIndex: first.destinationFloorIndex,
    finalDestinationFloorId: last.destinationFloorId,
    journeyOriginFloorId: record.originFloorId,
    journeyStartedAt: record.arrivalTimeS,
    massKg: record.massKg,
    arrivedAt: record.arrivalTimeS + leadingTransitSecondsOf(record),
    // Only when leg 0 is also the last leg does the egress hop belong to it.
    ...(record.legs.length === 1 && egressTransitS > 0 ? { egressTransitS } : {}),
    ...(record.credentialGroup === undefined ? {} : { credentialGroup: record.credentialGroup }),
  };
}

/**
 * Seconds between a journey's arrival instant and the landing where its first lift ride begins.
 *
 * `0` unless the route opens with a transport hop. The runner delays the passenger's admission
 * by this, which is why it is a separate export rather than folded into `toPassengerInit`: the
 * init states *when* the leg begins waiting, and the runner has to know *how long from now*.
 */
export function leadingTransitSecondsOf(record: GeneratedPassenger): number {
  return transportHopBefore(record, 0)?.traversalTimeS ?? 0;
}
