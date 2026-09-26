/**
 * The first session's draw, through the shipped boot — GitHub issue #208, § D475, § D514.
 *
 * A load with a `?seed=` and no session draws one of the first-day towers from that seed and plays
 * it there, and the door says why under the seed line; the same seed draws the same tower, which is
 * what a named stream buys. A bare load on a date deals that date's **pinned day** on the pin's own
 * crowd (§ D1047), labelled as one, and a reload lands on it again without anything stored. An
 * address naming a building is the player's choice and wins, and the door then says nothing about a
 * draw. The tier reaches the door by the player's own route, and fixes the page's clock where a case
 * is about a date.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Pcg32, deriveStreamSeed } from '@elevator-sim/core/browser';

import {
  CHROMIUM,
  HAS_BROWSER,
  openEverydayBrief,
  openEverydayDoor,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { CONTRACTS, contractById } from '../shift/contracts.js';
import { SESSION_KEY } from '../persist/types.js';
import { dailySeedFor } from '../shift/dailySeed.js';
import {
  ELIGIBLE_FIRST_CONTRACT_IDS,
  FIRST_DAY_CONTRACT_IDS,
  FIRST_SESSION_LINE,
  FIRST_SESSION_LINE_PINNED,
  FIRST_SESSION_STREAM,
  firstSessionContractFor,
  firstSessionDayFor,
} from '../shift/firstSession.js';
import { pinnedDayLengthLineOf } from './firstDayLength.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5231, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function coldLoad(search: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}${search}`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

async function doorOf(page: Page): Promise<{ title: string; seed: string; line: string | null }> {
  await openEverydayDoor(page);
  return page.evaluate(() => ({
    title: document.querySelector('.everyday-door-title')?.textContent ?? '',
    seed: document.querySelector('.everyday-door-seed')?.textContent ?? '',
    line: document.querySelector('.everyday-door-first-session')?.textContent ?? null,
  }));
}

const SEED = 20_260_906;

describe.skipIf(!HAS_BROWSER)('the first session’s tower — GitHub issue #208', () => {
  it('draws one of the first-day towers from an address seed, plays it on that seed, and the door says why', async () => {
    const page = await coldLoad(`?seed=${String(SEED)}`);
    try {
      const door = await doorOf(page);
      const drawn = contractById(firstSessionContractFor(SEED));
      expect(drawn).toBeDefined();
      /* § D1047: the draw is over the first-day set, and a `?seed=` still wins over the pin. */
      expect(FIRST_DAY_CONTRACT_IDS).toContain(drawn?.id);
      expect(door.seed).toContain(`tower ${drawn?.buildingId ?? ''}`);
      expect(door.seed).toContain(`crowd ${String(SEED)}`);
      /*
       * **Checked against the shipped sentence rather than against a rebuild of it** — GitHub
       * issues #500 and #501, and then #428/#427/#426.
       *
       * This first read `toContain('five towers')`, true of an eight-contract sweep and stale at
       * ten. That was fixed by deriving the count — and the fix carried a *local copy* of the
       * module's number words, eleven of them, `zero` to `ten`, guarded by
       * `length < words.length`. Three more towers landed, two of them eligible, the set reached
       * **eleven**, and that guard went red: `expected 11 to be less than 11`. The shipped line was
       * correct the whole time, because `shift/firstSession.ts`'s own list runs to `sixteen`; what
       * was stale was the test's duplicate of it.
       *
       * So the duplicate is gone. The assertion is now the module's own `FIRST_SESSION_LINE`, which
       * is what the door is supposed to be drawing — a copy of a derivation is still a literal, and
       * it goes stale exactly one wave later than the literal it replaced.
       */
      expect(door.line).toBe(FIRST_SESSION_LINE);
      /*
       * Non-vacuity, and it asserts the property the module's docstring names rather than a bound
       * on a list this file no longer holds. `firstSession.ts` falls back to `String(n)` when its
       * word list runs out, and says why that matters: a bare numeral in player-facing prose is a
       * figure with no source, and the honesty search asks whether a figure is *licensed*. So the
       * check is that the fallback was **not** taken — the count reaches the sentence as a word.
       * The other numerals in the line (`day 1`, the sweep's day count) are licensed and stay.
       */
      /*
       * Since § D1178 the set can be one tower, which the line reads as *the one tower* rather
       * than as a count; both forms put the count in words.
       */
      expect(FIRST_DAY_CONTRACT_IDS.length).toBeGreaterThan(0);
      expect(FIRST_SESSION_LINE).toMatch(/ (the one tower|towers) whose day 1 /u);
      expect(FIRST_SESSION_LINE).not.toContain(
        `${String(FIRST_DAY_CONTRACT_IDS.length)} towers`,
      );
      /* Not the campaign's opener, which the instrument found never legible. */
      expect(door.seed).not.toContain('tower garden-apartments');
    } finally {
      await page.close();
    }
  }, 120_000);

  /**
   * The draw as it was before § D1047 — the same stream over the fifteen legible towers. Replicated
   * here only to say which date *used to* deal a reference tower; the shipped draw is not it.
   */
  function legibleDraw(seed: bigint): string {
    const { initState, initSeq } = deriveStreamSeed(seed, FIRST_SESSION_STREAM);
    const rng = new Pcg32(initState, initSeq);
    const count = ELIGIBLE_FIRST_CONTRACT_IDS.length;
    return ELIGIBLE_FIRST_CONTRACT_IDS[Math.min(count - 1, Math.floor(rng.nextFloat() * count))] ?? '';
  }

  /** A fresh context, its `Date` held at noon UTC on `date`, loaded at the bare origin. */
  async function coldLoadOn(date: string): Promise<Page> {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
      undefined,
      { timeout: 30_000 },
    );
    return page;
  }

  it('deals a pinned day on a date that used to deal a reference tower, labels it, and a reload lands on it — § D1047', async () => {
    /*
     * 2026-09-25 is the date the ruling was taken on, and on it the draw over the legible set dealt
     * Merdeka-class — a reference tower no shipped dispatcher clears on a whole day (§ D962), whose
     * run simulated for 171 s before the stage drew. The draw over the first-day set deals a pinned
     * day instead, on its own crowd, and every string that says whose crowd it is says so.
     */
    const date = '2026-09-25';
    const daySeed = dailySeedFor(date);
    expect(contractById(legibleDraw(daySeed))?.buildingId, 'the date no longer deals what the case is about').toMatch(
      /-class-reference$/u,
    );
    const dealt = firstSessionDayFor(daySeed);
    const contract = contractById(dealt.contractId);
    expect(FIRST_DAY_CONTRACT_IDS).toContain(dealt.contractId);
    const page = await coldLoadOn(date);
    try {
      const door = await doorOf(page);
      expect(door.seed).toContain(`tower ${contract?.buildingId ?? ''}`);
      expect(door.seed).toContain(`crowd ${dealt.seed.toString()}`);
      expect(door.seed).toContain('the pinned crowd this day was measured on, not the day’s');
      expect(door.line).toBe(FIRST_SESSION_LINE_PINNED);
      /* Nothing was stored to get here: the week is not in storage, and the pin is not either. */
      expect(await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY)).toBeNull();

      /* The brief says whose crowd the census was measured on, and — on a whole day — how long it is. */
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
      const brief = await page.evaluate(() => ({
        moot: document.querySelector('.everyday-brief-moot')?.textContent ?? null,
        length: document.querySelector('.everyday-brief-day-length')?.textContent ?? null,
      }));
      expect(brief.moot).toContain('Measured on this crowd');
      expect(brief.length).toBe(pinnedDayLengthLineOf(dealt.contractId) ?? null);

      /* A reload lands on the same day — through the address this page wrote, drawing nothing. */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      const again = await doorOf(page);
      expect(again.seed).toBe(door.seed);
      expect(again.line).toBe(FIRST_SESSION_LINE_PINNED);

      /* And a fresh visit to the bare origin re-derives it from the date — it was never stored. */
      await page.goto(origin, { waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      const rederived = await doorOf(page);
      expect(rederived.seed).toBe(door.seed);
      expect(rederived.line).toBe(FIRST_SESSION_LINE_PINNED);
    } finally {
      await page.close();
    }
  });

  it('prints a whole pinned day’s length on the brief, and choosing an ordinary tower puts the day’s crowd back — § D1047', async () => {
    /* 2026-09-23 deals a whole day, so the brief's length line is drawn rather than absent. */
    const date = '2026-09-23';
    const daySeed = dailySeedFor(date);
    const dealt = firstSessionDayFor(daySeed);
    const line = pinnedDayLengthLineOf(dealt.contractId);
    expect(line, `${date} no longer deals a whole day`).toBeDefined();
    const page = await coldLoadOn(date);
    try {
      await openEverydayBrief(page);
      expect(await page.evaluate(() => document.querySelector('.everyday-brief-day-length')?.textContent ?? null)).toBe(
        line,
      );
      /*
       * The picker's promise: choosing a tower from the list puts your crowd back — here, the day's.
       * Taken after a reload, which lands through the address this page wrote rather than the draw,
       * so the crowd to put back is re-derived from the date at boot on that path as well.
       */
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      await openEverydayDoor(page);
      expect((await page.textContent('.everyday-door-seed')) ?? '').toContain(`crowd ${dealt.seed.toString()}`);
      await page.click('.everyday-door-tower[data-contract="c1"]');
      await page.waitForSelector('.everyday-door-tower[data-contract="c1"][data-selected="true"]', { timeout: 30_000 });
      const seed = (await page.textContent('.everyday-door-seed')) ?? '';
      expect(seed).toContain(`crowd ${daySeed.toString()}`);
      expect(seed).toContain('today’s date');
    } finally {
      await page.close();
    }
  });

  it('honours an address that names a building, and then says nothing about a draw', async () => {
    const page = await coldLoad(`?building=garden-apartments&seed=${String(SEED)}`);
    try {
      const door = await doorOf(page);
      expect(door.seed).toContain('tower garden-apartments');
      expect(door.line).toBeNull();
      expect(CONTRACTS[0]?.buildingId).toBe('garden-apartments');
    } finally {
      await page.close();
    }
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The consent ask — GitHub issue #340, `docs/26-telemetry-and-privacy.md` §§ 4 and 7.6
 * -------------------------------------------------------------------------- */

/**
 * § 7.6's second test, and it is a browser-tier test *because the section says so*: *"With the
 * transport unset — the `vite dev` case, and any deployment with no API origin tag — a session
 * completes all five beats and every screen behaves identically. This is `docs/26 P-6`, and it is a
 * browser-tier test rather than an argument."*
 *
 * The shipped preview this tier serves carries **no `<meta name="elevator-sim-api">`**, which is not
 * a limitation of the harness but the artifact's own shipped state (`vite.config.ts`: *"Unset is the
 * shipped state, and it is what `vite dev` and the `Dockerfile` both build with"*). So every case
 * below runs against exactly the deployment § 7.6 names, and *nothing is sent anywhere* is a
 * property of the page rather than of a stub.
 *
 * It lives in this file rather than in one of its own because the ask **is** a first-session
 * surface, and because a new file in this tier would have to claim a port nobody else has —
 * `dev/browserTier.test.ts` derives that rule and enforces it.
 */
describe.skipIf(!HAS_BROWSER)('the consent ask — GitHub issue #340', () => {
  const slotOf = async (page: Page): Promise<string | null> =>
    page.evaluate(() => window.localStorage.getItem('elevator-sim.telemetry'));

  const askOf = async (page: Page): Promise<{ heading: string | null; no: string | null; yes: string | null }> =>
    page.evaluate(() => ({
      heading: document.querySelector('.everyday-consent-heading')?.textContent ?? null,
      no: document.querySelector('.everyday-consent-no')?.textContent ?? null,
      yes: document.querySelector('.everyday-consent-yes')?.textContent ?? null,
    }));

  it('asks on a first load, and the screen behind it is fully usable', async () => {
    const page = await coldLoad('');
    try {
      const ask = await askOf(page);
      expect(ask.heading, 'the ask is not drawn on a device that has never been asked').not.toBeNull();
      expect(ask.no).toBeTruthy();
      expect(ask.yes).toBeTruthy();

      /*
       * § 4.4: *"A gate. No screen waits on an answer."* The screen behind the notice is drawn and
       * enterable with the question unanswered, which is what distinguishes a notice from the
       * consent wall § 10 non-goal 3 refuses by name.
       *
       * The assertion is *a screen opens*, not *the front door drew its tiles*: § D529 puts a
       * two-screen tutorial before the front door on a first session, so a fresh device is not on
       * the menu when the ask appears — which the tier reported as zero tiles before this comment
       * existed. Opening a screen is the stronger claim anyway; a wall would refuse it.
       */
      const drawn = await page.locator('.everyday-screen > *').count();
      expect(drawn, 'nothing was drawn behind the ask').toBeGreaterThan(0);
      await openEverydayDoor(page);
      const door = await page.evaluate(() => document.querySelector('.everyday-door-title')?.textContent ?? '');
      expect(door, 'a screen would not open while the question was unanswered').not.toBe('');

      // P-1, on the shipped page: no identifier before an answer, and nothing written at all.
      expect(await slotOf(page)).toBeNull();
    } finally {
      await page.close();
    }
  }, 120_000);

  it('takes no for an answer, mints no identifier, and never asks again', async () => {
    const page = await coldLoad('');
    try {
      await page.locator('.everyday-consent-no').click();
      expect((await askOf(page)).heading, 'the ask was still drawn after an answer').toBeNull();

      const stored = await slotOf(page);
      expect(stored, 'the refusal was not remembered').not.toBeNull();
      const record = JSON.parse(stored ?? '{}') as Record<string, unknown>;
      expect(record['state']).toBe('refused');
      // § 4.2, and P-1: a refusal mints nothing. There is no id in the slot to find.
      expect(record['playerId']).toBeUndefined();

      // § 10 non-goal 3: no repeated asking after a refusal, across a reload rather than within a
      // mount — a flag that lived in the shell would pass the first half and fail this one.
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(
        () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
        undefined,
        { timeout: 30_000 },
      );
      expect((await askOf(page)).heading, 'the question came back after a refusal').toBeNull();
    } finally {
      await page.close();
    }
  }, 120_000);

  it('takes yes, mints one identifier, and plays a whole first session with nowhere to send it', async () => {
    const page = await coldLoad('');
    try {
      await page.locator('.everyday-consent-yes').click();
      const record = JSON.parse((await slotOf(page)) ?? '{}') as Record<string, unknown>;
      expect(record['state']).toBe('granted');
      expect(String(record['playerId'])).toMatch(/^[0-9a-f]{32}$/u);

      /*
       * § 7.6's second test proper. This build has no API origin, so the recorder's transport is
       * `undefined` and every batch is dropped. The page has to be indistinguishable from one that
       * never had a recorder — so the beats are walked and the product is required to behave.
       */
      await openEverydayDoor(page);
      const door = await page.evaluate(() => document.querySelector('.everyday-door-title')?.textContent ?? '');
      expect(door).not.toBe('');
      await page.locator('.everyday-rail-settings').click();
      await page.waitForSelector('.everyday-settings', { timeout: 30_000 });

      // And the row § 4.3 requires: reachable, drawn on, and it is the way back out.
      const row = await page.evaluate(() => ({
        face: document.querySelector('.everyday-settings-telemetry')?.textContent ?? null,
        note: document.querySelector('.everyday-settings-telemetry-note')?.textContent ?? null,
      }));
      expect(row.face, 'the consent row is not on the settings screen').toBe('on');
      expect(row.note).toBeTruthy();

      await page.locator('.everyday-settings-telemetry').click();
      const withdrawn = JSON.parse((await slotOf(page)) ?? '{}') as Record<string, unknown>;
      // § 4.3: withdrawal deletes rather than stops. The identifier is gone from the device even
      // though there was no server to ask, which is the failure mode that section names.
      expect(withdrawn['state']).toBe('withdrawn');
      expect(withdrawn['playerId']).toBeUndefined();
      expect(
        await page.evaluate(() => document.querySelector('.everyday-settings-telemetry')?.textContent ?? ''),
        'the row did not draw off after a withdrawal',
      ).toBe('off');
    } finally {
      await page.close();
    }
  }, 120_000);
});
