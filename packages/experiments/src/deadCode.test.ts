/**
 * **The dead-code audit for the rest of `experiments`, with its scope derived from disk.**
 *
 * `packages/server` and `packages/viz` derive their audit lists from the tree. `packages/core`
 * started doing so in `6bf548d` (`core/src/dispatch/deadCode.test.ts`, DECISIONS.md § D836), and
 * the finding that justified it was not a symbol — it was a *directory*: `core/src/dispatch`, 137
 * exports across the load-bearing dispatch core, had been outside the audit for as long as the
 * audit had existed, and **no assertion in that file could have said so**, because a hand-written
 * list cannot report what is missing from it.
 *
 * `packages/experiments` had the same defect and had it worse. Four audits, each naming its own
 * directory by hand:
 *
 * | file | names |
 * |---|---|
 * | `tuning/deadCode.test.ts` | `tuning/{search,space,report}` |
 * | `runner/deadCode.test.ts` | `runner` |
 * | `teaching/deadCode.test.ts` | `teaching` |
 * | `fuzz/deadCode.test.ts` | `fuzz` |
 *
 * Six directories out of ten. The four that nobody named hold **759 exports** — `benchmark/` 565,
 * `reports/` 106, `validation/` 55, `oracle/` 33 — and **none of them had ever been asked the
 * question.** `benchmark/` is where this project's published statistical intervals live, and
 * `CLAUDE.md` records three figures that did not reproduce from the code meant to produce them.
 * An unaudited `benchmark/` is where that class hides.
 *
 * ## What this file does, and what it deliberately does not
 *
 * It derives {@link DERIVED_SCOPE} from the tree, subtracts the six directories the four earlier
 * audits already cover, and audits the remainder. It does **not** merge those four into itself:
 * each carries an allowlist argued symbol by symbol over several waves, and rewriting four files'
 * reasoning to gain one `describe` block would trade evidence for tidiness. What it takes from
 * them instead is the property that matters — the derivation asserts, in both directions, that
 * *every* directory under `experiments/src` is either audited here, audited by one of those four,
 * or holds no auditable file at all. A directory added tomorrow is covered by an audit nobody had
 * to remember to widen.
 *
 * ## The three registers, and why there are three rather than one allowlist
 *
 * 780 exports came into scope at once and **83 of them have no caller**. Calling all 83 "dead"
 * would be crying wolf; calling all 83 "public API" would be the lie `core`'s audit refused when
 * it declined to file `termReferenceScale` as surface (§ D836: *a public-API claim about a symbol
 * nothing outside the package can reach is false*). So they are split by a property that was
 * **measured rather than judged** — how far each symbol can actually be reached:
 *
 * - {@link PACKAGE_SURFACE} (25) — on `experiments/src/index.ts` or `browser.ts`, so a consumer
 *   outside this package *can* import it. That is reachability, and **reachability is not use**;
 *   these are recorded, not absolved.
 * - {@link SUITE_ONLY} (52) — on no package barrel, so nothing outside `experiments` can reach it
 *   at all, and every reference it has is a `*.test.ts` in this package.
 * - {@link DEAD_CANDIDATES} (6) — no reference anywhere in the tree. Not a barrel, not a test.
 *
 * All three are findings. The gradient is the deliverable: a reader triaging this register should
 * start at the bottom, and the six at the bottom were each checked by hand before being written
 * down. Every one of them is named only by `{@link}` tags inside its own file — which is precisely
 * the shape `callers.test-helper.ts`'s scanner exists to see through.
 *
 * ## The one thing the tree cannot check about a derivation
 *
 * A dead-code audit cannot test its own scope against the tree it audits, because the tree holds
 * no directory that *ought* to come back as a finding. So the control at the bottom of this file
 * builds one: a synthetic package in a temporary root, with a module the list does not name
 * holding a single uncalled export, and the audit is required to report it **with no list in this
 * file edited**. That is why {@link auditModules} grew a `root` parameter.
 *
 * DECISIONS.md § D838.
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PACKAGES_DIR, auditModules, corpus } from './tuning/callers.test-helper.js';

/* -------------------------------------------------------------------------- *
 * The derivation
 * -------------------------------------------------------------------------- */

/** Every directory under `root/moduleRelative`, relative to `root`, at any depth. */
function directoriesUnder(moduleRelative: string, root: string = PACKAGES_DIR): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (!statSync(path).isDirectory()) continue;
      out.push(relative(root, path).replace(/\\/g, '/'));
      visit(path);
    }
  };
  visit(join(root, moduleRelative));
  return out;
}

/**
 * The files in `moduleRelative` **itself** that this audit can read an export site out of: not a
 * test, not a barrel, and directly in the directory rather than under it — because the symbol walk
 * is per-directory (`auditModules` compares `dirname(path)`), so a parent never covers a child.
 *
 * `index.ts` is excluded here for the same reason it is excluded as a caller, and that exclusion
 * is load-bearing rather than tidy: `experiments/src` holds **only** `index.ts` and `browser.ts`,
 * so the package root contributes no export site at all. A count taken with a looser pattern reads
 * eight exports there; every one of them is an `export type { … } from …` re-export clause, which
 * is a barrel line rather than a declaration. The scanner's own `EXPORTED` pattern requires an
 * identifier after `type`, so it never matched them, and the eight were never in scope to lose.
 */
function auditableFilesIn(moduleRelative: string, root: string = PACKAGES_DIR): readonly string[] {
  const dir = join(root, moduleRelative);
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.d.ts'))
    .map((entry) => join(dir, entry))
    .filter((path) => {
      const unix = path.replace(/\\/g, '/');
      const base = unix.slice(unix.lastIndexOf('/') + 1);
      const isTest = base.endsWith('.test.ts') || base.endsWith('.test-helper.ts');
      const isBarrel = base === 'index.ts' || unix.endsWith('/src/browser.ts');
      return !isTest && !isBarrel;
    })
    .map((path) => relative(root, path).replace(/\\/g, '/'))
    .sort();
}

/** Every directory of `experiments/src` that holds at least one auditable file — derived. */
function deriveScope(root: string = PACKAGES_DIR, base = 'experiments/src'): readonly string[] {
  return [base, ...directoriesUnder(base, root)]
    .filter((moduleRelative) => auditableFilesIn(moduleRelative, root).length > 0)
    .sort();
}

const DERIVED_SCOPE = deriveScope();

/**
 * **The six directories the four earlier audits cover, and the file that names each.**
 *
 * Two jobs, and the second is the one worth reading. The first is subtraction: these are audited
 * elsewhere, so auditing them again here would mean a second allowlist for the same symbols and
 * two places to keep in step.
 *
 * The second is that it is a **floor**, in the sense `core`'s
 * `MODULES_AUDITED_BEFORE_THE_DERIVATION` is one. {@link DERIVED_SCOPE} is computed from disk, and
 * a derivation that broke would narrow *silently* — an empty scope passes every other assertion in
 * this file. So the union of these six and what this file audits is asserted to be the whole of
 * the derived scope, and each of the six is asserted to still be in it.
 *
 * And because the entries are hand-written, each is checked against the file it claims to mirror:
 * the audit named in the value must literally contain the directory in the key. A directory moved
 * between audits, or dropped from one, shows up here as a failure rather than as silent
 * double-coverage or silent no-coverage.
 */
const COVERED_BY_AN_EARLIER_AUDIT: Readonly<Record<string, string>> = Object.freeze({
  'experiments/src/tuning/search': 'experiments/src/tuning/deadCode.test.ts',
  'experiments/src/tuning/space': 'experiments/src/tuning/deadCode.test.ts',
  'experiments/src/tuning/report': 'experiments/src/tuning/deadCode.test.ts',
  'experiments/src/runner': 'experiments/src/runner/deadCode.test.ts',
  'experiments/src/teaching': 'experiments/src/teaching/deadCode.test.ts',
  'experiments/src/fuzz': 'experiments/src/fuzz/deadCode.test.ts',
});

/** What this file audits: the derived scope, less what an earlier audit already covers. */
const AUDITED_MODULES: readonly string[] = DERIVED_SCOPE.filter(
  (moduleRelative) => !(moduleRelative in COVERED_BY_AN_EARLIER_AUDIT),
);

/* -------------------------------------------------------------------------- *
 * The registers
 * -------------------------------------------------------------------------- */

/**
 * **Reachable from outside the package, and called by nothing.**
 *
 * Every key here is re-exported by `experiments/src/index.ts` or `experiments/src/browser.ts`, so
 * `cli`, `viz` or a consumer outside this repository can import it. That is the *only* claim these
 * entries make, and it is a weak one on purpose: `CLAUDE.md`'s standing requirement says
 * reachability was true of all eleven dead seams, and this list is named `PACKAGE_SURFACE` rather
 * than `PUBLIC_API_ONLY` so that nobody reads it as an absolution.
 *
 * **The twelve study renderers are the substantive finding in this block, and they are one
 * finding rather than twelve.** `benchmark/` splits into study modules that drive themselves —
 * `counterweightOptimum.ts`, `descentCapHeight.ts` and `diversionDetourStudy.ts` each end in a
 * `process.stdout.write(format…(study))` block, which is a real caller in the symbol's own file —
 * and study modules that do not. Every renderer below belongs to a module in the second group, so
 * **no shipped driver prints any of them**: `regeneratePins.ts` imports the `run*` entry points
 * and reads their *figures*, never their prose. A formatter nothing prints is not the same defect
 * as a behaviour nothing runs — it changes no result — but it is the same shape, and the
 * disposition is symmetric: give the module a self-driving block like its three siblings have, or
 * delete the renderer.
 */
const PACKAGE_SURFACE: Readonly<Record<string, string>> = Object.freeze({
  /* -- Study renderers with no driver that prints them. See the block comment above. */
  'benchmark/formatBenchmark': 'renders the main benchmark table; no driver prints it',
  'benchmark/formatTailStudy': 'renders the tail study; no driver prints it',
  'benchmark/formatCapacityReassignment': 'renders the stage-5 study; no driver prints it',
  'benchmark/formatDisclosureStudy': 'renders the 6a disclosure study; no driver prints it',
  'benchmark/formatAccessControlStudy': 'renders the access-control study; no driver prints it',
  'benchmark/formatDestinationLiveness': 'renders the destination liveness rows; no driver prints it',
  // A column-width helper for the renderers above: dead for the same reason they are, one level
  // down. It is listed separately rather than folded into them because it would survive the
  // disposition of any one of them and must not disappear from the register with it.
  'benchmark/padVerdict': 'pads a verdict column for renderers that nothing calls',

  /* -- Result and id constructors on the barrel. Each builds a value some study already builds
     inline, so the exported form is the one a consumer outside this package would reach for. */
  'benchmark/cellResult': 'builds a MatrixCellResult from an experiment result',
  'benchmark/disclosureArm': 'the disclosure study’s arm-id constructor',
  'benchmark/disclosureCase': 'the disclosure study’s case-id constructor',
  'benchmark/armsWithVerdict': 'selects a benchmark case’s arms by verdict; a report-side filter',
  'benchmark/requireAuctionProfile': 'resolves the auction profile out of a LoadedConfig or throws',

  /* -- The oracle's reconciliation pair. `analytical/` owns the closed form; these two reconcile a
     measured round trip against it and price the constant-speed simplification. The oracle's own
     three suites are their only consumers today, which is why they are here rather than absent. */
  'oracle/reconcileRoundTrip': 'reconciles a measured round trip against the closed form',
  'oracle/constantSpeedPenalty': 'prices the closed form’s constant-speed simplification',

  /*
   * -- `reports/persistence.ts`'s writer half, and this block is a **known** state rather than a
   * new one. `CLAUDE.md` § Phase 9 already records it, in as many words, from `core`'s § D395:
   * *"Nothing writes a run record on a shipped path at all: `createStoredRun`, `serializeRunSet`,
   * `writeRunSetFile` and `appendRunToFile` are reachable only from tests."* That paragraph was
   * written while this directory was outside every audit, so the claim lived in prose with no
   * instrument behind it. It has one now, and the instrument agrees with the prose — which is the
   * outcome worth having either way round.
   *
   * The reading half is **not** in this state and the two are not lumped together:
   * `validation/goldenChild.ts` is a bare-`node` executable rather than a `.test.ts`, and it calls
   * `readRunSetFile` and `replaySimulationConfig` for real. Invariant 5's replay clause is
   * discharged there.
   */
  'reports/createStoredRun': 'builds a run record; nothing writes one on a shipped path (§ D395)',
  'reports/writeRunSetFile': 'writes a run set; nothing writes one on a shipped path (§ D395)',
  'reports/appendRunToFile': 'appends a run; nothing writes one on a shipped path (§ D395)',
  'reports/storedRunFingerprint': 'fingerprints a stored run; the writer half has no shipped caller',

  /* -- Re-analysis and replay: read a persisted run set back and re-derive or re-verify it. The
     suites that exercise the persistence round trip are their only consumers. */
  'reports/reanalyzeRunSet': 're-derives summaries from a persisted run set',
  'reports/reanalyzeVerified': 're-derives and verifies in one call',
  'reports/verifySummaryFingerprint': 'verifies a summary against its recorded fingerprint',
  'reports/assertIdenticalReplay': 'asserts a replay reproduced its original bit for bit',

  /* -- Comparison and statistics surface. */
  'reports/comparisonReportFromRunSet': 'builds a comparison report from a persisted run set',
  'reports/formatComparisonReport': 'renders a comparison report; no driver prints it',
  'reports/normalQuantile': 'the normal quantile; the published estimators use Student’s t',
});

/**
 * **Not reachable from outside the package, and every reference is one of this package's own
 * `*.test.ts` files.**
 *
 * A test is not a caller — *"every caller was one of its own tests"* is the literal description of
 * the fifth dead seam — so none of these may be filed as surface. What separates them from
 * {@link DEAD_CANDIDATES} is that something does consume them, and the honest thing is to say what.
 *
 * Three groups, and they want different dispositions:
 *
 * 1. **Pin and derivation instruments** (`checkPinned`, `describeMismatches`, `derivedFrontRows`,
 *    `derivedCoverageForms`, `withdrawnCoverageForms`, `derivedLunchCounts`, `checkFrontPins`,
 *    `STUDY_ENTRY_POINTS`, `UNPINNED_INTERVALS`). These are the machinery behind *"if you publish
 *    a number, pin it to the run that produced it"*, and their consumer being a suite **is the
 *    design** — the pin check is a test, and there is nowhere else for it to run. `core`'s audit
 *    files exactly this shape (`'dispatch/tunablePathsOf': 'the guard is its consumer by design'`).
 *    They are listed rather than excused so that the claim is visible and can be re-read.
 *
 * 2. **Test harnesses that are not named like one.** `validation/harness.ts`, `golden.ts`,
 *    `perfInstrument.ts`, `serviceMode.ts` and `syntheticBuilding.ts` are consumed by nothing but
 *    `validation/*.test.ts`, and `oracle/upPeakCase.ts`'s two entries are the same shape. They are
 *    not `.test-helper.ts` files, so the scanner reads their exports as production exports with no
 *    production caller — which is not wrong, exactly: **twenty-four of the fifty-two entries below
 *    are five files' worth of test scaffolding sitting in the production namespace.** Renaming
 *    them to `.test-helper.ts` would take them out of scope honestly and is the obvious
 *    disposition; it is also a rename of five files that several suites import, which is a change
 *    in its own right and is reported rather than taken here.
 *
 * 3. **Study internals** — arm builders, cell constructors, seed constants and renderers that only
 *    their own study's suite touches. Each wants the same disposition as the renderers in
 *    {@link PACKAGE_SURFACE}: a driver, or deletion.
 */
const SUITE_ONLY: Readonly<Record<string, string>> = Object.freeze({
  /* ---- 1. Pin and derivation instruments; the suite is the consumer by design ---- */
  'benchmark/checkPinned': 'the pin check; seventeen study suites call it',
  'benchmark/describeMismatches': 'renders a pin mismatch; the same seventeen suites',
  'benchmark/STUDY_ENTRY_POINTS': 'the study/interval classification; index.test.ts and phaseStatus.test.ts read it',
  'benchmark/UNPINNED_INTERVALS': 'the stated gap: intervals Layer B cannot re-derive',
  'benchmark/checkFrontPins': 'the Pareto front’s pin check; matrix.test.ts',
  'benchmark/derivedFrontRows': 'Layer B for the front rows; matrixFront.test.ts',
  'benchmark/frontMembershipCells': 'the cells an arm is on the front at; matrixFront.test.ts',
  'benchmark/derivedCoverageForms': 'Layer B for the access-control coverage rows',
  'benchmark/withdrawnCoverageForms': 'the withdrawn coverage rows, so a revival is caught',
  'benchmark/coveragePinOf': 'resolves a coverage row’s pin; accessControl.test.ts',
  'benchmark/coverageKey': 'the coverage row key; accessControl.test.ts',
  'benchmark/derivedLunchCounts': 'Layer B for the lunch-two-way counts',
  'benchmark/PINNED_LUNCH_COUNTS': 'the lunch-two-way counts as published',

  /* ---- 2. Test scaffolding in the production namespace ---- */
  // -- `validation/harness.ts`: the gate operating point and the paired-comparison helpers every
  //    validation suite runs through.
  'validation/GATE_BUILDING': 'the gate operating point’s building; seven suites',
  'validation/GATE_SEED': 'the gate operating point’s seed; eight suites',
  'validation/GATE_REPLICATIONS': 'the gate operating point’s budget; five suites',
  'validation/midtownUpPeakAt': 'a Midtown up-peak arm at a given rate; operatingPoint.test.ts',
  'validation/gardenAt': 'a garden-apartments arm at a given rate; operatingPoint.test.ts',
  'validation/productionStoppingRule': 'the shipped half-width rule, re-exported for the suites',
  'validation/measureCrnBenefit': 'the CRN variance-reduction study; its own suite',
  'validation/formatEstimate': 'renders an estimate for the validation suites’ output',
  // -- `validation/golden.ts`: the golden-run manifest and its perturbation table.
  'validation/goldensFor': 'the golden specs for a tier; goldenRuns.test.ts, perfSweep.test.ts',
  'validation/goldenSimulationConfig': 'builds a golden’s config; the same two suites',
  'validation/deepRequested': 'the deep-tier gate; goldenRuns.test.ts, determinismMatrix.test.ts',
  'validation/envelopeKeyPaths': 'the stored config’s key paths; goldenRuns.test.ts',
  'validation/UNPERTURBED': 'the unperturbed baseline digests; goldenRuns.test.ts',
  'validation/FIELD_PERTURBATIONS': 'the perturbation table; goldenRuns.test.ts',
  'validation/schemaVersionLine': 'the stored-run schema version; goldenRuns.test.ts',
  // -- `validation/perfInstrument.ts`: the scaling-measurement instrument.
  'validation/medianSeconds': 'median of repeated timings; perfScaling.test.ts',
  'validation/fitPowerLaw': 'fits a power law to a scaling sweep; two perf suites',
  'validation/formatFit': 'renders a power-law fit; two perf suites',
  'validation/heapAround': 'measures heap delta around a call; perfSweep.test.ts',
  // -- `validation/serviceMode.ts` and `syntheticBuilding.ts`.
  'validation/seenAsMode': 'injects a service mode; adversarial.test.ts',
  'validation/watchDispatch': 'records dispatch decisions; adversarial.test.ts',
  'validation/syntheticBuilding': 'builds a synthetic tower; adversarial and perfScaling suites',
  // -- `oracle/upPeakCase.ts`: the up-peak measurement the three oracle suites run.
  'oracle/measureUpPeak': 'the up-peak measurement; three oracle suites',
  'oracle/completedOf': 'reads a measurement’s completed round trips; the same three',

  /* ---- 3. Study internals: arm builders, cells, seeds and renderers ---- */
  'benchmark/formatDispatchContrast': 'renders the 6b dispatch contrast; only its suite',
  'benchmark/formatDoubleDeckStudy': 'renders the double-deck study; only its suite',
  'benchmark/formatMixedUseHighRise': 'renders the mixed-use study; only its suite',
  'benchmark/dispatchPoint': 'the 6b contrast’s operating point',
  'benchmark/downPeakCell': 'the down-peak study’s cell constructor',
  'benchmark/gateContrast': 'the down-peak study’s gate contrast',
  'benchmark/doubleDeckPoint': 'the double-deck study’s operating point',
  'benchmark/mixedUsePoint': 'the mixed-use study’s operating point',
  'benchmark/resolutionTable': 'the mixed-use study’s resolution table',
  'benchmark/landingPanelCell': 'the landing-panel study’s cell constructor',
  'benchmark/landingPanelPair': 'the landing-panel study’s arm pair',
  'benchmark/LANDING_PANEL_GATE': 'the landing-panel study’s gate',
  'benchmark/WEIGHT_GRID': 'the detour study’s weight grid',
  'benchmark/DETOUR_TUNING_SEED': 'the detour study’s tuning seed, disjoint from its study seed',
  'benchmark/balanceCost': 'the counterweight study’s balance cost',
});

/**
 * **No reference anywhere in the tree — not a caller, not a barrel, not a test.**
 *
 * Six, and each was checked by hand rather than taken from the scan, because this is the one
 * register where being wrong is expensive. Every reference `grep` reports for each of them is a
 * `{@link}` tag or a prose mention **inside its own file**, plus its own `dist/` build output —
 * which is exactly the shape `callers.test-helper.ts`'s scanner exists to see through, arriving
 * six times in one directory.
 *
 * **The first entry is the one to read, and it is a § D227 stale refusal rather than a plain
 * absence.** `derivedPublishedForms()` says in its own docstring that *"the set is the vocabulary
 * Layer B checks published literals against"*, and names both precisions it renders at —
 * *"2 dp and 3 dp, because `index.ts` uses both … a guard that assumed one would reject the other
 * as undeclared."* Layer B is `benchmark/published.test.ts`. It does not call this function. It
 * has its own `derivableForms()` at lines 106–120, which renders the same pins at **1 to 5**
 * decimal places and maps each form back to the pin that produced it — strictly wider, and live.
 * So the dead symbol is not merely uncalled: it carries a sentence telling the next reader that it
 * is the vocabulary of a guard that built its own, and a narrower one than the guard uses. That is
 * the class `CLAUDE.md` calls worse than a dead seam, because a dead seam only does nothing.
 *
 * The disposition is **deletion**, and it is stated rather than taken: `published.ts` is the file
 * the whole pin guard rests on, and removing fourteen lines from it belongs in a change somebody
 * reviews on its own terms rather than riding in on an audit's first widening. Nothing here is
 * deleted to make a register smaller.
 */
const DEAD_CANDIDATES: Readonly<Record<string, string>> = Object.freeze({
  'benchmark/derivedPublishedForms':
    'names Layer B as its consumer; Layer B built its own, wider, at published.test.ts:106',
  'benchmark/formatDownPeakDestinationStudy':
    'the one study renderer not even its own suite references',
  'benchmark/gateCellsOf': 'the mixed-use gate cells; referenced by nothing',
  'benchmark/midtownDownPeakAt':
    'a Midtown down-peak arm; named only by counterweightOptimum.ts’s prose',
  'benchmark/PILOT_SEED':
    'the double-deck pilot seed; three {@link} tags in its own file and no binding',
  'validation/CrnStudyArm': 'the CRN study’s arm type; CrnStudy and CrnStudyInput are used, this is not',
});

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('every export of the rest of experiments/ has a caller or a recorded reason', () => {
  const { symbols, uncalled } = auditModules(AUDITED_MODULES);

  it('names every directory under experiments/src — derived from the tree, not from memory', () => {
    // Both directions. Every directory on disk is either in the derived scope or holds no
    // auditable file, and the second half is re-derived here rather than asserted: an exclusion
    // whose reason is not recomputed is a hand-written list wearing a derivation's clothes.
    const onDisk = ['experiments/src', ...directoriesUnder('experiments/src')].sort();
    const excluded = onDisk.filter((moduleRelative) => !DERIVED_SCOPE.includes(moduleRelative));
    expect([...DERIVED_SCOPE, ...excluded].sort()).toEqual(onDisk);
    for (const moduleRelative of excluded) {
      expect(
        auditableFilesIn(moduleRelative),
        `${moduleRelative} is excluded from the audit, so it must hold no auditable file`,
      ).toEqual([]);
    }
    // And what is excluded today, named — so a directory falling out of scope is a diff on this
    // line rather than a silent narrowing. `experiments/src` holds only `index.ts` and
    // `browser.ts`; `experiments/src/tuning` holds only its barrel and the three submodules;
    // `experiments/src/validation/golden` holds `manifest.json` and no TypeScript at all.
    expect(excluded).toEqual([
      'experiments/src',
      'experiments/src/tuning',
      'experiments/src/validation/golden',
    ]);

    // The floor. A derivation that returned nothing would pass every other assertion in this file,
    // so the six directories an earlier audit covers must still be in the derived scope, and the
    // union of those six with what this file audits must be the whole of it.
    for (const moduleRelative of Object.keys(COVERED_BY_AN_EARLIER_AUDIT)) {
      expect(DERIVED_SCOPE, 'the audited scope may widen and may never narrow').toContain(
        moduleRelative,
      );
    }
    expect([...AUDITED_MODULES, ...Object.keys(COVERED_BY_AN_EARLIER_AUDIT)].sort()).toEqual(
      [...DERIVED_SCOPE].sort(),
    );

    // The four this widening brought in, named, because they are the whole point of it.
    expect([...AUDITED_MODULES].sort()).toEqual([
      'experiments/src/benchmark',
      'experiments/src/oracle',
      'experiments/src/reports',
      'experiments/src/validation',
    ]);
  });

  it('checks the hand-written half against the files it claims to mirror', () => {
    // COVERED_BY_AN_EARLIER_AUDIT is the one list here a derivation does not produce, so each
    // entry is checked against the audit it names: that file must literally contain the directory.
    // A directory moved between audits, or dropped from one, is a failure rather than silent
    // double-coverage or silent no-coverage.
    for (const [moduleRelative, auditFile] of Object.entries(COVERED_BY_AN_EARLIER_AUDIT)) {
      const source = readFileSync(join(PACKAGES_DIR, auditFile), 'utf8');
      expect(source, `${auditFile} must still name ${moduleRelative}`).toContain(
        `'${moduleRelative}'`,
      );
    }
  });

  it('scans every audited module and finds the exports it is supposed to be auditing', () => {
    // A scanner that silently matched nothing would pass every assertion below. The floor is the
    // 759 exports this widening brought into scope, less a margin for ordinary churn.
    expect(symbols.length).toBeGreaterThan(700);
    for (const key of [
      // `benchmark/` — the studies whose intervals this project publishes.
      'benchmark/runBenchmark',
      'benchmark/runMatrix',
      'benchmark/runAccessControlStudy',
      'benchmark/PINNED_ESTIMATES',
      // `reports/` — the estimator and the persistence round trip.
      'reports/readRunSetFile',
      'reports/pairedDifferenceEstimate',
      // `oracle/` — the closed-form comparison.
      'oracle/deriveUpPeakCase',
      // `validation/` — the golden manifest.
      'validation/goldenManifest',
    ]) {
      expect(symbols.map((symbol) => symbol.key)).toContain(key);
    }
  });

  it('has no export that is dead — no caller and no recorded reason to have none', () => {
    const unexplained = uncalled.filter(
      (symbol) =>
        !(symbol.key in PACKAGE_SURFACE) &&
        !(symbol.key in SUITE_ONLY) &&
        !(symbol.key in DEAD_CANDIDATES),
    );
    expect(
      unexplained.map((symbol) => `${symbol.key} (${symbol.file})`),
      'these exports have no importer anywhere and appear in none of this file’s three registers. ' +
        'Either something should be calling them — the defect this repository has shipped eleven ' +
        'times — or they belong in the register that matches how far they can be reached',
    ).toEqual([]);
  });

  /*
   * **The counts, and the only honest reason any of them may go up.**
   *
   * All three opened at their current size in one sitting, because the audit looked at four
   * directories it had never looked at. That is the same reason `core`'s register went 3 → 5 for
   * the first time in its history (§ D836) and it is the only legitimate one: a register growing
   * because the instrument widened is the instrument working. What it must not do is grow because
   * a symbol was added and nobody wired it, which is why each number stays a literal rather than
   * `Object.keys(…).length` — the set assertions above already pin the membership, so a computed
   * length here would be a tautology and an eighty-fourth finding would land silently.
   *
   * These numbers go **down**. `PACKAGE_SURFACE` falls when a driver prints a renderer or a
   * consumer imports a constructor; `SUITE_ONLY` falls when the five harness files are renamed to
   * `.test-helper.ts` (which would take twenty-four of them out of scope, honestly, in one commit)
   * or when a study internal is wired or deleted; `DEAD_CANDIDATES` falls by deletion.
   */
  it('names every finding, and the three counts are the ones recorded', () => {
    for (const [label, register, size] of [
      ['PACKAGE_SURFACE', PACKAGE_SURFACE, 25],
      ['SUITE_ONLY', SUITE_ONLY, 52],
      ['DEAD_CANDIDATES', DEAD_CANDIDATES, 6],
    ] as const) {
      const open = uncalled.filter((symbol) => symbol.key in register);
      expect(open.map((symbol) => symbol.key).sort(), label).toEqual(Object.keys(register).sort());
      expect(
        open.length,
        `${label}: dispose a finding and lower this number; never raise it silently. It currently holds ${Object.keys(register).length}`,
      ).toBe(size);
    }
    // And the total, so that a finding moved between registers is visible as a move rather than as
    // two independent edits that happen to cancel.
    expect(uncalled.length, 'the widening opened 83 findings across the four new directories').toBe(83);
  });

  it('keeps the registers honest: no entry may outlive the condition that justified it', () => {
    const uncalledKeys = new Set(uncalled.map((symbol) => symbol.key));
    const known = new Set(symbols.map((symbol) => symbol.key));
    const stale = [
      ...Object.keys(PACKAGE_SURFACE),
      ...Object.keys(SUITE_ONLY),
      ...Object.keys(DEAD_CANDIDATES),
    ].filter((key) => !uncalledKeys.has(key));
    expect(
      stale.map((key) => `${key} — ${known.has(key) ? 'now has a caller' : 'no longer exists'}`),
      'a register that keeps entries after their reason lapses is where dead code goes to be ' +
        'forgotten. Delete the entry (the symbol is live, or gone) rather than the assertion',
    ).toEqual([]);
  });

  it('counts a barrel re-export as reachability and never as a caller', () => {
    // The distinction the whole file turns on, and `experiments` is where it bites hardest: every
    // one of PACKAGE_SURFACE's twenty-five keys is on `index.ts` or `browser.ts`, and all
    // twenty-five are uncalled. If a barrel counted, this register would be empty and the audit
    // would report a clean sweep over the package's published surface.
    for (const key of Object.keys(PACKAGE_SURFACE)) {
      expect(uncalled.map((symbol) => symbol.key), key).toContain(key);
    }
    // …while the entry points the studies actually run through must read live, or the audit is
    // inverted and its silence means nothing.
    for (const key of [
      'benchmark/runBenchmark',
      'benchmark/runMatrix',
      'benchmark/runAccessControlStudy',
      'reports/readRunSetFile',
      'oracle/deriveUpPeakCase',
    ]) {
      expect(uncalled.map((symbol) => symbol.key), key).not.toContain(key);
    }
  });

  /*
   * **The scanner's blind spot, measured rather than assumed.**
   *
   * `boundNames` reads named bindings — `import { x } from …` — and cannot see a namespace import
   * (`import * as ns from …; ns.x()`). A non-test file reaching an audited export that way would
   * make the symbol read dead while being called, which is the audit's *false positive* direction
   * and the one that wastes a reader's afternoon.
   *
   * It does not happen here, and that is a measurement rather than an assumption. Two ways a
   * namespace import could reach one of these exports, and both are checked: a file **inside**
   * `experiments/src` importing a relative path, and any file importing the package by name. Every
   * namespace import in the tree that is not in a `*.test.ts` file fails both — the only one
   * inside this package is `tuning/space/collect.ts:58`, which reaches `@elevator-sim/core`, and
   * the only other is `viz/src/render/canvas.ts`, which reaches its own sibling `./tokens.js`.
   *
   * The predicate is deliberately narrower than *"no namespace import anywhere"*, which is what
   * this control asserted when it was first written: it went red on `canvas.ts`, a file that
   * cannot reach `experiments` at all. A control that fails on something outside its own subject
   * is a control somebody will delete rather than read.
   */
  it('positive control: no non-test file reaches an experiments export by namespace import', () => {
    const scope = corpus();
    const offenders = scope.files
      .filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test-helper.ts'))
      .filter((path) => {
        const inExperiments = path.replace(/\\/g, '/').includes('/experiments/src/');
        return [
          ...scope.text(path).matchAll(/^import\s+\*\s+as\s+\w+\s+from\s*['"]([^'"]+)['"]/gm),
        ].some((match) => {
          const specifier = match[1] ?? '';
          if (specifier.startsWith('@elevator-sim/experiments')) return true;
          return inExperiments && specifier.startsWith('.');
        });
      })
      .map((path) => relative(PACKAGES_DIR, path));
    expect(
      offenders,
      'a namespace import is invisible to boundNames, so an export reached that way reads dead ' +
        'while being called. Teach the scanner about it before adding one',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The derivation's own control
 * -------------------------------------------------------------------------- */

/**
 * **The one thing the tree cannot check about a derivation.**
 *
 * Every assertion above runs against `packages/`, and `packages/` holds no directory that *ought*
 * to come back as a finding — so a derivation that quietly stopped finding new directories would
 * keep this file green forever. `core`'s audit has the same shape and closes the analogous hole by
 * building its input: its reader control writes a NUL-carrying file into a temporary directory and
 * requires the audit to refuse it.
 *
 * This is that control one level up. A synthetic package is built in a temporary root with two
 * modules — one whose export is imported by a sibling, one whose export is imported by nothing —
 * and the scope is **derived** from that root rather than listed. The audit must find the second
 * and not the first, **with no list in this file edited**, which is the precise property a
 * hand-written module list cannot have.
 *
 * Both directions matter. A derivation that returned every directory would also report the live
 * export as dead, so the negative half is asserted beside the positive one.
 */
describe('the derivation cannot silently stop finding directories', () => {
  it('a new module with one uncalled export turns the audit red, with no list edited', () => {
    const root = mkdtempSync(join(tmpdir(), 'experiments-deadcode-'));
    try {
      const pkg = join(root, 'probe', 'src');
      const live = join(pkg, 'alive');
      const fresh = join(pkg, 'newcomer');
      mkdirSync(live, { recursive: true });
      mkdirSync(fresh, { recursive: true });

      // A module whose export a sibling imports: live, and it must stay that way.
      writeFileSync(join(live, 'engine.ts'), 'export function runEngine(): number {\n  return 1;\n}\n', 'utf8');
      writeFileSync(
        join(live, 'driver.ts'),
        "import { runEngine } from './engine.js';\n\nexport function drive(): number {\n  return runEngine();\n}\n",
        'utf8',
      );
      // The newcomer: a directory no list names, holding one export nothing imports.
      writeFileSync(
        join(fresh, 'stranded.ts'),
        'export function strandedHelper(): number {\n  return 2;\n}\n',
        'utf8',
      );
      // A barrel naming it, so the control also proves reachability is not rescuing it — this is
      // the exact state all eleven dead seams were in.
      writeFileSync(join(fresh, 'index.ts'), "export { strandedHelper } from './stranded.js';\n", 'utf8');

      const scope = deriveScope(root, 'probe/src');
      expect(scope, 'the derivation must find the directory nobody named').toContain(
        'probe/src/newcomer',
      );
      expect(scope).toContain('probe/src/alive');

      const { symbols, uncalled } = auditModules(scope, corpus(root), root);
      const keys = uncalled.map((symbol) => symbol.key);
      expect(symbols.map((symbol) => symbol.key).sort()).toEqual([
        'alive/drive',
        'alive/runEngine',
        'newcomer/strandedHelper',
      ]);
      expect(keys, 'the newcomer’s uncalled export must be reported').toContain(
        'newcomer/strandedHelper',
      );
      // Both directions: an audit that reported everything would satisfy the line above.
      expect(keys, 'an imported export must not be reported').not.toContain('alive/runEngine');

      // And the negative control for the derivation itself: a directory with only a barrel and a
      // test contributes no export site, so it must not enter the scope.
      const empty = join(pkg, 'barrelonly');
      mkdirSync(empty, { recursive: true });
      writeFileSync(join(empty, 'index.ts'), "export { drive } from '../alive/driver.js';\n", 'utf8');
      writeFileSync(join(empty, 'thing.test.ts'), 'export const probe = 1;\n', 'utf8');
      expect(deriveScope(root, 'probe/src')).not.toContain('probe/src/barrelonly');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
