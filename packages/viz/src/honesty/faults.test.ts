/**
 * Every property, shown failing on purpose.
 *
 * **A search that has never caught anything is indistinguishable from a search that cannot.**
 * That sentence is why this file exists and it is the exact risk § D163 names: the wave that
 * wrote the gate also found **six tests that could not fail**, by five distinct mechanisms, one of
 * them the instrument that checks for tests that cannot fail. This search is the same class of
 * instrument, so it carries the same obligation — break, on purpose, the exact thing each
 * property protects, and watch it fire.
 *
 * Every fault runs on a **real case over the shipped `data/`**. Nothing is mocked and nothing
 * about the run changes: the recording, the batch and the statistics every property consults are
 * the real ones, and only what a surface *said* is corrupted. A property that merely echoed the
 * statistics would sail past all nine faults below.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { caseFromSeed, evaluateCase, shrinkCase, STANDARD_SPACE, DEEP_SPACE, HONESTY_PROPERTIES, type HonestyResources } from './index.js';
import { FAULTS } from './faults.js';
import { loadHonestyResources } from './resources.test-helper.js';
import type { HonestyCase, HonestyProperty } from './types.js';

let resources: HonestyResources;

beforeAll(async () => {
  ({ resources } = await loadHonestyResources());
}, 300_000);

/**
 * Two cases, and both are needed.
 *
 * `QUOTABLE` is a run whose summary stands behind its estimates; `SUPPRESSED` is one that refuses
 * them. R3's fault can only be injected into the second — there is no suppressed figure to
 * un-suppress on the first — and R13's clause one can only be injected into the first, because a
 * suppressed run has no estimate to take the count off. A single fixture would have made one of
 * the two faults silently a no-op, which is the shape this file exists to refuse.
 */
const CANDIDATE_SEEDS = [9001, 9004, 9009, 9016, 9023, 9031, 9040, 9047];

let quotable: HonestyCase;
let suppressed: HonestyCase;

beforeAll(() => {
  for (const seed of CANDIDATE_SEEDS) {
    const honestyCase = caseFromSeed(seed, { space: STANDARD_SPACE });
    const outcome = evaluateCase(honestyCase, resources);
    if (outcome.suppressed) suppressed ??= honestyCase;
    else quotable ??= honestyCase;
  }
  if (quotable === undefined || suppressed === undefined) {
    throw new Error(
      'the fault fixtures need one quotable and one suppressed run among the candidate seeds; ' +
        'the corpus no longer produces both, which is itself a finding about the search space',
    );
  }
}, 300_000);

/** Which fixture each property's fault needs, and why. Stated, so a wrong pairing is visible. */
const FIXTURE_FOR: Readonly<Record<HonestyProperty, 'quotable' | 'suppressed'>> = Object.freeze({
  // R3 needs a figure the summary already refused, so the fault can un-refuse it.
  'suppressed-mean': 'suppressed',
  'single-run-comparative': 'quotable',
  'probability-word': 'quotable',
  // R13 clause one needs an estimate to take the `n` away from.
  'estimate-without-n': 'quotable',
  'energy-wait-blend': 'quotable',
  'goal-without-rate': 'quotable',
  /*
   * R6 needs neither, and takes `quotable` for the reason the others do: `sampleTimes` drives every
   * single-run surface at four playheads short of `endedAt` on **every** case, so the temporal axis
   * is populated whatever the summary decided about the means. `wholeRunCountInProse` does need
   * `summary.delivered` to be a number the playhead cannot reach, and it checks that itself rather
   * than relying on the fixture — a fault that silently became a no-op is what this file exists to
   * refuse.
   */
  'whole-run-figure-early': 'quotable',
});

describe('every property fires when the thing it protects is broken', () => {
  it('has a fault for every property, and no fault for a property that does not exist', () => {
    expect(Object.keys(FAULTS).sort()).toEqual([...HONESTY_PROPERTIES].sort());
    expect(Object.keys(FIXTURE_FOR).sort()).toEqual([...HONESTY_PROPERTIES].sort());
  });

  for (const property of HONESTY_PROPERTIES) {
    for (const { name, fault } of FAULTS[property]) {
      it(`${property} — ${name}`, () => {
        const fixture = FIXTURE_FOR[property] === 'suppressed' ? suppressed : quotable;

        const clean = evaluateCase(fixture, resources);
        const cleanHits = clean.violations.filter((found) => found.property === property);

        const faulted = evaluateCase(fixture, { ...resources, corruptTexts: fault });
        const faultedHits = faulted.violations.filter((found) => found.property === property);

        // The fault produced *new* violations of *this* property. Comparing against the clean run
        // rather than against zero is what keeps the assertion meaningful on a property that has
        // an outstanding finding on every case — as `probability-word` did until § D171 resolved
        // it — because an assertion of `> 0` would pass for that reason alone. The comparison is
        // kept now the register is empty: it costs nothing and it is the form that survives the
        // next finding.
        expect(
          faultedHits.length,
          `${name} produced no new ${property} violation (clean ${String(cleanHits.length)}, ` +
            `faulted ${String(faultedHits.length)})`,
        ).toBeGreaterThan(cleanHits.length);

        // And it is the fault's own string that is being reported, not a coincidence elsewhere.
        const fresh = faultedHits.filter(
          (found) => !cleanHits.some((before) => before.field === found.field && before.text === found.text),
        );
        expect(fresh.length, `${name} produced no *new* offending string`).toBeGreaterThan(0);
        console.log(
          `  ${property} · ${name} → ${fresh[0]?.surfaceId ?? ''} · ${fresh[0]?.field ?? ''}\n` +
            `      ${JSON.stringify(fresh[0]?.text.slice(0, 140) ?? '')}`,
        );
      }, 120_000);
    }
  }

  it('negative control: the clean run does not fail the properties the faults target', () => {
    // Without this, every assertion above would pass on a harness that reported every property
    // violated on every case — the mirror image of the dead-harness failure, and just as useless.
    const clean = evaluateCase(quotable, resources);
    const properties = new Set(clean.violations.map((found) => found.property));
    /*
     * **One entry, and it is the register's, not a habit.** This list was empty from § D171 — which
     * removed the R10 finding on the Parameters tab by narrowing the rule — until the temporal axis
     * ran and found `render/describeFrame.ts` joining every `MoodDriver` ungated. That finding is
     * recorded in `honesty.test.ts`'s `OUTSTANDING`, with its surface, its reachability and what
     * would close it; this is the same fact seen from here.
     *
     * The assertion is still exact in both directions: an eighth property going off on a clean run
     * is red, and the day `describeFrame` is gated this line goes red too, telling whoever fixed it
     * to delete the entry. It is not `toContain`, and it must not become one.
     */
    expect([...properties].sort()).toEqual(['whole-run-figure-early']);

    // And the finding is the one recorded, not a second one wearing its property name.
    expect(
      [...new Set(clean.violations.map((found) => found.surfaceId))],
    ).toEqual(['render/describeFrame.ts#describeFrame']);
  });

  it('a fault survives shrinking, and the shrunk case is smaller', () => {
    const fault = FAULTS['energy-wait-blend'][0]?.fault;
    const faulted: HonestyResources = { ...resources, corruptTexts: fault };
    // A deliberately large case, so there is something to reduce.
    const large: HonestyCase = {
      ...caseFromSeed(9002, { space: DEEP_SPACE }),
      buildingId: 'midtown-office',
      stageId: null,
      durationS: 900,
      replications: 6,
      arrivalRatePctPop5min: 8,
    };
    const outcome = evaluateCase(large, faulted);
    expect(outcome.violations.some((found) => found.property === 'energy-wait-blend')).toBe(true);

    const shrunk = shrinkCase(outcome, faulted, { budget: 20 });
    expect(shrunk.steps).toBeGreaterThan(0);
    expect(shrunk.minimal.violations.some((found) => found.property === 'energy-wait-blend')).toBe(true);
    const smaller =
      shrunk.minimal.case.replications < large.replications ||
      shrunk.minimal.case.durationS < large.durationS ||
      shrunk.minimal.case.arrivalRatePctPop5min === null ||
      shrunk.minimal.case.buildingId !== large.buildingId;
    expect(smaller, JSON.stringify(shrunk.minimal.case)).toBe(true);
    // One suffix per accepted reduction, from the original — never a chain.
    expect(shrunk.minimal.case.caseId).toBe(`${outcome.case.caseId}-s${String(shrunk.steps)}`);
  }, 300_000);
});
