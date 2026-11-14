/**
 * The Rush as cards — `sim/rushCards.ts`, [§ D1636](../../../../DECISIONS.md).
 *
 * What is held here is what both ends of a posted sitting depend on: the classic card is the rush
 * as it was, a card names the same incidents every time it is asked, no incident takes a bank's last
 * car or starts early, and the line reader on the classic line is `rushHoldAtLegs` bucket for bucket.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/index.js';
import { resolveDemandTemplate } from '../traffic/demandTemplate.js';

import { DATA_DIR, load } from './fixtures.test-helper.js';
import { RUSH_HOLD_LINE, RUSH_STREAM, RUSH_TEMPLATE_ID, rushHoldAtLegs, rushTopRatePctPop5min, type RushHoldLeg } from './rush.js';
import {
  RUSH_CLASSIC_CARD,
  RUSH_CLASSIC_LINE,
  RUSH_MAX_ROLL,
  parseRushCards,
  rushBuildingWithIncidents,
  rushCardIsClassic,
  rushCardIssueOf,
  rushCardKeyOf,
  rushHoldAtLegsOn,
  rushIncidentTextOf,
  rushIncidentsOf,
  rushLinePeopleAt,
  rushModelRatePctPop5min,
  rushRoundLineOf,
  rushSeedOf,
  rushServiceEventsOf,
  rushTrafficProfilesOf,
  rushWaveModelOf,
  type RushCards,
} from './rushCards.js';

const RAW = JSON.parse(readFileSync(join(DATA_DIR, 'rush-cards.json'), 'utf8')) as Record<string, unknown>;
const TEMPLATES = JSON.parse(readFileSync(join(DATA_DIR, 'rush-wave-templates.json'), 'utf8')) as Record<string, unknown>;

let config: LoadedConfig;
let cards: RushCards;

beforeAll(async () => {
  config = await load();
  cards = parseRushCards(RAW, TEMPLATES);
});

const buildingOf = (id: string) => {
  const building = config.buildingsById.get(id);
  if (building === undefined) throw new Error(`no building ${id}`);
  return building;
};

describe('the data file', () => {
  it('opens on the classic climb, on the standing line, with no incidents', () => {
    const classic = rushWaveModelOf(cards, RUSH_CLASSIC_CARD);
    expect(classic).toMatchObject({ id: 'climb', templateId: RUSH_TEMPLATE_ID, peakFactor: 1, incidents: false, holdLine: { ...RUSH_HOLD_LINE } });
    expect(rushCardIsClassic(RUSH_CLASSIC_CARD)).toBe(true);
    expect(rushSeedOf(RUSH_CLASSIC_CARD)).toBe(RUSH_STREAM.seed);
    expect(rushModelRatePctPop5min(classic!, 1710)).toBe(rushTopRatePctPop5min(1710));
  });

  it('refuses a file whose first model is not that rush', () => {
    const models = RAW['waveModels'] as Record<string, unknown>[];
    expect(() => parseRushCards({ ...RAW, waveModels: [{ ...models[0], incidents: true }, ...models.slice(1)] }, TEMPLATES)).toThrow(/first model/u);
    expect(() => parseRushCards({ ...RAW, waveModels: [...models.slice(1), models[0]] }, TEMPLATES)).toThrow(/first model/u);
    expect(() => parseRushCards({ ...RAW, version: 2 }, TEMPLATES)).toThrow(/version 1/u);
    expect(() => parseRushCards(RAW, { version: 1, templates: [(TEMPLATES['templates'] as unknown[])[0]] })).toThrow(/does not hold/u);
  });

  it('keeps its templates out of the traffic profiles every other run is built from', () => {
    const shipped = config.trafficProfiles.demandTemplates.map((template) => template.id);
    for (const template of cards.templates) expect(shipped).not.toContain(template.id);
    const extended = rushTrafficProfilesOf(cards, config.trafficProfiles);
    expect(extended.demandTemplates.map((template) => template.id)).toEqual([...shipped, ...cards.templates.map((template) => template.id)]);
    expect(rushTrafficProfilesOf(cards, config.trafficProfiles)).toBe(extended);
    expect(config.trafficProfiles.demandTemplates.map((template) => template.id)).toEqual(shipped);
    // And each one is a phase list the resolver accepts, ninety minutes long.
    for (const template of cards.templates) {
      expect(resolveDemandTemplate(template.id, extended.demandTemplates).durationS, template.id).toBe(RUSH_STREAM.lengthS);
    }
  });

  it('names a template for every model, at the peak its phases reach', () => {
    const all = rushTrafficProfilesOf(cards, config.trafficProfiles).demandTemplates;
    for (const model of cards.waveModels) {
      const template = all.find((entry) => entry.id === model.templateId);
      expect(template, model.id).toBeDefined();
      expect(template?.selectable, model.id).toBe(false);
      const peak = Math.max(...(template?.phases ?? []).map((phase) => Math.max(phase.startIntensity, phase.endIntensity)));
      // Intensity is against the model's own peak, so the busiest knot is 1 to the file's six places.
      expect(peak, model.id).toBeCloseTo(1, 5);
    }
  });

  it('brings a wave the people the climb brings, on every model', () => {
    const peopleOf = (templateId: string, peakFactor: number): number => {
      const template = rushTrafficProfilesOf(cards, config.trafficProfiles).demandTemplates.find((entry) => entry.id === templateId);
      let total = 0;
      for (const phase of template?.phases ?? []) {
        total += ((phase.startIntensity + phase.endIntensity) / 2) * (phase.endMin - phase.startMin) * peakFactor;
      }
      return total;
    };
    const climb = peopleOf(RUSH_TEMPLATE_ID, 1);
    for (const model of cards.waveModels) {
      // Within 1 %: the ramps between stretches are the only difference, and they are 30 s of 180.
      expect(Math.abs(peopleOf(model.templateId, model.peakFactor) / climb - 1), model.id).toBeLessThan(0.01);
    }
  });

  it('keeps every incident shorter than the shortest gap between two, so one is open at a time', () => {
    const longest = Math.max(...cards.incidents.deck.map((kind) => kind.durationS));
    expect(longest + cards.incidents.offsetS.max - cards.incidents.offsetS.min).toBeLessThan(cards.incidents.gapWaves.min * RUSH_STREAM.waveS);
  });

  it('says which cards cannot be played', () => {
    expect(rushCardIssueOf(cards, { model: 'surges', roll: 20_000 })).toBeUndefined();
    expect(rushCardIssueOf(cards, { model: 'nope', roll: 0 })).toMatch(/no wave model/u);
    expect(rushCardIssueOf(cards, { model: 'surges', roll: RUSH_MAX_ROLL + 1 })).toMatch(/roll/u);
    expect(rushCardIssueOf(cards, { model: 'surges', roll: 1.5 })).toMatch(/roll/u);
    expect(rushCardKeyOf({ model: 'surges', roll: 20_405 })).toBe('surges.20405');
  });
});

describe('the incidents of a card', () => {
  it('has none on the classic card, on a model without them, or on a card nobody ships', () => {
    const building = buildingOf('midtown-office');
    expect(rushIncidentsOf(cards, building, RUSH_CLASSIC_CARD)).toEqual([]);
    expect(rushIncidentsOf(cards, building, { model: 'climb', roll: 7 })).toEqual([]);
    expect(rushIncidentsOf(cards, building, { model: 'nope', roll: 7 })).toEqual([]);
    expect(rushBuildingWithIncidents(building, [])).toBe(building);
  });

  it('is the same list every time it is asked, and a different one on another morning', () => {
    const building = buildingOf('midtown-office');
    const first = rushIncidentsOf(cards, building, { model: 'surges', roll: 3 });
    expect(rushIncidentsOf(cards, building, { model: 'surges', roll: 3 })).toEqual(first);
    expect(rushIncidentsOf(cards, building, { model: 'surges', roll: 4 })).not.toEqual(first);
    expect(first.length).toBeGreaterThan(3);
  });

  it('starts none before the first wave the file allows, in time order, one at a time, all over before the stream is', () => {
    for (const id of ['midtown-office', 'garden-apartments', 'harbour-point', 'burj-class-reference']) {
      for (const roll of [1, 2, 3, 20_405]) {
        const incidents = rushIncidentsOf(cards, buildingOf(id), { model: 'tides', roll });
        let lastEnd = 0;
        for (const incident of incidents) {
          expect(incident.atS, `${id}#${String(roll)}`).toBeGreaterThanOrEqual((cards.incidents.firstWave - 1) * RUSH_STREAM.waveS);
          expect(incident.atS).toBeGreaterThanOrEqual((incident.kind.minWave - 1) * RUSH_STREAM.waveS);
          expect(incident.atS).toBeGreaterThanOrEqual(lastEnd);
          expect(incident.untilS).toBe(incident.atS + incident.kind.durationS);
          expect(incident.untilS).toBeLessThanOrEqual(RUSH_STREAM.lengthS);
          lastEnd = incident.untilS;
        }
      }
    }
  });

  it('never takes a bank’s last car, and a two-car incident takes two from a bank with a third', () => {
    for (const building of config.buildings) {
      for (const roll of [1, 2, 3, 4, 5, 6]) {
        for (const incident of rushIncidentsOf(cards, building, { model: 'crossfire', roll })) {
          const bank = building.banks.find((entry) => entry.id === incident.cars[0]?.bankId);
          expect(bank, building.id).toBeDefined();
          expect(incident.cars.length, building.id).toBe(incident.kind.cars);
          expect(bank!.cars.length - incident.cars.length, building.id).toBeGreaterThanOrEqual(1);
          expect(new Set(incident.cars.map((car) => car.bankId)).size).toBe(1);
          expect(new Set(incident.cars.map((car) => car.carId)).size).toBe(incident.cars.length);
          for (const car of incident.cars) {
            const resolved = bank!.cars.find((entry) => entry.id === car.carId);
            expect(resolved?.ratedSpeedMps ?? 0, incident.kind.id).toBeGreaterThanOrEqual(incident.kind.minSpeedMps);
          }
        }
      }
    }
  });

  it('reaches the engine as a car out of service and back, on the building it was drawn for', () => {
    const building = buildingOf('midtown-office');
    const incidents = rushIncidentsOf(cards, building, { model: 'surges', roll: 1 });
    const events = rushServiceEventsOf(incidents);
    expect(events).toHaveLength(2 * incidents.reduce((sum, incident) => sum + incident.cars.length, 0));
    const first = incidents[0]!;
    expect(events[0]).toEqual({ atS: first.atS, bankId: first.cars[0]!.bankId, carId: first.cars[0]!.carId, mode: 'out-of-service' });
    expect(events[1]).toEqual({ atS: first.untilS, bankId: first.cars[0]!.bankId, carId: first.cars[0]!.carId, mode: 'in-service' });
    const fitted = rushBuildingWithIncidents(building, incidents);
    expect(fitted.serviceEvents).toEqual([...(building.serviceEvents ?? []), ...events]);
    expect(fitted.banks).toBe(building.banks);
  });

  it('fills the deck’s sentence with the cars it took', () => {
    const building = buildingOf('harbour-point');
    const two = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((roll) => rushIncidentsOf(cards, building, { model: 'surges', roll })).find((incident) => incident.cars.length === 2);
    expect(two).toBeDefined();
    const said = rushIncidentTextOf(two!.kind.text, two!, (car) => `Lift ${car.carId}`);
    expect(said).toContain(`Lift ${two!.cars[0]!.carId}`);
    expect(said).toContain(`Lift ${two!.cars[1]!.carId}`);
    expect(said).not.toMatch(/\{car\}|\{other\}/u);
  });
});

describe('a round’s line', () => {
  const legs = (count: number, arrivedAt: number, boardedAt?: number): RushHoldLeg[] =>
    Array.from({ length: count }, () => ({ arrivedAt, ...(boardedAt === undefined ? {} : { boardedAt }) }));

  it('reads a line of forty with an empty slack list the way the general sweep reads it', () => {
    // The classic line takes the classic reader; a line one stretch away from it takes the sweep. The
    // stretch here covers no bucket, so the two must agree, which is what holds the sweep to the reader.
    const idle = { people: 40, overS: 120, slack: [{ fromS: 9000, untilS: 9001, people: 5 }] };
    for (const sample of [legs(40, 100), legs(39, 100), [...legs(25, 100), ...legs(15, 300)], legs(60, 100, 400), legs(40, 100, 219)]) {
      expect(rushHoldAtLegsOn(idle, sample, 0, 5400)).toBe(rushHoldAtLegs(sample, 0, 5400));
    }
  });

  it('reads the classic line exactly as the rush always has', () => {
    for (const sample of [legs(40, 100), legs(39, 100), [...legs(25, 100), ...legs(15, 300)], legs(60, 100, 400), legs(40, 100, 219)]) {
      expect(rushHoldAtLegsOn(RUSH_CLASSIC_LINE, sample, 0, 5400)).toBe(rushHoldAtLegs(sample, 0, 5400));
    }
  });

  it('is the model’s own, raised over an incident and its recovery and no longer', () => {
    const building = buildingOf('midtown-office');
    const card = { model: 'surges', roll: 1 };
    const incidents = rushIncidentsOf(cards, building, card);
    const line = rushRoundLineOf(cards, card, incidents);
    const model = rushWaveModelOf(cards, card)!;
    const first = incidents.find((incident) => incident.kind.slackPeople > 0)!;
    expect(line.people).toBe(model.holdLine.people);
    expect(rushLinePeopleAt(line, first.atS - 1)).toBe(model.holdLine.people);
    expect(rushLinePeopleAt(line, first.atS)).toBe(model.holdLine.people + first.kind.slackPeople);
    expect(rushLinePeopleAt(line, first.untilS + cards.incidents.recoveryS - 1)).toBe(model.holdLine.people + first.kind.slackPeople);
    expect(rushLinePeopleAt(line, first.untilS + cards.incidents.recoveryS)).toBe(model.holdLine.people);
    expect(rushRoundLineOf(cards, RUSH_CLASSIC_CARD, [])).toEqual(RUSH_CLASSIC_LINE);
  });

  it('holds a crowd the plain line would end on while an incident is open, and ends on it after', () => {
    const line = { people: 40, overS: 120, slack: [{ fromS: 200, untilS: 500, people: 10 }] };
    // Forty-five people from t = 100, never served: past the plain line at 220, under the raised one until 500.
    expect(rushHoldAtLegsOn({ ...line, slack: [] }, legs(45, 100), 0, 5400)).toBe(220);
    expect(rushHoldAtLegsOn(line, legs(45, 100), 0, 5400)).toBe(500);
    expect(rushHoldAtLegsOn(line, legs(50, 100), 0, 5400)).toBe(220);
  });
});
