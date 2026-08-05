/**
 * **The Compare and Lab tabs, driven** — the two panels a node test cannot reach.
 *
 * `honesty/derive.test.ts` excludes `dev/batchPanel.ts#mountBatchPanel` and
 * `dev/campaignPanel.ts#mountCampaignPanel` from the honesty search with a stated reason: they
 * mount the page and author their status text inline, so they cannot be driven under Node —
 * `boundaries.test.ts` confines the DOM to `dev/` precisely so the rest of the package stays
 * testable without a jsdom. Their literals reach only a **static** sweep, which that file calls a
 * limitation rather than coverage.
 *
 * This file narrows the limitation for the four claims a play-through found false. Each one is a
 * fact about what a player sees on arrival, and every one of them was reported by somebody who had
 * followed the product's own instructions:
 *
 * 1. **Compare introduces itself.** The Day report ends by sending a reader to this tab; the tab
 *    was one toolbar row over an empty panel, with no title, no sentence and no verb.
 * 2. **Both tabs name dispatchers the way the rest of the product does.** They listed `eta`,
 *    `collective`, `zoned-uppeak` — ids that appear on no other screen.
 * 3. **The Lab does not open on a setting against itself.** Every shipped stage starts on
 *    `collective` and the panel selected `collective` as the player's setting too, so the only
 *    thing a first-time player could do was an unwinnable run reported as *"stage not cleared"*.
 * 4. **The pre-flight line is bound to the controls.** The standing *move the control and require
 *    the run to change* requirement, pointed at a display: a cost line that did not move when
 *    `replications` did would be a number that looks right and means nothing.
 *
 * ## What it deliberately does not claim
 *
 * § D220 § 4 forbids a browser test asserting a metric, a mean or any number the honesty search
 * and the replay harness already own. Nothing here runs a batch or reads a figure — every
 * assertion is about text and control state on a page that has computed nothing. There is no
 * screenshot, for § D220's reason: a pixel diff fails on a font hint and is repaired by
 * re-baselining, which is a control that trains its owner to override it.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The provisioned headless shell — `boot.browser.test.ts`'s rule, and its default path. */
const CHROMIUM =
  process.env['ELEVATOR_SIM_CHROMIUM'] ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HAS_BROWSER = existsSync(CHROMIUM);
if (!HAS_BROWSER) {
  console.warn(
    `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
      'Set ELEVATOR_SIM_CHROMIUM to run the browser tier (DECISIONS.md § D220).',
  );
}

let server: ViteDevServer;
let browser: Browser;
let page: Page;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /*
     * A port of this file's own, and `strictPort: false` so a busy one becomes the next free one.
     *
     * Not `port: 0`. `boot.browser.test.ts` asks for that and lands on Vite's default 5173 anyway,
     * so two browser files running in parallel — which is vitest's default — collide, and the
     * second one to start fails with *"Port 5173 is already in use"* for a reason that has nothing
     * to do with the product. Naming a port outside the range anything else in this repository
     * uses, and letting it slide when it is taken, is the half of that this file can fix without
     * reaching into a test it does not own.
     */
    server: { port: 5273, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0]?.replace(/\/$/, '');
  if (origin === undefined) throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(origin, { waitUntil: 'load' });
  /*
   * The campaign's own `data/campaign.json` is fetched after boot and the Lab panel mounts on that
   * promise, so waiting for the stage picker to have options is waiting for the mount rather than
   * for a fixed delay. `dev/main.ts` reports a failed load into the panel's alert slot, so a
   * timeout here is a real failure and not a race.
   */
  await page.waitForFunction(
    () => (document.querySelector('#campaign-stage') as HTMLSelectElement | null)?.options.length,
    undefined,
    { timeout: 60_000 },
  );
  /*
   * The main menu covers the page on load, and the tester's own first step was dismissing it —
   * *Scenarios → Open the doors*. Walked here rather than hidden with a style, because a test that
   * reached past the overlay would be asserting about a page no player can be looking at.
   */
  await page.locator('.menu-row', { hasText: 'Scenarios' }).first().click();
  await page.locator('.menu-start').first().click();
  await page.waitForFunction(
    () => (document.querySelector('.menu-overlay') as HTMLElement | null)?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

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

/**
 * Bring a tab to the front the way a player does.
 *
 * Needed before any *interaction*: a tabpanel that is not selected is `hidden`, so Playwright's
 * actionability checks refuse to fill or select inside it — correctly, since a real reader cannot
 * either. Reading `textContent` works either way, which is why the assertions above this line do
 * not need it.
 */
async function openTab(id: string): Promise<void> {
  await page.click(`#${id}`);
  await page.waitForFunction(
    (tab: string) => document.querySelector(`#${tab}`)?.getAttribute('aria-selected') === 'true',
    id,
    { timeout: 30_000 },
  );
}

describe.skipIf(!HAS_BROWSER)('Compare, before anything has run', () => {
  it('says what the tab is, and that a batch has to be started', async () => {
    const body = await textOf('#batch-output');
    expect(body, 'the Compare panel body is empty on arrival').not.toBe('');
    expect(body).toContain('what Compare is for');
    // The verb. Its absence is what made the panel read as broken rather than as waiting.
    expect(body).toContain('Press Run batch');
    // baseline and candidate, explained, and which way round the subtraction goes.
    expect(body).toContain('candidate minus baseline');
    // The demand field's placeholder is the word `profile` in a numeric-looking box.
    expect(body).toContain('the building’s own traffic profile');
    // Units, which the toolbar label does not carry.
    expect(body).toContain('simulated seconds');
  });

  it('states the size of the job, and Cancel is not live before there is one', async () => {
    const body = await textOf('#batch-output');
    // 2 dispatchers × the shipped 50 replications. Derived, so it cannot go stale.
    expect(body).toContain('2 dispatchers × 50 replications = 100 simulations');
    /*
     * The tester reported Cancel as *"present and looks live before anything is running"*. The
     * property is asserted because it is the one that matters, and it already held — see the
     * report: `setRunning(false)` disables it at mount.
     */
    expect(
      await page.evaluate(() => (document.querySelector('#batch-cancel') as HTMLButtonElement).disabled),
    ).toBe(true);
  });

  it('rewrites the size of the job when a control moves', async () => {
    /*
     * *Move the control and require the run to change*, one level down: this control changes a
     * display rather than a simulation, and a pre-flight line that did not follow its own form
     * would be a number that looks right and means nothing. Restored afterwards so the rest of the
     * file sees the shipped defaults.
     */
    await openTab('tab-compare');
    await page.fill('#batch-replications', '120');
    await page.dispatchEvent('#batch-replications', 'input');
    expect(await textOf('#batch-output')).toContain('2 dispatchers × 120 replications = 240 simulations');
    await page.fill('#batch-replications', '50');
    await page.dispatchEvent('#batch-replications', 'input');
    expect(await textOf('#batch-output')).toContain('= 100 simulations');
  });
});

describe.skipIf(!HAS_BROWSER)('the dispatcher pickers name what the rest of the product names', () => {
  it('offers `Name (slug)` on Compare’s two arms and on the Lab’s setting', async () => {
    for (const selector of ['#batch-baseline', '#batch-candidate', '#campaign-profile']) {
      const texts = await optionTexts(selector);
      expect(texts, selector).toContain('Minimum estimated wait (eta)');
      expect(texts, selector).toContain('Conventional collective (collective)');
      // `destination-panel` has no card in the dispatcher rail, so a slug was unresolvable there
      // even by elimination.
      expect(texts, selector).toContain('Destination dispatch, landing panel (destination-panel)');
      // No option is a bare slug any more.
      expect(texts.filter((text) => !text.includes(' (')), selector).toEqual([]);
    }
  });

  it('matches the form the building picker beside it already used', async () => {
    expect(await optionTexts('#batch-building')).toContain('Chancery House (chancery-house)');
  });
});

describe.skipIf(!HAS_BROWSER)('the Lab does not open on an unwinnable run', () => {
  it('selects a setting that differs from the stage’s own baseline', async () => {
    const [stage, profile] = await page.evaluate(() => [
      (document.querySelector('#campaign-stage') as HTMLSelectElement).value,
      (document.querySelector('#campaign-profile') as HTMLSelectElement).value,
    ]);
    expect(stage).toBe('stage-1-first-call');
    // Every shipped stage starts on `collective`; the opening setting must not be it.
    expect(profile).not.toBe('collective');
  });

  it('does it on every stage that has an alternative, and says so on the two that do not', async () => {
    /*
     * Every one of the ten stages starts on `collective`, so this is not a property of stage 1.
     *
     * **Two of them cannot move, and the walk is how that was found rather than assumed.**
     * `stage-8-the-headline-address` and `stage-10-the-bed-and-the-visitor` open dimension sets no
     * shipped dispatcher sits inside — stage 8's omits `constraints.noDirectionReversal`, which
     * `collective` declares and every alternative moves — so on those the weight editor is the
     * only way to play, and the status line has to say that rather than tell a player to change a
     * setting that cannot be changed. Asserted as a **disjunction** rather than as two hard-coded
     * stage ids: an eleventh stage, or a fourteenth profile, moves which stages are which, and a
     * list here would go stale silently.
     *
     * *Run enabled* is the other half, and the one a wrong default would break quietly: a profile
     * the stage did not open is refused at the control, so an opening setting chosen without
     * asking `admitProfile` would land a player on a disabled button and a refusal they did not
     * cause.
     */
    await openTab('tab-campaign');
    const stages = await page.evaluate(() =>
      [...(document.querySelector('#campaign-stage') as HTMLSelectElement).options].map((o) => o.value),
    );
    expect(stages.length).toBeGreaterThan(1);
    let stuck = 0;
    for (const stage of stages) {
      await page.selectOption('#campaign-stage', stage);
      const [profile, runDisabled] = await page.evaluate(() => [
        (document.querySelector('#campaign-profile') as HTMLSelectElement).value,
        (document.querySelector('#campaign-run') as HTMLButtonElement).disabled,
      ]);
      expect(runDisabled, stage).toBe(false);
      if (profile !== 'collective') continue;
      stuck += 1;
      // The fallback is not silent: the bar says the arms are the same and names the way out.
      const status = await textOf('#campaign-status');
      expect(status, stage).toContain('both settings are Conventional collective (collective)');
      expect(status, stage).toContain('edit the weights');
    }
    // …and it is a fallback, not the rule: most stages do have somewhere to go.
    expect(stuck).toBeLessThan(stages.length / 2);
    await page.selectOption('#campaign-stage', stages[0] ?? '');
  });

  it('says what it is about to run, at the top, before the button is pressed', async () => {
    await openTab('tab-campaign');
    await page.selectOption('#campaign-stage', 'stage-1-first-call');
    const status = await textOf('#campaign-status');
    expect(status).toContain('Conventional collective (collective)');
    expect(status).toContain('Press Run this stage');
  });

  it('warns up front — not in the left column — when the two arms would be the same', async () => {
    /*
     * The control run is still available; what changed is that choosing it says so *before* the
     * minute of computation rather than in a tautology several screens down the briefing.
     */
    await openTab('tab-campaign');
    await page.selectOption('#campaign-stage', 'stage-1-first-call');
    await page.selectOption('#campaign-profile', 'collective');
    const status = await textOf('#campaign-status');
    expect(status).toContain('both settings are Conventional collective (collective)');
    expect(status).toContain('control run');
    expect(status).toContain('cannot be reached');
  });
});
