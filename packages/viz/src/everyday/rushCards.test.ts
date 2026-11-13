/**
 * The Rush as cards, on the viewer's side — [§ D1636](../../../../DECISIONS.md).
 *
 * `core`'s `sim/rushCards.test.ts` holds the arithmetic. This file holds what the viewer adds: a
 * card reaches a run through the two fields a rush already writes, the incidents ride every run
 * built from that state and no other run, the press holds what the server's replay holds
 * (`packages/server/src/leaderboard/rushCardAgreement.json`), and the words the setup screen, the
 * stage and the result say about a card are the card's.
 */

import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { RUSH_CLASSIC_CARD, RUSH_PREFIT_SINK_ID, RUSH_STREAM, RUSH_TEMPLATE_ID, rushLinePeopleAt, type RushCard } from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { RUSH_CARDS, rushCardOfRun, rushClassicPlay, rushPlayOf } from '../shift/rushPlay.js';

import {
  RUSH_ALL_CLEAR_S,
  RUSH_INCIDENT_COPY,
  RUSH_SEED,
  rushHoldAt,
  rushIncidentNoticeOf,
  rushIncidentRecapOf,
  rushLossLineOf,
  rushOutcomeOf,
  rushPatchOf,
  rushResultViewOf,
  rushStageHeaderOf,
} from './rush.js';
import {
  RUSH_CARD_COPY,
  rushCardLinesOf,
  rushCardViewOf,
  rushDayNumberOf,
  rushModelChoicesOf,
  rushNextMorningOf,
  rushPlayIsHouseCard,
  rushTodayCardOf,
} from './rushCardView.js';
import { loadRushHouseResources } from './rushHouse.test-helper.js';
import { rushSittingBodyOf } from './rushSitting.js';

interface Cell {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly card: RushCard;
  readonly prefit?: boolean;
  readonly heldS: number | null;
}

const TABLE_URL = new URL('../../../server/src/leaderboard/rushCardAgreement.json', import.meta.url);
const table = JSON.parse(readFileSync(TABLE_URL, 'utf8')) as { readonly cells: readonly Cell[] };

let resources: BrowserResources;

beforeAll(async () => {
  resources = await loadRushHouseResources();
});

function pressOf(buildingId: string, dispatcherId: string, card: RushCard, prefit = false) {
  const standing = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
  const patch = rushPatchOf(resources, standing, prefit ? [{ sinkId: RUSH_PREFIT_SINK_ID, steps: 1 }] : [], undefined, card);
  if (patch === undefined) throw new Error(`no building ${buildingId}`);
  const state = { ...standing, ...patch };
  return { state, plan: shiftRunConfigOf(resources, state) };
}

describe('a card reaches the run through the stream and the seed', () => {
  it('writes the classic card exactly as a rush always wrote itself', () => {
    const { state, plan } = pressOf('midtown-office', 'collective', RUSH_CLASSIC_CARD);
    expect(state.freePlay?.demandTemplateId).toBe(RUSH_TEMPLATE_ID);
    expect(state.seed).toBe(RUSH_SEED);
    expect(plan.config.building.serviceEvents ?? []).toEqual([]);
    expect(rushCardOfRun(state.freePlay?.demandTemplateId, state.seed)).toEqual(RUSH_CLASSIC_CARD);
  });

  it('writes another card’s template, peak and seed, and the run carries its incidents', () => {
    const card = { model: 'surges', roll: 7 };
    const classic = pressOf('midtown-office', 'collective', RUSH_CLASSIC_CARD);
    const { state, plan } = pressOf('midtown-office', 'collective', card);
    expect(state.freePlay?.demandTemplateId).toBe('rush-surges');
    expect(state.seed).toBe(RUSH_SEED + 7n);
    expect(state.freePlay?.arrivalRatePctPop5min).toBeCloseTo((classic.state.freePlay?.arrivalRatePctPop5min ?? 0) * 1.4, 9);
    expect(rushCardOfRun(state.freePlay?.demandTemplateId, state.seed)).toEqual(card);
    const play = rushPlayOf(plan.config.building, card);
    expect(play.incidents.length).toBeGreaterThan(0);
    expect(plan.config.building.serviceEvents).toHaveLength(2 * play.incidents.reduce((sum, incident) => sum + incident.cars.length, 0));
    // The same field set as the classic press: a card adds no field for a rush to leak through.
    expect(Object.keys(state).sort()).toEqual(Object.keys(classic.state).sort());
  });

  it('puts incidents on no run that is not a rush', () => {
    // A day at a seed and a template that would name a card, in a mode that is not the rush: its
    // schedule is the day's own, with or without the template.
    const day = withBuilding(initialState(resources, RUSH_SEED + 7n), resources, 'midtown-office');
    const named = { ...day, freePlay: { demandTemplateId: 'rush-surges', arrivalRatePctPop5min: null } };
    expect(named.playMode).not.toBe('endless');
    expect(shiftRunConfigOf(resources, named).config.building.serviceEvents ?? []).toEqual(
      shiftRunConfigOf(resources, day).config.building.serviceEvents ?? [],
    );
    expect(rushCardOfRun('rise-and-fall', RUSH_SEED)).toBeUndefined();
    expect(rushCardOfRun('rush-surges', BigInt(RUSH_STREAM.seed) - 1n)).toBeUndefined();
  });

  it('draws the same incidents on a fitted tower as on the tower as shipped', () => {
    const card = { model: 'tides', roll: 2 };
    const shipped = pressOf('midtown-office', 'collective', card);
    const fitted = pressOf('midtown-office', 'collective', card, true);
    expect(fitted.plan.config.building).not.toBe(shipped.plan.config.building);
    expect(rushPlayOf(fitted.plan.config.building, card).incidents).toEqual(rushPlayOf(shipped.plan.config.building, card).incidents);
  });

  it('carries the card on a sitting’s body, and nothing for the classic one', () => {
    expect(rushSittingBodyOf({ buildingId: 'midtown-office', rounds: [], card: { model: 'tides', roll: 2 } }).card).toEqual({ model: 'tides', roll: 2 });
    expect('card' in rushSittingBodyOf({ buildingId: 'midtown-office', rounds: [], card: RUSH_CLASSIC_CARD })).toBe(false);
    expect('card' in rushSittingBodyOf({ buildingId: 'midtown-office', rounds: [] })).toBe(false);
  });
});

describe('the press holds what the server replays', () => {
  it.each(table.cells.map((cell) => [`${cell.buildingId} · ${cell.dispatcherProfileId} · ${cell.card.model} ${String(cell.card.roll)}${cell.prefit === true ? ' · prefit' : ''}`, cell] as const))(
    '%s',
    (_name, cell) => {
      const { plan } = pressOf(cell.buildingId, cell.dispatcherProfileId, cell.card, cell.prefit === true);
      const play = rushPlayOf(plan.config.building, cell.card);
      const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
      const holdAt = rushHoldAt(recording, play.line);
      expect(holdAt === undefined ? null : holdAt - recording.startedAt).toBe(cell.heldS);
    },
  );
});

describe('the card on the setup screen', () => {
  it('offers the day’s card: the day number as the roll, a model with breakdowns, never the climb', () => {
    const lively = RUSH_CARDS.waveModels.filter((model) => model.incidents).map((model) => model.id);
    for (const day of [20_405, 20_406, 20_407, 20_408]) {
      const card = rushTodayCardOf(day);
      expect(card.roll).toBe(day);
      expect(lively).toContain(card.model);
    }
    expect(new Set([20_405, 20_406, 20_407].map((day) => rushTodayCardOf(day).model)).size).toBe(lively.length);
    expect(rushDayNumberOf(Date.UTC(2026, 10, 13, 23, 59))).toBe(rushDayNumberOf(Date.UTC(2026, 10, 13)));
    expect(rushDayNumberOf(Date.UTC(2026, 10, 14))).toBe(rushDayNumberOf(Date.UTC(2026, 10, 13)) + 1);
    expect(rushNextMorningOf({ model: 'tides', roll: 5 })).toEqual({ model: 'tides', roll: 6 });
  });

  it('lists every wave model with the card’s own marked', () => {
    const choices = rushModelChoicesOf({ model: 'tides', roll: 5 });
    expect(choices.map((choice) => choice.id)).toEqual(RUSH_CARDS.waveModels.map((model) => model.id));
    expect(choices.filter((choice) => choice.selected).map((choice) => choice.id)).toEqual(['tides']);
  });

  it('states the end rule on the card’s own line and says breakdowns happen without saying when', () => {
    const building = resources.buildings.find((entry) => entry.id === 'midtown-office')!;
    const play = rushPlayOf(building, { model: 'surges', roll: 5 });
    const lines = rushCardLinesOf(play);
    expect(lines[0]).toBe(RUSH_CARD_COPY.ends(play.line.people, 2));
    expect(lines[1]).toBe(RUSH_CARD_COPY.breakdowns);
    for (const line of lines) expect(line).not.toMatch(/\d+:\d\d/u);
    expect(rushCardLinesOf(rushClassicPlay())).toEqual([RUSH_CARD_COPY.ends(40, 2), RUSH_CARD_COPY.steady, RUSH_CARD_COPY.classicBoard]);
    expect(rushPlayIsHouseCard(rushClassicPlay())).toBe(true);
    expect(rushPlayIsHouseCard(play)).toBe(false);
    const view = rushCardViewOf(play, { model: 'surges', roll: 5 });
    expect(view.name).toBe('Surges · morning 5');
    expect(view.tag).toBe(RUSH_CARD_COPY.todayTag);
    expect(rushCardViewOf(play, { model: 'tides', roll: 5 }).tag).toBe(RUSH_CARD_COPY.pickedTag);
  });

  it('says so where a tower has no lift to spare', () => {
    const lone = resources.buildings.find((entry) => entry.banks.every((bank) => bank.cars.length < 2));
    if (lone === undefined) return;
    expect(rushCardLinesOf(rushPlayOf(lone, { model: 'surges', roll: 5 }))[1]).toBe(RUSH_CARD_COPY.noSpare);
  });
});

describe('an incident on the stage and on the result', () => {
  it('is announced while its cars are out, cleared for a moment after, and silent otherwise', () => {
    const building = resources.buildings.find((entry) => entry.id === 'midtown-office')!;
    const play = rushPlayOf(building, { model: 'surges', roll: 1 });
    const first = play.incidents[0]!;
    const label = (car: { carId: string }): string => RUSH_INCIDENT_COPY.lift(car.carId);
    expect(rushIncidentNoticeOf(play, first.atS - 1, label)).toBeUndefined();
    const open = rushIncidentNoticeOf(play, first.atS, label);
    expect(open).toMatchObject({ kind: 'open', title: first.kind.title });
    expect(open?.text).toContain(`Lift ${first.cars[0]!.carId}`);
    expect(open?.detail).toContain(RUSH_INCIDENT_COPY.backIn('2:00').slice(0, 7));
    if (first.kind.slackPeople > 0) expect(open?.detail).toContain(String(rushLinePeopleAt(play.line, first.atS)));
    expect(rushIncidentNoticeOf(play, first.untilS, label)).toMatchObject({ kind: 'clear', detail: '' });
    expect(rushIncidentNoticeOf(play, first.untilS + RUSH_ALL_CLEAR_S, label)).toBeUndefined();
    expect(rushIncidentNoticeOf(rushClassicPlay(), first.atS, label)).toBeUndefined();
  });

  it('counts the breakdowns a round met, and says nothing on a card with none', () => {
    const building = resources.buildings.find((entry) => entry.id === 'midtown-office')!;
    const play = rushPlayOf(building, { model: 'surges', roll: 1 });
    expect(rushIncidentRecapOf(rushClassicPlay(), 3000)).toBeUndefined();
    expect(rushIncidentRecapOf(play, 0)).toBe(RUSH_INCIDENT_COPY.recapNone);
    const met = play.incidents.filter((incident) => incident.atS <= 1500);
    expect(rushIncidentRecapOf(play, 1500)).toContain(`${String(met.length)} breakdown`);
    expect(rushIncidentRecapOf(play, 1500)).toContain(met[0]!.kind.title);
  });

  it('reads the header, the loss line and the result against the round’s own line', () => {
    const card = { model: 'surges', roll: 1 };
    const { plan } = pressOf('midtown-office', 'collective', card);
    const play = rushPlayOf(plan.config.building, card);
    const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
    const during = play.incidents.find((incident) => incident.kind.slackPeople > 0)!;
    const raised = play.line.people + during.kind.slackPeople;
    const head = rushStageHeaderOf({ recording, simTimeS: recording.startedAt + during.atS, driverName: 'x', line: play.line });
    expect(head.figures[1]?.label).toBe(`past two minutes, of ${String(raised)}`);
    expect(head.compactFigure.value.endsWith(`/${String(raised)}`)).toBe(true);
    expect(rushStageHeaderOf({ recording, simTimeS: recording.startedAt, driverName: 'x' }).figures[1]?.label).toBe('past two minutes, of 40');
    expect(rushLossLineOf(raised)).toBe(`${String(raised)} / ${String(raised)}, the building stopped draining`);
    const outcome = rushOutcomeOf(recording, undefined, play.line);
    expect(outcome.kind).toBe('broke');
    expect(outcome.overLine).toBeGreaterThanOrEqual(outcome.linePeople);
    const view = rushResultViewOf(outcome, undefined, rushIncidentRecapOf(play, outcome.heldS));
    expect(view.account.join(' ')).toContain(`${String(outcome.linePeople)} people had waited over two minutes at once`);
    expect(view.account.at(-1)).toMatch(/breakdown|No lift broke down/u);
  });
});
