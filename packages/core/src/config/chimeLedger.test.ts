/// <reference types="node" />

/**
 * `data/chime-ledger.json` reads, and the validator refuses what it claims to refuse.
 *
 * Two halves, `pricing/schedule.test.ts`'s split kept: what the shipped table **is**, and one
 * positive control per rule. The second half is the point — a validator nobody has watched fail is
 * a validator nobody knows works, and the rules this one holds are the ones standing between the
 * tree and a purchase.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CHIME_COMPLETIONS,
  CHIME_EARNED_BY,
  ChimeLedgerError,
  chimeAwardFor,
  chimeGiftSource,
  chimeGrantUnits,
  chimeSinkById,
  chimeSpendPrice,
  parseChimeLedger,
  violationsInChimeLedger,
  type ChimeLedgerTable,
} from './chimeLedger.js';

const LEDGER_PATH = fileURLToPath(new URL('../../../../data/chime-ledger.json', import.meta.url));

const shippedDocument = (): unknown => JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as unknown;
const shipped = (): ChimeLedgerTable => parseChimeLedger(shippedDocument());

describe('data/chime-ledger.json — issue #368', () => {
  it('parses', () => {
    expect(shipped().version).toBe(1);
  });

  it('is denominated in chimes and calls them that', () => {
    /* § D530. The name is data so that no screen spells it, and `units` is money inside a mode. */
    const { currency } = shipped();
    expect(currency.id).toBe('chimes');
    expect(currency.many).toBe('chimes');
    expect(currency.one).toBe('chime');
  });

  it('pays every completion the play surface can post, and pays each of them once', () => {
    const table = shipped();
    for (const completion of CHIME_COMPLETIONS) {
      expect(chimeAwardFor(table, completion), completion).toBeGreaterThan(0);
    }
    const claiming = table.sources.filter((source) => source.earnedBy === 'completion');
    expect(new Set(claiming.map((source) => source.completion)).size).toBe(CHIME_COMPLETIONS.length);
  });

  it('earns by completion or by gift, and by nothing else', () => {
    /*
     * The mechanical half of § D526 clause 6, asked of the shipped document rather than of a
     * reviewer. `CHIME_EARNED_BY` having two members is what the parser enforces; this is the
     * assertion that the document has not quietly grown a third by some other spelling.
     */
    for (const source of shipped().sources) {
      expect(CHIME_EARNED_BY as readonly string[], source.id).toContain(source.earnedBy);
    }
  });

  it('ships one gift, and it has no completion so the play surface cannot ask for it', () => {
    /* § D531, and the structural half of its being a gift rather than a timer. */
    const gift = chimeGiftSource(shipped());
    expect(gift).toBeDefined();
    expect(gift?.completion).toBeUndefined();
    expect(gift?.awayHours ?? 0).toBeGreaterThanOrEqual(1);
    expect(gift?.bands ?? []).toEqual([]);
  });

  it('bands a scenario by its survivor count and never by a run figure', () => {
    const table = shipped();
    const scenario = table.sources.find((source) => source.completion === 'scenario-cleared');
    expect(scenario?.bands.length ?? 0).toBeGreaterThan(1);
    const single = chimeAwardFor(table, 'scenario-cleared', 'single') ?? 0;
    const wide = chimeAwardFor(table, 'scenario-cleared', 'wide') ?? 0;
    expect(single).toBeGreaterThan(wide);
  });

  it('gives every award and every price a note saying where the figure came from', () => {
    const table = shipped();
    for (const source of table.sources) expect(source.note.length, source.id).toBeGreaterThan(40);
    for (const sink of table.sinks) expect(sink.note.length, sink.id).toBeGreaterThan(40);
  });

  it('prices every sink above zero and grants something for it', () => {
    for (const sink of shipped().sinks) {
      expect(sink.priceChimes, sink.id).toBeGreaterThan(0);
      expect(sink.maxSteps, sink.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('buys a budget in steps, and refuses more steps than it sells', () => {
    const sink = chimeSinkById(shipped(), 'scenario-budget-step');
    expect(sink).toBeDefined();
    const one = chimeSpendPrice(sink!, 1) ?? 0;
    expect(chimeSpendPrice(sink!, 2)).toBe(one * 2);
    expect(chimeGrantUnits(sink!, 2)).toBe(sink!.modifier.grantUnits * 2);
    /* Refused rather than clamped: a clamp charges for steps nobody chose. */
    expect(chimeSpendPrice(sink!, sink!.maxSteps + 1)).toBeUndefined();
    expect(chimeSpendPrice(sink!, 0)).toBeUndefined();
    expect(chimeGrantUnits(sink!, sink!.maxSteps + 1)).toBe(0);
  });

  it('finds nothing wrong with the shipped table', () => {
    expect(violationsInChimeLedger(shipped())).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * Positive controls, one per rule
 * -------------------------------------------------------------------------- */

/** The shipped document as a mutable tree, so a control can break exactly one field of it. */
const brokenDocument = (edit: (doc: Record<string, unknown>) => void): unknown => {
  const doc = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Record<string, unknown>;
  edit(doc);
  return doc;
};

const sourcesOf = (doc: Record<string, unknown>): Record<string, unknown>[] =>
  doc['sources'] as Record<string, unknown>[];
const sinksOf = (doc: Record<string, unknown>): Record<string, unknown>[] =>
  doc['sinks'] as Record<string, unknown>[];

describe('the ledger validator refuses what it claims to refuse', () => {
  it('refuses a source earned by anything but a completion or a gift', () => {
    /*
     * **This is the control the whole issue turns on.** § D526 clause 6: no purchase ships
     * anywhere. A lane that wanted one would author it here first, and the parser is where that
     * stops rather than in a reviewer's attention.
     */
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sourcesOf(doc)[0]!['earnedBy'] = 'purchase';
        }),
      ),
    ).toThrow(ChimeLedgerError);
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sourcesOf(doc)[0]!['earnedBy'] = 'purchase';
        }),
      ),
    ).toThrow(/no purchase, price, store, conversion event or supporting telemetry/u);
  });

  it('refuses a key nothing validates, which is where a price in money would land', () => {
    for (const [where, edit] of [
      ['a source', (doc: Record<string, unknown>): void => void (sourcesOf(doc)[0]!['priceCents'] = 199)],
      ['a sink', (doc: Record<string, unknown>): void => void (sinksOf(doc)[0]!['sku'] = 'chimes-100')],
      ['the document', (doc: Record<string, unknown>): void => void (doc['store'] = {})],
    ] as const) {
      expect(() => parseChimeLedger(brokenDocument(edit)), where).toThrow(/unrecognised key/u);
    }
  });

  it('refuses a ledger denominated in anything but chimes', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          (sinksOf(doc)[0]!['schema'] as Record<string, unknown>)['unit'] = 'usd';
        }),
      ),
    ).toThrow(/only "chimes" is a chime/u);
  });

  it('refuses a modifier kind that is not a limit on a configuration', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          (sinksOf(doc)[0]!['modifier'] as Record<string, unknown>)['kind'] = 'unlock-building';
        }),
      ),
    ).toThrow(/is not something a chime buys/u);
  });

  it('refuses a gift that names a completion, because the play surface could then ask for it', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          const gift = sourcesOf(doc).find((source) => source['earnedBy'] === 'gift');
          gift!['completion'] = 'scenario-cleared';
        }),
      ),
    ).toThrow(/a gift the play surface can ask for/u);
  });

  it('refuses two sources claiming one completion', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          const sources = sourcesOf(doc);
          sources[1]!['id'] = 'career-day-paid-again';
          sources[1]!['completion'] = 'scenario-cleared';
        }),
      ),
    ).toThrow(/One completion pays one award/u);
  });

  it('refuses a completion nothing pays', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          doc['sources'] = sourcesOf(doc).filter((source) => source['completion'] !== 'rush-wave-survived');
        }),
      ),
    ).toThrow(/nothing pays "rush-wave-survived"/u);
  });

  it('refuses a free modifier, which is a wider budget with no spend behind it', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sinksOf(doc)[0]!['priceChimes'] = 0;
        }),
      ),
    ).toThrow(/costs 0/u);
  });

  it('refuses an award outside its own declared range — invariant 8', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sourcesOf(doc)[0]!['awardChimes'] = 9_999;
        }),
      ),
    ).toThrow(/outside its own declared range/u);
  });

  it('refuses one name used as both a source and a sink', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sinksOf(doc)[0]!['id'] = sourcesOf(doc)[0]!['id'];
        }),
      ),
    ).toThrow(/both a source and a sink/u);
  });

  it('refuses a table with nothing to spend on, because a balance with no sink is a score', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          doc['sinks'] = [];
        }),
      ),
    ).toThrow(/A balance with no sink is a score/u);
  });
});
