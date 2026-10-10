/**
 * **Which shafts a Career shaft tier sinks on one tower, and the price band of each** — GitHub issue
 * #429's Career half, [§ D1312](../../../../DECISIONS.md).
 *
 * ## The defect this closes
 *
 * `docs/38` § 2.2 says *"a fourth car costs the same units in both modes"*. Since § D631 a fix-it
 * case prices one new shaft as `new-car` plus the `shaft-area` row at its bank's plan-area band, and
 * the Career shop went on quoting the bare row: 34 u against 42 u for the same shaft in the same
 * Midtown bank, and different on 59 of the 62 shipped banks. And `FitOutDelta.extraShafts` adds a
 * shaft to **every** bank the applier grows, so one 34 u row sank seven shafts on Willis.
 *
 * `campaign/economy.ts#shopTierPrice` now charges per shaft at the fix-it price. This module says
 * which shafts those are, in the one form that cannot drift from the run: **it asks the applier.**
 * `campaign/fitOut.ts#fittedBuilding` is what `dev/state.ts#shiftRunConfigOf` grows a career day's
 * tower with, so the cars it adds here are the cars the day gets. A mixed-fleet bank, which that
 * applier leaves as authored, gains no car and is charged nothing, and no rule about which banks
 * grow is restated here.
 *
 * ## One reader for the band, shared with Scenario
 *
 * The band is `pricing/parse.ts#shaftAreaBandOf` over `core`'s `config/floorArea.ts#shaftPlanAreaM2`,
 * the two functions `fixit/parse.ts#fixitContextOf` reads for a fix-it case. So a change to
 * `data/price-schedule.json`'s `areaBands` or to the `shaft-area` row's rate moves both modes'
 * prices together, which `shaftPlan.test.ts` asserts on a moved fixture over every shipped bank.
 *
 * ## The tower is the one the contract hands over
 *
 * A career day stands on its building's rung (`shift/ladder.ts#rungFor` lends a week on the career
 * sentinel the building's own contract), so the band and the count are taken on
 * `shift/ladder.ts#ladderTowerConfig`'s tower, the one `everyday/host.ts`'s spec line and start-time
 * count already read. Measured on the base this landed on: every bank of all sixteen contract towers
 * takes the same band on its rung as the shipped building gives a fix-it case, and both shaft tiers
 * add one shaft a bank on every bank except the two mixed fleets, `crown-hotel/main` and
 * `st-jude-hospital/main`.
 */

import {
  parseBuilding,
  resolveBuilding,
  shaftPlanAreaM2,
  type BuildingConfig,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';

import { shaftAreaBandOf } from '../pricing/parse.js';
import type { PriceSchedule } from '../pricing/types.js';
import { contractForBuilding } from '../shift/contracts.js';
import { ladderTowerConfig } from '../shift/ladder.js';

import { SHOP, shopTierAt, type AddedShaft, type TowerShafts } from './economy.js';
import { AS_BUILT, fittedBuilding } from './fitOut.js';

/**
 * The shafts each shaft tier sinks on `tower`, keyed by the tier's `priceId`, or `undefined` when the
 * tower does not resolve.
 *
 * Level by level over the tier below, because § 8.2's first buying rule makes a tier require the one
 * under it and `campaign/fitOut.ts#fitOutOf` reads the highest live level whole: buying the fifth car
 * after the fourth sinks the difference between the two levels' `extraShafts`, and that difference is
 * what is priced. Every shaft tier in `SHOP` gets an entry, an empty one where no bank grows, so
 * `economy.ts#shaftsAddedBy` refuses that tier rather than charging its row alone.
 */
export function towerShaftsOf(
  tower: BuildingConfig,
  specs: ElevatorSpecs,
  schedule: PriceSchedule,
  /** The tower resolved, when the caller already holds it; resolved here when not. */
  resolved?: ResolvedBuilding,
): TowerShafts | undefined {
  let standing: ResolvedBuilding;
  try {
    standing = resolved ?? resolveBuilding(tower, specs);
  } catch {
    return undefined;
  }
  const table = specs.shaftFootprint;
  const bandOf = new Map<string, number | undefined>();
  for (const bank of standing.banks) {
    const areaM2 = table === undefined ? undefined : shaftPlanAreaM2(bank, standing.floors, table);
    bandOf.set(bank.id, areaM2 === undefined ? undefined : shaftAreaBandOf(schedule, areaM2));
  }
  /* Cars per bank once `extraShafts` are sunk, each level built once though two tiers read it. */
  const built = new Map<number, ReadonlyMap<string, number>>();
  const carsAt = (extraShafts: number): ReadonlyMap<string, number> => {
    const known = built.get(extraShafts);
    if (known !== undefined) return known;
    const fitted = extraShafts === 0 ? tower : fittedBuilding(tower, { ...AS_BUILT, extraShafts }, specs);
    const cars = new Map(fitted.banks.map((bank) => [bank.id, bank.cars.length] as const));
    built.set(extraShafts, cars);
    return cars;
  };
  const shafts = new Map<string, readonly AddedShaft[]>();
  for (const category of SHOP) {
    for (const tier of category.tiers) {
      const wanted = tier.fits.extraShafts;
      if (wanted === undefined) continue;
      const before = carsAt(shopTierAt(category.id, tier.level - 1)?.fits.extraShafts ?? 0);
      const after = carsAt(wanted);
      const added: AddedShaft[] = [];
      for (const bank of tower.banks) {
        const grown = (after.get(bank.id) ?? 0) - (before.get(bank.id) ?? 0);
        for (let shaft = 0; shaft < grown; shaft += 1) {
          added.push(Object.freeze({ bankId: bank.id, band: bandOf.get(bank.id) }));
        }
      }
      shafts.set(tier.priceId, Object.freeze(added));
    }
  }
  return shafts;
}

/** The structural minimum of `dev/data.ts#BrowserResources` that {@link careerTowerShaftsOf} reads. */
export interface CareerShaftResources {
  readonly entries: readonly { readonly config: BuildingConfig }[];
  readonly elevatorSpecs: ElevatorSpecs;
  readonly priceSchedule: PriceSchedule;
}

/**
 * {@link towerShaftsOf} on the tower a career day runs for `buildingId`, or `undefined` for a
 * building this build does not ship.
 *
 * `shift/ladder.ts#ladderTowersOf`'s derivation, kept to the letter so the shop prices the tower the
 * desk's spec line describes: the building's own contract's rung, and the tower as authored when the
 * rung would not resolve. The non-test callers are `everyday/host.ts`'s `buildingShafts` binding,
 * which the desk's shop rows read, and its `campaignAct`, which hands the same answer to
 * `campaign/career.ts#applyCampaignAction` so the reducer charges what the row showed.
 */
export function careerTowerShaftsOf(
  resources: CareerShaftResources,
  buildingId: string,
): TowerShafts | undefined {
  const entry = resources.entries.find((candidate) => candidate.config.id === buildingId);
  if (entry === undefined) return undefined;
  const specs = resources.elevatorSpecs;
  const handed = ladderTowerConfig(entry.config, contractForBuilding(buildingId)?.id, specs);
  if (handed !== entry.config) {
    try {
      const resolved = resolveBuilding(parseBuilding(handed as unknown), specs);
      return towerShaftsOf(handed, specs, resources.priceSchedule, resolved);
    } catch {
      /* `ladderTowersOf`'s own fallback: a rung that will not resolve hands over the tower as built. */
    }
  }
  return towerShaftsOf(entry.config, specs, resources.priceSchedule);
}
