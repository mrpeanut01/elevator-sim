/**
 * [§ D163](../../../../DECISIONS.md) clause 1, as a suite.
 *
 * > Across a generated sweep over (building × shipped dispatcher × seed × mode), **no
 * > player-facing string may assert something the run's own statistics refuse.**
 *
 * Five separable claims, each of which fails on its own:
 *
 * 1. **The search runs**, over the shipped `data/`, on a pinned corpus, and reports what it cost.
 * 2. **The search is alive.** Every adapter produced strings; every property was reachable; the
 *    corpus landed on both halves of the space `docs/10` § 0 describes — runs whose estimates are
 *    published and runs whose estimates are refused. A search that only ever saw quotable runs
 *    would have nothing to say about R3, and would say nothing while looking green.
 * 3. **The generator is deterministic and its cases replay** — CLAUDE.md invariants 2 and 5.
 * 4. **A counterexample shrinks**, and the shrunk case still fails the same property.
 * 5. **The property holds**, or every violation it found is reported in full.
 *
 * ## Budget
 *
 * The always-on tier is {@link STANDARD_CORPUS} — 48 pinned cases. Its cost is printed by the
 * first test rather than asserted, because a wall-clock assertion is a flake on a loaded machine;
 * what *is* asserted is the shape of the work, which cannot drift silently.
 *
 * The deep tier is opt-in with `ELEVATOR_SIM_HONESTY=deep`, sized by
 * `ELEVATOR_SIM_HONESTY_CASES`, and it is the only tier that reaches campaign stages and batches
 * inside CLAUDE.md's 50–200 replication budget.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  caseFromSeed,
  DEEP_SPACE,
  deepCampaignRequested,
  deepCampaignSize,
  deepSeeds,
  formatFailure,
  formatHonestyStats,
  HONESTY_MODES,
  HONESTY_PROPERTIES,
  PLAYER_FACING_SURFACES,
  runHonestyCampaign,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  SURFACE_ADAPTERS,
  WITHHELD_REASON_IDS,
  WITHHELD_REASONS,
  withheldStates,
  evaluateCase,
  shrinkCase,
  type HonestyCampaignResult,
  type HonestyResources,
  type HonestyShrinkResult,
} from './index.js';
import { loadHonestyResources } from './resources.test-helper.js';
import { FAULTS } from './faults.js';

let resources: HonestyResources;
let standard: HonestyCampaignResult;
let elapsedMs = 0;

const environment: Readonly<Record<string, string | undefined>> = process.env;

// A generous timeout: the corpus runs one recording plus a small batch per case over the real
// buildings, and Vertical City is 196 ms a replication (**M6**).
beforeAll(async () => {
  ({ resources } = await loadHonestyResources());
  const started = Date.now();
  standard = runHonestyCampaign({ resources, seeds: STANDARD_CORPUS, shrinkBudget: 40 });
  elapsedMs = Date.now() - started;
}, 900_000);

describe('the honesty search runs, and says what it cost', () => {
  it('reports its budget rather than hiding it', () => {
    const summary = formatHonestyStats(standard.stats);
    // Printed, not asserted: this is the number a reviewer needs in order to decide whether the
    // tier belongs in the always-on suite, and `fuzz/corpus.test.ts` prints its equivalent for
    // the same reason.
    console.log(`\nhonesty search — always-on tier\n${summary}\nwall clock      ${String(elapsedMs)} ms\n`);
    expect(standard.stats.cases).toBe(STANDARD_CORPUS.length);
    expect(standard.stats.skipped).toBe(0);
  });

  it('checks tens of thousands of strings, not a handful', () => {
    expect(standard.stats.texts).toBeGreaterThan(5_000);
    expect(standard.stats.simulations).toBeGreaterThan(STANDARD_CORPUS.length);
  });

  it('threw nowhere — an exception is a finding, never a skip', () => {
    const threw = standard.outcomes
      .filter((outcome) => outcome.threw !== undefined)
      .map((outcome) => `${outcome.case.caseId}: ${outcome.threw ?? ''}`);
    expect(threw).toEqual([]);
  });
});

describe('the search is alive — the five false-negative shapes, hunted in the harness itself', () => {
  it('every adapter produced at least one string', () => {
    // Wave 8's fifth false negative was a mutation harness reporting "no failures" for every case
    // because a CLI flag had been renamed. This is the same instrument class, so the same failure
    // is available: an adapter whose renderer silently returns nothing certifies a surface it
    // never looked at.
    const silent = SURFACE_ADAPTERS.filter(
      (adapter) => (standard.stats.surfaces[adapter.id] ?? 0) === 0,
    ).map((adapter) => adapter.id);
    // The campaign adapter is deliberately silent in the always-on tier — `STANDARD_SPACE` sets
    // `stageProbability: 0` because a stage runs 50 replications. It is asserted silent here and
    // asserted *loud* in the deep tier below, so its silence is a measured fact rather than an
    // unnoticed one.
    expect(silent).toEqual(['campaign/judge.ts#judgeStage']);
  });

  it('the corpus reaches both halves of the space, so R3 has something to check', () => {
    // `docs/10` § 0's **M1**: 14 of 60 shipped cells publish a quotable mean. A corpus that landed
    // only on the 14 would leave R3 with nothing to be true of, and would look identical to a
    // corpus that checked it.
    expect(standard.stats.suppressedCases).toBeGreaterThan(0);
    expect(standard.stats.suppressedCases).toBeLessThan(standard.stats.evaluated);
  });

  it('the corpus reaches both ends of the playhead, so R6 has something to check', () => {
    /*
     * **The false-negative shape this property has and the other six do not.**
     *
     * `whole-run-figure-early` is answerable only about a string a surface said *at a playhead*,
     * and only interesting about one it said **short of `endedAt`**. A corpus that stopped seeding
     * `TextPlayhead` — an adapter refactored, a helper renamed — would leave the property
     * iterating an empty set and reporting zero violations, which is byte-identical to the
     * property holding. `sampleTimes` is the thing that must not quietly stop having an early half.
     */
    const { temporal } = standard.stats;
    expect(temporal.atPlayhead).toBeGreaterThan(10_000);
    expect(temporal.early).toBeGreaterThan(0);
    expect(temporal.early).toBeLessThan(temporal.atPlayhead);

    /*
     * And **both values of the declaration**, which is the structural half's own version of the
     * same risk. The shipped surfaces declare `'whole-run'` only where the rail asks them to — at
     * `endedAt`, through `basisAt` — so a sweep that took `waitBandsAt`'s and `honestyAt`'s
     * *defaults* would produce `declaredWholeRun === 0` and assert a gate over nothing. It did,
     * until this axis landed: the retrospective copy of the mood card, the banding and the honesty
     * card had never been rendered by this search at all.
     */
    expect(temporal.declaredNow).toBeGreaterThan(0);
    expect(temporal.declaredWholeRun).toBeGreaterThan(0);
  });

  it('a whole-run declaration is drawn only where the playhead has earned it', () => {
    /*
     * The structural half, stated as a fact about the corpus rather than left to the property.
     *
     * Every string a surface declared `'whole-run'` was said **at `endedAt`**. That is the same
     * claim `checkWholeRunFigureEarly` makes, reached from the other side — the property reports a
     * violation, this counts the population — and it is here because a reader of the verdict should
     * be able to see the number rather than infer it from an empty failure list.
     */
    const { temporal } = standard.stats;
    const early = standard.failures.flatMap((failure) =>
      failure.minimal.violations.filter(
        (found) => found.property === 'whole-run-figure-early' && !matchesOutstanding(found),
      ),
    );
    expect(early).toEqual([]);
    expect(temporal.declaredWholeRun).toBeGreaterThan(0);
  });

  it('the withheld matrix reaches every combination it can — § 12.2', () => {
    /*
     * **The same false-negative shape the temporal axis has, and the reason both are measured.**
     *
     * `withheld-figure-published` is answerable only about cells an adapter *marked*, so an adapter
     * that stopped marking them — a refactor, a renamed field — would leave the property iterating
     * an empty set and reporting zero violations, which is byte-identical to it holding. The cell
     * count is the cheap half; the state count is the one § 12.2 is actually about, because the
     * clause is *every* combination and a matrix with a hole in it satisfies any cell count.
     *
     * **31 rather than 32**, and the missing one is the point: `nothing-withheld` is the state in
     * which no reason holds, and a state that withholds nothing marks no cell. Asserting the full
     * `2 ** n` would require the adapter to mark a cell in a state where nothing is unavailable,
     * which is precisely the false claim this property exists to refuse.
     */
    const { withheld } = standard.stats;
    expect(withheld.states).toBe(2 ** WITHHELD_REASONS.length - 1);
    expect(withheld.cells).toBeGreaterThan(withheld.states);
    // And the enumeration itself is the power set, so the number above is a coverage claim.
    expect(withheldStates()).toHaveLength(2 ** WITHHELD_REASONS.length);
    expect(new Set(withheldStates().map((state) => state.id)).size).toBe(2 ** WITHHELD_REASONS.length);
    for (const reason of WITHHELD_REASON_IDS) {
      expect(
        withheldStates().filter((state) => state.reasons.includes(reason)).length,
        reason,
      ).toBe(2 ** (WITHHELD_REASONS.length - 1));
    }
  });

  it('every withheld reason names a seam in this tree, not a prototype identifier', () => {
    /*
     * § 12.2's four names are the prototype's — `docs/18`'s framing correction — and three of them
     * mean something different here. A reason whose `seam` were empty would be a state the sweep
     * invented rather than one a player can reach, which is the fixture-list defect arriving through
     * the door built to close it.
     */
    for (const reason of WITHHELD_REASONS) {
      expect(reason.seam.length, reason.id).toBeGreaterThan(20);
      expect(reason.holds.length, reason.id).toBeGreaterThan(20);
      // Named after what is true of the shell, never after a `settings` flag this tree lacks.
      expect(reason.seam, reason.id).toMatch(/\.ts#|\.ts /);
    }
    expect(WITHHELD_REASONS.map((reason) => reason.id)).toEqual([...WITHHELD_REASON_IDS]);
  });

  it('the corpus reaches every shipped building and every generated mode', () => {
    expect(Object.keys(standard.stats.buildings).sort()).toEqual([...STANDARD_SPACE.buildingIds].sort());
    expect(Object.keys(standard.stats.modes).sort()).toEqual([...HONESTY_MODES].sort());
  });

  it('the charter gate has a scope, and it is derived from the adapters rather than listed', () => {
    /*
     * **The false-negative shape this property has and the other eight do not.** Eight of the nine
     * are asked about every string in the corpus; `internal-notation` is asked only about strings on
     * `PLAYER_FACING_SURFACES`, so an edit that emptied that set — or narrowed it to the wrong
     * spelling — would turn `CHARTER_PROGRAMME.md` § M2's gate green while every offending sentence
     * stayed on the screen. That is a search certifying nothing, which is what this whole describe
     * block exists to refuse, so the scope is asserted in **both** directions.
     */
    for (const surface of PLAYER_FACING_SURFACES) {
      expect(SURFACE_ADAPTERS.map((adapter) => adapter.id), surface).toContain(surface);
    }
    // Non-empty, and big enough that a set trimmed to one lucky surface is red.
    expect(PLAYER_FACING_SURFACES.size).toBeGreaterThanOrEqual(10);

    // In: every surface the register's findings live on, plus the campaign's stage verdict.
    for (const surface of [
      'everyday/modes.ts#EVERYDAY_MODES',
      'everyday/settingsView.ts#settingsScreenViewOf',
      'everyday/stageScreenModel.ts#stageHeaderOf',
      'everyday/designerModel.ts#designerFigures',
      'campaign/judge.ts#judgeStage',
    ]) {
      expect(PLAYER_FACING_SURFACES.has(surface), surface).toBe(true);
    }

    /*
     * **In, and its id is in neither player directory** — this is the assertion that pins the
     * derivation to `covers` rather than to the adapter's own id. `gauntlet/ladder.ts#ladderRowsOf`
     * draws `everyday/boardScreen.ts#BOARD_SCREEN_COPY` and `#DAILY_BOARD_ABSENCE`, so a rule keyed
     * on the id would leave the board screen's own register of absences — the exact shape of string
     * this gate is about — outside the gate while looking complete.
     */
    expect(PLAYER_FACING_SURFACES.has('gauntlet/ladder.ts#ladderRowsOf')).toBe(true);

    /*
     * **Out, and each of these is a measurement rather than an opinion.** Over the 27 049 distinct
     * strings a seven-seed sample of this corpus renders, a filename match on every surface reports
     * 656; 572 are `familyControlsViewOf` drawing
     * *"Read by `dispatch/policy.ts#resolveDispatchConfig`"* — an Engineer panel naming the code that
     * reads a field, correctly, to an engineer. A gate that fired there would be § D91's failure: a
     * guard that cries about legitimate cases trains people to ignore it.
     */
    for (const surface of [
      'dev/familyControls.ts#familyControlsViewOf',
      'dev/buildingEditor.ts#specRowsOf',
      'dev/rightRail.ts#buildingPlateOf',
      'controls/controls.ts#controlsFor',
      'live/bands.ts#moodAt',
    ]) {
      expect(PLAYER_FACING_SURFACES.has(surface), surface).toBe(false);
    }
  });

  it('every property can fire — asserted here, and demonstrated in faults.test.ts', () => {
    // The list is derived from the fault table rather than restated, so a property added without
    // a fault is red here as well as there.
    expect(Object.keys(FAULTS).sort()).toEqual([...HONESTY_PROPERTIES].sort());
    for (const property of HONESTY_PROPERTIES) {
      expect(FAULTS[property].length, property).toBeGreaterThan(0);
    }
  });

  it('negative control: a corpus of zero seeds is not a pass', () => {
    // The shape of a search that certifies nothing. Asserted so the assertions above cannot be
    // satisfied by an empty run.
    const empty = runHonestyCampaign({ resources, seeds: [] });
    expect(empty.stats.texts).toBe(0);
    expect(empty.stats.evaluated).toBe(0);
    expect(standard.stats.texts).toBeGreaterThan(empty.stats.texts);
  }, 60_000);
});

describe('a case is one integer, and it replays', () => {
  it('is a pure function of its seed — CLAUDE.md invariant 2', () => {
    for (const seed of STANDARD_CORPUS.slice(0, 12)) {
      const first = caseFromSeed(seed, { space: STANDARD_SPACE });
      const second = caseFromSeed(seed, { space: STANDARD_SPACE });
      expect(second).toEqual(first);
    }
  });

  it('gives different seeds different configurations', () => {
    const cases = STANDARD_CORPUS.map((seed) => caseFromSeed(seed, { space: STANDARD_SPACE }));
    const distinct = new Set(cases.map((honestyCase) => JSON.stringify({ ...honestyCase, caseId: '', honestySeed: '' })));
    expect(distinct.size).toBeGreaterThan(STANDARD_CORPUS.length / 2);
  });

  it('carries its simulation seed, so any case replays exactly — invariant 5', () => {
    const honestyCase = caseFromSeed(STANDARD_CORPUS[0] ?? 9001, { space: STANDARD_SPACE });
    const first = evaluateCase(honestyCase, resources);
    const second = evaluateCase(honestyCase, resources);
    expect(second.textCount).toBe(first.textCount);
    expect(second.violations).toEqual(first.violations);
    expect(second.suppressed).toBe(first.suppressed);
  }, 300_000);

  it('is JSON-serializable in full, so a counterexample prints', () => {
    const honestyCase = caseFromSeed(9007, { space: DEEP_SPACE });
    expect(JSON.parse(JSON.stringify(honestyCase))).toEqual(honestyCase);
  });
});

describe('a counterexample shrinks', () => {
  it('reduces a failing case and keeps the property it failed', () => {
    // Driven with a fault, because the shipped surfaces may legitimately have nothing to shrink.
    // The shrinker is the thing under test here, not the product.
    const faulted: HonestyResources = { ...resources, corruptTexts: FAULTS['probability-word'][0]?.fault };
    const honestyCase = caseFromSeed(9013, { space: STANDARD_SPACE });
    const outcome = evaluateCase(honestyCase, faulted);
    expect(outcome.violations.length).toBeGreaterThan(0);

    const shrunk = shrinkCase(outcome, faulted, { budget: 24 });
    expect(shrunk.evaluations).toBeGreaterThan(0);
    expect(shrunk.minimal.violations.some((found) => found.property === 'probability-word')).toBe(true);
    // Smaller on at least one axis, or already minimal — never larger.
    expect(shrunk.minimal.case.replications).toBeLessThanOrEqual(outcome.case.replications);
    expect(shrunk.minimal.case.durationS).toBeLessThanOrEqual(outcome.case.durationS);
    expect(shrunk.minimal.case.caseId.startsWith(outcome.case.caseId)).toBe(true);
  }, 300_000);

  it('never widens the target: a case that fails a different property is not accepted', () => {
    const faulted: HonestyResources = { ...resources, corruptTexts: FAULTS['energy-wait-blend'][0]?.fault };
    const outcome = evaluateCase(caseFromSeed(9021, { space: STANDARD_SPACE }), faulted);
    const shrunk = shrinkCase(outcome, faulted, { budget: 16 });
    for (const found of shrunk.minimal.violations) {
      expect(HONESTY_PROPERTIES).toContain(found.property);
    }
    expect(shrunk.minimal.violations.some((found) => found.property === 'energy-wait-blend')).toBe(true);
  }, 300_000);
});

/**
 * What the search **found**, pinned in both directions. **Nineteen entries and one finding** —
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion, failing on five player surfaces, recorded by
 * the property built to measure it and fixed by nobody in this lane (GitHub issue #207). Seventeen
 * are the absence registers the issue is about; **two are a stage verdict and a parameter
 * description that no issue names**, and only the deep tier can see them.
 *
 * An entry names the tier it was **measured** in, because the second direction below is asked per
 * tier and a finding recorded in one corpus is a ghost in the other. The seventeen were measured in
 * both.
 *
 * It was two entries and one finding before that, and four entries and two findings before *that*,
 * until GitHub issue #137 closed R13 on the delta block in the product and § D332 moved the run the
 * R3 cue collision needed. Every one of those entries is gone; the argument for what each was and
 * what closed it stays below, as prose, on the same footing as every other closed finding in this
 * file.
 *
 * A found violation is a result before it is a patch, so a finding is recorded here rather than
 * quietly fixed, and the register is asserted **both ways**, which is what stops it becoming a
 * suppression list:
 *
 * - nothing outside it may fail — a new violation is red;
 * - everything in it must still be found — a finding that is fixed, or that the search stops
 *   being able to see, is also red, with a message saying to delete the entry.
 *
 * ## Why an entry names its tier, and why the field is load-bearing again
 *
 * The second half of that rule needs a corpus the finding actually reproduces in, and until the
 * temporal axis every recorded finding reproduced in the always-on tier — so the assertion could
 * read `standard.failures` and nothing said so. The canvas banner finding fired only on a run whose
 * `status` is not `completed`, which needs a horizon `STANDARD_SPACE` does not reach: **0 of 49
 * always-on cases, 2 of 60 deep**. Marking the tier is what let the ghost check stay exact for
 * both — the deep tier runs its own half, which it did not before — rather than being softened to
 * *"found somewhere"* for the one entry that would otherwise have been a ghost.
 *
 * That mechanism was kept while the register was empty *"because the next finding will arrive in one
 * tier or the other, and rebuilding it at that point means rebuilding it in a hurry"*. It did, in
 * both: R13 on the delta block reproduced in **both** tiers, and the R3 cue collision on
 * `honesty-9100031` reproduces only in the deep one. R13's entries are now deleted with the defect,
 * and the surviving finding is a deep-tier-only one — so the marker is again the only thing standing
 * between the always-on half of the ghost check and an assertion over nothing.
 *
 * ## The entry that was missing, and what its absence cost
 *
 * `honesty-9100031`/`suppressed-mean` has been described in {@link violationsOf}'s docstring as a
 * live finding, and published in `CLAUDE.md` and `docs/05-roadmap.md` as *outstanding*, since the
 * temporal axis landed — **and it was never in this list**. So the deep tier was red: measured on
 * `integration/issue-wave-15` before any of this wave's work, `ELEVATOR_SIM_HONESTY=deep` reported
 * `expected [ …(10) ] to deeply equal []`. A finding the documents call recorded and the register
 * does not hold is the same defect as a ghost, pointing the other way: the tier cannot come back
 * green, so nobody runs it, so the next real finding arrives in a suite that was already failing.
 * It is entered below.
 *
 * ## The two entries that were here **before** those, and what closed each
 *
 * Both were escalated rather than resolved in the harness author's lane, both were adjudicated by
 * [§ D171](../../../../DECISIONS.md), and **neither was closed by widening this list**:
 *
 * 1. **R10 on the Parameters tab.** `core`'s `idle.predictorHorizonS` description contains
 *    *"likely to appear soon"*, and `campaign/words.ts` recorded a deliberate exemption for the
 *    schema surface while § D163 clause 1 said *"anywhere"*. Resolved by **narrowing the rule**:
 *    R10 exists to stop a confidence interval being translated into a probability word, and a
 *    description of what a dial does is not that. `properties.ts` now scopes the property to
 *    result-bearing provenance and `controls/controls.ts`'s description reaches it as `schema`.
 *    `core`'s text is unchanged and the Parameters tab still prints it whole.
 * 2. **R2's budget clause in the Compare panel.** `compareMetric` named a winner as soon as the
 *    paired interval excluded zero, which needs `n >= 2`. Resolved in the **product**: below
 *    `MIN_REPLICATION_BUDGET` the row draws its interval and refuses the ordering, with the
 *    reason where the verdict would have been — `batch/report.ts`'s `under-budget` verdict.
 *
 * ## Four further findings that were **not** product defects, and were corrected in the rule
 *
 * All four were R3's textual half, and each is recorded on the rule it corrected in
 * `properties.ts` — § D171's own pattern for a false positive. Not one string printed a mean.
 *
 * 3. **Eight reports on `describeFrame` and `drawScene`** (`honesty-9021`, `honesty-9045`): a
 *    run-level count — `61` undelivered passengers, `28` boarded legs — in a **different sentence**
 *    from the estimate cue that flagged it, and in three of the eight the cue was the word
 *    *"suppressed"* doing its job. The 64-character window crossed sentence boundaries; it is now
 *    bounded by the numeral's own clause.
 * 4. **Five reports on `describeFrame`** (`honesty-9010`): `wait95S = 300.4` matched the `300` in
 *    *"Rolling mean wait over the last 300 seconds is not reported"* — a window length, beside a
 *    cue naming a **different** quantity, in `describeFrame`'s own refusal. The cues are now keyed
 *    to the quantity whose value is being looked for.
 * 5. **The run's own refusal, quoted** (`honesty-9100022`, deep tier): `awtIsValid`'s fourth
 *    ground writes *"a mean of 49.6 s reported beside a wait of 1339.6 s describes a system nobody
 *    experienced"*, and `describeFrame` embeds that sentence. The string-level `role === 'reason'`
 *    exemption now composes — the run's own `awtInvalidReason` is cut out **by identity** before
 *    the scan. Same case, same tier: a `meanWaitS` of 50 matching a `50` in `core`'s description
 *    of `answer.reopenOnLateArrival`, which is schema prose and is now marked as such.
 * 6. **A substring of a number is not a number** (`honesty-9100022`, deep tier): `wait95S` rounded
 *    to `9` and matched inside *"**9**5th percentile"* — the cue itself — and `meanWaitS` rounded
 *    to `3` and matched inside *"the last **3**00 seconds"*. `String.indexOf` had been doing the
 *    same quietly all along (`61` inside *"loaded at 0.**61**"*). Forms are now compared against
 *    whole number tokens.
 *
 * All of them are guarded by a second R3 fault — `suppressedMeanInProse`, which injects § D111's
 * canvas header verbatim — because a correction to a check is a change to what the check can no
 * longer see, and the thing it must still see should be injected rather than argued.
 */
const OUTSTANDING: readonly {
  readonly property: string;
  readonly surfaceId: string;
  /**
   * The corpus this finding reproduces in, and where its ghost check runs. See above.
   *
   * **`'both'` is not a convenience, and it replaces a duplicate row rather than excusing one.**
   * The R13 finding above stood as two entries, one per tier, because the second direction is asked
   * per tier and a row marked `standard` is unwatched in the deep corpus. That is right, and it has
   * a failure mode of its own: seventeen findings on copy that renders in both tiers would be
   * thirty-four rows, deleted in two places on the day each is fixed, and a half-deletion is exactly
   * the ghost this register exists to catch. So a finding measured in both corpora says so once, and
   * {@link expectStillFound} watches it in both. The word is a claim about a **measurement**: mark it
   * only after running the tier, never because a surface looks tier-independent.
   */
  readonly tier: 'standard' | 'deep' | 'both';
  /** A fragment of the offending **string**, when the finding is about particular words. */
  readonly contains?: string;
  /**
   * A fragment of the offending **field**, when the finding is about a whole row.
   *
   * The R2 leak below is a property of the comparison *row* — its `sentence` names the winner and
   * its `note` explains the arithmetic behind the same claim — so pinning it to one of the two
   * strings would let the other reopen silently.
   */
  readonly fieldContains?: string;
  readonly finding: string;
}[] = Object.freeze([
  /*
   * ## The finding the design refactor's Day sheet produced — **closed**, and left here as the
   * record of what the search is for
   *
   * `shift/report.ts#diagnosisFor` builds a *Where it went wrong* row about the reporting window,
   * and its `why` opened with an illustrative counter-example:
   *
   * > `“Riders waited 25 seconds on average” is false without “during the busiest five minutes”.`
   *
   * The sentence is quoted in order to be **called false**, and it is the best line on the row. It
   * was also, verbatim, a numeral beside an estimate cue naming the quantity — and on
   * `honesty-9032`'s shrunk case (Midtown Office, censored above the unserved limit) the run's own
   * refused `meanWaitS` rounds to **25**. So the sheet printed, three rows under a cell reading
   * `AVERAGE WAIT: withheld`, the number that cell was withholding, in the same voice as its real
   * figures. R3's textual half was right to see it: a reader cannot tell a quoted counter-example
   * from a figure, which is the whole reason that half exists.
   *
   * **The two obvious corrections were both wrong.** Narrowing the rule to ignore numerals inside
   * typographic quotation marks would be an allow-word with a hiding place in it — `“average wait
   * 61.0 s”` would pass. Dropping the row from the corpus would be excluding a player-facing
   * string. What closed it is one word in `shift/report.ts`: the illustrative figure is spelled
   * **twenty-five**. The sentence keeps its force and the sheet stops carrying an invented figure
   * in the voice it reports real ones in.
   *
   * That entry is gone, and the register stayed empty until the temporal axis ran — an entry that
   * no longer reproduces is as much a defect as a finding that is not recorded. That is the whole
   * reason the two entries below are prose and not rows: each was deleted **on the commit that
   * made it stop reproducing**, and deleting it any earlier or later is the same defect twice.
   */
  /*
   * ## The two findings the **temporal axis** produced on its first run — both **closed**, in the
   * product, and left here as the record of what the axis is for
   *
   * They were recorded rather than fixed in the lane that found them, so the corpus claim stayed
   * honest for a wave; both are now gone from the search, and this is what closed each.
   *
   * ### 1. `render/describeFrame.ts#describeFrame` — 196 violations, 49 of 49 always-on cases
   *
   * The canvas's text alternative (KB-13) joined **every** driver of a `BuildingMood`:
   *
   * > `mood.drivers.map((driver) => driver.text).join(' ')`
   *
   * Four of those five carry `basis: 'whole-run'`, so at 0 s of a 16:29 run the paragraph read
   * *"…334 of 334 people got where they were going"* — the finished day's `summary.delivered`
   * beside a clock reading the start, where the count at that playhead is **0**. Issue #109's
   * defect on the surface a screen-reader user gets: § D293 closed it on the rail only, where
   * `dev/leftRail.ts#moodDriverPanelOf` filters on `basis`, and this join was not gated with it.
   * The paragraph *did* carry `mood.headline`'s *"So far — the run has not finished, so this can
   * still change"*, which is exactly the retraction § D293 measured as **insufficient**.
   *
   * Closed by the gate, not by a deletion — the comment above the join (*"a reader who is told only
   * the maximum cannot tell which observation produced it"*) still holds, and every driver the
   * playhead has earned is still spoken. `mood.retraction` takes the withheld ones' place, as it
   * does on the rail. The paragraph also carried the **same defect a second time**, in a clause the
   * adapter's optional `mood` was never needed to reach: *"Run status timed-out, with 127 passengers
   * undelivered"*, which `dev/main.ts` produces today at both call sites. That is fixed with it.
   *
   * ### 2. `render/canvas.ts#drawScene` — 2 of 60 deep cases, 0 of 49 always-on
   *
   * The stage banner, drawn on every frame `dev/main.ts` paints:
   *
   * > `TIMED-OUT — 127 undelivered`
   *
   * `summary.undelivered` is *how many people were still in the building **when the run ended***.
   * The banner drew it at every playhead, and on `honesty-9100032` (2 817 s) it said **127** at 0 s
   * — when nobody was undelivered yet — and **127** at 704 s, when the live figure was **376**. The
   * part worth reading twice: not merely early, but *smaller than the truth on screen by a factor of
   * three*, in the one clause `RV-16` makes lead the banner because *"it is the fact that decides
   * how much of the rest means anything."*
   *
   * Closed by publishing a **live** figure at the playhead and the run's own figure once the
   * playhead reaches `endedAt` — `render/canvas.ts#undeliveredAt`, whose docstring is the argument
   * for that over § D293's gate and § D294's scoping. `recording.status` is still drawn verbatim at
   * every playhead, which is § D294's ruling on this same header.
   *
   * It reproduced only in the deep tier because the branch needs `recording.status !== 'completed'`
   * and `STANDARD_SPACE`'s horizons all complete. The opt-in tier earned its cost here, which is
   * worth recording about the tier as much as about the banner.
   */

  /*
   * ## 1. R13 on the Day report's delta block — **found on the first run of GitHub issue #127's
   * pairing, and now CLOSED in the product (GitHub issue #137)**
   *
   * Two entries stood here, one per tier, and both are deleted rather than kept: *"a finding that is
   * fixed … is also red, with a message saying to delete the entry"* is this register's own rule,
   * and an entry outliving what it recorded is the ghost the second direction exists to catch.
   *
   * What was found, on **24 of 49** always-on cases and **28 of 60** deep, the first time the block
   * was swept:
   *
   * > `AVERAGE WAIT was 17.8 s → 23.4 s`
   *
   * One row, one figure, one property. `AVERAGE WAIT` is the only cell on the sheet that
   * `summary.awtIsValid` speaks for, and R13 clause one is *"an estimate string must carry a count,
   * in the same visual unit"*. The block drew `LABEL was X → Y` and **no count anywhere in its
   * box** — `dev/reportPanel.ts#deltaRow` was a label, a `was` value, a decorative arrow and a
   * value, and `deltaBox` is its own bordered region with a caption above and one sentence below.
   *
   * **It was never the harness's defect, which is the question this adapter has been wrong about
   * before.** The figure-grid loop in `REPORT_PANEL` seeds a cell's value with `countShown` read off
   * that cell's **note**, and its comment records why: seeding the value alone *"asked R13 a question
   * about a string nobody draws"*, because the sheet draws the value and the note together. That was
   * not true here — the row was drawn exactly as it was seeded, with nothing beside it — and the
   * fix is precisely to make it true: the row now has a note, drawn beside the value, and the adapter
   * seeds it and reads `countShown` off it exactly as the grid does.
   *
   * **The surface where it cost most was not the sheet.** On the Day report the block sits above a
   * figure grid that does print the mean's `n`, one block away. On `dev/dispatcherEditor.ts`'s
   * result strip — the second surface § D310 pointed at the same `reportViewOf` — there is no sheet
   * at all: the strip is a caption, these rows and the block's note. That is `REPORT_CARD`'s
   * argument in miniature (*"a claim on it is read with none of that around it"*), and it is why the
   * fix had to be in the **view** rather than in either renderer.
   *
   * **What closed it.** `ReportFigure` carries the denominator its value was computed over
   * (`shift/report.ts#averageWaitFigure`, from the same `summary` as the mean and three lines from
   * it); `DeltaRowView` carries **two** counts, one per side, because the two values are means of
   * two different runs and one `n` under both would be a claim neither sheet made; both renderers
   * draw each count beside its own value. A refused mean carries none — a refusal has no sample —
   * and § D311's comparability refusal draws no figure rows at all, so neither acquires a
   * denominator that would make it read as a figure with a caveat. Pinned in `reportPanel.test.ts`
   * (five cases, including the two-runs-two-counts one and the refusal) and in
   * `dispatcherEditor.test.ts` (the strip really draws them). The always-on tier's
   * `estimate-without-n` count went **48 → 0** and the deep tier's **104 → 0**.
   *
   * The entries were deleted **on the commit that made the finding stop reproducing**, which is the
   * rule the closed findings above were left here to state: deleting one any earlier or any later is
   * the same defect twice.
   */

  /*
   * ## 2. R3's cue collision on `honesty-9100031` — **the entry the documents already claimed was
   * here**
   *
   * Deep tier only, 10 violations, one case: Vertical City / `nearest-car` at seed
   * 900 344 702 126 007, a run whose queue grows through the reporting window and whose mean is
   * therefore refused. That refused `meanWaitS` is **19.65**, which rounds to `20` — and
   * `render/mood.ts`'s caveat says, verbatim and about a different building:
   *
   * > `the same configuration on Secure Tower returned a quotable average on 6 of 20 consecutive`
   * > `seeds`
   *
   * A cue naming the mean, a `20` in the same clause, on a run whose mean is suppressed. It is a
   * **coincidence between a rule and a sentence**, not a false claim on screen: the caveat is
   * `campaign`-authored prose about **M7**'s measurement, the number is a seed count, and no reader
   * is being shown this run's average.
   *
   * It fires on two surfaces because `render/describeFrame.ts` joins the caveat into its own
   * paragraph — the canvas's text alternative quotes the mood card whole, so one sentence produces
   * five reports per surface across the five sampled playheads.
   *
   * **Not closed by a rule change, and that is deliberate.** The corrections § D171 records were all
   * cases where the check was reading the words wrongly; this one reads them correctly and the words
   * happen to collide. Narrowing the clause further, or exempting a numeral that is also a seed
   * count, would be an allow-rule with a hiding place in it. What would close it is the caveat citing
   * its measurement without a bare integer — a copy change on a sentence § D160 owns — and that is
   * somebody's decision rather than a harness edit.
   *
   * ### **Both entries are DELETED as of § D334, and the caveat was not the thing that changed**
   *
   * The ghost check fired: the deep search stopped finding this collision on either surface. It is
   * deleted here on the commit that made it stop reproducing, because an entry that no longer
   * reproduces is as much a defect as a finding that is not recorded — and the register would
   * otherwise be decoration.
   *
   * **Why it stopped, measured rather than inferred.** The case is `vertical-city` / `nearest-car`
   * at seed `900344702126007`, and § D332's deck fix moved that building's runs. Re-measured on the
   * fixed tree, that run reports `awtIsValid: **true**` and `meanWaitS: **19.186**` — where the
   * finding needed a *refused* mean of 19.65 rounding to 20. Two independent things changed and
   * either alone closes it: the run no longer suppresses its mean at all, so `suppressed-mean`
   * cannot fire on it by construction; and the mean it does publish rounds to **19**, not 20.
   *
   * **So this is luck moving, not a defect being fixed, and the difference matters.** The caveat in
   * `render/mood.ts` is unchanged and still cites its measurement with a bare integer. The copy
   * change described above is still the thing that would close the *class*; what closed this
   * *instance* is that a dispatch fix moved the one run whose refused mean happened to round onto
   * the caveat's seed count. A future run that suppresses a mean rounding to 20 will collide again,
   * and it will arrive unregistered — which is the correct state for a finding nothing currently
   * reproduces.
   */

  /*
   * ## 3. The charter's M2 gate — **nineteen findings, open, and this register is the gate's own
   * progress bar**
   *
   * Seventeen below, measured in **both** tiers, and two more that only the deep tier can reach —
   * those two are at the end of this block, with what each is.
   *
   * `CHARTER_PROGRAMME.md` § M2's third exit criterion is *"nothing on a player surface refers to a
   * section number, a source filename or a code identifier"*, and it says of itself that it *"is a
   * mechanical check and it is part of the gate"*. It had no instrument, so it would have been
   * settled by review. `properties.ts#checkInternalNotation` is that instrument, and the seventeen
   * rows below are what it found on its first run — **watched failing before anything was
   * registered**: 49 of 49 always-on cases, 1 078 reported violation lines, 22 strings per case
   * over four surfaces.
   *
   * **Twenty-two strings, seventeen entries, and the gap is not a rounding.** The settings register's
   * one notated row is drawn in six of that screen's states, so one authored sentence produces six
   * violations. The register is keyed on the **sentence**, because the sentence is what somebody
   * rewrites; a row per rendering would make the count a fact about the adapter.
   *
   * **Seventeen is exactly what `ISSUE_VERIFICATION_FINDINGS.md` § N counted by hand** — *"six
   * surfaces, 27 register entries, 17 carrying a § or a code identifier"* — and the agreement is
   * worth more than the number: a hand count and a search that never spoke to each other landed on
   * the same seventeen sentences, which is the strongest thing available to say about a new
   * instrument's calibration. The two counts do differ on **surfaces**, and the search is right:
   * § N's six are source files, and four of them (`shell.ts`, `rushScreenModel.ts`,
   * `designerModel.ts`, `settingsView.ts`) reach the player through three adapters. `career.ts`'s
   * three entries carry no notation at all and are the counter-example that proves the fix is a
   * rewrite rather than a mechanism change.
   *
   * **These are recorded rather than fixed, and deliberately so.** The fix is GitHub issue #207 and
   * a separate lane; this lane built the thing that measures it. § D307's precedent is exactly this:
   * *"a corpus that grew an axis and stayed green is a different claim from one that had to be
   * repaired first."* So the seventeen stand, and **the criterion is met when this block is empty
   * and at no earlier moment** — an entry deleted on the commit that makes it stop reproducing,
   * per the rule the closed findings above were left here to state.
   *
   * **Marked `both` because both tiers were run**, not because the copy looked tier-independent.
   * The four surfaces are static player copy drawn on every case, and the deep tier reports the
   * same seventeen.
   */
  {
    property: 'internal-notation',
    surfaceId: 'everyday/modes.ts#EVERYDAY_MODES',
    tier: 'both',
    contains: '§ 6.1’s replay',
    finding: 'the front door’s register, row 1 of 5 — the replay a week strip does not stand back up.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/modes.ts#EVERYDAY_MODES',
    tier: 'both',
    contains: '§ 6.2’s ghost',
    finding: 'row 2 of 5 — the ghost lane *Race against* describes instead of offering.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/modes.ts#EVERYDAY_MODES',
    tier: 'both',
    contains: '§ 14’s daily board',
    finding: 'row 3 of 5, and it carries two section numbers — § 14 and § 12.2’s labelled unavailable state.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/modes.ts#EVERYDAY_MODES',
    tier: 'both',
    contains: '§ 6.5’s third lever',
    finding: 'row 4 of 5, and the worst of the seventeen: a section number, a source filename and a constant’s identifier in one sentence — `dev/reportPanel.ts#LEVER_SURFACES`. All three of the criterion’s things, on the first screen the game opens on.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/modes.ts#EVERYDAY_MODES',
    tier: 'both',
    contains: '§ 9 Endless rush',
    finding: 'row 5 of 5 — three section numbers, § 9, § 9.2 and § 9.3.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/settingsView.ts#settingsScreenViewOf',
    tier: 'both',
    contains: 'Default speed — § 7’s stage',
    finding: 'the settings register’s one notated row of six, and the counter-example inside its own array: the other five are plain English. One entry, six violations, because the adapter draws the screen in six states and the row is in all of them.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/stageScreenModel.ts#stageHeaderOf',
    tier: 'both',
    contains: '§ 7.5’s campaign dock',
    finding: 'the stage’s own register, 1 of the 3 entries that carry notation; its fourth sentence — `STAGE_NO_GHOST`, drawn first — is plain English and is deliberately not here.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/stageScreenModel.ts#stageHeaderOf',
    tier: 'both',
    contains: '§ 7.3’s camera',
    finding: 'the stage’s register, 2 of 3.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/stageScreenModel.ts#stageHeaderOf',
    tier: 'both',
    contains: '§ 7.6’s second and third arms',
    finding: 'the stage’s register, 3 of 3.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: 'so § 3.2’s ninety minutes',
    finding: 'the rush setup’s register, 1 of 3 notated of 4. It also says *no demand template in data/*, which this property deliberately does not match — a bare directory is not a filename, and the under-match is named in `properties.ts#SOURCE_FILENAME` so the gate’s zero is read for what it is.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 9.2’s stage',
    finding: 'the rush setup’s register, 2 of 3 — three section numbers, a source filename and two backticked identifiers: `live/timeline.ts`’s `clockAt` and `phaseAt`.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 9.3’s result',
    finding: 'the rush setup’s register, 3 of 3.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 13.3’s per-shaft machine class',
    finding: 'the drawing board’s register, 1 of 5 — and this array is 5 of 5 notated, the only register in the tree with no plain-English row.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 13.3’s access panel',
    finding: 'the drawing board’s register, 2 of 5.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 13.2’s escalator rows',
    finding: 'the drawing board’s register, 3 of 5 — the one entry whose identifier is the only thing the backtick clause catches it by if the section number is ever rewritten away: `SpecTransportMode`.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 13.3’s sky-lobby seeder',
    finding: 'the drawing board’s register, 4 of 5.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'everyday/designerModel.ts#designerFigures',
    tier: 'both',
    contains: '§ 13.3’s collapsed document',
    finding: 'the drawing board’s register, 5 of 5.',
  },

  /*
   * ## 4. The same gate, **two findings the always-on tier cannot see** — and this is the deep tier
   * earning its cost for the second time
   *
   * `campaign/judge.ts#judgeStage` is silent in the always-on tier by construction: `STANDARD_SPACE`
   * sets `stageProbability: 0`, so no standard case draws a stage. Both of these were invisible to
   * the run that watched the seventeen fail, and to `ISSUE_VERIFICATION_FINDINGS.md` § N, which
   * counted registers of absences and had no reason to look at a stage verdict. **They are not in
   * any issue.** The first run of the deep tier reported 35 violation lines over 24 of 60 cases.
   *
   * ### 1. The stage verdict's note — `campaign/judge.ts:268`
   *
   * > `published in data/scenario-goals.json — not a number chosen here. Both arms saw the same`
   * > `passengers, so the two counts are paired.`
   *
   * One authored sentence, drawn once per per-replication goal row, so it reports on five goal kinds
   * — `answer-the-demand`, `deliver-everyone`, `long-waits-under`, `nobody-abandoned`,
   * `no-divergence`. **The sentence is doing something right**: R12's whole point is that a goal
   * ships with its measured rate and the bar is not invented here, and naming where the bar comes
   * from is that claim made checkable. It names it in the wrong vocabulary for the audience, which
   * is what makes this the criterion's case rather than an argument against the sentence: *"the
   * shipped setting's own measured count on this stage's tuning seeds"* says the same thing without
   * a path in it.
   *
   * ### 2. `core`'s own parameter description, on the campaign brief —
   * `briefing.editable.auction.aggregation.help`
   *
   * > `… which is what every group controller in the literature does; see docs/01-architecture.md.`
   *
   * This is a `SearchParameter.description` — `provenance: 'schema'`, text `core` wrote about its
   * own dial — re-printed on the brief's list of controls a player may edit. **It is the case that
   * decided this property's scoping, and it arrived after the decision rather than before it.**
   * [§ D171](../../../../DECISIONS.md) narrowed R10 away from `schema` provenance because *"a
   * description of what a dial does"* is not an interval being translated; `properties.ts` records
   * that the argument is about **what R10 is for** and does not transfer, and scopes this property
   * by surface instead. Had it copied R10's exemption out of symmetry, this string would have been
   * exempt on the surface where it is a defect — and still swept on the Parameters tab, where it is
   * not. A rule inherited is a rule nobody chose.
   *
   * Which makes the fix `core`'s rather than the viewer's — or `campaign/words.ts`'s, which already
   * exists to make `core`'s words player-safe and **already runs on this exact description**:
   * `playerSafeDescription(auction.aggregation)` is a string in this corpus, and the path survives
   * it, because that filter is R10's and R10 is about probability words. A remedy that already
   * touches the sentence and leaves the defect in it is the cheapest place to put the fix and the
   * easiest one to overlook. That is somebody's decision, not a harness edit, so both are recorded
   * here.
   */
  {
    property: 'internal-notation',
    surfaceId: 'campaign/judge.ts#judgeStage',
    tier: 'deep',
    contains: 'published in data/scenario-goals.json',
    finding:
      'the stage verdict’s note names the file the bar is published in. One authored sentence at ' +
      '`judge.ts:268`, reported on every per-replication goal row a stage declares — five kinds ' +
      'across the corpus. Deep tier only: `STANDARD_SPACE` sets `stageProbability: 0`.',
  },
  {
    property: 'internal-notation',
    surfaceId: 'campaign/judge.ts#judgeStage',
    /*
     * **Keyed on the field, and the reason is a fact about violations rather than about this
     * string.** `properties.ts#QUOTE_LIMIT` truncates a quoted string at 220 characters, and
     * `core`'s description of `auction.aggregation` opens *"Who aggregates the prices the one cost
     * engine produces…"* and reaches `docs/01-architecture.md` well past that. A `contains` on the
     * offending words matched nothing and the deep tier stayed red — **caught by running the tier
     * rather than by reading the entry**, which is the second time in this lane that a claim about
     * the deep corpus turned out to need the deep corpus.
     *
     * So the entry names the row, which is what `fieldContains` is for. It costs the sharper
     * failure mode a `contains` would give — a reword that kept the path would not ghost here — and
     * buys the one that matters: the day the path leaves the sentence, this field stops violating
     * and the ghost check says so.
     */
    tier: 'deep',
    fieldContains: 'briefing.editable.auction.aggregation.help',
    finding:
      '`core`’s own description of `auction.aggregation`, re-printed on the campaign brief’s ' +
      'editable-control list, cites a document by path: *"…see docs/01-architecture.md"*. ' +
      '`provenance: schema` on a player surface — the case that would have been exempt had this ' +
      'property copied R10’s § D171 narrowing.',
  },
]);

interface FoundViolation {
  property: string;
  surfaceId: string;
  field: string;
  text: string;
  /** Optional so a hand-written `OUTSTANDING` probe can be compared without inventing one. */
  message?: string;
}

/** Whether this entry is the one that finding is about. One place, so the two directions agree. */
function entryMatches(known: (typeof OUTSTANDING)[number], found: FoundViolation): boolean {
  return (
    known.property === found.property &&
    known.surfaceId === found.surfaceId &&
    ((known.contains !== undefined && found.text.includes(known.contains)) ||
      (known.fieldContains !== undefined && found.field.includes(known.fieldContains)))
  );
}

function matchesOutstanding(found: FoundViolation): boolean {
  return OUTSTANDING.some((known) => entryMatches(known, found));
}

/**
 * Everything a failing case violated — **the original's findings as well as the shrunk one's.**
 *
 * ## The reporting hole this closes, found by adding a seventh property
 *
 * `shrink.ts`'s honesty rule is that a candidate is accepted *"only if it still violates **a**
 * property the original violated"* — deliberately *a*, not *all*, so a reduction cannot wander from
 * an R3 leak to an unrelated R10 hit. The consequence nobody had met until now: on a case that
 * violates **two** properties, a reduction that keeps only the second is a legal step, and the
 * first then disappears from `minimal.violations` — which is the only list these assertions read.
 *
 * That is not hypothetical and it is not this axis's doing. `honesty-9100031` (deep tier) has been
 * failing R3's textual half on `mood.caveat` — *"a quotable average on 6 of 20 consecutive seeds"*,
 * where the run's refused `meanWaitS` also rounds to **20** — and the moment the same case acquired
 * a `whole-run-figure-early` finding, the shrinker was free to reduce toward the new one and drop
 * the old one from the report. A property arriving would have *silenced* an unrelated open finding,
 * with nothing red to say so.
 *
 * So the register is asked about the union. Deduplicated by the tuple a finding is identified by,
 * because an unshrunk failure has `original === minimal` and would otherwise report everything
 * twice.
 */
function violationsOf(failure: HonestyShrinkResult): readonly FoundViolation[] {
  const seen = new Map<string, FoundViolation>();
  for (const found of [...failure.original.violations, ...failure.minimal.violations]) {
    seen.set(`${found.property}|${found.surfaceId}|${found.field}|${found.text}`, found);
  }
  return [...seen.values()];
}

/**
 * The register's second direction, run against whichever corpus the entry says it reproduces in.
 *
 * Shared by the always-on and deep tiers rather than written twice, because *"a register of ghosts
 * is a suppression list"* is one rule and two copies of it drift. See the `tier` field's docstring
 * for why the marker exists at all.
 */
function expectStillFound(tier: 'standard' | 'deep', seen: readonly FoundViolation[]): void {
  for (const known of OUTSTANDING.filter((entry) => entry.tier === tier || entry.tier === 'both')) {
    expect(
      seen.some((found) => entryMatches(known, found)),
      `the ${tier} search no longer finds ${known.property} on ${known.surfaceId}. If it was ` +
        'fixed, delete the OUTSTANDING entry; if the search stopped being able to see it, that is ' +
        'the defect this assertion exists to catch.',
    ).toBe(true);
  }
}

describe('§ D163 clause 1 — no player-facing string asserts what the run refuses', () => {
  it('holds across the always-on corpus, apart from what is recorded as outstanding', () => {
    if (standard.failures.length > 0) {
      console.log(
        `\n${String(standard.failures.length)} honesty counterexample(s):\n\n` +
          standard.failures.map((failure) => formatFailure(failure)).join('\n\n'),
      );
    }
    const unexpected = standard.failures.flatMap((failure) =>
      violationsOf(failure)
        .filter((found) => !matchesOutstanding(found))
        .map((found) => `${failure.minimal.case.caseId}: ${found.property} @ ${found.surfaceId} · ${found.field}`),
    );
    expect(unexpected).toEqual([]);
  });

  it('still finds every violation recorded as outstanding — a register of ghosts is a suppression list', () => {
    expectStillFound('standard', standard.failures.flatMap((failure) => violationsOf(failure)));
  });

  it('negative control: the empty register accepts nothing — an injected violation is unexpected', () => {
    /*
     * **The assertion that stops `OUTSTANDING` from quietly becoming a wildcard.** It was written
     * when the register was empty, because an empty register makes the two assertions above cheap
     * in opposite ways: the second iterates nothing, and the first would pass on a
     * `matchesOutstanding` that matched everything. Neither reason has gone away now the register
     * has two entries — a predicate that returned `true` for every violation would satisfy both
     * directions at once. So a real violation is produced — by fault, on a real case over the
     * shipped data, on a property and a surface **no** entry names — and asserted **not** matched.
     */
    const faulted: HonestyResources = { ...resources, corruptTexts: FAULTS['probability-word'][0]?.fault };
    const outcome = evaluateCase(caseFromSeed(9013, { space: STANDARD_SPACE }), faulted);
    expect(outcome.violations.length).toBeGreaterThan(0);
    expect(outcome.violations.filter((found) => !matchesOutstanding(found))).not.toEqual([]);
  }, 300_000);

  it('shrinks a counterexample to a case a reader can re-run', () => {
    /*
     * Driven with a fault rather than with the register's own findings, because both of those are
     * configuration-*dependent* — one needs a `mood` argument, the other a run that timed out — and
     * the claim here is about the **shrinker**. The fault is configuration-independent (it
     * rewrites the first prose string every case renders), so its minimal case is the smallest
     * the reducers can reach: the smallest building, the shortest horizon, two replications, one
     * arm, no demand override. That is a claim about the **shrinker**, and it was worth keeping
     * when the finding it used to be made about was fixed.
     */
    const faulted: HonestyResources = { ...resources, corruptTexts: FAULTS['probability-word'][0]?.fault };
    const outcome = evaluateCase(caseFromSeed(9021, { space: STANDARD_SPACE }), faulted);
    const shrunk = shrinkCase(outcome, faulted, { budget: 40 });
    const minimal = shrunk.minimal.case;
    expect(shrunk.minimal.violations.some((found) => found.property === 'probability-word')).toBe(true);
    expect(minimal.buildingId).toBe('garden-apartments');
    expect(minimal.durationS).toBe(600);
    expect(minimal.replications).toBe(2);
    expect(minimal.arrivalRatePctPop5min).toBeNull();
    expect(minimal.baselineProfileId).toBe(minimal.candidateProfileId);
    console.log(`\ncounterexample, shrunk:\n${formatFailure(shrunk)}\n`);
  }, 600_000);

  it.runIf(deepCampaignRequested(environment))(
    'holds across the deep corpus, which is the only tier that reaches stages and the 50-run budget',
    () => {
      const seeds = deepSeeds(deepCampaignSize(environment));
      const started = Date.now();
      const deep = runHonestyCampaign({ resources, seeds, space: DEEP_SPACE, shrinkBudget: 60 });
      console.log(
        `\nhonesty search — deep tier\n${formatHonestyStats(deep.stats)}\nwall clock      ${String(Date.now() - started)} ms\n`,
      );
      // The deep tier is where the campaign adapter is exercised, and where R2's replication-budget
      // clause is reachable at all. Both are asserted, so a deep run that quietly drew no stage
      // would be red rather than reassuring.
      expect(deep.stats.surfaces['campaign/judge.ts#judgeStage'] ?? 0).toBeGreaterThan(0);
      if (deep.failures.length > 0) {
        console.log(deep.failures.map((failure) => formatFailure(failure)).join('\n\n'));
      }
      const seen = deep.failures.flatMap((failure) => violationsOf(failure));
      const unexpected = deep.failures.flatMap((failure) =>
        violationsOf(failure)
          .filter((found) => !matchesOutstanding(found))
          .map((found) => `${failure.minimal.case.caseId}: ${found.property} @ ${found.surfaceId} · ${found.field} — ${found.message ?? ''}`),
      );
      expect(unexpected).toEqual([]);
      /*
       * And the register's **other** direction, which this tier never ran before.
       *
       * The always-on tier asserts it for the entries that reproduce there; the canvas banner
       * reproduces only here, because it needs a run whose `status` is not `completed` and
       * `STANDARD_SPACE` has no horizon long enough to produce one. Without this line that entry
       * would be a ghost nobody checked — which is the exact thing the register's docstring calls
       * a suppression list.
       */
      expectStillFound('deep', seen);
    },
    1_800_000,
  );
});

describe('the deep space names the stages `data/campaign.json` actually ships', () => {
  it('matches the parsed campaign in both directions', async () => {
    const { campaign } = await loadHonestyResources();
    const shipped = campaign.stages.map((stage) => `${stage.id}@${stage.building}`).sort();
    const searched = DEEP_SPACE.stages.map((stage) => `${stage.id}@${stage.buildingId}`).sort();
    // Subset, because a stage the search invented would judge goals against a batch nobody ran;
    // superset, because a stage added to `data/` and not to the space is a stage nobody searches.
    expect(searched).toEqual(shipped);
  });
});
