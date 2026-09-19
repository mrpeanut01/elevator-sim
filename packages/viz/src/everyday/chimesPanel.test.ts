/**
 * The chime tally's words — and every case here is written against a sentence that shipped and was
 * false, rather than against a branch that might one day be.
 *
 * The panel had no test file at all. It was reviewed by reading, and reading found two claims the
 * suite could not have: a device ledger that does not exist, and a price list for things nothing in
 * the build can buy. Both are `CLAUDE.md`'s standing requirement — *a control that writes nothing
 * must say so, and a control that writes something may not claim it writes nothing* — and the first
 * is the half [§ D227](../../../../DECISIONS.md) calls the more dangerous one.
 *
 * The honesty corpus cannot reach either. It asks whether a rendered string is internally
 * consistent — whether a figure is licensed, whether an estimate carries its `n` — and never
 * whether the mechanism a sentence describes is real. That is the gap these cases fill, and it is
 * why they assert about **the tree** (what `profile.ts` stores, what any module spends) rather than
 * only about the view.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUSH_PREFIT_SINK_ID } from '@elevator-sim/core/browser';

import {
  CHIME_PRICES,
  CHIMES_PANEL_COPY,
  SPEND_ABSENCES,
  chimesPanelViewOf,
  type ChimesPanelView,
} from './chimesPanel.js';

const EVERYDAY_SRC = fileURLToPath(new URL('.', import.meta.url));

describe('the balance line', () => {
  it('says nothing has been banked when nothing has', () => {
    expect(chimesPanelViewOf({ balanceChimes: 0, home: 'account' }).balanceLine).toBe(
      CHIMES_PANEL_COPY.none,
    );
  });

  it('is singular at one and plural above it, in the table’s own words', () => {
    /*
     * The two arms the corpus could not reach until this wave, and they are **different strings**
     * rather than one string with a different number in it: `data/chime-ledger.json` authors `one`
     * and `many`, so a table that lost its singular would ship *You have 1 chimes.* with nothing
     * reading it.
     */
    expect(chimesPanelViewOf({ balanceChimes: 1, home: 'account' }).balanceLine).toBe(
      `You have 1 ${CHIME_PRICES.currency.one}.`,
    );
    expect(chimesPanelViewOf({ balanceChimes: 40, home: 'account' }).balanceLine).toBe(
      `You have 40 ${CHIME_PRICES.currency.many}.`,
    );
  });

  it('refuses a fractional or negative balance rather than drawing one', () => {
    expect(chimesPanelViewOf({ balanceChimes: -5, home: 'account' }).balanceLine).toBe(
      CHIMES_PANEL_COPY.none,
    );
    expect(chimesPanelViewOf({ balanceChimes: 2.9, home: 'account' }).balanceLine).toBe(
      `You have 2 ${CHIME_PRICES.currency.many}.`,
    );
  });
});

describe('what the panel says off an account — the review of PR #485, blocking 2', () => {
  it('does not tell a visitor their tally is kept on this device', async () => {
    /*
     * **The sentence that shipped**: *"You are not signed in, so this tally is kept on this device
     * alone. Anything you spend it on is yours to play."* Nothing in this package stored or spent a
     * chime on the device, so both halves described a store that did not exist — and the second
     * half invited a player to spend against it.
     */
    const note = chimesPanelViewOf({ balanceChimes: 0, home: 'signed-out' }).homeNote;
    expect(note).not.toMatch(/on this device alone/u);
    expect(note).not.toMatch(/spend/u);
    expect(note, 'a visitor is not told that there is no tally yet').toMatch(/no tally yet/u);
  });

  it('positive control: there really is no chime anywhere in the device store', async () => {
    /*
     * The claim the sentence above rests on, checked against the tree rather than remembered.
     * `everyday/profile.ts` is `localStorage`'s owner here; if a chime field ever lands in it, this
     * goes red and the sentence has to be rewritten on the same commit — which is § D227's rule in
     * the direction that bites *after* a lane lands.
     */
    const profile = await readFile(join(EVERYDAY_SRC, 'profile.ts'), 'utf8');
    const code = profile.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/.*$/gmu, '$1');
    expect(code).not.toMatch(/chime/iu);
  });

  it('keeps the booting window apart from both, because guessing is what misleads', () => {
    const booting = chimesPanelViewOf({ balanceChimes: 0, home: 'booting' }).homeNote;
    expect(booting).toBe(CHIMES_PANEL_COPY.bootingHome);
    expect(booting).not.toBe(CHIMES_PANEL_COPY.signedOutHome);
    expect(booting).not.toBe(CHIMES_PANEL_COPY.accountHome);
  });
});

describe('what the panel says about spending — § D227 and § D672, a reason per row', () => {
  const OWNS_NOTHING: readonly { sinkId: string; steps: number }[] = [];
  const offered = (): ChimesPanelView =>
    chimesPanelViewOf({ balanceChimes: 40, home: 'account', spendable: true, owns: OWNS_NOTHING });

  it('offers exactly the one sink that reaches a run, and refuses the rest by name', () => {
    /*
     * **The claim this whole lane turns on.** `rush-prefit` reaches a run — `everyday/rush.ts`
     * fits the building for it and `leaderboard/rushHoldAgreement.json`'s two `prefit` cells are
     * each required to differ from the same cell as built. Neither `purse-units` sink reaches
     * anything: `campaign/economy.ts#purseOf` has no term a grant could enter, and no between-round
     * rebuild travels for the rush (§ D606 § 2). Selling one would be `docs/22` non-goal 5.
     *
     * Asserted against `core`'s own constant rather than a literal, and in **both** directions, so
     * a sink that gained or lost an absence fails here rather than on a player's screen.
     */
    const view = offered();
    /*
     * Read off the **rendered rows** rather than off a helper. A `offeredSinkIds()` export existed
     * and was deleted because nothing but this file called it — `CLAUDE.md`'s standing requirement
     * in its plainest form — and reading the view is the better assertion anyway: what a player
     * can press is what `offer` says, and a second derivation could come to disagree with it.
     */
    expect(view.rows.filter((row) => row.offer !== 'not-offered').map((row) => row.id)).toEqual([
      RUSH_PREFIT_SINK_ID,
    ]);
    for (const id of Object.keys(SPEND_ABSENCES)) {
      expect(CHIME_PRICES.sinks.map((sink) => sink.id), id).toContain(id);
    }
    for (const row of view.rows) {
      expect(row.offer === 'not-offered', row.id).toBe(SPEND_ABSENCES[row.id] !== undefined);
    }
  });

  it('gives every row a sentence, and makes only the offered one pressable', () => {
    /*
     * A control is live exactly when `offer === 'buy'`, and every other arm carries its own
     * reason — `docs/22` non-goal 5 in both polarities: a price with no refusal beside it, and a
     * refusal with nothing behind it, are the same defect.
     */
    const view = offered();
    for (const row of view.rows) expect(row.note.length, row.id).toBeGreaterThan(0);
    expect(view.rows.filter((row) => row.offer === 'buy').map((row) => row.id)).toEqual([
      RUSH_PREFIT_SINK_ID,
    ]);
  });

  it('says what a purchase does before the press, including where the run is posted', () => {
    /*
     * A player is entitled to know that a fitted sitting lands on its own board rather than being
     * ranked against towers as built — `leaderboard/boardKey.ts` keys the board by the modifier
     * set, and that is what the purchase costs socially.
     */
    const row = offered().rows.find((entry) => entry.id === RUSH_PREFIT_SINK_ID);
    expect(row?.note).toBe(CHIMES_PANEL_COPY.prefitOffer);
    expect(row?.note).toContain('board');
  });

  it('draws the shortfall rather than a dead control when the balance will not cover it', () => {
    const price = CHIME_PRICES.sinks.find((sink) => sink.id === RUSH_PREFIT_SINK_ID)?.priceChimes ?? 0;
    expect(price).toBeGreaterThan(1);
    const view = chimesPanelViewOf({
      balanceChimes: price - 2,
      home: 'account',
      spendable: true,
      owns: OWNS_NOTHING,
    });
    const row = view.rows.find((entry) => entry.id === RUSH_PREFIT_SINK_ID);
    expect(row?.offer).toBe('short');
    expect(row?.note).toBe(`Short by 2 ${CHIME_PRICES.currency.many}.`);
    /* Singular, because the currency authors two words and a screen that picked one would ship the other broken. */
    const byOne = chimesPanelViewOf({
      balanceChimes: price - 1,
      home: 'account',
      spendable: true,
      owns: OWNS_NOTHING,
    });
    expect(byOne.rows.find((entry) => entry.id === RUSH_PREFIT_SINK_ID)?.note).toBe(
      `Short by 1 ${CHIME_PRICES.currency.one}.`,
    );
  });

  it('says bought rather than offering a step the ledger would not honour', () => {
    const sink = CHIME_PRICES.sinks.find((entry) => entry.id === RUSH_PREFIT_SINK_ID);
    const view = chimesPanelViewOf({
      balanceChimes: 999,
      home: 'account',
      spendable: true,
      owns: [{ sinkId: RUSH_PREFIT_SINK_ID, steps: sink?.maxSteps ?? 1 }],
    });
    const row = view.rows.find((entry) => entry.id === RUSH_PREFIT_SINK_ID);
    expect(row?.offer).toBe('owned');
    expect(row?.note).toBe(CHIMES_PANEL_COPY.prefitOwned);
  });

  it('refuses the press for a reason that is about the moment rather than the sink', () => {
    /*
     * Four states that are not *this build does not sell it*: no ledger on the page, an account
     * bridge still answering, nobody signed in, and a ledger nobody has read yet. Each has its own
     * sentence, because collapsing them would tell at least one player something false — which is
     * the mistake the review of PR #485 found on this very panel.
     */
    const cases = [
      [{ balanceChimes: 40, home: 'account' as const }, CHIMES_PANEL_COPY.rowNoLedger],
      [{ balanceChimes: 0, home: 'booting' as const, spendable: true }, CHIMES_PANEL_COPY.rowBooting],
      [{ balanceChimes: 0, home: 'signed-out' as const, spendable: true }, CHIMES_PANEL_COPY.rowSignedOut],
      [{ balanceChimes: 40, home: 'account' as const, spendable: true }, CHIMES_PANEL_COPY.rowBooting],
    ] as const;
    const notes = new Set<string>();
    for (const [input, note] of cases) {
      const row = chimesPanelViewOf(input).rows.find((entry) => entry.id === RUSH_PREFIT_SINK_ID);
      expect(row?.offer).toBe('unavailable');
      expect(row?.note).toBe(note);
      notes.add(note);
    }
    expect(notes.size).toBe(3);
  });

  it('says the fourth thing chimes buy is priced elsewhere, and never lists it as a row', () => {
    /*
     * `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS` refuses a second price for a scenario's
     * budget **by name**, so a row for it could not exist; what would be wrong is a list that
     * looked complete. `spendNote` is what stops a reader concluding the design shrank.
     */
    const view = offered();
    expect(view.spendNote).toBe(CHIMES_PANEL_COPY.spendNote);
    expect(view.rows.map((row) => row.id)).not.toContain('scenario-budget-step');
  });

  it('carries the server’s own refusal after a press and invents none of its own', () => {
    /* `docs/22` non-goal 3: a refusal is the server's sentence, never a softened rewrite of it. */
    const detail = 'There are not enough chimes in the account for that yet.';
    expect(chimesPanelViewOf({ balanceChimes: 0, home: 'account', notice: detail }).notice).toBe(detail);
    expect(chimesPanelViewOf({ balanceChimes: 0, home: 'account' }).notice).toBeUndefined();
  });

  it('positive control: the panel is the only surface here that names the spend route', async () => {
    /*
     * This used to assert **nothing** posts a spend, and held the refusal that said so. A spend
     * ships now (§ D672), so the control is inverted rather than deleted: exactly the modules that
     * are allowed to reach the route do, and a fifth one appearing here is a second spend surface
     * for one verb.
     */
    const names = (await readdir(EVERYDAY_SRC)).filter(
      (name) => name.endsWith('.ts') && !name.includes('.test.'),
    );
    const spending: string[] = [];
    for (const name of names) {
      const text = await readFile(join(EVERYDAY_SRC, name), 'utf8');
      if (/chimes\/spend/u.test(text.replace(/\/\*[\s\S]*?\*\//gu, ''))) spending.push(name);
    }
    expect(spending).toEqual([]);
    expect(names.length, 'the directory listing came back empty').toBeGreaterThan(20);
  });
});

describe('what the panel is allowed to hold — § D526 clause 5', () => {
  it('holds prices and a currency, and has no sources to reach', () => {
    /*
     * The other half of the fix `boundaries.test.ts` carries. That file greps for source **ids**,
     * and one property access — `CHIME_LEDGER.sources[i].name` — walked round it. The export is a
     * projection now, so there is nothing on it to reach whatever a future edit tries.
     */
    expect(Object.keys(CHIME_PRICES).sort()).toEqual(['currency', 'sinks']);
    expect(Object.hasOwn(CHIME_PRICES, 'sources')).toBe(false);
  });

  it('prices every sink in chimes and never in anything else', () => {
    const view = chimesPanelViewOf({ balanceChimes: 0, home: 'account' });
    expect(view.rows.length).toBe(CHIME_PRICES.sinks.length);
    for (const row of view.rows) {
      expect(row.price, row.id).toMatch(
        new RegExp(`^\\d+ (${CHIME_PRICES.currency.one}|${CHIME_PRICES.currency.many})$`, 'u'),
      );
    }
  });
});
