/**
 * **The tab gate, in a real browser, across a real reload** — GitHub issue #130,
 * [§ D330](../../../../DECISIONS.md).
 *
 * ## Why this claim needs this tier and not a node test
 *
 * `dev/surfaces.test.ts` already drives the whole decision — every reveal, every active tab, both
 * modes, and the codec round-tripped back through the gate. What it cannot do is the thing the
 * issue is actually about: **survive a page load**. § D330's first condition is *the reveal
 * survives a reload, or the gate is not sequencing — it is re-hiding a surface the player has
 * already found*, and the only instrument that can answer that is a browser that has been reloaded.
 *
 * So this file asserts what a node test would have to take on trust, and it asserts it the
 * expensive way on purpose: it **reloads the page** and reads the strip off the DOM afterwards. A
 * case that checked `localStorage.setItem` had been called would be the wave F shape — green on
 * its own defect, because *a write happened* and *the next boot reads it* are two claims and only
 * the second is the feature.
 *
 * ## Everything here is pressed the way a player presses it
 *
 * The reveal is made by clicking the rail's own *Open dispatcher editor →*, and the mode is moved
 * with `selectOption` on the header's `<select>` — both real input, both through the same handlers
 * the product wires. Nothing is written into `state`, no reveal is seeded into `localStorage` by
 * hand, and the Engineer surface is reached by `enterEngineerStage`, the player's own door.
 *
 * The viewport is **1440 wide** and that is load-bearing rather than incidental: below
 * `DRAWER_BREAKPOINT_PX` the right rail is an overlay behind *Controls ▸*, so at a narrower size
 * the rail's buttons are not on screen and this file would be testing the drawer instead of the
 * gate.
 *
 * § D220 § 4 holds: nothing here asserts a metric, a mean, or anything the honesty search owns.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONTEXTUAL_TABS, ELEMENT_IDS, TABS } from './elementMap.js';

/** The tier's one gate — see `browserTier.test-helper.ts`, and GitHub issue #142 for why it is one. */
import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — `keyboard.browser.test.ts`'s reasoning again.
    server: { port: 5215, strictPort: false },
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
 * What the strip is showing, read off the page.
 *
 * Ids from {@link ELEMENT_IDS} rather than typed out, so a rename is a compile error here instead
 * of a thirty-second timeout. `hidden` is read as the **property**, which is what the browser
 * resolves after the stylesheet — `.tab-gate-note[hidden]` exists precisely because a flex child
 * can keep its box while carrying the attribute.
 */
async function readStrip(page: Page): Promise<{
  readonly visibleTabs: readonly string[];
  readonly note: string;
  readonly noteHidden: boolean;
}> {
  return page.evaluate(
    ({ tabIds, noteId }) => {
      const note = document.getElementById(noteId);
      return {
        visibleTabs: tabIds.filter((id) => document.getElementById(id)?.hidden === false),
        note: note?.textContent ?? '',
        // `!== false` rather than `?? true`: `HTMLElement.hidden` is `boolean | 'until-found'`,
        // and an element that is absent is not showing anything either.
        noteHidden: note?.hidden !== false,
      };
    },
    { tabIds: TABS.map((tab) => ELEMENT_IDS.tabs[tab]), noteId: ELEMENT_IDS.tabGateNote },
  );
}

/** A cold page on the Engineer surface, reached through the door a player uses. */
async function coldEngineer(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'load' });
  await enterEngineerStage(page);
  return page;
}

const CONTEXTUAL_IDS = CONTEXTUAL_TABS.map((tab) => ELEMENT_IDS.tabs[tab]);
const DISPATCHER_ID = ELEMENT_IDS.tabs.dispatcher;

describe.skipIf(!HAS_BROWSER)('the tab gate in Casual — issue #130', () => {
  it('opens with the four editors behind the rail and says so on the strip', async () => {
    const page = await coldEngineer();
    const strip = await readStrip(page);

    for (const id of CONTEXTUAL_IDS) expect(strip.visibleTabs, id).not.toContain(id);
    expect(strip.noteHidden).toBe(false);
    /*
     * The count is asserted against `CONTEXTUAL_TABS.length` rather than against the literal four,
     * so this case and the sentence read the same source — § D330's second condition, checked on
     * the shipped page rather than on the pure function that produced it.
     */
    expect(strip.note).toBe(
      `${String(CONTEXTUAL_TABS.length)} more editors — open them from the Controls rail`,
    );
    await page.close();
  });

  it('reveals the editor the rail opens, and drops the strip’s count by one', async () => {
    const page = await coldEngineer();
    // The player's own press. `#rail-open-dispatcher` is a real button on a real rail at 1440 px.
    await page.locator('#rail-open-dispatcher').click();
    await page.waitForFunction(
      (id) => document.getElementById(id)?.hidden === false,
      DISPATCHER_ID,
      { timeout: 15_000 },
    );

    const strip = await readStrip(page);
    expect(strip.visibleTabs).toContain(DISPATCHER_ID);
    expect(strip.note).toBe(
      `${String(CONTEXTUAL_TABS.length - 1)} more editors — open them from the Controls rail`,
    );
    await page.close();
  });

  it('keeps it revealed across a real reload — § D330 condition 1', async () => {
    /*
     * **The case the issue exists for, and it is a reload rather than an assertion about a write.**
     *
     * ## The trap this case walked into first, kept because the shape recurs
     *
     * The obvious form of this test — reveal, reload, assert the tab is on the strip — **passes on
     * a build with no persistence at all**, and it did: written that way it was green before the
     * restore was wired. `syncUrl` keeps the address describing the state (`SH-09`), so the reload
     * arrives at `?…&tab=dispatcher`, `applyDeepLink` makes that the active tab, and
     * `surfaceStateFor` shows the active tab **whether or not it has been revealed** — *a selected
     * button nobody can focus is worse than a visible one*. So the assertion was reading the
     * always-show-active rule and calling it persistence, and the note beside it read *3 more
     * editors* for the same reason.
     *
     * The fix is the press below: **leave the editor first**. With the reader back on the run
     * surface, `dispatcher` is visible only if something restored the reveal, and the strip's count
     * is 3 only for the same reason. On the tree before this lane the same sequence reports four
     * behind the rail — the mutation is recorded in the lane's report.
     *
     * That is why the case ends where a player would be rather than where the URL puts them, and
     * it is worth reading twice: an instrument can pass its own vacuity guard — this one asserted
     * a real string off a real reloaded page — and still be measuring the wrong mechanism.
     */
    const page = await coldEngineer();
    await page.locator('#rail-open-dispatcher').click();
    await page.waitForFunction(
      (id) => document.getElementById(id)?.hidden === false,
      DISPATCHER_ID,
      { timeout: 15_000 },
    );

    await page.reload({ waitUntil: 'load' });
    await enterEngineerStage(page);
    await page.waitForFunction(
      (id) => document.getElementById(id) !== null,
      DISPATCHER_ID,
      { timeout: 30_000 },
    );

    // The address did carry the tab, which is the thing that made the naive form vacuous. Asserted
    // rather than described, so the paragraph above cannot quietly stop being true of the product.
    expect(new URL(page.url()).searchParams.get('tab')).toBe('dispatcher');

    // Leave it. A real press on the run tab, which is what a returning player does next.
    await page.locator(`#${ELEMENT_IDS.tabs.run}`).click();
    await page.waitForFunction(
      (id) => document.getElementById(id)?.getAttribute('aria-selected') === 'true',
      ELEMENT_IDS.tabs.run,
      { timeout: 15_000 },
    );

    const strip = await readStrip(page);
    expect(strip.visibleTabs, 'the reload re-hid a surface the player had already found').toContain(
      DISPATCHER_ID,
    );
    expect(strip.note).toBe(
      `${String(CONTEXTUAL_TABS.length - 1)} more editors — open them from the Controls rail`,
    );
    await page.close();
  });

  it('stays inside the strip at the widths the fold audit measures', async () => {
    /*
     * The note is `white-space: nowrap` and roughly a third of a laptop strip wide, and it sits in
     * a `.tabs` that wraps inside a `.stagecol` with `overflow: hidden`. So the failure available
     * to it is not a scrollbar — it is a **clipped sentence**, which is the affordance saying three
     * quarters of something, and `docs/19` defect 7's own shape one row up.
     *
     * Measured rather than reasoned about, at the two widths the fold audit uses and at the
     * drawer breakpoint's own value, where the strip also gains the *Controls ▸* button.
     */
    const page = await coldEngineer();
    for (const width of [1440, 1339, 1280, 900]) {
      await page.setViewportSize({ width, height: 800 });
      const fits = await page.evaluate((noteId) => {
        const note = document.getElementById(noteId);
        const strip = note?.parentElement;
        if (note === null || strip === null || strip === undefined) return null;
        const a = note.getBoundingClientRect();
        const b = strip.getBoundingClientRect();
        return { noteRight: a.right, stripRight: b.right, noteLeft: a.left, stripLeft: b.left };
      }, ELEMENT_IDS.tabGateNote);
      expect(fits, `no note at ${String(width)} px`).not.toBeNull();
      expect(fits?.noteRight ?? 0, `the note is clipped at ${String(width)} px`).toBeLessThanOrEqual(
        (fits?.stripRight ?? 0) + 0.5,
      );
      expect(fits?.noteLeft ?? 0, `the note starts off-strip at ${String(width)} px`).toBeGreaterThanOrEqual(
        (fits?.stripLeft ?? 0) - 0.5,
      );
    }
    await page.close();
  });

  it('a page that never opened an editor still opens gated — the reload is not a one-way latch', async () => {
    /*
     * The negative control on the case above: a fresh context has an empty slot, so the reload
     * proving persistence must not be a test that would pass against a build that simply stopped
     * gating. This page reloads too, and comes back with all four still behind the rail.
     */
    const page = await coldEngineer();
    await page.reload({ waitUntil: 'load' });
    await enterEngineerStage(page);

    const strip = await readStrip(page);
    for (const id of CONTEXTUAL_IDS) expect(strip.visibleTabs, id).not.toContain(id);
    expect(strip.note).toBe(
      `${String(CONTEXTUAL_TABS.length)} more editors — open them from the Controls rail`,
    );
    await page.close();
  });
});

describe.skipIf(!HAS_BROWSER)('Engineer has no gate — § D330 condition 3, on the shipped page', () => {
  it('mounts every tab and draws no gate sentence the moment the mode changes', async () => {
    const page = await coldEngineer();
    // A cold page is Casual, which is what makes the assertion below a change rather than a state.
    expect((await readStrip(page)).noteHidden).toBe(false);

    await page.locator('#view-mode').selectOption('advanced');
    await page.waitForFunction(
      (id) => document.getElementById(id)?.hidden === false,
      DISPATCHER_ID,
      { timeout: 15_000 },
    );

    const strip = await readStrip(page);
    expect(strip.visibleTabs).toEqual(TABS.map((tab) => ELEMENT_IDS.tabs[tab]));
    expect(strip.noteHidden, 'Engineer drew the gate’s sentence over a strip with no gate').toBe(
      true,
    );
    /*
     * The words are cleared as well as hidden. A `hidden` node still carries its text to anything
     * reading the tree rather than the paint, and *4 more editors* left behind in a mode with no
     * gate is the sentence outliving the thing it describes — § D227's shape, manufactured by
     * tidiness.
     */
    expect(strip.note).toBe('');
    await page.close();
  });

  it('goes back to gated when the mode goes back, so the strip follows the control', async () => {
    const page = await coldEngineer();
    await page.locator('#view-mode').selectOption('advanced');
    await page.waitForFunction(
      (id) => document.getElementById(id)?.hidden === false,
      DISPATCHER_ID,
      { timeout: 15_000 },
    );
    await page.locator('#view-mode').selectOption('basic');
    await page.waitForFunction(
      (id) => document.getElementById(id)?.hidden === true,
      DISPATCHER_ID,
      { timeout: 15_000 },
    );

    const strip = await readStrip(page);
    expect(strip.noteHidden).toBe(false);
    expect(strip.note).toBe(
      `${String(CONTEXTUAL_TABS.length)} more editors — open them from the Controls rail`,
    );
    await page.close();
  });
});
