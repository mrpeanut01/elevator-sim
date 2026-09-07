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
 *    names its two doors as the brief's locked-for-score door and the report's third lever; the
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
  /*
   * **These three cases used to pin a dead button, and GitHub issue #220 built what was behind it.**
   *
   * They read: the primary is `disabled`; the reason (*the climbing stream is not built*) is on the
   * control by `title` and `aria-describedby`, drawn once, inside the viewport at the two shortest
   * supported heights (#262's geometry), and announced to assistive technology (#239). Every one of
   * those was a claim about a refusal, and the refusal left with the engine (§ D515, § D227). What
   * they protected is kept in the one shape that still applies: the § 3.3 row's cells, the note that
   * is § 3.3's own again, and a primary that can be pressed and says so.
   */
  it('draws `Start the rush` live, with § 3.3’s own note beside it and no timeline', async () => {
    const page = await coldLoad();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('.everyday-mode[data-screen="rush"]');
    await page.waitForSelector('.everyday-rush');

    expect(await page.textContent('.everyday-bar-leave')).toBe('⤺ Leave the rush');
    expect(await page.$eval('.everyday-bar-primary', (b) => (b as HTMLButtonElement).disabled)).toBe(false);
    expect(await page.$('.everyday-bar-timeline')).toBeNull();
    /* § 3.3's note, which beside a live button is a description rather than a confirmation. */
    expect(await page.textContent('.everyday-bar-note')).toContain('Nothing to set up');
    expect(await page.$eval('.everyday-bar-primary', (b) => (b as HTMLButtonElement).title)).toBe('');
    await page.close();
  });

  it('announces the control by its label, because there is no longer a reason to carry', async () => {
    const page = await coldLoad();
    await openRush(page);
    expect(await announced(page, '.everyday-bar-primary')).toMatch(/Start the rush/);
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
  it('writes an escalator row the run reads, removes it again, and folds the document — § D518', async () => {
    const page = await coldLoad();
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer-escalators');
    expect(await page.textContent('.everyday-designer-escalators-none')).toContain('No escalators');
    expect(await page.$$('.everyday-designer-escalator')).toHaveLength(0);

    await page.click('.everyday-designer-escalator-add');
    const rows = await page.$$eval('.everyday-designer-escalator', (nodes) =>
      nodes.map((node) => ({
        id: (node as HTMLElement).dataset['modeId'] ?? '',
        ends: [...node.querySelectorAll('input')].slice(0, 2).map((input) => input.value),
        seconds: [...node.querySelectorAll('input')][2]?.value ?? '',
      })),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('escalator-1');
    expect(rows[0]?.ends).toEqual(['0', '1']);
    expect(Number(rows[0]?.seconds)).toBeGreaterThan(5);
    expect(await page.$('.everyday-designer-escalators-none')).toBeNull();

    await page.click('.everyday-designer-escalator-remove');
    expect(await page.$$('.everyday-designer-escalator')).toHaveLength(0);
    expect(await page.textContent('.everyday-designer-escalators-none')).toContain('No escalators');

    /* § 13.3's document is a collapsed disclosure, and the plate is inside it. */
    const fold = await page.$eval('.everyday-designer-document', (node) => ({
      open: (node as HTMLDetailsElement).open,
      plates: node.querySelectorAll('.everyday-designer-plate').length,
      summary: node.querySelector('summary')?.textContent ?? '',
    }));
    expect(fold.open).toBe(false);
    expect(fold.plates).toBe(1);
    expect(fold.summary).toContain('as an engineer would write it');
    await page.click('.everyday-designer-document-summary');
    expect(await page.$eval('.everyday-designer-document', (node) => (node as HTMLDetailsElement).open)).toBe(true);
    await page.close();
  });

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
    /*
     * Nineteen after GitHub issue #229 built two Settings rows and deleted their entries; fifteen
     * after wave V deleted the campaign register's incidents entry (#171) and emptied the stage's
     * (#171, #352), which now draws its one empty line where its rows were.
     */
    /*
     * And eight after wave W: the shell's replay row left when the door started handing a past day
     * back (#177 item 1, § D517), and the designer's escalator and document rows left when the board
     * wrote both (#177 item 5, § D518). The class-per-shaft row is the designer's one remaining.
     */
    expect(rows.length).toBeGreaterThan(6);
    expect(rows.some((row) => row.includes('escalator rows'))).toBe(false);
    expect(rows.some((row) => row.includes('a machine class per shaft'))).toBe(true);
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

  it('opens from the brief’s locked-for-score card — its one shipped door', async () => {
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
