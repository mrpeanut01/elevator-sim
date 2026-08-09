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
 * ## One thing this tier can see that the other cannot, and it is not a contrast failure
 *
 * `#rail-access-note` is authored `class="rail-prose warn"`. `.warn { color: var(--warn) }` is
 * declared at the top of the stylesheet and `.rail-prose { … color: var(--dimmer) }` far below it;
 * they tie on specificity, so **source order gives the paragraph `--dimmer` and the `warn` class
 * changes nothing.** Both inks clear AA on `--rail` — 6.35 / 5.92 against 9.27 / 4.83 — so this is
 * not the issue's defect and is not fixed here. It is recorded because a class named `warn` that
 * does not warn is the stale-refusal shape § D227 names, wearing a stylesheet's hat, and it wants
 * its own issue rather than a silent one-line reorder inside a contrast lane.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The provisioned headless shell — `boot.browser.test.ts`'s constant, for its reasons. */
const CHROMIUM =
  process.env['ELEVATOR_SIM_CHROMIUM'] ??
  '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HAS_BROWSER = existsSync(CHROMIUM);
if (!HAS_BROWSER) {
  console.warn(
    `[viz-browser] skipped: no Chromium at ${CHROMIUM}. ` +
      'Set ELEVATOR_SIM_CHROMIUM to run the browser tier (DECISIONS.md § D220). ' +
      '`dev/noteContrast.test.ts` is the always-on gate for the same property.',
  );
}

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
    server: { port: 0 },
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
    ];
    expect(only('advice', 'dark')).toEqual([7.21]);
    expect(only('advice', 'light')).toEqual([8.25]);
    expect(only('rail-prose', 'dark')).toEqual([6.35]);
    expect(only('rail-prose', 'light')).toEqual([5.92]);
  });

  it('resolves `class="rail-prose warn"` to `--dimmer`, because source order says so', () => {
    /*
     * Not a contrast case — both candidates clear AA — and it is here because it is the one fact
     * this tier can settle and the node tier can only propose. `#rail-access-note` asks for two
     * colours; the browser gives it `--dimmer`, so the `warn` class on that paragraph is inert.
     * Asserted rather than fixed: a reorder is a change to what the rail *looks* like and belongs
     * in an issue of its own, and until then this is the sentence that stops it being a surprise.
     */
    const dimmer = measured.find(
      (row) => row.theme === 'dark' && row.className.split(/\s+/).includes('warn'),
    );
    expect(dimmer, 'no `.rail-prose.warn` on the page').toBeDefined();
    // `--dimmer` in dark is `#8b98a9`.
    expect((dimmer as Measured).color).toBe('rgb(139, 152, 169)');
  });
});
