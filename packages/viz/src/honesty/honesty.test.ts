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
  runHonestyCampaign,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  SURFACE_ADAPTERS,
  evaluateCase,
  shrinkCase,
  type HonestyCampaignResult,
  type HonestyResources,
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

  it('the corpus reaches every shipped building and every generated mode', () => {
    expect(Object.keys(standard.stats.buildings).sort()).toEqual([...STANDARD_SPACE.buildingIds].sort());
    expect(Object.keys(standard.stats.modes).sort()).toEqual([...HONESTY_MODES].sort());
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
 * What the search **found**, pinned in both directions.
 *
 * A found violation is a result before it is a patch. Fixing this one is not this lane's call —
 * `campaign/words.ts` records a deliberate decision that the Parameters tab is a schema surface
 * and *"may show it"*, and § D163 clause 1 says *"no probability word **anywhere**"*; those two
 * sentences disagree, and resolving a disagreement between a shipped decision and a phase gate is
 * the orchestrator's, not a harness author's.
 *
 * So it is recorded here, asserted **both ways**, which is what stops the register becoming a
 * suppression list:
 *
 * - nothing outside it may fail — a new violation is red;
 * - everything in it must still be found — a finding that is fixed, or that the search stops
 *   being able to see, is also red, with a message saying to delete the entry.
 */
const OUTSTANDING: readonly {
  readonly property: string;
  readonly surfaceId: string;
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
  {
    property: 'probability-word',
    surfaceId: 'controls/controls.ts#controlsFor',
    contains: 'likely to appear soon',
    finding:
      "R10 leak on the Parameters tab. `core`'s `idle.predictorHorizonS` declares a " +
      'SearchParameter.description containing the words "likely to appear soon"; `controlsFor` ' +
      'copies it verbatim into `Control.help`, `renderControls` puts it in a `<p class=' +
      '"control-help">`, and `dev/parameterForm.ts` writes that node\'s text into the page. The ' +
      'shipped remedy for exactly this string — `campaign/words.ts#playerSafeDescription` — ' +
      'exists, is driven by this search on the same text, and correctly replaces it; the ' +
      'Parameters tab is the one surface that does not call it. `words.ts` records the exemption ' +
      'deliberately ("the Parameters tab is a schema surface and may show it"), and § D163 ' +
      'clause 1 says "no probability word anywhere". Reported, not patched.',
  },
  {
    property: 'single-run-comparative',
    surfaceId: 'batch/report.ts#batchReport',
    fieldContains: 'comparisons[',
    finding:
      'R2 budget leak in the Compare panel. `compareMetric` emits `verdict: "resolved"` and names ' +
      'a winner — "…the zoned-uppeak arm is the one that came out ahead on this row" — as soon as ' +
      'the paired interval excludes zero, which needs `pairing.candidate.length >= 2` and nothing ' +
      'else. `dev/batchPanel.ts` refuses only `replications < 1`, so a reader can produce that row ' +
      'over 2–49 replications, and the search does: measured here at n = 7 and n = 8 on ' +
      'observation-class rows (rides over the long-wait threshold, persons per 5 min, unserved ' +
      'fraction), which survive at small n because the estimate-class rows suppress first. R2\'s ' +
      'own text requires "a paired-t interval excluding zero over 50–200 replications under ' +
      'common random numbers", and `MIN_REPLICATION_BUDGET` is that lower bound as a shipped ' +
      'constant. **The counter-argument, recorded rather than ignored:** `batchReport` does emit ' +
      '`budgetNote` below 50 and `dev/batchPanel.ts` draws it, so the reader is told — in a ' +
      'different row. Whether that satisfies R2 or is R13 clause one\'s defect one level up is a ' +
      'judgement about the contract, not about the code. Reported, not patched.',
  },
]);

function matchesOutstanding(found: {
  property: string;
  surfaceId: string;
  field: string;
  text: string;
}): boolean {
  return OUTSTANDING.some(
    (known) =>
      known.property === found.property &&
      known.surfaceId === found.surfaceId &&
      ((known.contains !== undefined && found.text.includes(known.contains)) ||
        (known.fieldContains !== undefined && found.field.includes(known.fieldContains))),
  );
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
      failure.minimal.violations
        .filter((found) => !matchesOutstanding(found))
        .map((found) => `${failure.minimal.case.caseId}: ${found.property} @ ${found.surfaceId} · ${found.field} — ${found.message}`),
    );
    expect(unexpected).toEqual([]);
  });

  it('still finds every violation recorded as outstanding — a register of ghosts is a suppression list', () => {
    const seen = standard.failures.flatMap((failure) => failure.minimal.violations);
    for (const known of OUTSTANDING) {
      expect(
        seen.some(
          (found) =>
            found.property === known.property &&
            found.surfaceId === known.surfaceId &&
            ((known.contains !== undefined && found.text.includes(known.contains)) ||
              (known.fieldContains !== undefined && found.field.includes(known.fieldContains))),
        ),
        `the search no longer finds ${known.property} on ${known.surfaceId}. If it was fixed, ` +
          'delete the OUTSTANDING entry; if the search stopped being able to see it, that is the ' +
          'defect this assertion exists to catch.',
      ).toBe(true);
    }
  });

  it('shrinks the outstanding finding to a case a reader can re-run', () => {
    // The finding is configuration-independent — it is a schema string on a surface every case
    // renders — so its minimal case should be the smallest the reducers can reach: the smallest
    // building, the shortest horizon, two replications, one arm, no demand override.
    const failure = standard.failures.find((candidate) =>
      candidate.minimal.violations.some((found) => found.property === 'probability-word'),
    );
    expect(failure).toBeDefined();
    const minimal = failure?.minimal.case;
    expect(minimal?.buildingId).toBe('garden-apartments');
    expect(minimal?.durationS).toBe(600);
    expect(minimal?.replications).toBe(2);
    expect(minimal?.arrivalRatePctPop5min).toBeNull();
    expect(minimal?.baselineProfileId).toBe(minimal?.candidateProfileId);
    console.log(`\noutstanding finding, shrunk:\n${formatFailure(failure!)}\n`);
  });

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
      const unexpected = deep.failures.flatMap((failure) =>
        failure.minimal.violations
          .filter((found) => !matchesOutstanding(found))
          .map((found) => `${failure.minimal.case.caseId}: ${found.property} @ ${found.surfaceId} · ${found.field} — ${found.message}`),
      );
      expect(unexpected).toEqual([]);
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
