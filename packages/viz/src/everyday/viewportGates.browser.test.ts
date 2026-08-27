/**
 * **§ 2's three commitment clauses, measured at the widths the matrix commits to** — GitHub issue
 * #292, and the gate `M2_MEASUREMENT.md` § 4's table called *"#240's viewport gates, which do not
 * exist"* until this file existed.
 *
 * `docs/31-support-matrix.md` § 2 puts three things in scope for launch at **360 px of CSS width and
 * above, in a tier-1 browser**: the product *"lays out without horizontal overflow, keeps the stage
 * canvas at 60 % or more of the viewport height, and exposes no control that is drawn but
 * unreachable."* This file measures all three. Before it, one of the three had a published figure
 * and the figure could not see the defect; the other two had nothing at all.
 *
 * ## The instrument this replaces, and why its number was null rather than wrong
 *
 * `M2_MEASUREMENT.md` § 3.2 measured horizontal overflow as
 *
 * ```
 * max(documentElement.scrollWidth, body.scrollWidth) − documentElement.clientWidth
 * ```
 *
 * and published **0 px at every width down to 360**, *"which is § 2's first commitment clause,
 * measured for the first time at the floor it names."* That row is **true and is evidence for
 * nothing**, which is the distinction worth keeping: it is a correct statement about the
 * **document scroll box**, and the document scroll box is not where this product's overflow goes.
 *
 * `everyday/shell.ts:299` makes the Everyday root `position:fixed`, `:304` gives it
 * `overflow:hidden`, and `:330` gives `.everyday-main` `overflow:hidden` as well. Content that
 * overruns a clipping box is **clipped, not scrolled**, so it never reaches `documentElement`, and
 * `scrollWidth` there stays exactly equal to `clientWidth` however far outside the viewport a
 * control is drawn. A `position:fixed; overflow:hidden` shell is invisible to that metric **by
 * construction**: it reads 0 in precisely the case it exists to catch. Measured on this tree at
 * 360×800, on the Everyday main menu, in the same page evaluation: document metric **0 px**,
 * `.everyday-main` clipping **93 px**.
 *
 * So the corrected quantity is per-element — `scrollWidth − clientWidth` on every drawn box whose
 * own `overflow-x` clips — and it is checked against a manufactured failure rather than trusted
 * (§ *The calibration*, below).
 *
 * ## Which shell each clause was ever true of
 *
 * `UX.md`'s `RX-03` and `RX-04b` are the prose § 2 says these clauses restate, and both were driven,
 * broken, fixed and re-driven on **2026-07-30 in `5d4b782`** — against the **Engineer** surface:
 * `index.html`'s `@media (max-width: 767px)` block stacks `.stagecol` first and pins
 * `.stage-wrap { height: 60vh; min-height: 60vh }`, and `RX-04b`'s own evidence line is a
 * measurement of `.topbar`. `packages/viz/index.html` did not start loading `everyday/boot.ts` until
 * **2026-08-12** (§ D335), six weeks later. The Everyday shell has therefore never been measured
 * against any of the three, and it is the shell a player now meets first.
 *
 * That is not an argument that the Engineer surface passes today — this file does not measure it,
 * and `RX-03`'s 60 vh rule is a rule about one stylesheet block rather than a run. It is the reason
 * § 3.2's row cannot be read forward: the shell under it changed.
 *
 * ## The calibration — why this file may be believed
 *
 * This repository has shipped an instrument that measured nothing before: a page-error probe that
 * reported zero latent errors while referencing a type-only `expect` and throwing inside its own
 * handler, which on validation turned out to be hiding **628 captured errors under 4 of 4 tests
 * passing**. A gate whose green is untested is not evidence.
 *
 * So {@link MEASURE} is run first against a **manufactured** failing state: a case injects a
 * `position:fixed; overflow:hidden` box holding an over-wide child and a button drawn outside it,
 * then requires the old metric to read 0 and the new one to read the injected overrun, and requires
 * the injected button to be named and its in-viewport twin not to be. Both directions, on the same
 * function the register below runs. That calibration is **independent of the product's own defect**,
 * so it keeps working after #240 lands.
 *
 * ## The register, and what it means when this file goes red
 *
 * **The product fails all three clauses at 360 px today, and this file is green.** That is
 * deliberate, and it is `honesty.test.ts`'s `OUTSTANDING` precedent: the check runs, the failures
 * are measured, each is registered, and the case fails **when the set changes in either
 * direction** — a new failure is unregistered and goes red, and a failure that stops reproducing
 * goes red as *delete this entry*. A register of ghosts is a suppression list; a register nothing
 * re-derives is decoration.
 *
 * The layout work is **#240** — open, unassigned, no linked pull request, milestone M4. It does not
 * restate these three clauses; it incorporates them, by *"Build to the support matrix decided in
 * pre-production"* and by its fourth criterion, *"journey tests run at the minimum viewport as well
 * as at desktop width"*, which is what this file now does. So when #240 lands, this file is
 * **supposed** to go red, once, with a diff naming every entry that stopped reproducing. Deleting those entries is part of landing #240, and
 * an empty {@link OUTSTANDING} is what turns this file from a record into a gate. Nothing else about
 * the file changes on that day.
 *
 * ## Measured 2026-08-27, `55f2bca` + this commit, Chromium headless shell r1194
 *
 * | viewport | screen | § 3.2's metric | clipped | controls no gesture reaches | stage canvas |
 * |---|---|---|---|---|---|
 * | 360×800 | main menu | **0 px** | **93 px** | **5** | — |
 * | 360×800 | stage | **0 px** | **337 px** | **12** | 340 px = **42.5 %** |
 * | 375×667 | main menu | **0 px** | **78 px** | **5** | — |
 * | 375×667 | stage | **0 px** | **322 px** | **11** | 340 px = **51.0 %** |
 * | 1280×800 | main menu | 0 px | 0 px | 0 | — |
 * | 1280×800 | stage | 0 px | 0 px | 0 | 340 px = **42.5 %** |
 *
 * Three things in that table are worth reading rather than skimming.
 *
 * 1. **§ 3.2's column is 0 in every row, including the four that fail.** That is the issue.
 * 2. **The five controls at 360×800 are the whole main menu.** All four mode tiles — § 4's four
 *    modes, the only way into any of them — plus § 3.3's primary, `Play today's tower`, which at
 *    360 px is drawn at `left: 360` and is **100 % outside the viewport** before any scroll is
 *    attempted. The rail is `RAIL_WIDTH_PX = 212` at every width (`everyday/shell.ts:129`, inline,
 *    no breakpoint), against `grid-template-columns: 212px minmax(0,1fr)`, which leaves the screen
 *    region 148 px at 360 and 163 px at 375 for content that lays out at 241 px.
 * 3. **The 1280×800 stage fails clause 2 as well**, and that is not a small-screen defect:
 *    `everyday/stageScreen.ts:530` writes `height:340px` as a literal, so the Everyday stage canvas
 *    is 340 px at *every* viewport height. § 2's clause is scoped *"360 px and above"*, so 1280×800
 *    is inside it. This is outside #240's stated subject, which is the narrow layout, and it is
 *    registered here rather than filed silently.
 *
 * The 1280×800 rows are also this file's **positive control on clauses 1 and 3**: the same
 * instrument, the same page, reports **nothing** there. A gate that cannot come back empty is not
 * measuring the product.
 *
 * ## Why a tier file rather than the out-of-band script
 *
 * `M2_MEASUREMENT.md` § 3.1's `matrixProbe.mjs` is *"not committed to the tree, because a
 * measurement lane changes no source and no test"*. That is a rule about that lane's remit, not a
 * property of the instrument, and it does not survive the thing being asked for here: an
 * uncommitted script cannot keep proving anything, and § 4.1 quotes #203 § 4's rule that *"every
 * tier-1 row must be a row a red run defends"*. § 2 puts 360 px in scope for launch. A width in
 * scope with no run behind it is the state this file ends.
 *
 * The **second** half of that issue — the tier file count both documents published and both got
 * wrong — is `viewportGateClaims.test.ts`, beside this one and deliberately **not** a
 * `*.browser.test.ts` file: it reads a count off disk, and a count that skipped whenever Chromium
 * was missing would be a guard reporting as *ran*.
 *
 * § D220 § 4 holds: **no metric is asserted.** Everything here is a box, a pixel or a control's
 * name; what any figure inside the product *means* is the honesty corpus's business, not this
 * file's.
 *
 * **No `DECISIONS.md` entry is claimed for this, and that is deliberate rather than an oversight.**
 * The wave that produced it forbade taking a number, and `documentation.test.ts`'s ratchet on
 * owed-decision sites stands at its ceiling — a lane may not raise a ratchet, and settling one
 * belongs to whoever writes the entry. So the argument lives here and in the two documents this
 * file is cited from, which is what `CLAUDE.md`'s working agreement asks for; GitHub issue #292 is
 * the pointer for anyone filing it later.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The tier's one gate — see `dev/browserTier.test-helper.ts`, and GitHub issue #142 for why. */
import { CHROMIUM, HAS_BROWSER, enterEverydayStage, openPage } from '../dev/browserTier.test-helper.js';

let server: ViteDevServer;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /* Its own port — `dev/browserTier.test.ts` derives every tier file's port and requires all of
       them distinct, because `strictPort: false` makes a collision fail quietly rather than
       loudly. 5214 is the next free number above the block this tier already claims. */
    server: { port: 5214, strictPort: false },
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

/* -------------------------------------------------------------------------- *
 * The measurement
 * -------------------------------------------------------------------------- */

/** What one (viewport, screen) cell of the sweep produced. */
interface Reading {
  /** `M2_MEASUREMENT.md` § 3.2's quantity, kept so the two can be compared in one breath. */
  readonly documentMetricPx: number;
  /** The corrected quantity: the widest horizontal overrun on any drawn box that clips. */
  readonly clippedPx: number;
  /** What clips, so a failure names a box rather than a number. */
  readonly clippers: readonly string[];
  /** One identifier per control no gesture can bring wholly into the viewport. */
  readonly unreachable: readonly string[];
  /** The stage canvas as a percentage of viewport height, or `undefined` off the stage. */
  readonly canvasPct: number | undefined;
  /** Drawn controls considered. A cell that considered none has measured nothing. */
  readonly controlsSeen: number;
}

/**
 * Everything this file measures, in one page evaluation, so that every clause is read off the
 * **same** laid-out document at the same instant.
 *
 * ## `sr-only` is why there is a floor on what counts as drawn
 *
 * `index.html:409` defines `.sr-only` as `width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)`
 * — a box deliberately removed from the visual layout and left in the accessibility tree. Its
 * `scrollWidth − clientWidth` is enormous by design: pointed at the Engineer surface with no floor,
 * an earlier draft of this function reported **1 613 px of horizontal overflow** on five `.sr-only`
 * spans and nothing else, which is a number about a screen-reader affordance dressed as a layout
 * defect. `MIN_DRAWN_PX` is the floor that keeps *drawn* meaning drawn, and it is the reason clause
 * 3 reads *"drawn but unreachable"* rather than *"present but unreachable"*: a control a sighted
 * player was never meant to see is not a control they cannot reach.
 *
 * ## Reachability is asked as *what could a gesture do*, and that is not `scrollIntoView`
 *
 * `overflow:hidden` produces a scroll container that a **script** can still scroll and a **person**
 * cannot: no scrollbar, no wheel, no touch drag, no keyboard. So `scrollIntoView` alone is far too
 * generous — run against this shell it quietly scrolls `.everyday-main` by 32 px and reports the
 * off-viewport primary as reachable, which is the instrument agreeing with itself instead of with
 * the product. `RX-04b`'s own words for the defect are *"141 px of header … that no gesture could
 * reach"* (issue #74), and that is the question asked here:
 *
 * 1. snapshot the scroll offset of every box, **per axis**, that clips on that axis;
 * 2. let the browser do its best with `scrollIntoView`;
 * 3. **undo every scroll a gesture could not have produced** — and only those, which is why the
 *    snapshot is per axis: `overflow-x:hidden` beside `overflow-y:auto` is a box a player scrolls
 *    vertically and never horizontally, and restoring both axes would invent unreachability.
 *
 * What is left outside the viewport after that is what no gesture reaches.
 *
 * `SLIVER_PX` is the tolerance below which an overrun is sub-pixel rounding rather than a finding.
 * It is 4: the smallest real overrun this sweep has measured is 9 px, the largest 321 px, and one
 * 2 px sliver on `.everyday-bar-back` sat below it at 360×800 and is deliberately not registered.
 */
const MEASURE = (): Reading => {
  const shell = document.querySelector('.everyday-main')?.parentElement;
  if (shell === null || shell === undefined) throw new Error('the Everyday shell is not mounted');

  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const MIN_DRAWN_PX = 8;
  const SLIVER_PX = 4;

  const documentMetricPx =
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
    document.documentElement.clientWidth;

  const drawn = (node: Element): boolean => {
    const box = node.getBoundingClientRect();
    return box.width >= MIN_DRAWN_PX && box.height >= MIN_DRAWN_PX;
  };

  /** A stable, readable name: the first class, or the nearest classed ancestor plus the tag. */
  const nameOf = (node: Element): string => {
    const own = node.className;
    if (typeof own === 'string' && own.trim() !== '') return own.trim().split(/\s+/u)[0] as string;
    let up = node.parentElement;
    while (up !== null) {
      const cls = up.className;
      if (typeof cls === 'string' && cls.trim() !== '') {
        return `${cls.trim().split(/\s+/u)[0] as string} > ${node.tagName.toLowerCase()}`;
      }
      up = up.parentElement;
    }
    return node.tagName.toLowerCase();
  };

  let clippedPx = 0;
  const clippers: string[] = [];
  for (const node of [shell, ...shell.querySelectorAll('*')]) {
    if (!drawn(node)) continue;
    const over = node.scrollWidth - node.clientWidth;
    if (over <= SLIVER_PX) continue;
    if (!/hidden|clip/u.test(getComputedStyle(node).overflowX)) continue;
    clippers.push(`${nameOf(node)} clips ${String(Math.round(over))} px`);
    if (over > clippedPx) clippedPx = over;
  }

  /* Per axis, so a vertically scrollable box that clips horizontally keeps its vertical gesture. */
  const pinned: [Element, number | null, number | null][] = [];
  for (const node of document.querySelectorAll('*')) {
    const style = getComputedStyle(node);
    pinned.push([
      node,
      /hidden|clip/u.test(style.overflowX) ? node.scrollLeft : null,
      /hidden|clip/u.test(style.overflowY) ? node.scrollTop : null,
    ]);
  }
  const undoWhatNoGestureCouldDo = (): void => {
    for (const [node, left, top] of pinned) {
      if (left !== null) node.scrollLeft = left;
      if (top !== null) node.scrollTop = top;
    }
  };

  /** How far outside the viewport this box reaches, on its worst side. */
  const missBy = (box: DOMRect): number =>
    Math.max(0, box.right - vw, -box.left, box.bottom - vh, -box.top);

  const controls = [...shell.querySelectorAll('button, a[href], input, select, textarea')].filter(
    (node) => drawn(node) && !node.hasAttribute('hidden'),
  );

  const unreachable: string[] = [];
  for (const control of controls) {
    if (missBy(control.getBoundingClientRect()) <= SLIVER_PX) continue;
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    undoWhatNoGestureCouldDo();
    if (missBy(control.getBoundingClientRect()) <= SLIVER_PX) continue;
    unreachable.push(nameOf(control));
  }
  undoWhatNoGestureCouldDo();

  const canvas = document.querySelector('.everyday-stage-canvas');
  const canvasPct =
    canvas === null
      ? undefined
      : Math.round((canvas.getBoundingClientRect().height / vh) * 1_000) / 10;

  return {
    documentMetricPx,
    clippedPx: Math.round(clippedPx),
    clippers,
    unreachable,
    canvasPct,
    controlsSeen: controls.length,
  };
};

/* -------------------------------------------------------------------------- *
 * The calibration — the instrument against a manufactured failure
 * -------------------------------------------------------------------------- */

/**
 * Build a known-failing state inside the live page and hand {@link MEASURE} something whose answer
 * is known in advance.
 *
 * A `position:fixed; overflow:hidden` box the width of the viewport, holding a child `OVERRUN_PX`
 * wider than it and two buttons: one drawn inside the box, one drawn past its right edge. Every
 * property of the defect this file exists for, manufactured on purpose — which is what makes the
 * green above it mean something. Returns the two buttons' names so the assertions can be written
 * in both directions.
 */
const INJECT = (overrunPx: number): { readonly inside: string; readonly outside: string } => {
  const shell = document.querySelector('.everyday-main')?.parentElement;
  if (shell === null || shell === undefined) throw new Error('the Everyday shell is not mounted');
  const vw = document.documentElement.clientWidth;

  const clip = document.createElement('div');
  clip.className = 'calibration-clip';
  clip.style.cssText = `position:fixed;left:0;top:0;width:${String(vw)}px;height:120px;overflow:hidden`;

  const wide = document.createElement('div');
  wide.className = 'calibration-wide';
  wide.style.cssText = `width:${String(vw + overrunPx)}px;height:120px;position:relative`;

  const inside = document.createElement('button');
  inside.className = 'calibration-inside';
  inside.textContent = 'reachable';
  inside.style.cssText = 'position:absolute;left:0;top:0;width:60px;height:30px';

  const outside = document.createElement('button');
  outside.className = 'calibration-outside';
  outside.textContent = 'unreachable';
  outside.style.cssText = `position:absolute;left:${String(vw + 10)}px;top:0;width:60px;height:30px`;

  wide.append(inside, outside);
  clip.append(wide);
  shell.append(clip);
  return { inside: 'calibration-inside', outside: 'calibration-outside' };
};

/* -------------------------------------------------------------------------- *
 * The sweep
 * -------------------------------------------------------------------------- */

interface Cell {
  readonly at: string;
  readonly screen: 'main menu' | 'stage';
  readonly reading: Reading;
}

const VIEWPORTS: readonly { readonly width: number; readonly height: number }[] = Object.freeze([
  /* § 2's floor, and the playtest's own two widths. 1280×800 is the tier-1 desktop row and this
     file's positive control on clauses 1 and 3 — see the header table. */
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 1280, height: 800 },
]);

/** A page on the Everyday main menu, cold, with the Engineer surface booted and covered behind it. */
async function coldLoad(width: number, height: number): Promise<Page> {
  const page = await openPage(browser, { viewport: { width, height } });
  await page.goto(`${origin}/?building=garden-apartments&seed=424242`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.everyday-bar-primary');
  /* One frame for the mount's first draw, the same settle `deadControls.browser.test.ts` takes. */
  await page.waitForTimeout(600);
  return page;
}

/**
 * Every cell, measured once.
 *
 * Memoised because the stage leg of each viewport is a real shift on a worker, and four cases
 * asking four separate questions of the same six cells must not pay for it four times — nor read
 * six *differently laid out* pages, which is how two clauses come to disagree about one product.
 */
let sweeping: Promise<readonly Cell[]> | undefined;

async function sweep(): Promise<readonly Cell[]> {
  sweeping ??= (async (): Promise<readonly Cell[]> => {
    const cells: Cell[] = [];
    for (const viewport of VIEWPORTS) {
      const at = `${String(viewport.width)}×${String(viewport.height)}`;
      const page = await coldLoad(viewport.width, viewport.height);
      try {
        cells.push({ at, screen: 'main menu', reading: await page.evaluate(MEASURE) });
        /* The player's own route — menu tile, front door, brief, stage. A helper that jumped it
           would be measuring a screen nobody can open at this width, which is half of what is
           being measured. */
        await enterEverydayStage(page);
        await page.waitForTimeout(600);
        cells.push({ at, screen: 'stage', reading: await page.evaluate(MEASURE) });
      } finally {
        await page.close();
      }
    }
    return cells;
  })();
  return sweeping;
}

/** `['a', 'a', 'b'] → ['a ×2', 'b ×1']` — a register row a reader can diff. */
function counted(names: readonly string[]): readonly string[] {
  const tally = new Map<string, number>();
  for (const name of names) tally.set(name, (tally.get(name) ?? 0) + 1);
  return [...tally.entries()].map(([name, n]) => `${name} ×${String(n)}`).sort((a, b) => a.localeCompare(b));
}

/** The floor § 2 commits the stage canvas to, as a percentage of viewport height. */
const CANVAS_FLOOR_PCT = 60;

/**
 * Every way this cell fails one of § 2's three clauses, as one line each.
 *
 * **Pixel counts are deliberately not in these lines**, and the header table carries them instead.
 * A register keyed on `93 px` would go red on a font-metric change in a Chromium bump and say
 * *"the layout regressed"* about a rounding, which is the failure mode one level up from the one
 * this file reports. What is registered is **which clause fails on which screen at which width** —
 * which is exactly what § 2 commits to, and exactly what #240 changes.
 */
function failuresOf(cell: Cell): readonly string[] {
  const where = `${cell.at} · ${cell.screen}`;
  const out: string[] = [];
  if (cell.reading.clippedPx > 0) out.push(`${where} · clause 1 · content clipped horizontally`);
  for (const control of counted(cell.reading.unreachable)) {
    out.push(`${where} · clause 3 · ${control}`);
  }
  if (cell.reading.canvasPct !== undefined && cell.reading.canvasPct < CANVAS_FLOOR_PCT) {
    out.push(`${where} · clause 2 · stage canvas under ${String(CANVAS_FLOOR_PCT)} % of the height`);
  }
  return out;
}

/**
 * **What the product fails today, and #240 is the fix.**
 *
 * Landing #240 turns entries in this list into red lines saying *this stopped reproducing*.
 * Deleting them then is part of landing it — a finding that has been fixed must stop being
 * registered, or the register becomes decoration. When this list is empty, the four cases below
 * stop being a record and start being the gate § 2 has named since it was written on 2026-08-24.
 *
 * The one entry that is **not** #240's is the last: `everyday/stageScreen.ts:530` writes the stage
 * canvas at a literal `height:340px`, so clause 2 fails at 1280×800 as well, which is a tier-1
 * desktop viewport and outside #240's stated subject.
 *
 * **The narrowest margin in this list, named because it is the one that could move under another
 * Chromium**: `everyday-stage-speed ×7` at 360×800 against `×6` at 375×667. The seventh is the `1×`
 * chip, which overruns by **9 px** at 360 and fits at 375 — every other finding here overruns by
 * between 33 and 321 px. A build whose text metrics differ by more than 9 px across a chip row would
 * flip that one entry to `×6`, and the failure would read as a layout change rather than as a font.
 * If this file goes red on exactly that line and on nothing else, measure before believing it.
 */
const OUTSTANDING: readonly string[] = Object.freeze([
  '360×800 · main menu · clause 1 · content clipped horizontally',
  '360×800 · main menu · clause 3 · everyday-bar-primary ×1',
  '360×800 · main menu · clause 3 · everyday-mode ×4',
  '360×800 · stage · clause 1 · content clipped horizontally',
  '360×800 · stage · clause 3 · everyday-bar-primary ×1',
  '360×800 · stage · clause 3 · everyday-bar-timeline > button ×2',
  '360×800 · stage · clause 3 · everyday-stage-intervene ×1',
  '360×800 · stage · clause 3 · everyday-stage-speed ×7',
  '360×800 · stage · clause 3 · everyday-stage-start ×1',
  '360×800 · stage · clause 2 · stage canvas under 60 % of the height',
  '375×667 · main menu · clause 1 · content clipped horizontally',
  '375×667 · main menu · clause 3 · everyday-bar-primary ×1',
  '375×667 · main menu · clause 3 · everyday-mode ×4',
  '375×667 · stage · clause 1 · content clipped horizontally',
  '375×667 · stage · clause 3 · everyday-bar-primary ×1',
  '375×667 · stage · clause 3 · everyday-bar-timeline > button ×2',
  '375×667 · stage · clause 3 · everyday-stage-intervene ×1',
  '375×667 · stage · clause 3 · everyday-stage-speed ×6',
  '375×667 · stage · clause 3 · everyday-stage-start ×1',
  '375×667 · stage · clause 2 · stage canvas under 60 % of the height',
  '1280×800 · stage · clause 2 · stage canvas under 60 % of the height',
]);

/* -------------------------------------------------------------------------- *
 * The cases
 * -------------------------------------------------------------------------- */

describe.skipIf(!HAS_BROWSER)('the overflow metric can see a clipping shell — GitHub issue #292', () => {
  it('reads an injected clip that the document scroll box reports as zero', async () => {
    const OVERRUN_PX = 240;
    const page = await coldLoad(1_280, 800);
    try {
      /*
       * The control first: nothing injected, nothing to find. Without it, a function that returned
       * a constant would pass the two assertions below and prove nothing — wave 8's fifth
       * false-negative shape, and the reason this case is three measurements rather than one.
       */
      const before = await page.evaluate(MEASURE);
      expect(before.controlsSeen, 'no drawn control was found — this case is watching nothing').toBeGreaterThan(0);
      expect(before.clippedPx, 'the 1280×800 menu clips nothing; that is the baseline').toBe(0);
      expect(before.unreachable).toEqual([]);

      const names = await page.evaluate(INJECT, OVERRUN_PX);
      const after = await page.evaluate(MEASURE);

      /*
       * The issue, in two lines on one page at one instant. `M2_MEASUREMENT.md` § 3.2's quantity is
       * **exactly 0** over a shell that is now clipping 240 px and holding a button drawn wholly
       * outside the viewport — because a `position:fixed; overflow:hidden` box never lets its
       * overrun reach `documentElement`.
       */
      expect(
        after.documentMetricPx,
        'the document scroll box grew, so this page is not the shape the issue is about and the ' +
          'calibration below would prove nothing',
      ).toBe(0);
      expect(
        after.clippedPx,
        `the corrected metric missed an injected ${String(OVERRUN_PX)} px clip — it is as blind as ` +
          'the one it replaces',
      ).toBeGreaterThanOrEqual(OVERRUN_PX);
      expect(after.clippers.join(' | ')).toContain('calibration-clip');

      /* Clause 3, both directions: the button past the edge is named, its twin inside is not. */
      expect(
        after.unreachable,
        'the injected control drawn outside a clipping ancestor was not reported unreachable',
      ).toContain(names.outside);
      expect(
        after.unreachable,
        'a control drawn inside the viewport was reported unreachable — this instrument over-reports',
      ).not.toContain(names.inside);
    } finally {
      await page.close();
    }
  }, 180_000);
});

describe.skipIf(!HAS_BROWSER)('§ 2 at 360 px and above — the three clauses, measured', () => {
  it('finds exactly the failures #240 is open to fix, and no others', async () => {
    const cells = await sweep();
    expect(cells.length, 'the sweep measured no cells').toBe(VIEWPORTS.length * 2);
    for (const cell of cells) {
      expect(
        cell.reading.controlsSeen,
        `${cell.at} ${cell.screen} drew no controls — that cell measured nothing`,
      ).toBeGreaterThan(0);
    }

    expect(
      cells.flatMap(failuresOf),
      'The register and the product disagree. A line only the product has is a new failure of one ' +
        "of docs/31-support-matrix.md § 2's three clauses, and it is unregistered. A line only the " +
        'register has has stopped reproducing — if that is #240 landing, delete it here in the ' +
        'same commit, because a register of ghosts is a suppression list.',
    ).toEqual([...OUTSTANDING]);
  }, 600_000);

  it('measures clause 1 as a quantity § 3.2 could not see', async () => {
    const cells = await sweep();
    /*
     * The published row and the corrected one, side by side on the product itself. § 3.2's number
     * is 0 in all six cells — including the four where content is clipped — and that is the row
     * being corrected rather than a coincidence of this run.
     */
    for (const cell of cells) {
      expect(
        cell.reading.documentMetricPx,
        `${cell.at} ${cell.screen}: the document scroll box reports overflow now, which it could ` +
          'not while the Everyday root is position:fixed with overflow:hidden. Re-read the header.',
      ).toBe(0);
    }
    const clipping = cells.filter((cell) => cell.reading.clippedPx > 0);
    expect(
      clipping.length,
      'no cell clips anything, so this file has nothing to say about § 3.2 being blind. If #240 ' +
        'has landed, that is correct and this case belongs to the calibration above.',
    ).toBeGreaterThan(0);
  }, 600_000);

  it('measures clause 2 against the 60 % floor § 2 names', async () => {
    const cells = await sweep().then((all) => all.filter((cell) => cell.screen === 'stage'));
    expect(cells.length, 'the stage was never reached').toBe(VIEWPORTS.length);
    for (const cell of cells) {
      expect(
        cell.reading.canvasPct,
        `${cell.at}: the stage screen drew no canvas, so clause 2 was not measured there`,
      ).toBeGreaterThan(0);
    }
  }, 600_000);

  it('comes back empty at 1280×800 on clauses 1 and 3 — the instrument is not always red', async () => {
    const cells = await sweep().then((all) => all.filter((cell) => cell.at === '1280×800'));
    expect(cells.length).toBe(2);
    for (const cell of cells) {
      /*
       * Clauses 1 and 3 only, and the exclusion is the point rather than a convenience: clause 2
       * fails at 1280×800 too, on `everyday/stageScreen.ts:530`'s literal `height:340px`. A control
       * cell that quietly covered all three would be a control cell that is red, which is no
       * control at all.
       */
      expect(cell.reading.clippedPx, `${cell.screen} at 1280×800 clips`).toBe(0);
      expect(cell.reading.unreachable, `${cell.screen} at 1280×800 hides a control`).toEqual([]);
    }
  }, 600_000);
});
