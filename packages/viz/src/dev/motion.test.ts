/**
 * `KB-14` — one of the seven ⛔ non-negotiable keyboard rows, asserted on both of its clauses.
 *
 * The row was ⚠️ because "the media query was not emulated in the browser session". `T39` drove
 * the autoplay clause in the shipped page by replacing `window.matchMedia` before pressing
 * **Run** — an honest emulation of the only thing the app reads — and pins it here so it does
 * not depend on an operating system with the preference switched on.
 *
 * The second clause is a CSS fact, so it is asserted against `index.html` itself: the guard block
 * exists, it selects everything, and both properties carry `!important`. That is what makes it
 * cover a transition somebody adds next year without knowing this row exists.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { REDUCED_MOTION_QUERY, prefersReducedMotion, shouldAutoplay } from './motion.js';

const probe = (matches: boolean) => (query: string) => {
  // The query is asserted here rather than ignored: a preference read through the wrong media
  // string is a preference that is never read at all, and nothing else would notice.
  expect(query).toBe(REDUCED_MOTION_QUERY);
  return { matches };
};

describe('KB-14 — the reader asked for no motion', () => {
  it('reads the preference through the one query the stylesheet also uses', () => {
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(prefersReducedMotion(probe(true))).toBe(true);
    expect(prefersReducedMotion(probe(false))).toBe(false);
  });

  it('does not autoplay a freshly adopted run under a reduced-motion preference', () => {
    expect(shouldAutoplay(probe(true))).toBe(false);
  });

  it('still autoplays when no preference is expressed, so nothing else changed', () => {
    expect(shouldAutoplay(probe(false))).toBe(true);
  });

  it('has a stylesheet guard that overrides any transition or animation', async () => {
    const html = await readFile(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    );
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/.exec(html);
    expect(block, 'index.html has no prefers-reduced-motion block').not.toBeNull();
    const body = block?.[1] ?? '';
    expect(body).toMatch(/\*\s*\{/); // the universal selector, so later CSS cannot escape it
    expect(body).toMatch(/transition:\s*none\s*!important/);
    expect(body).toMatch(/animation:\s*none\s*!important/);
  });
});
