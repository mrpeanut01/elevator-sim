/**
 * **Move the control and require the run to change — § D177, compared on the legs.**
 *
 * Every choice this module ships gets a test that runs the simulation twice and requires the legs
 * to differ at a named cell. Never a window statistic: § D177's own words are that *a mean can be
 * unchanged for a run that is entirely different, and a mean can move because the window moved.*
 * The comparison string is `scope/probes.test-helper.ts`'s `legsOf` — passenger, car, boarding
 * instant, in the recording's own order — and the run is built by `shiftRunConfigOf`, so what is
 * measured is the shipped call path rather than an instrument.
 *
 * ## How a commissioned building reaches a run before the wiring exists
 *
 * Through `ViewerState.savedBuildings`, which `shiftRunConfigOf` already consults ahead of
 * `data/buildings/`. A commissioned building saved under the shipped id **is** the building the
 * week runs, so these tests exercise growth, the levers, the event schedule and the incident seam
 * exactly as a wired commissioning screen will. Nothing here stubs the run.
 *
 * ## Two findings about the shipped configuration, pinned rather than avoided
 *
 * 1. **A third shaft at Garden Apartments is inert at the two shorter shifts.** Not *"the control
 *    does nothing"* — the control is fine and the cell is empty. See the test that names it.
 * 2. **A machine class cannot be moved on its own at Garden Apartments**, because the shipped
 *    speed bands in `data/elevator-specs.json` barely overlap. Also asserted from the data rather
 *    than described.
 *
 * The rule the task sets is that an inert cell is named and its reason measured, not fled from.
 * Both findings are asserted so that a change to the shipped calibration fails this file rather
 * than quietly making the prose above false.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseBuilding, type BuildingConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';

import { commissionedBuilding } from './building.js';
import {
  CAPITAL_UNITS_PER_MPS,
  CAPITAL_UNITS_PER_RATED_RISE_M,
  CAPITAL_UNITS_PER_SHAFT,
  asBuiltChoices,
  budgetFor,
  capitalOf,
  mixedFleetBanks,
  movedChoices,
  speedChoices,
  withBankChoice,
} from './choices.js';
import { refusalsBeside, reviewCommissioning } from './refusals.js';
import {
  COMMISSIONING_DIMENSIONS,
  classById,
  commissionableClasses,
  constraintById,
  type BankChoice,
  type CapitalConstraint,
  type CommissioningChoices,
} from './types.js';

const CLASSES = commissionableClasses(RESOURCES.elevatorSpecs);
const NEW_BUILD = constraintById('new-build') as CapitalConstraint;
const REFURBISHMENT = constraintById('refurbishment') as CapitalConstraint;
const RETROFIT = constraintById('retrofit') as CapitalConstraint;

/** The two buildings `probes.test-helper.ts` loads. Small enough to run, different enough to matter. */
function shipped(id: string): BuildingConfig {
  const entry = RESOURCES.entries.find((candidate) => candidate.config.id === id);
  if (entry === undefined) throw new Error(`probes.test-helper.ts does not load "${id}"`);
  return entry.config;
}

/** A building the probe resources do not carry, read straight off disk for a refusal test. */
function fromDisk(id: string): BuildingConfig {
  return parseBuilding(JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')));
}

const bankOf = (base: BuildingConfig): BankChoice => {
  const choice = asBuiltChoices(base, CLASSES)[0];
  if (choice === undefined) throw new Error(`"${base.id}" declares no banks`);
  return choice;
};

/**
 * A state whose building is the commissioned one, at a named shift length.
 *
 * The cell is the pair `(buildingId, shiftLengthS)` and every § D177 assertion below names it in
 * the test title, because *"the legs differ"* is a claim about an operating point rather than about
 * a control.
 */
function stateOf(buildingId: string, shiftLengthS: number, choices: CommissioningChoices): ViewerState {
  const base = shipped(buildingId);
  return {
    ...baseState(),
    buildingId,
    shiftLengthS,
    savedBuildings: [{ id: buildingId, config: commissionedBuilding(base, choices, CLASSES) }],
  };
}

/** The legs, as a comparable string. Same shape as `probes.test-helper.ts`'s. */
const legsAt = (buildingId: string, shiftLengthS: number, choices: CommissioningChoices): string =>
  legsOf(stateOf(buildingId, shiftLengthS, choices));

function legCountAt(buildingId: string, shiftLengthS: number, choices: CommissioningChoices): number {
  const plan = shiftRunConfigOf(RESOURCES, stateOf(buildingId, shiftLengthS, choices));
  return recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  }).recording.legs.length;
}

function carsUsedAt(buildingId: string, shiftLengthS: number, choices: CommissioningChoices): Set<string> {
  const plan = shiftRunConfigOf(RESOURCES, stateOf(buildingId, shiftLengthS, choices));
  const legs = recordRun(plan.config, {
    recordDecisions: false,
    outOfServiceCarIds: plan.outOfServiceCarIds,
  }).recording.legs;
  return new Set(legs.flatMap((leg) => (leg.carId === undefined ? [] : [leg.carId])));
}

/* -------------------------------------------------------------------------- *
 * The negative control, first — because everything below is measured against it
 * -------------------------------------------------------------------------- */

describe('a building commissioned as it already stands', () => {
  it('is the same object, not a copy that happens to be equal', () => {
    // `shift/incidents.ts`'s rule and its reason: a run's building document is digested into a
    // leaderboard board, so a config layer returning a fresh object for a no-op moves every board.
    for (const id of ['garden-apartments', 'midtown-office']) {
      const base = shipped(id);
      expect(commissionedBuilding(base, asBuiltChoices(base, CLASSES), CLASSES)).toBe(base);
    }
  });

  it('runs the byte-identical shift the shipped building runs', () => {
    // If this ever fails, every figure this repository has published on these two buildings has
    // quietly moved, and the cause is a module that was supposed to be inert until chosen.
    for (const [id, length] of [
      ['garden-apartments', 900],
      ['midtown-office', 1800],
    ] as const) {
      const base = shipped(id);
      expect(legsAt(id, length, asBuiltChoices(base, CLASSES))).toBe(legsAt(id, length, []));
    }
  });

  it('leaves a bank it was given no choice for exactly as authored', () => {
    const base = shipped('midtown-office');
    expect(commissionedBuilding(base, [], CLASSES)).toBe(base);
  });

  it('treats a bank nobody has decided about as unchanged, not as moved to nothing', () => {
    /*
     * Vertical City has seven banks. A screen that has drawn one of them has decided one of them,
     * so a choice set naming `shuttle` alone must report the other six as untouched — and must
     * still price all seven, or the budget gates nothing on the buildings where it matters most.
     */
    const base = fromDisk('vertical-city');
    const asBuilt = asBuiltChoices(base, CLASSES);
    expect(asBuilt.length).toBe(7);
    const shuttle = asBuilt.find((choice) => choice.bankId === 'shuttle');
    if (shuttle === undefined) throw new Error('vertical-city has no shuttle bank');

    expect(movedChoices(asBuilt, [shuttle])).toEqual([]);
    expect(movedChoices(asBuilt, [{ ...shuttle, shafts: 9 }]).map((entry) => entry.dimension)).toEqual([
      'shafts',
    ]);

    const review = reviewCommissioning({
      base,
      choices: [{ ...shuttle, shafts: 9 }],
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: NEW_BUILD,
    });
    // Priced over all seven banks: more than the shuttle alone, and more than the whole building
    // as built by exactly the one shaft that was added.
    expect(review.capitalUnits).toBeGreaterThan(capitalOf([{ ...shuttle, shafts: 9 }], CLASSES));
    expect(review.capitalUnits - capitalOf(asBuilt, CLASSES)).toBe(
      capitalOf([shuttle], CLASSES) / shuttle.shafts,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * § D177 — shafts
 * -------------------------------------------------------------------------- */

describe('shafts', () => {
  it('changes the legs at midtown-office / 1 800 s — four shafts to five', () => {
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const wider = withBankChoice(asBuilt, { ...bankOf(base), shafts: 5 });
    expect(legsAt('midtown-office', 1800, wider)).not.toBe(legsAt('midtown-office', 1800, asBuilt));
  });

  it('puts a fifth car in the building and gives it work', () => {
    /*
     * The assertion that makes the one above mean something. *The legs differ* would also be true
     * of a run that merely re-shuffled four cars, and a shaft nobody is ever assigned to is the
     * inert control this suite exists to catch — see the Garden Apartments cell below, where that
     * is exactly what happens.
     */
    const base = shipped('midtown-office');
    const wider = withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), shafts: 5 });
    const built = commissionedBuilding(base, wider, CLASSES);
    expect(built.banks[0]?.cars.map((car) => car.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(carsUsedAt('midtown-office', 1800, wider)).toContain('main-E');
  });

  it('changes the legs downward too — four shafts to three', () => {
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const narrower = withBankChoice(asBuilt, { ...bankOf(base), shafts: 3 });
    expect(commissionedBuilding(base, narrower, CLASSES).banks[0]?.cars.length).toBe(3);
    expect(legsAt('midtown-office', 1800, narrower)).not.toBe(legsAt('midtown-office', 1800, asBuilt));
  });

  /**
   * **The finding.** A third shaft at Garden Apartments is inert at the 15- and 30-minute shifts
   * and live from an hour. This is a fact about the *cell*, not about the control: the building is
   * 120 residents over five floors at the residential arrival rate, so a 900 s shift produces
   * **five** legs in total and a 1 800 s shift produces twenty — and two hydraulic cars answer
   * every one of them without the group ever needing a third. At 3 600 s the run reaches 48 legs
   * and `main-C` starts boarding people, so the same control at the same building is live one shift
   * length up.
   *
   * `docs/10` § 0 measured this building's whole problem — *"one building where nothing you change
   * makes any difference"* — and this is that measurement arriving at a different control. It is
   * recorded here rather than papered over by moving the test to Midtown, because a suite that only
   * ever asserts at the cell where a control works has stopped being able to find one that does not.
   */
  it('is INERT at garden-apartments / 900 s and / 1 800 s — a finding about the cell, not the control', () => {
    const base = shipped('garden-apartments');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const wider = withBankChoice(asBuilt, { ...bankOf(base), shafts: 3 });

    // The building really is edited: three cars reach the loader.
    expect(commissionedBuilding(base, wider, CLASSES).banks[0]?.cars.map((car) => car.id)).toEqual([
      'A',
      'B',
      'C',
    ]);

    for (const [length, legs] of [
      [900, 5],
      [1800, 20],
    ] as const) {
      expect(legCountAt('garden-apartments', length, asBuilt), `${String(length)} s leg count`).toBe(legs);
      expect(carsUsedAt('garden-apartments', length, wider)).not.toContain('main-C');
      expect(
        legsAt('garden-apartments', length, wider),
        `a third shaft moved the legs at ${String(length)} s — the finding has expired, update it`,
      ).toBe(legsAt('garden-apartments', length, asBuilt));
    }
  });

  it('and is live at garden-apartments / 3 600 s — which is what makes the cell the cause', () => {
    const base = shipped('garden-apartments');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const wider = withBankChoice(asBuilt, { ...bankOf(base), shafts: 3 });
    expect(legCountAt('garden-apartments', 3600, asBuilt)).toBe(48);
    expect(carsUsedAt('garden-apartments', 3600, wider)).toContain('main-C');
    expect(legsAt('garden-apartments', 3600, wider)).not.toBe(legsAt('garden-apartments', 3600, asBuilt));
  });
});

/* -------------------------------------------------------------------------- *
 * § D177 — machine class
 * -------------------------------------------------------------------------- */

describe('machine class', () => {
  it('changes the legs at midtown-office / 1 800 s — geared traction to gearless, both at 2.5 m/s', () => {
    /*
     * The one cell in the shipped tree where a class moves **on its own**: 2.5 m/s is the top of
     * `geared-traction`'s band and the bottom of `gearless-traction`'s, so the rated speed does not
     * have to move with it. What changes is the car: `gearless-traction` is built from 3 000 lb up,
     * so the bank's 2 500 lb cars become 3 000 lb ones — twenty persons instead of sixteen.
     */
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const gearless = withBankChoice(asBuilt, { ...bankOf(base), machineClassId: 'gearless-traction' });
    expect(movedChoices(asBuilt, gearless).map((entry) => entry.dimension)).toEqual(['machineClass']);

    const built = commissionedBuilding(base, gearless, CLASSES);
    expect(built.banks[0]?.cars.every((car) => car.spec === 'gearless-traction')).toBe(true);
    expect(built.banks[0]?.cars.every((car) => car.ratedLoadLb === 3000)).toBe(true);
    expect(legsAt('midtown-office', 1800, gearless)).not.toBe(legsAt('midtown-office', 1800, asBuilt));
  });

  it('changes the legs at garden-apartments / 900 s — hydraulic to MRL gearless', () => {
    // Two dimensions move here and they cannot be separated. See the finding below.
    const base = shipped('garden-apartments');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const mrl = withBankChoice(asBuilt, {
      ...bankOf(base),
      machineClassId: 'mrl-gearless-low',
      ratedSpeedMps: 1.6,
    });
    expect(legsAt('garden-apartments', 900, mrl)).not.toBe(legsAt('garden-apartments', 900, asBuilt));
  });

  /**
   * **The second finding, and it is about `data/elevator-specs.json` rather than about a cell.**
   *
   * The six shipped classes' rated-speed bands are laid end to end: `0.5–0.75`, `1.0–1.75`,
   * `1.75–2.5`, `2.5–7.0`, `7.0–10.0`, `10.0–20.5`. Consecutive bands touch at a single point and
   * never overlap, and there is a gap between the first and the second. So on any building whose
   * cars are not sitting exactly on a shared endpoint, **the machine class cannot be commissioned
   * on its own**: moving it drags the rated speed with it or the loader refuses the speed.
   *
   * Garden Apartments at 0.63 m/s is such a building — 0.63 sits in the interior of `hydraulic`'s
   * band and in no other class's band at all. That is why the test above moves two dimensions, and
   * saying so is better than quietly moving two and calling it a class test.
   */
  it('cannot be moved alone at garden-apartments, because the shipped speed bands do not overlap', () => {
    const hydraulic = CLASSES.find((entry) => entry.id === 'hydraulic');
    expect(hydraulic).toBeDefined();
    const speed = bankOf(shipped('garden-apartments')).ratedSpeedMps;
    expect(speed).toBe(0.63);

    const alsoBuiltForIt = CLASSES.filter(
      (entry) => entry.id !== 'hydraulic' && speed >= entry.speedMinMps && speed <= entry.speedMaxMps,
    );
    expect(alsoBuiltForIt.map((entry) => entry.id)).toEqual([]);

    // And the overlap the Midtown test relies on is a single point, not a range.
    const overlaps = CLASSES.flatMap((left) =>
      CLASSES.filter(
        (right) =>
          right.id !== left.id &&
          right.speedMinMps < left.speedMaxMps &&
          right.speedMaxMps > left.speedMinMps,
      ).map((right) => `${left.id}/${right.id}`),
    );
    expect(overlaps).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * § D177 — rated speed
 * -------------------------------------------------------------------------- */

describe('rated speed', () => {
  it('changes the legs at garden-apartments / 900 s — 0.63 m/s to 0.75, the top of the band', () => {
    /*
     * The building's own notes say why this is a real move and not a cosmetic one: at a 3.0 m floor
     * pitch the jerk-limited profile reaches rated speed after about 1.14 m, so the hop is
     * speed-limited rather than acceleration-limited and raising the rating pays. A test that
     * expected this to be inert would be pinning a bug — the file says so in as many words.
     */
    const base = shipped('garden-apartments');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const faster = withBankChoice(asBuilt, { ...bankOf(base), ratedSpeedMps: 0.75 });
    expect(movedChoices(asBuilt, faster).map((entry) => entry.dimension)).toEqual(['ratedSpeed']);
    expect(legsAt('garden-apartments', 900, faster)).not.toBe(legsAt('garden-apartments', 900, asBuilt));
  });

  it('changes the legs at midtown-office / 1 800 s — 2.5 m/s down to 1.75', () => {
    /*
     * Downward, and that is forced rather than chosen: `geared-traction` is rated to 2.5 and the
     * bank already runs there, so the only in-band move is slower. Midtown is also this
     * repository's own **speed negative control on a single-floor hop** — 2.5 m/s against a 3.8 m
     * pitch never reaches rated speed — so what this cell measures is the twenty-floor express run
     * from the lobby, which is most of the building's work under up-peak.
     */
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const slower = withBankChoice(asBuilt, { ...bankOf(base), ratedSpeedMps: 1.75 });
    expect(legsAt('midtown-office', 1800, slower)).not.toBe(legsAt('midtown-office', 1800, asBuilt));
  });
});

/* -------------------------------------------------------------------------- *
 * Retrofit — the same model with the fabric frozen
 * -------------------------------------------------------------------------- */

describe('retrofit', () => {
  it('is a constraint rather than a second module: its editable set is empty', () => {
    expect(RETROFIT.editable).toEqual([]);
    expect(NEW_BUILD.editable).toEqual([...COMMISSIONING_DIMENSIONS]);
  });

  it('refuses every fabric dimension, one refusal per moved dimension, each naming its bank', () => {
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const everything = withBankChoice(asBuilt, {
      ...bankOf(base),
      shafts: 5,
      machineClassId: 'gearless-traction',
      ratedSpeedMps: 3,
    });
    const review = reviewCommissioning({
      base,
      choices: everything,
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: RETROFIT,
    });
    expect(review.admissible).toBe(false);
    expect(review.withinScope).toEqual([]);
    expect(review.outOfScope.map((entry) => entry.dimension)).toEqual([
      'shafts',
      'machineClass',
      'ratedSpeed',
    ]);
    const scope = review.refusals.filter((refusal) => refusal.code === 'out-of-scope');
    expect(scope.map((refusal) => refusal.site)).toEqual(['shafts', 'machineClass', 'ratedSpeed']);
    expect(scope.every((refusal) => refusal.bankId === 'main')).toBe(true);
  });

  it('leaves the week running the byte-identical building it would have run', () => {
    // The claim retrofit makes: the fabric is fixed. Not asserted on a flag — asserted on the legs.
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const review = reviewCommissioning({
      base,
      choices: asBuilt,
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: RETROFIT,
    });
    expect(review.admissible).toBe(true);
    expect(review.moved).toEqual([]);
    expect(legsAt('midtown-office', 1800, asBuilt)).toBe(legsAt('midtown-office', 1800, []));
  });

  it('refurbishment opens the machine and not the shaft', () => {
    const base = shipped('midtown-office');
    const asBuilt = asBuiltChoices(base, CLASSES);
    const review = reviewCommissioning({
      base,
      choices: withBankChoice(asBuilt, { ...bankOf(base), shafts: 5, ratedSpeedMps: 2 }),
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: REFURBISHMENT,
    });
    expect(review.outOfScope.map((entry) => entry.dimension)).toEqual(['shafts']);
    expect(review.withinScope.map((entry) => entry.dimension)).toEqual(['ratedSpeed']);
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals — one per gate `data/elevator-specs.json` declares
 * -------------------------------------------------------------------------- */

describe('the gates', () => {
  const reviewOf = (
    base: BuildingConfig,
    choices: CommissioningChoices,
    constraint: CapitalConstraint = NEW_BUILD,
  ): ReturnType<typeof reviewCommissioning> =>
    reviewCommissioning({ base, choices, classes: CLASSES, specs: RESOURCES.elevatorSpecs, constraint });

  it('refuses a class whose rated rise and floor count the bank exceeds — midtown as hydraulic', () => {
    /*
     * Both gates at once, which is what `maxRiseM: 18` and `maxFloors: 6` mean against a bank that
     * spans 76.9 m over 21 floors. Read from the loader rather than checked here: these are
     * `core`'s `rise-exceeds-class` and `floors-exceed-class`, raised on the edited building.
     */
    const base = shipped('midtown-office');
    const review = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), {
        ...bankOf(base),
        machineClassId: 'hydraulic',
        ratedSpeedMps: 0.63,
      }),
    );
    expect(review.admissible).toBe(false);
    expect(review.refusals.map((refusal) => refusal.code).sort()).toEqual([
      'floors-exceed-class',
      'rise-exceeds-class',
    ]);
    const rise = review.refusals.find((refusal) => refusal.code === 'rise-exceeds-class');
    expect(rise?.site).toBe('machineClass');
    expect(rise?.bankId).toBe('main');
    expect(rise?.message).toContain('18 m');
    expect(rise?.message).toContain('Pick a class rated for the rise');
  });

  it('does not blame the player for a warning the shipped building already raises', () => {
    /*
     * **`midtown-office` ships with `rise-exceeds-class` on its main bank**: 76.9 m from the garage
     * at −3.5 m to floor 20 at 73.4 m, against `geared-traction`'s rated 76 m. `growth.ts`'s rule —
     * *no warning the shipped building did not already have* — is what keeps that off the player's
     * screen, and the test above is what keeps it from swallowing the hydraulic case with it.
     */
    const base = shipped('midtown-office');
    const review = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), shafts: 5 }),
    );
    expect(review.refusals).toEqual([]);
    expect(review.admissible).toBe(true);
  });

  it('refuses a speed outside the class band — midtown geared at 3.0 m/s', () => {
    const base = shipped('midtown-office');
    const review = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), ratedSpeedMps: 3 }),
    );
    expect(review.refusals.map((refusal) => refusal.code)).toEqual(['speed-outside-class-range']);
    const refusal = review.refusals[0];
    expect(refusal?.site).toBe('ratedSpeed');
    expect(refusal?.message).toContain('1.75');
    expect(refusal?.message).toContain('2.5');
  });

  it('refuses a double-deck class in a bank with no floor pairs — midtown as ultra high-speed', () => {
    const base = shipped('midtown-office');
    const review = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), {
        ...bankOf(base),
        machineClassId: 'ultra-high-speed',
        ratedSpeedMps: 10,
      }),
      // Budget out of the way, so the refusal under test is the one being read.
      { ...NEW_BUILD, headroom: 10 },
    );
    expect(review.refusals.map((refusal) => refusal.code)).toEqual(['missing-floor-pairs']);
    expect(review.refusals[0]?.message).toContain('Pick a single-deck class');
  });

  it('leaves the commissioned building loadable while it does so', () => {
    /*
     * The reason that refusal is raised here rather than read from the loader: `deckSeparationM` is
     * *required* when `doubleDeck` is set, so a car marked double-deck in a bank with no pairs
     * makes the whole building unloadable. It is commissioned single-deck instead — which is what
     * `missing-floor-pairs` says the runtime does with one anyway — and refused by name.
     */
    const base = shipped('midtown-office');
    const built = commissionedBuilding(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), {
        ...bankOf(base),
        machineClassId: 'ultra-high-speed',
        ratedSpeedMps: 10,
      }),
      CLASSES,
    );
    expect(built.banks[0]?.cars.every((car) => car.doubleDeck === undefined)).toBe(true);
    expect(() => parseBuilding(built as unknown)).not.toThrow();
  });

  it('carries the deck geometry when the bank does declare pairs — vertical-city shuttle', () => {
    // The other half of the gate. `vertical-city`'s shuttle declares four pairs 4.5 m apart, and
    // commissioning a double-deck class into it produces a double-deck car with that separation.
    const base = fromDisk('vertical-city');
    const shuttle = asBuiltChoices(base, CLASSES).find((choice) => choice.bankId === 'shuttle');
    expect(shuttle).toBeDefined();
    if (shuttle === undefined) return;
    const built = commissionedBuilding(base, [{ ...shuttle, shafts: 9 }], CLASSES);
    const cars = built.banks.find((bank) => bank.id === 'shuttle')?.cars ?? [];
    expect(cars.length).toBe(9);
    expect(cars.every((car) => car.doubleDeck === true)).toBe(true);
    expect(cars.every((car) => car.deckSeparationM === 4.5)).toBe(true);
    expect(
      reviewCommissioning({
        base,
        choices: [{ ...shuttle, shafts: 9 }],
        classes: CLASSES,
        specs: RESOURCES.elevatorSpecs,
        constraint: { ...NEW_BUILD, headroom: 10 },
      }).refusals,
    ).toEqual([]);
  });

  it('refuses a single-deck class in a bank whose floors are paired', () => {
    const base = fromDisk('vertical-city');
    const shuttle = asBuiltChoices(base, CLASSES).find((choice) => choice.bankId === 'shuttle');
    if (shuttle === undefined) throw new Error('vertical-city has no shuttle bank');
    const review = reviewCommissioning({
      base,
      choices: [{ ...shuttle, machineClassId: 'high-speed-gearless', ratedSpeedMps: 10 }],
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: { ...NEW_BUILD, headroom: 10 },
    });
    expect(review.refusals.map((refusal) => refusal.code)).toContain('unused-floor-pairs');
  });

  it('refuses a bank whose shipped cars are not all the same machine', () => {
    /*
     * Two shipped buildings are in this state and both are deliberate authoring — `crown-hotel`'s
     * slower service car and `st-jude-hospital`'s bed car. One class and one speed cannot describe
     * either bank without deleting the difference, so the choice is refused rather than flattened.
     */
    expect(mixedFleetBanks(fromDisk('crown-hotel'))).toEqual(['main']);
    expect(mixedFleetBanks(fromDisk('st-jude-hospital'))).toEqual(['main']);
    expect(mixedFleetBanks(shipped('midtown-office'))).toEqual([]);

    const base = fromDisk('crown-hotel');
    const review = reviewCommissioning({
      base,
      choices: [{ ...bankOf(base), shafts: 6 }],
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: NEW_BUILD,
    });
    expect(review.refusals.map((refusal) => refusal.code)).toContain('mixed-fleet');
  });

  it('refuses a bank with no shafts, and a class that does not exist', () => {
    const base = shipped('midtown-office');
    const empty = reviewOf(base, withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), shafts: 0 }));
    expect(empty.refusals.map((refusal) => refusal.code)).toContain('no-shafts');

    const unknown = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), machineClassId: 'antigravity' }),
    );
    expect(unknown.refusals.map((refusal) => refusal.code)).toContain('unknown-class');
  });

  it('puts every refusal beside a control a player can reach', () => {
    // *"Beside the control rather than in a console"* is a requirement, so the model expresses it.
    const base = shipped('midtown-office');
    const review = reviewOf(
      base,
      withBankChoice(asBuiltChoices(base, CLASSES), { ...bankOf(base), ratedSpeedMps: 3 }),
    );
    expect(refusalsBeside(review, 'main', 'ratedSpeed').length).toBe(1);
    expect(refusalsBeside(review, 'main', 'shafts')).toEqual([]);
    for (const refusal of review.refusals) {
      expect(refusal.message.length).toBeGreaterThan(40);
      expect(refusal.message.endsWith('.')).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The budget, as a gate on the choice
 * -------------------------------------------------------------------------- */

describe('the capital constraint', () => {
  it('is monotone in all three dimensions', () => {
    // The whole specification of the quantity. More shafts, a taller-rated class, a faster car.
    const base = shipped('midtown-office');
    const built = bankOf(base);
    const capital = (choice: BankChoice): number => capitalOf([choice], CLASSES);
    expect(capital({ ...built, shafts: 5 })).toBeGreaterThan(capital(built));
    expect(capital({ ...built, ratedSpeedMps: 2.4 })).toBeLessThan(capital(built));
    expect(capital({ ...built, machineClassId: 'gearless-traction' })).toBeGreaterThan(capital(built));
  });

  it('is relative to the building, so a constraint means the same thing on both', () => {
    for (const id of ['garden-apartments', 'midtown-office']) {
      const base = shipped(id);
      expect(budgetFor(RETROFIT, base, CLASSES)).toBe(capitalOf(asBuiltChoices(base, CLASSES), CLASSES));
      expect(budgetFor(NEW_BUILD, base, CLASSES)).toBeGreaterThan(budgetFor(REFURBISHMENT, base, CLASSES));
    }
  });

  it('gates a choice the constraint cannot pay for, and names what to take back out', () => {
    const base = shipped('midtown-office');
    const review = reviewCommissioning({
      base,
      choices: withBankChoice(asBuiltChoices(base, CLASSES), {
        ...bankOf(base),
        machineClassId: 'high-speed-gearless',
        ratedSpeedMps: 8,
      }),
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: REFURBISHMENT,
    });
    expect(review.refusals.map((refusal) => refusal.code)).toEqual(['over-budget']);
    expect(review.capitalUnits).toBeGreaterThan(review.budgetUnits);
    expect(review.refusals[0]?.message).toContain('capital units');
    expect(review.refusals[0]?.site).toBe('constraint');
  });

  it('lets the same class through when a shaft is given back for it', () => {
    // The trade-off the limit exists to create — and the reason it is a limit rather than a score.
    const base = shipped('midtown-office');
    const review = reviewCommissioning({
      base,
      choices: withBankChoice(asBuiltChoices(base, CLASSES), {
        ...bankOf(base),
        shafts: 2,
        machineClassId: 'high-speed-gearless',
        ratedSpeedMps: 8,
      }),
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint: NEW_BUILD,
    });
    expect(review.refusals).toEqual([]);
    expect(review.capitalUnits).toBeLessThanOrEqual(review.budgetUnits);
  });
});

/* -------------------------------------------------------------------------- *
 * A capital unit says what it is — issue #24
 * -------------------------------------------------------------------------- */

/**
 * The screen printed `1920 of the 1920 capital units allowed` and never said what a unit was.
 *
 * Three questions in the report, all of which this module knew the answer to and none of which it
 * printed: what a unit corresponds to, what moves the figure **before** you commit, and what happens
 * when a configuration exceeds the allowance. On a screen whose controls did not respond (#42), a
 * player could not even find the price list by trial and error.
 *
 * The assertions below are about the two things copy like this gets wrong. It must be **accurate to
 * the constants** — interpolated, not typed, so it cannot drift the first time a price moves — and
 * it must not imply a real-world cost, because `choices.ts` is explicit that a unit *"is not
 * currency, it is not a measurement of anything real"*, and inventing one would be an engineering
 * claim the reference data does not make.
 */
describe('the capital figure explains itself — issue #24', () => {
  const sentenceUnder = (constraint: CapitalConstraint, choices: CommissioningChoices): string =>
    reviewCommissioning({
      base: shipped('midtown-office'),
      choices,
      classes: CLASSES,
      specs: RESOURCES.elevatorSpecs,
      constraint,
    }).sentence;

  const asBuilt = (): CommissioningChoices => asBuiltChoices(shipped('midtown-office'), CLASSES);

  it('says what drives the figure, with the numbers the arithmetic actually uses', () => {
    const sentence = sentenceUnder(RETROFIT, asBuilt());
    expect(sentence).toContain(String(CAPITAL_UNITS_PER_SHAFT));
    expect(sentence).toContain(String(CAPITAL_UNITS_PER_MPS));
    expect(sentence).toContain(String(CAPITAL_UNITS_PER_RATED_RISE_M));
    // And names all three dimensions, which is the "before you commit" half of the question.
    expect(sentence).toMatch(/shaft/i);
    expect(sentence).toMatch(/speed/i);
    expect(sentence).toMatch(/class/i);
  });

  it('says a unit is not money, rather than implying a cost the data does not claim', () => {
    expect(sentenceUnder(RETROFIT, asBuilt())).toMatch(/rather than money/i);
  });

  it('says what happens past the allowance, on the arm where that is being answered', () => {
    /*
     * The legend rides on the refusing branch too. A player who has just been refused is exactly the
     * player asking *what happens if I exceed it*, and a legend visible only when nothing is wrong
     * would be missing from the one moment it is needed.
     */
    const over = withBankChoice(asBuilt(), {
      ...bankOf(shipped('midtown-office')),
      shafts: 12,
      machineClassId: 'ultra-high-speed',
      ratedSpeedMps: 20,
    });
    const sentence = sentenceUnder(NEW_BUILD, over);
    expect(sentence).toMatch(/refused by name/);
    expect(sentence).toMatch(/never quietly trimmed/);
  });

  it('carries the legend on every branch, so the screen never has it missing', () => {
    const moved = withBankChoice(asBuilt(), { ...bankOf(shipped('midtown-office')), shafts: 5 });
    for (const [constraint, choices] of [
      [RETROFIT, asBuilt()],
      [NEW_BUILD, asBuilt()],
      [NEW_BUILD, moved],
      [REFURBISHMENT, moved],
    ] as const) {
      expect(sentenceUnder(constraint, choices)).toContain('capital unit is');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The speed control can show what the building already has — issue #45
 * -------------------------------------------------------------------------- */

/**
 * **A select whose value is not among its options shows its first option instead.**
 *
 * That is the whole of issue #45, and it is why this block asserts a *containment* rather than a
 * list. `dev/main.ts`'s `optionsFor` builds the rated-speed options from
 * {@link speedChoices} and sets the row's value to the bank's as-built speed; if the ladder omits
 * that speed, the screen silently prints the bottom of the class band under the sentence *"the
 * shafts, the machines and their speeds are what the building already has"*. Before the repair,
 * **nine of the fourteen shipped banks** were in that state.
 *
 * The building list is **read off disk** rather than written here, on § D192's rule: a hand-written
 * list of eight names is a list that stops covering the ninth building the day it lands, and this
 * is exactly the property that has to hold for a building nobody has written yet.
 */
describe('every shipped bank can be shown at the speed it is authored at — issue #45', () => {
  const BUILDING_IDS = readdirSync(join(DATA_DIR, 'buildings'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/, ''))
    .sort();

  it('reads the building set from disk, so a new building is covered by arriving', () => {
    expect(BUILDING_IDS.length).toBeGreaterThanOrEqual(8);
    expect(BUILDING_IDS).toContain('secure-tower');
  });

  it.each(BUILDING_IDS)('%s — every bank’s rated speed is on its class’s ladder', (id) => {
    const base = fromDisk(id);
    const built = asBuiltChoices(base, CLASSES);
    expect(built.length).toBeGreaterThan(0);
    for (const choice of built) {
      const machineClass = classById(CLASSES, choice.machineClassId);
      expect(machineClass).toBeDefined();
      // The comparison is `String(...)`, not a numeric one, because that is what the DOM does: the
      // option's id is a string and the select matches on it. `4` and `4.0000001` are one number to
      // a tolerance and two different options to a `<select>`.
      const ladder = speedChoices(machineClass).map(String);
      expect(ladder, `${id}/${choice.bankId} at ${String(choice.ratedSpeedMps)} m/s`).toContain(
        String(choice.ratedSpeedMps),
      );
    }
  });

  it('names the three banks that were wrong before the repair, so a regression is legible', () => {
    // Secure Tower is issue #45's own title case: header 4 m/s, screen 2.50 m/s.
    const cases: readonly (readonly [string, string, number])[] = [
      ['secure-tower', 'low', 4],
      ['chancery-house', 'main', 5],
      ['crown-hotel', 'main', 3],
    ];
    for (const [id, bankId, speed] of cases) {
      const choice = asBuiltChoices(fromDisk(id), CLASSES).find(
        (entry) => entry.bankId === bankId,
      );
      expect(choice?.ratedSpeedMps).toBe(speed);
      expect(speedChoices(classById(CLASSES, choice?.machineClassId ?? '')).map(String)).toContain(
        String(speed),
      );
    }
  });

  it('offers each class its own band and nothing outside it', () => {
    /*
     * Issue #49 reported that *"every machine class offers the identical speed list (2.50 → 7.00)"*
     * and that *"the lowest speed offered is 2.50 m/s"*. Both are refuted here rather than assumed:
     * the ladder has always been the class's own declared band, and the reporter only ever saw
     * `gearless-traction`'s because the machine-class select could not be moved (issue #42). The
     * assertion is kept because the claim is worth being able to check.
     */
    for (const machineClass of CLASSES) {
      const ladder = speedChoices(machineClass);
      expect(ladder.length).toBeGreaterThan(1);
      expect(ladder[0]).toBe(machineClass.speedMinMps);
      expect(ladder[ladder.length - 1]).toBe(machineClass.speedMaxMps);
      expect(ladder).toContain(machineClass.speedTypicalMps);
      for (const speed of ladder) {
        expect(speed).toBeGreaterThanOrEqual(machineClass.speedMinMps);
        expect(speed).toBeLessThanOrEqual(machineClass.speedMaxMps);
      }
    }
    // Hydraulic offers 0.63 m/s — the speed Garden Apartments runs at, and well below the 2.50 the
    // report called the floor of the list.
    const hydraulic = speedChoices(classById(CLASSES, 'hydraulic'));
    expect(hydraulic).toContain(0.63);
    expect(Math.min(...hydraulic)).toBeLessThan(2.5);
    // And no two classes offer the same list, which is the substance of the "identical" complaint.
    const lists = CLASSES.map((entry) => JSON.stringify(speedChoices(entry)));
    expect(new Set(lists).size).toBe(CLASSES.length);
  });

  it('keeps the ladder short enough to be a select rather than a scroll', () => {
    for (const machineClass of CLASSES) {
      expect(speedChoices(machineClass).length).toBeLessThanOrEqual(12);
    }
    expect(speedChoices(undefined)).toEqual([]);
  });
});
