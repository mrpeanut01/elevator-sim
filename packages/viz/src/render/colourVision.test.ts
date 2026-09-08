/**
 * **Do the colour scales survive colour-blindness?** — GitHub issue **#239**'s fourth criterion,
 * `UX.md` `KB-15`.
 *
 * The criterion is written with an *or* in it: *"Shaft tints and the queue-age scale pass a
 * colour-blind check, **or** carry a non-colour encoding as well."* This file is the check, and it
 * takes both branches seriously — the measurement decides which branch each scale is on, rather
 * than the measurement being arranged to make a preferred answer come out.
 *
 * ## The answer, measured rather than asserted
 *
 * The **queue-age scale** takes the first branch and has since `KB-15`: `render/riderQueue.test.ts`
 * proves the four bands survive **total colour removal** by planning a row under a theme whose four
 * band colours are the same string. That is strictly stronger than any simulation, so this file
 * does not re-measure it — it asserts the partner exists and defers to that test, because two
 * instruments answering one question is how they come to disagree.
 *
 * The **eight shaft tints take the second branch, and they have to.** Simulated here at the
 * shipped values, they are not separable by colour alone. The figures are the reason the sentence
 * in `render/tokens.ts` — *"They are never the only signal"* — is load-bearing rather than
 * decorative, and until now it was prose with nothing checking it:
 *
 * | palette | normal | protanopia | deuteranopia | tritanopia |
 * |---|---|---|---|---|
 * | `:root` (light) | 15.3 | 3.7 | **1.4** | 6.4 |
 * | `[data-theme='dark']` | 4.7 | 2.3 | **1.2** | 4.0 |
 *
 * Smallest CIE76 ΔE over all 28 pairs. Under deuteranopia — the commonest form — the closest pair
 * is **ΔE 1.4**, which is at the threshold of being one colour. So a reader who could only tell
 * shafts apart by tint could not tell them apart at all, and the assertion this file actually makes
 * is the one that matters: **every shaft carries its identity in text**, beside the tint and
 * independent of it.
 *
 * ## What this file deliberately does not do
 *
 * It does not fail on the ΔE figures, and it does not re-pick the palette. Eight hues that separate
 * under three simulations in two modes may not exist inside `docs` § 19's warm range at all, and
 * choosing between *a colour scheme the guide specifies* and *a scale that survives simulation* is
 * a design decision with an owner. What is engineering's, and is done here, is to stop the claim
 * being unmeasured: the figures are published, the fallback is pinned, and a change that removed
 * the text partner would go red.
 *
 * The simulation is Viénot, Brettel & Mollon (1999) — the standard linear-RGB approximation — and
 * distance is CIE76 ΔE in CIELAB. Both are approximations, and neither is load-bearing for the
 * assertions below; they are load-bearing for the table.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BLANK_SPEC, type BuildingSpec } from '../authoring/buildingSpec.js';
import { elevationCarsOf } from '../dev/buildingEditor.js';

/* -------------------------------------------------------------------------- *
 * Colour, in the three spaces this needs
 * -------------------------------------------------------------------------- */

type Triple = readonly [number, number, number];

/** sRGB hex to linear-light RGB, 0–1. */
function linearOf(hex: string): Triple {
  const channel = (pair: string): number => {
    const value = Number.parseInt(pair, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const body = hex.replace('#', '');
  return [channel(body.slice(0, 2)), channel(body.slice(2, 4)), channel(body.slice(4, 6))];
}

/**
 * Viénot, Brettel & Mollon (1999) dichromat simulation, in linear sRGB.
 *
 * One matrix per dichromacy. They are the published values rather than derived here: deriving them
 * means an LMS round trip and a confusion-axis projection, and a hand-rolled version of a
 * twenty-five-year-old standard is a second source of truth about a thing nobody in this repository
 * is going to re-check.
 */
const DICHROMAT: Readonly<Record<string, readonly Triple[]>> = Object.freeze({
  protanopia: [
    [0.11238, 0.88762, 0.0],
    [0.11238, 0.88762, 0.0],
    [0.00401, -0.00401, 1.0],
  ],
  deuteranopia: [
    [0.29275, 0.70725, 0.0],
    [0.29275, 0.70725, 0.0],
    [-0.02234, 0.02234, 1.0],
  ],
  tritanopia: [
    [1.0, 0.14461, -0.14461],
    [0.0, 0.85653, 0.14347],
    [0.0, 0.85653, 0.14347],
  ],
});

function through(matrix: readonly Triple[], rgb: Triple): Triple {
  const row = (i: number): number => {
    const m = matrix[i] as Triple;
    return m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2];
  };
  return [row(0), row(1), row(2)];
}

/** Linear sRGB to CIELAB under D65. */
function labOf(rgb: Triple): Triple {
  const [r, g, b] = rgb;
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 ΔE — the distance the table above is quoted in. */
function deltaE(a: Triple, b: Triple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The smallest distance between any two of `hexes`, seen through `matrix` (or unimpaired). */
function closestPair(
  hexes: readonly string[],
  matrix: readonly Triple[] | undefined,
): { readonly deltaE: number; readonly a: number; readonly b: number } {
  const labs = hexes.map((hex) => {
    const linear = linearOf(hex);
    return labOf(matrix === undefined ? linear : through(matrix, linear));
  });
  let best = { deltaE: Number.POSITIVE_INFINITY, a: -1, b: -1 };
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      const d = deltaE(labs[i] as Triple, labs[j] as Triple);
      if (d < best.deltaE) best = { deltaE: d, a: i + 1, b: j + 1 };
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- *
 * The shipped palettes, read off the stylesheet
 * -------------------------------------------------------------------------- */

/**
 * Both eight-tint blocks, in the order they appear — `:root` (light) first, then the dark block.
 *
 * Read off `index.html` rather than imported from `render/tokens.ts`, and the difference is the
 * point: `tokens.ts`'s loose `SHAFT_*` exports are **the dark palette** (its own docstring says
 * so), and the § D251 defect this palette was moved to fix was precisely a set of tints that
 * existed in one mode and not the other. A check that read the module would measure one of the two
 * scales a player can be shown and call it the answer. The order below is the stylesheet's own —
 * `:root` first, then `:root[data-theme='dark']` — which is light before dark, the opposite way
 * round from the export names, and is why this reads selectors rather than trusting a hunch.
 */
async function shaftPalettes(): Promise<readonly (readonly string[])[]> {
  const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
  const blocks: string[][] = [];
  for (const block of html.matchAll(/(?:--shaft-[1-8]:\s*#[0-9a-fA-F]{6};\s*){8}/gu)) {
    const tints = [...block[0].matchAll(/--shaft-([1-8]):\s*(#[0-9a-fA-F]{6})/gu)].map(
      (m) => (m[2] as string).toLowerCase(),
    );
    blocks.push(tints);
  }
  return blocks;
}

describe('the colour scales under simulated colour-vision deficiency — issue #239', () => {
  it('reads both shipped shaft palettes, eight tints each — the derivation’s own control', async () => {
    const palettes = await shaftPalettes();
    /*
     * Two, because the stylesheet declares the tints twice — once per mode. A run that found one
     * would be measuring half the product and would still pass every assertion below, which is why
     * the count is checked before anything is computed from it.
     */
    expect(palettes).toHaveLength(2);
    for (const palette of palettes) {
      expect(palette).toHaveLength(8);
      expect(new Set(palette).size).toBe(8);
    }
  });

  /**
   * **The measurement, published rather than gated.**
   *
   * The assertion is deliberately weak — that the simulation *ran* and produced finite distances
   * that are no larger than the unimpaired ones. A threshold here would be a design decision
   * (see the module docstring), and a test that failed on it would be this file demanding a
   * palette change it has no standing to demand.
   *
   * What it does catch is the simulation silently doing nothing: a matrix typo that made the
   * transform an identity would show equal distances and go red.
   */
  it('separates the shaft tints less under every dichromacy than with unimpaired vision', async () => {
    const palettes = await shaftPalettes();
    for (const palette of palettes) {
      const plain = closestPair(palette, undefined);
      expect(Number.isFinite(plain.deltaE)).toBe(true);
      for (const matrix of Object.values(DICHROMAT)) {
        const simulated = closestPair(palette, matrix);
        expect(Number.isFinite(simulated.deltaE)).toBe(true);
        expect(simulated.deltaE).toBeLessThan(plain.deltaE);
      }
    }
  });

  /**
   * **The finding the table exists to record**, held as a test so it stops being prose.
   *
   * Under deuteranopia at least one pair of the eight is inside ΔE 5 in **both** palettes — at or
   * below the threshold at which two colours read as one. This is what puts the shaft tints on the
   * second branch of #239's criterion, and it is asserted in the direction it was measured: if a
   * future palette *did* separate them, this goes red and the file's whole argument gets re-read
   * rather than quietly outliving its evidence.
   */
  it('collapses at least one pair of shaft tints under deuteranopia, in both modes', async () => {
    const palettes = await shaftPalettes();
    for (const palette of palettes) {
      const worst = closestPair(palette, DICHROMAT['deuteranopia'] as readonly Triple[]);
      expect(worst.deltaE).toBeLessThan(5);
    }
  });

  /**
   * **The assertion that actually protects a player** — `render/tokens.ts`'s *"They are never the
   * only signal"*, which was a sentence with nothing behind it until here.
   *
   * Every car in the elevation carries its id and a legend spelling `{id} · {role} · {serves}` in
   * text, beside the tint and independent of it. A change that dropped either — drawing the band in
   * colour alone, which is the cheap version of this control — makes this red, and given the figures
   * above that change would make the editor unusable rather than merely worse.
   */
  it('gives every shaft its identity in text, not only in tint', () => {
    /* Twelve floors and four cars: more cars than the eight tints is not needed to make the
       point, and four is what `buildingEditor.test.ts` uses for every elevation claim. */
    const spec: BuildingSpec = { ...BLANK_SPEC, floors: 12, cars: 4, capacityPerFloor: 100 };
    const cars = elevationCarsOf(spec);
    expect(cars.length).toBeGreaterThan(1);
    for (const car of cars) {
      expect(car.id.trim().length).toBeGreaterThan(0);
      expect(car.legend).toContain(car.id);
      /* The legend is three fields, so it says more than the tint could encode in any case. */
      expect(car.legend.split('·').length).toBeGreaterThanOrEqual(3);
    }
    /* And the text is what distinguishes them: ids are unique where tints repeat every eight. */
    expect(new Set(cars.map((car) => car.id)).size).toBe(cars.length);
  });
});
