/**
 * The rush purse's data and arithmetic — GitHub issue #372.
 *
 * Read against the **shipped** `data/rush-purse.json` and `data/chime-ledger.json`, because a purse
 * rule that holds of a fixture and not of the file the server boots from would be a rule about the
 * fixture. The refusals are driven on edited copies of the shipped document, one field at a time.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { chimeGrantUnits, chimeSinkById, parseChimeLedger } from './chimeLedger.js';
import {
  RushPurseError,
  parseRushPurse,
  rushPurseOpeningUnits,
  rushPurseRounds,
  violationsInRushPurse,
} from './rushPurse.js';

const DATA = fileURLToPath(new URL('../../../../data/', import.meta.url));
const RAW = JSON.parse(readFileSync(`${DATA}rush-purse.json`, 'utf8')) as Record<string, unknown>;
const LEDGER = parseChimeLedger(JSON.parse(readFileSync(`${DATA}chime-ledger.json`, 'utf8')) as unknown);

function edited(patch: Record<string, unknown>): unknown {
  return { ...RAW, ...patch };
}

describe('the shipped purse — invariant 8, and a rule a reviewer can check', () => {
  it('parses, declares its schema, and sits inside it', () => {
    const purse = parseRushPurse(RAW);
    expect(purse.schema).toEqual({ type: 'integer', unit: 'units', min: 1, max: 20, default: 2 });
    expect(purse.unitsPerWaveOutlasted).toBeGreaterThanOrEqual(purse.schema.min);
    expect(purse.unitsPerWaveOutlasted).toBeLessThanOrEqual(purse.schema.max);
    expect(Number.isInteger(purse.unitsPerWaveOutlasted)).toBe(true);
  });

  it('names only top-up sinks the shipped ledger sells as purse units', () => {
    const purse = parseRushPurse(RAW);
    expect(purse.topUpSinkIds.length).toBeGreaterThan(0);
    expect(violationsInRushPurse(purse, LEDGER)).toEqual([]);
    for (const id of purse.topUpSinkIds) expect(chimeSinkById(LEDGER, id)?.modifier.kind).toBe('purse-units');
  });

  it('says on its own face that its figure is a proposal and not a measurement', () => {
    expect(String(RAW['$comment'])).toContain("AN AGENT'S PROPOSAL");
    expect(String(RAW['note'])).toMatch(/^CHOSEN/u);
  });
});

describe('what the parser refuses, by name', () => {
  it('refuses a key nothing validates — a price in money has nowhere to land', () => {
    expect(() => parseRushPurse(edited({ priceChimes: 3 }))).toThrow(/unrecognised key priceChimes/u);
  });

  it('refuses a figure outside its schema, or not whole', () => {
    expect(() => parseRushPurse(edited({ unitsPerWaveOutlasted: 21 }))).toThrow(RushPurseError);
    expect(() => parseRushPurse(edited({ unitsPerWaveOutlasted: 0 }))).toThrow(RushPurseError);
    expect(() => parseRushPurse(edited({ unitsPerWaveOutlasted: 2.5 }))).toThrow(/whole number/u);
  });

  it('refuses a schema denominated in anything but units, or whose default leaves its range', () => {
    expect(() => parseRushPurse(edited({ schema: { type: 'integer', unit: 'chimes', min: 1, max: 20, default: 2 } }))).toThrow(
      /units/u,
    );
    expect(() => parseRushPurse(edited({ schema: { type: 'integer', unit: 'units', min: 1, max: 20, default: 30 } }))).toThrow(
      RushPurseError,
    );
  });

  it('refuses no top-up list, an empty one, and a sink named twice', () => {
    const { topUpSinkIds: _dropped, ...without } = RAW;
    expect(() => parseRushPurse(without)).toThrow(RushPurseError);
    expect(() => parseRushPurse(edited({ topUpSinkIds: [] }))).toThrow(RushPurseError);
    expect(() => parseRushPurse(edited({ topUpSinkIds: ['rush-purse-top-up', 'rush-purse-top-up'] }))).toThrow(/twice/u);
  });

  it('finds a top-up the ledger does not sell, and one that buys something other than units', () => {
    expect(violationsInRushPurse(parseRushPurse(edited({ topUpSinkIds: ['a-purse-nobody-sells'] })), LEDGER)).toHaveLength(1);
    expect(violationsInRushPurse(parseRushPurse(edited({ topUpSinkIds: ['rush-prefit'] })), LEDGER)).toHaveLength(1);
  });
});

describe('the purse across a sitting — paid on waves outlasted and on nothing else', () => {
  const purse = parseRushPurse(RAW);
  const perWave = purse.unitsPerWaveOutlasted;

  it('opens at nothing on the standard board, and at what the listed top-up bought otherwise', () => {
    expect(rushPurseOpeningUnits(purse, LEDGER, [])).toBe(0);
    const sink = chimeSinkById(LEDGER, 'rush-purse-top-up');
    if (sink === undefined) throw new Error('the shipped ledger sells no rush-purse-top-up');
    expect(rushPurseOpeningUnits(purse, LEDGER, [{ sinkId: 'rush-purse-top-up', steps: 2 }])).toBe(chimeGrantUnits(sink, 2));
    // A sink that is not a top-up of *this* purse opens it at nothing, whatever it grants elsewhere.
    expect(rushPurseOpeningUnits(purse, LEDGER, [{ sinkId: 'career-purse-top-up', steps: 3 }])).toBe(0);
  });

  it('pays each round its waves outlasted times the authored figure, into a balance the next round opens with', () => {
    const rounds = rushPurseRounds(purse, 5, [4, 0, 11]);
    expect(rounds).toEqual([
      { purseBeforeUnits: 5, paidUnits: 4 * perWave, purseAfterUnits: 5 + 4 * perWave },
      { purseBeforeUnits: 5 + 4 * perWave, paidUnits: 0, purseAfterUnits: 5 + 4 * perWave },
      { purseBeforeUnits: 5 + 4 * perWave, paidUnits: 11 * perWave, purseAfterUnits: 5 + 15 * perWave },
    ]);
  });

  it('refuses a wave count that is not a whole number of waves, rather than paying a fraction of one', () => {
    expect(() => rushPurseRounds(purse, 0, [2.5])).toThrow(RushPurseError);
    expect(() => rushPurseRounds(purse, 0, [-1])).toThrow(RushPurseError);
  });
});
