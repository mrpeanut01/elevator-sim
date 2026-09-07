/**
 * **`GAPS.md` § 3 has a staleness guard, over the subset a test can check** — GitHub issue #325,
 * `RISKS.md` R44.
 *
 * `GAPS.md` is the register issues are filed from, and three of its rows were contradicted by the
 * code the same tree shipped while none was struck through. One of them manufactured a P1 backlog
 * item (#178's energy-axis item) against a defect that had been fixed eleven minutes before the
 * issue was filed. The six player-facing absence registers have `everyday/buildNotes.test.ts`,
 * which fails in both directions; this file is the same shape pointed at § 3.
 *
 * ## What it can and cannot check, said before the lists
 *
 * § 3 is a two-column prose table. A guard over free prose is not available, so this file takes
 * the issue's second option: **every open row is classified**, and the classification is asserted
 * in both directions. A row with a mechanical oracle has one, and the oracle must hold while the
 * row is open. A row whose claim is a judgement is named in {@link UNGUARDED} with the reason no
 * oracle exists, the way `buildNotes.test.ts` names the bound it cannot check. A row that another
 * test already reads is named in {@link GUARDED_ELSEWHERE} with that test. And a struck row may
 * carry a {@link CLOSED_ORACLES} entry asserting that its closure still holds, because a closure
 * that quietly reopens is R44 in the other direction.
 *
 * Both directions means: an open row missing from every list is red, a list entry naming a row
 * that has been struck is red (the entry must move to the closed list or go), a key matching no
 * row or two rows is red, and an oracle that stops holding is red. What this does **not** check is
 * whether an unguarded row's prose is still true; that is the remainder, and it is named rather
 * than implied.
 *
 * ## Mutation-tested, on the row a human sweep walked past
 *
 * The first run of this file was its own mutation test. R44 records that `GAPS.md`'s tuning-seeds
 * row (*"the campaign judges on tuning seeds only, and nothing in the shipped surface says so"*)
 * was refuted four ways by 2026-09-05 and annotated by nobody, which made it the fixture #325 asked
 * for. The row's oracle was written as the row's own claim, a shipped brief that does not name the
 * holdout, and it failed on the first run: `campaign/brief.ts` names the holdout set and its seed.
 * The row was then struck with the refutation attached and its entry moved to the closed list,
 * where the oracle now asserts the opposite. A second mutation was run by hand: un-striking the
 * `showEnergyAxis` row (restoring it to the text that was true on 2026-08-05) makes it an open row
 * in no list, which is red under the both-directions rule.
 *
 * ## Why this lives in `viz` rather than beside the other document guards
 *
 * Most of the oracles read `viz` modules or their source, and `boundaries.test.ts` forbids an
 * `experiments` source from naming this package. A guard that had to reach the code by an indirect
 * path would be one more thing to keep honest.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { unauthorableBlocksOf } from './dev/dispatcherEditor.js';
import { STANDARD_SPACE } from './honesty/generate.js';
import { RESOURCES } from './scope/probes.test-helper.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = fileURLToPath(new URL('./', import.meta.url));

function sourceOf(relativeToSrc: string): string {
  return readFileSync(join(SRC, relativeToSrc), 'utf8');
}

interface GapRow {
  /** The first cell, markup included, so a key can match a struck title. */
  readonly title: string;
  readonly state: string;
  /** Struck through: the row's own author has closed it. */
  readonly struck: boolean;
}

/** The § 3 table, rows only, read off the file rather than transcribed. */
function sectionThreeRows(): readonly GapRow[] {
  const text = readFileSync(join(REPO, 'GAPS.md'), 'utf8');
  const start = text.indexOf('## 3. Gaps that can produce a wrong screen');
  const end = text.indexOf('## 4. Real debt', start);
  if (start < 0 || end < 0) throw new Error('GAPS.md § 3 or § 4 heading not found; the guard needs both');
  return text
    .slice(start, end)
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Gap') && !line.startsWith('|---'))
    .map((line) => {
      const cells = line.split(' | ');
      const title = (cells[0] ?? '').replace(/^\|\s*/u, '');
      const state = cells.slice(1).join(' | ').replace(/\s*\|\s*$/u, '');
      /*
       * Struck means the title itself is struck through, or carries the register's own CLOSED
       * marker. A title that strikes one clause and leaves another standing (the energy-axis row
       * struck its first half on 2026-08-05 and stayed open) is open, which a bare `includes('~~')`
       * got wrong on this file's first mutation run.
       */
      const struck = /^\*{0,2}~~/u.test(title) || /\bCLOSED\b/u.test(title);
      return { title, state, struck };
    });
}

interface Oracle {
  /** A substring of the row's title cell. Must match exactly one row. */
  readonly key: string;
  /** The claim the oracle checks, in the row's own words. */
  readonly claim: string;
  readonly holds: () => boolean;
}

interface Named {
  readonly key: string;
  readonly reason: string;
}

/** Open rows whose claim a test can check. The oracle asserts the claim **still holds**. */
const OPEN_ORACLES: readonly Oracle[] = [
  {
    key: 'The always-on honesty tier reaches no batch at 50+ replications',
    claim: 'the always-on space never draws a stage, and a stage is 50 replications',
    holds: () => STANDARD_SPACE.stageProbability === 0,
  },
  {
    key: '`selection.*` has no control in the dispatcher editor',
    claim:
      'a profile carrying `selection` is reported unauthorable, and `dev/state.ts#drivingProfileOf` ' +
      'still rebuilds the field through `profileWithSelector`',
    holds: () => {
      // No shipped profile carries `selection` (measured: none of the thirteen), so one is given it.
      const base = RESOURCES.dispatcherProfiles.profiles[0] as DispatcherProfile;
      const withSelection: DispatcherProfile = { ...base, selection: { ...(base.selection ?? {}), policy: 'rules' } };
      const refused = unauthorableBlocksOf(withSelection);
      return refused.length === 1 && refused[0] === 'selection' && sourceOf('dev/state.ts').includes('profileWithSelector(');
    },
  },
];

/** Struck rows whose closure a test can check. The oracle asserts the closure **still holds**. */
const CLOSED_ORACLES: readonly Oracle[] = [
  {
    key: '`settings.showEnergyAxis` and `settings.theme` reach nothing',
    claim: "the player's switch reaches the day report: `dev/main.ts` passes it and `shift/report.ts` reads it",
    holds: () =>
      sourceOf('dev/main.ts').includes('showEnergyAxis: menuState.settings.showEnergyAxis') &&
      sourceOf('shift/report.ts').includes('readonly showEnergyAxis?: boolean'),
  },
  {
    key: "A dispatcher card's words are derived, and the better ones are authored where nothing may read them",
    claim: 'every shipped profile carries a blurb and the card draws it only beside the shipped vector',
    holds: () =>
      sourceOf('dev/rightRail.ts').includes('export function authoredBlurbOf(') &&
      sourceOf('../../../data/dispatcher-profiles.json').split('"blurb":').length >= 14,
  },
  {
    key: 'The structural-refusal reason is prose keyed on an id the leg record does not carry',
    claim: 'core joins the reason to the undelivered leg and viz carries it on the leg record',
    holds: () =>
      sourceOf('../../core/src/sim/simulation.ts').includes('#structuralRefusalFor(') &&
      sourceOf('contract/types.ts').includes('readonly structuralRefusal?: string | undefined;'),
  },
  {
    key: 'A live weight editor makes overfitting the tuning seeds the dominant strategy',
    claim: 'the shipped brief names the holdout set and its seed, and the judge gates on the holdout',
    holds: () =>
      sourceOf('campaign/brief.ts').includes('The holdout set') &&
      sourceOf('campaign/judge.ts').includes('holdoutSeeds'),
  },
];

/** Open rows another test already reads. Named so the remainder below is the whole remainder. */
const GUARDED_ELSEWHERE: readonly Named[] = [
  {
    key: 'statically swept DOM entry points are not driven',
    reason:
      "`honesty/derive.test.ts` derives the count from `NOT_PLAYER_FACING` and asserts this row's " +
      'figure against it, in both tiers of the figure (total, and mounts against screen rows).',
  },
];

/**
 * Open rows with no oracle, each with the reason. **This is the unguarded remainder**, stated
 * rather than implied. A row here is re-read by hand before an issue quotes it, which is R44's
 * interim mitigation and is still the rule for exactly these rows.
 */
const UNGUARDED: readonly Named[] = [
  {
    key: 'Two surfaces are called Campaign, and a third is called Scenarios',
    reason: 'A naming judgement about a surface the handoff drew; the handoff settles it, not a test.',
  },
  {
    key: 'A restored week that is dropped is announced in the coach ribbon',
    reason:
      'Closed in substance and open in placement; where a line is drawn is markup, and asserting a ' +
      'DOM slot from here would be a browser case, not a register guard.',
  },
  {
    key: 'Thirteen warning rows on one building is a wall',
    reason: 'A deliberate position rather than an absence; there is nothing for an oracle to find built.',
  },
  {
    key: "Basic's curated three-dimension subset is not built",
    reason: 'The subset has no name in code; the row records that the editable set is data instead.',
  },
  {
    key: 'The access block\'s six mount-private copy sentences in `dev/buildingEditor.ts` are static-only',
    reason:
      "A DOM mount's inline copy, which is `derive.test.ts`'s stated static-sweep limitation; the " +
      'row is the residue of that limitation and closes when the sentences are exported.',
  },
];

describe('GAPS.md § 3 is classified in both directions — GitHub issue #325, R44', () => {
  const rows = sectionThreeRows();
  const everyKey = [...OPEN_ORACLES, ...CLOSED_ORACLES, ...GUARDED_ELSEWHERE, ...UNGUARDED].map(
    (entry) => entry.key,
  );
  const rowsFor = (key: string): readonly GapRow[] => rows.filter((row) => row.title.includes(key));

  it('reads a table, not an empty section', () => {
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((row) => row.struck).length).toBeGreaterThan(0);
    expect(rows.filter((row) => !row.struck).length).toBeGreaterThan(0);
  });

  it('matches every key to exactly one row, so an entry cannot outlive or straddle its row', () => {
    const wrong = everyKey
      .map((key) => ({ key, n: rowsFor(key).length }))
      .filter(({ n }) => n !== 1)
      .map(({ key, n }) => `${key} → ${String(n)} rows`);
    expect(wrong, 'a key must match one § 3 row; zero means the row went, two means the key is too short').toEqual([]);
  });

  it('classifies every open row: an oracle, another test, or a named reason for neither', () => {
    const openKeys = new Set([...OPEN_ORACLES, ...GUARDED_ELSEWHERE, ...UNGUARDED].map((entry) => entry.key));
    const unclassified = rows
      .filter((row) => !row.struck)
      .filter((row) => ![...openKeys].some((key) => row.title.includes(key)))
      .map((row) => row.title.slice(0, 90));
    expect(
      unclassified,
      'an open GAPS.md § 3 row is in no list. Add an oracle, name the test that reads it, or name the ' +
        'reason no oracle exists — an unclassified row is exactly the row that goes stale unread.',
    ).toEqual([]);
  });

  it('keeps no open-row entry for a struck row, so closing a row moves its entry rather than orphaning it', () => {
    const stale = [...OPEN_ORACLES, ...GUARDED_ELSEWHERE, ...UNGUARDED]
      .filter((entry) => rowsFor(entry.key).some((row) => row.struck))
      .map((entry) => entry.key);
    expect(stale, 'the row was struck; move the entry to CLOSED_ORACLES or delete it').toEqual([]);
  });

  it('keeps no closed-row oracle for an open row', () => {
    const wrong = CLOSED_ORACLES.filter((entry) => rowsFor(entry.key).some((row) => !row.struck)).map(
      (entry) => entry.key,
    );
    expect(wrong, 'a CLOSED oracle names a row that is not struck; either strike it or move the oracle').toEqual([]);
  });

  it.each(OPEN_ORACLES.map((oracle) => [oracle.key, oracle] as const))(
    'open row still true: %s',
    (_key, oracle) => {
      expect(oracle.holds(), `the row claims: ${oracle.claim}. The tree says otherwise; strike the row.`).toBe(true);
    },
  );

  it.each(CLOSED_ORACLES.map((oracle) => [oracle.key, oracle] as const))(
    'closed row still closed: %s',
    (_key, oracle) => {
      expect(oracle.holds(), `the closure was: ${oracle.claim}. It no longer holds; the row has reopened.`).toBe(true);
    },
  );

  it('names the unguarded remainder with a reason each', () => {
    for (const entry of UNGUARDED) expect(entry.reason.length).toBeGreaterThan(40);
    for (const entry of GUARDED_ELSEWHERE) expect(entry.reason).toMatch(/\.test\.ts/u);
  });
});
