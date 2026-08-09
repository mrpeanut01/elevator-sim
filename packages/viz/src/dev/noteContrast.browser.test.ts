/**
 * The change-scope notes, measured in the one tier that can actually see a stylesheet —
 * GitHub issue #124. A decision number is owed for this file; the argument is here.
 *
 * ## Why this exists beside `noteContrast.test.ts` rather than instead of it
 *
 * That file is the gate. It always runs, it derives the ink, the size and the ground out of
 * `index.html` and the shipped mounts, and it produces a real number per class per theme per
 * ground. What it cannot do is *be a browser*: its cascade is a re-implementation, its markup
 * parse is a regex over text, and `mountRecorder.test-helper.ts` resolves ids without nesting them,
 * so the join from *the mount inserted this beside `#dispatcher-terms`* to *`#dispatcher-terms`
 * sits inside `.editor-panel`* is this repository's own reading of its own markup.
 *
 * This file is the confirmation, and it is a different claim: `getComputedStyle` on the **shipped
 * page**, with the real cascade, the real DOM tree and the real mounts having run. It reads the
 * colour the browser resolved, walks up for the first ancestor the browser says has an opaque
 * background, and computes the ratio there. If the two tiers ever disagree, the node-tier file is
 * the one that is wrong.
 *
 * The redundancy is the point rather than a cost. `docs/16` S9 puts `browser` above
 * `document recorder`, and § D220 keeps the browser tier out of `npm test` because a missing
 * Chromium is not a defect in this repository — so a gate that only existed here would be a gate
 * that runs nowhere. A gate that only existed in the node tier would be a gate nobody had ever
 * checked against a browser. Both, and the node one is the one CI reads.
 *
 * ## What it measured, 2026-08-09
 *
 * Run against `chrome-headless-shell-mac-arm64` with `ELEVATOR_SIM_CHROMIUM` pointed at it. Every
 * `.advice` and `.rail-prose` on the page, in both themes, agreed with the node tier to two
 * decimals: `.advice` **7.21 / 8.25** on `rgb(19 25 36)` / `rgb(251 252 254)` — `--card` — and
 * `.rail-prose` **6.35 / 5.92** on `--rail`. No pairing below 4.5:1, and the page's own resolved
 * font sizes are 12 px and 11.5 px.
 *
 * ## One thing this tier saw that the other could not — and it has since been fixed
 *
 * **The finding, as recorded here when this file was written:** `#rail-access-note` is authored
 * `class="rail-prose warn"`; `.warn { color: var(--warn) }` is declared at the top of the
 * stylesheet and `.rail-prose { … color: var(--dimmer) }` far below it; they tie on specificity, so
 * source order gave the paragraph `--dimmer` and **the `warn` class changed nothing**. Both inks
 * clear AA on `--rail` — 6.35 / 5.92 against 9.27 / 4.83 — so it was never this issue's defect. It
 * was recorded rather than fixed because a class named `warn` that does not warn is § D227's
 * stale-refusal shape wearing a stylesheet's hat, and it deserved its own issue rather than a
 * silent one-line reorder inside a contrast lane.
 *
 * **It got one — GitHub issue #143 — and the answer was that the warning register is correct.** A
 * `DECISIONS.md` number is owed; the argument is in `index.html` beside the `.rail-prose.warn` rule
 * and in `noteContrast.test.ts`'s section 5. In short: `role="status"` is not evidence for the
 * quieter reading, because the role governs how an assistive technology *interrupts* and the class
 * governs the register the sentence *reads* in. Four things said the sentence is a caution — docs/10
 * § 10.3 is titled *"the dispatcher compatibility **warning**"* and calls it *"a warning rather than
 * a block"*, `checkAccessCompatibility` returns it in a field named `warning`, the editor's
 * counterpart `#ed-access-note` had been drawing it in `--warn` all along, and the fact itself is
 * that some riders cannot be carried at all.
 *
 * So `.rail-prose.warn` now settles it at (0,2,0), which beats both singles without depending on
 * where either is declared, and the case below pins `--warn` instead. The measurement that made the
 * old sentence true is kept above rather than deleted, because it is the record of what this tier
 * could see that the node tier could not — which is this file's whole reason for existing.
 */

import { fileURLToPath } from 'node:url';

import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHROMIUM, HAS_BROWSER } from './browserTier.test-helper.js';

/*
 * **The gate comes from the shared module, and this file is the reason that module now exists in
 * the form it does** — GitHub issue #142.
 *
 * It was written with its own copy of the constant, cargo-culted from `boot.browser.test.ts`,
 * whose docstring said the copies were "kept identical". They were kept identical by nobody: there
 * were six of them, and #142's guard found this one as the **seventh** the moment the two branches
 * merged. That is the mechanism working rather than a merge conflict — `browserTier.test.ts`
 * asserts that every file in this tier reads the same gate, so a private copy is red on the commit
 * that introduces it and names itself in the failure.
 *
 * The behaviour is unchanged: same environment variable, same `existsSync`, same skip-rather-than-
 * fail. What moves is that a tier-wide guard can now *see* this file's gate, which is precisely
 * what it could not do while the constant was local.
 */

/** WCAG 2.2 AA 1.4.3, normal text. Both classes are under 18.66 px at every weight. */
const AA_BODY = 4.5;

/**
 * How many `.advice` / `.rail-prose` paragraphs a booted page holds: `index.html`'s six, plus the
 * nine § D309's mounts insert. Pinned rather than bounded below, because *fifteen* is the number
 * `noteContrast.test.ts` derives from the two sources independently, and the two agreeing is the
 * evidence that neither is looking at half the page.
 */
const NOTES_ON_THE_PAGE = 15;

/** One paragraph as the browser resolved it. */
interface Measured {
  readonly className: string;
  readonly theme: string;
  readonly color: string;
  readonly fontSizePx: number;
  readonly ground: string;
  readonly groundFrom: string;
  readonly ratio: number;
}

let server: ViteDevServer;
let browser: Browser;
let origin: string;
let measured: readonly Measured[] = [];

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  server = await createServer({
    configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
    root: fileURLToPath(new URL('../..', import.meta.url)),
    /*
     * A port of this file's own, and `strictPort: false` so a busy one becomes the next free one —
     * `compareLab.browser.test.ts`'s rule, and this file is the case that proves it.
     *
     * It was written as `port: 0` and was green, because on its own branch it was the only new file
     * in the tier. Integrated beside issue #142's repairs it became the **seventh** file here, and
     * `port: 0` does not mean *an ephemeral port*: Vite resolves it to its configured default of
     * 5173, which `boot.browser.test.ts` also asks for. Seven files start concurrently by default,
     * so the loser got no URL at all and this suite failed in `beforeAll` with *"the dev server did
     * not report a local URL"* — six skipped cases and a red file, for a reason with nothing to do
     * with contrast.
     *
     * Found only by running the tier **after** integrating, never on either branch: each was green
     * alone. That is the merge-finds-what-neither-branch-could shape, and it is the second time in
     * this wave that the tier's own concurrency produced it.
     */
    server: { port: 5293, strictPort: false },
    logLevel: 'error',
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (local === undefined) throw new Error('the dev server did not report a local URL');
  origin = local.replace(/\/$/, '');
  browser = await chromium.launch({ executablePath: CHROMIUM });

  measured = [
    ...(await measureAt('dark')),
    ...(await measureAt('light')),
  ];
}, 120_000);

/**
 * Load the page with the operating system claiming one colour scheme, and read every note off it.
 *
 * **Emulated at the browser rather than stamped on the document, and that distinction is the whole
 * reason the first draft of this file measured the light palette twice.** `dev/main.ts#applyTheme`
 * writes all thirty tokens as *inline custom properties on `:root`*, which outrank both `:root`
 * blocks in the stylesheet — so flipping `data-theme` from a `page.evaluate` changes the attribute
 * and repaints nothing. The palette moves only when `themeFor` is asked again, and with the shipped
 * default setting (`system`) the thing it asks is `matchMedia('(prefers-color-scheme: dark)')`.
 *
 * So the mode is changed the way a player's operating system changes it, one page load each. That
 * is a stronger claim than the one intended: it drives `themeFor`'s `system` branch, `applyTheme`'s
 * write and the real cascade in one path.
 */
async function measureAt(scheme: 'dark' | 'light'): Promise<readonly Measured[]> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
  await page.goto(origin, { waitUntil: 'load' });
  // The scope notes are written during *mount*, not during a render, so the first paint is enough.
  // The wait is for `boot()` to have run the mounts at all, with the canvas standing in for that.
  await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);

  const rows = await page.evaluate((): Measured[] => {
    const luminance = (rgb: readonly number[]): number => {
      const channel = (value: number): number => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
      };
      return (
        0.2126 * channel(rgb[0] ?? 0) + 0.7152 * channel(rgb[1] ?? 0) + 0.0722 * channel(rgb[2] ?? 0)
      );
    };
    const parse = (value: string): { rgb: number[]; alpha: number } | null => {
      const found = /rgba?\(([^)]+)\)/.exec(value);
      if (found === null) return null;
      const parts = (found[1] ?? '').split(/[\s,/]+/).filter((piece) => piece !== '');
      return {
        rgb: parts.slice(0, 3).map((piece) => Number(piece)),
        alpha: parts[3] === undefined ? 1 : Number(parts[3]),
      };
    };
    const contrast = (a: readonly number[], b: readonly number[]): number => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    /** The first ancestor-or-self the browser says has an opaque background. */
    const groundOf = (node: Element): { rgb: number[]; from: string } | null => {
      for (let at: Element | null = node; at !== null; at = at.parentElement) {
        const parsed = parse(getComputedStyle(at).backgroundColor);
        if (parsed !== null && parsed.alpha > 0.99) {
          const id = at.id === '' ? '' : `#${at.id}`;
          const cls = at.className === '' ? '' : `.${String(at.className).trim().split(/\s+/).join('.')}`;
          return { rgb: parsed.rgb, from: `${at.tagName.toLowerCase()}${id}${cls}` };
        }
      }
      return null;
    };

    const out: Measured[] = [];
    for (const node of document.querySelectorAll('.advice, .rail-prose')) {
      const style = getComputedStyle(node);
      const ink = parse(style.color);
      const ground = groundOf(node);
      if (ink === null || ground === null) continue;
      out.push({
        // What the page says it resolved to, read back rather than assumed from the emulation, so
        // a run in which `applyTheme` did not follow `matchMedia` is loud instead of mislabelled.
        theme: document.documentElement.dataset['theme'] ?? '',
        className: String(node.className),
        color: style.color,
        fontSizePx: Number.parseFloat(style.fontSize),
        ground: `rgb(${ground.rgb.join(' ')})`,
        groundFrom: ground.from,
        ratio: Number(contrast(ink.rgb, ground.rgb).toFixed(2)),
      });
    }
    return out;
  });

  await page.close();
  return rows;
}

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe.skipIf(!HAS_BROWSER)('the change-scope notes are legible on the page a player loads', () => {
  it('found the mount-inserted notes and not only the six the markup ships', () => {
    /*
     * The control that decides whether this file is measuring the thing. `index.html` ships six
     * paragraphs in these classes; § D309's nine are inserted by the mounts at boot, and they are
     * the subject of the issue. A run that saw only six would be a green test about the wrong text.
     */
    for (const theme of ['dark', 'light']) {
      const found = measured.filter((row) => row.theme === theme);
      expect(found.length, `${theme}: the page held fewer notes than the markup alone ships`).toBe(
        NOTES_ON_THE_PAGE,
      );
    }
  });

  it('found both classes on the page, in both themes', () => {
    // The positive control. A selector that matched nothing would make every case below vacuous,
    // which is the silent-instrument shape this repository keeps catching in its own tests.
    for (const theme of ['dark', 'light']) {
      for (const name of ['advice', 'rail-prose']) {
        const found = measured.filter(
          (row) => row.theme === theme && row.className.split(/\s+/).includes(name),
        );
        expect(found.length, `${theme}: nothing on the page is drawn in .${name}`).toBeGreaterThan(0);
      }
    }
  });

  it('draws them at the size the stylesheet says, so 4.5:1 is the bar', () => {
    const sizes = new Set(measured.map((row) => `${row.className.split(/\s+/)[0]}:${row.fontSizePx}`));
    for (const row of measured) {
      expect(row.fontSizePx, `${row.className} is large text; reconsider the bar`).toBeLessThan(18.66);
    }
    expect([...sizes].sort().join(' ')).toContain('advice:12');
  });

  it(`clears ${String(AA_BODY)}:1 against the ground the browser says it sits on`, () => {
    const failures = measured
      .filter((row) => row.ratio < AA_BODY)
      .map(
        (row) =>
          `${row.theme}: .${row.className} at ${String(row.ratio)}:1 — ${row.color} on ` +
          `${row.ground} (${row.groundFrom})`,
      );
    expect(failures, 'a change-scope note is drawn below AA on the page a player loads').toEqual([]);
  });

  it('agrees with the node tier to two decimals, which is what makes that tier a gate', () => {
    /*
     * The join. `noteContrast.test.ts` derives these four figures from `index.html` as text; this
     * reads them off a real cascade. Pinned here rather than merely compared, because the value of
     * the always-on gate is exactly the extent to which a browser has confirmed it once.
     */
    const only = (name: string, theme: string): readonly number[] => [
      ...new Set(
        measured
          .filter((row) => row.theme === theme && row.className.split(/\s+/)[0] === name)
          .map((row) => row.ratio),
      ),
    ].sort((a, b) => a - b);
    expect(only('advice', 'dark')).toEqual([7.21]);
    expect(only('advice', 'light')).toEqual([8.25]);
    /*
     * **`.rail-prose` has two inks, and issue #143 is why.** Every user of the class draws in
     * `--dimmer` — 6.35 / 5.92 — except `#rail-access-note`, which `.rail-prose.warn` now draws in
     * `--warn`: 9.27 dark, 4.83 light. Both figures are the #124 lane's own measurements for
     * `--warn` on `--rail`, taken before the class was made to bite, so this case is now the
     * confirmation that the fix landed on the ink that was already known to be legible rather than
     * on a new one nobody had checked.
     *
     * Listed as a set rather than collapsed, and sorted so the assertion does not depend on the
     * order the page happens to yield elements in. The light pair is the one to watch: 4.83 clears
     * AA for normal text with less room than anything else on the page, so a token change that
     * darkens the rail or lightens the amber is red here first.
     */
    expect(only('rail-prose', 'dark')).toEqual([6.35, 9.27]);
    expect(only('rail-prose', 'light')).toEqual([4.83, 5.92]);
  });

  it('resolves `class="rail-prose warn"` to `--warn`, because a compound rule says so', () => {
    /*
     * Not a contrast case — both candidates clear AA — and it is here because it is the one fact
     * this tier can settle and the node tier can only propose. `#rail-access-note` asks for two
     * colours, and a real cascade in a real browser is what says which it gets.
     *
     * **This case read `rgb(139, 152, 169)` — `--dimmer` — until issue #143**, and that measurement
     * is what turned "the `warn` class looks inert" from a reading of the stylesheet into a fact.
     * The fix is `.rail-prose.warn` at (0,2,0): it beats `.warn` and `.rail-prose` on specificity,
     * so the answer no longer depends on which of them is declared first. Written as a compound
     * rather than by moving `.warn` below `.rail-prose`, because a move fixes this pairing by luck
     * and re-breaks on the next colour-setting class declared beneath it — and there are eighty of
     * those.
     *
     * The paired node-tier assertion is `noteContrast.test.ts`'s section 5, which also sweeps the
     * whole markup for the general shape: two rules of equal specificity, naming different
     * subjects, proposing different inks. Same-selector overrides are exempt and `#copy-cli` is the
     * control on that exemption.
     */
    const note = measured.find(
      (row) => row.theme === 'dark' && row.className.split(/\s+/).includes('warn'),
    );
    expect(note, 'no `.rail-prose.warn` on the page').toBeDefined();
    // `--warn` is `var(--band-1)` is `tokens.BAND_WAITING` is `#e0b040` in dark — the wait ladder's
    // amber, which is the point: the register this note reads in is the one the stage already uses
    // for *people are waiting*. Was `rgb(139, 152, 169)` — `--dimmer` — before #143.
    expect((note as Measured).color).toBe('rgb(224, 176, 64)');
  });
});
