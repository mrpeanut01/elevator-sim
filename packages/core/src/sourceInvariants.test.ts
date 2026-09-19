/**
 * **Invariants 2 and 3, scanned over every non-test source file in `packages/core/src`.**
 *
 * `CLAUDE.md` states them as properties of the whole package:
 *
 * - **2. No global RNG.** Every random draw comes from a named stream on the injected `StreamSet`.
 *   A single shared RNG desynchronizes common random numbers and destroys comparison power.
 * - **3. No wall-clock time in `core/`.** All time comes from the kernel. No `Date.now()`, no
 *   `performance.now()`, no timers.
 *
 * Until this file landed, the mechanical half of that claim was **six files wide**.
 * `kernel/kernel.test.ts`'s `kernel source invariants` block scans the kernel's own four sources
 * and two tests and says so plainly; three other suites scan a hand-written module list each —
 * `dispatch/predictor/causality.test.ts` over the predictor's files,
 * `dispatch/policies/policies.test.ts` over `sim/simulation.ts`, and
 * `model/car/estimateCost.test.ts` over `estimateCost.ts` and `separation.ts`. Every one of those is
 * a good test. Together they leave most of the package unscanned, and **nothing said so** — a
 * reader meeting any of them would reasonably conclude the invariant was enforced.
 *
 * It was not enforced. It was *held*, by discipline: a by-hand scan of all 106 non-test sources at
 * the time this file was written found **zero** occurrences of any pattern below. That is the best
 * possible moment to mechanise a rule, and the only one at which it is free — a scan written the
 * day after the first violation has to argue about the violation instead.
 *
 * ## What this file does that the four above do not
 *
 * **Its scope is derived from disk rather than transcribed.** A file added to `core/src` tomorrow
 * is scanned by this test without anybody remembering to add it, which is the whole of the point:
 * every one of the four existing scanners names its files, and a named list is a list that goes
 * stale the moment somebody writes a file. That failure is not hypothetical here — the
 * neighbouring dead-code audit's module list omitted `core/src/dispatch`, 137 exports of the
 * dispatch core, for its entire life, and nothing could report it because a hand-written list
 * cannot say what is missing from it (§ D836).
 *
 * The four existing scanners stay exactly where they are. They check more than this one does —
 * the kernel's also covers its *test* files, the ambient environment and the module's import
 * list; `estimateCost.test.ts`'s also asserts that the module imports no `random/` path at all,
 * which is a stronger claim than "does not say `Math.random`" and is the right claim for the one
 * function invariant 1 turns on. This file is the floor under all of them, not a replacement for
 * any.
 *
 * ## Why it scans non-test files only
 *
 * The invariants are properties of what the package *does*, and a test is not part of that. The
 * distinction is measured rather than assumed: four test files match the patterns below, and all
 * four matches are the other scanners' own regex literals — `causality.test.ts` and
 * `estimateCost.test.ts` naming `Date.now` and `setTimeout` in the patterns they forbid. A
 * regex literal is a literal, but stripping regex literals safely is harder than stripping quoted
 * ones (`/` is also division), and a stripper that is too eager hides a real violation. So the
 * scanned set is the enforceable one, and the stripper is the conservative one: comments and
 * quoted literals only, exactly as `kernel/kernel.test.ts` does it.
 *
 * ## Why it cannot pass by not looking
 *
 * Three ways, because a scanner that silently matched nothing would be green forever: a witness
 * file per directory asserted against the tree in **both** directions, a floor under the file
 * count, and a positive control that the patterns really do fire on source text that violates
 * them. `deadCode.test.ts`'s `the scanner cannot silently stop looking` block is the local
 * precedent and this is the same idea applied to a text scan.
 *
 * `node:fs` rather than Vite's `?raw`: the raw loader takes one named import per file, which is
 * the transcribed list this file exists to avoid. `dispatch/deadCode.test.ts` already reads the
 * tree from disk inside this package for the same reason.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** This package's `src` directory — the whole of the scanned tree. */
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

const isTest = (path: string): boolean =>
  path.endsWith('.test.ts') || path.endsWith('.test-helper.ts');

/** Every `.ts` file under `core/src`, derived from the tree. `.d.ts` is a declaration, not code. */
function everyTypeScriptFile(): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(path);
    }
  };
  visit(SRC_DIR);
  return out.sort();
}

/** Relative to `core/src`, with forward slashes, which is how every assertion below names a file. */
const shortName = (path: string): string => relative(SRC_DIR, path).replace(/\\/g, '/');

const ALL_FILES = everyTypeScriptFile();
const SCANNED = ALL_FILES.filter((path) => !isTest(path));

/**
 * One file that must be found in each directory holding source, and nothing else may hold source.
 *
 * The both-directions guard, on `packages/viz/src/deadCode.test.ts`'s pattern: the keys are
 * checked against the directories the walk actually reached, so a walk that quietly stopped
 * descending fails here rather than passing everything below. Hand-written on purpose — it is the
 * *floor*, and the scope is derived. A new directory is scanned the moment it exists; it only has
 * to be named here as well, which is a one-line diff that makes the addition visible.
 *
 * `physics/` holds no source of its own, only `doors/` and `motion/`, so it is absent by
 * measurement rather than by omission — the assertion below re-derives that.
 */
const WITNESS_BY_DIRECTORY: Readonly<Record<string, string>> = Object.freeze({
  '.': 'index.ts',
  analytical: 'upPeak.ts',
  config: 'parse.ts',
  dispatch: 'selector.ts',
  'dispatch/policies': 'auction.ts',
  'dispatch/predictor': 'arrivalModel.ts',
  'dispatch/terms': 'waitTime.ts',
  kernel: 'kernel.ts',
  metrics: 'summarize.ts',
  model: 'bank.ts',
  'model/car': 'estimateCost.ts',
  'physics/doors': 'doorMachine.ts',
  'physics/motion': 'sCurve.ts',
  random: 'streams.ts',
  sim: 'simulation.ts',
  traffic: 'generator.ts',
});

/**
 * The four **sources** `kernel/kernel.test.ts` scans — it also reads two of its own test files,
 * which are outside this file's scope for the reason given at the top. This file's coverage may
 * widen and may never narrow, and this is the list that says so.
 */
const KERNEL_SOURCES_SCANNED_BEFORE = [
  'kernel/eventQueue.ts',
  'kernel/index.ts',
  'kernel/kernel.ts',
  'kernel/types.ts',
] as const;

/* -------------------------------------------------------------------------- *
 * The scan
 * -------------------------------------------------------------------------- */

/** Strip comments, so documentation *about* a forbidden API does not trip the scan. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Strip quoted and template literals, so a message or an id naming one does not trip it either. */
const stripLiterals = (source: string): string =>
  source
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

const scannable = (source: string): string => stripLiterals(stripComments(source));

/**
 * Invariant 2 — a random draw that does not come from a named stream.
 *
 * Written as `/\bNAME\b/` with every label a string literal, so the table cannot match its own
 * definition once {@link scannable} has run over this file. `crypto` is included although nothing
 * has ever reached for it here: a global RNG behind a different global is the same defect, and a
 * scanner that only knows the one name that has already been used is a scanner for the past.
 */
const GLOBAL_RNG: ReadonlyArray<readonly [string, RegExp]> = [
  ['Math.random()', /\bMath\s*\.\s*random\b/],
  ['crypto.getRandomValues()', /\bgetRandomValues\b/],
  ['crypto.randomUUID()', /\brandomUUID\b/],
];

/** Invariant 3 — a clock, or a timer, neither of which the kernel is. */
const WALL_CLOCK: ReadonlyArray<readonly [string, RegExp]> = [
  ['Date.now()', /\bDate\s*\.\s*now\b/],
  ['the Date constructor', /\bDate\s*\(/],
  ['new Date()', /\bnew\s+Date\b/],
  ['performance.now()', /\bperformance\s*\.\s*now\b/],
  ['process.hrtime()', /\bprocess\s*\.\s*hrtime\b/],
  ['process.uptime()', /\bprocess\s*\.\s*uptime\b/],
  ['setTimeout', /\bsetTimeout\b/],
  ['setInterval', /\bsetInterval\b/],
  ['setImmediate', /\bsetImmediate\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\b/],
  ['queueMicrotask', /\bqueueMicrotask\b/],
  ['process.nextTick', /\bnextTick\b/],
];

/** Every match of `patterns` in `path`'s code, as sentences a reader can act on. */
function hits(
  path: string,
  patterns: ReadonlyArray<readonly [string, RegExp]>,
): readonly string[] {
  const code = scannable(readFileSync(path, 'utf8'));
  return patterns
    .filter(([, pattern]) => pattern.test(code))
    .map(([label]) => `${shortName(path)} uses ${label}`);
}

describe('packages/core holds invariants 2 and 3 in every source file it has', () => {
  it('scans the tree it claims to scan, and the tree is read from disk', () => {
    // A vacuous scan passes everything. The floor is well under today's 106 so that deleting a
    // module does not fail this test spuriously, and well over the six files the kernel's own
    // block reaches, so a walk that collapsed to one directory is red.
    expect(SCANNED.length).toBeGreaterThan(80);
    expect(ALL_FILES.length).toBeGreaterThan(SCANNED.length); // the tests exist and are excluded

    // Each file really is this package's source, not an empty read or a stale copy.
    for (const path of SCANNED) {
      expect(readFileSync(path, 'utf8').length, `${shortName(path)} is empty`).toBeGreaterThan(10);
    }

    // Coverage may widen and may never narrow: everything the kernel's own scanner reads is here.
    for (const name of KERNEL_SOURCES_SCANNED_BEFORE) {
      expect(SCANNED.map(shortName), 'the kernel scan is a subset of this one').toContain(name);
    }
  });

  it('reaches every directory that holds source — checked in both directions', () => {
    // Direction 1: every named witness was found, so the walk descended everywhere it should.
    const found = new Set(SCANNED.map(shortName));
    for (const [directory, witness] of Object.entries(WITNESS_BY_DIRECTORY)) {
      const name = directory === '.' ? witness : `${directory}/${witness}`;
      expect(found, `${name} is the witness for ${directory} and the walk did not reach it`).toContain(
        name,
      );
    }

    // Direction 2: every directory the walk reached is named, so a new one cannot arrive unnoticed.
    const directories = [
      ...new Set(
        SCANNED.map(shortName).map((name) =>
          name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '.',
        ),
      ),
    ].sort();
    expect(
      directories,
      'a directory of core/src holds source and is not named in WITNESS_BY_DIRECTORY — add it ' +
        '(the scan already covers it; this list is what makes that visible)',
    ).toEqual(Object.keys(WITNESS_BY_DIRECTORY).sort());
  });

  it('draws no random number outside a named stream (invariant 2)', () => {
    const violations = SCANNED.flatMap((path) => hits(path, GLOBAL_RNG));
    expect(
      violations,
      'CLAUDE.md invariant 2: every random draw comes from a named stream on the injected ' +
        'StreamSet. A shared global RNG desynchronizes common random numbers between two ' +
        'configurations that differ in nothing else, which silently destroys every paired ' +
        'comparison this project publishes. If a stream is what you want, inject one',
    ).toEqual([]);
  });

  it('reads no wall clock and starts no timer (invariant 3)', () => {
    const violations = SCANNED.flatMap((path) => hits(path, WALL_CLOCK));
    expect(
      violations,
      'CLAUDE.md invariant 3: all time in core/ comes from the kernel. A wall clock makes a run ' +
        'depend on the machine it ran on, so the same seed stops replaying (invariant 5) and a ' +
        'slow box becomes a different simulation',
    ).toEqual([]);
  });
});

/**
 * The controls. A text scan is the easiest kind of test to leave green by accident — a stripper
 * that ate too much, a walk that found nothing, a pattern that never fires — and each of those
 * failures looks exactly like a clean tree from the outside.
 */
describe('the scan cannot pass by not looking', () => {
  const both = [...GLOBAL_RNG, ...WALL_CLOCK];

  const firesOn = (source: string): readonly string[] => {
    const code = scannable(source);
    return both.filter(([, pattern]) => pattern.test(code)).map(([label]) => label);
  };

  it('fires on real code that violates either invariant', () => {
    // Positive control: this is what a violation looks like, and the scan must see it.
    expect(firesOn('const t = Date.now();')).toContain('Date.now()');
    expect(firesOn('const r = Math.random();')).toContain('Math.random()');
    expect(firesOn('setTimeout(() => step(), 0);')).toContain('setTimeout');
    expect(firesOn('const at = performance.now();')).toContain('performance.now()');
  });

  it('does not fire on a comment or a string that merely names one', () => {
    // Negative control, and the reason the stripper exists: `CLAUDE.md` invariant 3 is quoted
    // verbatim in several docstrings in this package, and an error message may legitimately tell a
    // caller that a clock is forbidden.
    expect(firesOn('// never call Date.now() here\nconst t = kernel.now;')).toEqual([]);
    expect(firesOn('/* Math.random() is forbidden */ const r = rng.next();')).toEqual([]);
    expect(firesOn("throw new Error('setTimeout is not available in core');")).toEqual([]);
    expect(firesOn('const note = `performance.now() would be wall-clock time`;')).toEqual([]);
  });

  it('is not fooled by a violation that follows a stripped comment on the same line', () => {
    // The stripper walks line by line for `//`; a violation after a block comment on one line
    // must survive it, or a single well-placed comment would hide anything.
    expect(firesOn('/* fine */ const t = Date.now();')).toContain('Date.now()');
  });
});
