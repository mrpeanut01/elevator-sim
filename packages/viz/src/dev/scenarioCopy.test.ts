/**
 * **The page's own prose about the campaign, checked against the campaign** — `DECISIONS.md`
 * § D253, play-test issue #37.
 *
 * ## What went wrong, and why nothing caught it
 *
 * `index.html` said *"Scenarios — five buildings, any order"*, *"the other four"* and *"All five
 * ship …"* over a Scenarios tab that draws **eight** cards. The cards themselves are generated from
 * `shift/contracts.ts` and were right; the heading, the intro and the footnote around them are
 * static markup, and static markup cannot count. Three more buildings landed after the handoff was
 * drawn (`docs/12` § 4.7) and three sentences did not move with them.
 *
 * The defect is not the number. It is that **a hand-typed count had nothing checking it**, which is
 * the same failure `dev/tokens.test.ts` closes for colours and `elementMap.test.ts` closes for ids,
 * on the same file, by the same technique — read the markup as text, because there is no jsdom here
 * and the markup is the contract.
 *
 * ## Why the count is pinned rather than derived, and rather than deleted
 *
 * Three routes were available and two were rejected:
 *
 * - **Derive it at runtime**, by giving the three sentences ids and having a mount write the
 *   number in. It is the honest shape, and it needs `dev/elementMap.ts` and `dev/scenariosPanel.ts`
 *   — outside this lane. Recorded as the better fix rather than taken.
 * - **Delete the count** — *"every building, any order"* — which cannot go stale and cannot be
 *   wrong. Rejected because it answers a question by removing it: *how many scenarios are there*
 *   is the first thing a player wants from the tab, and the count is the only thing on the page
 *   that says it before the cards render.
 * - **Type it and pin it**, which is this file. The number stays where a reader can see it, and the
 *   day a ninth contract lands the suite goes red naming the sentence to change. That is what was
 *   missing: not derivation, but a check.
 *
 * ## And the path the footnote handed a player
 *
 * *"All five ship with the simulator in `data/buildings/`"* named a repository directory on a
 * screen aimed at somebody playing a game. Two more were found in the same file while looking —
 * `data/elevator-specs.json` in two machine-editor tooltips and `CLAUDE.md` in the batch panel's
 * replications label — and all four are gone. The sweep below is over the whole markup rather than
 * over the Scenarios panel, because scoping it to the panel would have left the three it found.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTRACTS } from '../shift/contracts.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/** The markup, with the stylesheet and every comment removed — what a reader can actually read. */
async function playerFacingMarkup(): Promise<string> {
  const html = await indexHtml();
  const styleEnd = html.indexOf('</style>');
  if (styleEnd < 0) throw new Error('index.html has no </style>');
  return html.slice(styleEnd).replace(/<!--[\s\S]*?-->/g, ' ');
}

/** The Scenarios panel's own markup. */
async function scenariosPanel(): Promise<string> {
  const markup = await playerFacingMarkup();
  const start = markup.indexOf('id="panel-scenarios"');
  if (start < 0) throw new Error('index.html has no #panel-scenarios');
  const end = markup.indexOf('</section>', start);
  return markup.slice(start, end);
}

/**
 * Small numbers in words.
 *
 * A lookup rather than a spelling algorithm, and it throws past its end on purpose: a campaign of
 * thirteen scenarios is a different design conversation, and a test that silently started
 * comparing digits would pass over a sentence nobody had reread.
 */
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

function inWords(count: number): string {
  const word = NUMBER_WORDS[count];
  if (word === undefined) {
    throw new Error(
      `${String(count)} scenarios: past what this test can spell, and past what the Scenarios ` +
        "tab's three sentences were written for. Reread them, then extend NUMBER_WORDS.",
    );
  }
  return word;
}

describe('the Scenarios tab counts the scenarios there are — § D253', () => {
  /**
   * The three sentences that carry a count, each with the word **captured** rather than searched
   * for.
   *
   * Reading the number out and comparing it is stronger than asserting the right sentence is
   * present, in both directions at once: a page that said *five* would fail with the word it said,
   * and a page that had lost a sentence fails because the pattern does not match at all. A
   * `toContain` on the correct string is satisfied by a page that contains the wrong one too.
   *
   * Matching the shape rather than the bare word also lets *"the clean shifts **one** asks for"*
   * stand. A blanket ban on number words in the panel would have to be answered by rewording
   * ordinary English, which is how a check ends up being edited instead of the thing it checks.
   */
  const COUNTS: readonly (readonly [string, RegExp, (total: number) => number])[] = [
    ['the heading', /Scenarios — ([a-z]+) buildings, any order/, (total) => total],
    ['the intro', /each building teaches something the other ([a-z]+) cannot/, (total) => total - 1],
    ['the footnote', /All ([a-z]+) ship with the simulator/, (total) => total],
  ];

  it('names the campaign’s size in all three sentences, from `CONTRACTS`', async () => {
    /*
     * Derived on the expectation side, typed on the page side — which is the whole arrangement.
     * `CONTRACTS` is what `dev/scenariosPanel.ts` draws a card from, so this compares the prose
     * against the list the cards under it come from rather than against a remembered number.
     */
    const panel = await scenariosPanel();
    for (const [where, pattern, expected] of COUNTS) {
      const match = pattern.exec(panel);
      expect(match, `${where}: the sentence this test pins is not on the page`).not.toBeNull();
      expect(match?.[1], where).toBe(inWords(expected(CONTRACTS.length)));
    }
  });

  it('negative control: the patterns read the page and would catch the count that shipped', async () => {
    // #37's defect was `five` in all three sentences over eight cards. Planting it back is the only
    // way to know these patterns would have found it rather than matching something else.
    const stale = (await scenariosPanel())
      .replace(/Scenarios — [a-z]+ buildings/, 'Scenarios — five buildings')
      .replace(/the other [a-z]+ cannot/, 'the other four cannot')
      .replace(/All [a-z]+ ship/, 'All five ship');
    const read = COUNTS.map(([, pattern]) => pattern.exec(stale)?.[1]);
    expect(read).toEqual(['five', 'four', 'five']);
    expect(read).not.toEqual(COUNTS.map(([, , expected]) => inWords(expected(CONTRACTS.length))));
  });

  it('every scenario is a distinct building, which is what "N buildings" claims', async () => {
    // The heading counts *buildings* and `CONTRACTS` counts *scenarios*. They are the same number
    // only while no two contracts share a building, so that is asserted rather than assumed.
    const buildings = new Set(CONTRACTS.map((contract) => contract.buildingId));
    expect(buildings.size).toBe(CONTRACTS.length);
  });
});

describe('the page hands a player no repository path', () => {
  /**
   * Paths and file names that exist in this repository and nowhere a player can go.
   *
   * `.json`/`.ts`/`.md` as bare suffixes are not swept: the Lab and Parameters tabs legitimately
   * name a *schema* and a *profile*, and a rule that banned the characters would be answered by
   * rewording rather than by removing a leak. What is banned is a **path a reader could try to
   * open** and the names of this repository's own documents.
   */
  const FORBIDDEN = [
    /\bdata\/[a-z-]/i,
    /\bpackages\/[a-z-]/i,
    /\bdocs\/\d/i,
    /\bCLAUDE\.md\b/,
    /\bDECISIONS\.md\b/,
    /\bREADME\.md\b/,
  ];

  it('names none in anything a reader sees', async () => {
    /*
     * The Scenarios footnote said *"All five ship with the simulator in `data/buildings/`"*, which
     * is the reported half. Sweeping the whole markup rather than that panel found two more:
     * `data/elevator-specs.json` in two machine-class tooltips and `CLAUDE.md` in the batch
     * panel's *replications* label. A path is not an answer to anybody holding a mouse.
     */
    const markup = await playerFacingMarkup();
    const found = FORBIDDEN.flatMap((pattern) => {
      const match = pattern.exec(markup);
      return match === null ? [] : [match[0]];
    });
    expect(found, 'a repository path or document name in player-facing markup').toEqual([]);
  });

  it('negative control: the sweep reads the markup, and lets the module entry point through', async () => {
    // A regex set that matched nothing would pass in silence. And the one path that *must* stay is
    // the page's module entry point, which is not prose — the sweep's patterns are written so it
    // survives, and that is asserted rather than left to luck. It is `/src/everyday/boot.ts` since
    // the Everyday shell became what the page loads; the assertion follows the entry point rather
    // than naming `dev/main.ts` for ever, because what it is checking is *a script src survives the
    // sweep*, not which module the product happens to boot.
    const markup = await playerFacingMarkup();
    expect(markup).toContain('/src/everyday/boot.ts');
    expect(markup.length).toBeGreaterThan(1000);
    const planted = `${markup} <p>see data/buildings/ for more</p>`;
    expect(FORBIDDEN.some((pattern) => pattern.test(planted))).toBe(true);
  });
});
