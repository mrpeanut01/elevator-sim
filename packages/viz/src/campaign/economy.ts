/**
 * **GAMEPLAY § 8's campaign economy** — `ENGINE_CONTRACT.md` § 8's formulas and § 8.2's shop, as
 * pure arithmetic over plain data.
 *
 * ## Which campaign this is, because there are two in this directory
 *
 * `campaign/judge.ts` and its neighbours are the **stage campaign**: a dispatcher judged against
 * `data/scenario-goals.json`'s published table, statistical, Engineer-facing. This module is
 * GAMEPLAY § 8's **career campaign**: twenty-day contracts, a per-building purse, a shop, a wear
 * clock and a standing number that opens slots. They share a word and nothing else — no type here
 * touches `CampaignStage`, and no formula here produces or consumes a confidence interval.
 *
 * ## Every number is the contract's, and every total is derived from it
 *
 * `ENGINE_CONTRACT.md` § 8 states each formula in one line and this module implements those lines
 * and no others. The two published totals are the check on that: a perfect standard month pays
 * **98** units ({@link perfectMonthUnits}) and the shop is worth **324** ({@link shopTotalUnits}),
 * and both are *summed from the tables below* rather than written down — `economy.test.ts` pins the
 * sums against the contract's stated figures, which is what makes a mistyped tier cost fail a test
 * instead of quietly moving a lede.
 *
 * ## Day numbering, which the two source documents disagree about
 *
 * § 8.1 works in `dayIdx = tower.day − 1` (0-based) and § 8.2's booking rules are written over the
 * same index (`s ≥ dayIdx`, `s + n ≤ 20`, live when `s + n ≤ dayIdx`). GAMEPLAY § 8.4's worked
 * example prints `works day 12–13 · live on day 14`, and ENGINE_CONTRACT § 8.2 says the row reads
 * `live on day s+n+1` — which only agree if `s` is the **0-based index** and the printed day
 * numbers are `s+1 … s+n`. That reading is taken everywhere here: `startIdx` is 0-based
 * throughout, and {@link worksDayLine} is the only place a day *number* is produced from it. The
 * alternative — `s` as a day number — makes the two documents contradict each other by one, and a
 * booking off by one day is the shape of defect that is invisible until a month ends early.
 *
 * ## What this module deliberately does not do
 *
 * It holds no state and reads no clock: every function takes the tower (or the career) and answers.
 * The record it operates on, the actions that change it and the opening career all live in
 * `campaign/career.ts`; the words the three Everyday screens draw live in
 * `everyday/campaignModel.ts`. Three layers, because the formulas are the half that must be
 * testable against a published number without a screen anywhere near them.
 */

/* -------------------------------------------------------------------------- *
 * § 8.6 — difficulty, which is the budget
 * -------------------------------------------------------------------------- */

export const DIFFICULTY_IDS = ['easy', 'standard', 'hard', 'impossible'] as const;

export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

/**
 * One tier of § 8.6's table. `rates` is the four weekly rates, stepping every five days.
 *
 * `note` is the prototype's own sentence for the picked tier (`DIFFS`, the design file's
 * `elevator-sim-casual.dc.html`), because the handoff wins every disagreement about what the
 * screen says; every number beside it is `ENGINE_CONTRACT.md` § 8.6's.
 */
export interface Difficulty {
  readonly id: DifficultyId;
  readonly name: string;
  /** § 8.1's `diff.purse` — what a fresh month starts with. */
  readonly purse: number;
  /** Units per cleared day, weeks one to four. */
  readonly rates: readonly [number, number, number, number];
  /** Missed days allowed before the contract ends. `0` on impossible. */
  readonly miss: number;
  /** § 8.6's four tests: away %, worst wait s, lobby queue cap, trip budget. */
  readonly tests: {
    readonly away: number;
    readonly worstS: number;
    readonly queue: number;
    readonly trips: number;
  };
  readonly note: string;
}

/** § 8.6's table, row for row. */
export const DIFFICULTIES: Readonly<Record<DifficultyId, Difficulty>> = Object.freeze({
  easy: Object.freeze({
    id: 'easy' as const,
    name: 'Easy',
    purse: 16,
    rates: Object.freeze([6, 7, 8, 9]) as unknown as readonly [number, number, number, number],
    miss: 6,
    tests: Object.freeze({ away: 65, worstS: 240, queue: 40, trips: 620 }),
    note: 'Room for two big purchases and a mistake most days. Good for learning what the levers do.',
  }),
  standard: Object.freeze({
    id: 'standard' as const,
    name: 'Standard',
    purse: 8,
    rates: Object.freeze([3, 4, 5, 6]) as unknown as readonly [number, number, number, number],
    miss: 3,
    tests: Object.freeze({ away: 75, worstS: 180, queue: 25, trips: 520 }),
    note: 'A perfect month buys about a third of the shop. Three missed days and the contract ends.',
  }),
  hard: Object.freeze({
    id: 'hard' as const,
    name: 'Hard',
    purse: 5,
    rates: Object.freeze([2, 3, 4, 5]) as unknown as readonly [number, number, number, number],
    miss: 1,
    tests: Object.freeze({ away: 82, worstS: 150, queue: 18, trips: 470 }),
    note: 'One missed day allowed. You will finish the month having bought three cheap things and nothing else.',
  }),
  impossible: Object.freeze({
    id: 'impossible' as const,
    name: 'Impossible',
    purse: 3,
    rates: Object.freeze([2, 2, 3, 3]) as unknown as readonly [number, number, number, number],
    miss: 0,
    tests: Object.freeze({ away: 88, worstS: 120, queue: 12, trips: 430 }),
    note: 'No missed days, and the whole month pays 53 units. It has been cleared — with staggered start times bought on day one and never a wasted trip after.',
  }),
});

/** A contract is twenty working days — § 8.7, and the bound in every booking rule. */
export const CONTRACT_DAYS = 20;

/**
 * The rate in force on a 0-based day index — § 8.1's *"rates step every five days"*.
 *
 * Clamped at the last rate rather than reading off the end: day 20 is `dayIdx` 19, which floors to
 * bucket 3, but a caller asking about a day past the contract gets week four's rate rather than
 * `undefined`, because every arithmetic below sums over a range a caller controls.
 */
export function rateOnDay(difficulty: Difficulty, dayIdx: number): number {
  const bucket = Math.min(difficulty.rates.length - 1, Math.max(0, Math.floor(dayIdx / 5)));
  return difficulty.rates[bucket] ?? 0;
}

/**
 * § 8.1's `perfectMonth = diff.purse + Σ (rate × 5)` — standard: `8 + 90 = 98`.
 *
 * Summed from {@link Difficulty.rates} rather than written down, which is the whole point: the
 * contract publishes 98 for standard and `economy.test.ts` checks this sum against it, so a
 * mistyped rate fails a test rather than moving the contract screen's lede by a unit.
 */
export function perfectMonthUnits(difficulty: Difficulty): number {
  return difficulty.purse + difficulty.rates.reduce((total, rate) => total + rate * 5, 0);
}

/* -------------------------------------------------------------------------- *
 * § 8.2 — the shop
 * -------------------------------------------------------------------------- */

export const SHOP_CATEGORY_IDS = [
  'doors',
  'control',
  'machines',
  'cars',
  'shafts',
  'tenants',
] as const;

export type ShopCategoryId = (typeof SHOP_CATEGORY_IDS)[number];

/**
 * **What one tier does to the run, as plain numbers — GitHub issue #181's first clause.**
 *
 * ## Why this is a column of § 8.2's table rather than a table beside it
 *
 * The alternative — a second map keyed by `categoryId` and `level` — is the shape that goes stale:
 * a tier added to {@link SHOP} with no row in it would be a purchase that costs units, books nights,
 * fills the month grid and changes **nothing about the day**, which is exactly the defect this field
 * exists to close. On the row, a tier without one is a compile error rather than a silence.
 *
 * ## Every field is absolute at its level, never incremental
 *
 * § 8.2's first buying rule is that a tier requires the tier below it, and {@link fittedLevel}
 * answers with the **highest** live level. So the fold that reads this
 * (`campaign/fitOut.ts#fitOutOf`) takes one delta per category and never sums two, and a level-3
 * row states the whole of what level 3 is — not what it adds to level 2.
 *
 * ## Where each number comes from, because a number nobody can cite is what this repository keeps
 * paying for
 *
 * Every figure below is either **the tier's own sentence** (`doors` L1's *a second off every stop*,
 * `doors` L3's *two seconds a stop*, `machines`' three speeds, `cars`' two person counts,
 * `tenants` L2's *by a third*) or **a value `data/` already ships** (`doors` L2's second is the step
 * between `snappy` and `normal` in `authoring/dispatcherSpec.ts#DWELL_SETTINGS`, which is itself
 * `data/elevator-specs.json`'s `doors.dwellHallCallS` typical against its min; `tenants` L1's
 * ceiling is that file's `timing.passengerTransferS.office`). Nothing here is invented, and
 * `fitOut.test.ts` asserts the shipped-data half against the file rather than against a copy of it.
 */
export interface FitOutDelta {
  /** Shafts added to **every** bank, over what the building stands as. */
  readonly extraShafts?: number;
  /** The class every car is rebuilt to. Set with {@link ratedSpeedMps} or not at all. */
  readonly machineClassId?: string;
  /** Rated top speed, m/s. Must sit inside {@link machineClassId}'s declared band. */
  readonly ratedSpeedMps?: number;
  /**
   * Persons at rated load. Converted to `ratedLoadLb` through `data/elevator-specs.json`'s own
   * `conventions.personsPerRatedLoadUS` divisor, never a literal 150 written here — the divisor is
   * data and `core` parses it.
   */
  readonly carPersons?: number;
  /** Seconds off each stop's door cycle (`doorOpenS` + `doorCloseS`). */
  readonly doorSecondsSaved?: number;
  /** Seconds off the hall-call dwell, which is how long the doors stand open at a landing. */
  readonly hallDwellSecondsSaved?: number;
  /** A ceiling on seconds per passenger per direction through the doorway. */
  readonly transferCeilingS?: number;
  /** Multiplier on the crowd's arrival rate. */
  readonly arrivalRateFactor?: number;
  /** The heaviest tenant floor's population moved down to the lowest floors above the entrance. */
  readonly movesHeaviestTenantDown?: boolean;
  /**
   * The bank is worked as zones.
   *
   * Expressed as the group lever `express` rather than as a pair of dispatch fields, because
   * `authoring/dispatcherSpec.ts#profileFromSpec` already owns what *give each car a slice* means
   * (`assignmentMode: split-demand`, `parkingStrategy: zone-center`) and a second expression of it
   * here would be the second answer that drifts.
   */
  readonly zonesTheTower?: boolean;
  /** The landing call carries a destination — `DispatcherProfile.dispatch.callType`. */
  readonly callType?: string;
  /** The landing panel names the car — `DispatcherProfile.dispatch.passengerAssignment`. */
  readonly passengerAssignment?: string;
  /**
   * The least the driving profile may weight `rideTime` once a destination is disclosed.
   *
   * **A floor rather than an assignment, and it is here because a panel without it is a dead seam
   * that has already shipped once.** [§ D112](../../../../DECISIONS.md): `destination-eta` authored
   * `weights.rideTime: 0`, so the destination reached `estimateCost` and *changed no decision* —
   * bit-identical to `eta` at 8 of 8 matrix cells. A `control` tier that only set `callType` is that
   * defect bought with units: measured on the legs at `garden-apartments`/3 600 s under
   * `collective`, which weights `waitTime` alone, disclosure alone moves nothing at all.
   *
   * So the tier discloses the destination **and** makes the controller price it, which is what
   * *so cars can be grouped* claims. The two values are the shipped ones — `destination-eta`'s 0.5
   * and `destination-panel`'s 1.0 — and a floor, so a dispatcher already pricing ride time higher
   * keeps its own vector and the § 8.5 standing order still chooses who drives.
   */
  readonly rideTimeWeightFloor?: number;
}

export interface ShopTier {
  /** 1-based. A tier requires the tier below it — § 8.2's first buying rule. */
  readonly level: number;
  readonly name: string;
  readonly units: number;
  /** Nights of works. `0` is fitted immediately and works tomorrow. */
  readonly nights: number;
  readonly effect: string;
  /**
   * What this tier does to the day once it is live — {@link FitOutDelta}, absolute at this level.
   *
   * Required rather than optional, and `economy.test.ts` asserts every tier carries one that is not
   * empty: a shop row with nothing behind it is GitHub issue #181's whole subject, and an optional
   * field is how the next tier copied out of the design handoff would arrive without one.
   */
  readonly fits: FitOutDelta;
}

export interface ShopCategory {
  readonly id: ShopCategoryId;
  readonly name: string;
  readonly sub: string;
  readonly tiers: readonly ShopTier[];
}

/**
 * § 8.2's table, with the prototype's own category sublines and tier effects.
 *
 * The costs and nights are `ENGINE_CONTRACT.md` § 8.2's; the prose is the design file's `TREE`.
 * Two categories have two tiers rather than three, which is the contract's own `—` in those cells
 * and is why {@link ShopTier.level} is a number rather than a `1 | 2 | 3`.
 */
export const SHOP: readonly ShopCategory[] = Object.freeze([
  Object.freeze({
    id: 'doors' as const,
    name: 'Doors',
    sub: 'the cheapest time in the building',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: 'Faster doors',
        units: 4,
        nights: 0,
        effect: 'A second off every stop, all day, forever.',
        fits: Object.freeze({ doorSecondsSaved: 1 }),
      }),
      Object.freeze({
        level: 2,
        name: 'Better sensors',
        units: 9,
        nights: 1,
        effect: 'Doors stop re-opening for people who were not coming.',
        /*
         * The second comes off the **hall-call** dwell and nothing else, because that is the figure
         * this sentence is about: `data/elevator-specs.json` gives the hall dwell a longer typical
         * than the car dwell precisely because passengers are still walking to the car, and a sensor
         * that stops holding for people who were not coming is a shorter hold at a landing rather
         * than a faster door. The second itself is the shipped step from `normal` to `snappy`
         * (`DWELL_SETTINGS`, 5 s → 4 s), which is that file's typical against its declared minimum.
         */
        fits: Object.freeze({ doorSecondsSaved: 1, hallDwellSecondsSaved: 1 }),
      }),
      Object.freeze({
        level: 3,
        name: 'Advance opening',
        units: 16,
        nights: 2,
        effect: 'Doors start opening as the car lands. Two seconds a stop.',
        fits: Object.freeze({ doorSecondsSaved: 3, hallDwellSecondsSaved: 1 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'control' as const,
    name: 'Control',
    sub: 'how calls are gathered',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: 'Zone the tower',
        units: 6,
        nights: 1,
        effect: 'Low and high groups. Shorter trips, thinner cover when quiet.',
        fits: Object.freeze({ zonesTheTower: true }),
      }),
      Object.freeze({
        level: 2,
        name: 'Destination panels',
        units: 13,
        nights: 2,
        effect: 'People say their floor in the lobby, so cars can be grouped.',
        /*
         * `docs/09` § 1.1's **Level 0** — disclosure. The call carries a destination and
         * `estimateCost` may price it; any car that opens still takes whoever fits, which is what
         * *so cars can be grouped* claims and is the whole of what a landing panel without an
         * assignment does. `mobile-credential` is the shipped call type that carries the
         * destination as far as `estimateCost` — `data/dispatcher-profiles.json`'s
         * `destination-eta` is that configuration, and this writes the same field.
         */
        fits: Object.freeze({ callType: 'mobile-credential', rideTimeWeightFloor: 0.5 }),
      }),
      Object.freeze({
        level: 3,
        name: 'Full destination dispatch',
        units: 24,
        nights: 3,
        effect: 'Every call knows both ends. The largest gain short of building.',
        /* Level 1: the panel names a car per passenger and boarding honours it — `destination-panel`. */
        fits: Object.freeze({
          callType: 'mobile-credential',
          passengerAssignment: 'panel',
          rideTimeWeightFloor: 1,
        }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'machines' as const,
    name: 'Machines',
    sub: 'speed and acceleration',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: '4.0 m/s',
        units: 14,
        nights: 2,
        effect: 'Modest on fourteen floors; real above ten.',
        /*
         * The class is named as well as the speed, because a speed alone is not a legal building:
         * `core` raises `speed-outside-class-range` for a car asked to run faster than its class's
         * declared band, and no shipped class below `gearless-traction` reaches 4 m/s. The three
         * classes here are the three `data/elevator-specs.json` rows whose bands contain the three
         * speeds this category's own names publish.
         */
        fits: Object.freeze({ machineClassId: 'gearless-traction', ratedSpeedMps: 4 }),
      }),
      Object.freeze({
        level: 2,
        name: '5.0 m/s, softer ride',
        units: 25,
        nights: 3,
        effect: 'Faster and smoother, so people load without hesitating.',
        fits: Object.freeze({ machineClassId: 'gearless-traction', ratedSpeedMps: 5 }),
      }),
      Object.freeze({
        level: 3,
        name: 'Gearless, 8.0 m/s',
        units: 40,
        nights: 5,
        effect: 'More than this tower can use. Bought for the renewal, not for now.',
        fits: Object.freeze({ machineClassId: 'high-speed-gearless', ratedSpeedMps: 8 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'cars' as const,
    name: 'Car size',
    sub: 'people per trip',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: '16-person cars',
        units: 18,
        nights: 3,
        effect: 'Three more per trip. The morning shortens by a fifth.',
        fits: Object.freeze({ carPersons: 16 }),
      }),
      Object.freeze({
        level: 2,
        name: '21-person cars',
        units: 32,
        nights: 4,
        effect: 'Needs new shells and ropes. Slower doors, far fewer trips.',
        /*
         * **Both halves of that trade are the model's, and neither is a second number written here.**
         * *Far fewer trips* is the capacity. *Slower doors* is not given a figure because it does
         * not need one and inventing one would be this repository's stale-mechanism defect written
         * forwards: a stop's length is `passengerTransferS` **per passenger per direction**, so a
         * car that takes five more people at a landing already stands there longer, and the effect
         * is produced by the same field the tier is bought for rather than by a penalty beside it.
         * What is *not* modelled is a wider leaf on the same operator — `data/elevator-specs.json`
         * prices door time by `doorType`, not by capacity, and there is no shipped figure for it.
         */
        fits: Object.freeze({ carPersons: 21 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'shafts' as const,
    name: 'Shafts',
    sub: 'the real fix, and the real cost',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: 'A fourth car',
        units: 34,
        nights: 8,
        /*
         * **This read *"… Eight nights with two cars out."* until GitHub issue #272, and the second
         * sentence is withdrawn rather than reworded.**
         *
         * No campaign day takes a car out of passenger service:
         * `RecordRunOptions.outOfServiceCarIds` has no writer under `campaign/`, none in any
         * `everyday/campaign*` module, and none in `everyday/host.ts#runCampaignDay`, which writes
         * a tower's `buildingId` and `dispatcherId`, presses run, and reads no booking. It is the
         * same claim `everyday/campaignModel.ts`'s calendar tip made and issue #264 withdrew, one
         * directory over — the *assertion* half of § D227's class, which is the worse one: a player
         * who reasons correctly from it blames a missing car for a day their dispatcher lost.
         *
         * *A car may be out* would be the same claim with more words. What is left is the part that
         * is not about the works at all, and the nights are published where they are mechanical
         * rather than prose: {@link ShopTier.nights} reaches the shop row as `34u · 8n`
         * (`everyday/campaignModel.ts#shopTierRow`), gates {@link fittedLevel} through
         * {@link bookingIsLive}, and is what `daysOfBenefit` refuses a late purchase on.
         *
         * `economy.test.ts` sweeps every tier's prose for the claim, so the next tier copied out of
         * the design handoff by hand lands there rather than in a register. The handoff's own line
         * (`docs/design/elevator-sim-casual.dc.html`) still carries it, which is correct: the
         * handoff wins every disagreement about what the screen looks like, and the simulator wins
         * every disagreement about what a number means.
         */
        effect: 'The tower stops being one car short.',
        /*
         * One shaft in **every** bank, not a fourth car in a tower that has three. The tier's name
         * is the design file's own building; the shipped set runs from two cars to eight, and a
         * rule that read the name as a target would take Garden Apartments from two to four and
         * Vertical City from eight to four. `commissioning/building.ts#commissionedBuilding` does
         * the growing, so a new shaft gets its id in the bank's own scheme and the first cars keep
         * theirs.
         */
        fits: Object.freeze({ extraShafts: 1 }),
      }),
      Object.freeze({
        level: 2,
        name: 'A fifth car',
        units: 54,
        nights: 10,
        effect: 'Comfortable at any occupancy this building will ever see.',
        fits: Object.freeze({ extraShafts: 2 }),
      }),
    ]),
  }),
  Object.freeze({
    id: 'tenants' as const,
    name: 'The tenants',
    sub: 'changing the demand itself',
    tiers: Object.freeze([
      Object.freeze({
        level: 1,
        name: 'Queue marshalling',
        units: 5,
        nights: 0,
        effect: 'Someone in the lobby directing people. Cheap, and it works.',
        /*
         * A marshal changes how long each person takes to get through the doorway, which is exactly
         * `passengerTransferS`, and the figure is a **ceiling from the shipped table** rather than a
         * discount: `data/elevator-specs.json`'s `timing.passengerTransferS` prices office 1.2,
         * hotel 1.5, residential 1.75 and hospital 2.5, and a marshalled lobby is the fastest of
         * those conditions rather than a faster one nobody has measured.
         *
         * **The consequence, said rather than discovered:** on a building already at or below 1.2 s
         * this tier moves no leg. `midtown-office` is that building. That is a property of the
         * ceiling and `fitOut.test.ts` asserts it in both directions, so a cell where the tier is
         * inert is a measured cell rather than a surprise.
         */
        fits: Object.freeze({ transferCeilingS: 1.2 }),
      }),
      Object.freeze({
        level: 2,
        name: 'Staggered start times',
        units: 10,
        nights: 0,
        effect: 'Negotiated with four tenants. Flattens the 08:40 peak by a third.',
        /*
         * *By a third* is the tier's own figure, applied to the rate the day would otherwise have
         * run at — the pattern's if one was chosen, and the building's own traffic profile at its
         * typical level if not (`dev/state.ts#baseOf`). It is applied **before** the day's event
         * multiplier rather than after, so a fire drill is five times a staggered morning rather
         * than a staggered five-times morning: the negotiation is with the tenants, and a drill is
         * not one of them.
         */
        fits: Object.freeze({ arrivalRateFactor: 2 / 3 }),
      }),
      Object.freeze({
        level: 3,
        name: 'Move a tenant floor',
        units: 20,
        nights: 4,
        effect: 'The heaviest tenant comes down to floors 3–4. Fixes the cause.',
        /*
         * A real edit to the building's floor populations, on `shift/growth.ts`'s stated ground:
         * a population that only reached a caption would be a dead seam, and a *lying* one. The
         * total is preserved, so `resolveBuilding`'s `population-mismatch` warning cannot be raised
         * by this and the crowd is the same size in a different place — which is what *fixes the
         * cause* means and what makes it different from `tenants` L2 one row up.
         */
        fits: Object.freeze({ movesHeaviestTenantDown: true }),
      }),
    ]),
  }),
]);

/**
 * § 8.1's `shopTotal` — **324**, summed from {@link SHOP} rather than stated.
 *
 * The contract publishes the figure and this function derives it; `economy.test.ts` compares the
 * two. That is the difference between a lede that quotes a number and a lede that quotes the shop.
 */
export function shopTotalUnits(): number {
  return SHOP.reduce(
    (total, category) => total + category.tiers.reduce((sum, tier) => sum + tier.units, 0),
    0,
  );
}

/** The category for an id, or `undefined`. */
export function shopCategoryById(id: string): ShopCategory | undefined {
  return SHOP.find((category) => category.id === id);
}

/** The tier at a level within a category, or `undefined` for a level it does not have. */
export function shopTierAt(categoryId: string, level: number): ShopTier | undefined {
  return shopCategoryById(categoryId)?.tiers.find((tier) => tier.level === level);
}

/* -------------------------------------------------------------------------- *
 * The tower, as the economy needs it
 * -------------------------------------------------------------------------- */

/**
 * One booked or fitted purchase. `startIdx` is **0-based** — see the module docstring's note on the
 * two documents' day numbering, which is the one place this file could have been off by one.
 */
export interface WorksBooking {
  readonly categoryId: ShopCategoryId;
  readonly level: number;
  /** 0-based index of the first night. A zero-night tier books at the day it was bought. */
  readonly startIdx: number;
  readonly nights: number;
  readonly units: number;
}

/**
 * What the economy needs to know about one building. `career.ts` holds the whole record; this is
 * the subset every formula below reads, named separately so a formula cannot reach for a field it
 * has no business in.
 */
export interface TowerEconomy {
  /** 1-based, 1…{@link CONTRACT_DAYS}. */
  readonly day: number;
  readonly missed: number;
  /** Whole months held. Feeds § 8.1's `carriedIn` when no explicit carry is set. */
  readonly months: number;
  /** An explicit purse carried in from an earlier month, or `undefined` for § 8.1's fallback. */
  readonly carry: number | undefined;
  readonly difficultyId: DifficultyId;
  /**
   * Kit from **earlier** months, by category — § 8.3's *"kit belongs to the building"*.
   *
   * Separate from {@link bookings} because the two answer different questions: this is what the
   * building already has and costs nothing again, while a booking is money that has left *this*
   * month's purse. Folding them into one map would make a renewed tower's purse pay twice for the
   * doors it already owns.
   */
  readonly fitted: Readonly<Partial<Record<ShopCategoryId, number>>>;
  /** Every tier bought this month, live or still under works. */
  readonly bookings: readonly WorksBooking[];
  /** Loaded car departures since the last service window. */
  readonly trips: number;
  /** Trips at which a service window falls due — § 8.3's `serviceAt`, ≈ 45 000. */
  readonly serviceAt: number;
  /** Fraction of refit life used, 0–1+. Feeds § 8.3's second odds term. */
  readonly refit: number;
  /** Units a day this contract pays. § 8.5 prices the renewal from it. */
  readonly rate: number;
}

/** § 8.1's `dayIdx` — 0-based. */
export function dayIndexOf(tower: TowerEconomy): number {
  return tower.day - 1;
}

/**
 * § 8.1's `cleared = max(0, tower.day − 1 − tower.missed)`, and § 16 rule 5's worked example.
 *
 * Derived here and nowhere else. Every screen that prints a cleared count calls this, so `4/1`
 * — a record with more cleared days than days — is not expressible.
 */
export function clearedDays(tower: TowerEconomy): number {
  return Math.max(0, tower.day - 1 - tower.missed);
}

/**
 * § 8.1's `earnedSoFar` — the sum over past, non-missed days of that day's rate.
 *
 * *"`missedDays` = the last `missed` days before today"*, so the missed days are the tail of the
 * past and the earned ones are the head. Written as a filter over the past rather than a
 * multiplication, because the rate steps every five days and a mean rate would be wrong in exactly
 * the months a player cares about.
 */
export function earnedSoFar(tower: TowerEconomy): number {
  const difficulty = DIFFICULTIES[tower.difficultyId];
  const past = dayIndexOf(tower);
  const firstMissed = past - tower.missed;
  let earned = 0;
  for (let index = 0; index < past; index += 1) {
    if (index >= firstMissed) continue;
    earned += rateOnDay(difficulty, index);
  }
  return earned;
}

/** § 8.1's `carriedIn = carry[tower] ?? diff.purse + round(tower.months × 3.5)`. */
export function carriedIn(tower: TowerEconomy): number {
  if (tower.carry !== undefined) return tower.carry;
  return DIFFICULTIES[tower.difficultyId].purse + Math.round(tower.months * 3.5);
}

/**
 * § 8.1's `committed` — the cost of every tier owned or booked.
 *
 * The money left when the works were **booked**, not when they go live (§ 8.2's third rule), which
 * is why this sums the bookings rather than the tiers that have gone live.
 */
export function committedUnits(tower: TowerEconomy): number {
  return tower.bookings.reduce((total, booking) => total + booking.units, 0);
}

/** § 8.1's `purse = max(0, carriedIn + earnedSoFar − committed)`. */
export function purseOf(tower: TowerEconomy): number {
  return Math.max(0, carriedIn(tower) + earnedSoFar(tower) - committedUnits(tower));
}

/* -------------------------------------------------------------------------- *
 * § 8.2 — booking rules and per-tier state
 * -------------------------------------------------------------------------- */

/**
 * What one shop tier is, for this tower, right now — § 8.2's *"every tier shows its own derived
 * state"*.
 *
 * Seven values, in the order the contract evaluates them: a tier already in the building, one whose
 * nights are booked, one the tier below blocks, one the purse blocks, one whose works would run
 * past the contract, and one that is simply buyable.
 */
export type ShopTierStateId =
  | 'fitted'
  | 'under-works'
  | 'booked'
  | 'needs-below'
  | 'short'
  | 'past-contract'
  | 'buyable';

export interface ShopTierState {
  readonly id: ShopTierStateId;
  /** Units still needed, on `short` only. */
  readonly shortBy?: number | undefined;
  /** The level that must come first, on `needs-below` only. */
  readonly needsLevel?: number | undefined;
  /** The booking behind `under-works` and `booked`. */
  readonly booking?: WorksBooking | undefined;
  /** Whether pressing this tier may act at all — § 16 rule 6's *dimmed and inert*. */
  readonly pressable: boolean;
}

/** Whether a booking's nights are all behind today — § 8.2's `s + n ≤ dayIdx`. */
export function bookingIsLive(booking: WorksBooking, dayIdx: number): boolean {
  return booking.startIdx + booking.nights <= dayIdx;
}

/** The booking for a tier, or `undefined`. */
export function bookingFor(
  tower: TowerEconomy,
  categoryId: string,
  level: number,
): WorksBooking | undefined {
  return tower.bookings.find(
    (booking) => booking.categoryId === categoryId && booking.level === level,
  );
}

/**
 * The highest level of a category the building actually has — kit carried in from earlier months,
 * and this month's bookings whose nights are behind today. `0` is § 8.2's *as built*.
 */
export function fittedLevel(tower: TowerEconomy, categoryId: string): number {
  const dayIdx = dayIndexOf(tower);
  const carried = tower.fitted[categoryId as ShopCategoryId] ?? 0;
  return tower.bookings
    .filter((booking) => booking.categoryId === categoryId && bookingIsLive(booking, dayIdx))
    .reduce((highest, booking) => Math.max(highest, booking.level), carried);
}

/** The highest level of a category bought but not yet live, or `0`. */
export function bookedLevel(tower: TowerEconomy, categoryId: string): number {
  const dayIdx = dayIndexOf(tower);
  return tower.bookings
    .filter((booking) => booking.categoryId === categoryId && !bookingIsLive(booking, dayIdx))
    .reduce((highest, booking) => Math.max(highest, booking.level), 0);
}

/** Every 0-based day index a booking occupies. */
export function occupiedDayIndices(tower: TowerEconomy): ReadonlySet<number> {
  const days = new Set<number>();
  for (const booking of tower.bookings) {
    for (let offset = 0; offset < booking.nights; offset += 1) {
      days.add(booking.startIdx + offset);
    }
  }
  return days;
}

/**
 * § 8.2's legality test for a booking of `nights` starting at 0-based `startIdx`:
 * `s ≥ dayIdx`, `s + n ≤ 20`, and no other works occupy those days.
 */
export function startIsLegal(tower: TowerEconomy, startIdx: number, nights: number): boolean {
  if (startIdx < dayIndexOf(tower)) return false;
  if (startIdx + nights > CONTRACT_DAYS) return false;
  const occupied = occupiedDayIndices(tower);
  for (let offset = 0; offset < nights; offset += 1) {
    if (occupied.has(startIdx + offset)) return false;
  }
  return true;
}

/** Every legal start for a booking of `nights` — the days the month grid lights with `+`. */
export function legalStarts(tower: TowerEconomy, nights: number): readonly number[] {
  const starts: number[] = [];
  for (let index = 0; index < CONTRACT_DAYS; index += 1) {
    if (startIsLegal(tower, index, nights)) starts.push(index);
  }
  return starts;
}

/**
 * § 8.2's `M = 20 − (dayIdx + nights)` — days of benefit for a booking that starts today. `≤ 0` is
 * the refusal, *works run past the contract*.
 */
export function daysOfBenefit(tower: TowerEconomy, nights: number): number {
  return CONTRACT_DAYS - (dayIndexOf(tower) + nights);
}

/**
 * The tier's derived state, in § 8.2's own order of evaluation.
 *
 * The order is load-bearing. *Fitted* wins over everything; a booking wins over affordability
 * (money already left the purse); the tier below wins over the purse, because a player who cannot
 * yet buy level 3 should be told what to buy first rather than how much they are short by for a
 * thing they could not buy at any price.
 */
export function shopTierState(
  tower: TowerEconomy,
  categoryId: ShopCategoryId,
  tier: ShopTier,
): ShopTierState {
  const dayIdx = dayIndexOf(tower);
  const booking = bookingFor(tower, categoryId, tier.level);
  if (booking !== undefined) {
    if (bookingIsLive(booking, dayIdx)) return { id: 'fitted', booking, pressable: false };
    return {
      id: booking.nights > 0 ? 'under-works' : 'booked',
      booking,
      pressable: false,
    };
  }
  /* Carried in from an earlier month: owned, with no booking against this month's purse. */
  if ((tower.fitted[categoryId] ?? 0) >= tier.level) return { id: 'fitted', pressable: false };
  if (tier.level > 1) {
    const below = tier.level - 1;
    const owned = Math.max(fittedLevel(tower, categoryId), bookedLevel(tower, categoryId));
    if (owned < below) return { id: 'needs-below', needsLevel: below, pressable: false };
  }
  const purse = purseOf(tower);
  if (purse < tier.units) {
    return { id: 'short', shortBy: tier.units - purse, pressable: false };
  }
  if (tier.nights > 0 && daysOfBenefit(tower, tier.nights) <= 0) {
    return { id: 'past-contract', pressable: false };
  }
  if (tier.nights > 0 && legalStarts(tower, tier.nights).length === 0) {
    return { id: 'past-contract', pressable: false };
  }
  return { id: 'buyable', pressable: true };
}

/**
 * § 8.2's works line — `works day 12–13 · live on day 14`.
 *
 * The one place a 0-based `startIdx` becomes a day number, and the reconciliation of the two source
 * documents the module docstring sets out: the days printed are `startIdx + 1 … startIdx + nights`
 * and the live day is `startIdx + nights + 1`.
 */
export function worksDayLine(booking: WorksBooking): string {
  const first = booking.startIdx + 1;
  const last = booking.startIdx + booking.nights;
  const span = booking.nights > 1 ? `${String(first)}–${String(last)}` : String(first);
  return `works day ${span} · live on day ${String(last + 1)}`;
}

/* -------------------------------------------------------------------------- *
 * § 8.3 — wear, service and failure odds
 * -------------------------------------------------------------------------- */

/** § 8.3's `freshOdds` — a serviced building's daily chance of a failure, in per cent. */
export const FRESH_ODDS_PCT = 0.4;

/** § 8.7's refurbishment: 46 units, ten nights, and it resets the wear clock. */
export const REFURBISHMENT = Object.freeze({ units: 46, nights: 10 });

/** Trips a working day, for § 8.3's `daysLeft`. */
const TRIPS_A_DAY = 1400;

/** § 8.3's `wear = min(1.3, trips / serviceAt)`. */
export function wearOf(tower: TowerEconomy): number {
  if (tower.serviceAt <= 0) return 0;
  return Math.min(1.3, tower.trips / tower.serviceAt);
}

/** § 8.3's `odds = 0.4 + 7.5 · wear^2.4 + 3 · max(0, refit − 0.6)`, in per cent a day. */
export function failureOddsPct(tower: TowerEconomy): number {
  return FRESH_ODDS_PCT + 7.5 * wearOf(tower) ** 2.4 + 3 * Math.max(0, tower.refit - 0.6);
}

/** § 8.3's `daysLeft = round((serviceAt − trips) / 1400)`. Never below zero. */
export function serviceDaysLeft(tower: TowerEconomy): number {
  return Math.max(0, Math.round((tower.serviceAt - tower.trips) / TRIPS_A_DAY));
}

/** § 8.3's three head thresholds, as an id the screen colours from. */
export type WearHeadId = 'due' | 'wearing' | 'fresh';

/** `> 0.85` due · `> 0.6` wearing in · else recently serviced. */
export function wearHeadOf(tower: TowerEconomy): WearHeadId {
  const wear = wearOf(tower);
  if (wear > 0.85) return 'due';
  if (wear > 0.6) return 'wearing';
  return 'fresh';
}

/**
 * § 8.3's relief and the odds after the booked works:
 * `relief = Σ (machines 0.55 · doors 0.2 · else 0.08) × level`, then
 * `after = max(0.4, odds × max(0.25, 1 − relief))`.
 *
 * Every booking counts, live or not: the contract's own wording is *"booked works reduce the
 * odds"*, and a tier already fitted has already moved the trips this clock counts.
 */
export function oddsAfterWorksPct(tower: TowerEconomy): number {
  const relief = tower.bookings.reduce((total, booking) => {
    const perLevel =
      booking.categoryId === 'machines' ? 0.55 : booking.categoryId === 'doors' ? 0.2 : 0.08;
    return total + perLevel * booking.level;
  }, 0);
  const base = failureOddsPct(tower);
  return Math.max(FRESH_ODDS_PCT, base * Math.max(0.25, 1 - relief));
}

/* -------------------------------------------------------------------------- *
 * § 8.4 — standing, slots and risk
 * -------------------------------------------------------------------------- */

/**
 * § 8.4's `SLOTS = 0 / 14 / 30 / 60 / 110 / 180`, with the design file's own note per slot.
 *
 * Six, which is `ENGINE_CONTRACT.md` § 8.4's list. The prototype's `SLOTS` array carries eight; the
 * contract is the engine's authority and the two extra thresholds appear in no formula, so this
 * follows the contract and keeps the notes for the six it names.
 */
export const SLOTS: readonly { readonly standing: number; readonly note: string }[] = Object.freeze([
  Object.freeze({ standing: 0, note: 'where everybody starts' }),
  Object.freeze({ standing: 14, note: 'a second building, once the first is steady' }),
  Object.freeze({ standing: 30, note: 'a third — this is where most people overreach' }),
  Object.freeze({ standing: 60, note: 'a fourth, and the month stops fitting in an evening' }),
  Object.freeze({ standing: 110, note: 'a fifth, which means letting maintenance decide more' }),
  Object.freeze({ standing: 180, note: 'a sixth — nobody supervises six towers by watching them' }),
]);

/** § 8.4's `standing = stage.carry + Σ over towers (cleared × 2 − missed × 3)`. */
export function standingOf(carry: number, towers: readonly TowerEconomy[]): number {
  return towers.reduce(
    (total, tower) => total + clearedDays(tower) * 2 - tower.missed * 3,
    carry,
  );
}

/** § 8.4's `slotsOpen = count of SLOTS whose threshold ≤ standing`. */
export function slotsOpen(standing: number): number {
  return SLOTS.filter((slot) => slot.standing <= standing).length;
}

/** The next slot still shut, or `undefined` when every one is open. */
export function nextSlot(standing: number): { readonly standing: number; readonly note: string } | undefined {
  return SLOTS.find((slot) => slot.standing > standing);
}

/** § 8.4's `atRisk` — towers with `day < 19` and `missed ≥ diff.miss`. */
export function atRiskTowers<T extends TowerEconomy>(towers: readonly T[]): readonly T[] {
  return towers.filter(
    (tower) => tower.day < 19 && tower.missed >= DIFFICULTIES[tower.difficultyId].miss,
  );
}

/**
 * Whether a contract is over — § 8.10, *"lost by exceeding the difficulty's missed-day
 * allowance"*.
 *
 * Strictly greater, matching the prototype's own `bTower.missed > diff.miss`: an impossible month
 * allows none, so the first miss ends it, and a standard month survives its third.
 */
export function contractIsLost(tower: TowerEconomy): boolean {
  return tower.missed > DIFFICULTIES[tower.difficultyId].miss;
}

/* -------------------------------------------------------------------------- *
 * § 8.5 — renewal pricing
 * -------------------------------------------------------------------------- */

/**
 * § 8.5's complexity, 1–5, keyed by **shipped building id**.
 *
 * The contract names seven buildings by short name (`garden`, `ashgate`, `chancery`, `crown`,
 * `midtown`, `stjude`, `vertical`); six of them are buildings this repository ships and are keyed
 * here by their file's id. **`ashgate` is not one of ours and is not invented into one** — no
 * shipped building answers to it, and mapping it onto `mixed-use-high-rise` would be a complexity
 * authored by this file rather than by the contract.
 *
 * `secure-tower` and `mixed-use-high-rise` are therefore absent, and {@link complexityOf} answers
 * `undefined` for them: the campaign does not offer a building whose complexity nothing published.
 * That is a stated gap rather than a silent default, because a defaulted 3 would price a renewal
 * from a number nobody measured.
 */
export const COMPLEXITY: Readonly<Record<string, number>> = Object.freeze({
  'garden-apartments': 1,
  'chancery-house': 2,
  'crown-hotel': 3,
  'midtown-office': 3,
  'st-jude-hospital': 4,
  'vertical-city': 5,
});

/** The complexity of a shipped building, or `undefined` — see {@link COMPLEXITY}. */
export function complexityOf(buildingId: string): number | undefined {
  return COMPLEXITY[buildingId];
}

/** The highest complexity the table publishes — the denominator in `complexity 3 of 5`. */
export const COMPLEXITY_MAX = 5;

export interface RenewalOffer {
  /** § 8.5's `clearRate = cleared / (day − 1)`, or `0` on a contract's first day. */
  readonly clearRate: number;
  /** `+2 / +1 / 0 / −1`. */
  readonly bonus: number;
  /** § 8.5's `offered = max(2, tower.rate + bonus)`. */
  readonly offered: number;
  readonly wasRate: number;
}

/** § 8.5's pricing, whole. */
export function renewalOffer(tower: TowerEconomy): RenewalOffer {
  const past = tower.day - 1;
  const clearRate = past <= 0 ? 0 : clearedDays(tower) / past;
  const bonus = clearRate >= 1 ? 2 : clearRate >= 0.9 ? 1 : clearRate >= 0.75 ? 0 : -1;
  return { clearRate, bonus, offered: Math.max(2, tower.rate + bonus), wasRate: tower.rate };
}

/* -------------------------------------------------------------------------- *
 * § 8.6 — the rolling calendar
 * -------------------------------------------------------------------------- */

/** § 8.6's `SPAN` — thirty columns, and the window slides rather than widening. */
export const CALENDAR_SPAN = 30;

/** § 8.6's `CAL_FROM = max(1, careerToday − 23)`. */
export function calendarFrom(careerToday: number): number {
  return Math.max(1, careerToday - 23);
}

/**
 * The career days the calendar shows, left to right.
 *
 * **The columns and the cells are emitted from this one array**, which is § 8.7's instruction
 * verbatim (*"Emit the column count from the same value as the cells or they drift; this cost a
 * full defect cycle"*). Nothing downstream may write `30`; it reads `.length`.
 */
export function calendarColumns(careerToday: number): readonly number[] {
  const from = calendarFrom(careerToday);
  return Array.from({ length: CALENDAR_SPAN }, (_unused, index) => from + index);
}

/** § 8.6's `start(t) = careerToday − (t.day − 1)` — this contract's own day one, in career days. */
export function contractStartDay(careerToday: number, tower: TowerEconomy): number {
  return careerToday - dayIndexOf(tower);
}

/** § 8.6's `end(t) = start(t) + 19`. */
export function contractEndDay(careerToday: number, tower: TowerEconomy): number {
  return contractStartDay(careerToday, tower) + CONTRACT_DAYS - 1;
}

/** § 8.6's marks, as ids. `blank` is a day the building was not yours. */
export type CalendarMarkId =
  | 'blank'
  | 'today'
  | 'due'
  | 'works'
  | 'flagged'
  | 'cleared'
  | 'missed'
  | 'ahead';

/** One cell: which career day, this tower's own day, and the mark. */
export interface CalendarCell {
  readonly careerDay: number;
  /** This building's contract day, 1-based — or `undefined` outside its contract. */
  readonly towerDay: number | undefined;
  readonly mark: CalendarMarkId;
}

/** What a tower contributes beyond the economy — days the career marked specially. */
export interface CalendarMarks {
  /** 1-based contract days on which a decision falls due. */
  readonly dueDays: readonly number[];
  /** 1-based contract days carrying a flagged bad event. */
  readonly flaggedDays: readonly number[];
}

/**
 * One row of § 8.6's grid.
 *
 * `missedHere` is the contract's own rule — *"`d > t.day − 1 − t.missed` among past days"* — which
 * places the missed days at the tail of the past, exactly as {@link earnedSoFar} does. The two
 * derivations agree because they are the same sentence read twice, and `economy.test.ts` holds
 * them to each other.
 */
export function calendarRow(
  careerToday: number,
  tower: TowerEconomy,
  marks: CalendarMarks = { dueDays: [], flaggedDays: [] },
): readonly CalendarCell[] {
  const start = contractStartDay(careerToday, tower);
  const end = contractEndDay(careerToday, tower);
  const occupied = occupiedDayIndices(tower);
  const lastCleared = tower.day - 1 - tower.missed;
  return calendarColumns(careerToday).map((careerDay): CalendarCell => {
    if (careerDay < start || careerDay > end) {
      return { careerDay, towerDay: undefined, mark: 'blank' };
    }
    const towerDay = careerDay - start + 1;
    const past = towerDay < tower.day;
    const mark: CalendarMarkId =
      careerDay === careerToday
        ? 'today'
        : marks.dueDays.includes(towerDay)
          ? 'due'
          : occupied.has(towerDay - 1)
            ? 'works'
            : marks.flaggedDays.includes(towerDay)
              ? 'flagged'
              : past
                ? towerDay > lastCleared
                  ? 'missed'
                  : 'cleared'
                : 'ahead';
    return { careerDay, towerDay, mark };
  });
}
