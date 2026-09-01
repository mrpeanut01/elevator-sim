/**
 * **Build a dispatcher, save it, compare it, read the interval** — GitHub issue #228's fourth
 * acceptance criterion, and the one that had to be a *journey* rather than a unit case.
 *
 * ## Why this file exists and could not be a Node test
 *
 * The other three criteria are checkable one seam at a time and are checked that way:
 * `dev/dispatcherEditor.test.ts` owns *saves*, `persist/` owns *persists*,
 * `batch/library.test.ts` owns *the vector reaches `estimateCost`, on the legs*. What none of them
 * can see is the thing the issue is actually about — **the join**. #228's complaint is that a
 * player *"can build a dispatcher in the workshop and then cannot use it for the thing the
 * workshop exists for"*, and every part of that sentence was individually working: the editor
 * saved, the state carried, the batch ran. What was missing was the wire between two panels, and a
 * wire between two panels is exactly what a per-module test cannot fail on.
 *
 * So this walks it: the dispatcher editor's own controls, the editor's own Save, the Compare tab's
 * own picker, the Compare tab's own Run. Every step is a control a player presses, and none of them
 * is reached by evaluating into the page.
 *
 * ## What it does not assert, and that rule is § D220 § 4's
 *
 * **No number.** Not a mean, not a bound, not a count, not a verdict word that orders the two arms.
 * The honesty search and `batch/library.test.ts` own what the figures mean; what this tier is for
 * is whether a node reached the page. So *"read the interval"* is asserted as **an interval plot
 * exists on the row comparing the two arms**, not as a value read off it.
 *
 * ## The batch is deliberately under budget, and the report is expected to say so
 *
 * Eight replications, not fifty. CLAUDE.md's 50–200 budget is about *publishing a comparison*, and
 * this case publishes nothing: it asks whether a saved dispatcher can be *put through* the
 * apparatus. `batch/report.ts` handles the shortfall itself — an interval that excludes zero over
 * too few pairs comes back `under-budget`, **the interval is drawn and no arm is named ahead** —
 * so running short here does not weaken a criterion, it exercises the refusal that keeps the
 * criterion honest. A fifty-replication batch of Chancery House would be some minutes of browser
 * time to reach a claim this file is forbidden to make.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEngineerStage,
  openPage,
  startShippedSite,
  type ShippedSite,
} from './browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let page: Page;

/** The name the player types. Distinctive so no shipped profile can satisfy an assertion about it. */
const MINE = 'Kestrel';

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // A port of this file's own, `strictPort: false` — `compareLab.browser.test.ts`'s note applies
  // unchanged and is not repeated. 5273 is that file's; this is the next one nothing else uses.
  site = await startShippedSite({ preview: { port: 5283, strictPort: false } });
  browser = await chromium.launch({ executablePath: CHROMIUM });
  page = await openPage(browser, { viewport: { width: 1600, height: 1000 } });
  await page.goto(site.origin, { waitUntil: 'load' });
  await enterEngineerStage(page);
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * Open the workshop the way a player does — the rail's own *Open dispatcher editor →*.
 *
 * **Not `openTab('tab-dispatcher')`, and the reason is a real property of the shell.** The editor
 * tabs are progressively revealed (`dev/surfaces.ts#revealedTabsFrom`, persisted per browser), so
 * `#tab-dispatcher` is `hidden` on a fresh session and Playwright waits thirty seconds on it —
 * reporting a failure about the harness in the voice of a failure about the product. The rail
 * button is what reveals the tab, which is what makes it the player's path rather than a shortcut
 * around one.
 *
 * `fold1280.browser.test.ts` presses `#drawer-toggle` before it and this file does not: that
 * control is `display: none` at this viewport, measured — the rail is already open at 1600×1000
 * and the drawer is the narrow-window affordance for the same thing. A click on it here waits the
 * full thirty seconds on an element with no box.
 */
async function openWorkshop(): Promise<void> {
  await page.locator('#rail-open-dispatcher').click();
  await page.waitForFunction(
    () => document.querySelector('#panel-dispatcher')?.hasAttribute('hidden') === false,
    undefined,
    { timeout: 30_000 },
  );
}

/** Bring a tab to the front the way a player does — `compareLab.browser.test.ts`'s helper. */
async function openTab(id: string): Promise<void> {
  await page.click(`#${id}`);
  await page.waitForFunction(
    (tab: string) => document.querySelector(`#${tab}`)?.getAttribute('aria-selected') === 'true',
    id,
    { timeout: 30_000 },
  );
}

/** Every option's visible text on a picker, in the page's own order. */
async function optionTexts(selector: string): Promise<readonly string[]> {
  return page.evaluate((query: string) => {
    const select = document.querySelector(query) as HTMLSelectElement | null;
    return [...(select?.options ?? [])].map((option) => option.text);
  }, selector);
}

async function textOf(selector: string): Promise<string> {
  return page.evaluate(
    (query: string) => (document.querySelector(query) as HTMLElement | null)?.textContent ?? '',
    selector,
  );
}

describe.skipIf(!HAS_BROWSER)('a dispatcher a player built reaches the instruments', () => {
  it('is not offered before it is built — the negative control this whole file rests on', async () => {
    /*
     * Run first and asserted, rather than assumed, because every case below is of the form *"the
     * name is in the list"* and a picker that somehow already contained it would make all of them
     * pass while the product was broken. This is also the state issue #167 describes: three selects
     * that read the shipped file and nothing else.
     */
    await openTab('tab-compare');
    for (const selector of ['#batch-baseline', '#batch-candidate', '#suite-candidate']) {
      expect((await optionTexts(selector)).join('\n'), selector).not.toContain(MINE);
    }
    await openTab('tab-campaign');
    expect((await optionTexts('#campaign-profile')).join('\n')).not.toContain(MINE);
  });

  it('is built and saved in the workshop, with the weights moved', async () => {
    await openWorkshop();
    await page.fill('#dispatcher-name', MINE);

    /*
     * **A weight is moved before saving, and that is the point of the case rather than decoration.**
     * A saved copy of the running profile with nothing changed is that profile under a second id —
     * `authoring/dispatcherSpec.ts#specRoundTrips` requires exactly that — so a journey that saved
     * one would prove the picker plumbing and nothing about the dispatcher. Every slider in the
     * block is driven to its own end of the range, which guarantees a vector no shipped profile has
     * without this file having to name a term id: the editor renders its rows from the cost-term
     * library, so a hard-coded `waitTime` here would be a second list of the thirteen.
     *
     * A range control cannot be `fill`ed, so the value is written and an `input` raised — the idiom
     * `everyday/standaloneScreens.browser.test.ts` uses for the designer's sliders, and the one
     * place in this file that reaches into the page rather than pressing something.
     */
    const moved = await page.$$eval('#dispatcher-terms input[type="range"]', (inputs) => {
      inputs.forEach((input, index) => {
        const slider = input as HTMLInputElement;
        slider.value = index % 2 === 0 ? slider.max : slider.min;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return inputs.length;
    });
    expect(moved, 'the term block drew no sliders, so nothing was moved').toBeGreaterThan(1);

    await page.click('#dispatcher-save');
    // The editor's own count of the shelf. Its wording is the editor's, so only the number is read.
    await page.waitForFunction(
      () => (document.querySelector('#dispatcher-yours-count')?.textContent ?? '').startsWith('1 '),
      undefined,
      { timeout: 15_000 },
    );
    expect(await textOf('#dispatcher-error')).toBe('');
  });

  it('appears in Compare, the suite and the Lab, under the name the player gave it', async () => {
    /*
     * The four pickers #167 § 3.1 (4) names, and the reason this is one case rather than four: they
     * are one defect. All three panels mount at boot, before the workshop has ever been opened, and
     * all three filled their selects once from `resources.dispatcherProfiles.profiles`. What makes
     * the name appear here is each panel refilling on the tab becoming visible — so a case that
     * opened the tab *before* the save and never returned would pass on a stale list, which is why
     * the negative control above runs first and opens both tabs.
     */
    await openTab('tab-compare');
    for (const selector of ['#batch-baseline', '#batch-candidate', '#suite-baseline', '#suite-candidate']) {
      expect((await optionTexts(selector)).join('\n'), selector).toContain(MINE);
    }
    await openTab('tab-campaign');
    expect((await optionTexts('#campaign-profile')).join('\n')).toContain(MINE);
  });

  it('files it under YOURS rather than among the ones the build ships', async () => {
    /*
     * The grouping, and it is not cosmetic: a reader who saved a dispatcher under the editor's
     * `YOURS` tag has to find it under the same word on the picker. Asserted through the option's
     * own parent so that *"in the list"* and *"in the right group"* cannot pass separately.
     */
    await openTab('tab-compare');
    const group = await page.evaluate((name: string) => {
      const select = document.querySelector('#batch-candidate') as HTMLSelectElement | null;
      const option = [...(select?.options ?? [])].find((entry) => entry.text.includes(name));
      return option?.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null;
    }, MINE);
    expect(group).toBe('YOURS');
  });

  it('is a setting the Lab can resolve, not just an option it can draw', async () => {
    /*
     * **The picker and the lookup are two seams and only one of them is visible in a list.**
     * `dev/campaignPanel.ts` resolved every id through a `profileById` that read the shipped file:
     * with the picker widened and that lookup left alone, the Lab would *offer* a saved dispatcher,
     * print its raw slug in the intent line, and refuse it at Run with *"this build's data/ does
     * not carry the profile you picked"* — an option that cannot be honoured, which is the defect
     * this lane is fixing wearing a different coat.
     *
     * The intent line is the cheap witness: `drawIntent` composes it from `labelFor`, which is
     * `profileById` under another name, so the display name appearing there is the lookup having
     * resolved. Asserted instead of a stage run because a stage is two batches and this file is
     * forbidden from reading what they produce anyway.
     */
    await openTab('tab-campaign');
    await page.selectOption('#campaign-profile', { label: `${MINE} (yours-1)` });
    const intent = await textOf('#campaign-status');
    expect(intent, 'the Lab drew the raw slug, so the lookup did not resolve').toContain(MINE);
    expect(await textOf('#campaign-error')).toBe('');
  });

  it('runs as an arm against a shipped dispatcher, and the row draws its interval', async () => {
    await openTab('tab-compare');

    /*
     * Chancery House, which `dev/defaults.ts` records as *"the building where the dispatcher axis is
     * most legible"* — the same seed and riders under two dispatchers give 10.3–23.5 s and 146.72 s.
     * A cell where the arms cannot differ would draw an `unresolved` row and this case would be
     * asserting a plot that is there for the wrong reason.
     */
    await page.selectOption('#batch-building', 'chancery-house');
    await page.selectOption('#batch-baseline', 'collective');
    // By label, not by id: the whole point is that the player picks the thing they named.
    await page.selectOption('#batch-candidate', { label: `${MINE} (yours-1)` });
    await page.fill('#batch-replications', '8');
    await page.fill('#batch-duration', '900');
    await page.click('#batch-run');

    await page.waitForFunction(
      () => (document.querySelector('#batch-run') as HTMLButtonElement | null)?.disabled === false,
      undefined,
      { timeout: 120_000 },
    );

    /*
     * **The error line first.** Before this lane the worker refused the arm outright and the panel
     * printed *"the batch failed: dispatcher profile "yours-1" … is not in this build's data/"* —
     * so a case that only looked for a plot would have to wait for the timeout to say anything
     * useful. Checking the refusal slot names the failure the moment it happens.
     */
    expect(await textOf('#batch-error')).toBe('');

    const report = await textOf('#batch-output');
    // The arm is named by the display name, which is `docs/21` § 3.1 (4)'s own acceptance clause.
    expect(report).toContain(MINE);
    // …and by the shipped arm's display name, so the sentence is a comparison rather than an echo.
    expect(report).toContain('Conventional collective');

    /*
     * *Read the interval.* A drawn plot, not a number — see the module docstring on § D220 § 4. The
     * bar is the only node on the row that carries the interval's geometry, so its presence is the
     * claim, and `compareLab.browser.test.ts` owns what the geometry means.
     */
    expect(await page.locator('#batch-output .iv-bar').count()).toBeGreaterThan(0);
  }, 180_000);

  it('survives a reload — the dispatcher is still there and still selectable', async () => {
    /*
     * #228's first criterion is *"saves **and persists**"*, and the second half is a claim about a
     * session store rather than about a state field. `persist/session.ts` writes the shelf and
     * `persist/validate.ts` restores it entry by entry; what this adds is that the restored entry
     * arrives on the picker, which is the join those two modules cannot see either.
     */
    await page.reload({ waitUntil: 'load' });
    await enterEngineerStage(page);
    await openTab('tab-compare');
    // The panel refills on becoming visible, so this is the restored shelf reaching the picker.

    expect((await optionTexts('#batch-candidate')).join('\n')).toContain(MINE);
  });
});
