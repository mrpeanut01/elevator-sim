/**
 * **A shipped building is listed in both registers, in both directions** — GitHub issue **#376**.
 *
 * ## The defect, and the joke in it is the point
 *
 * Nine buildings ship in `data/buildings/`. Both registers listed **eight**.
 * `data/buildings/burj-class-reference.json` landed with issue #376 and
 * [§ D527](../../../../DECISIONS.md) and appeared in neither `data/buildings/README.md`'s table nor
 * `docs/04-test-buildings.md`'s sections; `grep -i burj` returned nothing in either.
 *
 * That register had *already* been repaired once for exactly this. Its own § Status paragraph read:
 *
 * > **This table was three buildings stale**: Secure Tower, Mixed-Use High-Rise and Vertical City
 * > were listed as unbuilt Phase 1 deliverables long after they shipped, **and nothing failed,
 * > because no test reads it**. It is now a list of what is on disk, **which is checkable by
 * > looking**.
 *
 * *Checkable by looking* is the mechanism that failed, one building later. A register nobody
 * executes is a register that is right on the day it is written and drifts silently afterwards —
 * `docs/07` § 9's *"prose is the only artefact in this repository that nothing executes"*. So the
 * row was half the job and this file is the other half, and this half is the more valuable one:
 * **ten further building-authoring issues (#424–#440) are each about to add a building**, and each
 * one now meets a red test rather than a paragraph asking nicely.
 *
 * ## What it derives, and what it deliberately does not match on
 *
 * The shipped set is `readdirSync(data/buildings)` filtered to `*.json`. Nothing here is
 * transcribed: [§ D213](../../../../DECISIONS.md) spent a whole commit on five hand-written lists,
 * two of which were guards that could no longer see what they were guarding, and a tenth entry in a
 * literal here would be the defect this file exists to catch, wearing a test's clothes.
 *
 * **The match is on the config file, never on a prose title.** Every check resolves a markdown link
 * target against the citing document's own directory and keeps it only if it lands in
 * `data/buildings/` — so `[Garden Apartments](../data/buildings/garden-apartments.json)` and
 * `[`garden-apartments.json`](garden-apartments.json)` both count, and a heading renamed from
 * *Garden Apartments* to anything at all cannot silently satisfy the guard. A title is what a
 * reader searches; a filename is what a building **is**. The two agree today because
 * {@link SHIPPED} also asserts each config's own `id` equals its filename stem, which is what makes
 * matching on the filename a claim about the building rather than about the disk.
 *
 * ## Three registers, because the defect was in two of them and the third is the same shape
 *
 * 1. `data/buildings/README.md` § Status — the table beside the configs.
 * 2. `docs/04-test-buildings.md`'s overview table — the at-a-glance stress-case register.
 * 3. `docs/04-test-buildings.md`'s numbered `## n.` sections — the actual rationale, one per
 *    building, anchored on a `**Config:**` line so a section may still link a *sibling's* config in
 *    prose without confusing the bijection.
 *
 * Every one is checked in **both** directions. A building added with no row is red; a row for a
 * building that no longer ships is red. One-directional is how a register goes stale in the other
 * direction, and `oracle/remainingBuildings.test.ts` makes the same point about its own partition.
 *
 * ## The guard on the guard
 *
 * A walk that finds nothing, or a link regex that stops matching, would make this file pass by
 * asserting nothing. Three things stand against that: the shipped set asserts its own size, every
 * register comparison is symmetric (an empty extraction fails the *absent* half loudly), and
 * {@link configsLinkedIn} carries a positive control that runs the real extractor over the real
 * § Status table with one row deleted and one invented row added — at the value the defect really
 * had, which is one row out of nine.
 *
 * ## Where the record lives
 *
 * This docstring is it, per [§ D405](../../../../DECISIONS.md): the rule it writes down — *a
 * building owes a row in both registers* — is the one `data/buildings/README.md` and `docs/04`
 * already state in their own words, and this file mechanises rather than moves it. Nothing here
 * overrules a recorded decision or binds a module that has not agreed to it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const BUILDINGS_DIR = join(ROOT, 'data', 'buildings');
const DOCS_DIR = join(ROOT, 'docs');

const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

/** The two registers, and the front-door row that counts them. */
const BUILDINGS_README = 'data/buildings/README.md';
const TEST_BUILDINGS = 'docs/04-test-buildings.md';

/**
 * Every building the project ships, derived from disk.
 *
 * The `id` is read out of the config rather than assumed from the file name, because every check
 * below matches on the file name and that is only honest while the two agree — which the first case
 * asserts.
 */
const SHIPPED: readonly { readonly file: string; readonly id: string }[] = Object.freeze(
  readdirSync(BUILDINGS_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => {
      const parsed = JSON.parse(readFileSync(join(BUILDINGS_DIR, file), 'utf8')) as {
        id?: unknown;
      };
      return { file, id: typeof parsed.id === 'string' ? parsed.id : '' };
    }),
);

const SHIPPED_FILES: readonly string[] = Object.freeze(SHIPPED.map((one) => one.file));

/**
 * Every `data/buildings/*.json` this stretch of markdown links to, by file name.
 *
 * Link targets are resolved against `fromDir` — the citing document's own directory — and kept only
 * if they land in `data/buildings/`. That is what lets one function read a register written in
 * `data/buildings/` (`](garden-apartments.json)`) and one written in `docs/`
 * (`](../data/buildings/garden-apartments.json)`), and what keeps `docs/04` § 6's link to
 * `../data/traffic-profiles.json` — a real `.json` link to something that is not a building — out
 * of the count.
 */
function configsLinkedIn(markdown: string, fromDir: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (const hit of markdown.matchAll(/\]\(([^)\s]+\.json)\)/gu)) {
    const target = resolve(fromDir, hit[1] as string);
    if (dirname(target) !== BUILDINGS_DIR) continue;
    found.add(basename(target));
  }
  return found;
}

/** The slice of `markdown` under `heading`, up to the next heading at the same level. */
function sectionUnder(markdown: string, heading: string, where: string): string {
  const start = markdown.indexOf(heading);
  expect(start, `${where} has no "${heading}" section`).toBeGreaterThanOrEqual(0);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
}

/**
 * `docs/04`'s overview table — the run of `|` rows that follows its header.
 *
 * Taken by position rather than by heading, because the table sits under the document's `#` title
 * with no `##` of its own.
 */
function overviewTableOf(markdown: string): string {
  const header = markdown.indexOf('\n| Name |');
  expect(header, `${TEST_BUILDINGS} has no overview table starting "| Name |"`).toBeGreaterThan(0);
  const end = markdown.indexOf('\n\n', header);
  return markdown.slice(header, end === -1 ? markdown.length : end);
}

interface NumberedSection {
  readonly ordinal: number;
  readonly heading: string;
  readonly body: string;
}

/**
 * The `## n. Title` sections of a document, in document order.
 *
 * A heading that is not numbered — `## Modeling notes`, which sits between sections 5 and 6 —
 * closes the section it follows rather than joining it, so a building's rationale cannot bleed past
 * an unrelated heading and be counted twice.
 */
function numberedSectionsOf(markdown: string): readonly NumberedSection[] {
  const sections: NumberedSection[] = [];
  let open: { ordinal: number; heading: string; lines: string[] } | undefined;
  const close = (): void => {
    if (open !== undefined) {
      sections.push({ ordinal: open.ordinal, heading: open.heading, body: open.lines.join('\n') });
    }
    open = undefined;
  };
  for (const line of markdown.split('\n')) {
    const numbered = /^## (\d+)\.\s+(.+)$/u.exec(line);
    if (numbered !== null) {
      close();
      open = { ordinal: Number(numbered[1]), heading: numbered[2] as string, lines: [] };
      continue;
    }
    if (line.startsWith('## ')) {
      close();
      continue;
    }
    open?.lines.push(line);
  }
  close();
  return sections;
}

/** `**Config:** [`x.json`](../data/buildings/x.json)` — the section's machine-readable anchor. */
const CONFIG_LINE = /^\*\*Config:\*\*\s+\[`([^`]+)`\]\(([^)\s]+)\)\s*$/gmu;

/**
 * The config a numbered section declares itself to be about.
 *
 * Deliberately *not* "any building link in the section": `docs/04` § 1 argues about Midtown Office
 * inside Garden Apartments' section, and a future section that links a sibling's config to make a
 * comparison must not thereby claim to document it.
 */
function declaredConfigOf(section: NumberedSection): readonly string[] {
  const declared: string[] = [];
  for (const hit of section.body.matchAll(CONFIG_LINE)) {
    const label = hit[1] as string;
    const target = resolve(DOCS_DIR, hit[2] as string);
    expect(
      dirname(target),
      `${TEST_BUILDINGS} § ${section.heading}: its Config line points outside data/buildings/`,
    ).toBe(BUILDINGS_DIR);
    expect(
      basename(target),
      `${TEST_BUILDINGS} § ${section.heading}: the Config line's label and its link disagree`,
    ).toBe(label);
    declared.push(basename(target));
  }
  return declared;
}

/** English number words, for the counts the two front-door sentences publish. */
const NUMBER_WORDS: readonly string[] = Object.freeze([
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
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
]);

const bothWays = (
  register: ReadonlySet<string>,
): { readonly absent: readonly string[]; readonly unknown: readonly string[] } => ({
  absent: SHIPPED_FILES.filter((file) => !register.has(file)),
  unknown: [...register].filter((file) => !SHIPPED_FILES.includes(file)).sort(),
});

describe('the shipped building set, derived from disk', () => {
  it('is found at all, and every config’s id is its file name', () => {
    // Non-vacuity. The original set was five and the tree has only ever grown; a walk returning
    // fewer than that is a broken walk, not a shrinking project, and every comparison below would
    // otherwise pass by having nothing to compare.
    expect(
      SHIPPED.length,
      'no building configs found — the walk is broken, not the registers',
    ).toBeGreaterThan(5);

    // Every check in this file matches on the file name. That is only a claim about the *building*
    // while the file name and the authored `id` agree, and nothing else in the tree asserts it in
    // this direction.
    const disagreeing = SHIPPED.filter((one) => one.id !== one.file.replace(/\.json$/u, ''));
    expect(
      disagreeing,
      'a config’s "id" is not its file name. The registers are matched on the file name, so a ' +
        'file whose id says otherwise makes every row in them ambiguous.',
    ).toEqual([]);
  });
});

describe('data/buildings/README.md § Status lists every shipped building (GitHub issue #376)', () => {
  it('has a row for each config on disk, and no row for a config that does not ship', () => {
    const status = sectionUnder(read(BUILDINGS_README), '## Status', BUILDINGS_README);
    const { absent, unknown } = bothWays(configsLinkedIn(status, BUILDINGS_DIR));

    expect(
      absent,
      'on disk in data/buildings/ and not in data/buildings/README.md § Status. This is the ' +
        'defect issue #376 records: burj-class-reference.json shipped in PR #402 and the table ' +
        'stopped at St Jude, exactly as it had stopped three buildings short once before. Add the ' +
        'row; do not weaken this test.',
    ).toEqual([]);

    expect(
      unknown,
      'named by data/buildings/README.md § Status and not on disk. A row for a deleted building ' +
        'is the same staleness pointing the other way, and it is the direction a one-way check ' +
        'never sees.',
    ).toEqual([]);
  });

  it('positive control: the extractor sees a deleted row and an invented one', () => {
    // The **real** § Status table, with one row deleted and one invented row added — a one-row
    // error in nine, which is the size the defect actually was. A control built from a synthetic
    // two-row table would pass while the shipped regex missed the shipped table.
    //
    // Compared against the *intact* extraction rather than against disk, on purpose: this case
    // controls the extractor, and the case above controls the register. Wiring it to disk would
    // make one real omission fail two tests and say nothing new in the second.
    const status = sectionUnder(read(BUILDINGS_README), '## Status', BUILDINGS_README);
    const intact = configsLinkedIn(status, BUILDINGS_DIR);
    expect(intact.size, 'the control needs a table it can damage').toBeGreaterThan(5);

    const victim = [...intact].sort()[intact.size - 1] as string;
    const damaged = status
      .split('\n')
      .filter((line) => !line.includes(`](${victim})`))
      .concat('| Ghost Tower | [`ghost-tower.json`](ghost-tower.json) | Complete |')
      .join('\n');
    const after = configsLinkedIn(damaged, BUILDINGS_DIR);

    expect([...intact].filter((file) => !after.has(file)), 'a deleted row goes unseen').toEqual([
      victim,
    ]);
    expect([...after].filter((file) => !intact.has(file)), 'an invented row goes unseen').toEqual([
      'ghost-tower.json',
    ]);
  });
});

describe('docs/04-test-buildings.md carries every shipped building (GitHub issue #376)', () => {
  it('has an overview-table row for each config on disk, and none for one that does not ship', () => {
    const table = overviewTableOf(read(TEST_BUILDINGS));
    const { absent, unknown } = bothWays(configsLinkedIn(table, DOCS_DIR));

    expect(
      absent,
      'on disk in data/buildings/ and missing from docs/04-test-buildings.md’s overview table. ' +
        'The table is the register a reader meets first; a building that is not in it is a ' +
        'building they will not know exists.',
    ).toEqual([]);
    expect(unknown, 'in docs/04-test-buildings.md’s overview table and not on disk').toEqual([]);
  });

  it('gives each config exactly one numbered section, and each section exactly one config', () => {
    const sections = numberedSectionsOf(read(TEST_BUILDINGS));
    expect(
      sections.length,
      'no numbered "## n. Title" sections found — the split is broken, not the document',
    ).toBeGreaterThan(5);

    const documented = new Map<string, string>();
    for (const section of sections) {
      const declared = declaredConfigOf(section);
      expect(
        declared,
        `docs/04-test-buildings.md § ${section.heading} declares no config, or declares more than ` +
          'one. Every numbered section owes exactly one "**Config:** [`x.json`](../data/' +
          'buildings/x.json)" line — that link, and not the heading, is what this guard matches ' +
          'on, so a renamed heading cannot silently satisfy it.',
      ).toHaveLength(1);
      const file = declared[0] as string;
      expect(
        documented.get(file),
        `docs/04-test-buildings.md documents ${file} twice`,
      ).toBeUndefined();
      documented.set(file, section.heading);
    }

    const { absent, unknown } = bothWays(new Set(documented.keys()));
    expect(
      absent,
      'on disk in data/buildings/ and with no section in docs/04-test-buildings.md. A building ' +
        'with a row and no section is a name with no rationale: every other section says what its ' +
        'building is designed to stress, and that is what a new one owes.',
    ).toEqual([]);
    expect(
      unknown,
      'documented by a section in docs/04-test-buildings.md and not on disk',
    ).toEqual([]);
  });

  it('numbers those sections 1..n with no gap and no repeat', () => {
    const ordinals = numberedSectionsOf(read(TEST_BUILDINGS)).map((section) => section.ordinal);
    expect(ordinals, 'the numbered sections have drifted out of sequence').toEqual(
      SHIPPED_FILES.map((_, index) => index + 1),
    );
  });
});

describe('the two sentences that publish the building count', () => {
  const expected = (): string => {
    const word = NUMBER_WORDS[SHIPPED_FILES.length];
    expect(word, 'more buildings ship than this file has number words for').toBeDefined();
    return word as string;
  };

  it('docs/04-test-buildings.md opens on the number of buildings that ship', () => {
    const opening = /^(\w+) reference buildings/mu.exec(read(TEST_BUILDINGS));
    expect(opening, 'docs/04-test-buildings.md no longer opens "N reference buildings"').not.toBeNull();
    expect(
      (opening?.[1] as string).toLowerCase(),
      'docs/04-test-buildings.md’s opening line counts a different set from the one on disk. It ' +
        'read "Eight" for the whole time nine shipped.',
    ).toBe(expected());
  });

  it('README.md’s documentation row counts the same set, and counts it once', () => {
    const row = read('README.md')
      .split('\n')
      .find((line) => line.includes(`](${TEST_BUILDINGS})`));
    expect(row, 'README.md no longer links docs/04-test-buildings.md').toBeDefined();
    const lower = (row as string).toLowerCase();
    expect(
      lower,
      'README.md’s row for docs/04-test-buildings.md publishes a stale building count',
    ).toContain(expected());
    // And no *other* number word, so a corrected count cannot be left sitting beside the old one.
    const strays = NUMBER_WORDS.filter(
      (word) => word !== expected() && new RegExp(`\\b${word}\\b`, 'u').test(lower),
    );
    expect(strays, 'README.md’s row carries two building counts at once').toEqual([]);
  });
});

describe('the precedent the next ten building issues will read', () => {
  // GitHub issues #424–#440 each add a building. Each one meets this rule in whichever of the two
  // documents they open first, so it is written in both — and asserted, because a precedent nobody
  // can find is the "checkable by looking" failure again, one level up.
  it.each([BUILDINGS_README, TEST_BUILDINGS])('%s names this guard', (document) => {
    expect(
      read(document),
      `${document} no longer says that a new building owes a row in both registers, or no longer ` +
        'names the test that enforces it. Deleting the sentence does not delete the obligation; ' +
        'it just means the next author meets it as a red suite instead of as a paragraph.',
    ).toContain('buildingRegisters.test.ts');
  });
});
