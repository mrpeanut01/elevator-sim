/**
 * **The dispatcher workshop, driven on the page** — the wirings a node test cannot vouch for.
 *
 * The one that matters is the standing requirement, pointed at a slider: *move the control and
 * require the run to change*. `workshopModel.test.ts` asks it of the model; this asks it of the
 * **page**, which is where § D219's five-select editor would have passed every other check. A
 * lever is dragged, and the printed cost line — composed by `costFunctionLine` from the same
 * `weights` map `profileFromSpec` writes into the next run — has to move with it, and the term
 * slider in the drawer below has to be holding the same number.
 *
 * The rest is the disclosure ladder as a player meets it: the drawers announce their contents and
 * survive a redraw (§ 16 rule 13), the maths disclosure puts its plain sentence above its symbols
 * and its symbols above the line (rule 12), and pressing a style card replaces the working copy.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5212, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

/** A cold load with the Engineer menu settled, then the rail row that opens § 11's screen. */
async function openWorkshop(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 60_000 },
  );
  await page.click('.everyday-rail button:has-text("Dispatcher workshop")');
  await page.waitForSelector('.everyday-workshop');
  return page;
}

/**
 * The workshop's own patience slider.
 *
 * Scoped to `.everyday-workshop`, and the scoping is load-bearing rather than tidy: the Engineer
 * dispatcher panel is **still in the document** behind the shell's cover and carries a slider with
 * the identical `aria-label` (both read `mode/plainLevers.ts`'s words, which is the property this
 * whole lane is built on). An unscoped locator matches both, and the one it would have driven is
 * not the one this file is about.
 */
const patience = (page: Page) =>
  page.locator('.everyday-workshop input[aria-label="How long anyone should wait"]');

/** Open a `<details>` by its summary text, and wait for its body to be in the document. */
async function disclose(page: Page, summary: string, body: string): Promise<void> {
  await page.click(`.everyday-workshop summary:has-text("${summary}")`);
  await page.waitForSelector(body);
}

describe.skipIf(!HAS_BROWSER)('the Everyday dispatcher workshop', () => {
  it('opens from the rail with § 3.3’s workshop row under it', async () => {
    const page = await openWorkshop();
    expect(await page.textContent('.everyday-workshop h1')).toBe('Build the thing that decides');
    expect(await page.textContent('.everyday-bar-leave')).toBe('⌂ Modes');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Run a day with this');
    // The style cards are the shipped `playStyles` block, under their own names.
    expect(await page.textContent('.everyday-workshop-style')).toContain('Steady hand');
    // Nothing is withheld: the rest of the shelf is on the panel under its own heading.
    expect(await page.locator('.everyday-workshop-library').count()).toBeGreaterThan(0);
    await page.close();
  }, 120_000);

  /**
   * The standing requirement, on the page.
   *
   * The lever is moved by writing the range input and dispatching `input`, which is what a drag
   * produces; the assertion is on the **printed expression**, because that is the artefact a
   * player reads and it is composed from the weights the run is built from. A screen that had
   * bound the lever to a local copy would pass every other case in this file and fail this one.
   */
  it('moves the printed cost line when a plain lever moves, and the term slider agrees', async () => {
    const page = await openWorkshop();
    await disclose(page, 'show me the maths', '.everyday-workshop-cost-line');
    const before = await page.textContent('.everyday-workshop-cost-line');

    await patience(page).fill('64');
    await patience(page).dispatchEvent('input');
    await page.waitForFunction(
      (was) => document.querySelector('.everyday-workshop-cost-line')?.textContent !== was,
      before,
      { timeout: 15_000 },
    );

    const after = await page.textContent('.everyday-workshop-cost-line');
    expect(after).not.toBe(before);
    expect(after).toContain('0.64·starvation');

    /* The echo names the field the press wrote, from the current view rather than a memory. */
    expect(await page.textContent('.everyday-workshop-echo')).toContain('weights.starvation');

    /* And the other drawer holds the same number — two renderings of one vector. */
    await disclose(page, 'cost terms', '.everyday-workshop-term');
    const slider = page.locator('.everyday-workshop .everyday-workshop-term input[data-term-id="starvation"]');
    expect(await slider.inputValue()).toBe('64');
    await page.close();
  }, 120_000);

  it('announces the drawer with counts it derives, and moves them when a weight moves', async () => {
    const page = await openWorkshop();
    const summary = page.locator('.everyday-workshop summary:has-text("cost terms")');
    const before = (await summary.textContent()) ?? '';
    // `collective` weights one term of thirteen; both numbers are counted, never written.
    expect(before).toMatch(/^the \d+ cost terms — \d+ weighted$/);

    await patience(page).fill('40');
    await patience(page).dispatchEvent('input');
    await page.waitForFunction(
      (was) =>
        [...document.querySelectorAll('summary')].some(
          (node) => /cost terms/.test(node.textContent ?? '') && node.textContent !== was,
        ),
      before,
      { timeout: 15_000 },
    );
    expect(await summary.textContent()).not.toBe(before);
    await page.close();
  }, 120_000);

  it('discloses the maths in rule 12’s order — sentence, symbols, then the line', async () => {
    const page = await openWorkshop();
    await disclose(page, 'show me the maths', '.everyday-workshop-cost-line');
    const order = await page.evaluate(() => {
      const box = document.querySelector('.everyday-workshop-maths');
      const nodes = [...(box?.querySelectorAll('*') ?? [])];
      const at = (selector: string): number =>
        nodes.findIndex((node) => node.matches(selector));
      return {
        plain: at('.everyday-workshop-maths-plain'),
        symbol: at('.everyday-workshop-symbol'),
        line: at('.everyday-workshop-cost-line'),
        signs: at('.everyday-workshop-signs'),
      };
    });
    expect(order.plain).toBeGreaterThanOrEqual(0);
    expect(order.plain).toBeLessThan(order.symbol);
    expect(order.symbol).toBeLessThan(order.line);
    expect(order.line).toBeLessThan(order.signs);
    // The sign sentence is this engine's, not the prototype's: every term is a cost.
    expect(await page.textContent('.everyday-workshop-signs')).toContain('added together');
    await page.close();
  }, 120_000);

  it('keeps a disclosure open across the redraw a control causes — § 16 rule 13', async () => {
    const page = await openWorkshop();
    await disclose(page, 'cost terms', '.everyday-workshop-term');
    await patience(page).fill('22');
    await patience(page).dispatchEvent('input');
    await page.waitForTimeout(200);
    expect(await page.locator('.everyday-workshop-terms[open]').count()).toBe(1);
    await page.close();
  }, 120_000);

  it('replaces the working copy when a style card is pressed', async () => {
    const page = await openWorkshop();
    await disclose(page, 'show me the maths', '.everyday-workshop-cost-line');
    const before = await page.textContent('.everyday-workshop-cost-line');

    await page.click('.everyday-workshop-style[data-style-id="chase-the-longest-wait"]');
    await page.waitForFunction(
      (was) => document.querySelector('.everyday-workshop-cost-line')?.textContent !== was,
      before,
      { timeout: 15_000 },
    );
    expect(await page.textContent('.everyday-workshop-cost-line')).toContain('starvation');
    expect(await page.textContent('.everyday-workshop-nameplate')).toContain('Fairness first');
    await page.close();
  }, 120_000);

  it('offers only the actions the model declares — the two § 11.5 omits are unbuildable', async () => {
    const page = await openWorkshop();
    await page.click('.everyday-workshop-rule-add');
    await page.waitForSelector('.everyday-workshop-then');
    const options = await page.$$eval('.everyday-workshop-then option', (nodes) =>
      nodes.map((node) => (node as HTMLOptionElement).value),
    );
    expect(options).toHaveLength(8);
    expect(options).not.toContain('skip-above');
    expect(options).not.toContain('up-calls-urgent');
    // Every row says what it reads as, and which lever it moves.
    expect(await page.textContent('.everyday-workshop-readback')).toContain('Reads as:');
    expect(await page.textContent('.everyday-workshop-rule-lever')).toContain('moves ');
    await page.close();
  }, 120_000);

  it('draws the switching block inert under one-setting-all-shift, and says why', async () => {
    const page = await openWorkshop();
    expect(await page.textContent('.everyday-workshop-switching-inert')).toContain(
      'never builds the detector',
    );
    const disabled = await page.$$eval('.everyday-workshop-detector input', (nodes) =>
      nodes.every((node) => (node as HTMLInputElement).disabled),
    );
    expect(disabled).toBe(true);

    await page.click('.everyday-workshop-toggle:has-text("Watch the traffic and change")');
    await page.waitForFunction(
      () => document.querySelector('.everyday-workshop-switching-inert') === null,
      undefined,
      { timeout: 15_000 },
    );
    const live = await page.$$eval('.everyday-workshop-detector input', (nodes) =>
      nodes.every((node) => !(node as HTMLInputElement).disabled),
    );
    expect(live).toBe(true);
    await page.close();
  }, 120_000);
});
