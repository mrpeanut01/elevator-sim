/**
 * One price schedule's types — GitHub issue **#366**, [§ D525](../../../../DECISIONS.md) clause 2,
 * `docs/38` § 2.1 — **re-exported from `@elevator-sim/core`**, where they now live.
 *
 * They moved unchanged in wave AN with their reader (`pricing/parse.ts`, re-exported the same way):
 * `packages/server` prices a rush rebuild bought between rounds and may not import this package, so
 * the schedule's types and its reader sit in the package both depend on (GitHub issue #372,
 * [§ D1295](../../../../DECISIONS.md)). The argument this module used to carry, the six price lists
 * #366 found and why the ladder is derived rather than declared, went with the code to
 * `packages/core/src/config/priceScheduleTypes.ts`. Every name is re-exported here so that nothing that
 * imported it from this path had to move, which is what makes the move a relocation and not a change.
 */

export type {
  AreaBand,
  FlatPricedChange,
  PriceRate,
  PriceSchedule,
  PriceSchema,
  PriceTier,
  PricedChange,
  PricedExtra,
  QuantitySchema,
  RatedPricedChange,
  WithheldChange,
} from '@elevator-sim/core/browser';
