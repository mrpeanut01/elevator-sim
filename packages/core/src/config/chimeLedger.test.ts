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
  });

  it('pays a scenario flatly, because no band survives — see the block at the foot of this file', () => {
    /*
     * This case used to assert the opposite: that a `single` band paid more than a `wide` one. The
     * band is withdrawn (the review of PR #485, medium 7) and the assertion is **inverted rather
     * than deleted**, because the thing worth holding is that the award does not vary — a deleted
     * case would let a second argument grow back on `chimeAwardFor` unnoticed.
     */
    const table = shipped();
    expect(chimeAwardFor(table, 'scenario-cleared')).toBe(
      table.sources.find((source) => source.completion === 'scenario-cleared')?.awardChimes,
    );
    expect(chimeAwardFor.length, 'chimeAwardFor grew an argument again').toBe(2);
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

  it('buys a purse in steps, and refuses more steps than it sells', () => {
    const sink = chimeSinkById(shipped(), 'career-purse-top-up');
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
    ).toThrow(/describes a field measured in "chimes" and declares "usd"/u);
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

/* -------------------------------------------------------------------------- *
 * One price, and the scenario owns it — the review of PR #485, blocking 3
 * -------------------------------------------------------------------------- */

/**
 * **A scenario's budget ladder is priced in `data/campaign.json` and may not be priced here.**
 *
 * The defect these controls exist for shipped and was caught by a reader rather than by a run: the
 * table sold a `scenario-budget-step` at 12 chimes for 8 units while `data/campaign.json` already
 * authored the same act, per scenario, at one chime per unit — and `data/scenario-survivors.json`
 * pre-simulates against **campaign.json's** rungs. Two authorities for one price is the thing
 * `chimeLedger.ts`'s own docstring spends ten lines refusing.
 *
 * Both directions, because a rule keyed on an absence passes vacuously the day the absence becomes
 * a hole: the parser refuses the kind, **and** the ladder it defers to is asserted to be real.
 */
describe('the scenario authors its own budget price, and this table may not', () => {
  it('ships no sink that prices a budget in units', () => {
    expect(shipped().sinks.map((sink) => sink.modifier.kind)).not.toContain('budget-units');
  });

  it('refuses one by name, naming the document that owns the price', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          const sink = sinksOf(doc)[0]!;
          (sink['modifier'] as Record<string, unknown>)['kind'] = 'budget-units';
        }),
      ),
    ).toThrow(/data\/campaign\.json/u);
  });

  it('positive control: the ladder it defers to is really authored, and really in chimes', () => {
    /*
     * Read off `data/campaign.json` rather than transcribed, and asserted in the two ways that
     * would catch the ladder quietly losing its prices: every step carries a whole number of
     * chimes above zero, and there is more than one step to buy.
     */
    const campaign = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../../data/campaign.json', import.meta.url)), 'utf8'),
    ) as { stages: readonly { budget?: { steps?: readonly { chimes?: unknown }[] } }[] };
    const steps = campaign.stages.flatMap((stage) => stage.budget?.steps ?? []);
    expect(steps.length).toBeGreaterThan(1);
    for (const step of steps) {
      expect(typeof step.chimes === 'number' && Number.isInteger(step.chimes) && step.chimes > 0).toBe(
        true,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The band, withdrawn — the review of PR #485, medium 7
 * -------------------------------------------------------------------------- */

/**
 * **No source is banded, because nothing the earn route reads can say what band a scenario is in.**
 *
 * `ledger.ts` called the band *"a property of the scenario … known before anybody plays"*. It was
 * not: the server took it verbatim from the request body, `data/scenario-survivors.json` carries
 * counts and no band, and nothing the earn route reads maps a count to one — the difficulty band
 * GitHub issue #234 drafted, `data/scenario-survivor-bands.json`, is read only by an acceptance
 * check. A claim that a mechanism exists when it does not is [§ D256](../../../../DECISIONS.md)'s
 * own refusal, so the band is withdrawn rather than re-described — and the parser refuses the key,
 * so it cannot come back without the mapping arriving with it.
 */
describe('no award is banded until the earn route can say which band a scenario is in', () => {
  it('ships no banded source', () => {
    for (const source of shipped().sources) {
      expect(Object.hasOwn(source, 'bands'), source.id).toBe(false);
    }
  });

  it('refuses a band by name, saying what would have to exist first', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sourcesOf(doc)[0]!['bands'] = [{ id: 'wide', awardChimes: 4, note: 'x' }];
        }),
      ),
    ).toThrow(/Nothing the earn route reads maps a survivor count to a band/u);
  });

  it('positive control: the survivor table really does carry counts and really carries no band', () => {
    const raw = readFileSync(
      fileURLToPath(new URL('../../../../data/scenario-survivors.json', import.meta.url)),
      'utf8',
    );
    expect(raw).toContain('"survivors"');
    expect(raw).not.toContain('"band"');
  });
});

/* -------------------------------------------------------------------------- *
 * Invariant 8 on every tunable, not only on the awards
 * -------------------------------------------------------------------------- */

/**
 * `CLAUDE.md` invariant 8: *every tunable declares its schema — type, range, default*.
 *
 * The awards and the prices declared one. `grantUnits`, `maxSteps` and `awayHours` are tunables by
 * the same test — a generic optimiser could search any of them — and declared none, which is the
 * gap the review of PR #485 named. Each now carries its own, and the shipped value is the default
 * rather than a second opinion (`pricing/parse.ts`'s rule).
 */
describe('every tunable declares its schema — invariant 8', () => {
  it('declares one for what a step grants and for how many steps a run may buy', () => {
    for (const sink of shipped().sinks) {
      expect(sink.grantSchema.default, `${sink.id}.grantUnits`).toBe(sink.modifier.grantUnits);
      expect(sink.stepSchema.default, `${sink.id}.maxSteps`).toBe(sink.maxSteps);
      expect(sink.grantSchema.unit).toBe('units');
      expect(sink.stepSchema.unit).toBe('steps');
    }
  });

  it('declares one for how long a gift waits', () => {
    const gift = chimeGiftSource(shipped());
    expect(gift?.awaySchema?.default).toBe(gift?.awayHours);
    expect(gift?.awaySchema?.unit).toBe('hours');
  });

  it('refuses a shipped value outside its own declared range', () => {
    expect(() =>
      parseChimeLedger(
        brokenDocument((doc) => {
          sinksOf(doc)[0]!['maxSteps'] = 99;
        }),
      ),
    ).toThrow(/outside its own declared range/u);
  });
});
