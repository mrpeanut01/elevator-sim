/**
 * **Every shipped run config reports its timeouts. Asserted, for the first time.**
 *
 * `core` defaults `SimulationConfig.onTimeout` to `'throw'`: a run that reaches its drain deadline
 * with people still in the system raises `SimulationError` rather than returning a plausible
 * number, and that default is right — a mean over a system that never cleared is the confident
 * nonsense this project exists to avoid.
 *
 * It is right for `core` and wrong for every surface a player touches. At the shipped traffic rates
 * three of the five viewer buildings routinely end a run with people still standing, and under
 * `'throw'` there is no recording at all: the shift ends with an exception and an empty canvas
 * instead of the picture of a building being outrun. So every shipped producer overrides it, and
 * `viz/src/dev/state.ts`, `viz/src/batch/runBatch.ts`, `cli/src/commands/run.ts` and
 * `server/src/leaderboard/verify.ts` each say so at length in their own comments.
 *
 * **The UI readiness audit of 2026-08-10 chased this as its headline worry and cleared it** — every
 * shipped entry point does pass `onTimeout: 'report'`, reproduced through the real CLI, which exits
 * `0` with a `SATURATED` banner and a suppressed AWT. It cleared it with a caveat, and the caveat is
 * this file's reason to exist:
 *
 * > *the property holds by hand-written literals in independent files with **no test asserting
 * > it**, and the new UI is the next surface.*
 *
 * A property that holds by repetition holds until somebody writes the next one.
 *
 * **The caveat's second clause is *nearly* true rather than true, and the correction is worth more
 * than the claim was.** There is one assertion: `viz/src/campaign/campaign.test.ts:252` reads
 * `expect(config.onTimeout).toBe('report')`, over every campaign stage. It is a good test, and it
 * covers **one producer of the twenty-three** — `campaign/stageRun.ts#demonstrationConfigFor` —
 * from inside that module's own suite, which is where a per-module assertion belongs and precisely
 * why it cannot be the guard for the other twenty-two. Nothing asks the question of the *set*.
 * The remaining twenty-six matches for `onTimeout` under the shipped packages' tests are fixtures
 * setting it for themselves, which is neither an assertion nor a claim about anything.
 *
 * ## The domain is derived, because the audit's own hand-written domain was wrong twice
 *
 * The audit says *"five hand-written literals in five files"* in its recommendations and *"nine
 * independent literals in nine files"* in its evidence table. Measured on the tree it was taken
 * from, by {@link scanFile}: **23 literals in 19 files.** Both counts were honest and both were
 * short, which is the argument for not writing a third one here. `src/index.test.ts` learned this
 * the expensive way — its Phase 7 block asserts five names and could not assert the sixth, because
 * the sixth (`measureEnergyLiveness`) did not exist when it was written and shipped dead — and its
 * fix is the pattern this file copies: take the domain from the tree, and a member added tomorrow
 * is in scope today.
 *
 * ## What is asserted
 *
 * 1. Every scanned file lexes cleanly, so the scan is evidence rather than a guess.
 * 2. The domain is non-empty, is bigger than any hand-written list, and contains every producer the
 *    audit named — so a scanner that stopped matching cannot pass by finding nothing.
 * 3. Every literal in it sets `onTimeout`, to an initializer that names `'report'` and never
 *    `'throw'`.
 * 4. The one literal that does not is named, and **its exemption is measured rather than argued**:
 *    `oracle/upPeakCase.ts` is reached from no non-test file in the tree, and its own barrel
 *    deliberately does not re-export it. If it is ever wired into a shipped path, this goes red.
 * 5. The difference the field makes is **run, not described**: the same configuration throws
 *    without it and returns `status: 'timed-out'` with it.
 *
 * The fifth is what keeps the other four from being a spelling test. A check that cannot fail is
 * not evidence, and neither is one that asserts a keyword whose consequence nothing measures.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SimulationError, loadConfig, runSimulation } from '@elevator-sim/core';
import type { SimulationConfig } from '@elevator-sim/core';

import { RUNNER_DEFAULTS } from '../runner/types.js';
import {
  PACKAGES_DIR,
  allSourceFiles,
  blankNonCode,
  configShape,
  scanFile,
  scannedFiles,
  type FileScan,
  type RunConfigLiteral,
} from './shippedRunConfig.test-helper.js';
import { DATA_DIR } from './harness.js';

/* -------------------------------------------------------------------------- *
 * The scan
 * -------------------------------------------------------------------------- */

/**
 * Every test here carries this. See `determinismMatrix.test.ts` for the long version: the
 * `experiments` project runs on vitest's 5 s default while `viz` has 300 s, and two of the tests
 * below run a real simulation.
 */
const TIMEOUT_MS = 300_000;

const SHAPE = configShape();
let FILES: readonly string[] = [];
let SCANS: readonly { readonly path: string; readonly scan: FileScan }[] = [];
let LITERALS: readonly RunConfigLiteral[] = [];

/*
 * The scan runs in a hook rather than at module scope, so it is governed by `hookTimeout` and shows
 * up as a named failure if it ever gets slow, instead of as an unattributed collection stall.
 */
beforeAll(() => {
  FILES = scannedFiles();
  SCANS = FILES.map((path) => ({ path, scan: scanFile(path, SHAPE) }));
  LITERALS = SCANS.flatMap(({ scan }) => scan.literals);
}, TIMEOUT_MS);

/** `where`, for a failure message that a reader can open. */
const at = (literal: RunConfigLiteral): string => `${literal.file}:${String(literal.line)}`;

/**
 * The one producer that leaves `onTimeout` at core's `'throw'`.
 *
 * `oracle/upPeakCase.ts` drives the Barney/CIBSE correctness oracle — the simulated side of the
 * closed-form round-trip-time comparison CLAUDE.md § *Correctness oracle* requires. A run that did
 * not drain is not a valid observation of an up-peak round trip, so a throw is the outcome that
 * comparison wants; the module's own docstring is about how hard it works to keep that from
 * happening (it rebuilds the bank as a building of its own precisely because the whole tower
 * *"does not drain inside its grace window at all"*).
 *
 * **It is named here, and justified below by a measurement rather than by that paragraph.** The
 * paragraph is my reading of somebody else's docstring, and this repository has a standing finding
 * about sentences that explain a mechanism nobody measured. What is measured is narrower and
 * sufficient: nothing outside a test reaches this module, so it is an instrument and not a surface.
 */
const INSTRUMENT_NOT_A_SURFACE = 'experiments/src/oracle/upPeakCase.ts';

describe('the scan is evidence', () => {
  /*
   * The audit's own instrument reported 2 483 of 2 496 cells clean before anyone checked whether it
   * could see anything: a car-id namespace mismatch had resolved 0 of 79 cars in all 8 buildings and
   * silently disabled four checks. The equivalent failure here is a mis-lexed regular expression
   * opening a brace that never closes, after which every literal in the file is invisible. So the
   * brace walk's finishing depth is asserted rather than trusted.
   */
  it('lexes every file it scans', () => {
    const broken = SCANS.filter(({ scan }) => scan.finalDepth !== 0).map(
      ({ path, scan }) => `${path} (depth ${String(scan.finalDepth)})`,
    );
    expect(broken, 'files whose braces do not balance were scanned wrong, not scanned').toEqual([]);
  });

  it('scans the whole tree outside core/, not a corner of it', () => {
    expect(FILES.length).toBeGreaterThan(200);
    /* One file per shipped package that runs a simulation, so a package dropping out is loud. */
    for (const prefix of ['cli/src/', 'viz/src/', 'server/src/', 'experiments/src/']) {
      expect(FILES.some((path) => path.includes(prefix))).toBe(true);
    }
  });

  it('takes SimulationConfig’s shape from the interface, not from a copy of it', () => {
    /* If the parse ever returns an empty member set every literal acquires a foreign key and the
       domain silently empties — the exact shape of the failure this block exists to prevent. */
    expect(SHAPE.members.size).toBeGreaterThan(20);
    expect(SHAPE.required).toEqual(['building', 'dispatcherProfile', 'trafficProfiles', 'seed']);
    expect(SHAPE.members.has('onTimeout')).toBe(true);
    /* Named because they are the two the discrimination rests on: `stage` is what makes a
       `DemonstrationInput` not a config, and `runId` is a real member that must not disqualify one. */
    expect(SHAPE.members.has('runId')).toBe(true);
    expect(SHAPE.members.has('stage')).toBe(false);
  });
});

describe('the domain is derived and non-vacuous', () => {
  it('finds more producers than any hand-written list in this repository', () => {
    /* The audit wrote five in one place and nine in another. Both were short. */
    expect(LITERALS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LITERALS.map((literal) => literal.file)).size).toBeGreaterThanOrEqual(15);
  });

  /**
   * The nine the audit's evidence table named, by file.
   *
   * Pinned individually rather than counted, because a count is satisfied by any twenty literals
   * and what this suite is for is these. If a producer is deleted or moved, the failure names it.
   */
  it.each([
    'cli/src/commands/run.ts',
    'experiments/src/runner/experiment.ts',
    'experiments/src/fuzz/run.ts',
    'viz/src/dev/state.ts',
    'viz/src/batch/runBatch.ts',
    'viz/src/campaign/stageRun.ts',
    'viz/src/menu/challenge.ts',
    'viz/src/honesty/run.ts',
    'server/src/leaderboard/verify.ts',
  ])('has %s in scope', (file) => {
    expect(LITERALS.map((literal) => literal.file)).toContain(file);
  });

  /*
   * And the fourteen the audit did not list, as a class rather than by name: `benchmark/` builds
   * configs by hand for every study that cannot go through the replication runner, and those are
   * producers by exactly the same definition. Naming the directory rather than its files keeps a
   * new study in scope on the day it lands.
   */
  it('has the benchmark studies in scope too, which no hand-written list had', () => {
    const studies = LITERALS.filter((literal) =>
      literal.file.startsWith('experiments/src/benchmark/'),
    );
    expect(studies.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * The one pre-existing assertion, pinned so this file's docstring cannot go stale about it.
   *
   * The audit reported *no test asserting it*; there is one, and it covers one producer. Saying so
   * in prose and nowhere else would be this repository's own recurring defect — a stated fact with
   * nothing holding it. If `campaign.test.ts` ever drops the line, this fails and the paragraph
   * above gets corrected on the same commit rather than three waves later.
   */
  it('does not claim to be the first assertion about onTimeout, because it is not', () => {
    const campaign = readFileSync(
      join(PACKAGES_DIR, 'viz/src/campaign/campaign.test.ts'),
      'utf8',
    );
    expect(campaign).toContain("expect(config.onTimeout).toBe('report')");
    expect(LITERALS.map((literal) => literal.file)).toContain('viz/src/campaign/stageRun.ts');
  });
});

describe('every shipped run config reports rather than throws on a timeout', () => {
  it('sets onTimeout at all', () => {
    /* Compared on the **file**, not on `file:line`. A line number here would make an unrelated edit
       above line 761 of the oracle fail this test with a message about `onTimeout`, which is the
       sort of brittleness that gets a guard deleted rather than read. */
    const silent = LITERALS.filter((literal) => literal.onTimeout === undefined).map(
      (literal) => literal.file,
    );
    expect(
      silent,
      'these object literals build a SimulationConfig and leave onTimeout at core’s `throw`, ' +
        'so a run that cannot drain by its deadline raises SimulationError instead of returning ' +
        'a degraded run',
    ).toEqual([INSTRUMENT_NOT_A_SURFACE]);
  });

  /**
   * And sets it to `report`.
   *
   * Three producers do not write the literal — `reports/replay.ts`, `validation/golden.ts` and
   * `runner/experiment.ts` all let a caller override and fall back — so the assertion is on the
   * initializer's text: it must name `'report'` and must never name `'throw'`. `runner/experiment.ts`
   * falls back through a constant rather than a literal, and that constant is asserted at runtime
   * below, where a type assertion cannot stand in for a value.
   */
  it('sets it to report', () => {
    const wrong = LITERALS.filter((literal) => literal.onTimeout !== undefined)
      .filter(
        (literal) =>
          !(literal.onTimeout ?? '').includes("'report'") ||
          (literal.onTimeout ?? '').includes("'throw'"),
      )
      .map((literal) => `${at(literal)} -> ${String(literal.onTimeout)}`);
    expect(wrong).toEqual([]);
  });

  it('resolves the one producer that defers to a constant', () => {
    /* `runner/experiment.ts:759` reads `overrides.onTimeout ?? (RUNNER_DEFAULTS.onTimeout as
       'report')`. The `as` clause is a type assertion and asserts nothing about the value, so the
       value is asserted here — otherwise the text check above is satisfied by a cast over `throw`. */
    expect(RUNNER_DEFAULTS.onTimeout).toBe('report');
  });
});

describe('the one exemption is measured, not argued', () => {
  it('is still in the domain, so the exemption cannot go vacuous', () => {
    expect(LITERALS.map((literal) => literal.file)).toContain(INSTRUMENT_NOT_A_SURFACE);
  });

  /**
   * Nothing outside a test imports it.
   *
   * The reason the oracle may throw is that it is an instrument: it is driven by
   * `oracle/fiveBuildings.test.ts`, `oracle/bankCensus.test.ts`, `oracle/deepCampaign.test.ts` and
   * `validation/physics.test.ts`, and by nothing else. `oracle/index.ts` states in its own docstring
   * that it deliberately does **not** re-export it. Wire it into a shipped path and this fails,
   * which is the point: the exemption is a fact about the tree, and it expires with the fact.
   *
   * **A module specifier is a string literal, so it cannot be found in blanked source and must not
   * be trusted in raw source** — a docstring writing *"imported from `./upPeakCase.js`"* would read
   * as an importer, which is `tuning/callers.test-helper.ts`'s whole thesis pointed the other way.
   * The two are separated by the property {@link blankNonCode} was built for: blanking preserves
   * offsets *and* keeps a string's **quote characters** while emptying its body, so a quote that
   * survives blanking opened a real string and a quote that did not was inside a comment. The match
   * is taken from the raw text and confirmed against the blanked text at the same index.
   */
  it('is reached from no non-test file in the tree', () => {
    const specifier = /(?:from|import)\s*\(?\s*(['"])[^'"]*oracle\/upPeakCase\.js\1/gu;
    const importers: string[] = [];
    for (const path of scannedFiles()) {
      const raw = readFileSync(path, 'utf8');
      const blanked = blankNonCode(raw);
      for (const match of raw.matchAll(specifier)) {
        const quote = match[1] ?? "'";
        const quoteAt = match.index + match[0].indexOf(quote);
        if (blanked[quoteAt] === quote) importers.push(path.slice(PACKAGES_DIR.length));
      }
    }
    expect(importers).toEqual([]);
  });

  /**
   * And the check above can see an import when there is one.
   *
   * Without this it is a check that has never been shown to fire: it passes on a tree where the
   * regular expression matches nothing at all, which is indistinguishable from the tree it is meant
   * to describe. `oracle/fiveBuildings.test.ts` really does import the module, so the same machinery
   * pointed at the whole tree — tests included — must find it.
   */
  it('finds the importers that do exist, so the emptiness above is a measurement', () => {
    const specifier = /(?:from|import)\s*\(?\s*(['"])[^'"]*oracle\/upPeakCase\.js\1/gu;
    const found: string[] = [];
    for (const path of allSourceFiles()) {
      const raw = readFileSync(path, 'utf8');
      const blanked = blankNonCode(raw);
      for (const match of raw.matchAll(specifier)) {
        const quote = match[1] ?? "'";
        if (blanked[match.index + match[0].indexOf(quote)] === quote) {
          found.push(path.slice(PACKAGES_DIR.length));
        }
      }
    }
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((path) => path.endsWith('.test.ts'))).toBe(true);
  });

  it('is left off its own barrel, in the barrel’s own words', () => {
    const barrel = readFileSync(join(PACKAGES_DIR, 'experiments/src/oracle/index.ts'), 'utf8');
    expect(barrel).toContain('upPeakCase');
    /* Named in prose, bound by nothing. */
    expect(blankNonCode(barrel)).not.toMatch(/upPeakCase/u);
  });
});

/* -------------------------------------------------------------------------- *
 * What the field is worth, run rather than described
 * -------------------------------------------------------------------------- */

/**
 * The measured difference the audit reports, reproduced at the cheapest scale that shows it.
 *
 * `garden-apartments` is the smallest shipped building — six floors, two cars — driven at an
 * arrival rate it cannot serve, with the drain deadline pulled in to one second so the run reaches
 * it immediately rather than after an hour of simulated drain. Nothing about the construction is
 * special: it is a `SimulationConfig` of the shape every producer above builds, run twice, once
 * without the field and once with it.
 *
 * This is what makes the scan above a guard rather than a spelling test. The keyword matters
 * because of this pair of outcomes, and the pair is measured here so that nobody has to take the
 * docstrings' word for it.
 */
describe('what onTimeout buys, measured', () => {
  const base = async (): Promise<Omit<SimulationConfig, 'onTimeout'>> => {
    const config = await loadConfig(DATA_DIR);
    const building = config.buildingsById.get('garden-apartments');
    const dispatcherProfile = config.dispatcherProfilesById.get('nearest-car');
    if (building === undefined || dispatcherProfile === undefined) {
      throw new Error('garden-apartments / nearest-car are no longer shipped');
    }
    return {
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      seed: 20260810,
      durationS: 300,
      demand: { arrivalRatePctPop5min: 40 },
      /* One second, so the deadline fires at the demand horizon instead of an hour past it. */
      drainGraceS: 1,
    };
  };

  it('without it, a run that cannot drain throws instead of returning', async () => {
    let thrown: unknown;
    try {
      runSimulation(await base());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SimulationError);
    /* The audit quotes this message shape from `viz`'s `recordRun`: it names the survivors. */
    expect((thrown as Error).message).toMatch(/journeys were still in the system/u);
  }, TIMEOUT_MS);

  it('with it, the same run returns a timed-out result with its mean suppressed', async () => {
    const result = runSimulation({ ...(await base()), onTimeout: 'report' });
    expect(result.status).toBe('timed-out');
    /* Reported, and still not quotable — `onTimeout` decides whether there is a result, never
       whether its mean may be read. CLAUDE.md § Statistical discipline. */
    expect(result.summary.awtIsValid).toBe(false);
  }, TIMEOUT_MS);
});
