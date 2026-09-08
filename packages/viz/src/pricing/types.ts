/**
 * One price schedule — GitHub issue **#366**, [§ D525](../../../../DECISIONS.md) clause 2,
 * `docs/38` § 2.1.
 *
 * `CLAUDE.md` invariant 7: *anything tunable is data, not code.* A price is as tunable as a
 * dispatch weight, and until this file there were **six** places that priced a change:
 *
 * | | what it priced |
 * |---|---|
 * | `data/fixit-cases.json` | a `costUnits` on each of 72 repairs |
 * | `fixit/parse.ts` | `NEW_SHAFT_UNITS`, `DIAGNOSED_MAX_UNITS` |
 * | `fixit/engine.ts` | `EDITOR_PRICING`, and five `STANDING_EXTRAS` |
 * | `campaign/economy.ts` | `SHOP`'s sixteen tiers |
 * | `commissioning/types.ts` | `CapitalConstraint.headroom` |
 *
 * Issue #366 says three. There were six, and finding the other three is what this module is for.
 *
 * ## What the shipped lists already agreed about, and where they did not
 *
 * **Four of them independently priced a new car at 34 units** — every one of the eighteen fix
 * cases' new-shaft repair, `NEW_SHAFT_UNITS`, `EDITOR_PRICING.shaftUnits`, and the campaign shop's
 * first Shafts tier. That figure is not drafted here; it is moved.
 *
 * **And two of them priced a faster machine differently for the same purchase.** The fix cases
 * charge 8, 9 or 10 units for a 0.5 m/s bump; `EDITOR_PRICING` charges 6 units per half step. A
 * player buying the same metre per second paid a different price depending on which screen they
 * were standing on. That is what {@link PriceSchedule} exists to make impossible, and
 * `pricing/schedule.test.ts` is the assertion #366's second criterion asks for.
 *
 * ## The figures are drafted, and the file says so on its own face
 *
 * A price is game feel. The fix cases prove it: seventeen repairs buy **the same** door-dwell
 * settings at 1, 2 or 3 units, with no rule anywhere relating the price to how much dwell is
 * bought, how many cars are touched, or anything else measurable. Those numbers were chosen so a
 * particular case would present a particular choice, which is a designer's act and not a
 * measurement.
 *
 * So every entry's `note` says where its figure came from — *kept* where a shipped list already
 * held it, *drafted* where they disagreed and a midpoint was taken — and
 * `data/price-schedule.json`'s own `$comment` says the same thing to anyone who opens the data
 * rather than the code. The ordering of the ladder is the product owner's, and #366 says so.
 *
 * ## The ladder is data, and it is derived rather than declared
 *
 * #366's first criterion asks for *"the three-tier ordering expressed as data rather than as an
 * `if` on a tier name"*. {@link PriceTier.order} is that ordering and {@link PriceTier.typicalUnits}
 * is what makes it checkable: it is the **median of the tier's own prices**, so it cannot be
 * asserted independently of the changes it describes. `schedule.test.ts` re-derives it from the
 * changes and refuses a tier whose declared typical is not its own median, and refuses a ladder
 * whose typicals do not ascend with `order`.
 *
 * The bands **overlap deliberately** and no test forbids it: a large dispatcher change can cost
 * more than a trivial equipment one, and #366's own words are *cheap*, *dearer*, *dearest* rather
 * than a claim that every change in one tier outprices every change in the one below.
 */

/** One rung of the ladder — `docs/38` § 2.1's three tiers. */
export interface PriceTier {
  readonly id: string;
  /** 1, 2, 3 — the ladder, as data. Nothing branches on {@link id}. */
  readonly order: number;
  /** What the screen calls it. */
  readonly name: string;
  /**
   * The median of this tier's own prices, and therefore **derived rather than declared**: a tier
   * cannot claim to be dear while pricing nothing dearly. See the module docstring.
   */
  readonly typicalUnits: number;
  /** One sentence for a player, saying what kind of change this tier buys. */
  readonly note: string;
}

/**
 * The schema `CLAUDE.md` invariant 8 asks of every tunable — type, range, default.
 *
 * There is no `activeWhen` here and its absence is deliberate: a price is unconditional. Invariant
 * 8's conditional clause exists for parameters that only apply under another parameter's setting,
 * and a change's price does not become inapplicable.
 */
export interface PriceSchema {
  readonly type: 'integer';
  readonly unit: 'units';
  readonly min: number;
  readonly max: number;
  readonly default: number;
}

/** One purchasable change, at one price, in one tier. */
export interface PricedChange {
  readonly id: string;
  /** A {@link PriceTier.id}. Resolved at parse time, so nothing downstream may invent one. */
  readonly tier: string;
  readonly name: string;
  readonly priceUnits: number;
  /**
   * Nights of works the change books — #366's fourth criterion, *"with nights on top"*.
   *
   * Zero for everything a controller can be told to do between one day and the next. Career reads
   * this; Scenario ignores it, which is exactly what *"a fourth car costs the same units in
   * Scenario and in Career and a career day costs time as well"* means.
   */
  readonly nights: number;
  /** Where this figure came from — kept from a shipped list, or drafted, and which. */
  readonly note: string;
  /**
   * The config paths and shop rows this change prices.
   *
   * The tier is decided by **what is physically changed**, not by which config section the field
   * lives in — which is why `dispatcher.idle.parkingFloorIndex` is dispatcher-tier while
   * `dispatcher.dispatch.callType` is equipment: one tells a car where to wait, the other installs
   * a landing panel. #366 draws that line itself, from [§ D112](../../../../DECISIONS.md).
   */
  readonly covers: readonly string[];
  readonly schema: PriceSchema;
}

/** A standing extra: a thing that costs units and fixes nothing (§ 10.2). */
export interface PricedExtra {
  readonly id: string;
  readonly name: string;
  readonly priceUnits: number;
}

/** `data/price-schedule.json`, parsed. */
export interface PriceSchedule {
  readonly version: number;
  readonly tiers: readonly PriceTier[];
  readonly changes: readonly PricedChange[];
  readonly extras: readonly PricedExtra[];
}
