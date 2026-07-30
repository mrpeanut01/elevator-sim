/**
 * **Layer B for the matrix's categorical result: no published front without a derivation.**
 *
 * `published.test.ts` is Layer B for **intervals**, and it scans only `benchmark/`. This file is
 * Layer B for the matrix's *categorical* output — the Pareto front — and it scans the documents,
 * because that is where the claim lives. `matrix.ts` § *The categorical publication pin* is Layer A
 * and the mechanism; this is the half that costs milliseconds and needs no simulation.
 *
 * ## Why the claim needed a guard of its own
 *
 * *"`nearest-car` is on the Pareto front at six of eight cells"* is stated as fact in more than
 * twenty places — `CLAUDE.md`, `DECISIONS.md` § D106, six `docs/` files and eight source files in
 * `viz/` — and it is not decoration. It is the **entire argument** for *energy is an axis, never a
 * score*: the weakest shipped dispatcher reaches the front by being best on energy and worst on
 * wait, so an aggregated eco grade would rank it first. `docs/10` § 5.5's R11 and the viewer's
 * refusal to draw a green energy gauge both rest on it.
 *
 * Before this file, that count was re-derived by **nothing**. `matrix.test.ts` asserts the front's
 * *structure* — three active axes, no candidate in two buckets, every exclusion named — and
 * deliberately does not assert which arm wins where, which is correct for a criterion and leaves the
 * published membership unguarded. `matrixFigures`'s own docstring said the front's *"assertions are
 * memberships in `matrix.test.ts`"*, and the memberships were not there.
 *
 * ## What is asserted, in both directions
 *
 * 1. **Every per-cell front row printed in a document** is the row {@link derivedFrontRows} renders,
 *    at the cell's own pinned `n`. Rows that disagree must be declared in
 *    {@link PUBLISHED_FRONT_DRIFT} with the commit that moved them — asserted exact, so a
 *    declaration cannot outlive the correction and a second drift cannot hide behind the first.
 * 2. **Every membership-count claim** — the phrase above, in any of the seven wordings this
 *    repository actually uses, digits or words — agrees with the count derived from the pin table.
 *    A count claim must be *found*, so a pattern that quietly stopped matching fails rather than
 *    passing by looking at nothing.
 * 3. **Every enumeration of the exceptions** names exactly the derived complement.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MATRIX_CELLS,
  PINNED_FRONTS,
  derivedFrontRows,
  frontMembershipCells,
} from './matrix.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The arm every published count claim is about. */
const CLAIMED_ARM = 'nearest-car';

/**
 * The vendored design prototype. Excluded because it is a third party's artefact with its own toy
 * simulator (`docs/12-design-handoff.md`: *its numbers are not the deliverable*), and because it is
 * HTML rather than prose this repository authored.
 */
const EXCLUDED_DIRS: readonly string[] = Object.freeze(['design', 'node_modules', 'dist']);

/** Every markdown file this repository authors, as `(path relative to root, source)`. */
function documents(): readonly (readonly [string, string])[] {
  const found: (readonly [string, string])[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(join(ROOT, dir === '' ? '.' : dir)).sort()) {
      if (EXCLUDED_DIRS.includes(name)) continue;
      const relative = dir === '' ? name : `${dir}/${name}`;
      if (statSync(join(ROOT, relative)).isDirectory()) {
        if (dir === '') continue; // only `docs/` is walked below the root
        walk(relative);
        continue;
      }
      if (!name.endsWith('.md')) continue;
      found.push([relative, readFileSync(join(ROOT, relative), 'utf8')] as const);
    }
  };
  walk('');
  walk('docs');
  return Object.freeze(found);
}

/** Every `.ts` source file in the workspace's packages — the count claim appears in eight of them. */
function packageSources(): readonly (readonly [string, string])[] {
  const found: (readonly [string, string])[] = [];
  const walk = (relative: string): void => {
    for (const name of readdirSync(join(ROOT, relative)).sort()) {
      if (EXCLUDED_DIRS.includes(name)) continue;
      const child = `${relative}/${name}`;
      if (statSync(join(ROOT, child)).isDirectory()) {
        walk(child);
        continue;
      }
      if (name.endsWith('.ts')) found.push([child, readFileSync(join(ROOT, child), 'utf8')] as const);
    }
  };
  for (const pkg of readdirSync(join(ROOT, 'packages')).sort()) {
    try {
      statSync(join(ROOT, 'packages', pkg, 'src'));
    } catch {
      continue;
    }
    walk(`packages/${pkg}/src`);
  }
  return Object.freeze(found);
}

/* -------------------------------------------------------------------------- *
 * The drift register
 * -------------------------------------------------------------------------- */

/** A published front row that the current tree does not produce, with the commit that moved it. */
interface PublishedFrontDrift {
  /** Path relative to the repository root. */
  readonly file: string;
  readonly cellId: string;
  /** The row exactly as the document prints it, normalized. */
  readonly published: string;
  /** What `derivedFrontRows()` renders instead. */
  readonly derived: string;
  /** The commit that moved the result, and how it is known to be that one. */
  readonly movedBy: string;
}

/**
 * **The stated gap: published front rows this tree does not reproduce.**
 *
 * The direct analogue of `published.ts`'s `UNPINNED_INTERVALS`, and asserted the same way — exact in
 * both directions, so the register can only shrink deliberately. An entry is a **defect that is
 * named**, never a tolerance: the document is wrong, the code is right, and the entry says which
 * commit made it so.
 *
 * **The register is empty, and it was emptied by its own assertion.** It shipped carrying one entry —
 * `docs/05-roadmap.md`'s `vertical-city-up-peak` front, three arms published against six derived,
 * moved by `7fac568` ("give `core` a non-elevator transport mode, and stop charging the lobby hop to
 * the lifts") four days earlier. That commit correctly regenerated the cell's interval pins;
 * `git show 7fac568 -- benchmark/published.ts` shows `vertical-city-up-peak/eta/awtS` going from mean
 * `+0.811` to `+1.066`, and the front moved with them, because a front is arm-against-arm through
 * `pareto.ts` while every one of the 352 pins is arm-against-baseline. Nothing was hidden: **there was
 * no mechanism.**
 *
 * The lane that found it did not own `docs/`, so it declared the drift instead of editing nothing and
 * saying nothing. The document was then corrected — and **this assertion is what forced the entry
 * out**, by name: *"PUBLISHED_FRONT_DRIFT declares "vertical-city-up-peak" stale, and it no longer is.
 * Delete the entry — the gap has closed."* That is the both-directions rule doing the work it exists
 * for, in the direction nobody designs for.
 *
 * An entry here is a **defect that is named**, never a tolerance: the document is wrong, the code is
 * right, and the entry says which commit made it so. An empty register is the correct steady state and
 * accepts nothing — the partition assertion below fails on a scanned row that is neither derivable nor
 * declared, so emptiness is not a licence.
 */
const PUBLISHED_FRONT_DRIFT: readonly PublishedFrontDrift[] = Object.freeze([]);

/* -------------------------------------------------------------------------- *
 * Scanning
 * -------------------------------------------------------------------------- */

const CELL_IDS: ReadonlySet<string> = new Set(MATRIX_CELLS.map((cell) => cell.id));

/** Emphasis and code fencing removed, so a row compares as the ids and commas it is. */
function normalizeRow(text: string): string {
  return text
    .replaceAll('*', '')
    .replaceAll('`', '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(', ');
}

/** One `| cell | n | front |` row found in a document. */
interface FrontRow {
  readonly file: string;
  readonly cellId: string;
  readonly replications: number;
  readonly members: string;
}

/**
 * Every three-column table row in every document whose first cell is a matrix cell id.
 *
 * Keyed on the cell-id domain rather than on a file name, so a second document that starts printing
 * the table is guarded from its first commit rather than from the commit somebody remembers.
 */
function scanFrontRows(): readonly FrontRow[] {
  const rows: FrontRow[] = [];
  for (const [file, source] of documents()) {
    for (const line of source.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;
      const fields = trimmed.slice(1, -1).split('|');
      if (fields.length !== 3) continue;
      const cellId = (fields[0] ?? '').replaceAll('`', '').trim();
      if (!CELL_IDS.has(cellId)) continue;
      const replications = Number((fields[1] ?? '').trim());
      if (!Number.isInteger(replications)) continue;
      rows.push({ file, cellId, replications, members: normalizeRow(fields[2] ?? '') });
    }
  }
  return Object.freeze(rows);
}

/** The number words this repository writes counts in. Digits are handled separately. */
const WORD_NUMBERS: Readonly<Record<string, number>> = Object.freeze({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
});

function asCount(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const bare = token.replaceAll('*', '').trim().toLowerCase();
  if (/^\d+$/u.test(bare)) return Number(bare);
  return WORD_NUMBERS[bare];
}

/**
 * A published front-membership claim: *"(Pareto) front at [exactly] N [of [the] M] cells"*.
 *
 * Deliberately loose about wording and emphasis, because seven wordings are in the tree and a
 * pattern that matched only the tidiest of them would make this suite pass by not looking — the
 * failure mode `published.test.ts` § *the scan* names for the same reason. A match whose first token
 * is not a number is discarded rather than failed: *"front at a real budget"* and *"front at
 * `midtown-up-peak`"* are both real sentences about something else.
 */
const COUNT_CLAIM =
  /front at (?:exactly )?(\*{0,2}(?:\d+|[a-z]+)\*{0,2})(?: of (?:the )?(\*{0,2}(?:\d+|[a-z]+)\*{0,2}))?/gu;

/** One scanned count claim, resolved to numbers. */
interface CountClaim {
  readonly file: string;
  readonly text: string;
  readonly count: number;
  readonly total: number | undefined;
}

function scanCountClaims(): readonly CountClaim[] {
  const claims: CountClaim[] = [];
  for (const [file, source] of [...documents(), ...packageSources()]) {
    // Line wrapping is not a semantic boundary in either prose or a docstring: half these claims
    // span two lines, and one spans a `*`-prefixed continuation.
    const flat = source.replaceAll(/[\s*>]*\n[\s*>]*/gu, ' ').replaceAll(/\s+/gu, ' ');
    for (const match of flat.matchAll(COUNT_CLAIM)) {
      const count = asCount(match[1]);
      if (count === undefined) continue;
      claims.push({ file, text: match[0], count, total: asCount(match[2]) });
    }
  }
  return Object.freeze(claims);
}

/** `all but \`x\` and \`y\`` / `the two cells it misses are \`x\` and \`y\``. */
const EXCEPTION_CLAIM = /(?:all but|cells it misses are) `([a-z0-9-]+)` and `([a-z0-9-]+)`/gu;

/* -------------------------------------------------------------------------- *
 * Suites
 * -------------------------------------------------------------------------- */

describe('every published per-cell Pareto front is the one the pin table derives', () => {
  it('partitions the scanned rows exactly into derivable and declared-drifted', () => {
    const derived = derivedFrontRows();
    const rows = scanFrontRows();
    // Coverage rather than a total: a second document that starts printing the table adds rows
    // legitimately, and a table that lost a row must still fail.
    expect(
      [...new Set(rows.map((row) => row.cellId))].sort(),
      'a matrix cell has no published front row, or the table stopped being parseable — either way ' +
        'this suite would otherwise pass by finding nothing to check',
    ).toEqual([...CELL_IDS].sort());

    const failures: string[] = [];
    const actualDrift = new Set<string>();
    const declared = new Map(
      PUBLISHED_FRONT_DRIFT.map((entry) => [`${entry.file}\u0000${entry.cellId}`, entry]),
    );

    for (const row of rows) {
      const key = `${row.file}\u0000${row.cellId}`;
      const expected = derived.get(row.cellId);
      const pin = PINNED_FRONTS[row.cellId];
      if (pin !== undefined && row.replications !== pin.replications) {
        failures.push(
          `${row.file}: "${row.cellId}" is published at n=${String(row.replications)}, the matrix ` +
            `spends n=${String(pin.replications)}. A front read against the wrong budget is review ` +
            'finding #4 in categorical clothing.',
        );
      }
      if (row.members === expected) continue;
      actualDrift.add(key);
      const entry = declared.get(key);
      if (entry === undefined) {
        failures.push(
          `${row.file}: "${row.cellId}" publishes the front [${row.members}], and this tree ` +
            `produces [${String(expected)}]. Establish WHICH is right. If the code is right the ` +
            'document is stale and belongs in PUBLISHED_FRONT_DRIFT with the commit that moved it; ' +
            'if the document is right, something moved the front and PINNED_FRONTS is the wrong ' +
            'table to reach for first.',
        );
      } else if (entry.published !== row.members || entry.derived !== expected) {
        failures.push(
          `${row.file}: PUBLISHED_FRONT_DRIFT declares "${row.cellId}" as [${entry.published}] ` +
            `versus [${entry.derived}], and the pair is now [${row.members}] versus ` +
            `[${String(expected)}]. A drift entry that no longer describes the drift is worse than ` +
            'no entry, because it reads as accounted for.',
        );
      }
    }
    for (const [key, entry] of declared) {
      if (!actualDrift.has(key)) {
        failures.push(
          `${entry.file}: PUBLISHED_FRONT_DRIFT declares "${entry.cellId}" stale, and it no longer ` +
            'is. Delete the entry — the gap has closed.',
        );
      }
    }

    expect(failures.join('\n'), failures.join('\n')).toBe('');
    console.log(
      `published front rows: ${String(rows.length - actualDrift.size)} of ${String(rows.length)} ` +
        `re-derived from PINNED_FRONTS, ${String(actualDrift.size)} declared drifted.`,
    );
  });

  it('gives every drift entry a commit to go and read', () => {
    for (const entry of PUBLISHED_FRONT_DRIFT) {
      expect(CELL_IDS.has(entry.cellId), `drift names an unknown cell "${entry.cellId}"`).toBe(true);
      expect(
        entry.movedBy.length,
        `"${entry.cellId}" is declared drifted with no account of what moved it`,
      ).toBeGreaterThan(120);
      expect(entry.published).not.toBe(entry.derived);
    }
  });
});

describe('every published front-membership count is the one the pin table derives', () => {
  it('agrees with the derived count everywhere it is claimed, and is claimed somewhere', () => {
    const on = frontMembershipCells(CLAIMED_ARM);
    const total = MATRIX_CELLS.length;
    const claims = scanCountClaims();
    const withTotal = claims.filter((claim) => claim.total !== undefined);

    // Both directions, the second of which is the one that matters: a regex that stopped matching
    // would otherwise pass this suite by finding nothing to disagree with.
    expect(
      withTotal.length,
      'no document or source file states a front-membership count at all. Either the claim was ' +
        'deleted everywhere — in which case delete this guard and say so — or COUNT_CLAIM stopped ' +
        'matching the wording, which is this suite passing by not looking.',
    ).toBeGreaterThan(4);

    const failures: string[] = [];
    for (const claim of claims) {
      if (claim.total !== undefined && claim.total !== total) {
        failures.push(
          `${claim.file}: "${claim.text}" is out of ${String(claim.total)} cells; MATRIX_CELLS has ` +
            `${String(total)}.`,
        );
        continue;
      }
      if (claim.count !== on.length) {
        failures.push(
          `${claim.file}: "${claim.text}" — \`${CLAIMED_ARM}\` is on the front at ` +
            `${String(on.length)} of ${String(total)} cells on this tree (${on.join(', ')}). ` +
            'This is the claim DECISIONS.md § D106 rests *energy is an axis, never a score* on, so ' +
            'a disagreement is either a stale sentence or a moved result, and the two are answered ' +
            'differently.',
        );
      }
    }
    expect(failures.join('\n'), failures.join('\n')).toBe('');
    console.log(
      `${CLAIMED_ARM} front membership: ${String(on.length)} of ${String(total)} cells ` +
        `(${on.join(', ')}); ${String(claims.length)} count claim(s) scanned, ` +
        `${String(withTotal.length)} with a denominator.`,
    );
  });

  it('names exactly the derived exceptions wherever it enumerates them', () => {
    const on = new Set(frontMembershipCells(CLAIMED_ARM));
    const missing = MATRIX_CELLS.map((cell) => cell.id).filter((id) => !on.has(id));
    const failures: string[] = [];
    let found = 0;
    for (const [file, source] of documents()) {
      const flat = source.replaceAll(/[\s*>]*\n[\s*>]*/gu, ' ').replaceAll(/\s+/gu, ' ');
      for (const match of flat.matchAll(EXCEPTION_CLAIM)) {
        const named = [match[1] ?? '', match[2] ?? ''];
        if (!named.every((id) => CELL_IDS.has(id))) continue;
        found += 1;
        if ([...named].sort().join(', ') !== [...missing].sort().join(', ')) {
          failures.push(
            `${file}: "${match[0]}" — the cells \`${CLAIMED_ARM}\` actually misses are ` +
              `${missing.join(' and ')}.`,
          );
        }
      }
    }
    expect(failures.join('\n'), failures.join('\n')).toBe('');
    expect(
      found,
      'no document enumerates the cells the claimed arm misses. If the enumeration was reworded, ' +
        'widen EXCEPTION_CLAIM rather than deleting this check.',
    ).toBeGreaterThan(0);
    // The exceptions are not an accident of ranking: at both of them the arm is UNQUOTABLE, which
    // is a different statement from "it lost". A cell that started missing the front by *losing*
    // would be a result rather than a saturation, and the count claim's mechanism sentence — "best
    // on energy and worst on wait" — would no longer be the whole story.
    for (const cellId of missing) {
      expect(
        PINNED_FRONTS[cellId]?.unquotable.includes(CLAIMED_ARM),
        `"${cellId}" keeps \`${CLAIMED_ARM}\` off the front without its AWT being invalid there`,
      ).toBe(true);
    }
  });
});
