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
 * clause was false on the tree it was written for: `dev/state.ts#drivingProfileOf` composed the run
 * from `levers`, `selectorSpec` and `ruleRows` and never from `dispatcherSpec`, so the printed
 * expression moved for a run that did not. An assertion on it was an assertion on a window
 * statistic wearing a control's clothes — green through every wave in which thirteen sliders and
 * three flags reached nothing.
 *
 * **The clause is true again as of § D886** (GitHub issue #575), and it is deliberately **not**
 * restored as the assertion. `drivingProfileOf` reads the working copy now, so the printed
 * expression and the run really are composed from one map — and an assertion on the printed line
 * would be exactly as green if somebody took the binding out again tomorrow. A sentence being true
 * is not what makes it an instrument; what makes the note below one is that
 * `workshopTravel.test.ts` decides it on the legs and this file only checks the page agrees.
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
  leaveLobbyIfShown,
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

/** A cold load with the Engineer menu settled, then the rail row that opens the workshop's shelf. */
async function openShelf(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 60_000 },
  );
  /* § D1445: a cold launch opens the lobby, which steps the rail aside; *Main menu* brings it back. */
  await leaveLobbyIfShown(page);
  await page.click('.everyday-rail button:has-text("Dispatcher workshop")');
  await page.waitForSelector('.everyday-workshop-shelf');
  return page;
}

/**
 * The shelf, then the editor on the design that is already driving — the card marked *open now*.
 *
 * Every case below the first two is about the editor, and reaches it the way a player does: the
 * workshop's front door is the shelf, and the editor is one press past it.
 */
async function openWorkshop(): Promise<Page> {
  const page = await openShelf();
  await page.click(
    '.everyday-workshop-industry:has(.everyday-workshop-tag:text-is("OPEN NOW")) .everyday-workshop-open',
  );
  await page.waitForSelector('.everyday-workshop-panel');
  return page;
}

/** Set a range input the way a drag does: write the value, then dispatch `input`. */
async function drag(page: Page, value: string): Promise<void> {
  await patience(page).evaluate((node, next) => {
    (node as HTMLInputElement).value = next;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

/** Wait for the nameplate's state line to read exactly this. */
async function stateReads(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (wanted) => document.querySelector('.everyday-workshop-state')?.textContent === wanted,
    text,
    { timeout: 15_000 },
  );
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
  page.locator('.everyday-workshop input[aria-label="Limit the longest wait"]');

/** Open a `<details>` by its summary text, and wait for its body to be in the document. */
async function disclose(page: Page, summary: string, body: string): Promise<void> {
  await page.click(`.everyday-workshop summary:has-text("${summary}")`);
  await page.waitForSelector(body);
}

describe.skipIf(!HAS_BROWSER)('the Everyday dispatcher workshop', () => {
  it('opens from the rail with § 3.3’s workshop row under it', async () => {
    const page = await openShelf();
    expect(await page.textContent('.everyday-workshop h1')).toBe('Your dispatchers, and the industry’s');
    expect(await page.textContent('.everyday-bar-leave')).toBe('⌂ Lobby');
    expect(await page.textContent('.everyday-bar-primary')).toBe('Test simulation');
    // Nothing is withheld: every shipped design is on the shelf, once, and exactly one is open.
    expect(await page.locator('.everyday-workshop-industry').count()).toBe(13);
    expect(await page.locator('.everyday-workshop-tag:text-is("OPEN NOW")').count()).toBe(1);
    // A play style that is a design with a lever pulled is that design's variation.
    expect(await page.textContent('.everyday-workshop-style')).toContain('Lobby anchor');
    expect(await page.textContent('.everyday-workshop-yours-empty')).toContain('Nothing saved yet');

    // One press past the shelf is § 11's editor, under the guide's own title.
    await page.click(
      '.everyday-workshop-industry:has(.everyday-workshop-tag:text-is("OPEN NOW")) .everyday-workshop-open',
    );
    await page.waitForSelector('.everyday-workshop-panel');
    expect(await page.textContent('.everyday-workshop h1')).toBe('Build the thing that decides');
    await page.close();
  }, 120_000);

  /**
   * § 11.1's save, on the page: an industry design is never written, a first save files the
   * player's own and opens it, a replace is asked first, and a delete is asked first.
   */
  it('saves a copy of an industry design as the player’s own, and asks before replacing or deleting', async () => {
    const page = await openShelf();
    await page.click('.everyday-workshop-industry[data-profile-id="fairness-first"] .everyday-workshop-open');
    await page.waitForSelector('.everyday-workshop-panel');
    expect(await page.textContent('.everyday-workshop-state')).toBe('An industry design, as shipped');

    await drag(page, '90');
    await stateReads(page, 'Your copy — not saved yet');
    await page.click('.everyday-workshop-save-primary');
    await stateReads(page, 'Yours — saved');
    expect(await page.inputValue('.everyday-workshop-name')).toBe('Fairness first v2');
    expect(await page.isDisabled('.everyday-workshop-save-primary')).toBe(true);

    // A further change is unsaved, and saving it over the shelf's copy is asked first.
    await drag(page, '60');
    await stateReads(page, 'Yours — unsaved changes');
    await page.click('.everyday-workshop-save-primary');
    expect(await page.textContent('.everyday-workshop-question')).toContain('This replaces the saved');
    await page.click('.everyday-workshop-replace');
    await stateReads(page, 'Yours — saved');

    // Back on the shelf it is the player's own, with its lineage, and the original is untouched.
    await page.click('.everyday-workshop-back');
    await page.waitForSelector('.everyday-workshop-saved');
    expect(await page.textContent('.everyday-workshop-saved')).toContain('based on Fairness first');
    expect(await page.locator('.everyday-workshop-industry').count()).toBe(13);

    await page.click('.everyday-workshop-saved .everyday-workshop-remove');
    expect(await page.textContent('.everyday-workshop-question')).toContain('cannot be brought back');
    expect(await page.locator('.everyday-workshop-saved').count()).toBe(1);
    await page.click('.everyday-workshop-remove-confirm');
    await page.waitForSelector('.everyday-workshop-yours-empty');
    await page.close();
  }, 120_000);

  /**
   * § D1627 clause 5, on the page. This file's address carries `?seed=`, so the day's crowd is not
   * the one a day counts on and the press was not a rehearsal: before the ruling it started the
   * day's own run, which the report could close into the week. It is a sandbox day now, and the
   * tray says so in the two ways it has: the car stays on the design floor, and the subline names
   * the run. Walking off the stage leaves the week with no day begun.
   */
  it('runs a test simulation from the bar: the tray keeps the car on B, and the week is not touched', async () => {
    const page = await openWorkshop();
    try {
      const career = (): Promise<string> =>
        page.evaluate(() => document.querySelector('.everyday-rail-footer')?.textContent ?? '');
      const before = await career();
      await page.click('.everyday-bar-primary');
      await page.waitForSelector('.everyday-stage', { timeout: 60_000 });
      expect(await page.getAttribute('.everyday-rail-floor[aria-current="location"]', 'data-floor')).toBe('B');
      expect(await page.textContent('.everyday-rail-subline')).toContain('TEST SIMULATION');
      /* Back to the bench by its own row: the sandbox is put away and the car has not left the floor. */
      await page.click('.everyday-rail button:has-text("Dispatcher workshop")');
      await page.waitForSelector('.everyday-workshop');
      expect(await page.getAttribute('.everyday-rail-floor[aria-current="location"]', 'data-floor')).toBe('B');
      expect(await page.textContent('.everyday-rail-subline')).not.toContain('TEST SIMULATION');
      expect(await career(), 'the PLAYING AS card reads the week it read before the press').toBe(before);
    } finally {
      await page.close();
    }
  });

  /**
   * The standing requirement, on the page — GitHub issues #296 and #575.
   *
   * The lever is moved by writing the range input and dispatching `input`, which is what a drag
   * produces. Three things then have to be true at once, and the third is the one this case exists
   * for:
   *
   * 1. the printed expression moves — the drawers are two renderings of one vector;
   * 2. the term slider in the drawer below holds the same number — the same fact, from the model;
   * 3. **the § 3.3 note says the edit travels**, because it does.
   *
   * ## Clause 3 has been asserted both ways round, and that is the point of it
   *
   * Only 1 and 2 were asserted before issue #296, and both were green while the footer read
   * *Unsaved changes travel with the run.* — which is exactly how a printed artefact composed from
   * an ignored field passes for a control. #296 added clause 3 pointing the other way: the note had
   * to say the weights *stayed behind*, because `workshopTravel.test.ts` measured them staying,
   * byte-identical at either end of the lever's travel.
   *
   * **§ D886 (issue #575) made them travel**, so this clause is inverted rather than dropped.
   * `dev/state.ts#drivingProfileOf` composes the run's weights out of the working copy now, and the
   * note is derived through `scope/commitment.ts` rather than written on this screen — so the
   * sentence changed itself and this file had to follow it. What the case still holds is that the
   * page's footer and the measured legs are one statement: a screen that bound the lever to a local
   * copy fails 1 and 2, and a screen whose footer disagreed with `workshopTravel.test.ts`'s
   * measurement fails 3, whichever way the measurement came out.
   */
  it('moves the printed cost line when a plain lever moves, and says the edit travels', async () => {
    const page = await openWorkshop();
    await disclose(page, 'Show the maths', '.everyday-workshop-cost-line');
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
     * And the footer. The assertion is on the claim rather than on the exact sentence — a lane
     * rewording the note must not have to edit this file, and a lane that broke the binding and
     * left the note claiming travel must fail here whatever words it used.
     */
    const note = (await page.textContent('.everyday-bar-note')) ?? '';
    expect(note, 'a weights-only edit reaches the run and the footer does not say so').toContain(
      'travel with the run',
    );
    expect(
      note.toLowerCase(),
      'the weights are not a draft since § D886 — drivingProfileOf builds the run from them',
    ).not.toContain('draft');
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
    await disclose(page, 'Show the maths', '.everyday-workshop-cost-line');
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

  it('opens another design from the shelf, asking first when that discards unsaved changes', async () => {
    const page = await openWorkshop();
    await disclose(page, 'Show the maths', '.everyday-workshop-cost-line');
    const before = await page.textContent('.everyday-workshop-cost-line');

    // An unsaved change is standing, so the shelf asks before it opens anything over it.
    await drag(page, '70');
    await stateReads(page, 'Your copy — not saved yet');
    await page.click('.everyday-workshop-back');
    const fairness = '.everyday-workshop-industry[data-profile-id="fairness-first"]';
    await page.click(`${fairness} .everyday-workshop-open`);
    expect(await page.textContent(`${fairness} .everyday-workshop-question`)).toContain(
      'has unsaved changes',
    );
    await page.click(`${fairness} .everyday-workshop-discard`);
    await page.waitForFunction(
      (was) => document.querySelector('.everyday-workshop-cost-line')?.textContent !== was,
      before,
      { timeout: 15_000 },
    );
    expect(await page.textContent('.everyday-workshop-cost-line')).toContain('starvation');
    expect(await page.textContent('.everyday-workshop-nameplate')).toContain('Fairness first');
    await page.close();
  }, 120_000);

  /**
   * The editor is one call, start to finish: a card per stage, each headed by what the dispatcher
   * does there, and at *Detailed* the simulator's own controls for that stage. A control moved
   * there has to move the sentence, or the sentence is describing some other dispatcher.
   */
  it('reads each stage back, and rewrites the sentence when a Detailed control moves', async () => {
    const page = await openShelf();
    await page.click('.everyday-workshop-industry[data-profile-id="predictive-balanced"] .everyday-workshop-open');
    await page.waitForSelector('.everyday-workshop-stage');
    expect(await page.locator('.everyday-workshop-stage').count()).toBe(8);
    const deciding = '.everyday-workshop-stage[data-stage="deciding"] .everyday-workshop-readback-stage';
    expect(await page.textContent(deciding)).toContain('holds a call for 1.5 s');
    // Simple draws no schema block; the settings are in force and the sentences say what they are.
    expect(await page.locator('.everyday-workshop-family-block').count()).toBe(0);

    await page.click('.everyday-workshop-depth [data-depth="detailed"]');
    await page.waitForSelector('.everyday-workshop-family-block[data-family="timing"]');
    expect(await page.locator('.everyday-workshop-family-caller').count()).toBe(0);
    // Detailed calls a setting by a plain name and keeps the simulator's field name on its title.
    const timing = '.everyday-workshop-family-block[data-family="timing"] .control[data-parameter="dispatch.batchWindowS"] .control-label';
    expect(await page.textContent(timing)).not.toMatch(/[a-z][A-Z]/u);
    expect(await page.getAttribute(timing, 'title')).toBe('batchWindowS');
    await page.selectOption(
      '.everyday-workshop-family-block[data-family="timing"] select[data-parameter="dispatch.assignmentTiming"]',
      'immediate',
    );
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.textContent?.includes('the moment the call is made') === true,
      deciding,
      { timeout: 15_000 },
    );
    await stateReads(page, 'Your copy — not saved yet');

    // Engineer adds what reads each block on a real run.
    await page.click('.everyday-workshop-depth [data-depth="engineer"]');
    await page.waitForSelector('.everyday-workshop-family-caller');
    expect(await page.textContent(timing)).toBe('batchWindowS');

    /*
     * Engineer is also where a priority of the player's own is written: a formula over the same
     * terms the sliders weigh. Writing one, changing its operation and saving it is a change to
     * the dispatcher like any other, and it is still said at Simple once it exists.
     */
    expect(await page.textContent('.everyday-workshop-formulas-empty')).toContain('None written');
    await page.click('.everyday-workshop-formula-add');
    await page.waitForSelector('.everyday-workshop-formula');
    expect(await page.textContent('.everyday-workshop-formula-readback')).toContain(
      'Reads as: how bad these are together:',
    );
    await page.selectOption('.everyday-workshop-formula-op', 'max');
    await page.waitForFunction(
      () =>
        document.querySelector('.everyday-workshop-formula-readback')?.textContent?.includes('whichever is worse of') ===
        true,
      undefined,
      { timeout: 15_000 },
    );
    await page.click('.everyday-workshop-formula-more');
    await page.waitForFunction(() => document.querySelectorAll('.everyday-workshop-formula-term').length === 3);
    await page.click('.everyday-workshop-depth [data-depth="simple"]');
    await page.waitForFunction(() => document.querySelector('.everyday-workshop-formula-op') === null);
    expect(await page.textContent('.everyday-workshop-formula-readback')).toContain('whichever is worse of');
    await page.close();
  }, 120_000);

  /**
   * The test bed, on the page: the working copy runs **unsaved** against a rival, and what comes
   * back is the batch report's own comparison — a word per measure and never a score.
   *
   * Ten runs, which the dock itself says is too few to tell anything apart. That is the point of
   * using it here: the case is about the seam, and the budget note is part of what it checks.
   */
  it('proves an unsaved working copy against a rival on matched runs', async () => {
    const page = await openWorkshop();
    await drag(page, '90');
    await stateReads(page, 'Your copy — not saved yet');
    // A building with enough riders to measure at the dock's default flow.
    await page.selectOption('#everyday-workshop-bed-building', 'midtown-office');
    await page.selectOption('#everyday-workshop-bed-runs', '10');
    await page.waitForSelector('.everyday-workshop-bed-budget');
    await page.click('.everyday-workshop-bed-run');
    await page.waitForSelector('.everyday-workshop-bed-result', { timeout: 90_000 });

    expect(await page.textContent('.everyday-workshop-bed-result')).toContain('10 runs');
    const words = await page.$$eval('.everyday-workshop-bed-result > .everyday-workshop-bed-row .everyday-workshop-bed-word', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(words).toHaveLength(5);
    // Energy is drawn and never ranked — § D106, on this dock as everywhere.
    expect(words).toContain('SHOWN, NOT RANKED');
    // Nothing was saved to run it.
    expect(await page.textContent('.everyday-workshop-state')).toBe('Your copy — not saved yet');

    // A result is about the dispatcher it ran; changing that says so.
    await drag(page, '20');
    await page.waitForSelector('.everyday-workshop-bed-stale');
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

    // A row can require more than one thing: each “and…” adds a condition, up to core's bound,
    // and the readback says the row as one sentence.
    await page.click('.everyday-workshop-and-add');
    await page.waitForSelector('.everyday-workshop-and');
    expect(await page.textContent('.everyday-workshop-readback')).toMatch(/Reads as: when .+ and .+, /u);
    await page.click('.everyday-workshop-and-add');
    await page.waitForFunction(() => document.querySelectorAll('.everyday-workshop-and').length === 2);
    expect(await page.locator('.everyday-workshop-and-add').count()).toBe(0);
    await page.click('.everyday-workshop-and-drop');
    await page.waitForFunction(() => document.querySelectorAll('.everyday-workshop-and').length === 1);
    expect(await page.locator('.everyday-workshop-and-add').count()).toBe(1);
    await page.close();
  }, 120_000);

  it('draws the switching block inert under one-setting-all-shift, and says why', async () => {
    const page = await openWorkshop();
    expect(await page.textContent('.everyday-workshop-switching-inert')).toContain(
      'Nothing below this line reaches the run',
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
