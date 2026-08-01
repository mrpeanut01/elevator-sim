/**
 * **The dead-code audit for `teaching/`.**
 *
 * The fifth of these in the repository and the second in this package, and it exists on the day
 * the module lands rather than on the day someone notices. docs/14 § 5 criterion 6 is *"no new dead
 * seam: every unit added here names its non-test caller, mechanically"*, and the eleven instances
 * `docs/05-roadmap.md` records all shared one property — a module suite drove every function
 * directly, a barrel re-exported them, and nothing in a shipped path called any of it.
 *
 * The scanner is `tuning/callers.test-helper.ts`'s, unchanged: one copy of the question, three
 * suites asking it of different directories. § D114 records what two copies of one audit cost.
 *
 * **The named non-test caller of this module is `packages/cli/src/commands/tune.ts` under
 * `--teaching`.** Asserted below by name rather than stated, because *"the roadmap asserted the
 * phase green anyway"* is how the sixth instance survived: `tuning/`'s own docstring said it had no
 * caller and the status row said it was done.
 */

import { describe, expect, it } from 'vitest';

import { auditModules, corpus, nonTestImportersOf } from '../tuning/callers.test-helper.js';

const AUDITED_MODULES = ['experiments/src/teaching'] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Asserted in **both** directions by the third suite below: an entry whose symbol has since
 * acquired a caller, or has been deleted, fails too. Otherwise the allowlist becomes the place dead
 * code goes to be forgotten, which is the failure one step removed from the one this file catches.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({});

describe('every export of teaching/ has a caller or a stated reason', () => {
  const { symbols, uncalled } = auditModules(AUDITED_MODULES);

  it('scans the module and finds the exports it is supposed to be auditing', () => {
    /* A scanner that silently matched nothing would pass every assertion below — R24's shape one
       layer up, and the reason `tuning/deadCode.test.ts` carries the same guard. */
    expect(symbols.length).toBeGreaterThan(15);
    for (const key of [
      'teaching/TeachingSpec',
      'teaching/parseTeachingSpec',
      'teaching/teachingSeedSets',
      'teaching/runTeachingRound',
      'teaching/formatTeachingRound',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. A barrel ' +
        're-export and a {@link} tag look exactly like a caller and are not one',
    ).toEqual([]);
  });

  it('keeps the allowlist honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = Object.keys(PUBLIC_API_ONLY).filter((key) => !uncalledKeys.has(key));
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
    ).toEqual([]);
  });
});

describe('the named non-test caller is named, and it is not a barrel', () => {
  const scope = corpus();

  it.each(['runTeachingRound', 'formatTeachingRound', 'TeachingError'])(
    'reaches %s from packages/cli/src/commands/tune.ts',
    (name) => {
      const importers = nonTestImportersOf(scope, name);
      expect(importers).toContain('cli/src/commands/tune.ts');
    },
  );

  it('does not count teaching/index.ts as one of them', () => {
    /* The barrel proves *reachability*, which is the exact property all eleven dead behaviours
       already had. `isBarrel` excludes it, and this asserts the exclusion rather than trusting it. */
    expect(nonTestImportersOf(scope, 'runTeachingRound')).not.toContain(
      'experiments/src/teaching/index.ts',
    );
  });
});
