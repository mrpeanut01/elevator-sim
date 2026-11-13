/**
 * A sitting on a Rush card, through this server's gate, replay and board key —
 * [§ D1636](../../../../DECISIONS.md).
 *
 * `rushCardAgreement.json` holds one round per cell with the time the viewer's press holds
 * (`packages/viz/src/everyday/rushCards.test.ts` plays every cell). Here each cell is posted as a
 * sitting claiming that time, and the replay has to agree: the same template, the same seed, the same
 * incidents on the same building, read on the same line. A sitting with no card is not touched by any
 * of it, which `rushHoldAgreement.test.ts` and `rushSitting.test.ts` hold unchanged.
 */

import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  RUSH_PREFIT_SINK_ID,
  loadConfig,
  rushIncidentsOf,
  type ChimeLedgerTable,
  type PriceSchedule,
  type RushCard,
  type RushCards,
  type RushPurseTable,
} from '@elevator-sim/core';

import { loadChimeLedger } from '../chimes/ledger.js';

import { rushDayBoardOf, rushPlacementOf } from './boardKey.js';
import {
  loadRushCards,
  loadRushPriceSchedule,
  loadRushPurse,
  replayRushSitting,
  rushSittingIssues,
  type RushSittingResources,
  type SubmittedRushSitting,
} from './rushSitting.js';
import { rushRoundConfigFor, type VerificationResources } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;

interface Cell {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly card: RushCard;
  readonly prefit?: boolean;
  readonly heldS: number;
}

const table = JSON.parse(readFileSync(new URL('./rushCardAgreement.json', import.meta.url), 'utf8')) as { readonly cells: readonly Cell[] };

let resources: VerificationResources;
let ledger: ChimeLedgerTable;
let purse: RushPurseTable;
let schedule: PriceSchedule;
let cards: RushCards;
const from = (over: Partial<RushSittingResources> = {}): RushSittingResources => ({ resources, purse, ledger, schedule, cards, ...over });

const sittingOf = (cell: Cell, claimedHeldS: number | null = cell.heldS): SubmittedRushSitting => ({
  buildingId: cell.buildingId,
  rounds: [{ dispatcherProfileId: cell.dispatcherProfileId, claimedHeldS }],
  card: cell.card,
  ...(cell.prefit === true ? { modifiers: [{ sinkId: RUSH_PREFIT_SINK_ID, steps: 1 }] } : {}),
});

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
  ledger = await loadChimeLedger(DATA_DIR);
  purse = await loadRushPurse(DATA_DIR, ledger);
  schedule = await loadRushPriceSchedule(DATA_DIR);
  cards = await loadRushCards(DATA_DIR, new Set(config.trafficProfiles.demandTemplates.map((template) => template.id)));
});

describe('the replay of a sitting on a card agrees with the viewer’s press', () => {
  it.each(table.cells.map((cell) => [`${cell.buildingId} · ${cell.dispatcherProfileId} · ${cell.card.model} ${String(cell.card.roll)}${cell.prefit === true ? ' · prefit' : ''}`, cell] as const))(
    '%s',
    (_name, cell) => {
      const sitting = sittingOf(cell);
      expect(rushSittingIssues(sitting, purse, cards)).toEqual([]);
      const verdict = replayRushSitting(sitting, from());
      expect(verdict).toMatchObject({ ok: true, heldS: cell.heldS, simulations: 1 });
    },
  );

  it('runs the round with the card’s incidents on the building, and none without a card', () => {
    const cell = table.cells[0]!;
    const model = cards.waveModels.find((entry) => entry.id === cell.card.model)!;
    const round = { dispatcherProfileId: cell.dispatcherProfileId };
    const plain = rushRoundConfigFor(cell.buildingId, round, resources);
    const carded = rushRoundConfigFor(cell.buildingId, round, resources, undefined, { cards, card: cell.card, model, seed: 90_210 + cell.card.roll });
    if (typeof plain === 'string' || typeof carded === 'string') throw new Error('the fixture does not resolve');
    expect(plain.building.serviceEvents ?? []).toEqual([]);
    expect(plain.demandTemplate).toBe('endless-rush');
    expect(carded.demandTemplate).toBe(model.templateId);
    expect(carded.seed).toBe(BigInt(90_210 + cell.card.roll));
    const incidents = rushIncidentsOf(cards, plain.building, cell.card);
    expect(incidents.length).toBeGreaterThan(0);
    expect(carded.building.serviceEvents).toHaveLength(2 * incidents.reduce((sum, incident) => sum + incident.cars.length, 0));
  });

  it('refuses a held time the card did not produce', () => {
    const cell = table.cells[0]!;
    expect(replayRushSitting(sittingOf(cell, cell.heldS + 40), from())).toMatchObject({ ok: false, code: 'held-does-not-reproduce', round: 1 });
    // The same round claimed without its card is a different round, and the classic replay says so.
    const { card: _card, ...classic } = sittingOf(cell);
    expect(replayRushSitting(classic, from())).toMatchObject({ ok: false, code: 'held-does-not-reproduce' });
  });
});

describe('the gate reads a card strictly', () => {
  const cell = (): Cell => table.cells[0]!;

  it('refuses a card this server cannot play, by name', () => {
    expect(rushSittingIssues({ ...sittingOf(cell()), card: { model: 'nope', roll: 1 } }, purse, cards).join(' ')).toMatch(/no wave model "nope"/u);
    expect(rushSittingIssues({ ...sittingOf(cell()), card: { model: 'surges', roll: -1 } }, purse, cards).join(' ')).toMatch(/card\.roll/u);
    expect(rushSittingIssues({ ...sittingOf(cell()), card: { model: 'surges', roll: 1.5 } }, purse, cards).join(' ')).toMatch(/card\.roll/u);
    expect(rushSittingIssues({ ...sittingOf(cell()), card: 'surges' }, purse, cards).join(' ')).toMatch(/card must be an object/u);
    expect(rushSittingIssues({ ...sittingOf(cell()), card: { model: 'surges', roll: 1, seed: 5 } }, purse, cards).join(' ')).toMatch(/the card carries "seed"/u);
    expect(rushSittingIssues(sittingOf(cell()), purse).join(' ')).toMatch(/holds no rush cards/u);
  });

  it('refuses the replay too where no cards are held, rather than replaying the climb', () => {
    expect(replayRushSitting(sittingOf(cell()), from({ cards: undefined }))).toMatchObject({ ok: false, code: 'unknown-card', simulations: 0 });
  });

  it('refuses to load where the classic climb’s template is not among the traffic profiles', async () => {
    await expect(loadRushCards(DATA_DIR, new Set())).rejects.toThrow(/no demand template for climb/u);
  });
});

describe('a card has a board of its own', () => {
  const NOW = Date.UTC(2026, 10, 13, 12);

  it('keeps the classic card on the key every sitting before cards was posted to', () => {
    expect(rushPlacementOf('midtown-office', NOW, undefined).key).toBe('rush:midtown-office:2026-11-13');
    expect(rushPlacementOf('midtown-office', NOW, undefined, { model: 'climb', roll: 0 }).key).toBe('rush:midtown-office:2026-11-13');
  });

  it('adds the card to the day’s key, ahead of the modifier set', () => {
    const card = { model: 'surges', roll: 20_405 };
    expect(rushDayBoardOf('midtown-office', NOW, card).key).toBe('rush:midtown-office:2026-11-13:surges.20405');
    expect(rushPlacementOf('midtown-office', NOW, [{ sinkId: RUSH_PREFIT_SINK_ID, steps: 1 }], card).key).toBe(
      `rush:midtown-office:2026-11-13:surges.20405/${RUSH_PREFIT_SINK_ID}=1`,
    );
    expect(rushPlacementOf('midtown-office', NOW, undefined, { model: 'surges', roll: 20_406 }).key).not.toBe(
      rushPlacementOf('midtown-office', NOW, undefined, card).key,
    );
  });
});
