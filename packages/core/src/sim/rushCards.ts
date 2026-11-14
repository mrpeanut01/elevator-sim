/**
 * **A rush is a card: a wave model and a roll** — [§ D1636](../../../../DECISIONS.md), the product
 * owner's direction of 2026-11-13: *ramp up busy cycles in waves, make the end line depend on the
 * rush, take shafts out with failures, and keep how long a building lasts consistent for one
 * dispatcher between wave models.*
 *
 * `sim/rush.ts` is one stream, one seed and one line. This module is what varies around it, and it
 * is in `core` for that module's reason: the server replays a posted sitting and has to build the
 * same round the viewer played, so everything a card decides is decided here, once, from
 * `data/rush-cards.json` and the building.
 *
 * - **The wave model** names a demand template. Every model is the climb, wave for wave, with a
 *   different rhythm inside each three-minute wave (`scripts/generate-rush-wave-models.mjs`), so a
 *   wave number means the same crowd size under all of them.
 * - **The roll** moves the seed, so the same model is a different morning. Roll 0 of the climb is
 *   the rush as it was before cards: seed 90 210, no incidents, forty past two minutes.
 * - **The incidents** are drawn from the card's own named stream (invariant 2) before the run and
 *   reach it as plain service events on the building, the engine's one vocabulary for a car leaving
 *   and returning mid-run. Nothing is drawn while the run plays, so a replay is the same run.
 * - **The line** is the model's, and it rises by an incident's slack while that incident is open
 *   and for a recovery stretch after it.
 *
 * Invariant 3 holds: nothing here reads a clock. Invariant 7 holds: every number is the data file's.
 */

import type { DemandTemplate, ResolvedBuilding, ResolvedServiceEvent, TrafficProfiles } from '../config/types.js';
import { StreamSet } from '../random/index.js';

import { RUSH_HOLD_LINE, RUSH_STREAM, RUSH_TEMPLATE_ID, rushHoldAtLegs, rushTopRatePctPop5min, type RushHoldLeg } from './rush.js';

export class RushCardsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RushCardsError';
  }
}

/** The line a round ends on: `people` standing past `overS` seconds at once. */
export interface RushLine {
  readonly people: number;
  readonly overS: number;
}

export interface RushWaveModel {
  readonly id: string;
  /** The player's name for it. */
  readonly name: string;
  /** One line a player reads before choosing it. */
  readonly blurb: string;
  /** The demand template in `data/traffic-profiles.json`. */
  readonly templateId: string;
  /** The template's peak against wave 30 of the climb. */
  readonly peakFactor: number;
  /** Whether cars go out of service during a round. */
  readonly incidents: boolean;
  readonly holdLine: RushLine;
}

export interface RushIncidentKind {
  readonly id: string;
  readonly title: string;
  /** What happened, with `{car}` and, on a two-car incident, `{other}`. */
  readonly text: string;
  /** What is said when the cars come back, with the same placeholders. */
  readonly allClear: string;
  /** How many cars it takes: one, or two where the bank can spare them. */
  readonly cars: 1 | 2;
  readonly durationS: number;
  /** The first player-facing wave it may happen in. */
  readonly minWave: number;
  /** Only a car at least this fast can have it. */
  readonly minSpeedMps: number;
  /** How far the line rises while it is open. */
  readonly slackPeople: number;
}

export interface RushIncidentSchedule {
  /** No incident before this player-facing wave. */
  readonly firstWave: number;
  /** Waves between one incident's wave and the next, inclusive bounds. */
  readonly gapWaves: { readonly min: number; readonly max: number };
  /** Seconds into its wave an incident starts, inclusive bounds. */
  readonly offsetS: { readonly min: number; readonly max: number };
  /** How long the slack stays after the cars are back. */
  readonly recoveryS: number;
  readonly deck: readonly RushIncidentKind[];
}

export interface RushCards {
  readonly waveModels: readonly RushWaveModel[];
  /**
   * The wave models' own demand templates, `data/rush-wave-templates.json`. The classic climb's is
   * `endless-rush` in `data/traffic-profiles.json` and is not here.
   */
  readonly templates: readonly DemandTemplate[];
  readonly incidents: RushIncidentSchedule;
}

/** What a round is played on. Absent anywhere a card is optional means {@link RUSH_CLASSIC_CARD}. */
export interface RushCard {
  readonly model: string;
  readonly roll: number;
}

/** The rush as it was before cards. */
export const RUSH_CLASSIC_CARD: RushCard = Object.freeze({ model: 'climb', roll: 0 });

/** The largest roll a card may carry. A day number is about twenty thousand. */
export const RUSH_MAX_ROLL = 999_999;

export function rushCardIsClassic(card: RushCard): boolean {
  return card.model === RUSH_CLASSIC_CARD.model && card.roll === RUSH_CLASSIC_CARD.roll;
}

/** `climb.0`, `surges.20405`: a card as one token, for a board key and a query. */
export function rushCardKeyOf(card: RushCard): string {
  return `${card.model}.${String(card.roll)}`;
}

/* -------------------------------------------------------------------------- *
 * The data file
 * -------------------------------------------------------------------------- */

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RushCardsError(`${where}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new RushCardsError(`${where}: expected a non-empty list.`);
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RushCardsError(`${where}: expected a non-empty string.`);
  return value;
}

function numberIn(value: unknown, min: number, max: number, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RushCardsError(`${where}: expected a number from ${String(min)} to ${String(max)}.`);
  }
  return value;
}

function wholeIn(value: unknown, min: number, max: number, where: string): number {
  const n = numberIn(value, min, max, where);
  if (!Number.isInteger(n)) throw new RushCardsError(`${where}: expected a whole number.`);
  return n;
}

function bounds(value: unknown, min: number, max: number, where: string): { readonly min: number; readonly max: number } {
  const entry = record(value, where);
  const low = wholeIn(entry['min'], min, max, `${where}.min`);
  const high = wholeIn(entry['max'], low, max, `${where}.max`);
  return { min: low, max: high };
}

function parseModel(raw: unknown, where: string): RushWaveModel {
  const entry = record(raw, where);
  const line = record(entry['holdLine'], `${where}.holdLine`);
  if (typeof entry['incidents'] !== 'boolean') throw new RushCardsError(`${where}.incidents: expected true or false.`);
  return {
    id: text(entry['id'], `${where}.id`),
    name: text(entry['name'], `${where}.name`),
    blurb: text(entry['blurb'], `${where}.blurb`),
    templateId: text(entry['templateId'], `${where}.templateId`),
    peakFactor: numberIn(entry['peakFactor'], 1, 3, `${where}.peakFactor`),
    incidents: entry['incidents'],
    holdLine: {
      people: wholeIn(line['people'], 5, 500, `${where}.holdLine.people`),
      overS: wholeIn(line['overS'], 30, 600, `${where}.holdLine.overS`),
    },
  };
}

function parseKind(raw: unknown, where: string): RushIncidentKind {
  const entry = record(raw, where);
  const cars = wholeIn(entry['cars'], 1, 2, `${where}.cars`);
  return {
    id: text(entry['id'], `${where}.id`),
    title: text(entry['title'], `${where}.title`),
    text: text(entry['text'], `${where}.text`),
    allClear: text(entry['allClear'], `${where}.allClear`),
    cars: cars === 2 ? 2 : 1,
    durationS: wholeIn(entry['durationS'], 30, 900, `${where}.durationS`),
    minWave: wholeIn(entry['minWave'], 1, 30, `${where}.minWave`),
    minSpeedMps: numberIn(entry['minSpeedMps'] ?? 0, 0, 30, `${where}.minSpeedMps`),
    slackPeople: wholeIn(entry['slackPeople'], 0, 200, `${where}.slackPeople`),
  };
}

/**
 * `data/rush-cards.json` and `data/rush-wave-templates.json`, checked. The first model must be the
 * classic climb on the classic line, and every other model must name a template the second file holds.
 *
 * A template is read here only far enough to find it; `traffic/demandTemplate.ts` holds a phase list
 * to its rules when a round resolves it, and `sim/rushCards.test.ts` resolves every one.
 */
export function parseRushCards(raw: unknown, templatesRaw: unknown): RushCards {
  const entry = record(raw, 'rush-cards');
  if (entry['version'] !== 1) throw new RushCardsError('rush-cards.version: this reader knows version 1.');
  const waveModels = list(entry['waveModels'], 'rush-cards.waveModels').map((model, index) =>
    parseModel(model, `rush-cards.waveModels[${String(index)}]`),
  );
  const ids = new Set(waveModels.map((model) => model.id));
  if (ids.size !== waveModels.length) throw new RushCardsError('rush-cards.waveModels: two models share an id.');
  const classic = waveModels[0];
  if (
    classic === undefined ||
    classic.id !== RUSH_CLASSIC_CARD.model ||
    classic.templateId !== RUSH_TEMPLATE_ID ||
    classic.peakFactor !== 1 ||
    classic.incidents ||
    classic.holdLine.people !== RUSH_HOLD_LINE.people ||
    classic.holdLine.overS !== RUSH_HOLD_LINE.overS
  ) {
    throw new RushCardsError(
      'rush-cards.waveModels[0]: the first model is the climb as it has always run: the endless-rush ' +
        'template at peak factor 1, no incidents, on the standing line. Stored sittings and the house runs are that rush.',
    );
  }
  const schedule = record(entry['incidents'], 'rush-cards.incidents');
  const deck = list(schedule['deck'], 'rush-cards.incidents.deck').map((kind, index) =>
    parseKind(kind, `rush-cards.incidents.deck[${String(index)}]`),
  );
  if (!deck.some((kind) => kind.cars === 1 && kind.minSpeedMps === 0 && kind.minWave <= 30)) {
    throw new RushCardsError('rush-cards.incidents.deck: at least one incident must be able to happen to any one car.');
  }
  const templateFile = record(templatesRaw, 'rush-wave-templates');
  if (templateFile['version'] !== 1) throw new RushCardsError('rush-wave-templates.version: this reader knows version 1.');
  const templates = list(templateFile['templates'], 'rush-wave-templates.templates').map((entry, index) => {
    const where = `rush-wave-templates.templates[${String(index)}]`;
    const template = record(entry, where);
    text(template['id'], `${where}.id`);
    list(template['phases'], `${where}.phases`);
    return template as unknown as DemandTemplate;
  });
  for (const model of waveModels.slice(1)) {
    if (!templates.some((template) => template.id === model.templateId)) {
      throw new RushCardsError(`rush-cards: wave model "${model.id}" names the template "${model.templateId}", which rush-wave-templates does not hold.`);
    }
  }
  const gapWaves = bounds(schedule['gapWaves'], 1, 30, 'rush-cards.incidents.gapWaves');
  const offsetS = bounds(schedule['offsetS'], 0, RUSH_STREAM.waveS - 1, 'rush-cards.incidents.offsetS');
  const longest = Math.max(...deck.map((kind) => kind.durationS));
  if (longest + offsetS.max - offsetS.min >= gapWaves.min * RUSH_STREAM.waveS) {
    throw new RushCardsError(
      'rush-cards.incidents: the longest incident, started as late in its wave as the file allows, would still be ' +
        'open when the next one could start. One incident is open at a time.',
    );
  }
  return {
    waveModels,
    templates,
    incidents: {
      firstWave: wholeIn(schedule['firstWave'], 1, 30, 'rush-cards.incidents.firstWave'),
      gapWaves,
      offsetS,
      recoveryS: wholeIn(schedule['recoveryS'], 0, 900, 'rush-cards.incidents.recoveryS'),
      deck,
    },
  };
}

/* -------------------------------------------------------------------------- *
 * A card's run
 * -------------------------------------------------------------------------- */

/** The card's wave model, or `undefined` for an id the file does not carry. */
export function rushWaveModelOf(cards: RushCards, card: RushCard): RushWaveModel | undefined {
  return cards.waveModels.find((model) => model.id === card.model);
}

/** Why a card cannot be played, or `undefined`. */
export function rushCardIssueOf(cards: RushCards, card: RushCard): string | undefined {
  if (rushWaveModelOf(cards, card) === undefined) return `no wave model "${card.model}"`;
  if (!Number.isInteger(card.roll) || card.roll < 0 || card.roll > RUSH_MAX_ROLL) {
    return `a roll is a whole number from 0 to ${String(RUSH_MAX_ROLL)}`;
  }
  return undefined;
}

const WITH_RUSH_TEMPLATES = new WeakMap<TrafficProfiles, WeakMap<RushCards, TrafficProfiles>>();

/**
 * **The traffic profiles a card's round runs on**: `base` with the wave models' templates added.
 *
 * The templates are kept out of `data/traffic-profiles.json` because that file is part of every
 * run's configuration and of the inputs pinned measurements are hashed over
 * (`data/scenario-survivors.json`, `data/fixit-as-built-mornings.json`); adding three records there
 * moved every one of those hashes for runs that never read them. So only a rush round on a card sees
 * them, through this function, on both ends. The answer is the same object for the same pair, so a
 * caller comparing configurations by identity still can.
 */
export function rushTrafficProfilesOf(cards: RushCards, base: TrafficProfiles): TrafficProfiles {
  let byCards = WITH_RUSH_TEMPLATES.get(base);
  if (byCards === undefined) {
    byCards = new WeakMap();
    WITH_RUSH_TEMPLATES.set(base, byCards);
  }
  let extended = byCards.get(cards);
  if (extended === undefined) {
    const held = new Set(base.demandTemplates.map((template) => template.id));
    extended = { ...base, demandTemplates: [...base.demandTemplates, ...cards.templates.filter((template) => !held.has(template.id))] };
    byCards.set(cards, extended);
  }
  return extended;
}

/** The seed a card's run carries. Roll 0 is the rush's one seed. */
export function rushSeedOf(card: RushCard): number {
  return RUSH_STREAM.seed + card.roll;
}

/** The model's peak as `arrivalRatePctPop5min` for a building of `population`. */
export function rushModelRatePctPop5min(model: RushWaveModel, population: number): number {
  return rushTopRatePctPop5min(population) * model.peakFactor;
}

/** One car, located. */
export interface RushIncidentCar {
  readonly bankId: string;
  readonly carId: string;
}

/** One incident of one round: which cars leave, when, and when they are back. */
export interface RushIncident {
  readonly kind: RushIncidentKind;
  /** Seconds from the run's start. */
  readonly atS: number;
  readonly untilS: number;
  /** The first is `{car}`; a second is `{other}`. */
  readonly cars: readonly RushIncidentCar[];
}

/**
 * **The incidents of a card's round on a building**, in time order.
 *
 * Drawn from the stream `rush-incidents` of the card's own seed, so the crowd's streams are not
 * touched and a card names the same incidents on every machine. One incident is open at a time:
 * the next starts at least `gapWaves.min` waves after the last one's wave, and the deck's longest
 * incident is shorter than that gap.
 *
 * **A bank keeps a car.** A car is taken only from a bank with a second car in it, and a two-car
 * incident happens only in a bank with a third, so its sentence never names a car that stayed in
 * service. A building where no bank has two cars has no incidents, because taking its only lift
 * would end the round rather than test it.
 */
export function rushIncidentsOf(cards: RushCards, building: ResolvedBuilding, card: RushCard): readonly RushIncident[] {
  const model = rushWaveModelOf(cards, card);
  if (model === undefined || !model.incidents) return [];
  const schedule = cards.incidents;
  const rng = new StreamSet(rushSeedOf(card)).derive('rush-incidents');
  const banks = building.banks.filter((bank) => bank.cars.length >= 2);
  if (banks.length === 0) return [];
  const pool = banks.flatMap((bank) => bank.cars.map((car) => ({ bankId: bank.id, carId: car.id, speed: car.ratedSpeedMps, spare: bank.cars.length - 1 })));
  const ableFor = (kind: RushIncidentKind): typeof pool =>
    pool.filter((car) => car.speed >= kind.minSpeedMps && car.spare >= kind.cars);
  const lastWave = RUSH_STREAM.lengthS / RUSH_STREAM.waveS;
  const incidents: RushIncident[] = [];
  let wave = schedule.firstWave + rng.nextIntInclusive(0, schedule.gapWaves.max - schedule.gapWaves.min);
  let previous: string | undefined;
  while (wave <= lastWave) {
    const kinds = schedule.deck.filter((kind) => kind.minWave <= wave && kind.id !== previous && ableFor(kind).length > 0);
    /* Three draws a turn whether or not a kind is found, so one building's deck never shifts another's schedule. */
    const kindDraw = rng.nextFloat();
    const offsetS = rng.nextIntInclusive(schedule.offsetS.min, schedule.offsetS.max);
    const gap = rng.nextIntInclusive(schedule.gapWaves.min, schedule.gapWaves.max);
    const kind = kinds[Math.min(kinds.length - 1, Math.floor(kindDraw * kinds.length))];
    if (kind !== undefined) {
      const able = ableFor(kind);
      const first = able[rng.nextInt(0, able.length)];
      if (first !== undefined) {
        const cars: RushIncidentCar[] = [{ bankId: first.bankId, carId: first.carId }];
        if (kind.cars === 2) {
          const others = pool.filter((car) => car.bankId === first.bankId && car.carId !== first.carId);
          const second = others[rng.nextInt(0, others.length)];
          if (second !== undefined) cars.push({ bankId: second.bankId, carId: second.carId });
        }
        const atS = (wave - 1) * RUSH_STREAM.waveS + offsetS;
        /* One that would still be open when the stream ends is not scheduled: its cars would never come back. */
        if (atS + kind.durationS <= RUSH_STREAM.lengthS) {
          incidents.push({ kind, atS, untilS: atS + kind.durationS, cars });
          previous = kind.id;
        }
      }
    }
    wave += gap;
  }
  return incidents;
}

/** The incidents as the engine runs them: out of service at the start, back in service at the end. */
export function rushServiceEventsOf(incidents: readonly RushIncident[]): readonly ResolvedServiceEvent[] {
  return incidents.flatMap((incident) =>
    incident.cars.flatMap((car) => [
      { atS: incident.atS, bankId: car.bankId, carId: car.carId, mode: 'out-of-service' as const },
      { atS: incident.untilS, bankId: car.bankId, carId: car.carId, mode: 'in-service' as const },
    ]),
  );
}

/** The building a card's round runs on: the same building, with the incidents on its schedule. */
export function rushBuildingWithIncidents(building: ResolvedBuilding, incidents: readonly RushIncident[]): ResolvedBuilding {
  if (incidents.length === 0) return building;
  return { ...building, serviceEvents: [...(building.serviceEvents ?? []), ...rushServiceEventsOf(incidents)] };
}

/* -------------------------------------------------------------------------- *
 * The line
 * -------------------------------------------------------------------------- */

/** A stretch in which the line stands higher. Times are seconds from the run's start. */
export interface RushSlack {
  readonly fromS: number;
  readonly untilS: number;
  readonly people: number;
}

/** A round's line: the model's, and the stretches an incident raises it over. */
export interface RushRoundLine extends RushLine {
  readonly slack: readonly RushSlack[];
}

/** The classic line with nothing raising it. */
export const RUSH_CLASSIC_LINE: RushRoundLine = Object.freeze({ ...RUSH_HOLD_LINE, slack: Object.freeze([]) });

/** The line of a card's round: the model's own, raised over each incident and its recovery. */
export function rushRoundLineOf(cards: RushCards, card: RushCard, incidents: readonly RushIncident[]): RushRoundLine {
  const model = rushWaveModelOf(cards, card);
  if (model === undefined) return RUSH_CLASSIC_LINE;
  return {
    ...model.holdLine,
    slack: incidents
      .filter((incident) => incident.kind.slackPeople > 0)
      .map((incident) => ({
        fromS: incident.atS,
        untilS: incident.untilS + cards.incidents.recoveryS,
        people: incident.kind.slackPeople,
      })),
  };
}

/** How many people past the wait the line takes at `heldS` seconds into the round. */
export function rushLinePeopleAt(line: RushRoundLine, heldS: number): number {
  let slack = 0;
  for (const stretch of line.slack) {
    if (heldS >= stretch.fromS && heldS < stretch.untilS) slack = Math.max(slack, stretch.people);
  }
  return line.people + slack;
}

/**
 * `sim/rush.ts#rushHoldAtLegs` on a round's own line: the first two-second bucket at which the
 * people past `line.overS` reach the line as it stands at that bucket, or `undefined`.
 *
 * On {@link RUSH_CLASSIC_LINE} it calls that function. On any other line it is the same sweep, the
 * same membership rule and the same shortcut, with the people read off the line at each bucket.
 */
export function rushHoldAtLegsOn(
  line: RushRoundLine,
  legs: readonly RushHoldLeg[],
  startedAt: number,
  endedAt: number,
): number | undefined {
  /*
   * The classic line is read by the classic reader itself, not by a copy of it: a sitting with no
   * card, every house row and every stored hold is that function's answer, and this keeps it so by
   * construction. The sweep below is the same sweep with the line read at each bucket.
   */
  if (line.slack.length === 0 && line.people === RUSH_HOLD_LINE.people && line.overS === RUSH_HOLD_LINE.overS) {
    return rushHoldAtLegs(legs, startedAt, endedAt);
  }
  const reach = line.overS - 1;
  const candidates = legs
    .filter((leg) => Math.min(leg.boardedAt ?? Infinity, leg.refusedAt ?? Infinity) - leg.arrivedAt >= reach)
    .sort((a, b) => a.arrivedAt - b.arrivedAt);
  if (candidates.length < line.people) return undefined;
  for (let t = startedAt; t <= endedAt; t += RUSH_STREAM.bucketS) {
    let count = 0;
    for (const leg of candidates) {
      if (leg.arrivedAt > t) break;
      if (leg.refusedAt !== undefined && leg.refusedAt <= t) continue;
      if (leg.boardedAt !== undefined && leg.boardedAt <= t) continue;
      if (t - leg.arrivedAt >= line.overS) count += 1;
    }
    if (count >= rushLinePeopleAt(line, t - startedAt)) return t;
  }
  return undefined;
}

/** `{car}` and `{other}` filled in an incident's sentence. */
export function rushIncidentTextOf(template: string, incident: RushIncident, nameOf: (car: RushIncidentCar) => string): string {
  const [first, second] = incident.cars;
  const car = first === undefined ? '' : nameOf(first);
  const other = second === undefined ? car : nameOf(second);
  return template.replaceAll('{car}', car).replaceAll('{other}', other);
}
