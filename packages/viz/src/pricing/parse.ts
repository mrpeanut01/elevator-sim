/**
 * Reading `data/price-schedule.json`, and refusing the ways it can be wrong — **re-exported from
 * `@elevator-sim/core`**, where the reader now lives.
 *
 * It moved unchanged in wave AN (GitHub issue #372, [§ D1295](../../../../DECISIONS.md)):
 * `packages/server` prices a rush rebuild bought between rounds, may not import this package, and
 * so needs the reader in the package both already depend on. The rules it enforces and the argument
 * for each are on `packages/core/src/config/priceSchedule.ts`; the tests that hold them stay in this
 * directory and import from here, which is why every name is re-exported under the name it had.
 *
 * **One name is re-exported under its old spelling.** Core's barrel calls the whole-schedule check
 * `violationsInPriceSchedule`, because a barrel that wide cannot carry a name that says nothing about
 * what it checks; this module keeps `violationsIn`, so no caller here moved.
 *
 * **This is still where a price meets a count, as far as this package is concerned.**
 * `pricing/pricesAreMultipliedOnlyHere.test.ts` exempts this directory and scans the rest of
 * `packages/viz/src`; the three functions that multiply (`purchaseUnits`, `steppedPurchaseUnits`,
 * `ceilingUnitsOf`) are the same three, at a new address.
 */

export {
  PriceScheduleError,
  ceilingUnitsOf,
  changeCovering,
  parsePriceSchedule,
  priceOf,
  purchaseUnits,
  shaftAreaBandOf,
  smallestPurchaseUnitsOf,
  steppedPurchaseUnits,
  violationsInPriceSchedule as violationsIn,
} from '@elevator-sim/core/browser';
