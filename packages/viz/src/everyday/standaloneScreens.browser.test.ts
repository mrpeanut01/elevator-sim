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
 * 3. **The tuner is reached from the brief and from nowhere else.** § 3.2 forbids a rail row and
 *    names its two doors as the brief's *Take it to the sandbox* and the report's third lever; the
 *    first is drawn here (`briefView.ts#lockedForScore`) and the second is not, so what this tier
 *    says is the § 3.2 rule in both of its halves — the row and the tile that must not exist, and
 *    the card that must. Its seven controls are driven without a document in `tunerModel.test.ts`.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page, type ViewportSize } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
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
  site = await startShippedSite({ preview: { port: 5211, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** What every case here drove before a viewport was ever an argument. */
const DESKTOP: ViewportSize = { width: 1440, height: 900 };

/**
 * **The shortest viewport `docs/31-support-matrix.md` supports**, which is not 720.
 *
 * The matrix commits to *width* — 360 px and above lays out, below 360 px is tier 4 — and names no
 * height floor at all. The shortest height it records anywhere is the **667** of its tier-2 row
 * *narrow layouts at 375×667, 414×896, 767×700*, driven by hand on 2026-07-30. So 667 is the bound
 * a refusal has to survive, and a screen that only fits at 720 is already outside it.
 */
const SHORTEST_SUPPORTED: ViewportSize = { width: 375, height: 667 };

/**
 * The shortest supported height at a **tier-1** width, which is the one continuously-asserted
 * geometry the matrix has. 375 px wide is a layout nothing gates (issue #240); 1280 px wide is
 * `fold1280.browser.test.ts`'s own viewport with the height taken down to the floor, so a failure
 * here is about the fold rather than about the narrow stylesheet.
 */
const SHORT_DESKTOP: ViewportSize = { width: 1280, height: 667 };

async function coldLoad(viewport: ViewportSize = DESKTOP): Promise<Page> {
  const page = await openPage(browser, { viewport });
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

/** Open § 9.1 from the menu tile — the door a player uses, not a URL. */
async function openRush(page: Page): Promise<void> {
  await page.click('.everyday-mode[data-screen="rush"]');
  await page.waitForSelector('.everyday-rush');
}

/**
 * Where the sentence a player is given for the dead primary actually **is**, in viewport pixels.
 *
 * Found by its words rather than by a class, and that is the point of the helper: the case below
 * is about what a player can read without scrolling, so it must keep asking the question when the
 * sentence moves from one element to another. A version of this keyed on `.everyday-rush-refusal`
 * would have gone green by being deleted.
 *
 * The deepest match wins — ancestors match the same text and would report a box the size of the
 * column.
 */
async function reasonBox(
  page: Page,
  reason: string,
): Promise<{
  readonly where: string;
  readonly top: number;
  readonly bottom: number;
  readonly viewportHeight: number;
  readonly scrolled: number;
  readonly drawnTimes: number;
} | null> {
  return page.evaluate((text) => {
    const nodes = [...document.querySelectorAll<HTMLElement>('body *')].filter(
      (node) => (node.textContent ?? '').trim() === text,
    );
    const node = nodes.at(-1);
    if (node === undefined) return null;
    const box = node.getBoundingClientRect();
    return {
      where: node.className === '' ? node.tagName : node.className,
      top: box.top,
      bottom: box.bottom,
      viewportHeight: window.innerHeight,
      scrolled:
        window.scrollY + (document.querySelector<HTMLElement>('.everyday-screen')?.scrollTop ?? 0),
      drawnTimes: nodes.length,
    };
  }, reason);
}

/**
 * What a screen reader is told about a control — Chromium's own answer, not a re-implementation
 * of the accessible-name computation in the test.
 *
 * Playwright removed `page.accessibility` at 1.62, so this asks the protocol directly. Both halves
 * come back: `name` is the computed accessible name and `description` is what `aria-describedby`
 * or `title` contributes, so a case over this cannot pass by putting the reason somewhere the AX
 * tree does not reach.
 */
async function announced(page: Page, selector: string): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as {
    root: { nodeId: number };
  };
  const { nodeId } = (await cdp.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector,
  })) as { nodeId: number };
  const { nodes } = (await cdp.send('Accessibility.getPartialAXTree', {
    nodeId,
    fetchRelatives: false,
  })) as {
    nodes: readonly {
      readonly name?: { readonly value?: string };
      readonly description?: { readonly value?: string };
    }[];
  };
  return nodes
    .flatMap((node) => [node.name?.value ?? '', node.description?.value ?? ''])
    .join(' ')
    .trim();
}

describe.skipIf(!HAS_BROWSER)('the Endless rush setup screen', () => {
  it('opens from the menu tile and draws § 9.1’s bands off the ramp', async () => {
    const page = await coldLoad();
    await openRush(page);

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

  /**
   * **The standings' fixture marker reaches the page, above the names it is about** — issue #293.
   *
   * The five standings print two invented handles against held times (`delft_vt · wave 19 ·
   * 57 min`), and they are the only place this build prints another player's name against a figure.
   * GAMEPLAY § 20.11 lets an authored fixture ship on a real source or on *"an explicit `FIXTURE`
   * marker so nobody ships them as truth"*; the engine that would be the real source is #220's, so
   * the marker is the whole of the compliance.
   *
   * What #293 found is that the sentence licensing those rows — *"which `RUSH_ABSENCES` says on the
   * same screen"* — had been false since the merge that closed #207 moved the register to Settings.
   * The unit tier now ties the marker to the rows through the import graph, and that is where the
   * argument lives. **This case is here because an import is evidence and not proof**: a module can
   * import a constant and never append it, which is the one failure the unit tier states outright
   * that it cannot see.
   *
   * So the assertion is ordering, not existence. #262 is the precedent that makes the distinction
   * worth paying for on this very screen: a refusal *existed* in the DOM and was 184 px below the
   * fold, and the case asserting it existed was green throughout. A marker underneath five names a
   * reader has already read is that defect again — the belief it exists to prevent has been formed
   * by the time it is met — so what is checked is that it is painted above the first row.
   */
  it('draws the standings under a marker saying they are fixtures, not people (§ 20.11)', async () => {
    const page = await coldLoad();
    await openRush(page);

    const note = await page.textContent('.everyday-rush-bests-note');
    /*
     * Both halves of the marker, because only one of them was ever in doubt. *Not measured* is the
     * claim the old docstring made; *not people* is the one § 20.11 is actually about — the handles
     * read as accounts, and `watch/reference.ts` keeps the rest of the tree to *"a reference run is
     * called the house baseline, not Sam"*.
     */
    expect(note).toContain('not runs this build measured');
    expect(note).toContain('not people who play it');

    /* And the rows it is about really are the unmeasured ones, so the marker is not decorating an
       empty list — `RUSH_BESTS`' two handles, on the page, under it. */
    const rows = await page.$$eval('.everyday-rush-best', (nodes) =>
      nodes.map((node) => node.textContent ?? ''),
    );
    expect(rows).toHaveLength(5);
    expect(rows.join(' ')).toContain('delft_vt');

    const painted = await page.evaluate(() => {
      const marker = document.querySelector('.everyday-rush-bests-note');
      const first = document.querySelector('.everyday-rush-best');
      if (marker === null || first === null) return null;
      return { marker: marker.getBoundingClientRect().bottom, row: first.getBoundingClientRect().top };
    });
    expect(painted).not.toBeNull();
    expect(
      painted === null ? 0 : painted.marker,
      'the marker is painted below the first standings row. § 20.11 asks for a marker on the ' +
        'fixture, and a reader who has already read five names and two held times has formed the ' +
        'belief it exists to prevent — GitHub issue #262 is the same mistake measured in pixels.',
    ).toBeLessThanOrEqual(painted === null ? 0 : painted.row);
    await page.close();
  });

  /**
   * **GitHub issue #262, at the height it was measured at.**
   *
   * This case used to be called *with the refusal on the control* and asserted
   * `.everyday-rush-refusal` — an element on the **screen**, which at 1280 × 720 sits 184 px below
   * the fold while the full-amber primary is pinned at 675 and the note beside it reads *"Nothing
   * to set up. It ends when it ends."*. A player at that viewport had a dead button, a sentence
   * that sounds like confirmation, and no reason anywhere they could see. The test's own name was
   * the claim that went stale first.
   *
   * So it is driven at **1280 × 720** — the shortest height the stylesheet has a block for
   * (`docs/31-support-matrix.md` § 2's breakpoint table: 1339, 1179, 899, 767, 720) and the height
   * #262 measured — and it asserts the reason is **inside the viewport**, by geometry, rather than
   * that an element carrying it exists. Existence is what passed while the defect shipped.
   */
  it('draws `Start the rush` disabled, with the reason on the control and above the fold', async () => {
    const page = await coldLoad();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('.everyday-mode[data-screen="rush"]');
    await page.waitForSelector('.everyday-rush');

    // § 3.3's cells: the rush's own left button, its primary, its note — and no timeline.
    expect(await page.textContent('.everyday-bar-leave')).toBe('⤺ Leave the rush');
    expect(await page.$eval('.everyday-bar-primary', (b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(await page.$('.everyday-bar-timeline')).toBeNull();
    /*
     * **The screen's own paragraph is gone, and this assertion went with it.**
     *
     * It read `expect(await page.textContent('.everyday-rush-refusal')).toMatch(/not built/)` under
     * the comment *"that half was never the defect"* — true when written, and untrue by the time
     * the two independent fixes for #262 were merged. The other one moved the sentence into the bar
     * and deleted the paragraph, on `rushScreen.ts`'s *"one constant, one place on screen"* rule: a
     * copy at the foot of the paper column is a sentence the player has already read above the
     * fold, in a place they may never scroll to.
     *
     * Keeping both would put the reason on screen **twice**, which the fold case below asserts
     * against by name (`drawnTimes`). Green on either branch alone; red together — the merge is
     * what found it.
     */

    /* The control carries the reason: as a tooltip, and by `aria-describedby` — which must resolve
       to a node that is actually in the document, since a description pointing at nothing reads as
       a described control and describes nothing. */
    const described = await page.$eval('.everyday-bar-primary', (button) => {
      const id = button.getAttribute('aria-describedby');
      const target = id === null ? null : document.getElementById(id);
      const box = target?.getBoundingClientRect();
      return {
        title: (button as HTMLButtonElement).title,
        id,
        resolved: target !== null,
        text: target?.textContent ?? '',
        top: box?.top ?? Number.NaN,
        bottom: box?.bottom ?? Number.NaN,
      };
    });
    expect(described.title).toMatch(/not built/);
    expect(described.resolved, `aria-describedby="${String(described.id)}" resolves`).toBe(true);
    expect(described.text).toMatch(/not built/);

    /* **Visible without scrolling, by geometry.** `scrollY` is 0 on a fresh screen, so the
       client rectangle is the viewport rectangle. */
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(described.top, 'the reason is above the top of the viewport').toBeGreaterThanOrEqual(0);
    expect(described.bottom, 'the reason is below the fold at 720 px').toBeLessThanOrEqual(720);

    /* And the sentence that read as confirmation is gone from beside the dead button. */
    expect(await page.textContent('.everyday-bar-note')).not.toContain('Nothing to set up');

    // The reason is in the bar, beside the button it is about.
    expect(await page.textContent('.everyday-bar-note')).toMatch(/not built/);
    /*
     * And § 3.3's own note is **not** what is drawn there. *Nothing to set up. It ends when it
     * ends.* is true of a rush and, next to a button that cannot be pressed, reads as confirmation
     * — which is the half of #262 that has nothing to do with geometry.
     */
    expect(await page.textContent('.everyday-bar-note')).not.toContain('Nothing to set up');
    await page.close();
  });

  /**
   * **The fold case, and the one that reproduces #262 rather than describing it.**
   *
   * Driven at {@link SHORT_DESKTOP} and {@link SHORTEST_SUPPORTED}, at `scrollY: 0`, with nothing
   * scrolled. Measured on the deployed build before the fix, at `scrollY: 0`: the reason's box top
   * was **905.8** in a 720 px viewport and **3443.2** in a 667 px one. A refusal a player cannot
   * read is not a refusal.
   *
   * It asks where **the words** are, not where an element is — see {@link reasonBox}. An assertion
   * that `.everyday-rush-refusal` exists is exactly the check that was already green while this
   * defect shipped.
   */
  it('puts the reason inside the viewport at the shortest height the matrix supports', async () => {
    const reason =
      'the climbing stream is not built — this screen is the setup, and there is nothing behind ' +
      'it to start yet';

    for (const viewport of [SHORT_DESKTOP, SHORTEST_SUPPORTED]) {
      const page = await coldLoad(viewport);
      await openRush(page);

      const box = await reasonBox(page, reason);
      const at = `${String(viewport.width)}×${String(viewport.height)}`;
      expect(box, `${at}: the reason is drawn nowhere`).not.toBeNull();
      /*
       * Not a guard on the harness — a claim about the product, and the one that found the defect.
       *
       * `openRush` clicks the tile. At `375×667` the rush tile is below the fold, so the click
       * scrolls it into view, and the page arrives on the new screen carrying that offset unless
       * something resets it. `shell.ts#go` now does, for every navigation. This case failed on CI
       * and passed here before that fix, because the two Chromiums lay the four-tile menu out a few
       * pixels apart and only one left the tile above the fold — so the assertion is kept at the
       * shortest supported viewport precisely because that is where it bites.
       */
      expect(box?.scrolled, `${at}: the page kept a scroll offset across navigation`).toBe(0);
      expect(box?.viewportHeight).toBe(viewport.height);
      /*
       * *"One constant, one place on screen"* — `rushScreen.ts`'s rule where its own refusal
       * paragraph used to be, which until now was prose and nothing else. A second copy drawn to
       * give the paper column an ending is a sentence a player has already read in the bar.
       */
      expect(box?.drawnTimes, `${at}: the reason is drawn more than once`).toBe(1);
      expect(box?.top, `${at}: the reason starts above the viewport`).toBeGreaterThanOrEqual(0);
      expect(
        box?.bottom,
        `${at}: the reason ends ${String(Math.round((box?.bottom ?? 0) - viewport.height))} px ` +
          `below the fold, in ${box?.where ?? '(nowhere)'}`,
      ).toBeLessThanOrEqual(viewport.height);
      await page.close();
    }
  });

  /**
   * **The keyboard half, which is worse than the geometry half** — #262, and #239's sweep.
   *
   * A `disabled` button is not in the tab order, so a keyboard user never lands on it. Measured
   * before the fix, Chromium's own AX node for this control was `button "Start the rush"` with
   * `disabled=true` and **no description at all**: nothing to announce even to a reader who
   * reaches it in browse mode.
   *
   * The assertion is over the name *and* the description together — {@link announced} — because
   * what matters is whether the reason reaches assistive technology, not which of the two channels
   * carries it. See `rushScreenModel.ts#rushBarModel` for why it is the name here and what it
   * would take to make it the description.
   */
  it('says on the control itself that it cannot be pressed', async () => {
    const page = await coldLoad();
    await openRush(page);

    expect(await announced(page, '.everyday-bar-primary')).toMatch(/not built/);
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

  /**
   * **The register moved, so this case follows it across the two screens.**
   *
   * It used to assert that the drawing board drew three or more register rows of its own. GitHub
   * issue #207 draws every register on one build-information panel reached from Settings, so what
   * a page can now prove is the pair: the board does **not** carry the block, and the panel that
   * took it over really carries the board's rows. Asserting only the first half would pass just as
   * well if the register had been deleted outright, which is the failure this pairing exists to
   * make impossible.
   */
  it('says nothing here is scored, and leaves the register to the build-information panel', async () => {
    const page = await coldLoad();
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer');
    expect(await page.textContent('.everyday-bar-note')).toBe(
      'Nothing here is scored. It is a drawing board.',
    );
    expect(await page.textContent('.everyday-bar-primary')).toBe('Run a day in it');
    expect(await page.$$eval('.everyday-designer-absences', (blocks) => blocks.length)).toBe(0);

    /*
     * GitHub issue #283's pairing, and it is the half a deletion usually loses. Two rows left the
     * register because they named where a capability is *authored* rather than a thing this build
     * cannot do. The words did not leave with them: each stands beside the control a reader would
     * otherwise mistake for it, which is the only reason deleting the rows was not a loss.
     */
    expect(await page.textContent('.everyday-designer-service-scope')).toContain('building editor');
    expect(await page.textContent('.everyday-designer-machine-owner')).toContain('machine editor');

    /* The rail's bordered gear row — the one Settings destination, as `settingsScreen.browser.test.ts` reaches it. */
    await page.click('.everyday-rail-settings');
    await page.waitForSelector('.everyday-settings-build-notes');
    const rows = await page.$$eval('.everyday-settings-build-notes li', (items) =>
      items.map((item) => item.textContent ?? ''),
    );
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.some((row) => row.includes('escalator rows'))).toBe(true);
    /* And the other direction: the panel no longer offers either as something the build lacks. */
    expect(rows.some((row) => row.includes('credential dots'))).toBe(false);
    expect(rows.some((row) => row.includes('sky-lobby starter'))).toBe(false);
    await page.close();
  });
});

describe.skipIf(!HAS_BROWSER)('Tune the tower', () => {
  /*
   * **The tuner has exactly one shipped door, and these three cases pin all three halves of that.**
   *
   * § 3.2 forbids a rail row — *it is a thing you do to a day, not a place you live* — and names its
   * two entrances: the brief's *Take it to the sandbox* and the report's third lever.
   *
   * On the lane that built this screen neither entrance existed, so this section said the screen was
   * registered, routable and reachable by no control. That stopped being true on the merge that put
   * it beside § 6.2's brief: the card is drawn and it navigates, so *no control opens it* is now the
   * § D227 defect rather than the honest reading, and the case that asserted it has been inverted
   * rather than deleted. What is still missing is the report's lever, and that half is named in
   * the shell's register of absences (`everyday/buildNotes.ts`) rather than closed with the rail row
   * this section forbids.
   *
   * So what is checked here is the rule in both directions: no rail row, no mode tile, and a working
   * card on the brief. The screen's own behaviour — the seven controls, what each writes, the
   * sandbox strip and § 3.3's two-state note — is in `tunerModel.test.ts`, driven without a document.
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

  it('is not on a mode tile either — the menu picks modes, and this is not one', async () => {
    const page = await coldLoad();
    const tiles = await page.$$eval('.everyday-mode', (nodes) =>
      nodes.map((node) => node.getAttribute('data-screen') ?? ''),
    );
    expect(tiles).not.toContain('tuner');
    await page.close();
  });

  it('opens from the brief’s *Take it to the sandbox* card — its one shipped door', async () => {
    /*
     * **The case the two above needed.** Without it this section asserts only where the tuner is
     * *not* reachable from, which a screen nothing can open would pass just as well — and did, on
     * the branch that wrote them. § 3.2's rule has two halves and this is the one that says the
     * screen is part of the product.
     *
     * Driven through the player's own path: the front tile, § 6.2's brief, the card's button. A test
     * that navigated by calling `go('tuner')` would be reaching past the product, which is the thing
     * this tier exists not to do.
     */
    const page = await coldLoad();
    await page.click('.everyday-mode[data-screen="door"]');
    await page.waitForSelector('.everyday-door');
    await page.click('.everyday-bar-primary');
    await page.waitForSelector('.everyday-brief');

    // The card states the three fixed things and no longer refuses the screen behind them.
    expect(await page.textContent('.everyday-brief-locked-why')).not.toMatch(/not built/);
    await page.click('.everyday-brief-locked-go');
    await page.waitForSelector('.everyday-tuner');
    expect(await page.textContent('.everyday-tuner h1')).toBe('Tune the tower');
    await page.close();
  });
});
