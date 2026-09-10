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

import { CHIME_PRICES, CHIMES_PANEL_COPY, chimesPanelViewOf } from './chimesPanel.js';

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

describe('what the panel says about spending — § D219, the branch with no control', () => {
  it('draws the prices and says on the same face that none of them can be bought yet', () => {
    const view = chimesPanelViewOf({ balanceChimes: 40, home: 'account' });
    expect(view.rows.length).toBeGreaterThan(0);
    expect(view.spendRefusal).toBe(CHIMES_PANEL_COPY.spendRefusal);
    expect(view.spendRefusal.length, 'the refusal is drawn on every state or it is not drawn').toBeGreaterThan(0);
  });

  it('says it whatever the balance is, because affordability is not the reason', () => {
    /*
     * The row shape used to carry `affordable`, and the screen dimmed a row the balance could not
     * cover. A row faded for a balance is a row saying it becomes pressable when the balance grows.
     * Nothing presses, so the field is gone and the refusal does not vary.
     */
    for (const balance of [0, 1, 40, 10_000]) {
      const view = chimesPanelViewOf({ balanceChimes: balance, home: 'account' });
      expect(view.spendRefusal, String(balance)).toBe(CHIMES_PANEL_COPY.spendRefusal);
      for (const row of view.rows) expect(Object.hasOwn(row, 'affordable'), row.id).toBe(false);
    }
  });

  it('positive control: nothing in this package posts a spend', async () => {
    /* If this goes red the refusal above is the stale one, and it leaves on that commit. */
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
