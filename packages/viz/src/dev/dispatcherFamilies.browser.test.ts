/**
 * The family controls, **driven** — `docs/21-engineer-reimagined-contract.md` § 3.6.
 *
 * ## What no node test in this package can reach
 *
 * `familyControls.test.ts` owns everything the block *decides*: which dimension belongs to which
 * family, that the partition is total, that a flag above outranks a control below and that the
 * panel says so, and — on the legs — that moving each family's control changes the run. All of that
 * is pure and none of it needs a document.
 *
 * What it cannot reach is whether the block is **on the page**. Thirty-seven controls are built at
 * mount and inserted before `.editor-actions`; there is no jsdom here (`boundaries.test.ts` keeps it
 * that way), so a mount that threw on `collectSearchSpace()`, a mis-parented node or a change
 * handler wired to the wrong element would be invisible to every green node test. That is § D220's
 * shape, and it is the reason the register it closes was worth closing in the DOM as well as in a
 * function.
 *
 * ## The persistence verification § 3.6 asks for
 *
 * The contract marks issue #113 § 2 — *custom dispatchers vanish on reload* — **needs-verification**
 * and assigns the lane to reproduce or close it with a driven case. It does not reproduce: the
 * library is written to `localStorage` the moment it changes (`persist/session.ts`,
 * `dev/main.ts#MountContext.update`), which § D302 landed. The case below is that verification, and
 * it asks the question this lane makes newly interesting — **a saved dispatcher's family values are
 * on the profile, so whatever persists the profile persists them, and a reload has to prove it
 * rather than a docstring claiming it.**
 *
 * ## What is asserted, and what § D220 § 4 forbids
 *
 * **No metric.** Nothing here reads a figure off a run. What it asserts is presence, structure, the
 * refusal text, and that a value survives a reload.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER, enterEngineerStage, openPage, reopenEngineerMenu } from './browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let page: Page;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    // A port of its own, `strictPort: false` — `keyboard.browser.test.ts`'s reasoning.
    server: { port: 5196, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  origin = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  if (origin === '') throw new Error('the dev server did not report a URL');
  browser = await chromium.launch({ executablePath: CHROMIUM });
  page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
}, 120_000);

afterAll(async () => {
  await page?.close();
  await browser?.close();
  await server?.close();
});

/**
 * What the family block is saying, located the way the mount puts it there.
 *
 * *The element before `.editor-actions`*, which is exactly `elements.save.parentElement?.before(…)`.
 * An id would let the mount stop inserting the block and this file go on passing against a node
 * `index.html` happened to carry — `dispatcherStrip.browser.test.ts`'s rule, applied to the sibling
 * on the other side of the same row.
 */
interface BlockReading {
  readonly found: boolean;
  readonly text: string;
  /** `data-parameter` on every generated input, which is the id the change handler reads. */
  readonly parameters: readonly string[];
  readonly disabled: readonly string[];
}

async function readBlock(): Promise<BlockReading> {
  return page.evaluate(() => {
    const block = document.querySelector('#dispatcher-save')?.parentElement?.previousElementSibling;
    /*
     * `input, select` rather than `[data-parameter]`: `renderControls` puts the id on the wrapping
     * `.control` div **and** on the field inside it, so the bare attribute selector counts every
     * control twice and would let a block of empty wrappers satisfy the count below. The field is
     * what the change handler reads and what a player moves.
     */
    const inputs = [...(block?.querySelectorAll('input[data-parameter], select[data-parameter]') ?? [])];
    return {
      found: block !== null && block !== undefined,
      text: block?.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
      parameters: inputs.map((input) => input.getAttribute('data-parameter') ?? ''),
      disabled: inputs
        .filter((input) => input.hasAttribute('disabled'))
        .map((input) => input.getAttribute('data-parameter') ?? ''),
    };
  });
}

async function openDispatcherEditor(): Promise<void> {
  await page.locator('#rail-open-dispatcher').first().click();
  await page.waitForTimeout(800);
}

describe.skipIf(!HAS_BROWSER)('the dispatcher editor authors the families', () => {
  const pageErrors: string[] = [];

  beforeAll(async () => {
    page.on('pageerror', (error: Error) => pageErrors.push(`${error.name}: ${error.message}`));
    await page.goto(origin, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('canvas')?.width !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    // The page opens on Everyday Mode; this is the player's own way to the Engineer surface.
    await enterEngineerStage(page);
    await reopenEngineerMenu(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await openDispatcherEditor();
  }, 120_000);

  it('is on the page, with a control per declared dimension and a caller per block', async () => {
    const block = await readBlock();
    expect(
      block.found,
      'the family block is not before .editor-actions — the mount did not insert it',
    ).toBe(true);
    expect(block.text).toContain('THE FIVE FAMILIES');
    // Every family's title, so a block that silently stopped rendering is caught by name rather
    // than by a count that could be met by any thirty-seven controls.
    for (const title of [
      'The destination panel',
      'Registration and assignment timing',
      'Operational zoning',
      'Reassignment',
      'Eligibility and hard constraints',
      'The auction',
      'The load sensor',
      'Doors and dwell',
      'Where an idle car waits',
      'The arrival forecast',
      'Cost normalization',
    ]) {
      expect(block.text, `no block titled “${title}”`).toContain(title);
    }
    // § 3.6 rule 2's evidence, on the screen rather than only in a test.
    expect(block.text).toContain('Read by dispatch/policy.ts#resolveDispatchConfig');
    expect(block.text).toContain('createPolicyFor');
    expect(block.text).toContain('resolveLoadSensor');
    expect(block.text).toContain('resolvePredictorConfig');
    // The register's own two exclusions, said rather than absent.
    expect(block.text).toContain('dispatch.callType');
    expect(block.text).toContain('answer.bypassLoadThreshold');

    expect(block.parameters.length).toBeGreaterThan(30);
    expect(block.parameters).toContain('auction.rounds');
    expect(block.parameters).toContain('constraints.noDirectionReversal');
    expect(block.parameters).toContain('dispatch.reassignmentPolicy');
    // The two the flags own are drawn by no control here.
    expect(block.parameters).not.toContain('dispatch.callType');
    expect(block.parameters).not.toContain('answer.bypassLoadThreshold');
  });

  it('draws a gated control disabled rather than hiding it', async () => {
    const block = await readBlock();
    // The viewer opens on a conventional dispatcher, so the destination panel's gate is unmet.
    expect(block.parameters).toContain('dispatch.passengerAssignment');
    expect(block.disabled).toContain('dispatch.passengerAssignment');
    expect(block.text).toContain('dispatch.callType');
  });

  /**
   * A move reaches the document, and a reload does not take it away.
   *
   * The value is written through the panel's own change handler — `select` plus a `change` event,
   * which is what a player's click produces — then saved with the panel's own Save button, then the
   * page is reloaded and the saved dispatcher re-opened. The assertion is on `localStorage`'s own
   * envelope rather than on a redrawn control, because that is the thing issue #113 § 2 said was
   * empty.
   */
  it('files a family move and finds it after a reload — issue #113 § 2, verified', async () => {
    await page.locator('#dispatcher-name').first().fill('Family probe');
    await page.selectOption('select[data-parameter="dispatch.reassignmentPolicy"]', 'continuous');
    await page.waitForTimeout(600);
    await page.locator('#dispatcher-save').first().click();
    await page.waitForTimeout(800);

    const stored = await page.evaluate(() => window.localStorage.getItem('elevator-sim.session'));
    expect(stored, 'nothing was written to the session slot at all').not.toBeNull();
    expect(stored).toContain('Family probe');
    expect(stored).toContain('continuous');

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector('canvas')?.width !== undefined,
      undefined,
      { timeout: 30_000 },
    );
    const after = await page.evaluate(() => {
      const raw = window.localStorage.getItem('elevator-sim.session') ?? '';
      return { raw, hasProbe: raw.includes('Family probe'), hasMove: raw.includes('continuous') };
    });
    expect(
      after.hasProbe,
      'the saved dispatcher did not survive the reload — issue #113 § 2 has reopened',
    ).toBe(true);
    expect(
      after.hasMove,
      'the dispatcher survived and its family value did not, which would mean the value is on the ' +
        'draft rather than on the profile',
    ).toBe(true);
  }, 120_000);

  it('threw nothing on the way through', () => {
    expect(pageErrors).toEqual([]);
  });
});
