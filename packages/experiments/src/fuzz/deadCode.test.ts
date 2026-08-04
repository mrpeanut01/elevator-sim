/**
 * **The dead-code audit for `fuzz/`.**
 *
 * The fourth instance of the audit `packages/core/src/dispatch/deadCode.test.ts` started,
 * `tuning/deadCode.test.ts` extended and `runner/deadCode.test.ts` last copied the shape of. It
 * exists because `fuzz/` was audited by **none** of them, and `fuzz/` is the directory that carried
 * `C24` — *"every importer of `campaign.js` outside the barrel is a `*.test.ts`"* — for a whole
 * phase, closed by `cli/src/commands/fuzz.ts` ([§ D118](../../../../DECISIONS.md)) and leaving two
 * weaker instances behind it that `docs/07-handoff.md` § 3 has been carrying in prose ever since.
 *
 * The scanner is not copied. It lives once, in `../tuning/callers.test-helper.js`, for the reason
 * § D114 records.
 *
 * ## What this audit found when first run
 *
 * **63 exports scanned, 8 uncalled** — the seven fault injectors and `deepCampaignRequested`. All
 * eight are allowlisted below with the reason that makes each correct rather than a defect, and
 * neither group is a behaviour that should have been running.
 *
 * ## What it settled about the two names `docs/07` § 3 lists
 *
 * | name | as recorded | as the scanner finds it |
 * |---|---|---|
 * | `deepCampaignRequested` | *"scans to `[]`; its only importer is `fuzz/deep.test.ts`"* | **confirmed.** Allowlisted below, and the reason is [§ D118](../../../../DECISIONS.md)'s own refusal |
 * | `withCallType` | *"its only caller outside `fuzz/generate.ts` is `validation/adversarial.test.ts`"* | **wrong on both halves.** `generate.ts` does not call it at all — `run.ts` does, at `:163` — and that call sits on a chain with a shipped non-test caller at the end of it. It is not on this allowlist because it is not uncalled |
 *
 * The second is worth reading as a method note rather than as a correction. `nonTestImportersOf`
 * answers *"who **imports** it"*, and for `withCallType` the honest answer is `[]` — which is
 * exactly what a one-hop reading of the register said, and exactly what makes the register's row
 * look right. The question the roadmap actually asks is *"name the non-test caller"*, and the
 * answer is a **chain**, two of whose three links are intra-file and therefore invisible to any
 * importer query. It is pinned link by link in the last assertion below.
 */

import { describe, expect, it } from 'vitest';

import { auditModules, code, corpus, nonTestImportersOf } from '../tuning/callers.test-helper.js';

/**
 * Not `fuzz/**`. `auditModules` takes directories, and `fuzz/` has no subdirectories today; if one
 * is added it must be named here, which is the same explicitness `runner/`'s list buys.
 */
const AUDITED_MODULES = ['experiments/src/fuzz'] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * Every entry is a claim that the symbol is **library surface for a consumer that does not exist in
 * this repository**, or that its only legitimate consumer is a gate. It is emphatically not a place
 * to park something that should have been wired. Asserted in both directions.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
  /*
   * -- The deep tier's own switch, and the one name in this directory whose deadness is a
   * *decision* rather than an accident. `cli/src/commands/fuzz.ts` closed C24 by importing five of
   * `campaign.ts`'s exports and deliberately **not** this one: § D118 § "Tiers are flags here, not
   * environment" — "a tier chosen by an ambient variable is a tier a user cannot see in their own
   * shell history", and a stray `ELEVATOR_SIM_FUZZ` in a shell must not be able to turn a CLI test
   * into a 250-case deep run. Its sibling `deepCampaignSize` **is** imported there, so the two
   * halves of the same environment block came apart on purpose and the split is visible here.
   *
   * What remains is that a `describe.skipIf` in `deep.test.ts` is its only consumer, which is C24's
   * shape in the file that closed C24 — defensible, and still the weaker answer. The alternative
   * was to give it a caller, and the only available caller is the one § D118 refused. Recorded as
   * an exemption rather than reversed, and the staleness assertion below is what forces § D118 to
   * be re-argued rather than silently outgrown if anything ever imports it.
   */
  'fuzz/deepCampaignRequested':
    'the vitest tier’s own switch; § D118 refused to let the CLI read ELEVATOR_SIM_FUZZ',

  /*
   * -- The dispatcher axis a *recorded* case was indexed against. Its consumers are reproductions,
   * which are tests by construction — the same shape `benchmark/published.ts` records for its pin
   * tables, and the inverse of the defect this file exists for rather than an instance of it.
   *
   * A shipped caller would be wrong. The campaign must fuzz the library as it *ships*, or a profile
   * added tomorrow is never searched; only the pinned reproductions need a frozen axis, because a
   * fuzz seed is an index into an option space whose dispatcher dimension is the profile list.
   * Shipping `collective-enroute` re-mapped every seed and detached `fuzz-1001074` and
   * `fuzz-1000384` from the runs they documented — `deep.test.ts` reproduced a *different* case at
   * the same seed and said so by failing (`DECISIONS.md` § D205). So the constant's only correct
   * callers are the two reproduction suites, and the staleness assertion below is what forces this
   * to be re-argued if a shipped path ever imports it.
   */
  'fuzz/CORPUS_DISPATCHER_PROFILE_IDS':
    'the frozen dispatcher axis of the recorded corpus; a shipped caller would freeze the search too',
  'fuzz/CORPUS_TRAFFIC_PROFILE_IDS':
    'the frozen traffic axis of the recorded corpus, and the same argument one field over — § D205 ' +
    'fixed the dispatcher axis and left this one derived, so adding the hospital profile re-mapped ' +
    'every recorded seed. A shipped caller would freeze the search too',

  /*
   * -- The seven fault injectors, whose only legitimate caller is the suite that proves each
   * property can fail. This is not the "every caller was a test" defect but its inverse: a fault
   * injector *called from shipped code* would be the defect. § D118 refused a `--break-dispatch`
   * flag on exactly that ground — "a way to manufacture findings beside the thing that reports
   * them" — so the absence of a non-test caller is the property, not the gap.
   *
   * `refusingToDispatch` is deliberately **not** here: `stallingAfter` and `starvingFloorUntil`
   * build on it inside `faults.ts`, so it has real intra-module callers and the scanner sees them.
   * That asymmetry is the shape of the two-hop blind spot the scanner documents — a live-looking
   * symbol called only by dead ones — and it is harmless here precisely because the seven callers
   * above it are allowlisted rather than assumed.
   */
  'fuzz/refusedAnswer': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/stallingAfter': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/starvingFloorUntil': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/withLostPassenger': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/withMisdelivery': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/withNegativeWait': 'a fault injector; a non-test caller would be the defect (§ D118)',
  'fuzz/withOverfilledCar': 'a fault injector; a non-test caller would be the defect (§ D118)',
});

/**
 * The chain that makes `withCallType` live, link by link, from the CLI command down.
 *
 * Each row is `[symbol, the file that calls it, how]`. Two of the three links are **intra-file**,
 * which is why no importer query can see them and why the register recorded this symbol as having
 * a test for its only caller.
 */
const WITH_CALL_TYPE_CHAIN: readonly (readonly [string, string, 'import' | 'same file'])[] =
  Object.freeze([
    ['runCampaign', 'cli/src/commands/fuzz.ts', 'import'],
    ['evaluateCase', 'experiments/src/fuzz/campaign.ts', 'import'],
    ['fuzzSimulationConfigFor', 'experiments/src/fuzz/run.ts', 'same file'],
    ['withCallType', 'experiments/src/fuzz/run.ts', 'same file'],
  ]);

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of fuzz/ has a caller or a stated reason', () => {
  const { symbols, uncalled } = auditModules(AUDITED_MODULES);

  it('scans the module and finds the entry points it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These are the
    // directory's load-bearing exports and their absence means the walk broke.
    expect(symbols.length).toBeGreaterThan(40);
    for (const key of [
      'fuzz/runCampaign',
      'fuzz/caseFromSeed',
      'fuzz/legalCallTypesFor',
      'fuzz/callCarriesCredential',
      'fuzz/evaluateCase',
      'fuzz/withCallType',
      'fuzz/checkAll',
      'fuzz/shrinkCase',
      'fuzz/deepCampaignSize',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the defect this repository has shipped nine times — or they are ' +
        'deliberate library surface and belong in the allowlist with the reason why',
    ).toEqual([]);
  });

  it('keeps the allowlist honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = Object.keys(PUBLIC_API_ONLY).filter((key) => !uncalledKeys.has(key));
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
      'an allowlist that keeps entries after their reason lapses is where dead code goes to be ' +
        'forgotten, which is this defect one step removed. For deepCampaignRequested in ' +
        'particular: a caller means DECISIONS.md § D118’s refusal to let the CLI read ' +
        'ELEVATOR_SIM_FUZZ has been reversed, and that must be re-argued, not re-pinned',
    ).toEqual([]);
  });

  /*
   * The chain, pinned in code rather than only in the header above.
   *
   * `docs/07` § 3 records `withCallType` as having a test for its only caller outside the
   * generator. The generator does not call it; `run.ts` does, and `run.ts`'s caller is
   * `campaign.ts`, whose caller is the CLI command that closed C24. Each link is checked the way
   * the scanner checks it — an import binding across files, a name used twice in comment- and
   * string-stripped source within one — so this cannot degrade into a restatement of the claim.
   */
  it('names withCallType’s non-test caller, link by link, rather than asserting it has none', () => {
    const scope = corpus();
    const fileOf = (relative: string): string =>
      scope.files.find((path) => path.replace(/\\/g, '/').endsWith(`/${relative}`)) ?? '';

    for (const [symbol, callerRelative, how] of WITH_CALL_TYPE_CHAIN) {
      const caller = fileOf(callerRelative);
      expect(caller, `${callerRelative} is not in the scanned corpus`).not.toBe('');
      if (how === 'import') {
        expect(
          scope.bindings(caller).has(symbol),
          `${callerRelative} no longer imports ${symbol}: the chain that makes withCallType live ` +
            'is broken, and this directory is back to C24',
        ).toBe(true);
      } else {
        const uses = (code(scope.text(caller)).match(new RegExp(`\\b${symbol}\\b`, 'g')) ?? []).length;
        expect(uses, `${callerRelative} declares ${symbol} and no longer uses it`).toBeGreaterThan(1);
      }
    }

    // And the half the register got right, kept: nothing outside `run.ts` **imports** it for a
    // shipped purpose. The liveness is the chain above, not an importer, and saying so in both
    // directions is what stops the next reader re-deriving the register's row.
    expect(nonTestImportersOf(scope, 'withCallType')).toEqual([]);
  });
});
