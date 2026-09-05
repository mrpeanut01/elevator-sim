/**
 * **A mailed sign-in link opened while Everyday Mode holds the page** — GitHub issue #336, driven.
 *
 * ## Why this is a browser test and why no other tier can stand in for it
 *
 * The claim is about *which shell the page belongs to at the instant a link is redeemed*, and every
 * fact in it is a fact about a document:
 *
 * - `packages/viz/index.html` loads `everyday/boot.ts`, which imports `dev/main.js` for its side
 *   effect and then mounts the Everyday shell over the Engineer surface;
 * - `dev/main.ts`'s boot calls `redeemLinkFromHash()` unconditionally at the end of that boot;
 * - `everyday/shell.ts` covers the Engineer root with `visibility:hidden` plus `inert`.
 *
 * No node test can hold all three at once — there is no second shell to be covered by, and the
 * defect is *the outcome landing on the covered one*. That is exactly the class issue #336's own
 * acceptance names: **a browser-tier case covers the covered-surface path, since this is precisely
 * the class no DOM-free test can see.**
 *
 * ## What the defect was, measured here before it was fixed
 *
 * Driven against the tree at `ba32799` — the commit this lane started from — a cold load of
 * `#sign-in=<token>` produced, in the Everyday shell, **nothing at all**: no banner, no sentence, no
 * acknowledgement of any kind. `.everyday-signin` did not exist, and the three cases below failed on
 * their first assertion. Meanwhile the Engineer menu behind the cover had been navigated to its
 * account screen and had the outcome written onto it, where the player could neither see it nor
 * reach it — and could not reach it *later* either, because `dispatchMenu`'s `reopen` arm navigates
 * to `main`, so the one route back into that menu throws the navigation away.
 *
 * ## What this file does not assert
 *
 * No metric, per § D220 § 4 — every reading below is the presence, absence or text of a control.
 *
 * ## Why the outcome under test is the no-server one
 *
 * The artifact this tier serves carries no `<meta name="elevator-sim-api">` — `packages/viz/index.html`
 * says in terms that it may not, and the two producers that write it are the server and the CDN
 * build. So `dev/main.ts`'s `client` is `undefined` here and the redemption's answer is its
 * *no server* sentence rather than a session.
 *
 * **That is the same code path for everything this file is about.** The branch that decides *where
 * the outcome is published* runs before the request and is shared by all four arms; what differs
 * between them is only which sentence arrives. A session is asserted at the node tier, on the pure
 * view (`signInLink.test.ts`), where a signed-in report can be constructed without a server.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  openPage,
  pressMenuRow,
  reopenEngineerMenu,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { SIGN_IN_NOTICE_LABEL, SIGN_IN_NOTICE_POINTER } from './signInLink.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425. A port of
  // its own with `strictPort: false`, because files in one project run concurrently.
  site = await startShippedSite({ preview: { port: 5220, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * A cold load of the shipped page with a link token in the fragment.
 *
 * **The latch is the cleared fragment and deliberately not the dismissed Engineer menu**, which is
 * what every other file in this tier waits on. `redeemLinkFromHash` clears the fragment on its first
 * statement after finding a token, so an empty `location.hash` is the narrowest available proof that
 * the redemption has *started* — and it is true on the tree before this fix and on the tree after
 * it, which is what a reproduction needs.
 *
 * The dismissed-menu latch is unusable here, and the reason is the second half of the defect: before
 * the fix, navigating the covered menu to `account` took its *Resume* row off the screen, so
 * `everyday/boot.ts#closeEngineerMenuWhenReady` never found a row to press and the overlay stayed up
 * for the whole visit. A case that waited on it would have failed on the harness rather than on the
 * product, thirty seconds later, with nothing said about the banner.
 */
async function openWithLink(token: string): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 720 } });
  await page.goto(`${origin}/#sign-in=${token}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.location.hash === '', undefined, { timeout: 30_000 });
  return page;
}

describe.skipIf(!HAS_BROWSER)(
  'a mailed sign-in link redeemed while Everyday Mode holds the page — GitHub issue #336',
  () => {
    it('says what happened, on the surface the player is actually looking at', async () => {
      const page = await openWithLink('a-mailed-token');
      try {
        /*
         * The whole of the issue in one wait. Before the fix this timed out: the shell drew no
         * banner, because nothing told it a link had been redeemed at all.
         */
        await page.waitForSelector('.everyday-signin', { state: 'visible', timeout: 30_000 });

        const drawn = await page.evaluate(() => {
          const notice = document.querySelector<HTMLElement>('.everyday-signin');
          return {
            label: notice?.querySelector<HTMLElement>('.everyday-signin-label')?.textContent ?? '',
            text: notice?.querySelector<HTMLElement>('.everyday-signin-text')?.textContent ?? '',
            pointer:
              notice?.querySelector<HTMLElement>('.everyday-signin-pointer')?.textContent ?? '',
            /* Inside the Everyday root, so it is covered and inert exactly when that shell is. */
            insideEveryday: notice?.closest('.everyday') !== null,
          };
        });

        expect(drawn.label, 'the banner carries no label saying what it is about').toBe(
          SIGN_IN_NOTICE_LABEL,
        );
        expect(
          drawn.text.length,
          'the banner is labelled and says nothing — the outcome sentence is missing',
        ).toBeGreaterThan(0);
        expect(
          drawn.text,
          'the outcome drawn is not the one this build can produce with no account server behind it',
        ).toContain('no account server behind it');
        expect(drawn.pointer, 'the banner does not say where the account screen is').toBe(
          SIGN_IN_NOTICE_POINTER,
        );
        expect(drawn.insideEveryday, 'the banner is not inside the Everyday shell').toBe(true);
      } finally {
        await page.close();
      }
    });

    it('clears the fragment, and does it whichever shell holds the page', async () => {
      const page = await openWithLink('a-second-mailed-token');
      try {
        await page.waitForSelector('.everyday-signin', { state: 'visible', timeout: 30_000 });
        /*
         * Issue #336's fourth acceptance bullet, and it is asserted here rather than trusted: the
         * fragment is cleared *before* the request, so a reload during a cold start cannot re-send
         * a token the first attempt is spending. A fix that published the outcome from a later
         * continuation would be free to move that write, and this is what would notice.
         */
        expect(
          await page.evaluate(() => window.location.hash),
          'the sign-in token is still in the address bar after redemption',
        ).toBe('');
      } finally {
        await page.close();
      }
    });

    it('leaves the Engineer surface covered, its menu dismissed, and the account screen a door away', async () => {
      const page = await openWithLink('a-third-mailed-token');
      try {
        await page.waitForSelector('.everyday-signin', { state: 'visible', timeout: 30_000 });

        /*
         * The premise of the defect, asserted rather than assumed: at the instant the outcome is
         * published, the Engineer root is covered and inert. If this ever stops holding, the case
         * above stops being about the covered path and would pass for the wrong reason.
         */
        const covered = await page.evaluate(() => ({
          shellInert: document.querySelector<HTMLElement>('.shell')?.inert,
          everydayVisibility: document.querySelector<HTMLElement>('.everyday')?.style.visibility,
        }));
        expect(covered.shellInert, 'the Engineer root was not inert at redemption').toBe(true);
        expect(
          covered.everydayVisibility,
          'the Everyday shell did not hold the page at redemption',
        ).toBe('');

        /*
         * **The second half of the defect, and the one nothing was looking for.** Before the fix,
         * navigating the covered menu to `account` removed the *Resume* row
         * `everyday/boot.ts#closeEngineerMenuWhenReady` presses, so a page that had redeemed a link
         * left the Engineer menu open behind the cover for the whole visit — measured on the
         * artifact as `.menu-overlay hidden: false` over 3 rows against `hidden: true` over 9 on the
         * same page with no fragment. A boot that opens a link must land in the same state as a boot
         * that does not.
         */
        await page.waitForFunction(
          () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
          undefined,
          { timeout: 30_000 },
        );

        /*
         * And the Engineer surface is reached the player's own way — § 3.2's swap row, then the
         * header's Menu — never by taking the cover off. `dispatchMenu`'s `reopen` arm navigates to
         * `main`, so this is where a player arrives, and the account screen is one press away with
         * the outcome on it: the route `SIGN_IN_NOTICE_POINTER` names, walked. That is also the
         * third acceptance bullet's evidence — the Engineer half of this flow is untouched.
         */
        await enterEngineerStage(page);
        await reopenEngineerMenu(page);
        await pressMenuRow(page, 'main.account');
        await page.waitForFunction(
          () =>
            (document.querySelector<HTMLElement>('.menu-overlay')?.textContent ?? '').includes(
              'no account server behind it',
            ),
          undefined,
          { timeout: 15_000 },
        );
      } finally {
        await page.close();
      }
    });
  },
);
