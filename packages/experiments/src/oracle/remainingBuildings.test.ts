/**
 * **The closed form on the five shipped buildings the five-building table does not reach.**
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
 * | `harbour-point` | **reconciles**, on the only other shipped bank `analyzeUpPeak` raises no warning about at all | one bank simulated |
 * | `ashgate` | **reconciles on `main` and is refused on `carpark`** — one building, both verdicts, and the refusal is a throw rather than a sentence | one bank simulated |
 * | `ctf-class-reference` | **reconciles on `local-low`**, and is refused on two of its other four | one bank simulated |
 * | `shanghai-class-reference` | **reconciles on `local-hotel`**, and is refused on the other five | one bank simulated |
 * | `merdeka-class-reference` | **reconciles on `local-hotel`**, and is refused on the other three | one bank simulated |
 * | `crown-hotel` | the closed form is **offered and refuses**, and the refusal is measured rather than asserted | one bank simulated |
 * | `st-jude-hospital` | refused **twice**, and both refusals are arithmetic — no simulation at all | free |
 *
 * ## The three reference towers, and the refusal ground this file had never seen
 *
 * `ctf-class-reference`, `shanghai-class-reference` and `merdeka-class-reference` are GitHub issues
 * #425, #424 and #430. Each reconciles on one bank and is refused on its others, and the refusals
 * fall into three grounds rather than one — which is worth stating because **one of the three is
 * new to this file**:
 *
 * 1. **Zero served population**, the ground `ashgate/carpark` and every supertall shuttle already
 *    meet: `shanghai-class-reference/shuttle` and `merdeka-class-reference/shuttle` serve a terminal
 *    and sky lobbies that house nobody.
 * 2. **`departureGapBracket`**, the ground `st-jude-hospital` meets:
 *    `ctf-class-reference/local-apartments` is 20-person cars at the residential 1.75 s, so a full
 *    load's dwell (32.80 s) outlasts a one-floor round trip (29.05 s).
 * 3. **The run does not deliver everybody inside the drain deadline** — new here, and it is a limit
 *    of the *apparatus* rather than of the closed form. `measureUpPeak` drives an isolated bank at
 *    `OVERLOAD_FACTOR × %POP` of its own computed capacity, so a bank with twenty or thirty cars is
 *    offered a crowd in proportion: `merdeka-class-reference/local-low` is handed **5 695 journeys**
 *    in 5 400 s and leaves 1 351 of them in the system. Measured, not argued: `ctf-class-reference`'s
 *    eight-car banks complete and `shanghai-class-reference`'s and `merdeka-class-reference`'s
 *    twenty-to-thirty-four-car banks do not. **No mechanism is offered for exactly where the
 *    threshold is** — that would need a sweep over bank sizes, and a plausible sentence in place of a
 *    measurement is what [§ D256](../../../../DECISIONS.md) refuses.
 *
 * So the largest lift group in `data/buildings/` is measurable by this apparatus on its *smallest*
 * bank and on none of its others, which is a fact about the reconstruction rather than about the
 * towers.
 *
 * ## The two that landed with the content plan
 *
 * `harbour-point` and `ashgate` are GitHub issues #500 and #501, the two buildings
 * `docs/37-content-plan.md` § 7.3 says the plan owes. They arrive here rather than in
 * `fiveBuildings.test.ts` for that file's own stated reason: *the five* is a cited set, and
 * renaming a cited set is a larger change than adding a measurement.
 *
 * **Harbour Point is the interesting one for this file's purposes.** It is authored to be
 * over-subscribed — the group cannot clear its own crowd, and 64 of 65 runs across every shipped
 * dispatcher have their mean suppressed — and **that has nothing to do with whether the closed form
 * describes it**, because {@link measureUpPeak} isolates the bank and drives it at
 * `OVERLOAD_FACTOR × %POP` of its own handling capacity rather than at the building's authored
 * demand. A reader who expects a saturating building to defeat the oracle is confusing the
 * building's traffic profile with the experiment's, and the residual below says which.
 *
 * **Ashgate is the first shipped building to carry both verdicts at once.** Its `main` bank
 * reconciles with three declared departures from the model; its `carpark` bank — one car, two
 * unpopulated parking decks and a transfer floor — is refused, because an up-peak round trip to a
 * zone with no occupants is not a quantity the Barney/CIBSE expression has. That is asserted as a
 * throw, in the shape `st-jude-hospital`'s refusal already has.
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
 * **The `oracle-campaign` step that named this file is deleted, and the note that said it could not
 * be is deleted with it.** This docstring read *"`.github/workflows/**` is a protected path this
 * branch may not edit, so it is recorded here for whoever can"* — while the same branch was editing
 * `deep-tiers.yml` two hunks away, to add the very step it was describing. A sentence claiming a
 * limit its own diff disproves is worse than a sentence that is merely stale: it tells the next
 * reader not to attempt something that has just been done.
 *
 * The step was redundant on its own terms — it re-ran a file that no longer reads the variable, and
 * whose always-on half `ci.yml` already runs — so what is left is one job step and one runtime-table
 * row fewer, both carrying the refuted ~75 s figure.
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
 * Also reconciled here, on their principal bank — GitHub issues **#500** and **#501**.
 *
 * Separate from {@link RECONCILED_HERE} rather than folded into it, because every case below that
 * names {@link RECONCILED_HERE} is a claim about *Chancery House's* measured figures and would
 * silently become a claim about a different building if the constant grew an array. The two are
 * measured on the same apparatus, at the same {@link REPLICATIONS} from the same {@link FIRST_SEED},
 * and their cases are their own.
 */
const RECONCILED_HERE_ALSO: readonly string[] = ['harbour-point', 'ashgate'];

/**
 * The three reference towers of GitHub issues **#425**, **#424** and **#430**, each with the bank
 * this file reconciles it on.
 *
 * A third constant rather than a third entry in {@link RECONCILED_HERE_ALSO}, and the reason is
 * mechanical: that list is measured on a bank literally called `main`, and none of these towers has
 * one — a supertall is banks all the way down. Naming the bank per building is also the honest
 * shape here, because on each of them the bank that reconciles is **not** the one a reader would
 * pick first: it is the smallest, for the apparatus reason in this file's header.
 */
const REFERENCE_TOWERS: readonly { readonly buildingId: string; readonly bankId: string }[] = [
  { buildingId: 'ctf-class-reference', bankId: 'local-low' },
  { buildingId: 'shanghai-class-reference', bankId: 'local-hotel' },
  { buildingId: 'merdeka-class-reference', bankId: 'local-hotel' },
];

/**
 * The banks of those three the closed form is offered and **throws** on, with the ground each meets.
 *
 * Asserted rather than described, on `st-jude-hospital`'s precedent at the bottom of this file and
 * on `CLAUDE.md` § *A stated refusal goes stale the same way*: every one of these is liftable — by a
 * population above a shuttle's terminal, by a door timing, or by an apparatus that does not have to
 * drain the run — which is what makes asserting them worth anything.
 */
const REFUSED_BANKS: readonly {
  readonly buildingId: string;
  readonly bankId: string;
  readonly ground: RegExp;
}[] = [
  // Zero served population — the ground `ashgate/carpark` meets.
  { buildingId: 'shanghai-class-reference', bankId: 'shuttle', ground: /no populated floor above its terminal|no up-peak to analyse|finite, positive number/i },
  { buildingId: 'merdeka-class-reference', bankId: 'shuttle', ground: /no populated floor above its terminal|no up-peak to analyse|finite, positive number/i },
  // `departureGapBracket` — the ground `st-jude-hospital` meets.
  { buildingId: 'ctf-class-reference', bankId: 'local-apartments', ground: /not shorter than/i },
  // The apparatus cannot drain the crowd it offers a bank this large — new to this file.
  { buildingId: 'shanghai-class-reference', bankId: 'local-1', ground: /did not deliver everybody/i },
  { buildingId: 'merdeka-class-reference', bankId: 'local-low', ground: /did not deliver everybody/i },
  { buildingId: 'merdeka-class-reference', bankId: 'local-high', ground: /did not deliver everybody/i },
];

/**
 * The bank of a shipped building the closed form is offered and **throws** on, and why.
 *
 * `ashgate`'s car-park lift serves `B2`, `B1` and `G`. All three carry zero population — a parking
 * deck houses nobody and the ground is shops and a lobby — so there is no populated floor above the
 * terminal and no up-peak round trip to price. The refusal is asserted rather than described, on
 * `st-jude-hospital`'s precedent below: a refusal recorded only in prose is the stale-refusal defect
 * `CLAUDE.md` names, and this one can be lifted by authoring a population above the car park.
 */
const REFUSED_BANK = Object.freeze({ buildingId: 'ashgate', bankId: 'carpark' });

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
 * 10 m/s over a rise of several hundred metres — is its third criterion and is open. Absorbing that
 * into this file would close another issue's criterion inside this one, and the honest thing is to
 * name it as owed.
 *
 * **And it is owed harder than an earlier draft of this docstring said — all six banks refuse.**
 * That draft read *"four of its six banks reduce to the closed form's scalars today; `shuttle` and
 * `observation` do not"*. Measured over every bank at `FIRST_SEED`, none reduces: `shuttle` and
 * `observation` throw on a zero served population, and `local-lower`, `local-zone1`, `local-zone2`
 * and `local-zone3` all throw `departureGapBracket` — *the longest door reopen (37.00 s) is not
 * shorter than the shortest round trip (32.32 s for `local-lower`, 29.34 s for the three zones)*,
 * re-measured on GitHub issue #438's 3.645 m floors; they were 32.83 s and 29.68 s on the 4.0 m floors.
 * That is the same ground on which `st-jude-hospital` is REFUSED, and the case below asserts it
 * rather than restating it.
 *
 * **The wrong inference is worth naming, because it is the one a reader will make again.** That
 * draft reasoned from *internally uniform banks* to *coverable*, and this file's own
 * `st-jude-hospital` row refutes the step: the bracket refusal is independent of heterogeneity.
 * Whoever picks up #376's third criterion should expect to change the apparatus or the building,
 * not to run a measurement that is waiting.
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
  const cells: readonly { readonly key: string; readonly buildingId: string; readonly bankId: string }[] = [
    ...[RECONCILED_HERE, 'crown-hotel', ...RECONCILED_HERE_ALSO].map((buildingId) => ({
      key: buildingId,
      buildingId,
      bankId: 'main',
    })),
    ...REFERENCE_TOWERS.map((entry) => ({ key: entry.buildingId, ...entry })),
  ];
  for (const cell of cells) {
    const measurement = measureUpPeak({
      config,
      buildingId: cell.buildingId,
      bankId: cell.bankId,
      seeds: SEEDS,
      peakWindowS: PEAK_WINDOW_S,
    });
    measurements.set(cell.key, measurement);
    reconciliations.set(
      cell.key,
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
  /*
   * **The hook's budget, raised from 900 000 ms on 2026-09-15 and not by guesswork.** This
   * `beforeAll` measured four cells plus the Crown Hotel counterfactual; GitHub issues #425, #424
   * and #430 took it to eight, each 64 replications of a 5 400 s window. Measured on this tree it
   * costs **449 s** running alone and **978 s** inside a full `--project experiments` run, where the
   * old ceiling cut it off and reported all 34 cases as skipped — a hook timeout that reads as a
   * file-level failure and says nothing about any assertion.
   *
   * Raised rather than reduced, which is `deepCampaign.test.ts`'s rule and this file's own: the
   * replication budget is `fiveBuildings.test.ts`'s and a budget quietly cut to fit a window is a
   * weakened criterion that still gets published. 3 000 000 ms is about three times the loaded
   * measurement, which is the headroom `vitest.config.ts` says this suite actually needs — it runs
   * on a machine hosting several parallel worktrees by design.
   */
}, 3_000_000);

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
      ...RECONCILED_HERE_ALSO,
      ...REFERENCE_TOWERS.map((entry) => entry.buildingId),
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
  });

  it('is owed on a blocker this file can name, and every bank refuses today', () => {
    /*
     * **This case replaces one that asserted the wrong property, and the replacement is the point.**
     *
     * It used to walk the six banks and assert each was internally uniform — true, and green
     * forever — under a comment saying that made the building *"owed rather than impossible"*. The
     * assertion could not fail and the conclusion it was written to support is false: measured,
     * none of the six reduces. A check whose stated conclusion has already been refuted is worse
     * than no check, because it reads as evidence.
     *
     * The uniformity inference is refuted by a row in this very file. `st-jude-hospital` is REFUSED
     * on `departureGapBracket` and its bank is heterogeneous — so heterogeneity is not what the
     * bracket is about, and uniformity cannot license the opposite conclusion. Four of the six banks
     * here are uniform *and* refuse on that same ground.
     *
     * So the check is now the shape `st-jude-hospital`'s is at the bottom of this file: assert the
     * throw. It is a refusal that can be lifted — by a door timing, a rise, or an apparatus that
     * does not need the bracket — and a refusal that could never be lifted would be decoration.
     */
    const burj = config.buildingsById.get('burj-class-reference');
    expect(burj).toBeDefined();
    const banks = burj?.banks ?? [];
    expect(banks.length, 'the reference lost a bank; the measurement below is about six').toBe(6);

    for (const bank of banks) {
      expect(() =>
        measureUpPeak({
          config,
          buildingId: 'burj-class-reference',
          bankId: bank.id,
          seeds: [FIRST_SEED],
          peakWindowS: PEAK_WINDOW_S,
        }),
        `burj-class-reference/${bank.id} now reduces — #376's third criterion may be takeable, and ` +
          'this docstring says it is not',
      ).toThrow(/not shorter than|finite, positive number/i);
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
 * 1b. Harbour Point and Ashgate — GitHub issues #500 and #501.
 * ========================================================================== */

describe('Harbour Point, pure up-peak, 6 cars', () => {
  const id = 'harbour-point';

  it('is the second shipped bank the closed form describes with no caveat at all', () => {
    // One entrance, one zone, six identical cars, uniform populations, uniform pitch, no express
    // run. Chancery House was the only bank in the shipped set with an empty warning list; this is
    // the second, and it is empty for the same reasons rather than by coincidence.
    expect(measurementOf(id).analysis.warnings.map((warning) => warning.code)).toEqual([]);
  });

  it('ran the intended replications and saturated every time', () => {
    const m = measurementOf(id);
    expect(m.replications).toBe(REPLICATIONS);
    expect({ saturated: `${String(m.saturatedReplications)}/${String(m.replications)}` }).toEqual({
      saturated: `${String(REPLICATIONS)}/${String(REPLICATIONS)}`,
    });
    expect(m.tripCountFull).toBeGreaterThan(200);
  });

  it('is out by exactly the documented simplifications and by nothing else', () => {
    /*
     * Measured: raw **+28.63 %**, residual **−0.14 %**, at n = 64 from seed 810 000.
     *
     * **The building being over-subscribed does not reach this measurement**, and saying so is the
     * point. `harbour-point`'s authored demand puts the group past its own handling capacity — that
     * is what it is for — but `measureUpPeak` isolates the bank and drives it at
     * `OVERLOAD_FACTOR × %POP` of the capacity the closed form computes, exactly as it does for
     * every other bank here. The oracle is a statement about the round trip, not about the
     * building's traffic profile.
     */
    const r = reconciliationOf(id);
    expect(r.warnings).toEqual([]);
    expect(r.explained).toBe(true);
    expect(Math.abs(r.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);
    for (const term of r.terms) {
      for (const assumptionId of term.assumptionIds) {
        expect(CLOSED_FORM_ASSUMPTIONS.find((entry) => entry.id === assumptionId)?.bias).toBe(
          'under',
        );
        expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain(assumptionId);
      }
    }
  });

  it('is out against the textbook expression, in the one direction the rule predicts', () => {
    const m = measurementOf(id);
    const interval = relativeDivergence(m.measured.intervalS.mean, m.analysis.result.intervalS);
    const capacity = relativeDivergence(
      m.measured.percentPopulation5Min.mean,
      m.analysis.result.percentPopulation5Min,
    );
    expect(interval).toBeGreaterThan(0);
    expect(capacity).toBeLessThan(0);
    expect(m.measured.roundTripS.mean).toBeGreaterThan(m.matched.result.roundTripTimeS);
  });
});

describe('Ashgate Mixed-Use — one building, both verdicts', () => {
  const id = 'ashgate';

  it('reconciles its principal bank, with its departures from the model declared', () => {
    /*
     * Measured: raw **+31.21 %**, residual **−0.26 %**, at n = 64 from seed 810 000.
     *
     * The three warnings are the building being mixed-use rather than defects: retail floors carry
     * 22 people and office floors 34 (`nonUniformFloorPopulations`), the retail pitch is 4.5 m
     * against the offices' 3.7 m (`nonUniformInterfloorDistance`), and the lowest served floor sits
     * more than one mean pitch above the terminal (`expressZone`). They are asserted as a **set**,
     * so a fourth arriving — or one of these silently going away — is a red test rather than a
     * residual nobody can attribute.
     */
    const m = measurementOf(id);
    expect([...m.analysis.warnings.map((warning) => warning.code)].sort()).toEqual([
      'expressZone',
      'nonUniformFloorPopulations',
      'nonUniformInterfloorDistance',
    ]);
    const r = reconciliationOf(id);
    expect(r.warnings).toEqual([]);
    expect(r.explained).toBe(true);
    expect(Math.abs(r.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);
  });

  it('refuses its car-park bank, by a throw rather than by a sentence', () => {
    /*
     * `CLAUDE.md` § "A stated refusal goes stale the same way": a control that writes nothing must
     * say so, and the saying must be pinned by a run. This refusal is liftable — author a
     * population above `G` on that bank and it stops throwing — which is what makes asserting it
     * worth anything.
     */
    expect(() =>
      measureUpPeak({
        config,
        buildingId: REFUSED_BANK.buildingId,
        bankId: REFUSED_BANK.bankId,
        seeds: [FIRST_SEED],
        peakWindowS: PEAK_WINDOW_S,
      }),
      `${REFUSED_BANK.buildingId}/${REFUSED_BANK.bankId} now reduces — the docstring says it cannot`,
    ).toThrow(/no populated floor above its terminal|no up-peak to analyse/i);
  });

  it('declares a service restriction that the closed form is allowed to be blind to', () => {
    // The oracle prices one bank's round trip and has no term for *how many legs a journey takes*.
    // Ashgate's restriction — one of five cars reaching the basements — is measured on the legs in
    // `docs/04` § 11 and by nothing here, and the two banks below are what the restriction *is*.
    const building = config.buildingsById.get(id);
    expect(building?.banks.map((bank) => bank.cars.length)).toEqual([4, 1]);
    const carpark = building?.banks.find((bank) => bank.id === REFUSED_BANK.bankId);
    expect([...(carpark?.servesFloors ?? [])].sort()).toEqual(['B1', 'B2', 'G']);
  });
});

/* ========================================================================== *
 * 1c. The three reference towers — one verdict each way, on every one of them.
 * ========================================================================== */

describe('the three reference towers each reconcile on one bank and are refused on their others', () => {
  it.each(REFERENCE_TOWERS.map((entry) => [entry.buildingId, entry] as const))(
    '%s reconciles, and the residual is what no documented simplification explains',
    (buildingId, entry) => {
      /*
       * Measured at n = 64 from seed 810 000, the apparatus the five-building table runs:
       *
       * | bank | raw | residual | trips (full / all) |
       * |---|---|---|---|
       * | `ctf-class-reference/local-low` | **+48.935 %** | **−0.031 %** | 845 / 1 681 |
       * | `shanghai-class-reference/local-hotel` | **+34.983 %** | **−0.209 %** | 2 003 / 2 908 |
       * | `merdeka-class-reference/local-hotel` | **+34.485 %** | **−0.466 %** | 1 435 / 2 090 |
       *
       * All three inside a 4 % tolerance, and all three of the same sign as every other reconciled
       * bank — the closed form reads *fast*, which is what `CLOSED_FORM_COMPARISON_RULE` predicts
       * because everything it omits only ever adds seconds.
       */
      const m = measurementOf(buildingId);
      expect(m.replications).toBe(REPLICATIONS);
      expect(m.allSaturated, `${buildingId}/${entry.bankId} did not saturate`).toBe(true);
      expect(m.tripCountFull).toBeGreaterThan(200);

      const r = reconciliationOf(buildingId);
      expect(r.warnings).toEqual([]);
      expect(r.explained).toBe(true);
      expect(Math.abs(r.residual)).toBeLessThan(DEFAULT_RESIDUAL_TOLERANCE);

      // One-sided, and checked rather than assumed: a correction that could remove seconds would
      // let two errors cancel, and then the accounting would be a fit.
      for (const term of r.terms) {
        for (const id of term.assumptionIds) {
          expect(CLOSED_FORM_ASSUMPTIONS.find((item) => item.id === id)?.bias).toBe('under');
        }
      }
      // And the simulator is slower than the textbook, which is the direction the rule predicts.
      expect(m.measured.roundTripS.mean).toBeGreaterThan(m.matched.result.roundTripTimeS);
    },
  );

  it.each(
    REFUSED_BANKS.map((entry) => [`${entry.buildingId}/${entry.bankId}`, entry] as const),
  )('%s is refused by a throw rather than by a sentence', (label, entry) => {
    /*
     * Three grounds, and the header says which is which. Every one of them is liftable, which is
     * what makes asserting it worth anything (`CLAUDE.md` § *A stated refusal goes stale the same
     * way*): author a population above a shuttle's terminal, change a door timing, or reconstruct
     * departures from car motion rather than from boarding times.
     *
     * One seed rather than sixty-four: a refusal that is decided from the configuration does not
     * need a budget, and a refusal that is decided mid-run fires on the first replication that
     * meets it.
     */
    expect(() =>
      measureUpPeak({
        config,
        buildingId: entry.buildingId,
        bankId: entry.bankId,
        seeds: [FIRST_SEED],
        peakWindowS: PEAK_WINDOW_S,
      }),
      `${label} now reduces — this file says it cannot`,
    ).toThrow(entry.ground);
  });

  it('is the only shipped building whose cars are not one speed, and the oracle says so', () => {
    /*
     * **GitHub issue #425's own question, answered against this apparatus rather than against a
     * document.** `analyzeUpPeak` raises `directionalSpeedAsymmetry` on `ctf-class-reference`'s
     * shuttle and on no other shipped bank, and `CLOSED_FORM_ASSUMPTIONS`' `symmetric-speed` entry
     * is the divergence it points at. That entry is `bias: 'under'` — the expression charges one
     * `tv` twice, so a slower descent can only add seconds to the return half.
     *
     * The bank itself is **refused** by the apparatus above, on the drain ground, so this file
     * publishes no residual for it. That is the honest outcome and it is stated rather than worked
     * around: the warning is what a reader gets, and a reader who wants the number needs a
     * different apparatus.
     */
    const ctf = config.buildingsById.get('ctf-class-reference');
    expect(ctf).toBeDefined();
    const asymmetric = (ctf?.banks ?? []).filter((bank) =>
      bank.cars.some((car) => car.descentSpeedMps !== undefined),
    );
    expect(asymmetric.map((bank) => bank.id)).toEqual(['shuttle']);
    for (const car of asymmetric[0]?.cars ?? []) {
      expect(car.ratedSpeedMps).toBe(20);
      expect(car.descentSpeedMps).toBe(10);
    }
    const entry = CLOSED_FORM_ASSUMPTIONS.find((item) => item.id === 'symmetric-speed');
    expect(entry?.bias).toBe('under');
    expect(CLOSED_FORM_COMPARISON_RULE.oneSidedUnderIds).toContain('symmetric-speed');
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

  it('publishes that figure from a bracket 85× narrower than the reconciled one', () => {
    /*
     * **The residual above is apparatus-dependent, and the apparatus says so here rather than
     * leaving it for whoever re-measures.** `reconcile.ts`'s departure reconstruction argues the
     * answer is *"insensitive to the exact value"* of the clustering threshold, and that argument
     * holds when the threshold has room. The room is `minRoundTripS − maxReopenS`:
     *
     * | bank | reopen | round trip | width |
     * |---|---|---|---|
     * | `chancery-house/main` | 24.000 s | 29.750 s | **5.750 s** |
     * | `crown-hotel/main` | 30.240 s | 30.308 s | **0.068 s** |
     *
     * Both at seed 810 000. Chancery's threshold has five and a half seconds either side; Crown's
     * has three hundredths. `maxReopenS` is computed at the bank's *design* load, and the simulator
     * carries more than that under this peak, so real loadings on Crown pause for longer than the
     * threshold and are split — the reconstruction is running outside its own stated regime on the
     * one building this file publishes a refusal for.
     *
     * **The verdict is unaffected and that is why this is a disclosure rather than a defect.** The
     * residual moves with the threshold on Crown and grows rather than shrinks, so a converged
     * threshold refuses it by more; and REFUSED is the answer either way. What would be wrong is
     * publishing **+7.592 %** in four places as though it were threshold-independent, which is the
     * reading the paragraph in `reconcile.ts` invites.
     *
     * The assertion is on the width rather than on the residual, because the width is the thing
     * that decides whether the figure means what it appears to mean. A bracket narrowing towards
     * zero is how this reconstruction stops working silently.
     */
    const crown = measurementOf('crown-hotel').bracket;
    const chancery = measurementOf(RECONCILED_HERE).bracket;

    const widthOf = (b: { minRoundTripS: number; maxReopenS: number }): number =>
      b.minRoundTripS - b.maxReopenS;

    // Both brackets are non-empty, or `measureUpPeak` would have thrown rather than measured.
    expect(widthOf(crown)).toBeGreaterThan(0);
    expect(widthOf(chancery)).toBeGreaterThan(0);

    /*
     * Crown's is under a tenth of a second. If this ever fails upward, the building or the door
     * timings changed and the caveat above is the thing to re-check — not the figure alone.
     */
    expect(widthOf(crown)).toBeLessThan(0.1);
    /* And Chancery's is wide, which is what makes the contrast a property of Crown rather than of
       the apparatus. Without this line the case above would pass on a reconstruction that had
       become narrow everywhere. */
    expect(widthOf(chancery)).toBeGreaterThan(1);
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
