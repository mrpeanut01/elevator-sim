/**
 * The day's crowd — § D729, § D730, § D731.
 *
 * Four things are held here, and the first two are the ones the ruling stands on:
 *
 * 1. **The client's derivation is the server's, character for character.** Asserted against
 *    `packages/server/src/leaderboard/boardKey.ts`'s **own source text** rather than against a
 *    copy of it, because `viz` may not depend on `server` (§ D215 § 3) and a second copy is
 *    exactly the drift this pair exists to prevent. `menu/client.test.ts` set that idiom.
 * 2. **Nothing here reads a clock.** Every export takes `nowMs`, so a test can drive a year past
 *    it and a replay can re-derive nothing. `shift/deviceDate.ts` is the one seam that reads one.
 * 3. **`isDailySeed` is asked, not assumed** — a deep-linked seed and a session left open across
 *    UTC midnight both answer `false`, which is what keeps the door's sentence honest in the two
 *    states that reach it with a crowd nobody else has.
 * 4. **The rotation measurement `dailySeed.ts` publishes is re-derivable here**, so the figure in
 *    that docstring is pinned to a run rather than remembered.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIRST_DAY_CONTRACT_IDS, firstSessionContractFor } from './firstSession.js';
import { dailyDateOf, dailySeedAt, dailySeedFor, isDailySeed } from './dailySeed.js';

/** The server's own source, read rather than imported — `menu/client.test.ts`'s rule and reason. */
function serverSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../server/src/${relative}`, import.meta.url)), 'utf8');
}

/**
 * This module's own source with block comments removed, for the purity checks below.
 *
 * Stripped for `boundaries.test.ts#stripComments`' reason, which bites here harder than it does
 * there: both of these files *name* `Date.now()` in prose in order to explain where it may and may
 * not appear, and a rule that counted those would be a rule about docstrings.
 */
function moduleCode(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
}

describe('the date, UTC', () => {
  it('is `YYYY-MM-DD` and turns over at UTC midnight, not at the reader’s', () => {
    expect(dailyDateOf(Date.UTC(2026, 8, 19, 0, 0, 0))).toBe('2026-09-19');
    expect(dailyDateOf(Date.UTC(2026, 8, 19, 23, 59, 59, 999))).toBe('2026-09-19');
    expect(dailyDateOf(Date.UTC(2026, 8, 20, 0, 0, 0))).toBe('2026-09-20');
  });

  it('gives one answer wherever the reader is standing', () => {
    // The whole reason the derivation is UTC: one instant, one crowd. A local-zone date would
    // make Auckland and Los Angeles two boards wearing one name — `boardKey.ts`'s own sentence.
    const instant = Date.UTC(2026, 8, 19, 12, 0, 0);
    expect(dailyDateOf(instant)).toBe(new Date(instant).toISOString().slice(0, 10));
  });
});

describe('the crowd is the date’s own digits', () => {
  it('drops the dashes and nothing else', () => {
    expect(dailySeedFor('2026-09-19')).toBe(20_260_919n);
    expect(dailySeedFor('2026-01-01')).toBe(20_260_101n);
    expect(dailySeedFor('1999-12-31')).toBe(19_991_231n);
  });

  it('is the number the door prints, so a player can check it against a calendar', () => {
    // § D729's second property, as an assertion rather than a promise: the seed *reads* as the
    // date. This is the one claim on the door that the person reading it can verify unaided.
    const date = dailyDateOf(Date.UTC(2026, 8, 19, 9, 30, 0));
    expect(dailySeedAt(Date.UTC(2026, 8, 19, 9, 30, 0)).toString()).toBe(date.replaceAll('-', ''));
  });

  it('is stable across a whole UTC day and moves at its boundary', () => {
    const open = dailySeedAt(Date.UTC(2026, 8, 19, 0, 0, 0));
    expect(dailySeedAt(Date.UTC(2026, 8, 19, 23, 59, 59, 999))).toBe(open);
    expect(dailySeedAt(Date.UTC(2026, 8, 20, 0, 0, 0))).not.toBe(open);
  });
});

describe('the client’s derivation is the server’s', () => {
  it('agrees with `boardKey.ts#dailySeedFor` on the expression, read from its source', () => {
    /*
     * The server is the authority for *which board*, and this package may not import it. So the
     * agreement is asserted against the text: if the server ever derives its seed some other way,
     * this goes red on the commit that moves it rather than on the day two players compare a
     * crowd number and find they did not meet the same people.
     */
    const source = serverSource('leaderboard/boardKey.ts');
    expect(source).toContain("return date.replaceAll('-', '');");
    expect(source).toContain("return new Date(nowMs).toISOString().slice(0, 10);");
  });

  it('produces the same digits the server would, for a year of dates', () => {
    // The server's `dailySeedFor` is `date.replaceAll('-', '')` — re-stated here as the *expected*
    // value, which is only legitimate because the case above pins that expression at its source.
    for (let day = 0; day < 365; day += 1) {
      const date = dailyDateOf(Date.UTC(2026, 0, 1) + day * 86_400_000);
      expect(String(dailySeedFor(date))).toBe(date.replaceAll('-', ''));
    }
  });
});

describe('whether this run is today’s crowd', () => {
  const NOW = Date.UTC(2026, 8, 19, 10, 0, 0);

  it('is true of the seed the page opens on', () => {
    expect(isDailySeed(dailySeedAt(NOW), NOW)).toBe(true);
  });

  it('is false of a `?seed=` deep link, which is the reader’s own choice and wins', () => {
    expect(isDailySeed(424_242n, NOW)).toBe(false);
  });

  it('goes false when a session is left open across UTC midnight', () => {
    // The case a flag latched at boot would have missed, and the reason the screens ask at render
    // time. A door still saying *everyone identical* at 00:01 would be the defect inside the fix.
    const opened = dailySeedAt(Date.UTC(2026, 8, 19, 23, 50, 0));
    expect(isDailySeed(opened, Date.UTC(2026, 8, 20, 0, 10, 0))).toBe(false);
  });
});

describe('nothing in the derivation reads a clock', () => {
  it('takes `nowMs` and never asks for it', () => {
    /*
     * `boundaries.test.ts` rule 2 greps for `Date.now(` and `performance.now(`; it does **not**
     * catch a zero-argument `new Date()`, which is the spelling that would have slipped the rule.
     * So this file asserts the narrower thing at the one module that would have been tempted, and
     * the exemption stays a single line in a single file that draws nothing.
     */
    const source = moduleCode('dailySeed.ts');
    expect(source).not.toMatch(/\bDate\.now\s*\(/);
    expect(source).not.toMatch(/\bperformance\.now\s*\(/);
    expect(source).not.toMatch(/\bnew Date\s*\(\s*\)/);
    // `new Date(nowMs)` is a constructor over an argument, not a reading. It is the only one.
    expect(source.match(/\bnew Date\s*\(/g) ?? []).toHaveLength(1);
  });

  it('keeps the one reading in a module that does nothing else', () => {
    const source = moduleCode('deviceDate.ts');
    expect(source.match(/\bDate\.now\s*\(/g) ?? []).toHaveLength(1);
    expect(source).toContain('export function deviceNowMs()');
    // One export, so the exemption `boundaries.test.ts` grants is as narrow as it reads.
    expect(source.match(/^export /gm) ?? []).toHaveLength(1);
  });
});

describe('the page opens on it', () => {
  /** `dev/main.ts`'s source with block comments removed — the boot line is code, not prose. */
  function bootCode(): string {
    return readFileSync(fileURLToPath(new URL('../dev/main.ts', import.meta.url)), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
  }

  it('seeds the opening state from the day, not from `randomSeed`', () => {
    /*
     * A source-text check rather than a behavioural one, because `boot` needs a document and this
     * is the one line in it that cannot be exercised without one. It is the regression that
     * matters: § D729 is one expression on one line, and putting `randomSeed()` back would restore
     * the defect silently while five strings went on asserting the opposite.
     */
    const code = bootCode();
    expect(code).toContain('initialState(resources, dailySeedAt(deviceNowMs()))');
    expect(code).not.toContain('initialState(resources, randomSeed())');
  });

  it('keeps `randomSeed` for the transport’s draw, so it is not a dead seam', () => {
    // The roadmap's standing requirement: name the non-test caller. Blanking the seed field is a
    // reader asking for a crowd of their own, which is a control rather than a default.
    expect(bootCode()).toContain("entry.kind === 'draw' ? randomSeed() : entry.seed");
  });
});

describe('the rotation rules `docs/37` § 4.3 states, measured rather than assumed', () => {
  /**
   * The sequence a date-derived seed produces, over two years of consecutive UTC dates.
   *
   * `firstSessionContractFor` is the shipped draw (§ D514), unchanged by this wave — what moved is
   * the seed it is handed. So this measures the *rotation* the ruling declined to build, which is
   * the only honest way to decline it.
   */
  function twoYearsOfDraws(): readonly string[] {
    const draws: string[] = [];
    for (let day = 0; day < 730; day += 1) {
      const date = dailyDateOf(Date.UTC(2026, 0, 1) + day * 86_400_000);
      draws.push(firstSessionContractFor(dailySeedFor(date)));
    }
    return draws;
  }

  it('does not satisfy *no tower twice in seven days*, and the figures are the docstring’s', () => {
    /*
     * **The set is the first-day set since § D1047** ([§ D1047](../../../../DECISIONS.md)), not the
     * legible one, and this guard was re-pointed rather than re-numbered: it says which set the two
     * figures are functions of, and a guard on the legible set's length would go on passing while
     * the draw it describes indexed something else.
     */
    expect(
      FIRST_DAY_CONTRACT_IDS,
      'dailySeed.ts publishes its two figures measured over these six contracts — re-measure and ' +
        'move both if the first-day set has changed',
    ).toEqual(['c2', 'c3', 'c6', 'c7', 'c8', 'c10']);

    const draws = twoYearsOfDraws();
    const lastSeenAt = new Map<string, number>();
    let insideSeven = 0;
    let consecutive = 0;
    draws.forEach((contractId, index) => {
      const previous = lastSeenAt.get(contractId);
      if (previous !== undefined) {
        if (index - previous < 7) insideSeven += 1;
        if (index - previous === 1) consecutive += 1;
      }
      lastSeenAt.set(contractId, index);
    });

    expect(draws).toHaveLength(730);
    /*
     * **Both figures moved on 2026-09-22 and the guard above is what caught it** —
     * [§ D963](../../../../DECISIONS.md). They were 308 and 56 over an eleven-member set; the
     * legibility sweep was re-measured on a tree where six ladder rungs had moved and the set grew
     * to fourteen. A set that is three members wider collides less, so the rotation rule gets
     * closer to satisfied without anybody aiming at it — 42.2 % → **34.4 %** — and still fails it.
     */
    /*
     * **And again on 2026-09-24** — [§ D991](../../../../DECISIONS.md): the set went fourteen →
     * fifteen when the legibility table was re-measured on the day Today's scenario plays, and
     * `c14` joined. 251 → 235 inside seven days and 50 → 47 consecutive, re-derived from the draw
     * rather than scaled. The rule is still not satisfied.
     *
     * **And a third time, in the bad direction, on 2026-09-25** — [§ D1047](../../../../DECISIONS.md).
     * The draw now indexes the six-member first-day set rather than the fifteen legible towers, so
     * a tower repeats inside seven days on **483** of 730 dates (**66.2 %**, was 235 and 32.2 %) and
     * on consecutive days **119** times (was 47). Re-derived from the draw on this line rather than
     * scaled from fifteen to six, which would have given neither. `dailySeed.ts`'s reason the rule
     * is not built — one draw per device, so no rotation has an observer — is unchanged by the
     * set's size, and the figure is published so issue #159's generator inherits it as a measurement.
     */
    expect(insideSeven).toBe(483);
    expect(consecutive).toBe(119);
    // 483 / 730 = 66.2 %, the figure `dailySeed.ts`'s docstring publishes.
    expect(Math.round((1000 * insideSeven) / draws.length) / 10).toBe(66.2);
  });

  it('draws only from the first-day set, whatever the date — and reaches every member', () => {
    const seen = new Set<string>();
    for (const contractId of twoYearsOfDraws()) {
      expect(FIRST_DAY_CONTRACT_IDS).toContain(contractId);
      seen.add(contractId);
    }
    expect([...seen].sort()).toEqual([...FIRST_DAY_CONTRACT_IDS].sort());
  });
});
