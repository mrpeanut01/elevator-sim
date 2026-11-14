/**
 * **The rush setup, the drawing board and the tuner, driven on the page.**
 *
 * Three things a node tier cannot vouch for, one per screen:
 *
 * 1. **The rush tile now opens**, and its § 3.3 primary is drawn *disabled* rather than live over
 *    an engine that does not exist. A model test can assert `inert`; only a page proves the shell
 *    draws it as a button nobody can press.
 * 2. **The designer's controls reach the closed form through the mount.** The figures are
 *    re-derived on every edit, so adding a shaft must move the printed interval — the standing
 *    requirement, checked on the drawn figure rather than on an internal field — and a press on the
 *    drawing itself must change which floors a shaft opens at.
 * 3. **The tuner is reached from the brief and from nowhere else.** § 3.2 forbids a rail row and
 *    names its two doors as the brief's locked-for-score door and the report's third lever; the
 *    first is drawn here (`briefView.ts#lockedForScore`) and the second is not, so what this tier
 *    says is the § 3.2 rule in both of its halves — the row and the tile that must not exist, and
 *    the card that must. Its seven controls are driven without a document in `tunerModel.test.ts`.
 *
 * Pattern and gate are `settingsScreen.browser.test.ts`'s; no metric is read (§ D220 § 4).
 */

import { chromium, type Browser, type Page, type ViewportSize } from 'playwright-core';
import {
  leaveTutorialIfOffered,
  openScenarioEntry,
  leaveLobbyIfShown,
} from '../dev/browserTier.test-helper.js';
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
  /* § D1445: a cold launch opens the lobby, which steps the rail aside; *Main menu* brings it back. */
  await leaveLobbyIfShown(page);
  return page;
}

/** A rail row, by its § 3.2 label — the rows carry no class of their own. */
async function railRow(page: Page, label: string): Promise<void> {
  await page.click(`nav.everyday-rail button:has-text("${label}")`);
}

/** Open § 9.1 from the menu tile — the door a player uses, not a URL. */
async function openRush(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  await page.click('.everyday-mode[data-screen="rush"]');
  await page.waitForSelector('.everyday-rush');
  /* § D1636: the classic climb, the card whose line is forty and whose rows the house ran. */
  await page.locator('.everyday-rush-model[data-model="climb"]').click();
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

    // § 20.5's line on the classic card, one sentence carrying both figures; the bands above and the
    // long account are behind *How rush works* since § D1636.
    expect(await page.textContent('.everyday-rush-hold')).toContain('over 2 minutes');
    expect(await page.textContent('.everyday-rush-hold')).toContain('Ends when 40 people have waited over 2 minutes at once.');
    await page.close();
  });

  /**
   * **The house's standings reach the page, under the note that says what they are** — GitHub issue
   * #418, § D547.
   *
   * This case held the handoff's five fixtures under a marker saying they were fixtures (#293). The
   * rows are the house's measured runs now: one per shipped dispatcher on the standing building, each
   * tagged `house`, under a note saying nobody played them and that their order ranks nothing. The
   * unit tier holds the view and its one renderer; this holds the page, because an import is evidence
   * and not proof — a module can import a view and never append it.
   *
   * So the assertions are the page's: both halves of the note, a `house` tag inside every row, and
   * the note painted above the first row. #262 is the precedent on this very screen for why the last
   * one is worth paying for: a disclosure a reader meets after the names has already failed.
   */
  it('draws the house’s runs under a note saying nobody played them (§ 20.11, #418)', async () => {
    const page = await coldLoad();
    await openRush(page);

    const note = await page.textContent('.everyday-rush-house-note');
    expect(note).toContain('Nobody played them');
    expect(note).toContain('does not rank the dispatchers');

    const rows = await page.$$eval('.everyday-rush-best', (nodes) =>
      nodes.map((node) => node.querySelector('.everyday-rush-best-house')?.textContent ?? ''),
    );
    /* Every shipped dispatcher, and not a list of one: the table has thirteen per tower. */
    expect(rows.length).toBeGreaterThan(1);
    for (const tag of rows) expect(tag).toBe('house');

    const painted = await page.evaluate(() => {
      const marker = document.querySelector('.everyday-rush-house-note');
      const first = document.querySelector('.everyday-rush-best');
      if (marker === null || first === null) return null;
      return { marker: marker.getBoundingClientRect().bottom, row: first.getBoundingClientRect().top };
    });
    expect(painted).not.toBeNull();
    expect(
      painted === null ? 0 : painted.marker,
      'the house note is painted below the first standings row. A reader who has already read the ' +
        'names has formed the belief the note exists to correct — GitHub issue #262 is the same ' +
        'mistake measured in pixels.',
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
    await leaveTutorialIfOffered(page);
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
  /** Open the board on its simplest starting point: twelve floors, four lifts that stop everywhere. */
  async function openBoard(page: Page, template = 'blank'): Promise<void> {
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer');
    await page.click(`.everyday-designer-template[data-template="${template}"]`);
    await page.waitForSelector('.everyday-designer-svg');
  }

  const figureOf = async (page: Page, label: string): Promise<string> =>
    (await page.$$eval(
      '.everyday-designer-figure',
      (cells, wanted) => {
        const cell = cells.find((node) => node.textContent?.includes(wanted));
        return cell?.querySelector('.everyday-designer-figure-value')?.textContent ?? '';
      },
      label,
    )) ?? '';

  /** What the chip over each shaft says about it — its reach, its class and anything unusual. */
  const chips = async (page: Page): Promise<string[]> =>
    page.$$eval('.everyday-designer-shaft-chip', (nodes) => nodes.map((node) => (node as HTMLElement).title));

  const groups = async (page: Page): Promise<string[]> =>
    page.$$eval('.everyday-designer-group', (nodes) => nodes.map((node) => node.textContent ?? ''));

  it('draws the building, and re-derives the figures when a shaft is added', async () => {
    const page = await coldLoad();
    await openBoard(page);
    /* The drawing is the screen: one letter over each shaft, and a group row under it. */
    expect(await page.$$eval('.everyday-designer-svg text', (nodes) => nodes.map((node) => node.textContent))).toEqual(
      expect.arrayContaining(['A', 'B', 'C', 'D', 'G', '12']),
    );
    expect(await groups(page)).toHaveLength(1);

    const before = await figureOf(page, 'Interval');
    expect(before).toMatch(/^[\d.]+ s$/);
    /*
     * One more shaft to the roof re-runs `analyzeUpPeak` over the drawn plan, so the printed
     * interval must move: more cars over the same round trip is a shorter interval, which is the
     * one thing the closed form is certain about.
     */
    await page.click('.everyday-designer-add-full');
    const after = await figureOf(page, 'Interval');
    expect(Number.parseFloat(after)).toBeLessThan(Number.parseFloat(before));
    expect(await chips(page)).toHaveLength(5);
    expect(await figureOf(page, 'Lifts')).toBe('5');
    await page.close();
  });

  it('stands a short block apart, and fits a stair, a panel, a kept floor and a slower descent', async () => {
    const page = await coldLoad();
    await openBoard(page, 'podium');
    const structures = async (): Promise<number> => page.$$eval('.everyday-designer-shaft-chip', (nodes) => nodes.length);
    const before = (await groups(page)).length;
    await page.click('.everyday-designer-shaft-chip[data-k="shaft:s5"]');
    expect(await page.textContent('.everyday-designer-wing')).toBe('Stand apart on the other side');
    await page.click('.everyday-designer-wing');
    expect(await groups(page)).toHaveLength(before + 1);
    expect(await page.textContent('.everyday-designer-wing')).toBe('Rejoin the first block');
    expect(await structures()).toBe(9);

    /* A slower descent is offered from the class's own steps, below the rated speed only. */
    await page.click('.everyday-designer-tab[data-step="lifts"]');
    expect(await page.getAttribute('.everyday-designer-descent[data-k="descent:0"]', 'aria-pressed')).toBe('true');

    await page.click('.everyday-designer-tab[data-step="floors"]');
    await page.fill('.everyday-designer-number[data-k="number:First floor picked"]', '3');
    await page.keyboard.press('Tab');
    /* The form opens filled in for this floor height, and a stair is refused, in words, with a blank. */
    expect(
      Number(await page.inputValue('.everyday-designer-draft[data-k="draft:Seconds to walk up"]')),
    ).toBeGreaterThan(0);
    await page.fill('.everyday-designer-draft[data-k="draft:Percent who walk up"]', '');
    await page.click('.everyday-designer-stairs-add');
    expect(await page.textContent('.everyday-designer-stairs-refused')).toContain('Fill in all four');
    for (const [label, value] of [
      ['Seconds to walk up', '30'],
      ['Seconds to walk down', '22'],
      ['Percent who walk up', '20'],
      ['Percent who walk down', '45'],
    ] as const) {
      await page.fill(`.everyday-designer-draft[data-k="draft:${label}"]`, value);
    }
    await page.click('.everyday-designer-stairs-add');
    expect(await page.textContent('.everyday-designer-stairs-line')).toBe(
      '30.0 s up and 22.0 s down · 20% walk up and 45% walk down',
    );
    expect(await page.$('.everyday-designer-warning-blocker')).toBeNull();

    await page.click('.everyday-designer-panel[data-k="panel:destination-entry"]');
    expect(await page.getAttribute('.everyday-designer-panel[data-k="panel:destination-entry"]', 'aria-pressed')).toBe('true');

    expect(await page.textContent('.everyday-designer-access-open')).toBe('Anybody may travel here.');
    await page.fill('.everyday-designer-draft[data-k="draft:Name of the group"]', 'staff');
    await page.click('.everyday-designer-access-add');
    expect(await page.textContent('.everyday-designer-access-zone')).toContain('staff only');
    await page.click('.everyday-designer-access-lift');
    expect(await page.textContent('.everyday-designer-access-open')).toBe('Anybody may travel here.');
    await page.close();
  });

  it('makes a shorter shaft a wing, and gives the wider floors more people', async () => {
    const page = await coldLoad();
    await openBoard(page);
    const before = await figureOf(page, 'People');
    /* A shaft that stops short of the roof stands beside the core, and the floors it passes widen. */
    await page.click('.everyday-designer-add-short');
    expect(Number(await figureOf(page, 'People'))).toBeGreaterThan(Number(before));
    expect((await chips(page)).at(-1)).toContain('G to 6');
    /* Two groups now: the shaft that stops at 6 does not open onto the same floors as the rest. */
    expect(await groups(page)).toHaveLength(2);
    await page.close();
  });

  it('offers rated speed as steps within the class, and names both numbers past the class', async () => {
    const page = await coldLoad();
    await openBoard(page);
    await page.click('.everyday-designer-pick-all');
    await page.click('.everyday-designer-tab[data-step="lifts"]');

    const steps = await page.$$eval('.everyday-designer-step', (nodes) => nodes.map((node) => node.textContent ?? ''));
    expect(steps.length).toBeGreaterThan(1);
    // § 10.1: steps, never a free number — every speed chip is a catalogue value in m/s.
    expect(steps.some((chip) => /m\/s$/.test(chip))).toBe(true);

    // Hanging the hydraulic class in every shaft re-prints each chip and the plate's class row.
    await page.click('.everyday-designer-class:has-text("Hydraulic")');
    expect((await chips(page)).every((chip) => chip.includes('Hydraulic'))).toBe(true);
    await page.click('.everyday-designer-document-summary');
    expect(await page.textContent('.everyday-designer-plate')).toContain('Hydraulic');
    /*
     * Hydraulic is rated to six floors and eighteen metres, so a twelve-storey shaft raises the
     * class warning — and the guide requires it to name **both** numbers: what the shafts travel,
     * and what the class is rated for.
     */
    const warning = await page.textContent('.everyday-designer-warning-class');
    expect(warning).toMatch(/Shafts A B C D travel up to 12 floors/);
    expect(warning).toContain('rated to 6 floors');
    await page.close();
  });

  /**
   * **One shaft's machine, driven.** The seam `staleRefusals.test.ts` can only grep for: the screen
   * names `withPlanMachineClass`, and a grep passes when the listener writes the wrong shaft. Here
   * shaft **B** is picked on the page and given a class through the shipped chips, and the
   * assertion is *that shaft and no other*.
   */
  it('gives one shaft a machine of its own, and leaves the three beside it alone', async () => {
    const page = await coldLoad();
    await openBoard(page);
    const blank = await chips(page);
    expect(new Set(blank.map((chip) => chip.replace(/^[^·]+· /, ''))).size, 'one machine in all four').toBe(1);

    await page.click('.everyday-designer-shaft-chip[data-k="shaft:s2"]');
    await page.click('.everyday-designer-tab[data-step="lifts"]');
    await page.click('.everyday-designer-class:has-text("Hydraulic")');
    const one = await chips(page);
    expect(one[1]).toContain('Hydraulic');
    for (const other of [0, 2, 3]) expect(one[other], `shaft ${String(other)}`).toBe(blank[other]);

    /* A second deck on that shaft alone: it leaves its group, and the chip says what it is. */
    await page.click('.everyday-designer-decks[data-k="decks:2"]');
    expect((await chips(page))[1]).toContain('double-deck');
    expect(await groups(page)).toHaveLength(2);
    /* Two cars and two decks cannot share a shaft, so asking for the pair takes the deck back off. */
    await page.click('.everyday-designer-cars[data-k="cars:2"]');
    const paired = (await chips(page))[1] ?? '';
    expect(paired).toContain('two cars');
    expect(paired).not.toContain('double-deck');
    expect(await figureOf(page, 'Lifts')).toBe('5');
    /* The pair's group says in its own row why it has no interval, and names no figure. */
    const rows = await groups(page);
    expect(rows.some((row) => row.includes('Not worked out for a group with two cars in one shaft'))).toBe(true);
    await page.close();
  });

  it('opens and closes a shaft’s doors from a press on the drawing itself', async () => {
    const page = await coldLoad();
    await openBoard(page);
    await page.click('.everyday-designer-shaft-chip[data-k="shaft:s1"]');
    await page.click('.everyday-designer-tab[data-step="service"]');
    expect(await page.textContent('.everyday-designer-service-line')).toContain('Local. Doors open at G–12.');

    /* The picked shaft is the one outlined in ink. Press it a third of the way down: one floor's doors. */
    const box = await page.$eval('.everyday-designer-svg', (svg) => {
      const outline = [...svg.querySelectorAll('rect')].find((rect) => rect.getAttribute('stroke-width') === '2.6');
      if (outline === undefined) throw new Error('no picked shaft is outlined');
      const at = outline.getBoundingClientRect();
      return { x: at.left + at.width / 2, y: at.top + at.height / 3 };
    });
    await page.mouse.click(box.x, box.y);
    const line = (await page.textContent('.everyday-designer-service-line')) ?? '';
    expect(line).toContain('Hand-picked');
    expect(line).not.toContain('G–12.');
    /* A shaft with different doors is a group of its own — the bank split, visible. */
    expect(await groups(page)).toHaveLength(2);

    /* And a pattern chip puts every floor back, for that shaft alone. */
    await page.click('.everyday-designer-pattern[data-k="pattern:local"]');
    expect(await groups(page)).toHaveLength(1);
    await page.close();
  });

  it('mends a tower whose upper lifts nobody can reach, in the one press the warning offers', async () => {
    const page = await coldLoad();
    await openBoard(page, 'sky-lobby');
    expect(await page.$eval('.everyday-designer-warnings', (card) => (card as HTMLElement).hidden)).toBe(true);

    /* Take the dot off floor 30: the upper lifts still start there, and nobody may change onto them. */
    await page.click('.everyday-designer-tab[data-step="floors"]');
    await page.fill('.everyday-designer-number[data-k="number:First floor picked"]', '30');
    await page.keyboard.press('Tab');
    await page.click('.everyday-designer-sky[data-k="sky:no"]');
    const blocker = (await page.textContent('.everyday-designer-warning-blocker')) ?? '';
    expect(blocker).toContain('cannot be reached from the lobby');
    expect(await page.textContent('.everyday-designer-fix')).toBe('Make floor 30 a sky lobby');

    await page.click('.everyday-designer-fix');
    expect(await page.$('.everyday-designer-warning-blocker')).toBeNull();
    await page.close();
  });

  it('adds an escalator and removes it again, and folds the document — § D518', async () => {
    const page = await coldLoad();
    await openBoard(page);
    await page.click('.everyday-designer-tab[data-step="floors"]');
    await page.fill('.everyday-designer-number[data-k="number:First floor picked"]', '0');
    await page.keyboard.press('Tab');
    expect(await page.textContent('.everyday-designer-floor-title')).toBe('The lobby');

    const pressed = async (key: string): Promise<string | null> =>
      page.getAttribute(`.everyday-designer-escalator[data-k="escalator:${key}"]`, 'aria-pressed');
    /* The escalator is drawn as a stroke in the core's margin; nothing else on the drawing is that colour and round-capped. */
    const drawn = async (): Promise<number> =>
      page.$$eval('.everyday-designer-svg line', (lines) =>
        lines.filter((line) => line.getAttribute('stroke-linecap') === 'round').length,
      );
    expect(await pressed('yes')).toBe('false');
    expect(await drawn()).toBe(0);
    await page.click('.everyday-designer-escalator[data-k="escalator:yes"]');
    expect(await pressed('yes')).toBe('true');
    expect(await drawn()).toBe(1);
    await page.click('.everyday-designer-escalator[data-k="escalator:no"]');
    expect(await pressed('yes')).toBe('false');
    expect(await drawn()).toBe(0);

    /* § 13.3's document is a collapsed disclosure, and the plate is inside it. */
    const fold = await page.$eval('.everyday-designer-document', (node) => ({
      open: (node as HTMLDetailsElement).open,
      plates: node.querySelectorAll('.everyday-designer-plate').length,
      summary: node.querySelector('summary')?.textContent ?? '',
    }));
    expect(fold.open).toBe(false);
    expect(fold.plates).toBe(1);
    expect(fold.summary).toContain('The engineer’s document');
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
    expect(await page.textContent('.everyday-bar-primary')).toBe('Test simulation');
    expect(await page.$$eval('.everyday-designer-absences', (blocks) => blocks.length)).toBe(0);

    /*
     * GitHub issue #283's pairing, and it is the half a deletion usually loses. Two rows left the
     * register because they named where a capability is *authored* rather than a thing this build
     * cannot do. The words did not leave with them: each stands beside the control a reader would
     * otherwise mistake for it, which is the only reason deleting the rows was not a loss.
     */
    /*
     * One of the two is still a hint: service zoning is not access zoning, and it is said on the
     * Service step beside the control it qualifies. The other — that a sky lobby's starting floor
     * was set in the machine editor — left when the Shape step gained the control for it.
     */
    await page.click('.everyday-designer-tab[data-step="service"]');
    expect(await page.textContent('.everyday-designer-service-scope')).toContain('building editor');
    expect(await page.$('.everyday-designer-machine-owner')).toBeNull();

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
     * wrote both (#177 item 5, § D518). The class-per-shaft row was the designer's one remaining.
     *
     * **And it left too** — GitHub issue **#420**, which gave `BuildingSpec` a machine per shaft
     * and drew the pickers over it, so the designer's register is empty and draws its own sentence
     * instead. The assertion is flipped rather than deleted: `refusalsAreCurrent.test.ts` cannot
     * decide in general whether a refusal names a feature that now exists, so a register row
     * arriving back on this panel without its control has to be caught by name, here, where the
     * panel is actually rendered.
     */
    expect(rows.length).toBeGreaterThan(6);
    expect(rows.some((row) => row.includes('escalator rows'))).toBe(false);
    expect(rows.some((row) => row.includes('a machine class per shaft'))).toBe(false);
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
    await openScenarioEntry(page, 'today');
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
