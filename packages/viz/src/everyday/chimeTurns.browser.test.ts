/**
 * **What the chime ledger is told when a turn ends, read off the wire** — GitHub issue #499,
 * [§ D533](../../../../DECISIONS.md), and the owner's ruling of 2026-09-10 after the review of PR #505:
 * *the scenario-clear award is paid for Scenario-mode clears only.*
 *
 * ## Why these are browser cases and not units
 *
 * Both earns this file is about are posted from inside a closure no node test can reach.
 * `everyday/fixitScreen.ts#primary` lands its run on a worker inside a DOM mount, and a Career day
 * closes through `dev/main.ts#closeShift`, which lives inside `boot()`. The review of PR #505 found
 * that the tests standing in for both read the source as text and passed with both bank calls
 * commented out, and that one of the two call sites banked a clear nobody had made: a Career day
 * closed into whatever week contract was standing and posted it as a scenario clear. So these cases
 * press the player's own controls on the shipped bundle and read what reached `/api/chimes/earn`.
 *
 * ## The server is a fake, and only as much of one as the page needs
 *
 * The artifact carries no `<meta name="elevator-sim-api">`, because `packages/viz/index.html` forbids
 * one. The server injects it with the value `/` as it serves the page
 * (`packages/server/src/http/static.ts#SAME_ORIGIN_API`), so {@link withFakeServer} serves the
 * document with that tag added the same way. It answers `/api/**` on the page's own origin: a link
 * redeemed into a session, a balance, and every earn recorded. Any other route answers 404, which is
 * a server that does not know the route, rather than a guess at what the real one would say.
 *
 * What is asserted is the turn the page names, and nothing the ledger decides. What a turn is worth,
 * and whether this account was already paid for it, belong to `packages/server`:
 * `chimes/ledger.test.ts` and `http/api.test.ts` hold them.
 *
 * No metric is read (§ D220 § 4). Whether a run fixed its case and whether a Career day was marked
 * cleared are **preconditions**, each stated with the reason a case would test nothing without it.
 * They are not claims this file makes about the simulator.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { SESSION_KEY } from '../persist/types.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // A port of its own, `strictPort: false` — files in one project run concurrently.
  site = await startShippedSite({ preview: { port: 5223, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
  // No timeout annotation: the `viz-browser` project's hook default is already 120 000 ms, and
  // `testCost.test.ts` holds the census of annotations `vitest.config.ts` states.
});

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/* -------------------------------------------------------------------------- *
 * The fake server
 * -------------------------------------------------------------------------- */

/** The session a redeemed link turns into. A literal nobody else holds, so an earn carrying it came from this page. */
const SESSION_TOKEN = 'tier-session-499';

/** The account the link redeems to. `menu/client.ts#AccountSummary`'s four fields, and nothing a screen decides by. */
const PLAYER = Object.freeze({
  id: 'tier-player-499',
  email: 'tier-499@example.test',
  displayName: 'Tier Player 499',
  displayNameChosen: true,
});

/** One post to the earn route: the body the page sent, and the session it sent it under. */
interface Earned {
  readonly body: unknown;
  readonly authorization: string | undefined;
}

/** What the page did against the fake server, recorded as it happened. */
interface Wire {
  /** Every body posted to `/api/chimes/earn`, in arrival order. */
  readonly earned: Earned[];
  /** Every API route the page asked for, so a failing case can say what the page did instead. */
  readonly asked: string[];
  /** Whether the document was served with the API tag. A case whose page had no API asserts nothing. */
  tagged: boolean;
}

/**
 * Serve the page the way the server does, and answer its API.
 *
 * Registered before the navigation, so the first document request is already routed. Nothing is
 * asserted inside a handler: a throw there is swallowed by the browser rather than failing the case,
 * so the handlers record and the case asserts.
 */
async function withFakeServer(page: Page): Promise<Wire> {
  const wire: Wire = { earned: [], asked: [], tagged: false };
  await page.route(
    (url) => url.origin === origin && (url.pathname === '/' || url.pathname === '/index.html'),
    async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      const tagged = html.replace(/<head(\s[^>]*)?>/iu, (head) => `${head}<meta name="elevator-sim-api" content="/">`);
      wire.tagged = tagged !== html;
      await route.fulfill({ response, body: tagged });
    },
  );
  await page.route(
    (url) => url.origin === origin && url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      wire.asked.push(`${method} ${path}`);
      const json = (status: number, body: unknown): Promise<void> =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (method === 'POST' && path === '/api/auth/redeem') return json(200, { token: SESSION_TOKEN, user: PLAYER });
      if (method === 'GET' && path === '/api/me') return json(200, { user: PLAYER });
      if (method === 'GET' && path === '/api/chimes') return json(200, { balanceChimes: 0 });
      if (method === 'POST' && path === '/api/chimes/earn') {
        wire.earned.push({
          body: request.postDataJSON() as unknown,
          authorization: (await request.headerValue('authorization')) ?? undefined,
        });
        return json(200, { balanceChimes: 0 });
      }
      return json(404, { error: 'not-found', detail: 'This fake server does not answer that route.' });
    },
  );
  return wire;
}

/**
 * A cold load with a session: the document served with the API tag, and a sign-in link in the fragment.
 *
 * **Signed in, read off the page, before anything else happens.** Every absence below is free on a
 * page with no session: `dev/main.ts`'s earn binding posts nothing without a token, so a case that
 * did not wait for this would pass on a page that could not have posted at all. The Everyday shell's
 * notice names the account the link redeemed to, and that name is this file's own literal, so the
 * wait reads no product copy.
 */
async function signedInLoad(query: string): Promise<{ readonly page: Page; readonly wire: Wire }> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  const wire = await withFakeServer(page);
  await page.goto(`${origin}/?${query}#sign-in=tier-link-499`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  expect(wire.tagged, 'the page was served without the API tag, so nothing on it could post').toBe(true);
  await page.waitForFunction(
    (name) => (document.querySelector('.everyday-signin-text')?.textContent ?? '').includes(name),
    PLAYER.displayName,
    { timeout: 30_000 },
  );
  return { page, wire };
}

/** The bodies posted to the earn route so far. */
function earnedBodies(wire: Wire): readonly unknown[] {
  return wire.earned.map((entry) => entry.body);
}

/* -------------------------------------------------------------------------- *
 * The fix case this file plays
 * -------------------------------------------------------------------------- */

interface ShippedCase {
  readonly id: string;
  readonly name: string;
  readonly buildingId: string;
  readonly repairs: readonly { readonly id: string; readonly role: string; readonly name: string }[];
}

const CASES: readonly ShippedCase[] = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../../data/fixit-cases.json', import.meta.url)), 'utf8'),
  ) as { readonly cases: readonly ShippedCase[] }
).cases;

/**
 * *Three cars, one car's work*, on Garden Apartments.
 *
 * Chosen for its tower, the smallest a shipped case runs on, so a pair of runs costs seconds and two
 * of them fit one case under the tier's ceiling. Its name and its diagnosed repair's name are read
 * from `data/fixit-cases.json` rather than transcribed, so an edit to either moves this file with it.
 * `fixit/cases.test.ts` pins that the diagnosed repair alone classifies FIXED on every shipped case.
 */
const FIX_CASE = CASES.find((entry) => entry.id === 'three-cars-one-cars-work');
const DIAGNOSED = FIX_CASE?.repairs.find((repair) => repair.role === 'diagnosed');

/** Whether the case rail wears FIXED on any case. The page opens with none, in a fresh browser context. */
async function anyCaseFixed(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.everyday-fixit-tag')].some((tag) => tag.textContent === 'FIXED'),
  );
}

/** § 3.3's primary is pressable again, which is the run having landed. */
async function primaryIsBack(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const button = document.querySelector<HTMLButtonElement>('.everyday-bar-primary');
      return button !== null && !button.disabled && !/Running/u.test(button.textContent ?? '');
    },
    undefined,
    { timeout: 60_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('what the chime ledger is told when a turn ends — GitHub issue #499', () => {
  it('posts nothing for a fix-it run that does not fix its case, and the case’s id once for the run that does', async () => {
    expect(FIX_CASE, 'data/fixit-cases.json no longer ships three-cars-one-cars-work').toBeDefined();
    expect(DIAGNOSED, 'the case no longer has a diagnosed repair').toBeDefined();
    const caseName = FIX_CASE?.name ?? '';
    const repairName = DIAGNOSED?.name ?? '';

    const { page, wire } = await signedInLoad('building=garden-apartments');
    try {
      await openScenarioEntry(page, 'fix-a-building');
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-fixit-case').length > 0,
        undefined,
        { timeout: 60_000 },
      );
      const caseRow = page.locator('.everyday-fixit-case', { hasText: caseName });
      expect(await caseRow.count(), `no single case row reads "${caseName}"`).toBe(1);
      await caseRow.click();
      await page.waitForFunction(
        (name) => (document.querySelector('.everyday-fixit-case[aria-current="true"]')?.textContent ?? '').includes(name),
        caseName,
        { timeout: 15_000 },
      );
      /* The case opens on its as-built run played (#348); skipped, as `fixitScreen.browser.test.ts` does. */
      await page.waitForSelector('.everyday-fixit-skip', { timeout: 60_000 });
      await page.click('.everyday-fixit-skip');
      await page.waitForFunction(
        () => document.querySelectorAll('.everyday-fixit-figure').length === 4,
        undefined,
        { timeout: 60_000 },
      );

      /*
       * **The negative control first: the run that does not fix.** No repair toggled, so the pair is
       * the same tower twice and the complaint does not move. It is a real press of the same primary
       * through the same `primary` and the same landing as the fixing run below, so the only thing
       * that differs is whether the run fixed the case.
       */
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 60_000 });
      await primaryIsBack(page);
      expect(await anyCaseFixed(page), 'a run with no repair fixed the case, so this control tests nothing').toBe(false);
      expect(earnedBodies(wire), 'a run that did not fix its case posted an earn').toEqual([]);

      /* **The run that fixes.** The diagnosed repair, alone. */
      const repair = page.locator('.everyday-fixit-repair', { hasText: repairName });
      expect(await repair.count(), `no single repair row reads "${repairName}"`).toBe(1);
      await repair.click();
      expect(await repair.getAttribute('aria-pressed')).toBe('true');
      await page.click('.everyday-bar-primary');
      await page.waitForFunction(
        () => [...document.querySelectorAll('.everyday-fixit-tag')].some((tag) => tag.textContent === 'FIXED'),
        undefined,
        { timeout: 60_000 },
      );

      await expect
        .poll(() => earnedBodies(wire), {
          timeout: 10_000,
          message: `the fix-it screen fixed ${FIX_CASE?.id ?? ''} and the ledger never heard of it; the page asked for ${wire.asked.join(', ')}`,
        })
        .toEqual([{ completion: 'scenario-cleared', scenarioId: FIX_CASE?.id }]);
      /* Posted under the session the link redeemed to, which is what makes it this account's clear. */
      expect(wire.earned[0]?.authorization ?? '').toContain(SESSION_TOKEN);
    } finally {
      await page.close();
    }
  });

  it('closes a Career day with a contract day paid and no scenario clear, though the week behind the shell counted its contract cleared', async () => {
    const { page, wire } = await signedInLoad('building=garden-apartments&seed=424242');
    try {
      /* The player's own path, as `campaignJourney.browser.test.ts` walks it: tile, triage row, desk, contract. */
      await leaveTutorialIfOffered(page);
      await page.locator('.everyday-mode[data-screen="towers"]').first().click();
      await page.waitForSelector('.everyday-towers');
      await page.click('.everyday-towers-open');
      await page.waitForSelector('.everyday-building');
      await page.click('.everyday-building-to-contract');
      await page.waitForSelector('.everyday-contract');

      /* *Lock it in and run day 1*, then *Close the day*, both through § 3.3's own primary. */
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-stage-canvas', { timeout: 60_000 });
      await page.waitForFunction(
        () => document.querySelector('.everyday-bar-primary')?.textContent === 'Close the day',
        undefined,
        { timeout: 60_000 },
      );
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-report', { timeout: 30_000 });

      /*
       * **Precondition one: the week standing behind the shell counted this close as its contract's
       * clear.** A Career day sets neither the week nor the play mode, so `closeShift` closes it into
       * the week the page opened on, and on this seed that close clears the week's contract. That is
       * exactly the state in which the wiring the review found posted a scenario clear. On a seed
       * where the week did not clear, the case below would pass on that wiring too.
       */
      const week = await page.evaluate((key) => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as {
          readonly session?: { readonly week?: { readonly contractId?: string; readonly completed?: readonly string[] } };
        };
        return envelope.session?.week ?? null;
      }, SESSION_KEY);
      expect(
        week?.completed ?? [],
        `the standing week (${week?.contractId ?? 'none'}) did not count this close as its contract's clear, so this case tests nothing`,
      ).toContain(week?.contractId);

      /*
       * **Precondition two: the desk marked the day cleared**, so a contract day is owed. Read off the
       * desk's month card, through the report's own way back.
       */
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-building', { timeout: 30_000 });
      const month = (await page.textContent('.everyday-building-month')) ?? '';
      expect(/(\d+)\s*cleared/u.exec(month)?.[1], `the desk did not mark day 1 cleared (${month}), so no contract day is owed`).toBe('1');

      /*
       * **The claim.** The contract day is paid, and nothing else is posted: the week's contract is a
       * daily-loop contract, not Scenario content, and a Career day is not the daily loop either.
       * Waited for the contract day first, because `everyday/host.ts#closeDay` posts it after
       * `closeShift` returns, so any post `closeShift` made is already on the wire by then.
       */
      await expect
        .poll(() => earnedBodies(wire), { timeout: 10_000, message: `no contract day was posted; the page asked for ${wire.asked.join(', ')}` })
        .toContainEqual({ completion: 'career-day-paid' });
      expect(earnedBodies(wire), 'a Career day posted a scenario clear for the week standing behind it').toEqual([
        { completion: 'career-day-paid' },
      ]);
    } finally {
      await page.close();
    }
  });
});
