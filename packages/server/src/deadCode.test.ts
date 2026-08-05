/**
 * **The dead-code audit for `packages/server`, written the same week the package was.**
 *
 * The sixth instance of the audit `core/src/dispatch/deadCode.test.ts` started. It is here on day
 * one rather than after a phase because of what happened four commits ago in this same branch:
 * `viz/src/menu/` landed as eight tested, exported, entirely uncalled functions, and the audit
 * that already existed for that package reported it on the very next run. A new package with a
 * database, a socket and a security model is the worst possible place to discover that a fortnight
 * later — *"the configuration was right, the validation was right, and nothing consulted either"*
 * is § D131's sentence about the deck API, and it is exactly what an unwired authorization check
 * would look like.
 *
 * The chain that has to hold is:
 *
 * ```
 * main.ts → serve.ts → http/api.ts → { accounts/credentials.ts, mail/mailer.ts,
 *                                      leaderboard/{submission,verify}.ts, store/store.ts,
 *                                      challenge/{schedule,submission,verify,board}.ts }
 *          bootstrap.ts ─┘
 * ```
 *
 * and the last assertion below pins it link by link rather than asserting it in prose. A barrel
 * re-export and a `{@link}` tag look exactly like a caller and are not one.
 *
 * ## What this audit found when first run
 *
 * **61 exports scanned, 0 uncalled**, so {@link PUBLIC_API_ONLY} is empty. That is a result worth
 * stating rather than a formality: `viz/src/menu` scanned 8 and found 8 uncalled four commits ago,
 * and the difference is that `main.ts` was written in the same change as `store.ts` rather than a
 * wave later. An empty allowlist is also the strongest possible state for the staleness assertion
 * below — there is nothing exempted, so nothing can quietly become an exemption that outlived its
 * reason.
 *
 * **§ D218's challenge board took it to 96 exports, still 0 uncalled**, and the allowlist is still
 * empty. Same reason and the same discipline: `challenge/` was written with its routes rather than
 * ahead of them, so `http/api.ts` is the non-test caller of every player-facing piece and
 * `bootstrap.ts` is the non-test caller of the two that decide whether the server may start at all.
 * The three intra-module links that no importer query can see are named in {@link WIRING} rather
 * than assumed.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { auditModules, code, corpus } from './deadCode.test-helper.js';

/**
 * Every directory under `server/src`, plus the root.
 *
 * `auditModules` is not recursive, so a new directory must be named here — and the derivation
 * assertion below reads the directory list **off disk** and fails the day one appears, rather than
 * the day someone notices. That guard is not decoration: § D213 spent a whole commit on five
 * hand-written lists that had to be widened by hand, two of which were guards that could no longer
 * see what they were guarding.
 */
const AUDITED_MODULES = [
  'server/src',
  'server/src/accounts',
  'server/src/challenge',
  'server/src/http',
  'server/src/leaderboard',
  'server/src/mail',
  'server/src/store',
] as const;

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 *
 * **Empty, and asserted empty in both directions.** Every export of this package has a non-test
 * caller today. An entry here would be a claim that a symbol is surface for a consumer that does
 * not exist in this repository yet — not a place to park something that should have been wired —
 * and the staleness check below deletes it the moment it acquires a caller, so an exemption has to
 * be re-argued rather than silently outgrown.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({});

/**
 * The chain that makes every module of this package live, link by link, from the entry point down.
 *
 * `[symbol, the file that reaches it, how]`. The `same file` rows are the ones no importer query
 * can see — the blind spot § D125 records, and the reason `tuning/` sat dead behind a docstring
 * that claimed a caller.
 */
const WIRING: readonly (readonly [string, string, 'import' | 'same file'])[] = Object.freeze([
  ['bootstrap', 'server/src/main.ts', 'import'],
  ['serve', 'server/src/main.ts', 'import'],
  ['createApi', 'server/src/bootstrap.ts', 'import'],
  ['requireSecret', 'server/src/bootstrap.ts', 'import'],
  ['Store', 'server/src/bootstrap.ts', 'import'],
  ['OutboxMailer', 'server/src/bootstrap.ts', 'import'],
  ['factsResolver', 'server/src/bootstrap.ts', 'same file'],
  ['verifySubmission', 'server/src/http/api.ts', 'import'],
  ['submissionIssues', 'server/src/http/api.ts', 'import'],
  ['configHashOf', 'server/src/http/api.ts', 'import'],
  ['hashPassword', 'server/src/http/api.ts', 'import'],
  ['passwordMatches', 'server/src/http/api.ts', 'import'],
  ['signConfirmation', 'server/src/http/api.ts', 'import'],
  ['verifyConfirmation', 'server/src/http/api.ts', 'import'],
  ['newSessionToken', 'server/src/http/api.ts', 'import'],
  ['confirmationMessage', 'server/src/http/api.ts', 'import'],
  ['bearerOf', 'server/src/http/serve.ts', 'same file'],
  // § D218's challenge board. The same chain one level down: `api.ts` is the non-test caller of
  // every player-facing piece, and `bootstrap.ts` is the non-test caller of the two that decide
  // whether the server may start at all.
  ['issuedChallengeAt', 'server/src/http/api.ts', 'import'],
  ['challengeStateAt', 'server/src/http/api.ts', 'import'],
  ['challengeSubmissionIssues', 'server/src/http/api.ts', 'import'],
  ['challengeDataHashOf', 'server/src/http/api.ts', 'import'],
  ['verifyChallengeSubmission', 'server/src/http/api.ts', 'import'],
  ['challengeBoardNote', 'server/src/http/api.ts', 'import'],
  ['comparePointerFor', 'server/src/http/api.ts', 'import'],
  ['windowRefusalDetail', 'server/src/http/api.ts', 'import'],
  ['CHALLENGE_CLOCK_NOTE', 'server/src/http/api.ts', 'import'],
  ['CHALLENGE_ROTATION', 'server/src/bootstrap.ts', 'import'],
  ['challengeDefinitionIssues', 'server/src/bootstrap.ts', 'import'],
  ['assertChallengesAreRunnable', 'server/src/bootstrap.ts', 'same file'],
  ['challengeFactsResolver', 'server/src/bootstrap.ts', 'same file'],
  // The two intra-module links no importer query can see: the schedule's own arithmetic, and the
  // aggregate the verifier builds. `tuning/` sat dead behind a docstring that claimed exactly this
  // shape of caller, so it is pinned rather than assumed.
  ['issuedChallengeFor', 'server/src/challenge/schedule.ts', 'same file'],
  ['challengeScoreOf', 'server/src/challenge/verify.ts', 'import'],
]);

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of server/ has a caller or a stated reason', () => {
  const { symbols, uncalled } = auditModules(AUDITED_MODULES);

  it('scans the package and finds the exports it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. These are the
    // load-bearing exports and their absence means the walk broke.
    expect(symbols.length).toBeGreaterThan(30);
    for (const key of [
      'src/bootstrap',
      'http/createApi',
      'http/serve',
      'store/Store',
      'leaderboard/verifySubmission',
      'leaderboard/configHashOf',
      'accounts/hashPassword',
      'accounts/signConfirmation',
      'mail/OutboxMailer',
      'src/main',
      'challenge/issuedChallengeAt',
      'challenge/verifyChallengeSubmission',
      'challenge/challengeDataHashOf',
      'challenge/challengeBoardNote',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('names every directory from disk, so a new one cannot be audited by omission', () => {
    // Derived, not listed. This is § D213's lesson applied to the guard itself: a hand-written
    // list of what to check is a list that stops checking the moment a directory is added.
    const onDisk = directoriesUnder(fileURLToPath(new URL('./', import.meta.url)));
    expect(onDisk.length).toBeGreaterThan(3);
    expect([...AUDITED_MODULES].sort()).toEqual(
      ['server/src', ...onDisk.map((name) => `server/src/${name}`)].sort(),
    );
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter((symbol) => !(symbol.key in PUBLIC_API_ONLY));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and no entry in PUBLIC_API_ONLY. Either something ' +
        'should be calling them — the defect this repository has shipped eleven times, most ' +
        'recently four commits ago in viz/src/menu — or they are deliberate surface and belong in ' +
        'the allowlist with the reason why',
    ).toEqual([]);
  });

  it('keeps the allowlist honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = Object.keys(PUBLIC_API_ONLY).filter((key) => !uncalledKeys.has(key));
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
      'an allowlist that keeps entries after their reason lapses is where dead code goes to be ' +
        'forgotten, which is this defect one step removed',
    ).toEqual([]);
  });

  it('names the wiring link by link, rather than asserting the package is wired', () => {
    const scope = corpus();
    const fileOf = (relative: string): string =>
      scope.files.find((path) => path.replace(/\\/gu, '/').endsWith(`/${relative}`)) ?? '';

    for (const [symbol, callerRelative, how] of WIRING) {
      const caller = fileOf(callerRelative);
      expect(caller, `${callerRelative} is not in the scanned corpus`).not.toBe('');
      if (how === 'import') {
        expect(
          scope.bindings(caller).has(symbol),
          `${callerRelative} no longer imports ${symbol}: the chain from the entry point to the ` +
            'security model is broken, and this package is back to being configuration nothing reads',
        ).toBe(true);
      } else {
        // Comment- and string-stripped, and counted twice, exactly as the scanner counts it — so
        // this cannot degrade into a restatement of the claim by matching a docstring.
        const occurrences = code(scope.text(caller)).split(symbol).length - 1;
        expect(occurrences, `${callerRelative} declares ${symbol} but never calls it`).toBeGreaterThan(1);
      }
    }
  });
});

/** The subdirectories of `server/src`, from disk. */
function directoriesUnder(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name);
}
