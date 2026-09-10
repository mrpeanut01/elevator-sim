/**
 * `UX.md` § 7.0's ledger, and the two documents that summarise it — GitHub issue #417.
 *
 * `docs/05-roadmap.md` § Phase 4 and `docs/07-handoff.md` each restate the ledger's buckets in a
 * sentence, and **both had been wrong for two waves**. The table said `91` rows with 6
 * driven-*and*-asserted and 14 asserted; both sentences said `88`, 4 and 13. `T44` added `ED-17a`
 * and `T48` added `ED-24` and `ED-25` to the table, and neither wave re-derived the prose. Nothing
 * noticed, because nothing had ever compared them.
 *
 * That is `RISKS.md` R38 — a figure that is correct where it is measured and stale where it is
 * quoted — on a third pair of documents, and the fix is the one
 * `experiments/validation/documentation.test.ts` already applies to the phase-status tables:
 * **derive the summary from the table, in both directions, rather than trusting a transcription.**
 *
 * ## Why this lives in `packages/viz` rather than beside that file
 *
 * It reads `packages/viz/UX.md`, and `boundaries.test.ts`'s invariant-6 check forbids `core` and
 * `experiments` sources from naming `packages/viz` at all. That check is right and this test was
 * written in the wrong package first: a documentation gate in `experiments` that cannot run with
 * `viz` absent is a dependency however little code it imports. The document is this package's, so
 * the guard is too.
 *
 * The parse is deliberately strict. A bucket whose count is not an integer, or a sentence whose
 * figures cannot be found, fails loudly and by name: a check that silently matched nothing would
 * be the same defect wearing a green tick.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** From `packages/viz/src/` up to the repository root. */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

interface Ledger {
  readonly total: number;
  readonly wave1: number;
  readonly driven: number;
  readonly drivenAndAsserted: number;
  readonly asserted: number;
  readonly unverified: number;
  readonly notBuilt: number;
}

/** The count in the ledger row whose first cell contains `label`. */
function rowCount(table: string, label: string): number {
  const row = table
    .split('\n')
    .find((line) => line.startsWith('|') && line.split('|')[1]?.includes(label) === true);
  expect(row, `UX.md § 7.0 has no ledger row containing "${label}"`).toBeDefined();
  const raw = (row ?? '').split('|')[2]?.trim() ?? '';
  expect(/^\d+$/u.test(raw), `UX.md § 7.0's "${label}" row has count "${raw}"`).toBe(true);
  return Number(raw);
}

function ledger(): Ledger {
  const ux = read('packages/viz/UX.md');
  const start = ux.indexOf('### 7.0 Ledger');
  expect(start, 'UX.md § 7.0 no longer starts where this test reads for it').toBeGreaterThan(0);
  const table = ux.slice(start, ux.indexOf('\n\n', ux.indexOf('| 🔲 **not built**', start)));
  const parts = {
    wave1: rowCount(table, '✅ **wave 1**'),
    driven: rowCount(table, '✅ **run** — driven'),
    drivenAndAsserted: rowCount(table, '✅ **run** + ✅ **test**'),
    asserted: rowCount(table, '✅ **test** — asserted'),
    split: rowCount(table, 'one clause each way'),
    unverified: rowCount(table, '⚠️ **unverified**'),
    reMarked: rowCount(table, '🔲 **re-marked**'),
    notBuilt: rowCount(table, '🔲 **not built**'),
  };
  return {
    total: Object.values(parts).reduce((sum, count) => sum + count, 0),
    wave1: parts.wave1,
    driven: parts.driven,
    drivenAndAsserted: parts.drivenAndAsserted,
    asserted: parts.asserted,
    unverified: parts.unverified,
    notBuilt: parts.notBuilt,
  };
}

describe('UX.md § 7.0 — the ledger and the two sentences that summarise it', () => {
  it('adds up to the row count its own heading claims', () => {
    const heading = /### 7\.0 Ledger — where the (\d+) rows stand/u.exec(read('packages/viz/UX.md'));
    expect(heading, 'UX.md § 7.0’s heading no longer names a row count').not.toBeNull();
    expect(
      Number(heading?.[1]),
      'UX.md § 7.0’s heading and its own buckets disagree about how many rows there are',
    ).toBe(ledger().total);
  });

  it('agrees with docs/05-roadmap.md § Phase 4’s summary sentence', () => {
    const counts = ledger();
    const roadmap = read('docs/05-roadmap.md');
    const sentence =
      /`packages\/viz\/UX\.md` § 7\.0 carries \*\*(\d+)\*\* scenarios with differentiated states, not a blanket tick:\s*\*\*(\d+) ✅\*\* \((\d+) wave 1, (\d+) driven in a browser against the shipped `data\/`, (\d+) driven \*and\* asserted,\s*(\d+) asserted by a test whose assertion was proved to bite\)/u.exec(
        roadmap,
      );
    expect(
      sentence,
      'docs/05 § Phase 4’s UX-ledger sentence is not where this test reads it',
    ).not.toBeNull();
    const [, total, green, wave1, driven, both, asserted] = sentence ?? [];
    expect(Number(total), 'docs/05 names a different scenario count from UX.md’s table').toBe(
      counts.total,
    );
    expect(Number(wave1)).toBe(counts.wave1);
    expect(Number(driven)).toBe(counts.driven);
    expect(Number(both)).toBe(counts.drivenAndAsserted);
    expect(Number(asserted)).toBe(counts.asserted);
    expect(Number(green), 'docs/05’s ✅ total is not the sum of the four buckets it lists').toBe(
      counts.wave1 + counts.driven + counts.drivenAndAsserted + counts.asserted,
    );
    // And the two zeroes it publishes are the table's, not a hopeful transcription.
    expect(roadmap).toContain('**0 ⚠️ unverified**');
    expect(counts.unverified).toBe(0);
    expect(roadmap).toContain('**0 🔲 not built**');
    expect(counts.notBuilt).toBe(0);
  });

  it('agrees with docs/07-handoff.md’s summary sentence', () => {
    const counts = ledger();
    const sentence =
      /a \*\*(\d+)-scenario UX\s*ledger\*\*[^—]*— \*\*(\d+) ✅\*\*\s*\((\d+) wave 1, (\d+) driven, (\d+) driven \*and\* asserted, (\d+) asserted by a test proved to bite\)/u.exec(
        read('docs/07-handoff.md'),
      );
    expect(sentence, 'docs/07’s UX-ledger sentence is not where this test reads it').not.toBeNull();
    const [, total, green, wave1, driven, both, asserted] = sentence ?? [];
    expect(Number(total), 'docs/07 names a different scenario count from UX.md’s table').toBe(
      counts.total,
    );
    expect(Number(wave1)).toBe(counts.wave1);
    expect(Number(driven)).toBe(counts.driven);
    expect(Number(both)).toBe(counts.drivenAndAsserted);
    expect(Number(asserted)).toBe(counts.asserted);
    expect(Number(green)).toBe(
      counts.wave1 + counts.driven + counts.drivenAndAsserted + counts.asserted,
    );
  });

  it('says the same thing in both documents, which is the failure that started this', () => {
    /*
     * The two sentences were transcribed independently and drifted **together** rather than apart —
     * both said 88 while the table said 91 — so agreeing with each other is not enough on its own.
     * It is asserted anyway, because a wave that fixes one and not the other is the *next* shape of
     * this defect, and the two checks above would each name only half of it.
     */
    const roadmap = /\*\*(\d+)\*\* scenarios with differentiated states/u.exec(
      read('docs/05-roadmap.md'),
    );
    const handoff = /a \*\*(\d+)-scenario UX/u.exec(read('docs/07-handoff.md'));
    expect(roadmap?.[1], 'docs/05 stopped naming a scenario count').toBeDefined();
    expect(handoff?.[1], 'docs/07 stopped naming a scenario count').toBeDefined();
    expect(roadmap?.[1]).toBe(handoff?.[1]);
  });
});
