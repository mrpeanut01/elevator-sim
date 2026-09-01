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
 * statistics would sail past all ten faults below.
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
 * Three cases, and each is needed.
 *
 * `QUOTABLE` is a run whose summary stands behind its estimates; `SUPPRESSED` is one that refuses
 * them. R3's fault can only be injected into the second — there is no suppressed figure to
 * un-suppress on the first — and R13's clause one can only be injected into the first, because a
 * suppressed run has no estimate to take the count off. A single fixture would have made one of
 * the two faults silently a no-op, which is the shape this file exists to refuse.
 *
 * The third is `FITTED_SUPPRESSED` — suppressed **and** running a § 8 fit-out — and it exists for
 * the same reason one axis over. `fittedTowerMeanLeak` is a no-op on a tower as built by
 * construction, so on either of the first two fixtures it would prove nothing while looking green.
 * The last two candidate seeds were appended for it, and appended rather than inserted so the
 * first-match rule above still picks the fixtures it always picked.
 */
const CANDIDATE_SEEDS = [9001, 9004, 9009, 9016, 9023, 9031, 9040, 9047, 9005, 9011];

let quotable: HonestyCase;
let suppressed: HonestyCase;
let fittedSuppressed: HonestyCase;

beforeAll(() => {
  for (const seed of CANDIDATE_SEEDS) {
    const honestyCase = caseFromSeed(seed, { space: STANDARD_SPACE });
    const outcome = evaluateCase(honestyCase, resources);
    if (outcome.suppressed) suppressed ??= honestyCase;
    else quotable ??= honestyCase;
    if (outcome.suppressed && honestyCase.fitOutId !== null) fittedSuppressed ??= honestyCase;
  }
  if (quotable === undefined || suppressed === undefined) {
    throw new Error(
      'the fault fixtures need one quotable and one suppressed run among the candidate seeds; ' +
        'the corpus no longer produces both, which is itself a finding about the search space',
    );
  }
  if (fittedSuppressed === undefined) {
    throw new Error(
      'the fault fixtures need one case that is both fitted and suppressed among the candidate ' +
        'seeds; the corpus no longer produces one, which is itself a finding about the fit-out ' +
        'axis — see honesty/fitOut.ts',
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
  /*
   * § 12.2 needs neither: the withheld matrix is enumerated from the state model rather than drawn
   * from the run, so all thirty-two states are rendered on every case whatever the summary decided.
   * `quotable` for the same reason as the two above — it is the fixture with more surfaces speaking.
   */
  'withheld-figure-published': 'quotable',
  /*
   * The charter's M2 gate needs neither fixture: it judges words, not figures, and the player
   * surfaces it is scoped to draw their copy on every case whatever the summary decided.
   * `quotable` for the reason the three above take it — it is the fixture with more surfaces
   * speaking, so `replaceFirst` has a `label` string to land on.
   */
  'internal-notation': 'quotable',
  /*
   * T1 / § D359 needs neither fixture, and for a reason none of the eight above have: its readings
   * are taken from a **state** rather than from a run at all — the ask a rail publishes, not the
   * reading it takes — so both faults land on every case whatever the summary decided about the
   * means. `quotable` for the same reason the four above take it, and so that a red here is never
   * confused with a fixture that stopped suppressing.
   */
  'surfaces-disagree': 'quotable',
});

describe('every property fires when the thing it protects is broken', () => {
  it('has a fault for every property, and no fault for a property that does not exist', () => {
    expect(Object.keys(FAULTS).sort()).toEqual([...HONESTY_PROPERTIES].sort());
    expect(Object.keys(FIXTURE_FOR).sort()).toEqual([...HONESTY_PROPERTIES].sort());
  });

  for (const property of HONESTY_PROPERTIES) {
    for (const { name, fault, fixture: wanted } of FAULTS[property]) {
      it(`${property} — ${name}`, () => {
        /*
         * The fault's own declaration wins over the property's, and only a fault that **narrows**
         * what it fires on declares one. See `faults.ts#FAULTS`' `fixture` field.
         */
        const fixture =
          wanted === 'fitted-suppressed'
            ? fittedSuppressed
            : FIXTURE_FOR[property] === 'suppressed'
              ? suppressed
              : quotable;

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

  it('a fitted tower is checked and not merely swept — the fault fires fitted and is silent as built', () => {
    /*
     * **The claim § D437 exists to make, asserted in both directions on one case.**
     *
     * § D427's null result found that no corpus case had ever carried a non-`AS_BUILT` fit-out, so
     * the ten properties had never read a string produced by a fitted run. Seeding the axis fixes
     * *swept*; only this fixes *checked*. `fittedTowerMeanLeak` is `suppressedMeanLeak` with one
     * guard in front of it — a tower as built has bought nothing to lie about — so:
     *
     * - on the **fitted** case it produces a fresh R3 violation, which is a property firing on a
     *   fitted run;
     * - on the **same case with `fitOutId: null`** it produces none, which is what says the firing
     *   came from the fitted half of the corpus rather than from the case being interesting.
     *
     * The as-built arm is asserted against the clean run rather than against zero, for the reason
     * the loop above gives: the register is empty today and the comparison is the form that
     * survives the next finding.
     */
    const fault = FAULTS['suppressed-mean'].find((entry) => entry.name === 'fittedTowerMeanLeak')?.fault;
    expect(fault, 'fittedTowerMeanLeak is no longer registered').toBeDefined();
    const faulted: HonestyResources = { ...resources, corruptTexts: fault };

    expect(fittedSuppressed.fitOutId, 'the fixture must be a fitted tower').not.toBeNull();
    const hits = (outcome: ReturnType<typeof evaluateCase>): number =>
      outcome.violations.filter((found) => found.property === 'suppressed-mean').length;

    const cleanFitted = evaluateCase(fittedSuppressed, resources);
    const brokenFitted = evaluateCase(fittedSuppressed, faulted);
    expect(brokenFitted.suppressed, 'the fixture must still refuse its estimates').toBe(true);
    expect(hits(brokenFitted)).toBeGreaterThan(hits(cleanFitted));

    /*
     * The same case as built. It is put back by the one field, so nothing else about the case
     * moves — the seed, the building, the dispatchers, the horizon and the demand are the fitted
     * case's own, which is what makes the silence attributable to the fit-out and to nothing else.
     */
    const asBuilt = { ...fittedSuppressed, fitOutId: null };
    const cleanAsBuilt = evaluateCase(asBuilt, resources);
    const brokenAsBuilt = evaluateCase(asBuilt, faulted);
    expect(hits(brokenAsBuilt)).toBe(hits(cleanAsBuilt));
  }, 300_000);

  it('negative control: the clean run does not fail the properties the faults target', () => {
    // Without this, every assertion above would pass on a harness that reported every property
    // violated on every case — the mirror image of the dead-harness failure, and just as useless.
    const clean = evaluateCase(quotable, resources);
    const properties = new Set(clean.violations.map((found) => found.property));
    /*
     * **Empty for the third time, and this is the one the previous note predicted.**
     *
     * It emptied at § D171, which removed the R10 finding on the Parameters tab by narrowing the
     * rule; it acquired one entry when the temporal axis found `render/describeFrame.ts` joining
     * every `MoodDriver` ungated; it emptied again because that join is now gated on
     * `MoodDriver.basis` the way § D293 gated the rail's copy of it; and it acquired
     * `internal-notation` on four player surfaces the day `CHARTER_PROGRAMME.md` § M2's third exit
     * criterion got an instrument, because the criterion was failing and the lane that built the
     * instrument deliberately did not build the fix.
     *
     * That note ended: *"**The day #207 lands, this goes back to `[]` on the same commit**, and the
     * register empties with it."* GitHub issue #207 has landed, both halves are `[]`, and
     * `honesty.test.ts`'s `OUTSTANDING` is empty on the same commit. **The two agreeing is the
     * whole point of this line existing** — a finding recorded rather than fixed has to be added
     * here as well, which is what stops a register entry being written without anybody noticing the
     * clean run had started failing, and it runs in reverse too: neither half may empty while the
     * other still names something.
     *
     * The assertion is exact in both directions and must stay that way: a tenth property going off
     * on a clean run is red, and so is a registered finding that this run cannot see. It is not
     * `toContain`, and it must not become one. The surface list is asserted **empty rather than
     * deleted**, because an empty list is a state that has to keep being checked rather than a rule
     * that can be dropped — the same reason `screens.ts`'s `UNBUILT_REASONS` stays where it is now
     * that every screen is built.
     */
    expect([...properties].sort()).toEqual([]);
    expect([...new Set(clean.violations.map((found) => found.surfaceId))]).toEqual([]);
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
