/**
 * The scenario cards, and the one number on them that must not be authored.
 *
 * `docs/12-design-handoff.md` § 4.4: the five scenarios are the five shipped buildings, and where
 * the handoff's hard-coded stat line disagrees with `data/buildings/*.json`, **the file wins**. The
 * central suite here is therefore not "the card says 21 floors" — that would pin a literal in a
 * second place, which is the defect § 4.4 exists to prevent — but "the card's line is `statLineOf`
 * of the building the click will actually run".
 *
 * Loaded against the real `data/` for `fixtures.test-helper.ts`'s reason: a fixture building would
 * prove that a fixture building resolves.
 */

import { loadConfig, type LoadedConfig, type ResolvedBuilding } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { CONTRACTS, statLineOf } from '../shift/contracts.js';
import type { WeekState } from '../shift/types.js';
import { openWeek } from '../shift/week.js';

import { FALLBACK_ART, SCENARIO_ART, scenarioCardsOf } from './scenariosPanel.js';

let config: LoadedConfig;
let buildings: readonly ResolvedBuilding[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  buildings = config.buildings;
});

const weekOn = (contractId: string, patch: Partial<WeekState> = {}): WeekState => ({
  ...openWeek(contractId),
  ...patch,
});

describe('the five contracts name five buildings that are actually loaded', () => {
  it('resolves every contract’s building against data/buildings/', () => {
    for (const contract of CONTRACTS) {
      expect(
        config.buildingsById.get(contract.buildingId),
        `${contract.id} names "${contract.buildingId}"`,
      ).toBeDefined();
    }
  });

  it('draws five cards, in the handoff’s order, every one resolved', () => {
    const cards = scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings);
    expect(cards).toHaveLength(5);
    expect(cards.map((card) => card.contractId)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    for (const card of cards) expect(card.resolved, card.contractId).toBe(true);
  });
});

describe('the stat line is generated from the building JSON — § 4.4', () => {
  it('equals statLineOf the loaded building, for every scenario', () => {
    for (const card of scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings)) {
      const building = config.buildingsById.get(card.buildingId);
      expect(building).toBeDefined();
      expect(card.statLine, card.contractId).toBe(statLineOf(building as ResolvedBuilding));
    }
  });

  it('moves when the building does, which is what "generated" buys', () => {
    // A building the reader edited resolves to a different `ResolvedBuilding`. The card must follow
    // it rather than keep describing the file — an authored line could not.
    const original = config.buildingsById.get('garden-apartments');
    expect(original).toBeDefined();
    const shrunk: ResolvedBuilding = {
      ...(original as ResolvedBuilding),
      floors: (original as ResolvedBuilding).floors.slice(0, 3),
      totalPopulation: 48,
    };
    const [card] = scenarioCardsOf([CONTRACTS[0] as never], weekOn('c1'), [shrunk]);
    expect(card?.statLine).toBe(statLineOf(shrunk));
    expect(card?.statLine).toContain('3 floors');
    expect(card?.statLine).toContain('48 people');
    expect(card?.statLine).not.toBe(statLineOf(original as ResolvedBuilding));
  });

  it('names the building from the file, which is a different fact from the scenario’s title', () => {
    const cards = scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings);
    for (const card of cards) {
      expect(card.name, card.contractId).toBe(config.buildingsById.get(card.buildingId)?.name);
    }
    // Four of the five differ; `c5` is the one the design named after its building, which is a
    // coincidence of that scenario rather than the rule.
    expect(cards[0]?.name).toBe('Garden Apartments');
    expect(cards[0]?.title).toBe('Learn the ropes');
    expect(cards.filter((card) => card.name === card.title)).toHaveLength(1);
  });

  it('says so, rather than inventing a spec, when the building is not loaded', () => {
    const [card] = scenarioCardsOf(CONTRACTS, weekOn('c1'), []);
    expect(card?.resolved).toBe(false);
    expect(card?.statLine).toContain('no building');
    expect(card?.statLine).toContain('nothing to describe');
    // No fabricated counts: nothing that reads like a spec line.
    expect(card?.statLine).not.toMatch(/\bfloors\b/);
    expect(card?.statLine).not.toMatch(/\d/);
  });
});

describe('status — three answers, and none of them is locked', () => {
  it('marks the current contract, the cleared ones and the rest', () => {
    const week = weekOn('c3', { completed: ['c1'] });
    const cards = scenarioCardsOf(CONTRACTS, week, buildings);
    const byId = new Map(cards.map((card) => [card.contractId, card]));
    expect(byId.get('c1')?.status).toBe('cleared');
    expect(byId.get('c3')?.status).toBe('current');
    expect(byId.get('c5')?.status).toBe('open');
    expect(byId.get('c3')?.current).toBe(true);
    expect(byId.get('c5')?.current).toBe(false);
  });

  it('gives every status a distinct glyph and a distinct colour, and a word for both — KB-15', () => {
    const week = weekOn('c3', { completed: ['c1'] });
    const cards = scenarioCardsOf(CONTRACTS, week, buildings);
    const glyphs = new Set(cards.map((card) => card.glyph));
    const colours = new Set(cards.map((card) => card.glyphColour));
    expect(glyphs).toEqual(new Set(['✓', '▸', '○']));
    expect(colours.size).toBe(3);
    for (const card of cards) expect(card.help.length).toBeGreaterThan(0);
  });

  it('leaves every card takeable — scenarios teach, they do not gate (§ 1.5 B4)', () => {
    const cards = scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings);
    for (const card of cards) {
      expect(card.status, card.contractId).not.toBe('locked');
      expect(card.resolved, card.contractId).toBe(true);
    }
  });
});

describe('the objective line counts what has been banked', () => {
  it('reads the banked count only on the contract you are on', () => {
    const week = weekOn('c2', { cleanRun: 1 });
    const byId = new Map(
      scenarioCardsOf(CONTRACTS, week, buildings).map((card) => [card.contractId, card]),
    );
    expect(byId.get('c2')?.objective).toBe('Clear 2 shifts — 1 of 2 banked');
    expect(byId.get('c3')?.objective).toBe('Clear 2 shifts');
    expect(byId.get('c1')?.objective).toBe('Clear 1 shift');
  });

  it('reads "Cleared" once it has been', () => {
    const week = weekOn('c2', { completed: ['c1'] });
    const cards = scenarioCardsOf(CONTRACTS, week, buildings);
    expect(cards[0]?.objective).toBe('Cleared');
  });

  it('never counts more banked than the contract asks — SC-05', () => {
    // Driven 2026-07-30 (§ D198): a week that keeps playing a contract can carry a cleanRun past
    // needClean, and the line read "2 of 1 banked". The clamp is on the display, not the data.
    const week = weekOn('c1', { cleanRun: 2 });
    const byId = new Map(
      scenarioCardsOf(CONTRACTS, week, buildings).map((card) => [card.contractId, card]),
    );
    expect(byId.get('c1')?.objective).toBe('Clear 1 shift — 1 of 1 banked');
  });
});

describe('the prose is the handoff’s and the art is the handoff’s', () => {
  it('carries each contract’s brief, reward and teaching point without restating one as the other', () => {
    const cards = scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings);
    for (const [index, card] of cards.entries()) {
      const contract = CONTRACTS[index];
      expect(contract).toBeDefined();
      expect(card.brief).toBe(contract?.brief);
      expect(card.reward).toBe(contract?.reward);
      expect(card.teaches).toBe(`Teaches ${String(contract?.teaches)}`);
      // The design prints its teaching point in both slots. Two slots, two facts.
      expect(card.reward).not.toBe(card.teaches);
    }
  });

  it('has one of the design’s five swatches for every scenario, and a fallback for anything else', () => {
    for (const card of scenarioCardsOf(CONTRACTS, weekOn('c1'), buildings)) {
      expect(card.art, card.buildingId).toBe(SCENARIO_ART[card.buildingId]);
      expect(card.art).not.toBe(FALLBACK_ART);
    }
    expect(Object.keys(SCENARIO_ART).sort((a, b) => a.localeCompare(b))).toEqual(
      CONTRACTS.map((contract) => contract.buildingId).sort((a, b) => a.localeCompare(b)),
    );
  });

  it('falls back rather than blanking for a building the design never drew', () => {
    const mine = { ...CONTRACTS[0], buildingId: 'my-building' } as (typeof CONTRACTS)[number];
    const own: ResolvedBuilding = {
      ...(config.buildingsById.get('garden-apartments') as ResolvedBuilding),
      id: 'my-building',
      name: 'My building',
    };
    const [card] = scenarioCardsOf([mine], weekOn('c1'), [own]);
    expect(card?.art).toBe(FALLBACK_ART);
    expect(card?.statLine).toBe(statLineOf(own));
  });
});
