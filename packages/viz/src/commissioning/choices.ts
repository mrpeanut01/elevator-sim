/**
 * Reading a building as a set of choices, and pricing a set of choices.
 *
 * Two jobs, and they are here together because the second is meaningless without the first: a
 * capital figure is only ever read **relative to what the building already stands as**, so the
 * as-built choice set is the origin of the only axis this module has.
 *
 * ## The diff is `campaign/dimensions.ts`'s, not a new one
 *
 * {@link movedChoices} returns `MovedDimension`s — the stage campaign's own shape — with a bank id
 * added, and `refusals.ts` consumes them the way `admitProfile` consumes its own: *these moved and
 * the constraint opens them; these moved and it does not; here are the second kind, by name.* The
 * reuse is not decorative. `admitProfile`'s sentence — *"it also changes `idle.parkingStrategy`,
 * which this stage does not open"* — is the exact sentence a retrofit screen has to print about a
 * shaft, and writing a second one would be two vocabularies for one idea.
 *
 * `null` keeps its meaning from there too: *this dial is not live on that side*, never a zero. A
 * bank that appears in one choice set and not the other reads `—`.
 *
 * ## What capital is, and what it is not
 *
 * It is **units**, monotone in all three dimensions, and that is the whole specification. More
 * shafts cost more; a class rated to climb further costs more; a faster car costs more. Nothing
 * else is claimed: it is not currency, it is not a measurement of anything real, it does not
 * convert to energy or to time, and it is never compared with anything a run produced. See
 * `types.ts` for why that restraint is the load-bearing part.
 *
 * The three constants below are named rather than inlined so the monotonicity above is checkable
 * by reading them, and they are derived from quantities the specs file **declares** — the class's
 * own `maxRiseM` and the car's own rated speed — rather than from a per-class price list. A price
 * list would be the `if (classId === 'gearless-traction')` invariant 7 forbids, wearing a table.
 */

import type { BuildingConfig } from '@elevator-sim/core/browser';

import { valueText, type MovedDimension } from '../campaign/dimensions.js';

import {
  COMMISSIONING_DIMENSIONS,
  classById,
  type BankChoice,
  type CapitalConstraint,
  type CommissionableClass,
  type CommissioningChoices,
  type CommissioningDimension,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Reading the building
 * -------------------------------------------------------------------------- */

/**
 * What the building already stands as, expressed as choices.
 *
 * The rated speed falls back to the class's `typical` when the car does not declare one, because
 * that is what `resolveCar` will use — reading the field as absent would report a speed of zero
 * for a car that runs perfectly well.
 *
 * A bank whose cars disagree with each other is reported from its **first** car, and that is a
 * lossy reading rather than a wrong one: {@link mixedFleetBanks} names those banks and
 * `refusals.ts` refuses to commission them at all, so the lossy reading is never the thing a run
 * is built from.
 */
export function asBuiltChoices(
  base: BuildingConfig,
  classes: readonly CommissionableClass[],
): CommissioningChoices {
  return Object.freeze(
    base.banks.map((bank) => {
      const first = bank.cars[0];
      const machineClassId = first?.spec ?? '';
      const machineClass = classById(classes, machineClassId);
      return Object.freeze({
        bankId: bank.id,
        shafts: bank.cars.length,
        machineClassId,
        ratedSpeedMps: first?.ratedSpeedMps ?? machineClass?.speedTypicalMps ?? 0,
      });
    }),
  );
}

/**
 * Banks whose shipped cars are not all the same machine.
 *
 * A bank is mixed when its cars disagree on class, rated speed or rated load — the three things a
 * {@link BankChoice} collapses to one value each. **Two shipped buildings raise it**:
 * `crown-hotel`'s `main` and `st-jude-hospital`'s `main`. Both are deliberate authoring — a hotel
 * with one slower service car, a hospital with a bed car — and a commissioning screen that
 * flattened them would delete the thing the building was written to teach.
 *
 * Reported rather than repaired. `refusals.ts` turns it into a refusal beside the control; nothing
 * here decides what to do about it.
 */
export function mixedFleetBanks(base: BuildingConfig): readonly string[] {
  const mixed: string[] = [];
  for (const bank of base.banks) {
    const first = bank.cars[0];
    if (first === undefined) continue;
    const differs = bank.cars.some(
      (car) =>
        car.spec !== first.spec ||
        car.ratedSpeedMps !== first.ratedSpeedMps ||
        car.ratedLoadLb !== first.ratedLoadLb,
    );
    if (differs) mixed.push(bank.id);
  }
  return Object.freeze(mixed);
}

export function choiceForBank(
  choices: CommissioningChoices,
  bankId: string,
): BankChoice | undefined {
  return choices.find((choice) => choice.bankId === bankId);
}

/** Replace one bank's choice, keeping the rest and the order. Appends a bank not yet chosen for. */
export function withBankChoice(choices: CommissioningChoices, next: BankChoice): CommissioningChoices {
  const seen = choices.some((choice) => choice.bankId === next.bankId);
  return Object.freeze(
    seen ? choices.map((choice) => (choice.bankId === next.bankId ? next : choice)) : [...choices, next],
  );
}

/* -------------------------------------------------------------------------- *
 * The diff
 * -------------------------------------------------------------------------- */

/** One dimension, on one bank, on which two choice sets describe different hardware. */
export interface MovedChoice extends MovedDimension {
  readonly bankId: string;
  readonly dimension: CommissioningDimension;
}

/** The value each dimension reads at, for the diff. */
function valueOf(choice: BankChoice, dimension: CommissioningDimension): string | number {
  switch (dimension) {
    case 'shafts':
      return choice.shafts;
    case 'machineClass':
      return choice.machineClassId;
    case 'ratedSpeed':
      return choice.ratedSpeedMps;
  }
}

/**
 * Every dimension on which `candidate` describes different hardware from `baseline`.
 *
 * **A bank only one side names is not a move.** Absence means *not decided* — see
 * {@link CommissioningChoices}: a screen that has not drawn a bank's controls has decided nothing
 * about it, and `commissionedBuilding` leaves such a bank exactly as authored. Reporting three
 * moves to `—` for a bank nobody touched would put three refusals under a control that is not on
 * the screen, which is the opposite of *beside the control*.
 *
 * Bank order follows `baseline` and dimension order follows {@link COMMISSIONING_DIMENSIONS} — a
 * total order, so the refusal list a screen prints is the same list every time it is computed.
 * Ordering by a `Map`'s insertion is how a list that looks stable stops being (invariant 4's
 * discipline, applied to a display decision, the way `shift/incidents.ts` applies it).
 */
export function movedChoices(
  baseline: CommissioningChoices,
  candidate: CommissioningChoices,
): readonly MovedChoice[] {
  const moved: MovedChoice[] = [];
  for (const from of baseline) {
    const to = choiceForBank(candidate, from.bankId);
    if (to === undefined) continue;
    for (const dimension of COMMISSIONING_DIMENSIONS) {
      const left = valueOf(from, dimension);
      const right = valueOf(to, dimension);
      if (String(left) === String(right)) continue;
      moved.push({ bankId: from.bankId, dimension, id: `${from.bankId}.${dimension}`, from: left, to: right });
    }
  }
  return Object.freeze(moved);
}

/** How one moved dimension reads in a sentence beside its control. */
export function movedChoiceText(moved: MovedChoice): string {
  return `${valueText(moved.from)} → ${valueText(moved.to)}`;
}

/* -------------------------------------------------------------------------- *
 * Capital
 * -------------------------------------------------------------------------- */

/** The hoistway itself: what a shaft costs before anything is hung in it. */
export const CAPITAL_UNITS_PER_SHAFT = 100;

/** Per m/s of rated speed, per car. */
export const CAPITAL_UNITS_PER_MPS = 20;

/** Per metre of the class's own declared `maxRiseM`, per car. A taller-rated machine costs more. */
export const CAPITAL_UNITS_PER_RATED_RISE_M = 0.2;

/**
 * What one bank's choice commits, in capital units.
 *
 * A class the list does not contain contributes its shafts and nothing else — the machine is
 * unpriced because it is unknown, and `refusals.ts` refuses the choice by name rather than letting
 * a plausible number stand in for one. A plausible number for an unknown input is the confident
 * nonsense this project exists to avoid, at a much smaller scale.
 */
export function capitalOfBank(choice: BankChoice, classes: readonly CommissionableClass[]): number {
  const machineClass = classById(classes, choice.machineClassId);
  const perCar =
    machineClass === undefined
      ? 0
      : choice.ratedSpeedMps * CAPITAL_UNITS_PER_MPS +
        machineClass.maxRiseM * CAPITAL_UNITS_PER_RATED_RISE_M;
  return Math.round(Math.max(0, choice.shafts) * (CAPITAL_UNITS_PER_SHAFT + perCar));
}

/** What a whole choice set commits. */
export function capitalOf(
  choices: CommissioningChoices,
  classes: readonly CommissionableClass[],
): number {
  return choices.reduce((sum, choice) => sum + capitalOfBank(choice, classes), 0);
}

/**
 * What a constraint allows on this building — the as-built capital, plus its headroom.
 *
 * Relative, and computed from the building rather than from a table, so a constraint means the
 * same thing on Garden Apartments and on Vertical City. `retrofit`'s headroom is `0`, so its
 * budget is exactly the building it was handed.
 */
export function budgetFor(
  constraint: CapitalConstraint,
  base: BuildingConfig,
  classes: readonly CommissionableClass[],
): number {
  return Math.round(capitalOf(asBuiltChoices(base, classes), classes) * (1 + constraint.headroom));
}

/* -------------------------------------------------------------------------- *
 * What a control may offer — derived, never listed
 * -------------------------------------------------------------------------- */

/**
 * How far either side of what a bank has the shaft control reaches.
 *
 * One fewer and four more, and both bounds are choices rather than arithmetic. **Down by one only**,
 * because taking shafts away is the move that teaches — `docs/17` § 4.4's retrofit lesson is that
 * geometry beats dispatch, and you feel that by losing a car, not by losing four. **Up by four**,
 * because the largest shipped bank has eight and the rewards `shift/contracts.ts` hands out are
 * *"one spare shaft"* and *"two more shafts"*, so four is past anything the campaign offers and
 * still short of a ladder nobody would scroll.
 *
 * A bank never goes below one: a bank with no cars is not a smaller bank, it is a different
 * building, and `commissionedBuilding` clamps there too.
 */
export function shaftChoices(current: number): readonly number[] {
  const lowest = Math.max(1, current - 1);
  const out: number[] = [];
  for (let n = lowest; n <= current + 4; n += 1) out.push(n);
  return Object.freeze(out);
}

/**
 * The step sizes the speed ladder is allowed to use, smallest first.
 *
 * Round numbers, because the ladder's job is to be *chooseable*: `3.63 m/s` is not a speed anybody
 * specifies, and a list of five of them reads as an interpolation rather than as a set of settings.
 */
const SPEED_STEPS_MPS: readonly number[] = Object.freeze([0.05, 0.1, 0.25, 0.5, 1, 2, 5]);

/** Most intervals a band may be cut into. Eleven entries is the longest select worth scrolling. */
const MAX_SPEED_INTERVALS = 10;

/** A hundredth, because the select compares its value against the option id **as a string**. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The speeds a machine class may run at — **its own declared band**, on a round step.
 *
 * Derived from `data/elevator-specs.json` rather than authored, so a class whose band moves brings
 * its control with it. The band's endpoints are included because they are real settings: 2.5 m/s is
 * the shared endpoint of `geared-traction` and `gearless`, and it is the one speed in the shipped
 * tree at which a machine class can be changed **without** dragging the speed along — the bands are
 * laid end to end and no two overlap, which `commissioning`'s own suite asserts.
 *
 * A control that offered a speed outside the band would be one the loader then refuses, which is
 * `docs/16` S7's *not offered rather than offered and refused*.
 *
 * ## Why the step is round, and the declared typical always offered — issue #45
 *
 * This used to cut the band into **exactly four equal steps**, and that is a subtler defect than it
 * looks. The ladder is what the select's options are; the select's *value* is the bank's as-built
 * speed; and a `<select>` whose value matches no option shows **its first option instead**. So on
 * every building whose speed did not happen to land on one of the four cut points, the screen
 * printed the bottom of the class band and called it *what the building already has*. That was
 * **nine of the fourteen shipped banks** — Secure Tower's 4 m/s and Chancery House's 5 m/s both
 * read `2.50 m/s`, contradicting the header on the same screen, and Midtown Office agreed only
 * because 2.5 is the first cut point.
 *
 * Two changes fix it and neither is a special case. The step is the smallest of
 * {@link SPEED_STEPS_MPS} that cuts the band into no more than {@link MAX_SPEED_INTERVALS}, so
 * `gearless-traction`'s 2.5–7.0 goes in halves and therefore contains 3, 4 and 5 — the speeds the
 * shipped buildings are actually written at. And the class's **declared `typical`** is always
 * offered, because it is the one speed in the band the reference data names.
 *
 * That is the same set `buildingEditor.ts`'s `speedChipsOf` builds, minus its last line: it also
 * adds *the value the document already carries*, which is the only construction that cannot miss.
 * This function is not handed that value — `dev/main.ts`'s `optionsFor` calls it with the class
 * alone — so the guarantee is carried by `commissioning.test.ts` instead, which asserts over
 * **every bank of every shipped building** that its as-built speed is on the ladder its class
 * offers. A building authored off the ladder fails that test rather than misreporting itself, and
 * the fix at that point is to pass the current speed in.
 */
export function speedChoices(machineClass: CommissionableClass | undefined): readonly number[] {
  if (machineClass === undefined) return Object.freeze([]);
  const low = Math.min(machineClass.speedMinMps, machineClass.speedMaxMps);
  const high = Math.max(machineClass.speedMinMps, machineClass.speedMaxMps);
  if (high - low < 1e-9) return Object.freeze([round2(low)]);

  const width = high - low;
  const step =
    SPEED_STEPS_MPS.find((candidate) => width / candidate <= MAX_SPEED_INTERVALS + 1e-9) ??
    width / MAX_SPEED_INTERVALS;

  // Indexed rather than accumulated: `low += step` drifts, and a drifted 4.000000000000001 is a
  // different option id from the `4` the bank is authored at, which is the whole bug above.
  const offered = new Set<number>([round2(low), round2(high)]);
  for (let index = 1; low + index * step < high - 1e-9; index += 1) {
    offered.add(round2(low + index * step));
  }
  const typical = machineClass.speedTypicalMps;
  if (typical >= low - 1e-9 && typical <= high + 1e-9) offered.add(round2(typical));

  return Object.freeze([...offered].sort((a, b) => a - b));
}
