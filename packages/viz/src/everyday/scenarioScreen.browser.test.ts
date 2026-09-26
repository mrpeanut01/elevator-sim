/**
 * **A stage row on the Scenario hub opens *that* stage** — [§ D787](../../../../DECISIONS.md),
 * GitHub issue #364's other missing half.
 *
 * ## Why this needs a browser, and why nothing weaker would do
 *
 * The defect was not in a computation. `scenario/ladder.ts` built ten correct rows,
 * `everyday/scenarioModel.ts` worded them correctly, and `everyday/scenarioScreen.ts` drew a button
 * on each of the three offered ones — and every one of those buttons called
 * `shell.ts#enterEngineer()`, which takes no argument. Three controls, one destination, no identity
 * carried: press *stage 1*, *stage 3* or *stage 5* and arrive at whatever stage the Engineer
 * surface's campaign picker happened to be holding. Every node tier in this package passed
 * throughout, because each half was right and only the join was missing, and `vitest.config.ts`
 * sets `environment: 'node'` for every project — there is no jsdom here, so no node test can press
 * a button at all.
 *
 * So the assertion is the one `CLAUDE.md`'s standing requirement asks for, pointed at a control:
 * **move the control and require the state to change** — here, that three different rows put three
 * different stage ids in `#campaign-stage`. A case that pressed one row and found the right id
 * would pass against the defect, because the picker's first option is stage 1; the claim only bites
 * across rows, and that is why the loop below is over *every* offered row rather than over one.
 *
 * **This file was run against the defect before it was run against the fix**, which is the only way
 * to know a case can fail: the press was reverted to the bare `context.enterEngineer()` in a working
 * tree, this file was run, and the first case failed at the wait below — `#panel-campaign` never
 * lost its `hidden`, in 30 s. The old press did not merely land on the wrong stage; it did not open
 * the Lab at all, so a player pressing *stage 4* arrived on the Engineer surface's Run tab with the
 * campaign picker out of sight. Restored, both cases pass.
 *
 * ## The route is the player's own
 *
 * `openScenarioEntry`'s rule, one screen over: menu tile → Scenario hub → the row's head. Nothing
 * here reaches past the cover or calls the port directly. The way back is
 * {@link returnToEverydayMode}, the Engineer header's control, so each press starts from the hub
 * the way the one before it left it — which is also what proves the hub survives the round trip and
 * that a second press is not the first one's residue.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  returnToEverydayMode,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5260, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * The hub, with the ordered path drawn on it.
 *
 * The wait is on a **row** rather than on the screen: the path arrives from
 * `everyday/scenarioLadderPort.ts` after `dev/main.ts`'s `loadCampaign` resolves, and the hub
 * mounts before that and redraws when it lands. Waiting on `.everyday-scenario` alone would race
 * the redraw and read an empty path as a missing one.
 */
/** Back to the hub from wherever the Everyday shell stands — the menu, or a screen inside Scenario. */
async function scenarioHubFromAnywhere(page: Page): Promise<void> {
  if ((await page.locator('.everyday-scenario-path-card').count()) > 0) return;
  if ((await page.locator('.everyday-mode[data-screen="scenario"]').count()) === 0) {
    await page.locator('.everyday-bar-leave').click();
    await page.waitForSelector('.everyday-mode[data-screen], .everyday-scenario-path-card', { timeout: 15_000 });
  }
  if ((await page.locator('.everyday-scenario-path-card').count()) > 0) return;
  await page.locator('.everyday-mode[data-screen="scenario"]').click();
  await page.waitForSelector('.everyday-scenario-path-card', { timeout: 30_000 });
}

async function scenarioHub(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  await page.locator('.everyday-mode[data-screen="scenario"]').click();
  await page.waitForSelector('.everyday-scenario-path-card', { timeout: 30_000 });
}

describe.skipIf(!HAS_BROWSER)('the Scenario hub opens the stage that was pressed', () => {
  /*
   * **§ D1129 moved where a row opens, and the claim this case holds did not move.** A row opened
   * its stage in the Engineer Lab (§ D787); since the swarm's Q3 ruling it opens it in the fix-it
   * editor, in this world, and the Lab is one press further on, from the stage page's own link. So
   * the case presses every offered row and requires that row's own stage to arrive **twice**: on
   * the stage page, by its title and its building, and in the Lab's picker through the link —
   * where the Engineer header must now name the stage's building rather than the Engineer run's,
   * which is the interim half of the ruling (stage 1 used to open under *St Jude Hospital*).
   */
  it('opens each offered row’s own stage in the fix-it editor, and in the Lab from there', async () => {
    const page = await openPage(browser, { viewport: { width: 1400, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await scenarioHub(page);

      const offered = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.everyday-scenario-path-card')]
          .filter((card) => card.dataset['playable'] === 'yes')
          .map((card) => ({
            id: card.dataset['stage'] ?? '',
            title: card.querySelector('.everyday-scenario-path-title')?.textContent ?? '',
          })),
      );
      /* Two is the floor at which *different rows reach different stages* is a claim at all. */
      expect(offered.length).toBeGreaterThanOrEqual(2);
      /*
       * § D1183: the census counts the stage page's own choices, so the four stages it found ways
       * through on are offered on the built bundle, beside the three that were already.
       */
      expect(offered.map((row) => row.id)).toEqual([
        'stage-1-first-call',
        'stage-2-morning-rush',
        'stage-3-overwhelmed',
        'stage-5-credentials',
        'stage-6-the-tall-one',
        'stage-7-prove-it',
        'stage-8-the-headline-address',
      ]);
      expect(new Set(offered.map((row) => row.id)).size, 'the hub drew two rows for one stage').toBe(offered.length);

      const arrived: string[] = [];
      const inTheLab: string[] = [];
      for (const row of offered) {
        await page.locator(`.everyday-scenario-path-card[data-stage="${row.id}"] .everyday-scenario-path-head`).click();
        await page.waitForSelector('.everyday-stage-play-title', { timeout: 60_000 });
        arrived.push(await page.evaluate(() => document.querySelector('.everyday-stage-play-title')?.textContent ?? ''));
        const building = await page.evaluate(
          () => document.querySelector('.everyday-stage-play-building')?.textContent ?? '',
        );

        await page.locator('.everyday-stage-play-lab-link').click();
        await page.waitForFunction(
          () => document.querySelector('#panel-campaign')?.hasAttribute('hidden') === false,
          undefined,
          { timeout: 30_000 },
        );
        inTheLab.push(
          await page.evaluate(() => document.querySelector<HTMLSelectElement>('#campaign-stage')?.value ?? ''),
        );
        /* The Engineer header names the stage's building while its tab is in front. */
        const header = await page.evaluate(
          () => document.querySelector('#building-name')?.textContent ?? '',
        );
        expect(building.startsWith(header.trim()), `the Lab's header reads "${header}" over ${row.id}`).toBe(true);

        await returnToEverydayMode(page);
        await scenarioHubFromAnywhere(page);
      }

      /* **The claim, in the only form that fails against the defect.** */
      expect(arrived).toEqual(offered.map((row) => row.title));
      expect(inTheLab).toEqual(offered.map((row) => row.id));
    } finally {
      await page.close();
    }
  }, 300_000);

  it('promises the press on the row’s own face, and the face matches what the press did', async () => {
    /*
     * § D227 pointed at this wave's own change: `SCENARIO_LADDER_COPY.openNote` now says *"Opens
     * this stage"*, singular, which is a claim about the press rather than about the swap. A wording
     * that survived a press being reverted would be the stale-promise defect arriving in the fix
     * for one, so the sentence and the behaviour are asserted in one case.
     */
    const page = await openPage(browser, { viewport: { width: 1400, height: 900 } });
    try {
      await page.goto(origin, { waitUntil: 'load' });
      await scenarioHub(page);
      const notes = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.everyday-scenario-path-note')].map(
          (node) => node.textContent ?? '',
        ),
      );
      expect(notes.length).toBeGreaterThanOrEqual(2);
      for (const note of notes) expect(note).toContain('Opens this stage');
      /*
       * And the budget line sells nothing — § D786, on the built bundle rather than on the
       * constant. The promise this replaced was *"N wider budgets can be bought, in order: … (20
       * chimes), … (30 chimes)"* and it was read off `dist-web` by the panel that found it, which
       * is why the check is made here as well as in `scenario/ladder.test.ts`.
       */
      const budgets = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.everyday-scenario-path-budget')].map(
          (node) => node.textContent ?? '',
        ),
      );
      expect(budgets.length).toBeGreaterThanOrEqual(2);
      for (const line of budgets) {
        expect(line).not.toMatch(/\bcan be bought\b|\bchimes?\b/iu);
        /*
         * **The literal narrowed in wave AF and the claim did not weaken** — GitHub issue #579,
         * § D911. It read *No screen in this build sells a wider budget*, which stopped being true
         * when the fix cases got a rung: a cleared case now earns, and the earning buys a wider
         * budget there. It is still exactly true of **these ten**: they were played on the Engineer
         * surface, and since § D1129 on the fix-it editor's stage page, which presses at the base
         * rung and draws no budget control, so the sentence narrowed rather than went.
         *
         * The line above is the half that matters and is unchanged: these rows may not promise a
         * purchase, in `can be bought` or `chimes`, that the Scenario hub cannot deliver.
         */
        expect(line).toContain('Nothing sells a wider budget for these ten');
      }
    } finally {
      await page.close();
    }
  }, 180_000);
});
