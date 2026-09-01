/**
 * **The dispatcher workshop, driven on the page** — the wirings a node test cannot vouch for.
 *
 * The one that matters is the standing requirement, pointed at a slider: *move the control and
 * require the run to change*. `workshopTravel.test.ts` asks that of the **legs**, which is the only
 * comparison § D177 accepts and which no case in this file may make (§ D220 § 4 — *no metric is
 * read* — and a legs comparison is a run read off the page). What this file asks of the **page** is
 * the other half: that the screen's own account of the edit agrees with what that measurement
 * found. Between them they are the requirement in both of its directions.
 *
 * **The sentence above used to end differently, and it was the reason issue #296 shipped.** It said
 * the printed cost line was *"composed by `costFunctionLine` from the same `weights` map
 * `profileFromSpec` writes into the next run"*, and the case below asserted on that line alone. The
 * clause is false: `dev/state.ts#drivingProfileOf` composes the run from `levers`, `selectorSpec`
 * and `ruleRows` and never from `dispatcherSpec`, so the printed expression moves for a run that
 * does not. An assertion on it was an assertion on a window statistic wearing a control's clothes —
 * green through every wave in which thirteen sliders and three flags reached nothing.
 *
 * The two drawers agreeing is still asserted, because it is still true and still worth keeping: a
 * lever and a term slider are two renderings of one vector. What is asserted **beside** it now is
 * the § 3.3 note, which is the thing a player actually reads about where their edit went.
 *
 * The rest is the disclosure ladder as a player meets it: the drawers announce their contents and
 * survive a redraw (§ 16 rule 13), the maths disclosure puts its plain sentence above its symbols
 * and its symbols above the line (rule 12), and pressing a style card replaces the working copy.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5212, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** A cold load with the Engineer menu settled, then the rail row that opens § 11's screen. */
async function openWorkshop(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
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
   * The standing requirement, on the page — the disclosure half, GitHub issue #296.
   *
   * The lever is moved by writing the range input and dispatching `input`, which is what a drag
   * produces. Three things then have to be true at once, and the third is the one this case exists
   * for:
   *
   * 1. the printed expression moves — the drawers are two renderings of one vector;
   * 2. the term slider in the drawer below holds the same number — the same fact, from the model;
   * 3. **the § 3.3 note says the weights stay behind**, because they do. `workshopTravel.test.ts`
   *    measured that on the legs at `midtown-office`, 900 s, seed 20260827, `collective`: the
   *    patience lever writes `weights.starvation` on `viewer.dispatcherSpec`, and the run is
   *    byte-identical at either end of its travel.
   *
   * Only 1 and 2 were asserted before, and both were green while the footer read *Unsaved changes
   * travel with the run.* — which is exactly how a printed artefact composed from an ignored field
   * passes for a control. A screen that bound the lever to a local copy still fails 1 and 2; a
   * screen that told the truth about neither now fails 3.
   */
  it('moves the printed cost line when a plain lever moves, and says the weights stay behind', async () => {
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

    /*
     * And the footer, which is the half that was missing. The assertion is on the claim rather than
     * on the exact sentence — a lane rewording the note must not have to edit this file, and a lane
     * that made it claim travel again must fail here whatever words it used.
     */
    const note = (await page.textContent('.everyday-bar-note')) ?? '';
    expect(note, 'a weights-only edit is still being described as travelling with the run').not.toContain(
      'travel with the run',
    );
    expect(note.toLowerCase()).toContain('draft');
    await page.close();
  }, 120_000);

  /**
   * The other direction, which is the half issue #296 does not name and § D227 rates as worse.
   *
   * *Keep a car downstairs* writes `GroupLevers.parking`, which `drivingProfileOf` does read — it is
   * the one lever of the four whose move really does change the run, measured in
   * `workshopTravel.test.ts`. The boolean this screen used to select its note with was
   * `ruleRows.length > 0 || specIsDirty(workingSpec, source)`, which does not consult `levers` at
   * all, so pressing this toggle left the footer reading *Nothing changed yet.* about the only edit
   * that had landed. A bar that denies a real change is the stale refusal aimed at the working
   * control, and it sends a player to look for a broken toggle.
   */
  it('says a group lever travels, which the old note called nothing changed', async () => {
    const page = await openWorkshop();
    const before = (await page.textContent('.everyday-bar-note')) ?? '';
    expect(before).toContain('Nothing changed yet');

    await page.click('.everyday-workshop-lever:has-text("Keep a car downstairs") button');
    await page.waitForFunction(
      (was) => document.querySelector('.everyday-bar-note')?.textContent !== was,
      before,
      { timeout: 15_000 },
    );

    expect(
      await page.textContent('.everyday-bar-note'),
      'the lobby lever changes the run and the footer still says nothing changed',
    ).toContain('travel with the run');
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
