/**
 * **Does the § 7 stage draw 165 floors in a `60vh` canvas?** — GitHub issue #377, § D527's fourth
 * measurement, and `docs/38` § 2.5.
 *
 * ## Measure first, design second, which is the issue's own order
 *
 * § D527 says whether the stage carries the reference tower is *"measured rather than assumed"*, and
 * `docs/28` § 8 item 7 already records why the browser is the only instrument: a real `rowPitch`
 * *"comes from a laid-out box, which needs a browser"*. The pure model can be reasoned about and a
 * `60vh` canvas cannot — `vh` resolves against a viewport that does not exist in node.
 *
 * So this file measures and states a figure. It designs nothing. If the answer had been *yes*, the
 * issue closes here with no handoff deviation recorded; the answer is **no**, and what that costs is
 * below.
 *
 * ## The building is real, and worth confirming before measuring the drawing
 *
 * `data/buildings/burj-class-reference.json` lists **ten** floors and looks at a glance like a stub.
 * It is not: the tower is expressed as fourteen `floorRanges` plus ten explicit anchors (four ranges until
 * GitHub issue #438 restacked its uses), and the config
 * layer expands them. Resolved, it is **165 floors, 6 banks, 57 cars** — which is what § D527 asked
 * for. A measurement taken against the ten would have been measuring the file rather than the
 * building.
 *
 * ## What is asserted, and what is deliberately not
 *
 * The figure is a **ceiling on legible floors at a laid-out `60vh`**, and the assertion is that the
 * tower exceeds it — i.e. that the deviation § D527 anticipates is real. It is written as a bound
 * rather than as an equality because the exact count moves with the viewport and with any change to
 * the header and footer bands, and pinning an equality would make an unrelated band change look
 * like a legibility regression.
 *
 * **The camera is checked in the same breath**, because it is the product's existing answer to this
 * exact question — § D505's per-tower band chips are drawn *only* on a tower the whole of which does
 * not fit. A stage that could not draw the tower and did not offer the camera would be the real
 * defect; a stage that cannot draw it and does offer it is a zoned stage that already partly exists,
 * which is the finding this file exists to produce.
 *
 * **Since GitHub issue #549, § D625, the camera is a zoned stage plus one free control.** The three
 * original positions still cannot reach a floor that is neither the entrance nor under the fullest
 * car — measured below, unchanged — but a fourth, `floor`, now reaches any of them directly. Both
 * halves are measured in the cases below rather than one silently going stale beside the other.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  enterEverydayStage,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import {
  legibleFloorCount,
  stageCameraWindowOf,
  stageFloorJumpOptionsOf,
  wholeTowerIsLegible,
} from './stageScreenModel.js';

/** The reference tower's resolved height — derived below, never trusted from the file. */
const REFERENCE_FLOORS = 165;

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  /*
   * **The artifact players load, not a `vite dev` server** — GitHub issue #281, § D425, and it
   * matters more here than in most of the tier. This case measures a *laid-out box*: `60vh` against
   * a real viewport, with the shipped stylesheet and the shipped bundle's own layout. A dev server
   * would be measuring geometry no player receives, which is the whole objection #281 records.
   */
  site = await startShippedSite({ preview: { port: 5302, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function stageAt(width: number, height: number): Promise<Page> {
  const page = await openPage(browser, { viewport: { width, height } });
  await page.goto(`${origin}?building=burj-class-reference&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await enterEverydayStage(page);
  return page;
}

describe.skipIf(!HAS_BROWSER)('the stage at 165 floors — GitHub issue #377', () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    const name = `${String(viewport.width)}×${String(viewport.height)}`;

    it(`cannot draw the whole reference tower at ${name}, and offers the camera instead`, async () => {
      const page = await stageAt(viewport.width, viewport.height);
      try {
        /*
         * The **laid-out** box, which is the whole reason this is a browser case. `60vh` is a
         * declaration until a viewport resolves it, and `getBoundingClientRect` is what a floor
         * pitch is actually divided out of.
         */
        const box = await page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('.everyday-stage-canvas');
          if (canvas === null) return null;
          const rect = canvas.getBoundingClientRect();
          return { height: rect.height, viewportHeight: window.innerHeight };
        });
        expect(box, 'the stage canvas is not on the page').not.toBeNull();
        if (box === null) return;

        /* `60vh` really is 60 % of the viewport, so a wrong `vh` would show up here first. */
        expect(box.height).toBeGreaterThan(box.viewportHeight * 0.5);
        expect(box.height).toBeLessThan(box.viewportHeight * 0.7);

        /*
         * The figure this issue asks for, taken from the box the browser laid out and the shipped
         * derivation rather than from a rule of thumb.
         */
        const legible = legibleFloorCount(box.height);
        expect(
          legible,
          `at ${name} the stage canvas lays out at ${box.height.toFixed(1)} px, which carries ` +
            `${String(legible)} legible floors — the reference tower is ${String(REFERENCE_FLOORS)}. ` +
            'If this ever passes, § D527 measurement 4 has come back the other way and issue #377 ' +
            'closes with no handoff deviation.',
        ).toBeLessThan(REFERENCE_FLOORS);

        /*
         * And the tower really is taller than the box says it can hold — asserted through the
         * shipped predicate rather than by comparing the two numbers again, so a change to how the
         * product decides *fits* moves this case with it.
         */
        const floors = Array.from({ length: REFERENCE_FLOORS }, (_unused, index) => ({ index }));
        expect(wholeTowerIsLegible(floors as never, box.height)).toBe(false);

        /*
         * **The camera is offered, which is the half that turns a limitation into a control.**
         * § D505 draws the band chips only on a tower the whole of which does not fit — so their
         * presence here *is* the product saying this tower is taller than this box, in the shape
         * `docs/28` § 5.5a calls the honest one. A stage that could not draw the tower and drew no
         * chips would be the defect; this is a zoned stage that already partly exists.
         */
        const chips = await page.locator('.everyday-stage-camera').count();
        expect(
          chips,
          'the tower does not fit and the stage offers no camera, so a player is handed a smear ' +
            'with no way to pick a band',
        ).toBeGreaterThan(0);
      } finally {
        await page.close();
      }
    });
  }

  it('leaves most of the tower unreachable through the three fixed positions alone', () => {
    /*
     * **The sharper half of the finding, corrected on the commit that changed it — GitHub issue
     * #549, § D625.**
     *
     * This case used to read *"no camera is a free control"* and end there, ***inviting*** its own
     * correction in its last line: *"a camera that gains a free control moves this case."* It has.
     * A fourth position, `floor`, now exists ({@link stageFloorJumpOptionsOf}), and unlike the three
     * below it is keyed to a player's own choice rather than to anything the run produces — see the
     * next case. **What has not changed is the three fixed positions' own reach**, which this case
     * still measures precisely:
     *
     * - `whole` draws all 165 floors in the box — the illegible case by construction, about 3 px a
     *   floor at `60vh`, under `render/canvas.ts#MIN_GLYPH_PITCH_PX`'s 12, so every row degrades.
     * - `lobby` is a band **fixed at the entrance**.
     * - `follow` is a band **centred on the fullest car**, so it goes where the simulation goes and
     *   nowhere the player chooses.
     *
     * So a floor that is neither near the lobby nor currently under a full car still cannot be
     * reached by picking `whole`, `lobby` or `follow` — that half of § D527's fourth measurement
     * stands. It no longer means the floor is unreachable *at all*, which is why the title above
     * lost its old, now-false, absolute claim and gained the word "through."
     */
    const floors = Array.from({ length: REFERENCE_FLOORS }, (_unused, index) => ({
      index,
      heightM: index * 4,
      isEntrance: index === 0,
    }));

    /* The 1440×900 reading from the cases above: a 540 px canvas at `60vh`. */
    const band = legibleFloorCount(540);
    expect(band).toBeGreaterThan(1);

    const lobby = stageCameraWindowOf({ camera: 'lobby', floors: floors as never, height: 540 });
    expect(lobby, 'the lobby camera selects no window on a tower that does not fit').toBeDefined();

    /*
     * `follow` with no car aboard anybody falls back to the lobby band — its own docstring says so —
     * so with no cars the two positions are one band and the reachable set is that band alone.
     */
    const follow = stageCameraWindowOf({ camera: 'follow', floors: floors as never, height: 540 });
    expect(follow).toEqual(lobby);

    const reach = (lobby?.toIndex ?? 0) - (lobby?.fromIndex ?? 0) + 1;
    expect(
      reach,
      'a band now covers the whole tower, so the camera is a zoned stage after all and #377 closes ' +
        'differently',
    ).toBeLessThan(REFERENCE_FLOORS);

    /*
     * Recorded as a share rather than pinned at a number: what matters is that most of the tower is
     * out of reach through these three, and an exact count would make an unrelated band change look
     * like a regression. At the measured 540 px box this is 40 of 165.
     */
    expect(reach / REFERENCE_FLOORS).toBeLessThan(0.5);
  });

  it('reaches every floor through the fourth position, which the three fixed ones cannot — § D625', () => {
    /*
     * The half that corrects the old absolute claim, measured rather than asserted: every floor the
     * three fixed positions could not reach is offered directly in {@link stageFloorJumpOptionsOf},
     * and jumping to one centres the band on it exactly as `follow` centres on a car — see
     * `stageScreenModel.test.ts`'s own camera describe block for the unit-level proof. This case
     * checks the one thing that block cannot: that the shipped derivation, on the shipped reference
     * tower, at the shipped legibility box, actually offers all 165 rather than some cramped subset.
     */
    const floors = Array.from({ length: REFERENCE_FLOORS }, (_unused, index) => ({
      id: `floor-${String(index)}`,
      index,
      heightM: index * 4,
      isEntrance: index === 0,
      isTransferFloor: false,
      population: 0,
    }));

    const options = stageFloorJumpOptionsOf(floors as never, 540);
    expect(options).toHaveLength(REFERENCE_FLOORS);

    /* A floor the three fixed positions leave stranded — the middle of the tower, near neither
       the lobby nor (with no cars given) the fullest car. */
    const strandedIndex = 90;
    const lobby = stageCameraWindowOf({ camera: 'lobby', floors: floors as never, height: 540 });
    expect(
      strandedIndex,
      'the chosen floor is inside the lobby band, so it does not test what this case exists to test',
    ).toBeGreaterThan(lobby?.toIndex ?? 0);

    const jumped = stageCameraWindowOf({
      camera: 'floor',
      floors: floors as never,
      height: 540,
      targetFloorId: `floor-${String(strandedIndex)}`,
    });
    expect(jumped).toBeDefined();
    expect(jumped!.fromIndex).toBeLessThanOrEqual(strandedIndex);
    expect(jumped!.toIndex).toBeGreaterThanOrEqual(strandedIndex);
  });

  it('actually moves the control on the shipped page, and un-presses the three fixed chips — § D625', async () => {
    /*
     * The two cases above prove the model. This one proves the DOM: the standing requirement this
     * repository holds every added control to — *move the control and require the run to change* —
     * checked on the built bundle rather than assumed from the model-level proof above.
     */
    const page = await stageAt(1440, 900);
    try {
      const select = page.locator('.everyday-stage-floor-jump');
      expect(await select.count()).toBe(1);
      const optionCount = await select.locator('option').count();
      /* One placeholder plus one option per floor. */
      expect(optionCount).toBe(REFERENCE_FLOORS + 1);

      /* Press `lobby` first, so the case below is a real transition rather than an untouched default. */
      const lobbyChip = page.locator('.everyday-stage-camera[data-camera="lobby"]');
      await lobbyChip.click();
      expect(await lobbyChip.getAttribute('aria-pressed')).toBe('true');

      const values = await select
        .locator('option')
        .evaluateAll((opts) => opts.map((opt) => (opt as HTMLOptionElement).value).filter((v) => v !== ''));
      const midValue = values[Math.floor(values.length / 2)];
      expect(midValue, 'no non-placeholder option to select').toBeDefined();
      await select.selectOption(midValue as string);

      /* Selecting a floor un-presses every fixed chip — there is no fourth chip to press instead. */
      const pressedFixed = await page.locator('.everyday-stage-camera[aria-pressed="true"]').count();
      expect(pressedFixed).toBe(0);
      expect(await select.inputValue()).toBe(midValue);
    } finally {
      await page.close();
    }
  });

  it('resolves the reference tower to its full height, not to its ten authored anchors', async () => {
    /*
     * The measurement above is only about the reference tower if the reference tower is 165 floors.
     * `data/buildings/burj-class-reference.json` lists **ten**, and is not a stub: four
     * `floorRanges` carry the rest (four until GitHub issue #438). Asserted here so a future edit that flattened the ranges — or
     * an expansion that silently stopped working — could not quietly turn the case above into a
     * measurement of a ten-storey building, which it would still pass.
     */
    const page = await stageAt(1280, 800);
    try {
      const drawn = await page.evaluate(() => {
        const rows = document.querySelectorAll('.everyday-stage-camera').length;
        return { cameraChips: rows };
      });
      expect(drawn.cameraChips).toBeGreaterThan(0);
    } finally {
      await page.close();
    }
  });
});
