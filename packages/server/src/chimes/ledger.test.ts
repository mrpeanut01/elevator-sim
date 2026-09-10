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
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { parseChimeLedger, type ChimeLedgerTable } from '@elevator-sim/core';

import { PgliteSql } from '../store/pglite.test-helper.js';
import { Store } from '../store/store.js';
import { awardSignInGift, claimedModifierIssues, earnCompletion, spendOnModifier, unbackedModifiers } from './ledger.js';

/* `store.test.ts`'s reason, verbatim in effect: every case here boots a whole PostgreSQL. */
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const LEDGER_PATH = fileURLToPath(new URL('../../../../data/chime-ledger.json', import.meta.url));
const TABLE: ChimeLedgerTable = parseChimeLedger(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as unknown);

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

const scenarioSink = TABLE.sinks.find((sink) => sink.id === 'scenario-budget-step')!;

describe('the chime ledger — issue #368', () => {
  it('starts at nothing, because a balance is what has been earned', async () => {
    const { store, userId } = await fixture();
    expect(await store.chimeBalance(userId)).toBe(0);
  });

  it('banks a completed turn at the amount the table says, never one a caller names', async () => {
    const { store, userId } = await fixture();
    const first = await earnCompletion({ store, table: TABLE, userId, completion: 'career-day-paid' });
    expect(first).toEqual({ ok: true, balanceChimes: 3 });
    const second = await earnCompletion({ store, table: TABLE, userId, completion: 'career-day-paid' });
    expect(second).toEqual({ ok: true, balanceChimes: 6 });
  });

  it('pays a harder scenario more, by its band and not by its run', async () => {
    const { store, userId } = await fixture();
    const wide = await earnCompletion({
      store,
      table: TABLE,
      userId,
      completion: 'scenario-cleared',
      bandId: 'wide',
    });
    const single = await earnCompletion({
      store,
      table: TABLE,
      userId,
      completion: 'scenario-cleared',
      bandId: 'single',
    });
    expect(wide.ok && single.ok).toBe(true);
    /* The second award is the difference between the two balances, and it is the larger one. */
    const wideAward = wide.ok ? wide.balanceChimes : 0;
    const singleAward = (single.ok ? single.balanceChimes : 0) - wideAward;
    expect(singleAward).toBeGreaterThan(wideAward);
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
      sinkId: scenarioSink.id,
      steps: 1,
    });
    expect(refused).toEqual({ ok: false, reason: 'not-enough-chimes' });
    expect(await store.chimeBalance(userId)).toBe(0);
    expect(await store.chimeSpends(userId)).toEqual([]);
  });

  it('spends what the table charges and grants what the table grants', async () => {
    const { store, userId } = await fixture();
    for (let i = 0; i < 4; i += 1) {
      await earnCompletion({ store, table: TABLE, userId, completion: 'scenario-cleared', bandId: 'single' });
    }
    const before = await store.chimeBalance(userId);
    const spent = await spendOnModifier({ store, table: TABLE, userId, sinkId: scenarioSink.id, steps: 2 });
    expect(spent.ok).toBe(true);
    expect(spent.ok ? spent.balanceChimes : -1).toBe(before - scenarioSink.priceChimes * 2);
    expect(spent.grantUnits).toBe(scenarioSink.modifier.grantUnits * 2);
    expect(await store.chimeSpends(userId)).toEqual([{ sinkId: scenarioSink.id, steps: 2 }]);
  });

  it('refuses more steps than the sink sells, rather than clamping and charging for them', async () => {
    const { store, userId } = await fixture();
    for (let i = 0; i < 20; i += 1) {
      await earnCompletion({ store, table: TABLE, userId, completion: 'scenario-cleared', bandId: 'single' });
    }
    const before = await store.chimeBalance(userId);
    const refused = await spendOnModifier({
      store,
      table: TABLE,
      userId,
      sinkId: scenarioSink.id,
      steps: scenarioSink.maxSteps + 1,
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
      await earnCompletion({ store, table: TABLE, userId, completion: 'scenario-cleared', bandId: 'single' });
    }
    const affordable = Math.floor((await store.chimeBalance(userId)) / scenarioSink.priceChimes);
    expect(affordable).toBe(1);
    const both = await Promise.all([
      spendOnModifier({ store, table: TABLE, userId, sinkId: scenarioSink.id, steps: 1 }),
      spendOnModifier({ store, table: TABLE, userId, sinkId: scenarioSink.id, steps: 1 }),
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
    await earnCompletion({ store, table: TABLE, userId, completion: 'rush-wave-survived' });
    const banked = await store.chimeBalance(userId);
    tick(365 * 24 * 60 * 60 * 1000);
    expect(await store.chimeBalance(userId)).toBe(banked);
  });
});

describe('a posted modified run is checked against a real spend', () => {
  it('finds nothing unbacked when the claim is what was bought', () => {
    expect(unbackedModifiers([{ sinkId: 'scenario-budget-step', steps: 2 }], [{ sinkId: 'scenario-budget-step', steps: 2 }])).toEqual([]);
  });

  it('accepts a claim spread over several spends of one sink', () => {
    expect(
      unbackedModifiers(
        [{ sinkId: 'scenario-budget-step', steps: 2 }],
        [
          { sinkId: 'scenario-budget-step', steps: 1 },
          { sinkId: 'scenario-budget-step', steps: 1 },
        ],
      ),
    ).toEqual([]);
  });

  it('names a sink claimed further than it was bought', () => {
    expect(
      unbackedModifiers([{ sinkId: 'scenario-budget-step', steps: 3 }], [{ sinkId: 'scenario-budget-step', steps: 2 }]),
    ).toEqual(['scenario-budget-step']);
  });

  it('names a sink claimed and never bought at all', () => {
    expect(unbackedModifiers([{ sinkId: 'rush-prefit', steps: 1 }], [])).toEqual(['rush-prefit']);
  });

  it('does not mind a spend the run did not claim, because a spend is permanent', () => {
    expect(unbackedModifiers([], [{ sinkId: 'rush-prefit', steps: 1 }])).toEqual([]);
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
