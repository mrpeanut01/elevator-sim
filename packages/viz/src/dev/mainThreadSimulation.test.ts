/**
 * **Which modules simulate on the thread that paints** — derived from the module graph, and
 * asserted in both directions. GitHub issue #410's first acceptance clause is that the surfaces are
 * *named*, and this file exists because the last time they were named the list went stale.
 *
 * ## The list this replaces was wrong in every entry
 *
 * Issue #238 wrote *"three surfaces still simulate on the main thread"* and #410 inherited the
 * phrase and the three: `dev/main.ts`'s § 1.4 re-simulate, `frame/overlay.ts` and
 * `live/observations.ts`. Checked against the tree rather than transcribed:
 *
 * - the re-simulate has been a worker round trip since the UI readiness audit's B3 — `interveneAt`
 *   calls `runShift`, which is `dev/shiftRunner.ts` over `dev/shiftWorker.ts`;
 * - `frame/overlay.ts#overlayAt` and `live/observations.ts#observationsAt` **never simulate**. They
 *   are per-frame folds of a finished recording. Their cost claims were real and unmeasured, and
 *   they are measured and bounded now — `frame/perFrameBudget.test.ts` — but they were never this.
 *
 * The count was right by accident and the membership was wrong three times out of three. What the
 * graph finds instead is below, and this file is the derivation rather than a better sentence:
 * a prose list goes stale the moment a caller moves, and this one had gone stale in both directions
 * at once — naming surfaces that had been fixed and missing surfaces nobody had looked at.
 *
 * ## How the derivation works, and what it is allowed to miss
 *
 * `record/recordRun.ts` is *"the only place in the package that constructs a `Simulation`"* —
 * `dev/offThreadRuns.ts` states it and `batch/runBatch.ts` is its one other route in. So the
 * question *does this module simulate* is *does it call one of those two*, and the question *is it
 * on the painting thread* is *is it reachable from the page's entry without crossing a worker*.
 *
 * The entry is read out of `index.html` rather than written here, so moving it moves this test. The
 * worker entries are read off disk by name, so a third worker joins the exclusion by existing. Both
 * are the habit this repository has about lists: derive it, or a new member escapes by not being on
 * one.
 *
 * **Two things it deliberately cannot see, and they are limits rather than oversights.**
 *
 * 1. *Granularity is the module, not the function.* A module is named if any line in it calls the
 *    simulator, so a surface whose call sits in a module that also does other things is attributed
 *    to that module. {@link MAIN_THREAD_SIMULATION} carries the call site in prose for exactly
 *    that reason, and that half is not mechanised.
 * 2. *Type-only edges are not runtime edges.* An `import type` is erased, so it is skipped — which
 *    matters here rather than being pedantic: `scenario/measure.ts` calls `runBatch` and reaches
 *    the page's graph **only** through `scenario/candidates.ts`'s `import type`. Counting that edge
 *    would name a surface that cannot run.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): the register is about this package's own
 * shipped graph and binds nothing outside it, so this docstring is the record the working agreement
 * asks for.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));

/**
 * Every module reachable from the page that calls the simulator, and what was decided about it.
 *
 * One row per module the derivation below finds, asserted **in both directions** — a module the
 * graph finds and this table does not name is a surface nobody weighed, and a row the graph no
 * longer finds is a verdict about code that has moved.
 */
const MAIN_THREAD_SIMULATION: Readonly<Record<string, string>> = Object.freeze({
  /*
   * **`dev/main.ts` is deliberately absent, and its absence is the deliverable rather than an
   * omission.** It held two of these call sites when this file was written, and both moved for
   * GitHub issue #410:
   *
   * - `#runChallenge` ran the challenge's whole seed set in a `for` loop — 6 ms to 897 ms over the
   *   shipped buildings at eight seeds and 3 229 ms at a length the server may name — and now runs
   *   on `createOffThreadRunner`;
   * - the `simulateRecord` binding handed `recordRun` to `everyday/host.ts#watchRun`, the Everyday
   *   Watch reproduction gate, measured at 5 ms, 110 ms and **1 943 ms** on the rows that picker
   *   offers. That was issue #165's own defect still live on the shell `index.html` opens: #165
   *   moved the Engineer picker and left this one because `EverydayHost.watchRun` returned a row
   *   and could not wait for one. It returns nothing and settles a callback now.
   *
   * The file no longer imports `recordRun`, so every simulation the shell starts crosses a message
   * port. The both-directions assertions below are what make that a fact rather than a claim: a
   * row put back here would have to be a module the graph finds again.
   */
  /*
   * `#failStates` — one replication replayed to name a floor and a credential, after the batch it
   * diagnoses has already come back from `dev/batchWorker.ts`.
   *
   * **Bounded rather than moved**, and the numbers are why: 3–68 ms over the ten shipped stages
   * against a `structuredClone` of 1.3–9.9 ms plus a worker spawn. The budget is enforced in
   * `campaign/failStateBudget.test.ts`, in legs rather than milliseconds, for that file's stated
   * reason.
   */
  'dev/campaignPanel.ts':
    'bounded — `#failStates` replays one campaign stage; `campaign/failStateBudget.test.ts` holds ' +
    'the budget at 2 000 legs',
  /*
   * The simulator itself, in the derivation because the scan matches its own declaration. Named
   * rather than filtered out: a filter for *the file that defines it* is a place a real caller could
   * hide, and this row costs one line.
   *
   * **`batch/runBatch.ts` is deliberately not here, and its absence is a finding rather than an
   * omission.** It is not reachable from the page at run time at all: `dev/batchPanel.ts` speaks to
   * `dev/batchWorker.ts` over a port, and the only path from the page to that module is
   * `scenario/candidates.ts`'s `import type` — erased, so no edge. Every batch this product runs is
   * off the thread already, which is the claim the two directions below are what make checkable.
   */
  'record/recordRun.ts': 'the simulator itself — every row above reaches the thread through it',
});

const isTest = (path: string): boolean => /\.test\.ts$|\.test-helper\.ts$/.test(path);

/** Comments stripped, so a module that only *mentions* the simulator in prose is not a caller. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/**
 * The specifiers a module imports **at run time**.
 *
 * `import type` and `export type` are erased by TypeScript and create no edge; so is a named clause
 * in which every binding carries its own `type`. The header says why that distinction is
 * load-bearing rather than pedantic.
 */
function runtimeImportsOf(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];

  const fromClause = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;'"]*?)from\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(fromClause)) {
    if (match[1] !== undefined) continue;
    const clause = match[2] ?? '';
    const open = clause.indexOf('{');
    if (open >= 0) {
      const close = clause.indexOf('}');
      const bindings = clause
        .slice(open + 1, close < 0 ? undefined : close)
        .split(',')
        .map((binding) => binding.trim())
        .filter((binding) => binding.length > 0);
      const beforeBrace = clause.slice(0, open).replace(/,/g, '').trim();
      if (beforeBrace === '' && bindings.length > 0 && bindings.every((b) => /^type\s/.test(b))) {
        continue;
      }
    }
    specifiers.push(match[3] ?? '');
  }
  for (const match of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    specifiers.push(match[1] ?? '');
  }
  // `import './x.js';` — a side-effect import, which is how `everyday/boot.ts` reaches `dev/main.ts`
  // and therefore the one form this scan could least afford to miss.
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
    specifiers.push(match[1] ?? '');
  }
  return specifiers;
}

function resolveSpecifier(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const candidate = resolve(dirname(from), specifier.replace(/\.js$/, '.ts'));
  try {
    return statSync(candidate).isFile() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/** Everything reachable from `entries` by runtime import, tests excluded. */
function reachableFrom(entries: readonly string[]): ReadonlySet<string> {
  const seen = new Set(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined) break;
    for (const specifier of runtimeImportsOf(file)) {
      const target = resolveSpecifier(file, specifier);
      if (target === undefined || isTest(target) || seen.has(target)) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return seen;
}

/** The page's own entry, read out of `index.html` so that moving it moves this test. */
function pageEntry(): string {
  const html = readFileSync(resolve(PACKAGE, 'index.html'), 'utf8');
  const match = /<script[^>]*\ssrc="\/src\/([^"]+\.ts)"/.exec(html);
  if (match?.[1] === undefined) throw new Error('index.html names no module entry under /src/');
  return resolve(SRC, match[1]);
}

/** The worker entries, off disk by name, so a third one joins by existing. */
function workerEntries(): readonly string[] {
  const dir = resolve(SRC, 'dev');
  return readdirSync(dir)
    .filter((name) => /Worker\.ts$/.test(name) && !isTest(name))
    .map((name) => resolve(dir, name));
}

const key = (file: string): string => relative(SRC, file).split('\\').join('/');

describe('what simulates on the thread that paints', () => {
  const onThread = reachableFrom([pageEntry()]);

  const simulating = [...onThread]
    .filter((file) => {
      const source = withoutComments(readFileSync(file, 'utf8'));
      return /\brecordRun\s*\(/.test(source) || /\brunBatch\s*\(/.test(source);
    })
    .map(key)
    .sort();

  it('the derivation is not vacuous', () => {
    /*
     * The floor. A graph walk that resolved nothing would find no callers and turn every assertion
     * below green while checking a set of size zero, which is the failure mode a derived list has
     * that a transcribed one does not.
     */
    expect(onThread.size).toBeGreaterThan(100);
    expect(simulating.length).toBeGreaterThan(0);
    expect(workerEntries().length).toBeGreaterThan(0);
  });

  it('every module the graph finds is in the register', () => {
    for (const module of simulating) {
      expect(
        Object.hasOwn(MAIN_THREAD_SIMULATION, module),
        `${module} is reachable from the page and calls the simulator, and nothing says whether ` +
          'that is deliberate. Move it to a worker, or bound it and add the row.',
      ).toBe(true);
    }
  });

  it('every row in the register is still a module the graph finds', () => {
    for (const module of Object.keys(MAIN_THREAD_SIMULATION)) {
      expect(
        simulating.includes(module),
        `${module} carries a verdict about simulating on the painting thread and no longer does. ` +
          'Delete the row — a register that keeps rows about code that has moved is decoration.',
      ).toBe(true);
    }
  });

  /**
   * The workers, asserted from the other side.
   *
   * Without this the two directions above are consistent with a tree in which *nothing* is off the
   * thread — the register would be complete and the shipped simulators would all be on it. This is
   * the claim the register's rows lean on: there is somewhere else for a run to be.
   */
  it('the worker entries are where the simulator is reached off the thread', () => {
    const offThread = [...reachableFrom(workerEntries())]
      .filter((file) => {
        const source = withoutComments(readFileSync(file, 'utf8'));
        return /\brecordRun\s*\(/.test(source) || /\brunBatch\s*\(/.test(source);
      })
      .map(key)
      .sort();

    expect(offThread).toContain('dev/shiftWorker.ts');
    expect(offThread).toContain('dev/batchWorker.ts');

    /*
     * And no worker entry is reachable *from* the page, which is what makes the split a split. The
     * shipped spawn is `new Worker(new URL('./shiftWorker.ts', import.meta.url))` — a bundler seam
     * rather than an import — so a worker that acquired a plain `import` would silently rejoin the
     * main thread's graph and be caught here.
     */
    for (const worker of workerEntries()) {
      expect(
        onThread.has(worker),
        `${key(worker)} is imported into the page's own graph, so its module runs on the thread ` +
          'that paints as well as on the worker.',
      ).toBe(false);
    }
  });
});
