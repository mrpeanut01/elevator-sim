/**
 * **The closed form on the three shipped buildings the five-building table does not reach.**
 *
 * GitHub issue #232's third acceptance criterion asks a new building for *"a closed-form
 * round-trip-time check like the existing five"*. This file exists because that criterion had been
 * audited twice and read two different ways, and both readings were wrong in the same direction.
 *
 * ## What "the existing five" is, and it does exist
 *
 * It is {@link ./fiveBuildings.test.ts} — Midtown Office, Garden Apartments, Secure Tower,
 * Mixed-Use High-Rise and Vertical City, each reconciled against the Barney/CIBSE round trip on its
 * principal bank, always-on, at 64 replications. The issue's own audit comment reported *"I could
 * find only **two**"*, having looked in `packages/core/src/analytical/validation.test.ts` (which
 * does carry exactly two, Midtown and Garden) and in `packages/core/src/sim/oracle.test.ts`. It did
 * not look in `packages/experiments/src/oracle/`, where the other three live and where both
 * `docs/05-roadmap.md`'s Phase 8 track table and `docs/07-handoff.md` § "Closed-form RTT residuals —
 * all five buildings" already point.
 *
 * So the count in the criterion was right and the count in the audit was wrong. **The gap is real
 * and it is somewhere else**: the shipped set went from five buildings to eight
 * (`DECISIONS.md` § D213) and a ninth landed with GitHub issue #376, and the table was never
 * extended. `fiveBuildings.test.ts`'s own guard names the four it does not reach. This file takes
 * three of them; the fourth, `burj-class-reference`, is #376's third criterion by name and is left
 * to it rather than absorbed here.
 *
 * ## The three, and why they are three different kinds of check
 *
 * They are not three copies of one measurement, and saying so is the point — a check that pretended
 * a heterogeneous bank reconciles would be *"a different calculation wearing its name"*, which is
 * how `fiveBuildings.test.ts` already words the limit.
 *
 * | building | what the closed form can say | cost |
 * |---|---|---|
 * | `chancery-house` | **reconciles** — a sixth full measurement, on the same apparatus at the same 64 replications | one bank simulated |
 * | `crown-hotel` | the closed form is **offered and refuses**, and the refusal is measured rather than asserted | one bank simulated |
 * | `st-jude-hospital` | refused **twice**, and both refusals are arithmetic — no simulation at all | free |
 *
 * ## Chancery House is the one shipped bank the closed form describes with no caveat
 *
 * `analyzeUpPeak` raises no warning on it at all. `burj-class-reference`'s `local-zone1` and
 * `local-zone2` raise none either — review measured all 23 shipped banks, and an earlier draft of
 * this sentence claimed uniqueness it had not checked. Every other shipped bank
 * raises at least one — `expressZone`, `nonUniformFloorPopulations`, `saturatedStops`,
 * `heterogeneousGroup`, `implausibleHandlingCapacity`, or several. Nineteen floors, six identical
 * cars, one bank, uniform populations, uniform pitch, no zoning. That the cleanest case in the
 * shipped set was the one with no check is the thing this file corrects, and the empty warning list
 * is asserted below rather than left as a remark, because it is what makes the residual mean what
 * it says.
 *
 * ## This docstring is the record
 *
 * No `DECISIONS.md` heading is taken. Under `DECISIONS.md` § D405 an entry is due when a
 * decision reaches past the module that took it; this one extends an existing measurement over three
 * more of the buildings it was always meant to cover, moves nothing already recorded, and refuses
 * nothing that was previously allowed. The two documents touched alongside it —
 * `docs/05-roadmap.md`'s and `docs/07-handoff.md`'s analytical-cross-validation rows — gain a
 * pointer to this file and the figures it measures, which is a citation rather than a ruling.
 *
 * ## No new reference value is introduced here
 *
 * The seeds, the replication count, the overload factor, the residual tolerance and the closed form
 * itself are the constants `fiveBuildings.test.ts` already runs on; `CLAUDE.md`'s rule about citing
 * reference data is not reached because nothing here authors one. The figures in this docstring are
 * measurements, and each names the run that produced it: `REPLICATIONS = 64` seeds from 810 000,
 * `peakWindowS` 900, `collective` parked at the lobby, on the shipped `data/` directory.
 *
 * ## Runtime
 *
 * Always-on: two banks simulated at 64 replications, measured at **22.3 s, 27.0 s and 29.3 s**
 * across three runs on the machine this was written on — which was running five other agents' suites
 * at the time, so the spread is load rather than variance in the measurement. `st-jude-hospital`
 * costs nothing at all: its refusal is decided from the configuration before a single replication
 * runs.
 *
 * One further arm attributes Crown Hotel's residual — the counterfactual described below. It was
 * opt-in under `ELEVATOR_SIM_DEEP=1` until review found the cost that justified gating it did not
 * reproduce; it costs 4.7 s and runs always-on. The
 * split follows `deepCampaign.test.ts`: the budget is moved rather than reduced, and skipping it
 * skips it visibly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  CLOSED_FORM_ASSUMPTIONS,
  CLOSED_FORM_COMPARISON_RULE,
  UP_PEAK_WARNING_CODES,
  loadConfig,
  parseBuilding,
  resolveBuilding,
} from '@elevator-sim/core';
import type { LoadedConfig, ResolvedBuilding } from '@elevator-sim/core';

import { DEFAULT_RESIDUAL_TOLERANCE, reconcileRoundTrip, relativeDivergence } from './reconcile.js';
import type { RoundTripReconciliation } from './types.js';
import { completedOf, deriveUpPeakCase, measureUpPeak } from './upPeakCase.js';
import type { UpPeakMeasurement } from './upPeakCase.js';
import { DATA_DIR } from '../validation/harness.js';

/* -------------------------------------------------------------------------- *
 * Experiment design — deliberately the five-building table's own constants
 * -------------------------------------------------------------------------- */

/**
 * The same budget `fiveBuildings.test.ts` runs, and the same seed base, on purpose.
 *
 * A sixth reconciliation taken at a different `n` on a different seed base would be a sixth
 * apparatus, and then a disagreement with the five could not be told from a disagreement between
 * two ways of measuring. `docs/03-traffic-and-statistics.md` § Part 3 budgets 50–200.
 */
const REPLICATIONS = 64;
const FIRST_SEED = 810_000;
const SEEDS = Array.from({ length: REPLICATIONS }, (_, index) => FIRST_SEED + index);
const PEAK_WINDOW_S = 900;

/**
 * The counterfactual arm is opt-in, at the same budget, for a cost measured rather than guessed.
 *
 * `deepCampaign.test.ts` § "Why a split rather than a cap" is the rule this follows: a replication
 * budget quietly reduced to fit a CI window is a weakened criterion that still gets published, so
 * the budget is **moved rather than reduced**. This arm runs at the same 64 replications on the same
 * seeds as everything else in this file.
 *
 * ```sh
 * npx vitest run --project experiments src/oracle/remainingBuildings.test.ts
 * ```
 *
 * **It was gated behind `ELEVATOR_SIM_DEEP=1` on a cost that does not exist, and is not any more.**
 * The gate's stated reason was that the uniform bank carries proportionally more demand and so
 * costs *"~75 s against ~8 s for the shipped arm — an order of magnitude"*. Review re-measured it
 * and neither figure reproduces: the two arms cost **5.20 s and 5.26 s**, a ratio of **1.01**, and
 * the whole file goes **13.70 s → 18.41 s** with the arm switched on. The demand does move, by
 * **+2.3 %** (16.605 → 16.994 %POP/5 min), which is not an order of magnitude and was never going
 * to be one.
 *
 * That mattered rather than being untidy: this arm is the **only** evidence licensing this file's
 * central claim about Crown Hotel, and it was being excluded from every pull-request run on the
 * strength of a number nobody had re-derived. Four and a half seconds does not buy that. It runs
 * always-on now.
 *
 * The `oracle-campaign` job still names this file with `ELEVATOR_SIM_DEEP=1` set. That step is now
 * redundant rather than wrong — it re-runs a file that no longer reads the variable — and
 * `.github/workflows/**` is a protected path this branch may not edit, so it is recorded here for
 * whoever can.
 *
 * **A smaller `n` was tried and rejected on evidence rather than on taste.** At 4 replications the
 * control's own assertion fails, so the read-out is not settled there; it is not a boolean that can
 * be had cheaply. Reducing `n` until it fits would have been the exact move the rule above forbids.
 *
 * **The other uniform direction was tried first and does not exist.** Giving every car the *service*
 * car's 1.75 m/s / 4 000 lb specification produces a bank whose longest door reopen (37.70 s) is not
 * shorter than its shortest round trip (33.81 s), so `departureGapBracket` refuses it — the same
 * limit that closes `st-jude-hospital` below. A big slow car is exactly the shape that defeats the
 * reconstruction, which is why the counterfactual is the fast one.
 */

/**
 * The five ids `fiveBuildings.test.ts` reconciles.
 *
 * Transcribed here and asserted against the configuration below rather than imported, because
 * importing a `*.test.ts` from another `*.test.ts` collects its cases into this file. The pair is
 * deliberately checked in **both** files: `fiveBuildings.test.ts` asserts which buildings it does
 * *not* reach, and this one asserts the complement. A tenth building trips two guards, not none.
 */
const RECONCILED_IN_THE_FIVE_BUILDING_TABLE: readonly string[] = [
  'garden-apartments',
  'midtown-office',
  'mixed-use-high-rise',
  'secure-tower',
  'vertical-city',
];

/** Reconciled here — coverable, and now covered. */
const RECONCILED_HERE = 'chancery-house';

/**
 * Refused here, with the mechanism, because the Barney/CIBSE derivation assumes one car
 * specification per bank and both of these hold cars that differ in speed and capacity on purpose.
 *
 * `DECISIONS.md` § D213 § 3 is the decision that authored them that way and states the reason: two
 * banks would make every guest floor and every ward *a floor served by two banks*, which
 * `buildingConnectivity.test.ts` requires to be `isTransferFloor` — a sky lobby. A hotel bedroom
 * corridor is not a sky lobby, so the honest move was one bank with unlike cars. It is *"the first
 * time any shipped bank has held cars that differ in speed and capacity"*, and the closed form has
 * no term for it.
 */
const REFUSED_HERE: readonly string[] = ['crown-hotel', 'st-jude-hospital'];

/**
 * Coverable, owed, and deliberately not taken here.
 *
 * `burj-class-reference` landed with GitHub issue #376 and `DECISIONS.md` § D527; four of the five
 * measurements that issue names are taken and the fifth — the Barney/CIBSE round trip per bank at
 * 10 m/s over a rise of several hundred metres — is its third criterion and is open. Four of its
 * six banks reduce to the closed form's scalars today; `shuttle` and `observation` do not, both
 * throwing on a zero served population. Absorbing that into this file would close another issue's
 * criterion inside this one, and the honest thing is to name it as owed.
 */
const OWED_ELSEWHERE: readonly string[] = ['burj-class-reference'];

/**
 * Crown Hotel with its one unlike car made like the others, and **nothing else touched**.
 *
 * This is the counterfactual arm, and without it the residual measured on the shipped hotel could
 * not be attributed to anything. `analyzeUpPeak` raises three warnings on `crown-hotel/main` —
 * `nonUniformFloorPopulations`, `heterogeneousGroup` and `expressZone` — so *"the residual is the
 * heterogeneity"* is a choice of one out of three, and choosing it by argument is precisely the
 * stated mechanism `CLAUDE.md` § "A stated mechanism goes stale the same way" refuses.
 *
 * The variant is built from the shipped file rather than assembled here, so the only difference is
 * the one this function makes: car `S`, the geared 1.75 m/s / 4 000 lb service car, is given `A`'s
 * gearless 3.0 m/s / 3 000 lb specification. The floors, their populations, the express zone, the
 * traffic profile, the entrance, the seeds and the replication count are all the shipped ones.
 */
function crownHotelWithAUniformBank(loaded: LoadedConfig): ResolvedBuilding {
  const file = 'crown-hotel.json';
  const authored = JSON.parse(readFileSync(join(DATA_DIR, 'buildings', file), 'utf8')) as {
    banks: { id: string; cars: Record<string, unknown>[] }[];
  };
  const bank = authored.banks.find((candidate) => candidate.id === 'main');
  if (bank === undefined) throw new Error('crown-hotel declares no bank "main"');
  // The **fastest** car, chosen by measurement rather than by position. Taking `cars[0]` would give
  // the same answer today and silently give the opposite one if the file were ever reordered — and
  // the opposite one does not exist: a bank of five 1.75 m/s / 4 000 lb cars is refused by
  // `departureGapBracket` before it can be reconciled, which is the measurement recorded in this
  // file's header.
  const reference = [...bank.cars].sort(
    (a, b) => Number(b['ratedSpeedMps'] ?? 0) - Number(a['ratedSpeedMps'] ?? 0),
  )[0];
  if (reference === undefined) throw new Error('crown-hotel/main has no cars');
  bank.cars = bank.cars.map((car) => ({
    ...car,
    spec: reference['spec'],
    ratedSpeedMps: reference['ratedSpeedMps'],
    ratedLoadLb: reference['ratedLoadLb'],
    doorType: reference['doorType'],
  }));
  return resolveBuilding(parseBuilding(authored, file), loaded.elevatorSpecs, {
    file,
    trafficProfileIds: new Set(loaded.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

/** The loaded configuration with one building swapped for the variant above. */
function configWith(loaded: LoadedConfig, building: ResolvedBuilding): LoadedConfig {
  const buildingsById = new Map(loaded.buildingsById);
  buildingsById.set(building.id, building);
  return { ...loaded, buildingsById };
}

/** The counterfactual arm's key in {@link measurements} and {@link reconciliations}. */
const CROWN_HOTEL_UNIFORM = 'crown-hotel (counterfactual: one uniform bank)';

let config: LoadedConfig;
const measurements = new Map<string, UpPeakMeasurement>();
const reconciliations = new Map<string, RoundTripReconciliation>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  for (const buildingId of [RECONCILED_HERE, 'crown-hotel']) {
    const measurement = measureUpPeak({
      config,
      buildingId,
      bankId: 'main',
      seeds: SEEDS,
      peakWindowS: PEAK_WINDOW_S,
    });
    measurements.set(buildingId, measurement);
    reconciliations.set(
      buildingId,
      reconcileRoundTrip({
        // `CLOSED_FORM_COMPARISON_RULE.precondition`: the closed form re-evaluated at the load the
        // simulator actually carried, never at 0.8 × capacity.
        closedForm: measurement.matched.result,
        completed: completedOf(measurement),
        measured: measurement.measured,
      }),
    );
  }

  // The counterfactual arm: same seeds, same window, same everything but the car specifications.
  const uniformConfig = configWith(config, crownHotelWithAUniformBank(config));
  const uniform = measureUpPeak({
    config: uniformConfig,
    buildingId: 'crown-hotel',
    bankId: 'main',
    seeds: SEEDS,
    peakWindowS: PEAK_WINDOW_S,
  });
  measurements.set(CROWN_HOTEL_UNIFORM, uniform);
  reconciliations.set(
    CROWN_HOTEL_UNIFORM,
    reconcileRoundTrip({
      closedForm: uniform.matched.result,
      completed: completedOf(uniform),
      measured: uniform.measured,
    }),
  );
}, 900_000);

function measurementOf(buildingId: string): UpPeakMeasurement {
  const measurement = measurements.get(buildingId);
  if (measurement === undefined) throw new Error(`no measurement for "${buildingId}"`);
  return measurement;
}

function reconciliationOf(buildingId: string): RoundTripReconciliation {
  const reconciliation = reconciliations.get(buildingId);
  if (reconciliation === undefined) throw new Error(`no reconciliation for "${buildingId}"`);
  return reconciliation;
}

/* ========================================================================== *
 * The accounting. Derived from disk, so a new building cannot arrive uncovered.
 * ========================================================================== */

describe('every shipped building is accounted for by exactly one closed-form verdict', () => {
  it('partitions the shipped set, in both directions, off the configuration rather than a list', () => {
    const shipped = [...config.buildingsById.keys()].sort();
    const claimed = [
      ...RECONCILED_IN_THE_FIVE_BUILDING_TABLE,
      RECONCILED_HERE,
      ...REFUSED_HERE,
      ...OWED_ELSEWHERE,
    ].sort();
    // Both directions. A building that ships and is claimed by nothing fails on the first
    // comparison; a verdict naming a building that no longer ships fails on the same one, which is
    // the case a one-directional check misses.
    expect(claimed).toEqual(shipped);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('leaves exactly one building owed, and says whose criterion owes it', () => {
    // The count matters. `OWED_ELSEWHERE` growing silently is how "the existing five" became a
    // claim about a set nobody had recounted for two waves.
    expect(OWED_ELSEWHERE).toEqual(['burj-class-reference']);
    const burj = config.buildingsById.get('burj-class-reference');
    expect(burj).toBeDefined();
    // And it is owed rather than impossible: its banks are internally uniform, which is the
    // property the Barney/CIBSE derivation needs and the one `crown-hotel` and `st-jude-hospital`
    // lack.
    for (const bank of burj?.banks ?? []) {
      const specs = new Set(
        bank.cars.map((car) => `${String(car.ratedSpeedMps)}/${String(car.ratedLoadLb)}`),
      );
      expect(specs.size, `burj-class-reference/${bank.id}`).toBe(1);
    }
  });
});

/* ========================================================================== *
 * 1. Chancery House reconciles — a sixth measurement on the fifth's apparatus.
 * ========================================================================== */

describe('Chancery House, pure up-peak, 6 cars', () => {
  it('is the one shipped bank the closed form describes with no caveat at all', () => {
    // The precondition that makes the residual mean what it says. Every warning `analyzeUpPeak`
    // can raise is a way the bank departs from the model; an empty list is the model's own case.
    //
    // This is also the negative control for `heterogeneousGroup` below: the same detector, run over
    // a bank of six identical cars, must stay silent. A detector that fires on everything would
    // pass the two refusals and mean nothing.
    const analysis = measurementOf(RECONCILED_HERE).analysis;
    expect(analysis.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('ran the intended replications, saturated every time, and left enough trips to measure', () => {
    const m = measurementOf(RECONCILED_HERE);
    expect(m.replications).toBe(REPLICATIONS);
    // Saturation is the closed form's own operating point, offered at `OVERLOAD_FACTOR`. A
    // replication that did not saturate would have its interval set by the arrival rate rather
    // than by the round trip, and the agreement would be an artefact of the demand knob.
    expect({ saturated: `${m.saturatedReplications}/${m.replications}` }).toEqual({
      saturated: `${REPLICATIONS}/${REPLICATIONS}`,
    });
    expect(m.allSaturated).toBe(true);
    // Sample-size floors, not tolerances on agreement: the interval is estimated from the gaps
    // between in-window departures, and the matched-load comparison is made over full trips only.
    expect(m.tripCountAll).toBeGreaterThan(REPLICATIONS * 8);
    expect(m.tripCountFull).toBeGreaterThan(200);
    expect(m.tripCountFull / m.tripCountAll).toBeGreaterThan(0.15);
  });

  it('carries the load and makes the stops the closed form prices', () => {
    // `S = N(1 − ((N−1)/N)^P)` is the whole combinatorial content of the formula. If the simulator
    // is not making that many stops the two sides are not describing the same trip, and no timing
    // correction downstream explains anything.
    const m = measurementOf(RECONCILED_HERE);
    const loadDivergence = relativeDivergence(
      m.measured.passengersPerTrip.mean,
      m.analysis.roundTripTerms.passengersPerTrip,
    );
    // The load cell is mass-based against a N(75, 15) mass distribution, so the simulator is not
    // obliged to land on 0.8 × capacity persons.
    expect(Math.abs(loadDivergence)).toBeLessThan(0.05);
    expect(Math.abs(reconciliationOf(RECONCILED_HERE).stopDivergence)).toBeLessThan(0.03);
  });

  it('is out against the textbook expression, in the one direction the rule predicts', () => {
    // Everything the formula omits only ever adds seconds, so a simulator reading *faster* than the
    // closed form would be the alarming case. `CLOSED_FORM_COMPARISON_RULE` predicts one sign.
    const m = measurementOf(RECONCILED_HERE);
    const interval = relativeDivergence(m.measured.intervalS.mean, m.analysis.result.intervalS);
    const capacity = relativeDivergence(
      m.measured.percentPopulation5Min.mean,
      m.analysis.result.percentPopulation5Min,
    );
    expect(interval).toBeGreaterThan(0);
    expect(capacity).toBeLessThan(0);
    expect(m.measured.roundTripS.mean).toBeGreaterThan(m.matched.result.roundTripTimeS);
    // `%POP = 300·P·L / (RTT·U)`, so once the load is matched the two divergences are the same
    // finding seen twice and must be near mirror images.
    expect(Math.abs(interval + capacity)).toBeLessThan(0.09);
  });

  it('is out by exactly the documented simplifications and by nothing else', () => {
    // The measurement `CLAUDE.md` § Correctness oracle actually asks for. Each gap is re-costed by
    // running the closed form's own population model with this project's jerk-limited `travelTime`
    // and real dwell policy; the residual is what no documented simplification explains.
    //
    // Measured: raw +49.297 %, residual **+0.074 %**, at n = 64 from seed 810 000 — the smallest
    // residual of any shipped bank, which is what a bank with no warnings should look like.
    const r = reconciliationOf(RECONCILED_HERE);
    expect(r.warnings).toEqual([]);
    expect(r.explained).toBe(true);
    expect(Math.abs(r.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);
    // Both corrections are `bias: 'under'`, so both can only add seconds and one cannot rescue the
    // closed form by offsetting the other. That is what makes this an accounting rather than a fit.
    for (const term of r.terms) {
      for (const id of term.assumptionIds) {
        expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === id)?.bias).toBe('under');
        expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain(id);
      }
    }
    // The third correction should vanish: both sides charge `(S+1)·(open + close + start + level)`.
    // A non-zero uncited term invalidates the other two rather than adding to them — and it is
    // exactly the term that does not vanish on `crown-hotel` below.
    const uncitedS = r.terms
      .filter((term) => term.assumptionIds.length === 0)
      .reduce((sum, term) => sum + Math.abs(term.secondsS), 0);
    expect(uncitedS).toBeLessThan(1);
  });

  it('rejects a round trip that is not the one the physics implies', () => {
    // **The check watched failing.** The guards above accept the shipped building; this one feeds
    // the same predicate a measured round trip inflated by 10 % — a simulator that had quietly
    // stopped reaching rated speed, or a building whose authored car got slower — and requires it
    // to be refused. A validator that has never rejected anything is not a validator.
    const m = measurementOf(RECONCILED_HERE);
    const inflated = reconcileRoundTrip({
      closedForm: m.matched.result,
      completed: completedOf(m),
      measured: {
        ...m.measured,
        roundTripS: { ...m.measured.roundTripS, mean: m.measured.roundTripS.mean * 1.1 },
      },
    });
    expect(inflated.explained).toBe(false);
    expect(Math.abs(inflated.residual)).toBeGreaterThan(DEFAULT_RESIDUAL_TOLERANCE);
    // And the same in the other direction: a round trip *shorter* than the corrected model is the
    // alarming sign, because every documented omission is one-sided.
    const deflated = reconcileRoundTrip({
      closedForm: m.matched.result,
      completed: completedOf(m),
      measured: {
        ...m.measured,
        roundTripS: { ...m.measured.roundTripS, mean: m.measured.roundTripS.mean * 0.9 },
      },
    });
    expect(deflated.explained).toBe(false);
  });
});

/* ========================================================================== *
 * 2. Crown Hotel — the closed form is offered, and it refuses. Measured.
 * ========================================================================== */

describe('Crown Hotel is refused, and the refusal is a run rather than a sentence', () => {
  it('discloses the heterogeneity rather than silently averaging it away', () => {
    // The disclosure side. `analyzeUpPeak` does not throw on a mixed bank — it averages speed,
    // capacity and timings across the cars and *says so*. Until this file nothing in the suite
    // asserted `heterogeneousGroup` on any building, so the warning had a non-test caller
    // (`viz/src/authoring/buildingSpec.ts`) and no test that it ever fires on shipped data.
    const analysis = measurementOf('crown-hotel').analysis;
    expect(analysis.warnings.map((warning) => warning.code)).toContain(
      UP_PEAK_WARNING_CODES.heterogeneousGroup,
    );
    // Checked against the configuration rather than trusted: the bank really does hold unlike cars.
    // Four gearless 3.0 m/s guest cars and one geared 1.75 m/s service car — `DECISIONS.md` § D213.
    const bank = config.buildingsById.get('crown-hotel')?.banks.find((b) => b.id === 'main');
    const specs = new Set(
      (bank?.cars ?? []).map((car) => `${String(car.ratedSpeedMps)}/${String(car.ratedLoadLb)}`),
    );
    expect(specs.size, 'crown-hotel/main is uniform after all — it may now be coverable').toBe(2);
  });

  it('does not reconcile, and the residual is far outside the band the six reconciled sit in', () => {
    // **This is the check, and it is the opposite polarity of the five.** The apparatus is run to
    // the end rather than declined, because a refusal recorded as prose goes stale the way
    // `CLAUDE.md` § "A stated refusal goes stale the same way" describes: the only thing that pins
    // a refusal is a run.
    //
    // Measured at n = 64 from seed 810 000: raw +36.513 %, residual **+7.592 %** against a 4 %
    // tolerance, `explained: false`. Chancery House on the same apparatus lands at +0.074 %.
    const r = reconciliationOf('crown-hotel');
    expect(r.explained).toBe(false);
    expect(Math.abs(r.residual)).toBeGreaterThan(DEFAULT_RESIDUAL_TOLERANCE);
    // And it saturated and carried a real sample, so the refusal is not a measurement that failed
    // to happen. It is a measurement that happened and disagrees.
    const m = measurementOf('crown-hotel');
    expect(m.allSaturated).toBe(true);
    expect(m.tripCountFull).toBeGreaterThan(200);
  });

  it('locates the disagreement in the per-stop fixed cost, which no reconciled bank shows', () => {
    // Where it goes wrong, rather than merely that it does. `reconcileRoundTrip` carries a third
    // correction that should vanish — both sides charge `(S+1)·(open + close + start + level)` —
    // and reports it as an uncited term when it does not.
    //
    // On `crown-hotel` it is **−4.50 s**: the completed model charges 79.96 s of fixed stop cost
    // where the closed form charges 84.46 s, a 5.3 % disagreement against the 2 % that holds on
    // every reconciled bank.
    //
    // **That the cause is the averaging is measured and not argued, and the measurement is the
    // counterfactual below** — three warnings fire on this bank, so picking one of them by
    // reasoning would be the stated-mechanism defect `CLAUDE.md` records. What that control finds
    // is that giving the one unlike car its neighbours' specification takes this term from 4.50 s
    // to 0.021 s with the other two warnings untouched.
    const r = reconciliationOf('crown-hotel');
    const uncitedS = r.terms
      .filter((term) => term.assumptionIds.length === 0)
      .reduce((sum, term) => sum + Math.abs(term.secondsS), 0);
    expect(uncitedS).toBeGreaterThan(1);
    const m = measurementOf('crown-hotel');
    const fixedDivergence = relativeDivergence(m.corrected.fixedS, m.matched.result.stopTimeS);
    expect(Math.abs(fixedDivergence)).toBeGreaterThan(0.02);
    // Chancery House, same quantity, same apparatus, on a uniform bank.
    const clean = measurementOf(RECONCILED_HERE);
    expect(
      Math.abs(relativeDivergence(clean.corrected.fixedS, clean.matched.result.stopTimeS)),
    ).toBeLessThan(0.02);
  });

  it('reconciles once the bank is made uniform, which is what attributes the residual', () => {
    // **The controlled arm, and the reason the mechanism above may be stated at all.** Three
    // warnings fire on this bank, so naming one of them as the cause by argument would be the
    // stated-mechanism defect. This changes exactly one of the three — car `S` gets `A`'s
    // specification — holds the floors, the populations, the express zone, the traffic profile, the
    // seeds and the replication count fixed, and re-runs the whole apparatus.
    //
    // Measured, n = 64 from seed 810 000:
    //
    // | arm | `explained` | uncited term |
    // |---|---|---|
    // | `crown-hotel` as shipped | **false** | **4.50 s** |
    // | one car specification changed | **true** | **0.021 s** |
    //
    // The uncited term is the per-stop fixed cost, and it collapses by more than two orders of
    // magnitude. `nonUniformFloorPopulations` and `expressZone` are untouched between the two arms
    // and cannot account for a difference that is zero in one and 4.5 s in the other.
    const shipped = reconciliationOf('crown-hotel');
    const uniform = reconciliationOf(CROWN_HOTEL_UNIFORM);
    expect(shipped.explained).toBe(false);
    expect(uniform.explained).toBe(true);
    expect(Math.abs(uniform.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);
    const uncitedOf = (r: RoundTripReconciliation): number =>
      r.terms
        .filter((term) => term.assumptionIds.length === 0)
        .reduce((sum, term) => sum + Math.abs(term.secondsS), 0);
    // The two figures the table above publishes, pinned to the run that produces them rather than
    // left as prose either side of an assertion that would pass without them.
    expect(uncitedOf(shipped)).toBeGreaterThan(4);
    expect(uncitedOf(uniform)).toBeLessThan(0.1);
    expect(uncitedOf(shipped)).toBeGreaterThan(10 * uncitedOf(uniform));
    // And the counterfactual really is the same building otherwise, checked rather than asserted:
    // the analysis's other two warnings survive the change, so nothing else was quietly altered.
    const codes = measurementOf(CROWN_HOTEL_UNIFORM).analysis.warnings.map(
      (warning) => warning.code,
    );
    expect(codes).not.toContain(UP_PEAK_WARNING_CODES.heterogeneousGroup);
    expect(codes).toContain(UP_PEAK_WARNING_CODES.nonUniformFloorPopulations);
    expect(codes).toContain(UP_PEAK_WARNING_CODES.expressZone);
  });

  /*
   * **One observation recorded without a mechanism, deliberately.**
   *
   * `bankDepartureBracket` takes its timings from `building.cars[0]`. On `crown-hotel/main` that is
   * `A`, a 3.0 m/s guest car, and the 1.75 m/s service car `S` is in the same bank — so the
   * clustering threshold that separates a door reopen from a return is computed from a car that is
   * not representative of the group it is reconstructing.
   *
   * Whether that contributes to the 7.6 % residual is **unmeasured**, and no mechanism is offered
   * for it here. `DECISIONS.md` § D256 is the rule: a plausible sentence in place of a measurement
   * is the defect, not the fix. It is recorded so the next reader of this residual does not have to
   * rediscover it.
   */
});

/* ========================================================================== *
 * 3. St Jude's — refused twice over, and both refusals cost nothing.
 * ========================================================================== */

describe('St Jude’s Hospital is refused twice, and neither refusal needs a simulation', () => {
  it('is refused on the same heterogeneity ground as Crown Hotel', () => {
    const building = config.buildingsById.get('st-jude-hospital');
    expect(building).toBeDefined();
    const derived = deriveUpPeakCase(building!, 'main', config.elevatorSpecs);
    expect(derived.destinationFloorIds.length).toBeGreaterThan(0);
    // Three gearless 2.5 m/s cars and two geared 1.75 m/s bed cars in one bank — § D213 § 3 again.
    const bank = building?.banks.find((candidate) => candidate.id === 'main');
    const specs = new Set(
      (bank?.cars ?? []).map((car) => `${String(car.ratedSpeedMps)}/${String(car.ratedLoadLb)}`),
    );
    expect(specs.size, 'st-jude-hospital/main is uniform after all — it may now be coverable').toBe(
      2,
    );
  });

  it('is refused a second and independent time, before any replication runs', () => {
    // **The stronger of the two, and the one that is not about the closed form at all.** Departures
    // are reconstructed from boarding times, which needs a clustering threshold that separates a
    // door reopen from a car returning to the terminal. On this bank the longest reopen is 53.20 s
    // and the shortest possible round trip is 29.56 s, so no such threshold exists.
    //
    // The same limit closes `mixed-use-high-rise/residential-local` and `vertical-city/zone-6-local`
    // in `fiveBuildings.test.ts`. It is a limit of the reconstruction rather than a defect in the
    // simulator; the fix is a car-position series, which no run record carries.
    //
    // **And it is refused on the most favourable car in the bank.** `bankDepartureBracket` reads
    // `cars[0]`, which here is `A` at 2.5 m/s — the fastest car, therefore the shortest round trip
    // and the easiest bracket to satisfy. The bank also holds 1.75 m/s bed cars, so the real margin
    // is wider than the one the message quotes.
    expect(() =>
      measureUpPeak({
        config,
        buildingId: 'st-jude-hospital',
        bankId: 'main',
        seeds: [FIRST_SEED],
        peakWindowS: PEAK_WINDOW_S,
      }),
    ).toThrow(/no clustering threshold|not shorter than/i);
  });

  it('would stop being refused if the building changed, which is what makes this a check', () => {
    // **Watched failing, in the direction that matters.** The two assertions above are refusals, and
    // a refusal that could never be lifted is decoration. Both are decided by the configuration, so
    // both move the moment the configuration does: a uniform bank fails the `specs.size` assertion
    // by name, and a bank whose reopen dropped below its round trip would stop throwing and fail the
    // assertion above.
    //
    // Demonstrated here on the ground that costs nothing to vary: the detector that fires on this
    // building is silent on a building of identical cars, so it is discriminating rather than
    // universal.
    const uniform = config.buildingsById.get(RECONCILED_HERE)?.banks.find((b) => b.id === 'main');
    const uniformSpecs = new Set(
      (uniform?.cars ?? []).map((car) => `${String(car.ratedSpeedMps)}/${String(car.ratedLoadLb)}`),
    );
    expect(uniformSpecs.size).toBe(1);
    expect(
      measurementOf(RECONCILED_HERE).analysis.warnings.map((warning) => warning.code),
    ).not.toContain(UP_PEAK_WARNING_CODES.heterogeneousGroup);
  });
});
