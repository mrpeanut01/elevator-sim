/**
 * **The rush setup, the drawing board and the tuner, driven on the page.**
 *
 * Three things a node tier cannot vouch for, one per screen:
 *
 * 1. **The rush tile now opens**, and its § 3.3 primary is drawn *disabled* rather than live over
 *    an engine that does not exist. A model test can assert `inert`; only a page proves the shell
 *    draws it as a button nobody can press.
 * 2. **The designer's controls reach the closed form through the mount.** The specification block is
 *    re-derived on every edit, so moving *Shafts* must move the printed interval — the standing
 *    requirement, checked on the drawn figure rather than on an internal field.
 * 3. **The tuner is reachable by nothing.** § 3.2 forbids a rail row and names its two doors as the
 *    brief and the report, neither of which is built — so what this tier can honestly say about it
 *    is that no control opens it, which is the § 3.2 rule and the gap in one assertion. Its seven
 *    controls are driven without a document in `tunerModel.test.ts`.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    server: { port: 5201, strictPort: false },
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** A rail row, by its § 3.2 label — the rows carry no class of their own. */
async function railRow(page: Page, label: string): Promise<void> {
  await page.click(`nav.everyday-rail button:has-text("${label}")`);
}

describe.skipIf(!HAS_BROWSER)('the Endless rush setup screen', () => {
  it('opens from the menu tile and draws § 9.1’s bands off the ramp', async () => {
    const page = await coldLoad();
    await page.click('.everyday-mode[data-screen="rush"]');
    await page.waitForSelector('.everyday-rush');

    expect(await page.textContent('.everyday-rush h1')).toBe('How long can it hold?');
    // Five bands, each with the rate the contract's expression gives it — a figure, not a word.
    expect(await page.$$eval('.everyday-rush-band', (rows) => rows.length)).toBe(5);
    const rates = await page.$$eval('.everyday-rush-band-rate', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(rates).toHaveLength(5);
    for (const rate of rates) expect(rate).toMatch(/a minute · [\d.]+× wave 1/);

    // § 20.5's line, in both registers: the words, and the figure beside them.
    expect(await page.textContent('.everyday-rush-hold')).toContain('over two minutes');
    expect(await page.textContent('.everyday-rush-hold-figure')).toBe('120 s × 40 people');
    await page.close();
  });

  it('draws `Start the rush` disabled, with the refusal on the control', async () => {
    const page = await coldLoad();
    await page.click('.everyday-mode[data-screen="rush"]');
    await page.waitForSelector('.everyday-rush');

    // § 3.3's cells: the rush's own left button, its primary, its note — and no timeline.
    expect(await page.textContent('.everyday-bar-leave')).toBe('⤺ Leave the rush');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Start the rush');
    expect(await page.$eval('.everyday-bar-primary', (b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(await page.$('.everyday-bar-timeline')).toBeNull();
    // And the reason is a sentence a player reads, not only a tooltip.
    expect(await page.textContent('.everyday-rush-refusal')).toMatch(/not built/);
    await page.close();
  });
});

describe.skipIf(!HAS_BROWSER)('Design a building', () => {
  it('re-derives the specification block when a control moves', async () => {
    const page = await coldLoad();
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer');

    const intervalOf = async (): Promise<string> =>
      (await page.$$eval('.everyday-designer-figure', (cells) => {
        const cell = cells.find((node) => node.textContent?.includes('Interval'));
        return cell?.querySelector('.everyday-designer-figure-value')?.textContent ?? '';
      })) ?? '';

    const before = await intervalOf();
    expect(before).toMatch(/^[\d.]+ s$/);

    /*
     * *Shafts* — the last slider in the § 13.3 building panel. Moving it re-runs `analyzeUpPeak`
     * over the drawn spec, so the printed interval must move: more cars over the same round trip
     * is a shorter interval, which is the one thing the closed form is certain about.
     */
    await page.$$eval('.everyday-designer-building input[type="range"]', (inputs) => {
      const shafts = inputs.at(-1) as HTMLInputElement | undefined;
      if (shafts === undefined) throw new Error('no shafts slider');
      shafts.value = String(Number(shafts.value) + 4);
      shafts.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const after = await intervalOf();
    expect(after).not.toBe(before);
    expect(Number.parseFloat(after)).toBeLessThan(Number.parseFloat(before));
    await page.close();
  });

  it('offers rated speed as steps within the class, and moves both when the class changes', async () => {
    const page = await coldLoad();
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer');

    const steps = await page.$$eval('.everyday-designer-step', (chips) =>
      chips.map((chip) => chip.textContent ?? ''),
    );
    expect(steps.length).toBeGreaterThan(1);
    // § 10.1: steps, never a free number — every speed chip is a catalogue value in m/s.
    expect(steps.some((chip) => /m\/s$/.test(chip))).toBe(true);

    // Picking the hydraulic class narrows both ladders and re-prints the plate's class row.
    await page.click('.everyday-designer-class:has-text("Hydraulic")');
    expect(await page.textContent('.everyday-designer-plate')).toContain('Hydraulic');
    /*
     * Then take the tower past the class. Hydraulic is rated to six floors and eighteen metres, so
     * a thirty-storey draw raises § 10's first warning — and the guide requires it to name **both**
     * numbers: what the design is, and what the class is rated for.
     */
    await page.$$eval('.everyday-designer-building input[type="range"]', (inputs) => {
      const floors = inputs[0] as HTMLInputElement | undefined;
      if (floors === undefined) throw new Error('no floors slider');
      floors.value = '30';
      floors.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const warning = await page.textContent('.everyday-designer-warning-class');
    expect(warning).toMatch(/30 floors is past what Hydraulic is built for/);
    expect(warning).toContain('rated to 6');
    await page.close();
  });

  it('says nothing here is scored, and names what the board does not do', async () => {
    const page = await coldLoad();
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer');
    expect(await page.textContent('.everyday-bar-note')).toBe(
      'Nothing here is scored. It is a drawing board.',
    );
    expect(await page.textContent('.everyday-bar-primary')).toBe('Run a day in it');
    expect(await page.$$eval('.everyday-designer-absences li', (items) => items.length)).toBeGreaterThan(
      2,
    );
    await page.close();
  });
});

describe.skipIf(!HAS_BROWSER)('Tune the tower', () => {
  /*
   * **The tuner has no shipped door in this build, and that is what these two cases pin.**
   *
   * § 3.2 forbids a rail row — *it is a thing you do to a day, not a place you live* — and names its
   * two entrances: the brief's *Take it to the sandbox* and the report's third lever. Neither screen
   * exists, so the screen is registered, routable and reachable by no control. That gap is named in
   * `shell.ts`'s `EVERYDAY_SHELL_ABSENCES` rather than closed with a rail row this section forbids,
   * and it is the reason the tuner's mount is driven by nothing on the page: a browser case that
   * reached it would have to reach past the product, which is the thing this tier exists not to do.
   *
   * So what is checked here is the rule and the gap. The screen's own behaviour — the seven
   * controls, what each writes, the sandbox strip and § 3.3's two-state note — is in
   * `tunerModel.test.ts`, driven without a document.
   */
  it('is not a rail item — § 3.2 says so, and an earlier draft of the guide had it wrong', async () => {
    const page = await coldLoad();
    const labels = await page.$$eval('nav.everyday-rail button', (rows) =>
      rows.map((row) => row.textContent ?? ''),
    );
    expect(labels.some((label) => label.includes('Tune the tower'))).toBe(false);
    // The designer is one, in the same DESIGN group, so the absence above is a decision rather
    // than a rail that lost its rows.
    expect(labels.some((label) => label.includes('Design a building'))).toBe(true);
    await page.close();
  });

  it('is not on a mode tile either, so no control opens it in this build', async () => {
    const page = await coldLoad();
    const tiles = await page.$$eval('.everyday-mode', (nodes) =>
      nodes.map((node) => node.getAttribute('data-screen') ?? ''),
    );
    expect(tiles).not.toContain('tuner');
    await page.close();
  });
});
