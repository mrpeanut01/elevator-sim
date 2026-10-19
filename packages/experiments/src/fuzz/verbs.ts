/**
 * **The adversarial persona's generator: a seeded verb log over the seven intervention kinds.**
 *
 * The building fuzz (`generate.ts`) varies the building and holds the player still. This varies the
 * player and holds the building still: a scenario's own tower, crowd and opening dispatcher, with a
 * log of `RunInterventionConfig` entries drawn from the seven `INTERVENTION_KINDS` laid on top, at
 * instants and with the per-kind payload each kind carries. A case is a pure function of one integer,
 * its **play seed**, so every counterexample replays from that integer and nothing else.
 *
 * ## Every payload is drawn from shipped data and the building
 *
 * - `park-cars-lobby` and `spread-cars` carry nothing but their instant.
 * - `switch-dispatcher` and `adopt-dispatcher` hand the run to a **shipped** profile, verbatim and
 *   with no rule rows, which is the form a submission rebuilds from an id
 *   (`packages/server/src/leaderboard/verify.ts#profileWithRules` returns the shipped profile by
 *   identity for an empty row list). Which shipped profiles are legal targets is **asked of `core`**:
 *   {@link playContextFor} lays each one on the stage at `t = 0` and keeps those whose scheduling
 *   `core` does not refuse. That is `Simulation#resolveAdoption`'s own rule answering, rather than a
 *   copy of it here.
 * - `answer-incident` carries an option's words and service events. No incident is generated: the
 *   kind carries the answer and never the incident, so the answer is what is fuzzed.
 * - `equipment-change` and `building-change` carry a `data/price-schedule.json` row of the matching
 *   tier, priced with `core`'s `purchaseUnits`, its name, and service events. A row is drawn only if
 *   the log can still afford it on the rung the case stands on (one of the stage's own budget rungs),
 *   counting each distinct row once, so a second purchase of a row already bought costs nothing.
 *   A rated row (priced per unit) is never drawn, because a whole-change press holds no quantity.
 *
 * Service events are the three shapes `core` carries mid-run: a car's mode, a bank's range and a
 * car's rated load, each at or after its own entry's instant and never past the stage's horizon.
 *
 * ## The three construction rules, and why each is a rule rather than a filter on findings
 *
 * The building fuzz states the same kind of rule for the same reason (`generate.ts` § *Service mode
 * is generated*): a property that cannot tell a dead fleet from a stalled one would report the
 * generator's choice as a simulator defect.
 *
 * 1. **Every bank keeps a car that accepts hall calls at every instant.** The building's own schedule
 *    and every effect in the log are replayed in kernel order, `(atS, scheduling order)`, and a mode
 *    effect that would leave a bank with no `in-service` car is not drawn. P5's notion of a servable
 *    passenger is the building's topology, so a withdrawn fleet would read as a deadlock.
 * 2. **A derate never takes a car below what the heaviest rider the mass model can draw needs to
 *    board an empty car**, and never below half its plate. For the same reason one axis over: P5
 *    knows the shafts, not the rated loads.
 * 3. **A range effect never names a bank whose range `core`'s `bankRangeIsFixed` says cannot move**,
 *    and only ever names floors the bank was built to serve.
 *
 * None of the three narrows what a *property* checks. Each narrows what is *generated*, and each is
 * re-checked on every shrink candidate by {@link playLogRefusal}, so a shrunk counterexample is never
 * a log this file would refuse to generate.
 *
 * ## Shapes
 *
 * The spec's cheap multipliers, drawn per case: the do-nothing day, sparse and dense days, rapid
 * dispatcher churn, a buy-everything day, a burst at one instant, and presses at the day's two edges.
 *
 * Nothing here reads a clock or draws outside the injected `StreamSet` (CLAUDE.md invariants 2 and 3).
 * The decisions in this module bind nothing outside `fuzz/` and are recorded here, per § D405.
 */

import {
  INTERVENTION_KINDS,
  SERVICE_MODES,
  Simulation,
  SimulationError,
  StreamSet,
  bankRangeIsFixed,
  isServiceDerateEvent,
  isServiceModeEvent,
  isServiceRangeEvent,
  parsePriceSchedule,
  purchaseUnits,
  resolveLoadSensor,
  type DispatcherProfile,
  type InterventionChange,
  type LoadedConfig,
  type ResolvedServiceEvent,
  type Rng,
  type RunInterventionConfig,
} from '@elevator-sim/core';

import {
  PlayStageError,
  playStageOf,
  stageSessionConfigFor,
  type PlayStage,
  type StageSessionResources,
} from './stageSession.js';

/** A kind, as the vocabulary declares it. `core` keeps the type itself off its barrels. */
export type PlayKind = (typeof INTERVENTION_KINDS)[number];

/* -------------------------------------------------------------------------- *
 * What a stage offers the generator
 * -------------------------------------------------------------------------- */

/** One whole-change row of the price schedule, on the tier a kind records. */
export interface PlayPurchase {
  readonly id: string;
  readonly name: string;
  readonly kind: 'equipment-change' | 'building-change';
  readonly units: number;
}

/** One car a service event may name, with the lowest fraction of its plate a derate may reach. */
export interface PlayCar {
  readonly bankId: string;
  readonly carId: string;
  readonly ratedLoadLb: number;
  readonly ratedLoadKg: number;
  readonly minDerateFraction: number;
}

/** One bank whose range may move, and the floors it was built to serve. */
export interface PlayRangeBank {
  readonly bankId: string;
  readonly servesFloors: readonly string[];
}

/** Everything the generator, the properties and the shrinker need about one stage. Built once. */
export interface PlayContext {
  readonly stage: PlayStage;
  readonly resources: StageSessionResources;
  /** Shipped profiles `core` accepts as a `switch-dispatcher` target on this stage. */
  readonly switchTargets: readonly DispatcherProfile[];
  /** Shipped profiles `core` accepts as an `adopt-dispatcher` target on this stage. */
  readonly adoptTargets: readonly DispatcherProfile[];
  readonly purchases: readonly PlayPurchase[];
  readonly cars: readonly PlayCar[];
  readonly rangeBanks: readonly PlayRangeBank[];
}

/** What {@link playContextFor} reads. The two raw files are passed in, never read here. */
export interface PlayContextInput {
  readonly config: LoadedConfig;
  /** The raw `data/campaign.json`. */
  readonly campaign: unknown;
  /** The raw `data/price-schedule.json`. */
  readonly priceSchedule: unknown;
  readonly stageId: string;
}

/**
 * Whether `core` will schedule a handover to `profile` on this stage — asked, not decided here.
 *
 * The probe lays the one entry at `t = 0` on replication 0 and steps the run to its first instant,
 * which is where `Simulation` resolves the log and refuses a target it cannot become. Only a
 * `SimulationError` is read as a refusal; anything else is a crash and propagates.
 */
function coreSchedules(
  stage: PlayStage,
  resources: StageSessionResources,
  change: InterventionChange,
): boolean {
  try {
    new Simulation(stageSessionConfigFor(stage, resources, 0, [{ atS: 0, change }])).advanceTo(0);
    return true;
  } catch (error) {
    if (error instanceof SimulationError) return false;
    throw error;
  }
}

/** The heaviest rider the mass model plausibly draws: its declared ceiling, or eight deviations up. */
function heaviestRiderKg(config: LoadedConfig): number {
  const mass = config.trafficProfiles.passengerMass as unknown as Readonly<Record<string, unknown>>;
  const max = mass['maxKg'];
  if (typeof max === 'number' && Number.isFinite(max)) return max;
  const mean = typeof mass['meanKg'] === 'number' ? mass['meanKg'] : 80;
  const sd = typeof mass['stdDevKg'] === 'number' ? mass['stdDevKg'] : 20;
  return mean + 8 * sd;
}

/**
 * The stage, its building and its offers, resolved once.
 *
 * @throws PlayStageError when the stage, its building or its opening dispatcher is not shipped.
 */
export function playContextFor(input: PlayContextInput): PlayContext {
  const { config } = input;
  const stage = playStageOf(input.campaign, input.stageId);
  const building = config.buildingsById.get(stage.buildingId);
  if (building === undefined) {
    throw new PlayStageError(`stage "${stage.id}" names building "${stage.buildingId}", which data/buildings/ does not ship.`);
  }
  const opening = config.dispatcherProfilesById.get(stage.startingProfileId);
  if (opening === undefined) {
    throw new PlayStageError(
      `stage "${stage.id}" opens on dispatcher "${stage.startingProfileId}", which data/dispatcher-profiles.json does not ship.`,
    );
  }
  const resources: StageSessionResources = {
    building,
    openingProfile: opening,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };

  const profiles = config.dispatcherProfiles.profiles;
  const switchTargets = profiles.filter((profile) =>
    coreSchedules(stage, resources, { kind: 'switch-dispatcher', profile }),
  );
  const adoptTargets = profiles.filter((profile) =>
    coreSchedules(stage, resources, { kind: 'adopt-dispatcher', profile }),
  );

  const schedule = parsePriceSchedule(input.priceSchedule);
  const purchases: PlayPurchase[] = [];
  for (const row of schedule.changes) {
    if (row.rate !== undefined) continue;
    const kind = row.tier === 'equipment' ? 'equipment-change' : row.tier === 'building' ? 'building-change' : undefined;
    if (kind === undefined) continue;
    purchases.push({ id: row.id, name: row.name, kind, units: purchaseUnits(row) });
  }

  const heaviest = heaviestRiderKg(config);
  const cars: PlayCar[] = [];
  for (const bank of building.banks) {
    for (const car of bank.cars) {
      const sensor = resolveLoadSensor(car, config.elevatorSpecs.loadSensor, opening.answer);
      const floor = (heaviest * 1.25) / (car.ratedLoadKg * sensor.overloadThreshold);
      cars.push({
        bankId: bank.id,
        carId: car.id,
        ratedLoadLb: car.ratedLoadLb,
        ratedLoadKg: car.ratedLoadKg,
        minDerateFraction: Math.min(1, Math.max(0.5, floor)),
      });
    }
  }
  const rangeBanks = building.banks
    .filter((bank) => !bankRangeIsFixed(bank) && bank.servesFloors.length >= 2)
    .map((bank) => ({ bankId: bank.id, servesFloors: [...bank.servesFloors] }));

  return Object.freeze({
    stage,
    resources,
    switchTargets: Object.freeze(switchTargets),
    adoptTargets: Object.freeze(adoptTargets),
    purchases: Object.freeze(purchases),
    cars: Object.freeze(cars),
    rangeBanks: Object.freeze(rangeBanks),
  });
}

/* -------------------------------------------------------------------------- *
 * The case
 * -------------------------------------------------------------------------- */

/** The log shapes the spec names as the places edge cases cluster. Drawn per case. */
export const PLAY_SHAPES = [
  'do-nothing',
  'sparse',
  'dense',
  'churn',
  'buy-everything',
  'burst',
  'edges',
] as const;

export type PlayShape = (typeof PLAY_SHAPES)[number];

/** How large a log may grow. Stated, and printed by the command. */
export interface PlaySpace {
  readonly name: 'standard' | 'deep';
  /** Most entries a sparse, dense, burst or edges log carries. */
  readonly maxEntries: number;
  /** Most service events one effect-carrying entry carries. */
  readonly maxEffects: number;
  /** Most handovers a churn log carries. */
  readonly maxChurn: number;
}

export const STANDARD_PLAY_SPACE: PlaySpace = Object.freeze({
  name: 'standard',
  maxEntries: 10,
  maxEffects: 3,
  maxChurn: 12,
});

export const DEEP_PLAY_SPACE: PlaySpace = Object.freeze({
  name: 'deep',
  maxEntries: 40,
  maxEffects: 6,
  maxChurn: 48,
});

/**
 * One session: a stage replication with a verb log on it. Plain data, and printed whole.
 *
 * A **shrunk** case is a reduced neighbour of a generated one and does not come back from
 * `playSeed`; the seed reproduces its unshrunk parent, and the log is printed in full because three
 * of the seven kinds (`answer-incident`, `equipment-change`, `building-change`) carry service events
 * no wire form rebuilds.
 */
export interface PlayCase {
  /** `play-<seed>`, or `<parent>-s<n>` for a shrunk neighbour. */
  readonly caseId: string;
  /** The generator seed, decimal. `playCaseFromSeed(playSeed, …)` reproduces an unshrunk case. */
  readonly playSeed: string;
  readonly stageId: string;
  /** Which replication of the stage's tuning seed set the session plays on. */
  readonly replication: number;
  /** The budget rung the case stands on. Purchases are admitted against it. */
  readonly budgetUnits: number;
  /** The shape it was drawn in, or `pinned` for a regression replayed from its printed log. */
  readonly shape: PlayShape | 'pinned';
  readonly log: readonly RunInterventionConfig[];
}

const SHAPE_WEIGHTS: readonly (readonly [PlayShape, number])[] = [
  ['do-nothing', 1],
  ['sparse', 3],
  ['dense', 3],
  ['churn', 2],
  ['buy-everything', 2],
  ['burst', 1],
  ['edges', 1],
];

function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rng.nextInt(0, items.length)];
  if (item === undefined) throw new RangeError('pick from an empty list');
  return item;
}

function pickWeighted<T>(rng: Rng, weighted: readonly (readonly [T, number])[]): T {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let draw = rng.nextFloat() * total;
  for (const [item, weight] of weighted) {
    draw -= weight;
    if (draw < 0) return item;
  }
  const last = weighted[weighted.length - 1];
  if (last === undefined) throw new RangeError('pick from an empty list');
  return last[0];
}

/* -------------------------------------------------------------------------- *
 * Legality, stated once and asked of every log
 * -------------------------------------------------------------------------- */

function effectsOf(change: InterventionChange): readonly ResolvedServiceEvent[] {
  return 'serviceEvents' in change ? change.serviceEvents : [];
}

/**
 * Whether every bank keeps an `in-service` car at every instant of the schedule — construction
 * rule 1. The building's own events come first and the log's effects after them in log order, each
 * stably ordered by `atS`, which is the kernel's `(time, sequence)` order for these entries.
 */
function everyBankKeepsAServingCar(context: PlayContext, log: readonly RunInterventionConfig[]): boolean {
  const { building } = context.resources;
  const mode = new Map<string, string>();
  for (const bank of building.banks) for (const car of bank.cars) mode.set(`${bank.id}/${car.id}`, car.mode);
  const serving = (bankId: string): boolean =>
    (building.banks.find((bank) => bank.id === bankId)?.cars ?? []).some(
      (car) => mode.get(`${bankId}/${car.id}`) === 'in-service',
    );
  if (!building.banks.every((bank) => serving(bank.id))) return false;
  const schedule = [...(building.serviceEvents ?? []), ...log.flatMap((entry) => effectsOf(entry.change))]
    .map((event, order) => ({ event, order }))
    .sort((a, b) => a.event.atS - b.event.atS || a.order - b.order);
  for (const { event } of schedule) {
    if (!isServiceModeEvent(event)) continue;
    mode.set(`${event.bankId}/${event.carId}`, event.mode);
    if (!serving(event.bankId)) return false;
  }
  return true;
}

/** Distinct rows a log has bought, priced. A row bought twice is paid for once. */
export function playLogSpend(context: PlayContext, log: readonly RunInterventionConfig[]): number {
  const bought = new Map<string, number>();
  for (const entry of log) {
    const change = entry.change;
    if (change.kind !== 'equipment-change' && change.kind !== 'building-change') continue;
    const row = context.purchases.find((purchase) => purchase.id === change.changeId);
    if (row !== undefined) bought.set(row.id, row.units);
  }
  return [...bought.values()].reduce((sum, units) => sum + units, 0);
}

/**
 * Why this file would refuse to generate a log, or `undefined` for one it could have generated.
 *
 * The one statement of a legal log, asked by the generator as it builds and by the shrinker of every
 * candidate. Its grounds are `core`'s scheduling refusals (a handover target `core` refused, an effect
 * before its own press, an unknown car or bank, a range on a fixed bank, a non-positive or
 * above-plate load), the price schedule's tiers and the stage's budget, and the three construction
 * rules in the module docstring.
 */
export function playLogRefusal(
  context: PlayContext,
  log: readonly RunInterventionConfig[],
  budgetUnits: number,
): string | undefined {
  const { durationS } = context.stage;
  let previousAtS = 0;
  for (const [index, entry] of log.entries()) {
    const at = `log[${String(index)}]`;
    if (!Number.isFinite(entry.atS) || entry.atS < 0 || entry.atS > durationS) {
      return `${at} is stamped at ${String(entry.atS)} s, outside the day [0, ${String(durationS)}] s`;
    }
    if (entry.atS < previousAtS) return `${at} is stamped before the entry above it; a playhead only moves forward`;
    previousAtS = entry.atS;
    const change = entry.change;
    if (change.kind === 'switch-dispatcher' && !context.switchTargets.includes(change.profile)) {
      return `${at} switches to "${change.profile.id}", which is not a shipped profile core schedules here`;
    }
    if (change.kind === 'adopt-dispatcher' && !context.adoptTargets.includes(change.profile)) {
      return `${at} adopts "${change.profile.id}", which is not a shipped profile core schedules here`;
    }
    if (change.kind === 'equipment-change' || change.kind === 'building-change') {
      const row = context.purchases.find((purchase) => purchase.id === change.changeId);
      if (row === undefined || row.kind !== change.kind) {
        return `${at} buys "${change.changeId}", which is not a whole-change row of the ${change.kind} tier`;
      }
    }
    for (const effect of effectsOf(change)) {
      if (effect.atS < entry.atS || effect.atS > durationS) {
        return `${at} carries an effect at ${String(effect.atS)} s, outside [${String(entry.atS)}, ${String(durationS)}] s`;
      }
      if (isServiceRangeEvent(effect)) {
        const bank = context.rangeBanks.find((candidate) => candidate.bankId === effect.bankId);
        if (bank === undefined) return `${at} moves the range of bank "${effect.bankId}", which may not move`;
        if (effect.servesFloors.length === 0 || effect.servesFloors.some((floor) => !bank.servesFloors.includes(floor))) {
          return `${at} sets bank "${effect.bankId}" to a range outside the floors it was built to serve`;
        }
        if (new Set(effect.servesFloors).size !== effect.servesFloors.length) return `${at} lists a floor twice`;
        continue;
      }
      const car = context.cars.find((candidate) => candidate.bankId === effect.bankId && candidate.carId === effect.carId);
      if (car === undefined) return `${at} names car "${effect.bankId}/${effect.carId}", which this building does not build`;
      if (isServiceDerateEvent(effect)) {
        if (
          !(effect.ratedLoadKg > 0) ||
          effect.ratedLoadLb > car.ratedLoadLb ||
          effect.ratedLoadKg < car.ratedLoadKg * car.minDerateFraction - 1
        ) {
          return `${at} rates car "${effect.bankId}/${effect.carId}" at ${String(effect.ratedLoadKg)} kg, outside [${(car.ratedLoadKg * car.minDerateFraction).toFixed(0)}, ${String(car.ratedLoadKg)}] kg`;
        }
      } else if (!(SERVICE_MODES as readonly string[]).includes(effect.mode)) {
        return `${at} sets an undeclared mode "${String(effect.mode)}"`;
      }
    }
  }
  if (playLogSpend(context, log) > budgetUnits) {
    return `the log spends ${String(playLogSpend(context, log))} u on a ${String(budgetUnits)} u rung`;
  }
  if (!everyBankKeepsAServingCar(context, log)) return 'a bank is left with no car accepting hall calls';
  return undefined;
}

/* -------------------------------------------------------------------------- *
 * Drawing a log
 * -------------------------------------------------------------------------- */

const DERATE_FRACTIONS: readonly number[] = [0.5, 0.6, 0.75, 0.9, 1];

/** Draws payloads and appends entries, refusing anything {@link playLogRefusal} would refuse. */
class LogBuilder {
  readonly entries: RunInterventionConfig[] = [];

  constructor(
    private readonly context: PlayContext,
    private readonly budgetUnits: number,
    private readonly space: PlaySpace,
    private readonly payloads: Rng,
    private readonly effects: Rng,
  ) {}

  /** Append `entry` if the log stays legal. */
  private push(entry: RunInterventionConfig): boolean {
    const candidate = [...this.entries, entry];
    if (playLogRefusal(this.context, candidate, this.budgetUnits) !== undefined) return false;
    this.entries.push(entry);
    return true;
  }

  private effectAt(entryAtS: number): number {
    const { durationS } = this.context.stage;
    if (this.effects.nextFloat() < 0.3 || entryAtS >= durationS) return entryAtS;
    return this.effects.nextIntInclusive(Math.ceil(entryAtS), Math.floor(durationS));
  }

  /** Up to `count` legal service events at or after `entryAtS`; an effect that breaks a rule is not drawn. */
  private drawEffects(entryAtS: number, count: number): ResolvedServiceEvent[] {
    const drawn: ResolvedServiceEvent[] = [];
    for (let i = 0; i < count; i += 1) {
      const atS = this.effectAt(entryAtS);
      const shape = this.effects.nextFloat();
      let effect: ResolvedServiceEvent;
      if (shape < 0.25 && this.context.rangeBanks.length > 0) {
        const bank = pick(this.effects, this.context.rangeBanks);
        const keep = this.effects.nextFloat() < 0.3
          ? [...bank.servesFloors]
          : bank.servesFloors.filter(() => this.effects.nextFloat() < 0.6);
        const servesFloors = keep.length === 0 ? [pick(this.effects, bank.servesFloors)] : keep;
        effect = { atS, bankId: bank.bankId, servesFloors };
      } else if (shape < 0.5) {
        const car = pick(this.effects, this.context.cars);
        const fractions = DERATE_FRACTIONS.filter((fraction) => fraction >= car.minDerateFraction);
        const fraction = fractions.length === 0 ? 1 : pick(this.effects, fractions);
        effect = {
          atS,
          bankId: car.bankId,
          carId: car.carId,
          ratedLoadLb: Math.round(car.ratedLoadLb * fraction),
          ratedLoadKg: Math.round(car.ratedLoadKg * fraction),
        };
      } else {
        const car = pick(this.effects, this.context.cars);
        effect = { atS, bankId: car.bankId, carId: car.carId, mode: pick(this.effects, SERVICE_MODES) };
      }
      // Construction rule 1 is asked of the whole log with this effect in it, so an effect that
      // would withdraw a bank's last serving car is simply not drawn.
      const probe: RunInterventionConfig = {
        atS: entryAtS,
        change: { kind: 'answer-incident', option: 'probe', serviceEvents: [...drawn, effect] },
      };
      if (playLogRefusal(this.context, [...this.entries, probe], Number.POSITIVE_INFINITY) === undefined) {
        drawn.push(effect);
      }
    }
    return drawn;
  }

  private effectCount(): number {
    return this.payloads.nextIntInclusive(0, this.space.maxEffects);
  }

  /** One entry of `kind` at `atS`. Returns whether it was appended. */
  add(kind: PlayKind, atS: number): boolean {
    switch (kind) {
      case 'park-cars-lobby':
      case 'spread-cars':
        return this.push({ atS, change: { kind } });
      case 'switch-dispatcher':
        if (this.context.switchTargets.length === 0) return false;
        return this.push({ atS, change: { kind, profile: pick(this.payloads, this.context.switchTargets) } });
      case 'adopt-dispatcher':
        if (this.context.adoptTargets.length === 0) return false;
        return this.push({ atS, change: { kind, profile: pick(this.payloads, this.context.adoptTargets) } });
      case 'answer-incident': {
        const option = `answer ${String(this.payloads.nextIntInclusive(1, 9))}`;
        return this.push({ atS, change: { kind, option, serviceEvents: this.drawEffects(atS, this.effectCount()) } });
      }
      case 'equipment-change':
      case 'building-change': {
        const spent = playLogSpend(this.context, this.entries);
        const bought = new Set(
          this.entries.flatMap((entry) =>
            entry.change.kind === 'equipment-change' || entry.change.kind === 'building-change'
              ? [entry.change.changeId]
              : [],
          ),
        );
        const affordable = this.context.purchases.filter(
          (row) => row.kind === kind && (bought.has(row.id) || spent + row.units <= this.budgetUnits),
        );
        if (affordable.length === 0) return false;
        return this.buy(pick(this.payloads, affordable), atS);
      }
    }
  }

  buy(row: PlayPurchase, atS: number): boolean {
    return this.push({
      atS,
      change: { kind: row.kind, changeId: row.id, name: row.name, serviceEvents: this.drawEffects(atS, this.effectCount()) },
    });
  }
}

function sortedInstants(rng: Rng, count: number, durationS: number): number[] {
  const instants: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const whole = rng.nextIntInclusive(0, Math.floor(durationS));
    // A press between whole seconds now and then: the playhead is a float, and so is `atS`.
    instants.push(rng.nextFloat() < 0.1 && whole < durationS ? whole + 0.5 : whole);
  }
  return instants.sort((a, b) => a - b);
}

/**
 * The case a play seed names, on a stage, in a space. Pure and total for `(seed, context, space)`.
 *
 * Seven named streams, one per concern, so a change to how one axis is drawn moves nothing drawn on
 * another.
 */
export function playCaseFromSeed(playSeed: number | bigint, context: PlayContext, space: PlaySpace): PlayCase {
  const streams = new StreamSet(playSeed);
  const shapeRng = streams.derive('play.shape');
  const sessionRng = streams.derive('play.session');
  const countRng = streams.derive('play.counts');
  const instantRng = streams.derive('play.instants');
  const kindRng = streams.derive('play.kinds');
  const payloadRng = streams.derive('play.payloads');
  const effectRng = streams.derive('play.effects');

  const { stage } = context;
  const shape = pickWeighted(shapeRng, SHAPE_WEIGHTS);
  const replication = sessionRng.nextInt(0, stage.tuningSeeds.replications);
  const budgetUnits = pick(sessionRng, stage.budgetRungs);
  const builder = new LogBuilder(context, budgetUnits, space, payloadRng, effectRng);
  const durationS = stage.durationS;

  switch (shape) {
    case 'do-nothing':
      break;
    case 'sparse':
    case 'dense': {
      const count = shape === 'sparse'
        ? countRng.nextIntInclusive(1, Math.min(3, space.maxEntries))
        : countRng.nextIntInclusive(Math.min(4, space.maxEntries), space.maxEntries);
      for (const atS of sortedInstants(instantRng, count, durationS)) builder.add(pick(kindRng, INTERVENTION_KINDS), atS);
      break;
    }
    case 'churn': {
      const count = countRng.nextIntInclusive(Math.min(4, space.maxChurn), space.maxChurn);
      const gap = pick(countRng, [0, 1, 2, 5, 10, 30]);
      let atS = instantRng.nextIntInclusive(0, Math.floor(durationS));
      for (let i = 0; i < count; i += 1) {
        builder.add(kindRng.nextFloat() < 0.5 ? 'switch-dispatcher' : 'adopt-dispatcher', Math.min(atS, durationS));
        atS += gap;
      }
      break;
    }
    case 'buy-everything': {
      const rows = [...context.purchases].sort((a, b) => a.units - b.units || (a.id < b.id ? -1 : 1));
      const instants = sortedInstants(instantRng, rows.length, durationS);
      let next = 0;
      for (const row of rows) {
        const atS = instants[next] ?? durationS;
        if (playLogSpend(context, builder.entries) + row.units > budgetUnits) continue;
        if (builder.buy(row, atS)) next += 1;
      }
      break;
    }
    case 'burst': {
      const count = countRng.nextIntInclusive(2, Math.max(2, space.maxEntries));
      const atS = instantRng.nextIntInclusive(0, Math.floor(durationS));
      for (let i = 0; i < count; i += 1) builder.add(pick(kindRng, INTERVENTION_KINDS), atS);
      break;
    }
    case 'edges': {
      const count = countRng.nextIntInclusive(1, Math.max(1, Math.min(4, space.maxEntries)));
      for (let i = 0; i < count; i += 1) builder.add(pick(kindRng, INTERVENTION_KINDS), 0);
      for (let i = 0; i < count; i += 1) builder.add(pick(kindRng, INTERVENTION_KINDS), durationS);
      break;
    }
  }

  return Object.freeze({
    caseId: `play-${String(playSeed)}`,
    playSeed: String(playSeed),
    stageId: stage.id,
    replication,
    budgetUnits,
    shape,
    log: Object.freeze(builder.entries),
  });
}
