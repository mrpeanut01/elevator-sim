/**
 * The ledger's own claims — the ones a route cannot show, against a real PostgreSQL.
 *
 * Four of them are the issue's acceptance criteria and each is written against the defect it would
 * catch: **a balance that could go negative** (free modifiers), **a gift that compounds**
 * (§ D531's *it does not compound* asserted rather than reviewed), **a claimed modifier nobody
 * bought** (the posted-run check), and **an award that could be named by a caller** (the shape of a
 * purchase, refused by a signature that has nowhere to put one).
 *
 * `PgliteSql` is PostgreSQL compiled to WebAssembly, so the statement under test is the statement
 * the server sends — which matters more than usual here, because the overdraft refusal *is* a
 * `WHERE` clause and the serialisation *is* a unique key.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { parseChimeLedger, parseTrafficProfiles, type ChimeLedgerTable, type ChimeTurn } from '@elevator-sim/core';

import { PgliteSql } from '../store/pglite.test-helper.js';
import { Store } from '../store/store.js';
import {
  awardSignInGift,
  claimedModifierIssues,
  earnCompletion,
  loadChimeTurnBounds,
  rushWaveCountOf,
  spendOnModifier,
  unbackedModifiers,
  type ChimeTurnBounds,
} from './ledger.js';

/* `store.test.ts`'s reason, verbatim in effect: every case here boots a whole PostgreSQL. */
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const LEDGER_PATH = fileURLToPath(new URL('../../../../data/chime-ledger.json', import.meta.url));
const TABLE: ChimeLedgerTable = parseChimeLedger(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as unknown);
const DATA_DIR = fileURLToPath(new URL('../../../../data/', import.meta.url));

/** A scenario these cases may clear. Names rather than shipped ids: what is under test is the table and the store. */
function scenario(index: number): string {
  return `scenario-${String(index)}`;
}

/**
 * The turns these cases may be paid for — GitHub issue #499.
 *
 * Built by hand rather than loaded, because most cases here are about the table and the store;
 * {@link loadChimeTurnBounds} has cases of its own at the foot of this file, against the shipped
 * documents.
 */
const BOUNDS: ChimeTurnBounds = Object.freeze({
  scenarioIds: new Set(Array.from({ length: 40 }, (_, index) => scenario(index))),
  rushWaves: 30,
});

function earn(store: Store, userId: string, turn: ChimeTurn): ReturnType<typeof earnCompletion> {
  return earnCompletion({ store, table: TABLE, bounds: BOUNDS, userId, turn });
}

const CLOCK_START = 1_760_000_000_000;

async function fixture(): Promise<{
  readonly store: Store;
  readonly userId: string;
  readonly tick: (ms: number) => void;
}> {
  const sql = new PgliteSql();
  let clock = CLOCK_START;
  const store = await Store.open({ sql, now: () => clock });
  onTestFinished(async () => {
    await store.close();
  });
  const created = await store.createUser({
    email: 'ada@example.test',
    displayName: 'Ada',
    displayNameChosen: true,
  });
  if (!created.ok) throw new Error(`fixture: ${created.reason}`);
  return {
    store,
    userId: created.user.id,
    tick: (ms: number): void => {
      clock += ms;
    },
  };
}

/**
 * The sink these cases spend on.
 *
 * It was `scenario-budget-step` until the review of PR #485 found that sink pricing an act
 * `data/campaign.json` already prices; it is removed and the parser refuses the kind. The career
 * purse is the dearest sink that still grants units, so the arithmetic below reads the same way.
 */
const purseSink = TABLE.sinks.find((sink) => sink.id === 'career-purse-top-up')!;

describe('the chime ledger — issue #368', () => {
  it('starts at nothing, because a balance is what has been earned', async () => {
    const { store, userId } = await fixture();
    expect(await store.chimeBalance(userId)).toBe(0);
  });

  it('banks a completed turn at the amount the table says, never one a caller names', async () => {
    const { store, userId } = await fixture();
    const first = await earn(store, userId, { completion: 'career-day-paid' });
    expect(first).toEqual({ ok: true, balanceChimes: 3 });
    const second = await earn(store, userId, { completion: 'career-day-paid' });
    expect(second).toEqual({ ok: true, balanceChimes: 6 });
  });

  it('pays every scenario the same, because no band survives and none could be trusted', async () => {
    /*
     * **The inverse of the case that used to be here**, and the inversion is the record. It asserted
     * that a `single` band paid more than a `wide` one — true of the table, and the band it was paid
     * against came out of the request body of the account being paid (the review of PR #485,
     * medium 7). The award is flat now, and this asserts the flatness rather than deleting the case:
     * a deleted one would let a band grow back with nothing watching.
     */
    const { store, userId } = await fixture();
    const first = await earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(1) });
    const second = await earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(2) });
    expect(first.ok && second.ok).toBe(true);
    const firstAward = first.ok ? first.balanceChimes : 0;
    expect((second.ok ? second.balanceChimes : 0) - firstAward).toBe(firstAward);
  });

  it('refuses a spend the balance cannot cover, and writes nothing', async () => {
    /*
     * **The overdraft control.** Without the `WHERE` clause in `recordChimeEntry`'s statement this
     * writes a row and leaves the account below zero, which is a modifier bought for nothing.
     */
    const { store, userId } = await fixture();
    const refused = await spendOnModifier({
      store,
      table: TABLE,
      userId,
      sinkId: purseSink.id,
      steps: 1,
    });
    expect(refused).toEqual({ ok: false, reason: 'not-enough-chimes' });
    expect(await store.chimeBalance(userId)).toBe(0);
    expect(await store.chimeSpends(userId)).toEqual([]);
  });

  it('spends what the table charges and grants what the table grants', async () => {
    const { store, userId } = await fixture();
    for (let i = 0; i < 4; i += 1) {
      await earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(i) });
    }
    const before = await store.chimeBalance(userId);
    const spent = await spendOnModifier({ store, table: TABLE, userId, sinkId: purseSink.id, steps: 2 });
    expect(spent.ok).toBe(true);
    expect(spent.ok ? spent.balanceChimes : -1).toBe(before - purseSink.priceChimes * 2);
    expect(spent.grantUnits).toBe(purseSink.modifier.grantUnits * 2);
    expect(await store.chimeSpends(userId)).toEqual([{ sinkId: purseSink.id, steps: 2 }]);
  });

  it('refuses more steps than the sink sells, rather than clamping and charging for them', async () => {
    const { store, userId } = await fixture();
    for (let i = 0; i < 20; i += 1) {
      await earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(i) });
    }
    const before = await store.chimeBalance(userId);
    const refused = await spendOnModifier({
      store,
      table: TABLE,
      userId,
      sinkId: purseSink.id,
      steps: purseSink.maxSteps + 1,
    });
    expect(refused).toEqual({ ok: false, reason: 'unknown-modifier' });
    expect(await store.chimeBalance(userId)).toBe(before);
  });

  it('refuses a modifier this build does not sell', async () => {
    const { store, userId } = await fixture();
    expect(
      await spendOnModifier({ store, table: TABLE, userId, sinkId: 'unlock-the-tower', steps: 1 }),
    ).toEqual({ ok: false, reason: 'unknown-modifier' });
  });

  it('never lets two spends of one balance both land', async () => {
    /*
     * The race, fired for real. Both requests read the same balance; the ledger's `UNIQUE (user_id,
     * seq)` makes one of them retry against the winner's row, where the `WHERE` clause refuses it.
     * Without either half this ends with a negative balance and two modifiers bought once.
     */
    const { store, userId } = await fixture();
    for (let i = 0; i < 2; i += 1) {
      await earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(i) });
    }
    const affordable = Math.floor((await store.chimeBalance(userId)) / purseSink.priceChimes);
    expect(affordable).toBe(1);
    const both = await Promise.all([
      spendOnModifier({ store, table: TABLE, userId, sinkId: purseSink.id, steps: 1 }),
      spendOnModifier({ store, table: TABLE, userId, sinkId: purseSink.id, steps: 1 }),
    ]);
    expect(both.filter((one) => one.ok)).toHaveLength(1);
    expect(await store.chimeBalance(userId)).toBeGreaterThanOrEqual(0);
    expect(await store.chimeSpends(userId)).toHaveLength(1);
  });
});

describe('the sign-in gift — § D531', () => {
  const gift = TABLE.sources.find((source) => source.earnedBy === 'gift')!;

  it('is given once, and does not compound inside its own window', async () => {
    /* § D531's own words: *a test that awards it twice in one window fails*. This is that test. */
    const { store, userId } = await fixture();
    await awardSignInGift({ store, table: TABLE, userId });
    const afterFirst = await store.chimeBalance(userId);
    expect(afterFirst).toBe(gift.awardChimes);
    await awardSignInGift({ store, table: TABLE, userId });
    await awardSignInGift({ store, table: TABLE, userId });
    expect(await store.chimeBalance(userId)).toBe(afterFirst);
  });

  it('is given again once the window has passed, and by the same flat amount', async () => {
    const { store, userId, tick } = await fixture();
    await awardSignInGift({ store, table: TABLE, userId });
    tick((gift.awayHours ?? 0) * 60 * 60 * 1000 + 1);
    await awardSignInGift({ store, table: TABLE, userId });
    /* Flat, not compounding: two windows pay exactly twice one award and never more. */
    expect(await store.chimeBalance(userId)).toBe(gift.awardChimes * 2);
  });

  it('costs nothing to miss — no elapsed time takes a chime away', async () => {
    /*
     * § D526 clause 4 as an assertion rather than as prose. A year passes with nothing called, and
     * the balance is what it was. There is no sweep, no expiry and no decay to disable: the test
     * exists so that adding one goes red.
     */
    const { store, userId, tick } = await fixture();
    await earn(store, userId, { completion: 'rush-wave-survived', waves: 1 });
    const banked = await store.chimeBalance(userId);
    tick(365 * 24 * 60 * 60 * 1000);
    expect(await store.chimeBalance(userId)).toBe(banked);
  });
});

describe('a posted modified run is checked against a real spend', () => {
  it('finds nothing unbacked when the claim is what was bought', () => {
    expect(
      unbackedModifiers([{ sinkId: purseSink.id, steps: 2 }], [{ sinkId: purseSink.id, steps: 2 }], TABLE),
    ).toEqual([]);
  });

  it('accepts a claim spread over several spends of one sink', () => {
    expect(
      unbackedModifiers(
        [{ sinkId: purseSink.id, steps: 2 }],
        [
          { sinkId: purseSink.id, steps: 1 },
          { sinkId: purseSink.id, steps: 1 },
        ],
        TABLE,
      ),
    ).toEqual([]);
  });

  it('names a sink claimed further than it was bought', () => {
    expect(
      unbackedModifiers([{ sinkId: purseSink.id, steps: 3 }], [{ sinkId: purseSink.id, steps: 2 }], TABLE),
    ).toEqual([purseSink.id]);
  });

  it('names a sink claimed and never bought at all', () => {
    expect(unbackedModifiers([{ sinkId: 'rush-prefit', steps: 1 }], [], TABLE)).toEqual(['rush-prefit']);
  });

  it('does not mind a spend the run did not claim, because a spend is permanent', () => {
    expect(unbackedModifiers([], [{ sinkId: 'rush-prefit', steps: 1 }], TABLE)).toEqual([]);
  });

  it('refuses a claim that is not a list of modifiers before it reads any ledger', () => {
    expect(claimedModifierIssues(undefined)).toEqual([]);
    expect(claimedModifierIssues('scenario-budget-step')).toHaveLength(1);
    expect(claimedModifierIssues([{ sinkId: '', steps: 1 }])).toHaveLength(1);
    expect(claimedModifierIssues([{ sinkId: 'a', steps: 0 }])).toHaveLength(1);
    expect(claimedModifierIssues([{ sinkId: 'a', steps: 1.5 }])).toHaveLength(1);
    expect(claimedModifierIssues(Array.from({ length: 17 }, () => ({ sinkId: 'a', steps: 1 })))).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- *
 * The per-run cap, enforced against the claim — the review of PR #485, medium 5
 * -------------------------------------------------------------------------- */

/**
 * **`ChimeSink.maxSteps` says *how many times one run may buy this*, and the claim check now says
 * it too.**
 *
 * It capped each *spend* and never the *total*, so a player who bought a sink twice at its cap
 * could post a run claiming twice the cap and be believed — and `rush-prefit`, whose whole note is
 * *"one step only — a building is fitted or it is not"*, accepted two. A spend is permanent and
 * accumulates across runs, which is correct; what may not accumulate is what **one run** claims.
 * So the cap belongs on the claim, and the table has to be in hand to know it.
 */
describe('a claim is capped at what one run may buy, however many spends paid for it', () => {
  it('refuses a claim above the cap even when twice the cap was bought', () => {
    const sink = TABLE.sinks.find((candidate) => candidate.maxSteps > 1)!;
    const cap = sink.maxSteps;
    expect(
      unbackedModifiers(
        [{ sinkId: sink.id, steps: cap * 2 }],
        [
          { sinkId: sink.id, steps: cap },
          { sinkId: sink.id, steps: cap },
        ],
        TABLE,
      ),
      'a run claimed twice the per-run cap and the ledger backed it',
    ).toEqual([sink.id]);
  });

  it('refuses two steps of a sink that sells one, which is its own refusal in force', () => {
    const prefit = TABLE.sinks.find((candidate) => candidate.maxSteps === 1)!;
    expect(
      unbackedModifiers(
        [{ sinkId: prefit.id, steps: 2 }],
        [
          { sinkId: prefit.id, steps: 1 },
          { sinkId: prefit.id, steps: 1 },
        ],
        TABLE,
      ),
    ).toEqual([prefit.id]);
  });

  it('still accepts a claim at the cap that was paid for in pieces', () => {
    const sink = TABLE.sinks.find((candidate) => candidate.maxSteps > 1)!;
    expect(
      unbackedModifiers(
        [{ sinkId: sink.id, steps: sink.maxSteps }],
        Array.from({ length: sink.maxSteps }, () => ({ sinkId: sink.id, steps: 1 })),
        TABLE,
      ),
    ).toEqual([]);
  });

  it('refuses a sink this build does not sell rather than believing an unknown cap', () => {
    expect(unbackedModifiers([{ sinkId: 'unlock-everything', steps: 1 }], [], TABLE)).toEqual([
      'unlock-everything',
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * First time only — GitHub issue #499, the owner's ruling of 2026-09-10
 * -------------------------------------------------------------------------- */

const sourceFor = (completion: ChimeTurn['completion']) =>
  TABLE.sources.find((source) => source.earnedBy === 'completion' && source.completion === completion)!;

describe('a turn is written once, and the statement is what refuses the second — issue #499', () => {
  it('refuses a second entry for one source and one turn, and nothing that differs in either', async () => {
    /*
     * **The positive control is the second write.** Before #499 `recordChimeEntry` had no turn to
     * refuse on, so it wrote the row and paid the scenario twice.
     */
    const { store, userId } = await fixture();
    const clear = { userId, direction: 'earn', entryKey: 'earn-scenario-clear', chimes: 6 } as const;
    const first = await store.recordChimeEntry({ ...clear, turnKey: 'c1' });
    expect(first?.turnKey).toBe('c1');
    expect(await store.recordChimeEntry({ ...clear, turnKey: 'c1' }), 'one turn was written twice').toBeUndefined();
    /* The same turn under another source is another turn, and another turn under this source is too. */
    expect(
      await store.recordChimeEntry({ userId, direction: 'earn', entryKey: 'earn-rush-wave', chimes: 2, turnKey: 'c1' }),
    ).toBeDefined();
    expect(await store.recordChimeEntry({ ...clear, turnKey: 'c2' })).toBeDefined();
    /* An entry with no turn is untouched by any of it — a contract day, twice. */
    const day = { userId, direction: 'earn', entryKey: 'earn-career-day', chimes: 3 } as const;
    expect(await store.recordChimeEntry(day)).toBeDefined();
    expect(await store.recordChimeEntry(day)).toBeDefined();
    expect(await store.chimeBalance(userId)).toBe(6 + 2 + 6 + 3 + 3);
    expect([...(await store.chimeTurnKeys(userId, 'earn-scenario-clear'))].sort()).toEqual(['c1', 'c2']);
  });

  it('never lets two writes of one turn both land', async () => {
    const { store, userId } = await fixture();
    const write = (): ReturnType<Store['recordChimeEntry']> =>
      store.recordChimeEntry({ userId, direction: 'earn', entryKey: 'earn-scenario-clear', chimes: 6, turnKey: 'c3' });
    const both = await Promise.all([write(), write()]);
    expect(both.filter((row) => row !== undefined)).toHaveLength(1);
    expect(await store.chimeBalance(userId)).toBe(6);
  });
});

describe('earnCompletion pays a scenario once and a rush its new best — issue #499', () => {
  const scenarioAward = sourceFor('scenario-cleared').awardChimes;
  const waveAward = sourceFor('rush-wave-survived').awardChimes;
  const dayAward = sourceFor('career-day-paid').awardChimes;

  it('pays a first clear, nothing for a second clear of one scenario, and a different scenario again', async () => {
    const { store, userId } = await fixture();
    const clear = (index: number): ReturnType<typeof earn> =>
      earn(store, userId, { completion: 'scenario-cleared', scenarioId: scenario(index) });
    expect(await clear(1)).toEqual({ ok: true, balanceChimes: scenarioAward });
    expect(await clear(1), 'a second clear of one scenario paid').toEqual({ ok: true, balanceChimes: scenarioAward });
    expect(await clear(2)).toEqual({ ok: true, balanceChimes: 2 * scenarioAward });
  });

  it('pays a rush the waves beyond its best at one flat award a wave, and nothing for a run that does not beat it', async () => {
    const { store, userId } = await fixture();
    const rush = (waves: number): ReturnType<typeof earn> => earn(store, userId, { completion: 'rush-wave-survived', waves });
    expect(await rush(3)).toEqual({ ok: true, balanceChimes: 3 * waveAward });
    expect(await rush(1), 'a rush short of the best paid').toEqual({ ok: true, balanceChimes: 3 * waveAward });
    expect(await rush(3), 'a rush equal to the best paid').toEqual({ ok: true, balanceChimes: 3 * waveAward });
    expect(await rush(7), 'a new best paid something other than the difference').toEqual({
      ok: true,
      balanceChimes: 7 * waveAward,
    });
    /*
     * The record is the waves themselves, one entry each and numbered from the first, so the account's
     * best is never a second figure that could come to disagree with what was paid.
     */
    const waves = [...(await store.chimeTurnKeys(userId, sourceFor('rush-wave-survived').id))].map(Number);
    expect(waves.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('refuses a scenario the bounds do not name, and a wave count outside them, writing nothing', async () => {
    const { store, userId } = await fixture();
    expect(await earn(store, userId, { completion: 'scenario-cleared', scenarioId: 'nobody-wrote-this' })).toEqual({
      ok: false,
      reason: 'unknown-scenario',
    });
    for (const waves of [0, -1, 1.5, Number.NaN, BOUNDS.rushWaves + 1]) {
      expect(await earn(store, userId, { completion: 'rush-wave-survived', waves }), String(waves)).toEqual({
        ok: false,
        reason: 'unknown-wave',
      });
    }
    expect(await store.chimeBalance(userId)).toBe(0);
  });

  it('still pays a contract day every time it is posted, which the ruling does not reach', async () => {
    const { store, userId } = await fixture();
    await earn(store, userId, { completion: 'career-day-paid' });
    await earn(store, userId, { completion: 'career-day-paid' });
    expect(await store.chimeBalance(userId)).toBe(2 * dayAward);
  });
});

describe('the turns a shipped build will pay for — loadChimeTurnBounds, issue #499', () => {
  const profiles = parseTrafficProfiles(
    JSON.parse(readFileSync(join(DATA_DIR, 'traffic-profiles.json'), 'utf8')) as unknown,
  );
  const idsIn = (file: string, key: string, field: string): readonly string[] =>
    (
      (JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as Record<string, readonly Record<string, string>[] | undefined>)[
        key
      ] ?? []
    ).map((entry) => entry[field] ?? '');

  it('reads every contract and every fix case, and the rush’s waves, from data/', async () => {
    const bounds = await loadChimeTurnBounds(DATA_DIR, profiles);
    expect([...bounds.scenarioIds].sort()).toEqual(
      [...idsIn('contract-ladder.json', 'contracts', 'contractId'), ...idsIn('fixit-cases.json', 'cases', 'id')].sort(),
    );
    /*
     * Thirty is `packages/viz/src/everyday/rushScreenModel.ts#LAST_GENERATED_WAVE`, which this
     * package may not import. `everyday/rush.test.ts` pins that constant against the same template's
     * holds, so the two readings meet in `data/` rather than in a transcription.
     */
    expect(bounds.rushWaves).toBe(30);
    expect(rushWaveCountOf(profiles)).toBe(bounds.rushWaves);
  });

  it('refuses to start when the rush cannot be read or two documents claim one id', async () => {
    const withoutRush = {
      ...profiles,
      demandTemplates: profiles.demandTemplates.filter((template) => template.id !== 'endless-rush'),
    };
    expect(rushWaveCountOf(withoutRush)).toBeUndefined();
    await expect(loadChimeTurnBounds(DATA_DIR, withoutRush)).rejects.toThrow(/endless-rush/u);

    const scratch = await mkdtemp(join(tmpdir(), 'chime-turns-499-'));
    onTestFinished(async () => rm(scratch, { recursive: true, force: true }));
    await writeFile(join(scratch, 'contract-ladder.json'), JSON.stringify({ contracts: [{ contractId: 'c1' }, { contractId: 'shared' }] }));
    await writeFile(join(scratch, 'fixit-cases.json'), JSON.stringify({ cases: [{ id: 'shared' }] }));
    await expect(loadChimeTurnBounds(scratch, profiles)).rejects.toThrow(/shared/u);
  });
});
