/**
 * The deleted `t` (n ≤ 25) / `z` (n > 25) crossover stays deleted **in prose**, not only in code.
 *
 * ## Why this guard exists
 *
 * `89bbf37` deleted `halfWidthQuantile` and made every interval in this repository Student-t at
 * `n − 1` at every `n` ([`DECISIONS.md` § D14](../../../../DECISIONS.md)); docs/03 § Part 3 was
 * corrected to match on 2026-07-27. Nothing executed the sentences, so the *family* survived in
 * docstrings for months after the *function* was gone. `docs/07-handoff.md` § 8 recorded one
 * surviving site. Measured against the tree at `63186a8` there were **ten**, in seven files, and
 * three of them asserted the crossover as a present-tense fact about shipped code:
 *
 * | site | what it claimed |
 * |---|---|
 * | `runner/types.ts` § *What is deliberately not here* | the arithmetic **is** t ≤ 25 / z above |
 * | `runner/types.ts` § `StoppingVerdict.distribution` | the field records `'t'` for `n ≤ 25`, `'z'` past it |
 * | `runner/types.ts` § `StoppingRule` | docs/03 § Part 3 **specifies** the crossover |
 * | `runner/stopping.ts` module docstring | quoted § Part 3 as a **four**-line rule with the split |
 * | `runner/replicationRunner.ts` § *What this module refuses to do* | "the t/z switch at n = 25" |
 * | `tuning/report/holdout.ts` | "the `n <= 25` t/z split `reports/statistics.ts` **applies**" |
 * | `validation/harness.ts` | § Part 3 "needs correcting" — it had already been corrected |
 * | `reports/statistics.ts` module docstring | the same discharged instruction |
 * | `runner/fixtures.test-helper.ts`, `runner/stopping.test.ts` | the deliberate test double, attributed to a doc that no longer says it |
 *
 * The three in the middle column marked *present-tense* are defects on their own terms. The rest
 * are the shape [§ D60](../../../../DECISIONS.md) measured seven instances of: a sentence about a
 * sibling artefact that was true when written and is not now.
 *
 * ## What it asserts, and what it deliberately does not
 *
 * Every occurrence of the crossover idiom in `packages/*​/src` must sit within
 * {@link MARKER_WINDOW} characters of a **supersession marker** — a phrase saying the family is
 * deleted, superseded, historical, or the literature's rather than this repository's. Several
 * marker wordings rather than one blessed phrase, for § D60's stated reason: the corrections were
 * written by different tasks and none of them had this guard to write against.
 *
 * The file set is **derived from the directory**, never a hand-written list. § D114's lesson is
 * that a guard reading from a list of names cannot see the eleventh instance, and this claim has
 * already been under-counted once — by a factor of ten against the register's "one place".
 *
 * **Markdown is out of scope on purpose.** `DECISIONS.md` is an append-only record whose whole job
 * is to carry superseded statements verbatim, and the docs are owned by integration. Guarding
 * source is the half that had no owner.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PACKAGES = join(ROOT, 'packages');

/**
 * The crossover idiom, in the wordings the ten sites actually used.
 *
 * Three shapes, because the sites did not agree on one: a `t` token followed closely by an
 * `n ≤ 25` bound, an `n > 25` bound followed closely by a normal-approximation token, and the
 * compact "t/z split | switch | crossover". `\bt\b` rather than a bare `t` so that identifiers
 * like `useT` and words like `const` cannot match; the source of the double that legitimately
 * *implements* the crossover contains both.
 */
const CROSSOVER_CLAIMS = new RegExp(
  [
    String.raw`(?:\bt-distribution\b|\bt\b|t\[n-?1)[^.\n]{0,40}?\bn\s*(?:≤|<=)\s*25`,
    String.raw`\bn\s*>=?\s*25[^.\n]{0,40}?(?:normal approximation|crossover|\bz\b)`,
    String.raw`t/z\s*(?:split|switch|crossover)`,
  ].join('|'),
  'gi',
);

/**
 * A phrase marking the crossover as gone rather than current.
 *
 * Measured over the corrected tree on 2026-07-28 (404 `.ts` files, this file excluded): **18
 * occurrences, and the furthest any of them sits from its nearest marker is 151 characters** —
 * `benchmark/index.ts`'s "the T2 t/z switch could not have surfaced them", whose marker is the
 * *until 2026-07-27* four sentences earlier. The test below prints both numbers on every run, so a
 * later reader can see whether {@link MARKER_WINDOW} is still a bound or has become a tolerance.
 */
const SUPERSESSION_MARKERS =
  /superseded|no longer|any ?more|deleted|until 2026|before 2026|used to|as of 2026|the 2026-07 switch|was always|implemented nowhere|not implemented anywhere|never implemented|has not since|does not implement|is gone|literature rather than|it does not, and has not/gi;

/**
 * Characters either side of an occurrence in which a supersession marker must appear.
 *
 * **300 — twice the measured worst case of 151, and deliberately tighter than § D60's 4×.**
 *
 * That ratio was tried first and **measured too loose to catch the defect this guard exists for**,
 * which is worth recording rather than quietly correcting. Re-introducing `StoppingVerdict`'s
 * original stale one-liner into `runner/types.ts` put it **349 characters** from the nearest
 * marker — a marker belonging to the *neighbouring* corrected docstring, not to the claim — and a
 * 600-character window passed it. In a file where several sites have been corrected, a generous
 * window lets a newly-stale sentence borrow its neighbour's refutation. 300 fails that probe and
 * still leaves 2× headroom over everything in the tree.
 */
const MARKER_WINDOW = 300;

/**
 * This file, excluded from its own scan.
 *
 * Its header tabulates the ten sites in the wordings they used, and its positive control quotes
 * them verbatim — so a guard that scanned itself would be measuring the length of its own
 * documentation. Stated rather than silent, because "the audit exempts one file" is exactly the
 * kind of thing that stops being read.
 */
const SELF = 'packages/experiments/src/validation/quantileFamily.test.ts';

/** Backticks, emphasis and line wrapping stripped, so a wrap cannot hide a match. */
const plain = (source: string): string =>
  source.replaceAll('`', '').replaceAll('*', '').replaceAll("'", '').replace(/\s+/g, ' ');

function typescriptFilesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      found.push(...typescriptFilesUnder(path));
      continue;
    }
    if (entry.name.endsWith('.ts')) found.push(path);
  }
  return found;
}

/** Every `.ts` under every package's `src`, derived from disk rather than listed. */
function sourceFiles(): readonly string[] {
  const packages = readdirSync(PACKAGES, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const found: string[] = [];
  for (const entry of packages) {
    const src = join(PACKAGES, entry.name, 'src');
    try {
      found.push(...typescriptFilesUnder(src));
    } catch {
      /* A package without a `src/` is not an error; it is a package this guard has nothing to say
         about. The count assertion below is what stops the scope silently collapsing to zero. */
    }
  }
  return found.sort().filter((path) => !path.endsWith(SELF));
}

/** Distance from an occurrence to the nearest supersession marker, or `Infinity`. */
function nearestMarker(text: string, start: number, end: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const marker of text.matchAll(SUPERSESSION_MARKERS)) {
    const from = marker.index;
    const to = from + marker[0].length;
    const distance = from >= end ? from - end : to <= start ? start - to : 0;
    if (distance < best) best = distance;
  }
  return best;
}

describe('the deleted t/z crossover is never stated as current (DECISIONS.md § D14)', () => {
  const files = sourceFiles();

  it('scans a file set derived from disk, and a real one', () => {
    /* The guard on the guard. A scan that silently found nothing to read would pass every
       assertion below, which is how a permanent audit comes to assert nothing (§ D114). */
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((path) => path.endsWith('/runner/types.ts'))).toBe(true);
    expect(files.some((path) => path.endsWith('/reports/statistics.ts'))).toBe(true);
    /* And the one exemption is real rather than a name that no longer matches anything. */
    expect(files.some((path) => path.endsWith(SELF))).toBe(false);
    expect(readFileSync(join(ROOT, SELF), 'utf8').length).toBeGreaterThan(0);
  });

  it('never states the crossover without a supersession marker beside it', () => {
    const unmarked: string[] = [];
    let worst = 0;
    let occurrences = 0;
    for (const path of files) {
      const text = plain(readFileSync(path, 'utf8'));
      for (const claim of text.matchAll(CROSSOVER_CLAIMS)) {
        occurrences += 1;
        const start = claim.index;
        const distance = nearestMarker(text, start, start + claim[0].length);
        if (distance > MARKER_WINDOW) {
          unmarked.push(`${path.slice(ROOT.length)} — "${claim[0].trim()}"`);
        } else if (distance > worst) {
          worst = distance;
        }
      }
    }
    /* Printed rather than asserted: the number is what a later reader needs to judge whether
       MARKER_WINDOW is a real bound or one trimmed to fit. */
    console.log(
      `[crossover] ${occurrences} occurrence(s) in ${files.length} source files; furthest from a marker: ${worst} characters (window ${MARKER_WINDOW})`,
    );
    expect(unmarked).toEqual([]);
  });

  it('would catch the claim it was built for', () => {
    /* A positive control, because a scanner that has never matched anything is a scanner nobody
       has tested. These are the exact strings the ten sites carried, in the wordings they used. */
    const caught = [
      'the t-distribution for `n ≤ 25`, the normal approximation past it',
      "Which approximation the rule used — `'t'` for `n ≤ 25`, `'z'` past it.",
      '`t[n-1, conf]` for `n ≤ 25`, `z[conf]` beyond it',
      'halfWidth = z[conf] * (s / sqrt(n))     # n >  25, normal approximation',
      'the t/z switch at n = 25',
      'The `n <= 25` t/z split `reports/statistics.ts` applies',
      "a `t` (n ≤ 25) / `z` (n > 25) crossover",
    ];
    for (const claim of caught) {
      const text = plain(claim);
      expect([...text.matchAll(CROSSOVER_CLAIMS)].length, claim).toBeGreaterThan(0);
      expect(nearestMarker(text, 0, text.length), claim).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('does not fire on prose that already says the crossover is gone', () => {
    /* The other direction, so the pattern cannot be tightened into one that never matches. */
    const allowed = [
      'the `n <= 25` t/z split `reports/statistics.ts` applies — it does not, and has not since `89bbf37`',
      "a `t` (n ≤ 25) / `z` (n > 25) crossover, deleted in 89bbf37",
    ];
    for (const sentence of allowed) {
      const text = plain(sentence);
      const distances = [...text.matchAll(CROSSOVER_CLAIMS)].map((claim) =>
        nearestMarker(text, claim.index, claim.index + claim[0].length),
      );
      expect(distances.length, sentence).toBeGreaterThan(0);
      for (const distance of distances) expect(distance, sentence).toBeLessThanOrEqual(MARKER_WINDOW);
    }
  });
});
