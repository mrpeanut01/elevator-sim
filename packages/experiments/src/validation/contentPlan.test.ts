/**
 * **`docs/37-content-plan.md`'s current counts, re-derived from the tree.**
 *
 * ## Why this file exists rather than a paragraph asking people to be careful
 *
 * The content plan compares a *target* against what ships. A target is a goal and is legitimately
 * prose; **the thing it is compared against is a measurement**, and a measurement published in prose
 * with no deriver is [`RISKS.md`](../../../../RISKS.md) **R38** — the row this repository has now
 * recorded the same lesson on five times. The plan's own opening finding is an instance: GitHub
 * issue #199 states *five contracts* and the tree holds **eight**, because three contracts landed
 * after the design handoff was written and the issue was never re-measured.
 *
 * So every number in § 1's table is derived here, and the check fails in **both** directions: a
 * count that moves in `data/` without the document moving is red, and a document edited away from
 * the tree is red. That is what separates a gate from a note.
 *
 * ## What is derived, and from where
 *
 * Six of the seven are `data/`. The seventh, the contract list, is a frozen constant in
 * `packages/viz/src/shift/contracts.ts` — `@elevator-sim/experiments` depends on `core` alone and
 * may not import `viz`, so it is read as **text** and counted two independent ways (`id: 'cN'` and
 * `buildingId:`) which are required to agree. Two ways rather than one because a single regex over
 * source is exactly the kind of deriver that quietly stops matching and turns the gate into
 * decoration; if the file is refactored so the two disagree, this says so instead of guessing.
 *
 * ## The guard on the guard
 *
 * Both table parsers assert they found every key they expect. A regex that stops matching, a table
 * reformatted out from under it, or a renamed heading would otherwise make this file pass by
 * asserting nothing — `phaseStatus.test.ts` and `citations.test.ts` both carry the same clause for
 * the same reason, and [`RISKS.md`](../../../../RISKS.md) **R40** is the row about a gate that
 * cannot go red.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const PLAN = 'docs/37-content-plan.md';

const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

const readJson = (...parts: string[]): Record<string, unknown> =>
  JSON.parse(read(...parts)) as Record<string, unknown>;

const lengthOf = (value: unknown, what: string): number => {
  if (!Array.isArray(value)) throw new Error(`${what} is not an array in the shipped data`);
  return value.length;
};

/* -------------------------------------------------------------------------- *
 * The counts, derived
 * -------------------------------------------------------------------------- */

/** Contracts, counted two ways over the module that holds the frozen list. */
function contractCount(): number {
  const source = read('packages', 'viz', 'src', 'shift', 'contracts.ts');
  const byId = [...source.matchAll(/\n\s+id: 'c\d+',/g)].length;
  const byBuilding = [...source.matchAll(/\n\s+buildingId: '/g)].length;
  expect(
    byBuilding,
    `shift/contracts.ts counts ${String(byId)} contracts by their ids and ${String(byBuilding)} by ` +
      'their buildingId fields. One of the two derivations has stopped matching the file, so ' +
      'neither may be published — fix the deriver rather than picking the number that looks right.',
  ).toBe(byId);
  return byId;
}

const derived = (): ReadonlyMap<string, number> => {
  const campaign = readJson('data', 'campaign.json');
  const fixit = readJson('data', 'fixit-cases.json');
  const proof = readJson('data', 'proof-cases.json');
  const dispatchers = readJson('data', 'dispatcher-profiles.json');
  const traffic = readJson('data', 'traffic-profiles.json');

  return new Map([
    [
      'buildings',
      readdirSync(join(ROOT, 'data', 'buildings')).filter((name) => name.endsWith('.json')).length,
    ],
    ['campaign-stages', lengthOf(campaign['stages'], 'data/campaign.json stages')],
    ['contracts', contractCount()],
    ['fix-cases', lengthOf(fixit['cases'], 'data/fixit-cases.json cases')],
    [
      'proof-cases',
      lengthOf(proof['towers'], 'data/proof-cases.json towers') *
        lengthOf(proof['crowds'], 'data/proof-cases.json crowds'),
    ],
    ['dispatchers', lengthOf(dispatchers['profiles'], 'data/dispatcher-profiles.json profiles')],
    [
      'demand-templates',
      lengthOf(traffic['demandTemplates'], 'data/traffic-profiles.json demandTemplates'),
    ],
  ]);
};

/** Simulated seconds a mode ships, for § 3's inventory. */
const simulatedSeconds = (): ReadonlyMap<string, number> => {
  const campaign = readJson('data', 'campaign.json');
  const fixit = readJson('data', 'fixit-cases.json');
  const proof = readJson('data', 'proof-cases.json');

  const stages = campaign['stages'] as readonly { readonly durationS: number }[];
  const cases = fixit['cases'] as readonly { readonly run: { readonly durationS: number } }[];
  const towers = proof['towers'] as readonly unknown[];
  const crowds = proof['crowds'] as readonly { readonly durationS: number }[];

  const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

  return new Map([
    ['Campaign', sum(stages.map((stage) => stage.durationS))],
    ['Fix a building', sum(cases.map((entry) => entry.run.durationS))],
    ['The gauntlet', towers.length * sum(crowds.map((crowd) => crowd.durationS))],
  ]);
};

/* -------------------------------------------------------------------------- *
 * Reading the document's tables
 * -------------------------------------------------------------------------- */

/** `**8**`, `8`, `36 000` and `1,710` all read as numbers; anything else is `null`. */
function figure(cell: string): number | null {
  const bare = cell.replaceAll('*', '').replaceAll(',', '').replace(/\s+/g, '').trim();
  return /^\d+$/.test(bare) ? Number(bare) : null;
}

/** A markdown table row's cells, or `null` for anything that is not one. */
function cellsOf(line: string): readonly string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.every((cell) => /^-+$/.test(cell.trim())) ? null : cells.map((cell) => cell.trim());
}

const KEY = /^`([a-z-]+)`$/;

/**
 * The two keyed tables, told apart by their width: § 1's inventory is four columns and § 4.2's
 * targets are six. Both carry the key in column two, which is what makes them machine-readable at
 * all — a table keyed only by a prose label is a table that a rename silently unhooks.
 */
function keyedRows(text: string, width: number): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const line of text.split('\n')) {
    const cells = cellsOf(line);
    if (cells === null || cells.length !== width) continue;
    const key = KEY.exec(cells[1] ?? '');
    if (key !== null) found.set(key[1] as string, cells);
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * The cases
 * -------------------------------------------------------------------------- */

describe('docs/37-content-plan.md § 1 — what ships today', () => {
  const plan = read(PLAN);
  const counts = derived();

  it('states the shipped count of every content type, and states the measured one', () => {
    const rows = keyedRows(plan, 4);
    expect(
      [...rows.keys()].sort(),
      `${PLAN} § 1's inventory table did not parse into the seven keyed rows this check reads. ` +
        'Either a key was renamed, or the table changed shape — in both cases the gate stopped ' +
        'gating and must be repaired rather than deleted (RISKS.md R40).',
    ).toEqual([...counts.keys()].sort());

    const wrong: string[] = [];
    for (const [key, expected] of counts) {
      const stated = figure(rows.get(key)?.[2] ?? '');
      if (stated !== expected) {
        wrong.push(
          `${key}: the plan states ${String(stated)}, the tree holds ${String(expected)}`,
        );
      }
    }
    expect(
      wrong.join('\n'),
      `${PLAN} § 1 publishes a count the tree does not hold. A target may be prose; the current ` +
        'count it is compared against may not be (RISKS.md R38).\n' + wrong.join('\n'),
    ).toBe('');
  });
});

describe('docs/37-content-plan.md § 4.2 — the targets', () => {
  const plan = read(PLAN);
  const counts = derived();

  it('compares each target against the measured count, not against a remembered one', () => {
    const rows = keyedRows(plan, 6);
    expect(
      [...rows.keys()].sort(),
      `${PLAN} § 4.2's target table did not parse into the seven keyed rows this check reads.`,
    ).toEqual([...counts.keys()].sort());

    const wrong: string[] = [];
    for (const [key, expected] of counts) {
      const cells = rows.get(key) ?? [];
      const today = figure(cells[2] ?? '');
      const target = figure(cells[3] ?? '');
      if (today !== expected) {
        wrong.push(`${key}: § 4.2's "today" says ${String(today)}, the tree holds ${String(expected)}`);
      }
      if (target === null) {
        wrong.push(`${key}: § 4.2's target did not parse as a number`);
      } else if (today !== null && target < today) {
        wrong.push(
          `${key}: the target ${String(target)} is below today's ${String(today)}, which would ` +
            'make the plan ask for content to be removed',
        );
      }
    }
    expect(wrong.join('\n'), wrong.join('\n')).toBe('');
  });
});

describe('docs/37-content-plan.md § 3 — the simulated-seconds inventory', () => {
  const plan = read(PLAN);

  it('states the simulated seconds each mode ships, summed from the shipped data', () => {
    const rows = new Map<string, readonly string[]>();
    for (const line of plan.split('\n')) {
      const cells = cellsOf(line);
      if (cells !== null && cells.length === 5) rows.set(cells[0] ?? '', cells);
    }

    const expected = simulatedSeconds();
    const wrong: string[] = [];
    for (const [label, seconds] of expected) {
      const row = rows.get(label);
      if (row === undefined) {
        wrong.push(`${label}: § 3 has no row for this mode, so nothing was checked`);
        continue;
      }
      const stated = figure(row[1] ?? '');
      if (stated !== seconds) {
        wrong.push(`${label}: § 3 states ${String(stated)} simulated seconds, the data sums to ${String(seconds)}`);
      }
    }
    expect(
      wrong.join('\n'),
      `${PLAN} § 3's inventory disagrees with the shipped data it is summed from. Adding a case, ` +
        'a stage or a crowd shape moves these figures, and the play-hours in § 3 and § 4 are ' +
        'derived from them.\n' + wrong.join('\n'),
    ).toBe('');
  });
});
