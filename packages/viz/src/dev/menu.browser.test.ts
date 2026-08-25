/**
 * One press, after typing — GitHub issue #106, driven by a real pointer.
 *
 * ## Why this tier and not the one next door
 *
 * `dev/menuPanel.test.ts` can see the mechanism: it watches what a redraw does to its own children
 * and requires that the button a pointer is standing on is neither removed nor moved. What it
 * cannot see is the consequence, because it fires handlers by reaching into a `Map` — so a
 * **detached** node's click handler runs there exactly as a live one's does, and the whole of this
 * defect is that a browser declines to call it at all. Its own docstring says why: *"there is no
 * window, no layout, no event dispatch and no selector engine."*
 *
 * So the claim *the first press works* is only answerable here, and answering it needs the three
 * things a document recorder is not: a real `mousedown` that blurs the field, a real `change` fired
 * by that blur, and a real browser deciding whether the `mouseup` that follows is a click.
 *
 * ## What is driven, and why it is Free play rather than the account screen
 *
 * The issue reports the account screen, and the account screen's submit asks a **server** for a
 * sign-in link. This deployment has none — `dev/main.ts` builds a client only when the page carries
 * an origin — so the observable there would be a notice, and `updateForm` moves notices about for
 * reasons of its own. Free play has the same shape and a consequence nothing else can produce: a
 * text field (Seed), a `commit` row beside it (Start), and pressing Start closes the overlay and
 * runs a shift. The defect is the panel's, not the screen's, and this is the screen where landing
 * the press is unambiguous.
 *
 * § D220 § 4 forbids a browser test asserting a metric. Nothing here asserts one: what is measured
 * is whether an overlay is up.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, MENU_CONTROL_ATTR, enterEngineerStage, openPage, pressMenuRow, reopenEngineerMenu } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, and `strictPort: false` so it moves rather than throws — the files in this
    // project run concurrently and would otherwise fight over one port. It said *three* for as long
    // as three was true; the tier is **26** files now, and the rule is no longer kept by anybody
    // counting: `browserTier.test.ts` derives it — every file names a port, none says `port: 0`, and
    // no two name the same one. That third clause found eleven files across five collisions.
    server: { port: 5191, strictPort: false },
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

/**
 * The Free play screen, reached the way a player reaches it: through the menu.
 *
 * By affordance id since issue #142. These two presses were green on `main` and were **one setting
 * away from the three files that were not**: `hasText: 'Free play'` matches whatever the overlay's
 * whole `textContent` happens to contain, and in Engineer mode the recommended row above this one
 * reads *"Free play is a single run you set yourself — six axes, then Start"*. Casual is the shipped
 * default (`dev/state.ts`), so this file passed on the arm that does not collide and would have gone
 * red the day a test — or a remembered preference — opened the menu in the other one.
 */
async function openFreePlay(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}?seed=20260807`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  // The page opens on Everyday Mode now; this is the player's way to the Engineer surface.
  await enterEngineerStage(page);
  // The Engineer menu is dismissed at boot now, so this walk has to reopen it first.
  await reopenEngineerMenu(page);
  await pressMenuRow(page, 'main.free-play');
  await page.locator('.menu-overlay .menu-text input').first().waitFor({ timeout: 10_000 });
  return page;
}

/** Whether the menu is still covering the page. */
async function menuIsUp(page: Page): Promise<boolean> {
  return page.locator('.menu-overlay').first().isVisible();
}

describe.skipIf(!HAS_BROWSER)('a field commit does not swallow the press beside it', () => {
  it('starts the run on the first click after typing a seed', async () => {
    /*
     * The reporter's steps with the screen swapped: type into a field, then press the button once.
     * Before the fix the `mousedown` blurred the field, the blur fired `change`, the commit redrew
     * the overlay with `replaceChildren`, and by `mouseup` the button had been out of the document
     * — so Chrome dispatched no click and the menu simply sat there.
     *
     * `click()` is one press: Playwright moves, presses and releases, which is exactly the sequence
     * the defect lives in. Nothing here retries.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260106');
    expect(await menuIsUp(page), 'typing a seed closed the menu on its own').toBe(true);

    await pressMenuRow(page, 'free-play.start');
    await page.waitForTimeout(1_500);

    expect(
      await menuIsUp(page),
      'the first press of Start after typing a seed did nothing — the redraw the field commit ' +
        'caused took the button out of the document between mousedown and mouseup',
    ).toBe(false);
    await page.close();
  }, 120_000);

  it('keeps the caret where the reader put it, one keystroke at a time — issue #111(a)', async () => {
    /*
     * **The property that made per-keystroke validation safe to add, observed rather than argued.**
     *
     * Issue #111(a) makes this overlay redraw on **every keystroke**: the Seed field now commits on
     * `input` as well as `change`, because `change` fires on blur and the state was therefore one
     * commit behind the box — Start refused a valid seed until the reader clicked elsewhere.
     *
     * What this pins is **retention**, and it was watched failing to establish that rather than
     * assumed. With `menuPanel.ts#retainer` forced to build a fresh element on every draw, this
     * case reports `expected '202604' to be '20269904'`: the two characters typed into the middle
     * reached nothing at all, because the element being typed into stopped existing between
     * keystrokes. *Tab out of the field reaches Start* fails in the same run.
     *
     * It does **not** pin `textRow`'s `if (input.value !== spec.value)` guard, and saying so is the
     * point of this paragraph. That guard's stated reason — *assigning `value` moves the caret even
     * when the string is unchanged* — is false: HTML's value setter moves the cursor only when the
     * value differs, and Chromium implements it (measured: `202604`, caret at 4, re-assigned
     * `'202604'`, caret still 4). Removing the guard leaves this case green. It is kept for the
     * case that would break it — a reducer that normalises what it is handed — and `menuPanel.ts`
     * now says that rather than the invented mechanism.
     *
     * Typed into the **middle**, which is the only place any of this is visible: appending to the
     * end produces the same string either way, which is exactly why the three cases around this one
     * cannot see it.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('202604');
    // Between the `6` and the `0` — four characters in, so a caret that survives inserts there and
    // a caret that has been reset appends.
    await seed.evaluate((node: HTMLInputElement) => {
      node.setSelectionRange(4, 4);
    });
    await page.keyboard.type('99');

    expect(
      await seed.inputValue(),
      'the caret was thrown to the end of the field by the redraw the keystroke caused, so the ' +
        'middle of a seed cannot be corrected',
    ).toBe('20269904');
    await page.close();
  }, 120_000);

  it('starts it on Enter in the field, without a pointer at all', async () => {
    /*
     * The keyboard half. The menu builds no `<form>`, so Enter in a text field had nothing to do:
     * the overlay's own keydown handler owns Escape and Tab, and the submit is a
     * `<button type="button">` with a click listener. A player who typed a seed and pressed Enter
     * met silence on the one screen whose whole purpose is to start something.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260107');
    await seed.press('Enter');
    await page.waitForTimeout(1_500);

    expect(await menuIsUp(page), 'Enter in the seed field started nothing').toBe(false);
    await page.close();
  }, 120_000);

  it('lets Tab out of the field reach the button, which Enter then presses', async () => {
    /*
     * The trap the swallowed click hid behind. `change` fires during a blur, and during a blur
     * `document.activeElement` is the body — which looked to `restoreFocus` exactly like a dialog
     * that had just opened, so it pulled the reader to `controls[0]`. On this screen that is the
     * top of the list, and on the account screen it is the field they were leaving: Tab out, land
     * back in, with no keyboard route to the button at all.
     */
    const page = await openFreePlay();
    const seed = page.locator('.menu-overlay .menu-text input').first();
    await seed.click();
    await seed.fill('');
    await seed.type('20260108');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    /*
     * The affordance's own id rather than the label it wears. `.toContain('Start')` was satisfied by
     * *Start here* as much as by *Start* — two different rows on two different screens — so the
     * looser reading could have passed on focus landing somewhere nobody asked for. It is issue
     * #142's lesson one line over, applied to an assertion instead of to a selector.
     */
    const landed = await page.evaluate(
      (attribute: string) => document.activeElement?.getAttribute(attribute) ?? '',
      MENU_CONTROL_ATTR,
    );
    expect(
      landed,
      'Tab out of the seed field did not reach Start — the commit its blur caused took the focus ' +
        'back to the top of the screen',
    ).toBe('free-play.start');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(1_500);
    expect(await menuIsUp(page), 'Enter on the focused Start did nothing').toBe(false);
    await page.close();
  }, 120_000);
});
