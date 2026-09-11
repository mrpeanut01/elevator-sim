/**
 * **The Endless rush standings are runs this build measured** — GitHub issue #418's acceptance,
 * held against the tree rather than against a docstring, and the owner's 2026-09-10 ruling on it.
 *
 * > *"Replace the five placeholder standings with pinned runs of shipped dispatchers on the shared
 * > rush seed, labelled as house entries, and drop the two handles."*
 *
 * Four clauses, one case each, and every case here reads something a docstring cannot vouch for:
 * the files on disk, the register as exported, and the rush model's own export list. They are kept
 * apart from `rushHouse.test.ts`, which tests the module that builds the rows, because these four
 * are about what the **tree** says — so they fail on the base commit on an assertion rather than on
 * a missing import, and a reader can see which clause was false.
 *
 * ## Why the handles are searched for rather than asserted absent from one array
 *
 * The two handles lived in `RUSH_BESTS`, and they also lived in a browser-tier assertion, a test
 * docstring and the rush model's own history sections. Deleting the array and leaving the rest is the
 * stale-refusal half of this defect one layer out: a test still expecting `…_vt` on the page, or a
 * docstring still explaining why a handle is safe to draw, keeps the name in the product's mouth. So
 * this walks every source directory and every living document.
 *
 * **Two places keep them, and they are named rather than skipped by pattern.** `DECISIONS.md`
 * § D377 quotes one handle as the figure the corpus had never read, and a decision entry is not
 * rewritten after the fact (`CLAUDE.md`, *Conventions*). `docs/design/` is the vendored handoff
 * prototype both handles were transcribed from, and the handoff is vendored as received. Neither is
 * drawn to a player. Both are asserted to *still contain* a handle, which is the positive control:
 * a matcher that found nothing anywhere would pass the absence case over a tree full of them.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { RUSH_ABSENCES, RUSH_STREAM } from './rushScreenModel.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Spelled in halves, so this file is not itself an occurrence. */
const HANDLES: readonly string[] = Object.freeze(['delft' + '_vt', 'r_' + 'okonkwo']);

/** The two records that keep a handle, and why — see the file docstring. */
const KEPT: readonly string[] = Object.freeze(['DECISIONS.md', 'docs/design/']);

/** Directories a walk never enters: installs, build output, and any checkout parked inside one. */
const NEVER = new Set(['node_modules', 'dist', '.git', '.claude', 'coverage']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (NEVER.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(?:ts|mjs|json|md|html|ya?ml)$/u.test(name)) out.push(path);
  }
  return out;
}

/** Every file a handle could hide in: each package's sources, `data/`, `docs/`, and root documents. */
function searchedFiles(): readonly string[] {
  const packages = readdirSync(join(ROOT, 'packages'))
    .map((name) => join(ROOT, 'packages', name, 'src'))
    .filter((dir) => existsSync(dir));
  const roots = readdirSync(ROOT)
    .filter((name) => name.endsWith('.md'))
    .map((name) => join(ROOT, name));
  return [
    ...packages.flatMap((dir) => walk(dir)),
    ...walk(join(ROOT, 'data')),
    ...walk(join(ROOT, 'docs')),
    ...walk(join(ROOT, '.github')),
    ...roots,
  ].map((path) => relative(ROOT, path).split('\\').join('/'));
}

function holdsAHandle(file: string): boolean {
  const text = readFileSync(join(ROOT, file), 'utf8');
  return HANDLES.some((handle) => text.includes(handle));
}

describe('the rush standings are runs this build measured — GitHub issue #418', () => {
  it('prints neither invented handle anywhere but the two records that must keep them', () => {
    const files = searchedFiles();
    /* Non-vacuity: the walk reached the tree, not an empty directory. */
    expect(files.length).toBeGreaterThan(1000);
    const offenders = files
      .filter((file) => !KEPT.some((kept) => file === kept || file.startsWith(kept)))
      .filter(holdsAHandle);
    expect(
      offenders,
      'a handle that reads as a player account is still in the tree. The owner ruled both dropped ' +
        '(2026-09-10); the standings are the house’s runs, and a handle left in a test or a ' +
        'docstring keeps the name in the product’s mouth.',
    ).toEqual([]);
    /* The positive control: the matcher does find a handle where one is known to be. */
    expect(files.filter(holdsAHandle).length).toBeGreaterThan(0);
    for (const kept of KEPT) {
      expect(
        files.filter((file) => file === kept || file.startsWith(kept)).some(holdsAHandle),
        `${kept} is exempt because it keeps a handle; if it no longer does, the exemption has lapsed`,
      ).toBe(true);
    }
  });

  it('empties the register on the commit that makes its standings entry false', () => {
    /*
     * The issue's third clause. The entry read *"the standings — the five entries on the rush setup
     * screen are the handoff’s own fixtures, not runs this build measured"*, and leaving it once the
     * rows are measured would be the stale-refusal half of the defect.
     */
    expect(RUSH_ABSENCES.filter((entry) => /standings/u.test(entry))).toEqual([]);
  });

  it('takes the fixture rows and their fixture label out of the rush model together', () => {
    /*
     * The issue's second clause — *the fixture label goes on the commit that makes it false*. Read
     * off the model's export list, not its prose: the prose keeps a history of the fixtures and
     * should, and a pattern over it would trip on the sentence recording the change.
     */
    const model = readFileSync(join(HERE, 'rushScreenModel.ts'), 'utf8');
    const exported = [...model.matchAll(/^export const (\w+)/gmu)].map((match) => match[1]);
    expect(exported).not.toContain('RUSH_BESTS');
    expect(exported).not.toContain('RUSH_BESTS_FIXTURE_NOTE');
  });

  it('pins every row to a measured run on the rush’s one seed, with the command that replays it', () => {
    /* The issue's first clause — *with their seeds, so any of them replays*. */
    const path = join(ROOT, 'data', 'rush-house-runs.json');
    expect(existsSync(path), 'data/rush-house-runs.json does not exist').toBe(true);
    const table = JSON.parse(readFileSync(path, 'utf8')) as {
      readonly provenance: { readonly kind: string; readonly seed: string; readonly command: string };
      readonly runs: readonly unknown[];
    };
    expect(table.provenance.kind).toBe('measured');
    expect(table.provenance.seed).toBe(String(RUSH_STREAM.seed));
    expect(table.provenance.command).toContain('ELEVATOR_SIM_RUSH_HOUSE=deep');
    expect(table.provenance.command).toContain('src/everyday/rushHouseSweep.test.ts');
    expect(existsSync(join(HERE, 'rushHouseSweep.test.ts'))).toBe(true);
    expect(table.runs.length).toBeGreaterThan(0);
  });
});
