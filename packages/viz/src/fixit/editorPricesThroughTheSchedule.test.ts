/**
 * **Every fix-it price the product ships, pinned to the run that produces it** — GitHub issue
 * **#528**, [§ D560](../../../../DECISIONS.md).
 *
 * #528 says `fixit/engine.ts#editorPricingFrom` *"multiplies flat rows in code"*. **It does not, and
 * the correction matters more than the verdict.** Traced on `155bf07`, before this file existed:
 *
 * | | what it actually does |
 * |---|---|
 * | `fixit/engine.ts:65-77` `editorPricingFrom` | reads **three flat rows** — `new-car`, `faster-machines`, `larger-car-step` — through `pricing/parse.ts#priceOf` and `#purchaseUnits`, each with no quantity. It multiplies nothing |
 * | `fixit/engine.ts:205-206` `spendOf` | **this** is the multiplier: `state.speedSteps * pricing.speedUnitsPerHalfMps + state.capacitySteps * pricing.capacityUnitsPerTwoPlaces` |
 * | `fixit/engine.ts:321,337` `stepSpeed`, `stepCapacity` | charge **one** step for affordability. No multiplication |
 * | `everyday/fixitScreenModel.ts:263,274`, `dev/fixitPanel.ts:547-548` | multiply `steps` by `0.5 m/s` and by `2 places` — **magnitudes, not prices** |
 *
 * So the issue's *substance* survives — a magnitude term for a price lives in code where the
 * schedule cannot see it — and its *sentence* does not: the function it names is the one function in
 * the chain that is innocent. Naming the wrong function would have sent the fix into `editorPricingFrom`,
 * where there is nothing to fix.
 *
 * ## What this file is for
 *
 * It is the before-and-after pin § D560 is measured on. Every figure here was read off `155bf07`
 * **before** the seam moved and re-read after it; the two readings are identical, which is the claim
 * the issue's third point asks for. The figures are **literals rather than read back off the
 * schedule**, deliberately and for `engine.test.ts`'s stated reason: a test that compares the
 * schedule with itself passes whatever the file says, and this is the place a price change has to be
 * looked at by a person.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { repairPriceUnits, type RepairPatchShape } from '../pricing/repairPrice.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import {
  editorPricingFrom,
  emptyFixitState,
  parkingPriceUnits,
  spendOf,
  zonePriceUnits,
} from './engine.js';
import type { FixitCase } from './types.js';

/** A case with no repairs and no extras, so `spendOf` reports the editor's own arithmetic alone. */
const BARE: FixitCase = {
  id: 'pin',
  name: 'The pinned case',
  buildingId: 'tower',
  dispatcherProfileId: 'order',
  run: { seed: '1', durationS: 900, arrivalRatePctPop5min: null },
  asBuilt: { note: 'As it stands.', patch: {} },
  complaint: {
    text: 'The wait is long.',
    complainer: 'tenant',
    measure: {
      kind: 'long-waits',
      label: 'waits over a minute',
      thresholdS: 60,
      scope: { mode: 'origin', floorIds: ['3'] },
    },
  },
  symptom: 'waits',
  figures: [],
  diagnosis: { text: 'Parked wrong.', reasoning: 'Measured.' },
  /* Wide enough that nothing below is refused for affordability: this file prices, it does not gate. */
  budgetUnits: 400,
  repairs: [],
  result: { head: 'Fixed head.', body: 'Fixed body.' },
};

/** Every repair the shipped file carries, priced the way `fixit/parse.ts` prices it at load. */
function shippedRepairPrices(): ReadonlyMap<string, number> {
  const schedule = shippedPriceSchedule();
  const raw = JSON.parse(readFileSync(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as {
    readonly cases: readonly {
      readonly id: string;
      readonly repairs: readonly { readonly id: string; readonly patch: RepairPatchShape }[];
    }[];
  };
  const out = new Map<string, number>();
  for (const entry of raw.cases) {
    for (const repair of entry.repairs) {
      out.set(`${entry.id}/${repair.id}`, repairPriceUnits(schedule, repair.patch));
    }
  }
  return out;
}

describe('the fix-it editor prices through the schedule — GitHub issue #528', () => {
  it('prices its four controls at 34 u, 10 u a half-step, 8 u for two places and a free park', () => {
    const schedule = shippedPriceSchedule();
    expect(editorPricingFrom(schedule)).toEqual({
      shaftUnits: 34,
      speedUnitsPerHalfMps: 10,
      capacityUnitsPerTwoPlaces: 8,
    });
    expect(zonePriceUnits(schedule)).toBe(6);
    expect(parkingPriceUnits(schedule)).toBe(0);
  });

  /**
   * The two steppers, step by step, as the panel charges them.
   *
   * Eight steps rather than one, because one step cannot tell a per-step price from a flat one: at
   * `steps: 1` a row charged once and a row charged per step read the same figure. The table is
   * where the multiplier is visible, and it is the table § D560 had to leave unmoved.
   */
  it('charges 10 u a speed step and 8 u a capacity step, pinned step by step', () => {
    const schedule = shippedPriceSchedule();
    const speed = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (steps) => spendOf(BARE, { ...emptyFixitState(), speedSteps: steps }, schedule).editorUnits,
    );
    const capacity = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
      (steps) => spendOf(BARE, { ...emptyFixitState(), capacitySteps: steps }, schedule).editorUnits,
    );
    expect(speed).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
    expect(capacity).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 64]);
  });

  it('adds the two settings to the steppers and counts only the steel as machinery', () => {
    const schedule = shippedPriceSchedule();
    const spend = spendOf(
      BARE,
      {
        ...emptyFixitState(),
        speedSteps: 2,
        capacitySteps: 1,
        zoneOverlapFloors: 1,
        parkingStrategy: 'lobby',
      },
      schedule,
    );
    expect(spend).toEqual({
      repairUnits: 0,
      extraUnits: 0,
      /* 20 speed + 8 capacity + 6 rezone + 0 parking. */
      editorUnits: 34,
      totalUnits: 34,
      /* The rezone and the parking rule are settings, so the machinery share is the steppers'. */
      machineryUnits: 28,
    });
  });

  /**
   * **Every shipped repair price, by case.** `data/fixit-cases.json` carries no `costUnits` at all —
   * `fixit/parse.ts:645` prices each repair through `pricing/repairPrice.ts#repairPriceUnits` at
   * load — so these eighteen sums are what a player is charged in the shipped product, and a seam
   * that moved one of them would turn this red. The grand total is the cheapest way to say *none of
   * the seventy-two moved*.
   */
  it('prices all seventy-two shipped repairs, case by case, at 888 u in total', () => {
    const prices = shippedRepairPrices();
    const byCase = new Map<string, number>();
    for (const [key, units] of prices) {
      const id = key.slice(0, key.indexOf('/'));
      byCase.set(id, (byCase.get(id) ?? 0) + units);
    }
    expect(Object.fromEntries(byCase)).toEqual({
      'sleeping-sky-lobby': 46,
      'zoning-starves-the-top': 52,
      'three-cars-one-cars-work': 46,
      'doors-that-never-close': 51,
      'cars-that-always-go-home': 49,
      'car-park-nobody-serves': 52,
      'express-that-stops-everywhere': 52,
      'deliveries-on-the-passenger-group': 44,
      'one-start-time': 51,
      'every-letter-says-nine': 40,
      'everyone-leaves-at-once': 55,
      'bed-cars-locked-out': 48,
      'two-cars-out-wrong-month': 52,
      'every-deck-calls-itself-full': 52,
      'restaurant-above-the-ballroom': 52,
      'controller-sends-every-car': 48,
      'let-faster-than-the-lifts': 52,
      'gym-on-the-top-floor': 46,
    });
    expect(prices.size).toBe(72);
    expect([...prices.values()].reduce((sum, units) => sum + units, 0)).toBe(888);
  });

  /**
   * **The divergence #528 predicted, already shipped — and this commit does not close it.**
   *
   * The issue expects the fix-it price and the scenario price to part company *"the day #437's rate
   * row ships"*. They have parted already, inside the fix-it screen itself, and these three figures
   * are the whole of it:
   *
   * | the same purchase, +1.0 m/s | priced at |
   * |---|---|
   * | `zoning-starves-the-top/regear-the-upper-car`, one car | **10 u** |
   * | `car-park-nobody-serves/regear-the-garage-car`, one car | **10 u** |
   * | the editor's stepper, two half-steps | **20 u** |
   *
   * And `sleeping-sky-lobby/regear-the-shuttles` buys +0.5 m/s on **eight** cars for the same 10 u,
   * which is the schedule saying in its own voice what `faster-machines`' note says in prose: the row
   * is flat, with *"no rule relating the price to how much"* is bought. The editor has a rule; the
   * schedule does not hold it.
   *
   * **Closing it moves a shipped price in one direction or the other** — either the editor's second
   * step becomes free, or the two repairs double — so § D560 leaves both figures exactly where they
   * are and drafts the data change for the owner instead. This case is the register that keeps the
   * disagreement visible until somebody rules on it; it goes red on the commit that decides.
   */
  it('still charges twice in the editor for a metre per second the schedule prices once', () => {
    const schedule = shippedPriceSchedule();
    const prices = shippedRepairPrices();
    const wholeMetreAsARepair = 10;
    expect(prices.get('zoning-starves-the-top/regear-the-upper-car')).toBe(wholeMetreAsARepair);
    expect(prices.get('car-park-nobody-serves/regear-the-garage-car')).toBe(wholeMetreAsARepair);
    /* Eight cars, half the bump, the same flat row, the same price. */
    expect(prices.get('sleeping-sky-lobby/regear-the-shuttles')).toBe(wholeMetreAsARepair);
    const wholeMetreInTheEditor = spendOf(
      BARE,
      { ...emptyFixitState(), speedSteps: 2 },
      schedule,
    ).editorUnits;
    expect(wholeMetreInTheEditor).toBe(20);
    expect(wholeMetreInTheEditor).not.toBe(wholeMetreAsARepair);
  });
});
