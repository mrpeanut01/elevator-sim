/**
 * **Every dead control in the Everyday shell says why, or is not a control** — GitHub issue #262's
 * rule, over the shell rather than over the one screen the issue measured.
 *
 * ## Why this is a tier file and not a node one
 *
 * The question is *what does a player meet*, and the answer is a property of the drawn document:
 * which buttons are `disabled`, what accessible name each one has, and whether anything on it
 * explains the refusal. No model test can see any of that — a `bar()` refinement can be asked what
 * it resolved and cannot be asked what the shell did with it, and three of the five offenders this
 * file was written against are drawn by screen modules that never touch a bar model at all.
 *
 * ## The measurement it was written from
 *
 * Driven on the shipped build at 1280 × 720, before the sweep: **fifteen disabled buttons across
 * five screens, fourteen of them with no reason anywhere on the control.**
 *
 * | screen | disabled | with no reason |
 * |---|---|---|
 * | main menu | 1 | 1 — `⌂ Modes` |
 * | Endless rush | 1 | 1 — `Start the rush` |
 * | Fix a building | 3 | 3 — an unaffordable repair, and both `−` steppers |
 * | All buildings | 5 | 5 — every stop of the timeline strip |
 * | Front door | 5 | 5 — the forward arrow, and four timeline stops |
 *
 * Nine of the fifteen were timeline stops, which were not refusing anything: *Brief* is the second
 * of four stops, not a button that will not work. Those stopped being buttons. The other six carry
 * a sentence now, and this file is what keeps that true.
 *
 * ## What it asserts, and the one thing it deliberately does not
 *
 * Two clauses per disabled button: it has an **accessible name** (its own text, or an
 * `aria-label` — the front door's arrows had a `›` and nothing else), and it has a **reason** (a
 * `title`, or an `aria-describedby` that resolves to a node that is actually in the document).
 *
 * It does not assert that a disabled button is reachable by keyboard, because it is not: `disabled`
 * takes an element out of the tab order. #262 assigns that half to #239's accessibility sweep, and
 * trading `disabled` for `aria-disabled` would rewrite every `isDisabled()` assertion in this tier
 * for a benefit that is a different issue's to weigh. What is asserted here is the half that
 * reaches everybody: the sentence is on the page, on the control, at the shortest height the
 * stylesheet has a block for.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER, openPage } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

/**
 * 1280 × 720 — the shortest height `packages/viz/index.html` carries a block for, and the viewport
 * GitHub issue #262 measured the rush refusal 184 px below the fold at.
 */
const VIEWPORT = { width: 1280, height: 720 } as const;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /* Its own port — `dev/browserTier.test.ts` asserts no two tier files share one, because
       `strictPort: false` makes a collision fail quietly rather than loudly. 5213 is the next free
       number above the block this tier already claims. */
    server: { port: 5213, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: VIEWPORT });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.everyday-bar-primary');
  return page;
}

/** One disabled button, as the document has it. */
interface DeadControl {
  readonly label: string;
  readonly name: string;
  readonly reason: string;
  /** `false` when `aria-describedby` names an id no element in the document carries. */
  readonly describedByResolves: boolean;
}

/**
 * Every disabled button the Everyday shell has drawn, with what a reader could learn from it.
 *
 * Scoped to the shell's own subtree rather than the document: the Engineer surface is booted,
 * laid out and covered behind it (§ D335), and its controls are not what this file is about.
 */
async function deadControlsOn(page: Page): Promise<readonly DeadControl[]> {
  return page.evaluate(() => {
    const shell = document.querySelector('.everyday-main')?.parentElement;
    if (shell === null || shell === undefined) throw new Error('the Everyday shell is not mounted');
    return [...shell.querySelectorAll('button')]
      .filter((button) => {
        const box = button.getBoundingClientRect();
        return button.disabled && box.width > 0 && box.height > 0;
      })
      .map((button) => {
        const describedBy = button.getAttribute('aria-describedby');
        const target = describedBy === null ? null : document.getElementById(describedBy);
        return {
          label: (button.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 48),
          name: ((button.getAttribute('aria-label') ?? '') + ' ' + (button.textContent ?? ''))
            .replace(/\s+/gu, ' ')
            .trim(),
          reason: `${button.title} ${target?.textContent ?? ''}`.replace(/\s+/gu, ' ').trim(),
          describedByResolves: describedBy === null || target !== null,
        };
      });
  });
}

/**
 * The screens this file drives, and how it gets to each.
 *
 * The four tiles are § 4's four modes; the rail rows are the standalone screens beside them. Every
 * one is reached the way a player reaches it — a click on the thing they would click — rather than
 * by calling `go`, because a screen that can only be entered from a test is a screen this file
 * would be certifying and nobody would be visiting.
 */
const SCREENS: readonly { readonly name: string; readonly enter: string }[] = Object.freeze([
  { name: 'front door', enter: '.everyday-mode[data-screen="door"]' },
  { name: 'all buildings', enter: '.everyday-mode[data-screen="towers"]' },
  { name: 'endless rush', enter: '.everyday-mode[data-screen="rush"]' },
  { name: 'fix a building', enter: '.everyday-mode[data-screen="fixit"]' },
  { name: 'dispatcher workshop', enter: 'nav.everyday-rail button:has-text("Dispatcher workshop")' },
  { name: 'test bench', enter: 'nav.everyday-rail button:has-text("Test bench")' },
  { name: 'design a building', enter: 'nav.everyday-rail button:has-text("Design a building")' },
  { name: 'your week', enter: 'nav.everyday-rail button:has-text("Your week")' },
  { name: 'boards and ladder', enter: 'nav.everyday-rail button:has-text("Boards & ladder")' },
  { name: 'settings', enter: 'nav.everyday-rail button:has-text("Settings")' },
]);

describe.skipIf(!HAS_BROWSER)('a dead control says why, or is not a control', () => {
  it('leaves no disabled button on any Everyday screen without a name and a reason', async () => {
    const page = await coldLoad();
    const offenders: string[] = [];
    let seen = 0;

    const inspect = async (where: string): Promise<void> => {
      for (const control of await deadControlsOn(page)) {
        seen += 1;
        if (control.name === '') offenders.push(`${where}: a disabled button with no name at all`);
        else if (control.reason === '')
          offenders.push(`${where}: "${control.label}" is dead and says nothing about why`);
        else if (!control.describedByResolves)
          offenders.push(`${where}: "${control.label}" points aria-describedby at nothing`);
      }
    };

    await inspect('the main menu');
    for (const screen of SCREENS) {
      await page.click(screen.enter);
      await page.waitForSelector('.everyday-bar-primary');
      /* The screen region is replaced on navigation; one frame settles the mount's first draw. */
      await page.waitForTimeout(400);
      await inspect(screen.name);
      await page.click('nav.everyday-rail button:has-text("Main menu")');
      await page.waitForSelector('.everyday-mode[data-screen="door"]');
    }

    expect(
      offenders,
      'GitHub issue #262: a control a player cannot press must say why, on the control. If the ' +
        'honest answer is that it is not refusing anything — a breadcrumb stop, a label — draw it ' +
        'as something other than a button.',
    ).toEqual([]);

    /*
     * The guard has to be watching something. Eleven screens with no disabled button anywhere
     * would pass every clause above while proving nothing, which is wave 8's fifth false-negative
     * shape; the pre-sweep measurement found fifteen, and the sweep left six.
     */
    expect(seen, 'no disabled button was found anywhere — this guard is watching nothing').toBeGreaterThan(0);
    await page.close();
  }, 180_000);

  it('draws a breadcrumb stop you cannot reach as text rather than as a broken button', async () => {
    /*
     * The other half of the rule, asserted where it bites hardest. The front door is step 1 of 4,
     * so three stops are unreachable and the fourth is where you are: before the sweep all four
     * were `<button disabled>`, which is four controls a screen reader announces and nobody can
     * use. Now the strip holds no button at all until a stop becomes navigable, and the stop you
     * are on says so with `aria-current` rather than only with a colour.
     */
    const page = await coldLoad();
    await page.click('.everyday-mode[data-screen="door"]');
    await page.waitForSelector('.everyday-bar-timeline');

    const strip = await page.$eval('.everyday-bar-timeline', (element) => ({
      stops: [...element.children].filter((child) => child.tagName !== 'SPAN' || /\d/u.test(child.textContent ?? '')).length,
      buttons: element.querySelectorAll('button').length,
      current: [...element.querySelectorAll('[aria-current="step"]')].map(
        (node) => node.textContent ?? '',
      ),
    }));

    expect(strip.buttons, 'no stop is navigable from step 1, so the strip holds no button').toBe(0);
    expect(strip.current).toEqual(['1 Front door']);
    await page.close();
  }, 120_000);
});
