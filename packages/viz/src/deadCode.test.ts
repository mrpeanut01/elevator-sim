/**
 * **The dead-code audit for `packages/viz` — the fifth, and the one Phase 9's clause 4 was
 * accepted without.**
 *
 * [§ D163](../../DECISIONS.md)'s clause 4 — *every unit names its non-test caller* — was satisfied
 * in prose and mechanised by nothing: every `viz/src` directory sat outside every
 * `AUDITED_MODULES`, and the evidence was the hand-written table in `src/index.ts` plus one prose
 * line per unit in `docs/10` § 11. Those two are *hypotheses*; this file runs. The table stays
 * where it is — it carries the chains and the reasons — but the zero-caller question is now asked
 * mechanically, in both directions, the way `core/dispatch`, `tuning/`, `runner/` and `fuzz/`
 * already ask it.
 *
 * The scanner is inlined in `./deadCode.test-helper.ts` rather than imported, the way `core`
 * inlined it and for grounds stated in that file's header (the short form: the shared copy is not
 * on any surface this package may import, and a cross-package relative import breaks `tsc -b`).
 *
 * ## What the first run found (2026-07-30)
 *
 * **1 017 exports over 19 directories; 60 uncalled under the shared scanner's name-binding
 * rules.** Thirty-five of the sixty were the palette — `render/tokens.ts` consumed whole by
 * `render/canvas.ts` as `import * as tokens`, a real use no name-binding rule can see — which is
 * why the inlined scanner gained the namespace rule (its divergence 2) rather than an allowlist
 * of thirty-five live symbols labelled uncalled. **25 remain, classified below: 8 dead
 * candidates and 17 with a reason that is correct rather than a defect.**
 *
 * Two of the eight dead candidates falsify their own documentation:
 * `dev/PREFERRED_VIEWER_DISPATCHERS`'s docstring names `dev/main.ts`'s boot as its non-test
 * caller while `dev/state.ts` re-derives the same list privately, and `dev/viewerRunConfig`'s
 * docstring says a test asserts it *"against the same function `main.ts` calls"* while `main.ts`
 * calls `shiftRunConfigOf`. **Nothing is deleted here** — classification is this audit's whole
 * deliverable, and deletion is follow-up work with its own verification.
 *
 * ## What this audit cannot see, stated rather than implied
 *
 * (The honesty derivation states its own blind spot the same way — *"`dev/main.ts` … has no
 * exports and therefore appears in no derivation of exported producers"* — and that sentence is
 * now half-true, which is exactly why the limits below are pinned by assertions, not prose.)
 *
 * 1. **Export clauses.** `dev/main.ts:1393` exports `applyDeepLink`, `randomSeed` and `SPEEDS`
 *    via `export { … }` with no `from` — no declaration at the start of a line, so the symbol
 *    walk cannot see them, and no `from`-clause, so `boundNames` cannot either. Asserted below:
 *    they are absent from the scan *and* nothing non-test imports them (they exist for
 *    `main.test.ts`). `main.ts`'s two declaration-form exports (`waitLegendEntries`,
 *    `WaitLegendEntry`) **are** scanned like anything else in `dev/`.
 * 2. **Non-export bindings.** `main.ts:283`'s `let bankFilter` — the thirteenth dead seam,
 *    `GAPS.md` § 3 / `UX.md` SG-15 — is a local variable. An export-level scanner cannot see a
 *    written-never-read *binding*; the instrument for that class is the driven run-change test
 *    (§ D177), which is lane V's deliverable this wave, not this file's. Asserted below only
 *    that it is not an export, so this audit's silence about it is never read as coverage.
 * 3. **Two-hop liveness** is inherited from the shared scanner (§ D125): a dead symbol calling a
 *    live-looking sibling keeps the sibling alive at one hop. Stated, not fixed.
 * 4. **Non-TypeScript callers.** `index.html`'s stylesheet consumes `render/CARD_RAISED` and
 *    `render/TEXT_MUTED`; the corpus is `.ts` files, so those two are allowlisted with the test
 *    that pins the stylesheet to them rather than read as dead.
 * 5. **`viz/src` itself audits to zero symbols by construction** — its only non-directory
 *    entries are `index.ts` (barrel), `boundaries.test.ts`, `fixtures.test-helper.ts` and this
 *    audit's two files (tests). It is named in `AUDITED_MODULES` anyway, so a runtime file
 *    landing at the package root enters the audit on the day it lands. `replay/` holds only
 *    `replay.test.ts` and is named for the same reason.
 */

import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PACKAGES_DIR,
  auditModules,
  boundNames,
  code,
  corpus,
  namespaceImports,
  nonTestImportersOf,
  readSource,
  type Corpus,
} from './deadCode.test-helper.js';

/**
 * Every directory under `viz/src`, plus the root itself. `auditModules` is not recursive, so a
 * new directory must be named here — and the derivation assertion below turns this suite red on
 * the day one appears, rather than on the day someone notices.
 */
const AUDITED_MODULES = [
  'viz/src',
  'viz/src/access',
  'viz/src/authoring',
  'viz/src/batch',
  'viz/src/campaign',
  'viz/src/contract',
  'viz/src/controls',
  'viz/src/dev',
  'viz/src/editor',
  'viz/src/frame',
  'viz/src/honesty',
  'viz/src/live',
  'viz/src/mode',
  'viz/src/playback',
  'viz/src/record',
  'viz/src/render',
  'viz/src/replay',
  'viz/src/scenario',
  'viz/src/shift',
] as const;

/**
 * Exports with no caller anywhere and **no stated reason to have none** — the defect class this
 * repository has shipped ten times in code. Each entry is a *recorded finding*, kept here so the
 * suite is green while the register carries the defect: deleting or wiring these is follow-up
 * work with its own verification, and this lane's deliverable is the classification. An entry
 * leaving this list must leave it because the code moved, and the staleness assertion below is
 * what forces that.
 */
const DEAD_CANDIDATES: Readonly<Record<string, string>> = Object.freeze({
  /*
   * -- The two whose own docstrings name a caller that does not call them. defaults.ts:30 says
   * "Non-test callers: PREFERRED_VIEWER_DISPATCHERS in dev/main.ts's boot"; main.ts does not
   * import defaults.js at all — state.ts:282's private preferredDispatcher() re-derives the same
   * ['collective', 'eta'] list from its own literal, so § D134's decision is enforced by a
   * duplicate and this const decides nothing. Its two siblings (PREFERRED_BATCH_BASELINE,
   * PREFERRED_BATCH_CANDIDATE) are genuinely imported by dev/batchPanel.ts and read as live.
   */
  'dev/PREFERRED_VIEWER_DISPATCHERS':
    'dead: its docstring names dev/main.ts’s boot; state.ts:282 re-derives the list privately',
  /*
   * -- T75 factored "what a viewer run is" out of a click handler into viewerRunConfig so a test
   * could assert the § D153 seam (SimulationConfig.dispatcherProfiles). The shift rebuild then
   * built state.ts's shiftRunConfigOf — which carries the same seam at state.ts:446 — and
   * main.ts:794/:1199 call *that*. viewerRunConfig kept the docstring claim "a test asserts it
   * against the same function main.ts calls", now false, and viewerSelector.test.ts asserts the
   * selector seam against a function no shipped path calls — § D159's fixture-routes-the-test
   * shape, one file up.
   */
  'dev/viewerRunConfig':
    'dead: superseded by state.ts’s shiftRunConfigOf (main.ts:794); its test now tests an unshipped path',
  'dev/doorTimingOf':
    'dead: a one-line wrapper with zero callers, tests included; levers reach runs via profileFromSpec',
  /*
   * -- dom.ts:103. Its file header argues fifty inline copies of a four-line helper is "the way
   * a design system stops being one"; the rails and panels then build eyebrow markup inline
   * anyway (scenariosPanel.ts:278, leftRail, rightRail), and the helper's only importer is
   * provenanceBlock.test.ts.
   */
  'dev/eyebrow': 'dead: every panel builds eyebrow markup inline instead of calling it',
  'controls/ControlKind': 'dead: a type alias bound by nothing but the barrel — not even a test',
  /*
   * -- The single-floor form of landingAssignmentsAt. The barrel's own table row already admits
   * "No caller outside this package"; inside it there is none either — overlay.ts:605's docstring
   * records that dev/main.ts holds a key and filters the plural form itself. This is the exact
   * shape isSupportedRecording and displayMsAt were deleted in (src/index.ts § "Deleted rather
   * than kept as decoration").
   */
  'frame/landingAssignmentAt':
    'dead: the barrel row admits no caller outside; main.ts filters the plural form itself',
  'honesty/formatHonestyCase':
    'dead: zero callers, tests included; shrink.ts’s docstring promises it prints the shrunk case',
  /*
   * -- bands.ts:236, "for a caller holding one from a serialised state" — a hypothetical caller
   * written next to the export, which is the pattern wave 1's remediation deleted rather than
   * kept. Sharper here: honesty/surfaces.ts:759 lists 'live/bands.ts#bandById' as a covered
   * declaration, so the honesty sweep vouches for the strings of a function no shipped path can
   * reach.
   */
  'live/bandById':
    'dead: docstring names a hypothetical caller; honesty covers strings nothing can reach',
});

/**
 * Exports with no caller anywhere, each with the reason that is correct rather than a defect.
 * Every entry claims the symbol is **an instrument whose consumer is a guard, a driver, a
 * compiler, or a surface outside this scanner's corpus** — emphatically not a place to park
 * something that should have been wired. Asserted in both directions with the list above.
 */
const PUBLIC_API_ONLY: Readonly<Record<string, string>> = Object.freeze({
  /*
   * -- The honesty harness. Its driver is honesty.test.ts's two tiers — the always-on tier and
   * the deep tier § D163 clause 2 was accepted on (60 cases, 271 985 strings, 0 violations).
   * This is C24's literal shape — every caller is a test — and unlike fuzz/, no CLI command has
   * closed it (§ D118 closed fuzz's by importing five of campaign.ts's exports from
   * cli/commands/fuzz.ts). Recorded as the named exemption it is: an `elevator-sim honesty`
   * command is the C24-closing move, and inventing one is feature work, not an allowlist edit.
   */
  'honesty/runHonestyCampaign':
    'the honesty harness’s driver; its consumer is the suite § D163 clause 2 was accepted on',
  'honesty/formatHonestyStats': 'formats the campaign tier summary for the suite that drives it',
  'honesty/formatFailure': 'formats a violation for the suite that reports it',
  /*
   * -- The vitest tier's own switch (ELEVATOR_SIM_HONESTY), the exact mirror of
   * fuzz/deepCampaignRequested: § D118's ground — a tier chosen by an ambient variable must not
   * be CLI-reachable — transfers whole, and a caller appearing here means that refusal is being
   * reversed and must be re-argued.
   */
  'honesty/deepCampaignRequested':
    'the vitest tier’s own switch; § D118’s ELEVATOR_SIM_FUZZ refusal transfers whole',
  'honesty/FAULTS':
    'fault injectors; a non-test caller would be the defect (fuzz precedent, § D118)',
  'honesty/coveredDeclarations':
    'the coverage ledger derive.test.ts’s guard iterates; the guard is its consumer by design',

  /*
   * -- Guards given a value so a claim cannot rot. The first is a conditional type — a runtime
   * caller cannot exist for it, and report.test.ts:25 assigns it so the compile-time claim has a
   * place to fail. The second walks the id manifest for elementMap.test.ts's cross-check against
   * index.html — the check that makes a missing id a red suite rather than a blank panel.
   */
  'batch/BatchMetricIsAReplicationMetric':
    'a compile-time claim; report.test.ts:25 gives it a value — no runtime caller can exist',
  'dev/elementIdsIn': 'the manifest walker behind elementMap.test.ts’s index.html cross-check',

  /*
   * -- The published-number instruments (docs/10 § 11 W9). measureScenario produced
   * data/scenario-goals.json; regenerate.test-helper.ts is the driver that can produce it again
   * and goalRates.test.ts the guard that re-derives it — the regeneratePins.ts shape. One
   * honest difference from that precedent, stated rather than smoothed: experiments' driver is
   * real source (benchmark/livenessSuite.ts drives it); viz's driver is itself a test-helper,
   * so these three lean on the guard alone as far as this scanner can see.
   */
  'scenario/measureScenario':
    'the instrument that produced data/scenario-goals.json; its caller is the regeneration driver',
  'scenario/publishedScenarioFor': 'same instrument, same driver, same reason',
  'scenario/CANDIDATE_SCENARIOS':
    'the driver’s and the guard’s shared scenario list (goalReport imports only CANDIDATE_GOALS)',
  /*
   * -- R1's machine-checkable form: which BatchMetrics each per-replication goal kind reads.
   * goals.test.ts asserts it against R1's own list; campaign.test.ts leans on it. Guard data
   * whose consumer is the guard.
   */
  'scenario/GOAL_READS': 'R1’s machine-checkable form; the guard suites are its consumers',

  /*
   * -- Test doubles and test anchors, each an incident away from a literal. ManualClock is the
   * injected DisplayClock's double — a shipped caller would put a fake clock in a real path.
   * MIN_HEADER_PX is minHeaderPx(DEFAULT_PADDING_PX) precomputed for headerBand/overlayRender/
   * canvas tests; buildLayout clamps via minHeaderPx(padding) itself (layout.ts:405).
   * DEFAULT_FOOTER_PX exists because a test's literal 28 once went stale two pixels from the
   * pitch it named (layout.ts:346); the value ships via DEFAULTS.footerPx.
   */
  'playback/ManualClock': 'the test double, by construction — a shipped caller would be the defect',
  'render/MIN_HEADER_PX': 'the derivation precomputed for three render tests; buildLayout derives',
  'render/DEFAULT_FOOTER_PX': 'the tests’ anchor for DEFAULTS.footerPx after a stale-literal bug',

  /*
   * -- Stylesheet tokens. Their consumer is index.html's CSS — outside a .ts corpus — and
   * dev/tokens.test.ts:59/:63 pins the stylesheet to them byte-for-byte, which is the whole
   * one-source-of-truth argument of tokens.ts's header. The other thirty-eight palette tokens
   * read live through canvas.ts's namespace import; these two are the stylesheet's alone.
   */
  'render/CARD_RAISED': 'a stylesheet token; index.html consumes it, dev/tokens.test.ts:59 pins it',
  'render/TEXT_MUTED': 'a stylesheet token; index.html consumes it, dev/tokens.test.ts:63 pins it',
});

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of packages/viz has a caller or a stated reason', () => {
  const scope = corpus();
  const { symbols, uncalled } = auditModules(AUDITED_MODULES, scope);

  it('names every directory under viz/src — derived from the tree, not from memory', () => {
    // The clause being mechanised is "every unit names its non-test caller"; a hand-written
    // module list is the hand-written table one level up. So the list is asserted against the
    // filesystem in both directions: a directory added to src/ without being audited is red.
    const found = readdirSync(join(PACKAGES_DIR, 'viz/src'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `viz/src/${entry.name}`)
      .sort();
    expect([...AUDITED_MODULES].filter((module) => module !== 'viz/src').sort()).toEqual(found);
    expect(AUDITED_MODULES).toContain('viz/src');
  });

  it('scans the package and finds the entry points it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. One load-bearing
    // export per source-carrying directory (replay/ has only its test), so a broken walk names
    // the directory it broke in.
    expect(symbols.length).toBeGreaterThan(900);
    for (const key of [
      'access/lockedOutLandingsAt',
      'authoring/doorTimingFor',
      'batch/runBatch',
      'campaign/judgeStage',
      'contract/StepSeriesBuilder',
      'controls/renderControl',
      'dev/shiftRunConfigOf',
      'editor/validateBuilding',
      'frame/frameAt',
      'honesty/runHonestyCampaign',
      'live/observationsAt',
      'mode/disclosureItems',
      'playback/Playback',
      'record/recordRun',
      'render/drawScene',
      'scenario/goalReport',
      'shift/dayReportOf',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller, and no entry in either list', () => {
    const explained = new Set([...Object.keys(DEAD_CANDIDATES), ...Object.keys(PUBLIC_API_ONLY)]);
    const unexplained = uncalled.filter((symbol) => !explained.has(symbol.key));
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no caller anywhere and no entry in DEAD_CANDIDATES or PUBLIC_API_ONLY. ' +
        'Either something should be calling them — the defect this repository has shipped ten ' +
        'times in code — or they belong in one of the two lists with the reason why',
    ).toEqual([]);
  });

  it('keeps both lists honest: no entry may outlive the condition that justified it', () => {
    // The staleness rule, in both directions, over both lists. An allowlisted symbol gaining a
    // caller turns this red: for a DEAD_CANDIDATES entry that is the register closing (someone
    // wired or deleted it — update the entry and the report that cites it); for a
    // PUBLIC_API_ONLY entry it means the stated reason has lapsed and must be re-argued — for
    // honesty/deepCampaignRequested in particular, a caller means § D118's refusal is being
    // reversed.
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = [...Object.keys(DEAD_CANDIDATES), ...Object.keys(PUBLIC_API_ONLY)].filter(
      (key) => !uncalledKeys.has(key),
    );
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
      'a list that keeps entries after their reason lapses is where dead code goes to be ' +
        'forgotten, which is this defect one step removed',
    ).toEqual([]);
  });

  it('keeps the two classifications disjoint', () => {
    const both = Object.keys(DEAD_CANDIDATES).filter((key) => key in PUBLIC_API_ONLY);
    expect(both, 'a symbol cannot be both a recorded defect and deliberately caller-free').toEqual(
      [],
    );
  });

  /*
   * Divergence 2's pin against the real tree. The thirty-eight palette tokens read as live
   * *because* canvas.ts namespace-imports tokens.ts and members into it — so both halves of that
   * mechanism are asserted on the shipped files. If canvas.ts ever moves to named imports, the
   * second expectation goes red and this pin (not the scanner) is what needs updating.
   */
  it('carries the palette on the namespace rule, and says so', () => {
    const canvas = scope.files.find((path) =>
      path.replace(/\\/g, '/').endsWith('/viz/src/render/canvas.ts'),
    );
    const tokens = scope.files.find((path) =>
      path.replace(/\\/g, '/').endsWith('/viz/src/render/tokens.ts'),
    );
    expect(canvas, 'render/canvas.ts is not in the scanned corpus').toBeDefined();
    expect(tokens, 'render/tokens.ts is not in the scanned corpus').toBeDefined();

    const aliases = [...scope.namespaces(canvas ?? '')].filter(([, module]) => module === tokens);
    expect(aliases.length, 'canvas.ts no longer namespace-imports ./tokens.js').toBeGreaterThan(0);
    const [alias] = aliases[0] ?? [''];
    expect(new RegExp(`\\b${alias}\\.PAGE\\b`).test(code(scope.text(canvas ?? '')))).toBe(true);
    // …and the named-binding route did NOT carry it, so the namespace rule is load-bearing
    // rather than redundant.
    expect(boundNames(scope.text(canvas ?? '')).has('PAGE')).toBe(false);
    expect(uncalled.map((symbol) => symbol.key)).not.toContain('render/PAGE');
  });

  it('positive control: the namespace rule can fail — a token without its consumer reads dead', () => {
    // A synthetic two-file module through the same auditModules entry point: with the consumer
    // in the corpus the token is live; with the consumer removed it is dead. Without this, the
    // namespace extension could silently match nothing and thirty-five live symbols would come
    // back as sixty findings — loud, but wrong in the direction that buries real ones.
    const moduleFile = join(PACKAGES_DIR, 'viz/src/synthetic-control/palette.ts');
    const consumerFile = join(PACKAGES_DIR, 'viz/src/synthetic-control/consumer.ts');
    const texts: Record<string, string> = {
      [moduleFile]: 'export const SHADE = 1;\n',
      [consumerFile]:
        "import * as palette from './palette.js';\nexport const use = (): number => palette.SHADE;\n",
    };
    const fake = (files: readonly string[]): Corpus => ({
      files,
      text: (path) => texts[path] ?? '',
      bindings: (path) => boundNames(texts[path] ?? ''),
      namespaces: (path) => namespaceImports(path, texts[path] ?? ''),
    });

    const withConsumer = auditModules(['viz/src/synthetic-control'], fake([moduleFile, consumerFile]));
    expect(withConsumer.symbols.map((symbol) => symbol.key)).toContain('synthetic-control/SHADE');
    expect(withConsumer.uncalled.map((symbol) => symbol.key)).not.toContain(
      'synthetic-control/SHADE',
    );

    const withoutConsumer = auditModules(['viz/src/synthetic-control'], fake([moduleFile]));
    expect(withoutConsumer.uncalled.map((symbol) => symbol.key)).toContain(
      'synthetic-control/SHADE',
    );
  });

  it('positive control: unreadable input throws — it never skips (R24)', () => {
    // The repository grep silently skips NUL-carrying files (five existed until f78dc42), and a
    // scanner that skipped one would classify its exports by omission. readSource must refuse
    // both a NUL byte and an invalid UTF-8 sequence, loudly.
    const dir = mkdtempSync(join(tmpdir(), 'viz-deadcode-'));
    try {
      const nulFile = join(dir, 'nul.ts');
      writeFileSync(nulFile, Buffer.from([0x65, 0x00, 0x66]));
      expect(() => readSource(nulFile)).toThrow(/NUL/);

      const mangledFile = join(dir, 'mangled.ts');
      writeFileSync(mangledFile, Buffer.from([0xff, 0xfe, 0x80]));
      expect(() => readSource(mangledFile)).toThrow(/UTF-8/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /*
   * The header's limits 1 and 2, pinned so the audit's silence is never read as coverage.
   *
   * main.ts's export *clause* (`export { applyDeepLink, randomSeed, SPEEDS }` at :1393, no
   * `from`) is invisible to both halves of the scanner — no start-of-line declaration for the
   * symbol walk, no `from`-clause for boundNames — and `let bankFilter` (:283, GAPS.md's
   * thirteenth dead seam) is not an export at all. Neither may silently drift into looking
   * audited.
   */
  it('states what it cannot see: main.ts’s export clause and the bank-filter binding', () => {
    const keys = symbols.map((symbol) => symbol.key);
    for (const invisible of ['dev/applyDeepLink', 'dev/randomSeed', 'dev/SPEEDS']) {
      expect(keys, `${invisible} was export-clause-only; if it moved to a declaration-form ` +
          'export it is now genuinely audited and this pin (plus the header) needs updating',
      ).not.toContain(invisible);
    }
    expect(keys, 'bankFilter is a let-binding, not an export; the instrument for a ' +
        'written-never-read binding is the driven run-change test (§ D177), not this audit',
    ).not.toContain('dev/bankFilter');

    // And the half a name-binding query CAN answer: nothing non-test in this package imports
    // the three export-clause symbols — they exist for main.test.ts. Scoped to viz because the
    // query is name-keyed and the CLI has an unrelated `randomSeed` of its own; only a file in
    // this package can be importing *these*. A file appearing here means one of them gained a
    // real consumer and should graduate to a declaration-form export the audit can see.
    for (const name of ['applyDeepLink', 'randomSeed', 'SPEEDS']) {
      expect(
        nonTestImportersOf(scope, name, {
          exclude: (path) => !path.replace(/\\/g, '/').includes('/viz/src/'),
        }),
      ).toEqual([]);
    }
  });
});
