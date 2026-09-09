/**
 * **`docs/26-telemetry-and-privacy.md` § 20 — the KPI dashboard specification, derived rather than
 * remembered.**
 *
 * ## Why this file exists at all
 *
 * `docs/26` is the longest document in this repository and, until this file, **nothing in the tree
 * read a word of it**. (It had a line count here, and that was R38 committed two sentences before
 * citing R38: the figure was transcribed, the document grew, and no deriver existed. A number a
 * docstring cannot re-derive does not belong in one.) That is not a small omission for this document in particular: it is the one that governs
 * what may be collected about a person, and it carries four KPIs, ten events, seven retention
 * classes and three named readers, every one of them prose. [`RISKS.md`](../../../../RISKS.md) R38
 * is the row about a measurement published with no deriver, and `CLAUDE.md` records that lesson
 * five times over; a *posture* published with no deriver is the same shape with a worse subject.
 *
 * ## What GitHub issue #201 owed, and which half is here
 *
 * Two audits of #201 (2026-08-26 and 2026-09-05, both on the issue) agreed on the ledger: AC1, AC2
 * and AC4 met; **AC3 half-met** — `grep -i baseline` returned zero over the whole file — and
 * **AC5 unmet *and unregistered***, which was the finding that mattered. Every other gap in the
 * document was in § 11's open-items register; the dashboard was not, so a reader consulting the
 * register to learn what was left would not have learned that a criterion had been skipped.
 *
 * AC5 was blocked on a ruling rather than on work: § 8 forbade a read route, and a dashboard reads.
 * The product owner lifted that on 2026-09-09 (#250, quoted at § 12.1 ruling 2), § 18 became the
 * read route, and § 18.2 named the dashboard **R-1** — *a* reader, with a promise that its shape
 * would be specified. § 20 is that shape. This file is what stops it drifting from § 6.
 *
 * ## Both directions, on every set
 *
 * Each check derives one set from the section that **owns** the concept and one from § 20, then
 * requires equality. A fifth KPI added to § 6.2 that the dashboard never gained a panel for is red;
 * a panel for a KPI § 6 does not define is red. One direction alone lets the other drift silently,
 * which is precisely how the charter's own instrument table acquired four refuted rows in a day
 * (`documentation.test.ts`, the § 4 block).
 *
 * ## The guard on the guard
 *
 * Every parser here asserts it found what it expects before asserting anything about it. A renamed
 * heading, a reformatted table or a regex that quietly stops matching would otherwise leave this
 * file passing while checking nothing — [`RISKS.md`](../../../../RISKS.md) **R40**, the row about a
 * gate that cannot go red. `contentPlan.test.ts` and `citations.test.ts` both carry the same clause.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DOC = 'docs/26-telemetry-and-privacy.md';

const doc = (): string => readFileSync(join(ROOT, DOC), 'utf8');

/**
 * The text of one `##`/`###` section, heading included, up to the next heading at or above its own
 * level.
 *
 * Slicing by heading rather than by line number is deliberate: a line-numbered anchor is a citation
 * that goes stale on the next paragraph anyone inserts, which is the failure `docs/26` § 8 itself
 * records when a ruling named a refusal by the address `docs/26:765`.
 */
function section(heading: string): string {
  const source = doc();
  const start = source.indexOf(`\n${heading}`);
  expect(start, `${DOC} has no section headed "${heading}" — it was renamed or removed`).toBeGreaterThan(0);
  const level = heading.slice(0, heading.indexOf(' ')).length;
  /*
   * Search for the closing heading from the line *after* this one. Searching from `start + 1`
   * matches this section's own heading at offset zero and returns a single character — which is
   * how the first run of this file reported § 11 as missing a row it plainly carries. The parser
   * was wrong and the guard said so, which is the whole argument for guarding the guard.
   */
  const body = source.slice(start + 1);
  const rest = body.slice(body.indexOf('\n') + 1);
  const next = new RegExp(`^#{1,${level}} `, 'mu').exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/** Every `**bold**` cell opening a table row, which is how this document names a row's subject. */
function rowSubjects(text: string): readonly string[] {
  return [...text.matchAll(/^\| \*\*(.+?)\*\* \|/gmu)]
    .map((m) => m[1])
    .filter((subject): subject is string => subject !== undefined);
}

/**
 * Cell `index` of a split table row, asserted present rather than coalesced.
 *
 * This repository compiles with `noUncheckedIndexedAccess`, so an out-of-range column is
 * `string | undefined` at the type level. The tempting fix is `?? ''` and it is the wrong one: a
 * table that loses a column would then read as a blank cell and every check over it would pass on
 * an empty string. Failing here means the parser says the table's shape moved, which is the whole
 * of [`RISKS.md`](../../../../RISKS.md) R40 in one function.
 */
function cell(row: readonly string[], index: number, where: string): string {
  const value = row[index];
  if (value === undefined) {
    throw new Error(`${where}: no column ${index} — § 20.2's table shape moved under this parser`);
  }
  return value;
}

describe('docs/26 § 20 — the KPI dashboard is specified, and specified against § 6', () => {
  it('covers exactly the KPIs § 6.2 defines — both directions', () => {
    const defined = [...section('### 6.2 The four').matchAll(/\*\*`docs\/26 (K\d+)`/gu)].map((m) => m[1]);
    expect(defined, '§ 6.2 stopped naming its KPIs in the form this parser reads').toEqual([
      'K1',
      'K2',
      'K3',
      'K4',
    ]);

    const panels = section('### 20.2 The panels');
    const covered = [...panels.matchAll(/`docs\/26 (K\d+)`/gu)].map((m) => m[1]);

    expect(
      [...new Set(covered)].sort(),
      'every KPI in § 6.2 needs a panel in § 20.2 and every panel needs a KPI — #250 AC1',
    ).toEqual([...defined].sort());
  });

  it('covers exactly the diagnostics § 6.3 names — § 18.2 R-1 reads both', () => {
    const named = rowSubjects(section('### 6.3 The diagnostics, and what they are forbidden to be'));
    expect(named.length, '§ 6.3 stopped listing its diagnostics as bolded table rows').toBe(4);

    const panels = section('### 20.2 The panels');
    const missing = named.filter((name) => !panels.includes(name));
    expect(
      missing,
      '§ 18.2 says R-1 reads "§ 6’s four KPIs and § 6.3’s diagnostics" — these have no panel',
    ).toEqual([]);

    /*
     * And the other direction, which the first round of this file did not check. § 20.2 says in its
     * own words that "a ninth needs § 18.2 to move first", so a panel reading something § 6 does not
     * define is a reader quietly widening its own licence. Every panel row that is not a KPI row
     * must name one of § 6.3's four.
     */
    const diagnosticRows = [...panels.matchAll(/^\| \*\*P\d+\*\* \|([^|]*)\|/gmu)]
      .map((m) => m[1] ?? '')
      .filter((reads) => !/`docs\/26 K\d+`/u.test(reads));
    expect(diagnosticRows.length, '§ 20.2 has no non-KPI panel rows this parser can read').toBe(4);

    const unlicensed = diagnosticRows.filter((reads) => !named.some((name) => reads.includes(name)));
    expect(
      unlicensed,
      '§ 18.2 bounds R-1 to § 6.3’s diagnostics — these panels read something § 6.3 does not name',
    ).toEqual([]);
  });

  it('gives every KPI panel a target and a baseline, and a refused baseline says so by name', () => {
    const rows = [...section('### 20.2 The panels').matchAll(/^\|.*`docs\/26 K\d+`.*\|$/gmu)].map(
      (m) => m[0].split('|').map((cell) => cell.trim()),
    );
    expect(rows.length, '§ 20.2 has no KPI rows this parser can read').toBe(4);

    for (const cells of rows) {
      const panel = cell(cells, 1, 'a § 20.2 KPI row');
      const target = cell(cells, 3, panel);
      const baseline = cell(cells, 4, panel);
      expect(target, `${panel}: a panel with no target cannot fail, and a KPI that cannot fail is not a KPI`)
        .not.toBe('');
      /*
       * A baseline is a number or the word `unmeasured`, never blank — the `awtIsValid` idiom that
       * § 5.4 already applies to a small cell and `CLAUDE.md` applies to a suppressed mean: a figure
       * that is refused says so, in the product's own words, rather than disappearing.
       */
      /*
       * Anchored at the start of the cell, and that is the fix rather than a tidy-up. Testing for a
       * digit *anywhere* passed on `see § 20.4`, because the section reference supplies the digits —
       * a cell that publishes no figure and refuses none would have sailed through the check written
       * to catch exactly that.
       */
      expect(
        /^(?:`?unmeasured`?\b|[-+]?\d|\*\*[-+]?\d)/u.test(baseline),
        `${panel}: baseline "${baseline}" neither opens with a figure nor refuses by name (#201 AC3)`,
      ).toBe(true);
    }
  });

  it('declares no panel whose grain is a person — § 18.3 item 1', () => {
    const rows = [...section('### 20.2 The panels').matchAll(/^\| \*\*P\d+\*\*.*\|$/gmu)].map((m) =>
      m[0].split('|').map((cell) => cell.trim()),
    );
    expect(rows.length, '§ 20.2 has no panel rows this parser can read').toBeGreaterThanOrEqual(4);

    /*
     * **An allowlist, not a blacklist, and that is the round-3 change.** The first form of this
     * check rejected a grain matching `/player|session\b/`, which let `individual respondent`
     * through — a blacklist only refuses the phrasings somebody thought of. § 18.3 item 1 is a
     * statement about what the dashboard may be sliced by, so the honest mechanical form is the
     * set of axes that are allowed, and a new axis then costs a deliberate edit here. That is
     * correct rather than annoying: adding an axis to a privacy-bounded reader is a decision.
     */
    const ALLOWED_AXES = [
      'build',
      'UTC month',
      'UTC day',
      'first-seen UTC day',
      'screen key',
      'beat',
      'refusal ground',
    ];

    let crossAxisRefusals = 0;
    for (const cells of rows) {
      const panel = cell(cells, 1, 'a § 20.2 panel row');
      const grain = cell(cells, 6, panel);
      expect(grain, `${panel}: a panel with no declared grain`).not.toBe('');

      const axes = grain.split('×').map((axis) => axis.trim());
      const unlisted = axes.filter((axis) => !ALLOWED_AXES.includes(axis));
      expect(
        unlisted,
        `${panel}: grain "${grain}" is sliced by an axis this check does not allow. ` +
          'If the axis is legitimate, add it here deliberately; § 18.3 item 1 forbids a per-person one',
      ).toEqual([]);

      /*
       * And the grain must name every axis the row's own refusal applies to. Round 1 found P5
       * declaring `build × UTC month × screen key` while refusing on `beat × screen` — a grain
       * coarser than the cell the floor is measured on. Nothing guarded the repair, so deleting the
       * beat axis again left every case green.
       */
      const refusedWhen = cell(cells, 5, panel);
      const bare = (axis: string | undefined): string => (axis ?? '').replace(/^(?:any|the|each) /u, '');
      for (const m of refusedWhen.matchAll(/\b([a-z]+(?: [a-z]+)?) × ([a-z]+(?: [a-z]+)?) cell/gu)) {
        crossAxisRefusals += 1;
        for (const axis of [bare(m[1]), bare(m[2])]) {
          expect(
            axis !== '' && axes.some((declared) => declared.includes(axis)),
            `${panel}: refuses on "${axis}" but its declared grain "${grain}" does not carry that axis`,
          ).toBe(true);
        }
      }
    }

    /*
     * The guard on this guard, which round 3 found missing while the docstring claimed every parser
     * had one. The loop above is silent when its regex matches nothing, so rewording a refusal cell
     * from `any beat × screen cell` to `any beat/screen cell` disabled the check *and* let the axis
     * it protects be deleted, with all nine cases still green. At least one panel refuses on a
     * cross-axis cell; if none does, the phrasing moved and this is blind rather than satisfied.
     */
    expect(
      crossAxisRefusals,
      'no § 20.2 row refuses on an "X × Y cell" any more — the refusal-axis check is matching nothing',
    ).toBeGreaterThan(0);
  });

  it('declares the minimum aggregate cell size as a number with its unit, and § 5.4 agrees', () => {
    /*
     * The unit is part of what is asserted. A floor written as a bare `20` is ambiguous between
     * twenty people, twenty sessions and twenty events, and those are three different postures —
     * one person can produce twenty sessions. § 5.4's rule is about *people*, so the declaration
     * has to say people.
     */
    const floorIn = (text: string, where: string): number => {
      const found = /minimum cell size is (?:\*\*)?(\d+)(?:\*\*)? people/u.exec(text);
      expect(found, `${where} does not declare the minimum cell size as a count of people`).not.toBeNull();
      return Number(found?.[1]);
    };

    const declared = floorIn(section('### 20.3 The minimum cell size'), '§ 20.3');
    expect(declared, 'a floor of 1 is no floor').toBeGreaterThan(1);

  });

  it('stops registering the cell size as a debt now that § 20.3 pays it', () => {
    /*
     * The other direction, and the reason this case exists as its own. `CLAUDE.md` states the rule
     * on the honesty register: *a registered finding that has been fixed must stop being
     * registered, or the register becomes decoration.* § 11 and § 19 both carried the cell size as
     * owed. § 20.3 declares it, so both must stop — and this document's own idiom for a discharged
     * row is a strike-through with a note beside it (§ 0 fact 6, § 11's erasure route), never a
     * silent deletion.
     */
    const registered = section('## 11. What this document does not settle');
    const bullet = /^- .*minimum aggregate cell size.*$/mu.exec(registered);
    expect(bullet, '§ 11 no longer carries a minimum-aggregate-cell-size row at all — it was deleted rather than struck through')
      .not.toBeNull();
    expect(
      bullet?.[0],
      '§ 20.3 declares the cell size, so § 11 may not still register it as owed',
    ).toMatch(/~~/u);
  });

  it('names a cadence, and § 20.6 says something about the owner rather than merely being titled for one', () => {
    expect(section('### 20.5 The review'), '#250 asks for a monthly review; § 20.5 does not say monthly')
      .toMatch(/\bmonthly\b/iu);

    /*
     * **This case used to be unfailable, and the reason is worth keeping.** It asserted that
     * § 20.6 matched `/owner/` — and `section()` returned the caller's own heading, `### 20.6 The
     * owner`, glued to the body. The word was in the needle *and* in the haystack, so replacing the
     * whole section with `TBD.` left it green. It is the exact defect this file's docstring cites
     * R40 about, written by the file that cites it, and it survived a round of self-mutation
     * testing because the three mutations chosen all happened to be elsewhere.
     *
     * So the assertion is now about the two things § 20.6 has to *say*: what the role decides, and
     * that the holder is unnamed and owed. Both are absent from the heading.
     */
    const owner = section('### 20.6 The owner');
    expect(owner, '§ 20.6 must say access may not be delegated — it is the one decision that cannot move')
      .toMatch(/may not be delegated/iu);
    expect(owner, '§ 20.6 must say the name is owed before the first table is published')
      .toMatch(/not named here/iu);

    /*
     * And the other direction: § 11 must carry the unnamed holder as a debt. § 20.6 claiming to be
     * "registered in § 11" while § 11 says nothing is the shape of stale cross-reference this
     * document has recorded against itself more than once.
     */
    expect(
      section('## 11. What this document does not settle'),
      '§ 20.6 says the owner is registered in § 11, and § 11 does not carry the row',
    ).toMatch(/dashboard's owner is not named/iu);
  });

  it('lets § 20.3 be the only site that states the floor, and the rest point at it', () => {
    /*
     * **Four rounds of review found the same defect in four different fields, and this is the fix
     * for the class rather than the fourth instance.**
     *
     * § 5.4, § 11 and § 19 each summarised a decision § 20.3 owns. Round 2 found the grounds count
     * stale at two of them; round 3 found the figure stale at the same two; round 4 found the
     * differencing clause unpinned at one, and the assertion written to stop all this was itself
     * still enumerating sites one field down. A summary that restates goes stale — that is not a
     * defect of any particular summary, it is what restating *is*.
     *
     * So the referring sites stopped restating. § 20.3 states the figure once, and § 5.4, § 11 and
     * § 19 carry a pointer and no number of their own. There is then nothing at those sites for a
     * later edit to make false, and this case holds that shape rather than the facts it used to
     * chase. § 19 is why it matters: it is the checklist handed to a legal reviewer, who cannot
     * check a stale figure against the code.
     */
    const declarations = [...doc().matchAll(/minimum cell size is (?:\*\*)?(\d+)(?:\*\*)? people/gu)];
    expect(
      declarations.map((m) => m[1]),
      'the floor must be stated in exactly one place in docs/26, and § 20.3 is that place',
    ).toHaveLength(1);
    expect(section('### 20.3 The minimum cell size')).toMatch(/minimum cell size is (?:\*\*)?\d+/u);

    for (const [heading, site] of [
      ['### 5.4 What makes an aggregate safe to keep forever', '§ 5.4'],
      ['## 11. What this document does not settle', '§ 11'],
      ["## 19. The reviewer's checklist", '§ 19'],
    ] as const) {
      const text = section(heading);
      expect(text, `${site} no longer points at § 20.3 for the cell size`).toMatch(/§ 20\.3/u);
      expect(
        /\d+ people/u.exec(text)?.[0],
        `${site} restates a people-count. Point at § 20.3 instead — a summary that restates goes stale`,
      ).toBeUndefined();
      expect(
        /(?:zero|one|two|three|four|five|six|\d+) (?:stated )?grounds/u.exec(text)?.[0],
        `${site} restates how many grounds § 20.3 gives. Point at § 20.3 instead`,
      ).toBeUndefined();
    }
  });

  it('resolves every reference to one of § 20.3\u2019s grounds', () => {
    /*
     * **Restoring a guard this file deleted, and restoring it as the stronger thing.**
     *
     * Round 4 held § 20.3's grounds with a count-and-ordering assertion. Round 5 rewrote the case
     * around it for a different finding and dropped that assertion on the way past — so deleting
     * Ground 2 and Ground 3 passed, while four sites went on referring to them. Deleting an
     * assertion while fixing something else is its own defect class, and the honest repair is not
     * to put the count back: a count says *how many* exist and never says the one being cited is
     * among them.
     *
     * So what is checked is referential integrity. Every `ground N` anywhere in the document must
     * resolve to a ground § 20.3 declares, and the numbering must be contiguous from 1 so that a
     * deleted middle ground cannot hide behind a surviving higher one. § 20.2's P5 cites the
     * complement rule by name rather than by number, and that is checked too, because a dangling
     * reference inside the table this gate parses is the worst place for one.
     */
    const grounds = [...section('### 20.3 The minimum cell size').matchAll(/^\*\*Ground (\d+) —/gmu)]
      .map((m) => Number(m[1]));
    expect(grounds.length, '§ 20.3 declares no grounds in the form this parser reads').toBeGreaterThan(0);
    expect(grounds, '§ 20.3 numbers its grounds out of order, or one was deleted from the middle')
      .toEqual(grounds.map((_, index) => index + 1));

    const cited = [...doc().matchAll(/ground (\d+)/gu)].map((m) => Number(m[1]));
    expect(cited.length, 'nothing in docs/26 cites a numbered ground any more — this check is blind')
      .toBeGreaterThan(0);
    expect(
      [...new Set(cited)].filter((n) => !grounds.includes(n)),
      'docs/26 cites a ground § 20.3 does not declare — the ground was deleted or renumbered',
    ).toEqual([]);

    // P5 cites the complement rule by name, not by number.
    if (/complement rule/u.test(section('### 20.2 The panels'))) {
      expect(
        section('### 20.3 The minimum cell size'),
        '§ 20.2 sends a reader to § 20.3\u2019s complement rule and § 20.3 no longer has one',
      ).toMatch(/\*\*Ground \d+ — the complement/u);
    }
  });

  it('re-derives the interval § 20.3 publishes, rather than trusting the sentence', () => {
    /*
     * `CLAUDE.md`: *if you publish a number, pin it to the run that produced it.* § 20.3 argues that
     * the floor is not a precision bar by quoting the half-width of a share at the floor, and the
     * first round of this file published that figure with nothing re-deriving it — which is the
     * defect the whole document is about, committed in the section explaining why it matters.
     */
    const text = section('### 20.3 The minimum cell size');
    const floor = Number(/minimum cell size is (?:\*\*)?(\d+)(?:\*\*)? people/u.exec(text)?.[1]);
    const published = /95 % half-width of up to ±0\.(\d+)/u.exec(text);
    expect(published, '§ 20.3 no longer states the half-width in the form this parser reads').not.toBeNull();

    // Widest case: a share of 0.5, where the variance of a proportion is greatest.
    const halfWidth = 1.96 * Math.sqrt(0.25 / floor);
    expect(
      Number(`0.${published?.[1]}`),
      `§ 20.3's published half-width does not match 1.96·√(0.25/${floor}) = ${halfWidth.toFixed(4)}`,
    ).toBeCloseTo(halfWidth, 2);
  });
});
