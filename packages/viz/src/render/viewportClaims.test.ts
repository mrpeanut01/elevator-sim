/**
 * The viewport breakpoints this page actually declares — and the guard on prose that claims others.
 *
 * ## The instance that caused this file
 *
 * `render/canvas.ts`'s `unansweredCallFloorIds` reasoned from a viewport rule to a shipped design
 * decision: *"That selector is `wide-only` (dropped below 1280 px) … so it is drawn on the landing
 * itself and named in the banner."* Issue #256 reported the premise false. It was more specific
 * than that, and the specificity is the point — **the sentence was true when it was written**:
 *
 * | commit | date | state |
 * |---|---|---|
 * | `6073a2b` | — | `index.html` carries `@media (max-width: 1279px) { .wide-only { display: none; } }`, and the bank filter, the landing `<select>` and **Export PNG** all carry `.wide-only` |
 * | `5e9e0d8` | 2026-07-28 | the docstring is written. Accurate |
 * | `22a1021` | 2026-07-30 | the wave 10 rebuild to the design handoff deletes rule and class together; the three controls move into `.provenance`, which no width rule reaches |
 *
 * So the CSS died two days after the prose was written, **nothing went red**, and the sentence
 * outlived its mechanism by a month — in `canvas.ts`, in `render/describeFrame.ts`, in that file's
 * test, and in `packages/viz/UX.md`'s `RS-02`. `CLAUDE.md` files this under *a stated mechanism
 * goes stale*, and its rule is the one this file mechanises: **if you write a sentence about why
 * something behaves as it does, either measure it or say it is unmeasured.**
 *
 * ## Why a breakpoint-set assertion rather than a spelling check
 *
 * The defect was not a typo. It was a rule being deleted with nothing downstream noticing, which is
 * the same shape as the *published number that does not reproduce* failure this repository already
 * guards in `benchmark/`. So the first assertion below derives the declared breakpoints **from the
 * stylesheet** and compares them against a reviewed list, in both directions: deleting a rule goes
 * red here and hands the deleter the list of prose that cited it, rather than leaving a sentence
 * behind for a support matrix to publish as a boundary the product does not have.
 *
 * Deriving the list from the file it checks would delete the check, so `DECLARED_BREAKPOINTS_PX` is
 * written out by hand — the same reason `dev/provenanceBlock.test.ts` refuses to build its own
 * expectation from `ELEMENT_IDS`.
 *
 * ## What is deliberately *not* asserted
 *
 * A general *"no prose may name a width that is not a breakpoint"* sweep was tried and rejected: it
 * cannot tell a viewport claim from an element one. `dev/main.ts` says *"below 900 px of canvas"*
 * and `render/overlayRender.test.ts` says *"nothing below 200 px"*, and both are honest sentences
 * about a bitmap rather than a window. A guard that cried about those would train people to ignore
 * it, which is the failure `DECISIONS.md` § D91 records for wall-clock gates. This file is narrowed
 * to the one withdrawn number, which is the claim that actually went stale.
 *
 * `index.html` is read as text because `vitest.config.ts` is `environment: 'node'` for every
 * project — there is no jsdom here, and none is needed to ask what the shipped page declares.
 *
 * **Recorded here rather than in `DECISIONS.md`, under § D405.** The claim this file exists to
 * keep withdrawn is § D352's; what is local to it is the narrowing above — why a general
 * *no prose may name a width* sweep was tried and rejected, and why `index.html` is read as text.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const VIZ_SRC = fileURLToPath(new URL('../', import.meta.url));
const INDEX_HTML = fileURLToPath(new URL('../../index.html', import.meta.url));
const SURFACES_TS = fileURLToPath(new URL('../dev/surfaces.ts', import.meta.url));

/**
 * Every width breakpoint `index.html` declares, as the pixel value in the query itself.
 *
 * Measured 2026-08-24 on `charter-integration`. Written out rather than derived — see the
 * docstring. `prefers-reduced-motion` is not here because it is not a width.
 *
 * | px | what it does |
 * |---|---|
 * | 720 | `.overnight-row` collapses to one column |
 * | 767 | `RX-03` — the columns stack, the stage goes first, the canvas keeps `60vh` |
 * | 899 | the left rail narrows to 236 px |
 * | 1179 | `[data-hide-narrow]` is dropped — the spec line and the banner |
 * | 1339 | the right rail becomes an overlay drawer rather than disappearing |
 */
const DECLARED_BREAKPOINTS_PX: readonly number[] = Object.freeze([720, 767, 899, 1179, 1339]);

/**
 * Sites that still assert the withdrawn 1280 px rule, with no refutation beside them.
 *
 * **Empty, and issue #260 is why.** It held two entries — `render/describeFrame.ts`'s interface
 * docstring and the test comment that quotes it — recorded rather than repaired because issue
 * #256's lane could not edit them. Both were repaired on the commit that empties this list, each
 * gaining the withdrawal and the account of what does govern that `<select>` (which tab is open,
 * and a default of `none`), and neither gaining a replacement width. The ghost check below is what
 * forced the deletion: it goes red on an entry that has stopped reproducing, so a register cannot
 * quietly become decoration.
 *
 * **The list stays, empty, rather than being deleted with its last entry.** An empty register is a
 * state that has to keep being checked — the discipline `everyday/screens.ts#UNBUILT_REASONS`
 * already keeps one screen down — and with nothing in it the first case below now guards the whole
 * of `packages/viz/src` with no exemptions at all, which is the strongest form this check has.
 *
 * Asserted in **both** directions below, which is what stops this list becoming decoration: an
 * entry that has stopped reproducing must be deleted on the commit that fixed it.
 */
const KNOWN_STALE: readonly string[] = Object.freeze([]);

/** The claim that was withdrawn, in the form the stale sites spell it. */
const WITHDRAWN_CLAIM = 'below 1280 px';

/**
 * Words that mark a mention of the withdrawn claim as a *withdrawal* rather than an assertion.
 *
 * The 400-character window is `validation/documentation.test.ts`'s, deliberately: that file guards
 * the destination-dispatch mechanism the same way, and two guards against the same defect class
 * should not disagree about how close a refutation has to be.
 */
const REFUTATION_MARKERS: readonly string[] = Object.freeze([
  'withdrawn',
  'is not true now',
  'stale',
  '#256',
]);
const REFUTATION_WINDOW_CHARS = 400;

interface StaleMention {
  readonly file: string;
  readonly index: number;
}

function tsFilesUnder(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Every mention of the withdrawn claim that carries no refutation within the window. */
function unrefutedMentions(): readonly StaleMention[] {
  const found: StaleMention[] = [];
  for (const file of tsFilesUnder(VIZ_SRC)) {
    const text = readFileSync(file, 'utf8');
    let at = text.indexOf(WITHDRAWN_CLAIM);
    while (at !== -1) {
      const window = text
        .slice(Math.max(0, at - REFUTATION_WINDOW_CHARS), at + REFUTATION_WINDOW_CHARS)
        .toLowerCase();
      if (!REFUTATION_MARKERS.some((marker) => window.includes(marker))) {
        found.push({ file: file.slice(VIZ_SRC.length), index: at });
      }
      at = text.indexOf(WITHDRAWN_CLAIM, at + 1);
    }
  }
  return found;
}

describe('issue #256 — the page declares the breakpoints its prose cites', () => {
  it('declares exactly the reviewed set, and no others', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const declared = [
      ...new Set(
        [...html.matchAll(/@media\s*\((?:max|min)-width:\s*(\d+)px\)/g)].map((m) =>
          Number(m[1] ?? '0'),
        ),
      ),
    ].sort((a, b) => a - b);

    // Guard on the guard: a regex that stops matching would otherwise pass this file by
    // asserting nothing, the degradation `citations.test.ts` names in its own parse.
    expect(declared.length, 'no width media query found in index.html at all').toBeGreaterThan(0);

    expect(
      declared,
      'The width breakpoints in index.html no longer match the reviewed set. This is the check ' +
        'issue #256 existed for: a rule deleted here leaves prose behind that cites it. Before ' +
        'updating DECLARED_BREAKPOINTS_PX, grep the tree for the width being removed — ' +
        "packages/viz/UX.md's RS rows and render/canvas.ts both reason from these numbers.",
    ).toEqual([...DECLARED_BREAKPOINTS_PX]);
  });

  it('keeps the drawer constant and the drawer rule in step', () => {
    const surfaces = readFileSync(SURFACES_TS, 'utf8');
    const constant = /export const DRAWER_BREAKPOINT_PX = (\d+);/.exec(surfaces);
    expect(constant, 'surfaces.ts no longer exports DRAWER_BREAKPOINT_PX as a literal').not.toBeNull();

    // `main.ts` builds its matchMedia query as `max-width: ${DRAWER_BREAKPOINT_PX - 1}px`, so the
    // constant and the stylesheet's rule are one number written twice. They may not drift.
    expect(
      Number(constant?.[1] ?? '0') - 1,
      'DRAWER_BREAKPOINT_PX - 1 is no longer a breakpoint index.html declares, so the JS listener ' +
        'and the CSS rule fire at different widths.',
    ).toBe(1339);
  });

  it('has no .wide-only class and no 1279 px rule left to hide it', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    // The rule the withdrawn claim described. It was real; it was deleted at 22a1021. If it ever
    // comes back, canvas.ts's withdrawal becomes wrong in the other direction and must be revisited
    // rather than silently re-inherited.
    expect(html).not.toContain('wide-only');
    expect(html).not.toContain('1279px');
  });
});

describe('issue #256 — the withdrawn claim may not be re-asserted', () => {
  it('is only ever mentioned beside its refutation, outside the register', () => {
    const unrefuted = unrefutedMentions().filter(
      (mention) => !KNOWN_STALE.some((known) => mention.file.endsWith(known)),
    );

    expect(
      unrefuted.map((m) => m.file),
      `A source file asserts "${WITHDRAWN_CLAIM}" with no refutation within ` +
        `${String(REFUTATION_WINDOW_CHARS)} characters. There is no 1280 px breakpoint in this ` +
        'tree and there has not been one since 22a1021. What governs the landing selector is ' +
        'which tab is open and whether a landing has been picked — see render/canvas.ts.',
    ).toEqual([]);
  });

  it('still reproduces on every entry in the register, and on nothing it has dropped', () => {
    const stale = unrefutedMentions().map((mention) => mention.file);

    for (const known of KNOWN_STALE) {
      expect(
        stale.some((file) => file.endsWith(known)),
        `${known} is in KNOWN_STALE but no longer asserts "${WITHDRAWN_CLAIM}" unrefuted. If it ` +
          'was fixed, delete the entry on the same commit — a registered finding that has been ' +
          'repaired must stop being registered, or the register becomes decoration.',
      ).toBe(true);
    }
  });
});
