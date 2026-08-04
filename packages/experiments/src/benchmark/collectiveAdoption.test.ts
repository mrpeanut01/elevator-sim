/**
 * § D209's criterion, checked as a criterion.
 *
 * The always-on tier asserts nothing about how good en-route diversion is. It asserts the two
 * things that make the verdict mean anything — that the cell set is exactly the one § D209
 * pre-registered, neither widened nor rotted, and that {@link adoptionVerdict} can actually
 * **refuse** — and leaves the measurement to the opt-in tier, which costs hours.
 *
 * ```
 * ELEVATOR_SIM_DEEP=1 npx vitest run --testTimeout=14400000 \
 *   packages/experiments/src/benchmark/collectiveAdoption.test.ts
 * ```
 *
 * **Why the refusal tests are the load-bearing half.** A criterion is only worth its
 * pre-registration if it has a state in which it says no. § D209 § 3 has five machine-checkable
 * clauses, and each one below is driven to failure on a study that passes every other clause — so a
 * clause that was accidentally written as a tautology fails here rather than silently accepting.
 * This project has a decision (§ D186) about exactly that shape: a check that accepted the wrong
 * branch and reported zero violations for it.
 */

import { describe, expect, it } from 'vitest';

import type { LoadedConfig } from '@elevator-sim/core';

import { loadResources } from '../validation/harness.js';
import type { PairedComparison } from '../validation/harness.js';

import {
  ADOPTION_HOLDOUT_SEED,
  ADOPTION_LADDERS,
  ADOPTION_REPLICATIONS,
  ADOPTION_STUDY_SEED,
  REQUIRED_BUILDING,
  REQUIRED_SIGNIFICANT_CELLS,
  UP_PEAK_CASE_IDS,
  adoptionVerdict,
  formatAdoptionStudy,
  runCollectiveAdoptionStudy,
  type AdoptionCell,
  type AdoptionStudy,
  type UpPeakCheck,
} from './collectiveAdoption.js';
import type { DiversionCell } from './enRouteDiversion.js';
import { PINNED_ESTIMATES } from './published.js';

const DEEP = process.env['ELEVATOR_SIM_DEEP'] === '1';

/* -------------------------------------------------------------------------- *
 * The cell set — derived, not hand-picked
 * -------------------------------------------------------------------------- */

/**
 * The five buildings § D209 § 2 pre-registered, frozen.
 *
 * **This used to be derived from `data/buildings/`, and that was a latent defect of exactly the
 * kind § D151 exists to prevent.** § D209's criterion was written over the buildings shipped on
 * 2026-08-03, and § D210 and § D212 were both decided against it. Deriving the ladder set from disk
 * means a building added afterwards silently **widens a criterion that has already been decided** —
 * clause 2 would start demanding a quotable cell from a building that did not exist when the clause
 * was written, and three recorded verdicts would quietly come to mean something else.
 *
 * That is the `PRE_REGISTERED_REFERENCE_CANDIDATES` lesson one level up: *"a profile added to
 * `data/dispatcher-profiles.json` afterwards would silently become the new baseline and move every
 * paired figure in the study"*. Same failure, with a building instead of a profile.
 *
 * So the set is **declared**, and the test below asserts two things instead of one: every id here
 * still exists on disk (a frozen list may not rot), and any building NOT here is deliberately out
 * of § D209's scope rather than forgotten. A future criterion that wants the new buildings
 * pre-registers them itself, before it measures anything.
 */
const D209_BUILDINGS: readonly string[] = Object.freeze([
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'vertical-city',
]);

describe('§ D209 § 2 — the ladders', () => {
  it('covers exactly the buildings § D209 pre-registered, and every one still exists', async () => {
    const config: LoadedConfig = await loadResources();
    const shipped = new Set(config.buildingsById.keys());
    const laddered = ADOPTION_LADDERS.map((ladder) => ladder[0]?.building ?? '').sort();

    expect(laddered).toEqual([...D209_BUILDINGS].sort());
    // A frozen list may not rot: an id removed from `data/buildings/` must fail here rather than
    // leave the criterion referring to a building nobody can run.
    for (const id of D209_BUILDINGS) expect(shipped.has(id), `${id} has left data/buildings/`).toBe(true);
  });

  it('leaves buildings that landed after § D209 out of its scope, deliberately', async () => {
    const config: LoadedConfig = await loadResources();
    const later = [...config.buildingsById.keys()].filter((id) => !D209_BUILDINGS.includes(id)).sort();
    // Named rather than merely counted. These exist and are NOT in the criterion, and a reader has
    // to be able to see that it is a decision. Widening § D209 to include them retroactively would
    // change what § D210 and § D212 were decided against, which is the one thing a pre-registration
    // is for.
    expect(later).toEqual(['chancery-house', 'crown-hotel', 'st-jude-hospital']);
  });

  it('descends, and never changes building within a ladder', () => {
    for (const ladder of ADOPTION_LADDERS) {
      expect(ladder.length).toBeGreaterThan(1);
      const building = ladder[0]?.building;
      for (const rung of ladder) expect(rung.building).toBe(building);
      for (let index = 1; index < ladder.length; index += 1) {
        const previous = ladder[index - 1]?.rate ?? 0;
        const current = ladder[index]?.rate ?? 0;
        expect(current, `${String(building)} ladder is not descending`).toBeLessThan(previous);
      }
      // Every rung carries the same call type, or the arms would stop being comparable down the
      // ladder — `metrics/comparability.ts`'s point, applied within a building.
      const callType = ladder[0]?.callType;
      for (const rung of ladder) expect(rung.callType).toBe(callType);
    }
  });

  it('requires the building that refused the mechanism', () => {
    expect(ADOPTION_LADDERS.map((ladder) => ladder[0]?.building)).toContain(REQUIRED_BUILDING);
  });

  it('takes its verdict on a seed disjoint from the one the weight was fitted at', () => {
    expect(ADOPTION_HOLDOUT_SEED).not.toBe(ADOPTION_STUDY_SEED);
    expect(ADOPTION_REPLICATIONS).toBe(200);
  });
});

/* -------------------------------------------------------------------------- *
 * The verdict — every clause driven to failure
 * -------------------------------------------------------------------------- */

/**
 * A paired comparison with the interval a test needs and a coherent everything else.
 *
 * `significant` is **derived from the bounds** rather than passed in, so a fixture cannot declare an
 * interval that straddles zero and call it significant. Half the clauses below turn on the
 * relationship between `significant` and `lower`, and a fixture free to contradict itself would let
 * a clause pass on an input the real study can never produce.
 */
function comparison(mean: number, lower: number, upper: number): PairedComparison {
  const standardError = Math.abs(upper - lower) / 3.92;
  return Object.freeze({
    metric: 'awtS' as const,
    n: ADOPTION_REPLICATIONS,
    candidate: [],
    baseline: [],
    differences: [],
    estimate: Object.freeze({
      n: ADOPTION_REPLICATIONS,
      mean,
      stdDev: standardError * Math.sqrt(ADOPTION_REPLICATIONS),
      standardError,
      confidence: 0.95,
      method: 't' as const,
      degreesOfFreedom: ADOPTION_REPLICATIONS - 1,
      halfWidth: Math.abs(upper - lower) / 2,
      lower,
      upper,
    }),
    significant: lower > 0 || upper < 0,
    varianceOfDifference: 1,
    candidateMean: 0,
    baselineMean: 0,
    varianceCandidate: 1,
    varianceBaseline: 1,
    correlation: 0.9,
    maxAbsDifference: 1,
    exactZeroCount: 0,
  }) as unknown as PairedComparison;
}

/** A cell that passes every clause: paired, live, quotable, significantly better on AWT. */
function goodCell(building: string, rate: number): DiversionCell {
  return {
    building,
    rate,
    waiting: comparison(-0.5, -0.8, -0.2),
    timeToDestination: comparison(-0.3, -0.6, 0.1),
    live: true,
    commonRandomNumbers: true,
    awtIsValid: true,
  };
}

function upPeakPass(caseId: string): UpPeakCheck {
  return {
    caseId,
    waiting: comparison(0, 0, 0),
    timeToDestination: comparison(0, 0, 0),
    awtIsValid: true,
    identical: true,
    commonRandomNumbers: true,
  };
}

/** A study that passes all five machine-checkable clauses. Every test below breaks exactly one. */
function passingStudy(): AdoptionStudy {
  const cells: AdoptionCell[] = ADOPTION_LADDERS.map((ladder) => {
    const rung = ladder[0];
    if (rung === undefined) throw new Error('empty ladder');
    return {
      rung,
      holdout: goodCell(rung.building, rung.rate),
      inSample: goodCell(rung.building, rung.rate),
    };
  });
  return {
    replications: ADOPTION_REPLICATIONS,
    studySeed: ADOPTION_STUDY_SEED,
    holdoutSeed: ADOPTION_HOLDOUT_SEED,
    ladders: [],
    cells,
    upPeak: UP_PEAK_CASE_IDS.map(upPeakPass),
    decomposition: [],
  };
}

describe('§ D209 § 3 — the decision rule', () => {
  it('accepts a study that meets every clause', () => {
    const verdict = adoptionVerdict(passingStudy());
    expect(verdict.failures).toEqual([]);
    expect(verdict.accepted).toBe(true);
    // The control on the controls: with five buildings, the passing study has to clear clause 4's
    // threshold by construction, or these refusal tests would be testing a study that never passed.
    expect(ADOPTION_LADDERS.length).toBeGreaterThanOrEqual(REQUIRED_SIGNIFICANT_CELLS);
  });

  it('refuses when a cell was not live — the inert-switch state', () => {
    const study = passingStudy();
    const cells = [...study.cells];
    const first = cells[0];
    if (first === undefined) throw new Error('no cells');
    cells[0] = { ...first, holdout: { ...first.holdout, live: false } };
    const verdict = adoptionVerdict({ ...study, cells });
    expect(verdict.accepted).toBe(false);
    expect(verdict.pairedAndLive).toBe(false);
  });

  it('refuses when the arms did not see the same traces', () => {
    const study = passingStudy();
    const cells = [...study.cells];
    const first = cells[0];
    if (first === undefined) throw new Error('no cells');
    cells[0] = { ...first, inSample: { ...first.inSample, commonRandomNumbers: false } };
    expect(adoptionVerdict({ ...study, cells }).accepted).toBe(false);
  });

  it('refuses when a building contributed no quotable rung, and names it', () => {
    const study = passingStudy();
    const cells = study.cells.filter((cell) => cell.rung.building !== REQUIRED_BUILDING);
    const verdict = adoptionVerdict({ ...study, cells });
    expect(verdict.accepted).toBe(false);
    expect(verdict.allBuildingsQuotable).toBe(false);
    expect(verdict.failures.join(' ')).toContain(REQUIRED_BUILDING);
    // The refusal has to say *why* the missing building matters, or a reader has no way to tell a
    // building that saturated from a building that was never on the ladder.
    expect(verdict.failures.join(' ')).toContain('want of evidence');
  });

  it('refuses a significant TTD regression, in sample as well as out', () => {
    for (const seed of ['holdout', 'inSample'] as const) {
      const study = passingStudy();
      const cells = [...study.cells];
      const first = cells[0];
      if (first === undefined) throw new Error('no cells');
      cells[0] = {
        ...first,
        [seed]: { ...first[seed], timeToDestination: comparison(1.2, 0.4, 2.0) },
      } as AdoptionCell;
      const verdict = adoptionVerdict({ ...study, cells });
      expect(verdict.accepted, `a TTD regression on the ${seed} seed was accepted`).toBe(false);
      expect(verdict.worseOnNeither).toBe(false);
    }
  });

  it('refuses "not worse" without a gain — the whole point of clause 4', () => {
    const study = passingStudy();
    // Every cell null on AWT: nothing is significantly worse anywhere, and nothing is better.
    const cells = study.cells.map((cell) => ({
      ...cell,
      holdout: { ...cell.holdout, waiting: comparison(-0.05, -0.3, 0.2) },
      inSample: { ...cell.inSample, waiting: comparison(-0.05, -0.3, 0.2) },
    }));
    const verdict = adoptionVerdict({ ...study, cells });
    expect(verdict.accepted).toBe(false);
    expect(verdict.betterOutOfSample).toBe(false);
    expect(verdict.worseOnNeither).toBe(true);
  });

  it('counts clause 4 on the holdout seed only', () => {
    const study = passingStudy();
    // Significant everywhere in sample, null everywhere out of sample. Adoption on the seed the
    // weight was fitted at is exactly what § D209 § 1 refuses to allow.
    const cells = study.cells.map((cell) => ({
      ...cell,
      holdout: { ...cell.holdout, waiting: comparison(-0.05, -0.3, 0.2) },
    }));
    expect(adoptionVerdict({ ...study, cells }).betterOutOfSample).toBe(false);
  });

  it('refuses an up-peak cell whose AWT the project forbids quoting', () => {
    // The half of clause 5 that says *stays quotable*. A refusal drawn from a saturated cell is
    // still a mean this project does not allow itself to read, and arriving at it from the
    // conservative direction does not make it sound.
    const study = passingStudy();
    const upPeak = [...study.upPeak];
    const first = upPeak[0];
    if (first === undefined) throw new Error('no up-peak cells');
    upPeak[0] = { ...first, awtIsValid: false };
    const verdict = adoptionVerdict({ ...study, upPeak });
    expect(verdict.upPeakHolds).toBe(false);
    // And it says which half failed, because "cannot see the cell" and "can see it, and the
    // answer is no" call for different follow-up work.
    expect(verdict.failures.join(' ')).toContain('not quotable');
  });

  it('refuses an up-peak regression, and refuses an up-peak cell that was never run', () => {
    const regressed = passingStudy();
    const upPeak = [...regressed.upPeak];
    const first = upPeak[0];
    if (first === undefined) throw new Error('no up-peak cells');
    upPeak[0] = { ...first, waiting: comparison(0.9, 0.3, 1.5), identical: false };
    const verdict = adoptionVerdict({ ...regressed, upPeak });
    expect(verdict.upPeakHolds).toBe(false);
    expect(verdict.failures.join(' ')).toContain('significantly worse');

    expect(adoptionVerdict({ ...passingStudy(), upPeak: [] }).upPeakHolds).toBe(false);
  });

  it('renders the study and its verdict without throwing on an empty study', () => {
    const empty: AdoptionStudy = {
      replications: ADOPTION_REPLICATIONS,
      studySeed: ADOPTION_STUDY_SEED,
      holdoutSeed: ADOPTION_HOLDOUT_SEED,
      ladders: [],
      cells: [],
      upPeak: [],
      decomposition: [],
    };
    expect(formatAdoptionStudy(empty, adoptionVerdict(empty))).toContain('DO NOT ADOPT');
  });
});

/* -------------------------------------------------------------------------- *
 * The correction — a published claim this repository's own pins refute
 * -------------------------------------------------------------------------- */

/**
 * § D205 and `arms.ts` both asserted that `collective-enroute` is **bit-identical** to `collective`
 * at the two pure up-peak cells, and that *"every pinned figure for the two arms matches to the last
 * digit"*. Six of the eight pinned figures at those cells do not match, and the pin table has said
 * so since the day the arm landed. Nothing could fail on it: the claim is prose about numbers, and
 * no test read the numbers.
 *
 * The half of the explanation that was right is that **the mechanism is inert here** — under pure
 * up-peak cars run to the lobby empty and climb full, so there is almost nothing to divert *for*,
 * and `stageActivity.diversions` is 0. The half that was wrong is the conclusion: the arms differ by
 * `detourPenalty: 0.2` as well as by the setting, and a weight does not need a diversion to fire in
 * order to re-order which car takes a call.
 *
 * So this asserts the pins rather than the prose, in both directions — the metrics that differ must
 * keep differing, and `pctOverLongWait`, which really does match, must keep matching. A future
 * change that made the arms genuinely identical would fail here and have to say why, which is the
 * point: the claim was never checked, and now it cannot go stale in silence.
 */
describe('the up-peak arms are not bit-identical, whatever the docs used to say', () => {
  const benchmark = PINNED_ESTIMATES.benchmark;
  const figure = (key: string): number => {
    const pin = benchmark[key];
    if (pin === undefined) throw new Error(`no pin "${key}"`);
    return pin.mean;
  };

  for (const caseId of UP_PEAK_CASE_IDS) {
    it(`${caseId}: the wait-sensitive metrics differ between collective and collective-enroute`, () => {
      for (const metric of ['awtS', 'ttdMeanS', 'wt95S']) {
        expect(
          figure(`${caseId}/collective-enroute/${metric}`),
          `${caseId}/${metric} — if these are now equal, the mechanism or the weight changed and ` +
            `§ D210's correction has to be re-derived rather than deleted`,
        ).not.toBe(figure(`${caseId}/collective/${metric}`));
      }
    });

    it(`${caseId}: pctOverLongWait really does match, which is where the claim came from`, () => {
      expect(figure(`${caseId}/collective-enroute/pctOverLongWait`)).toBe(
        figure(`${caseId}/collective/pctOverLongWait`),
      );
    });
  }
});

/* -------------------------------------------------------------------------- *
 * The opt-in tier — the measurement itself
 * -------------------------------------------------------------------------- */

describe.skipIf(!DEEP)('§ D209 — the measurement', () => {
  it('runs the study at the pre-registered budget and reports the verdict', async () => {
    const study = await runCollectiveAdoptionStudy({
      onProgress: (line) => process.stdout.write(`${line}\n`),
    });
    const verdict = adoptionVerdict(study);
    process.stdout.write(formatAdoptionStudy(study, verdict));

    // Asserted: the apparatus, never the answer. § D209 decides the answer, and a test that
    // demanded adoption would be a test that had to be weakened when the measurement refused.
    for (const cell of study.cells) {
      expect(cell.holdout.commonRandomNumbers).toBe(true);
      expect(cell.inSample.commonRandomNumbers).toBe(true);
      expect(cell.holdout.awtIsValid).toBe(true);
    }
  }, 14_400_000);
});
