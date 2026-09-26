/**
 * The Fix-a-building engine — budget arithmetic, affordability, and the four outcomes.
 *
 * Everything here is pure. The panel renders what these functions return and performs nothing of
 * its own, for `menu/screens.ts`'s founding reason: a decision made inside a click handler needs a
 * document and a click to reach, and it drifts.
 *
 * ## The contract's numbers, in one place
 *
 * `ENGINE_CONTRACT.md` § 9's editor pricing — a shaft 34 u, speed 6 u per 0.5 m/s, capacity 8 u
 * per 2 places, dwell free — and § 10.4's three pass rows. The
 * closed-form inputs are replaced by two real single runs sharing the traffic seed; the
 * **thresholds do not change** (§ 9's own preface): the complaint must be ≥ 80 % gone, the rest of
 * the building's away-inside-a-minute share must not fall by more than 2 points, and the spend
 * must be within budget.
 *
 * ## Over budget cannot be *selected* — and is still an outcome
 *
 * § 10.2: anything that would take the total over budget cannot be selected, and says what it is
 * short by. So the shipped panel can never reach the over-budget outcome — {@link classifyOutcome}
 * still classifies it, because the classification is total over states rather than over the states
 * one panel can produce, and § 10.4 names four outcomes rather than three.
 */

import type {
  DialValue,
  EditorParkingStrategy,
  FixitCase,
  FixitExtra,
  FixitRepair,
  FixitState,
} from './types.js';
import {
  changeCovering,
  priceOf,
  purchaseUnits,
  smallestPurchaseUnitsOf,
  steppedPurchaseUnits,
} from '../pricing/parse.js';
import { changesAtPaths, changesBought } from '../pricing/repairPrice.js';
import {
  dialPathsOf,
  doorDwellPathsOf,
  keyedBankIdOf,
  rezonePathsOf,
  tenancyCohortsMovedOf,
} from './families.js';
import { KEYED_BANK } from './types.js';
import type { PriceSchedule } from '../pricing/types.js';

/**
 * § 9's editor pricing, read off the schedule — GitHub issue **#366**.
 *
 * Dwell is still free; what changed is where the three figures that are *not* free come from. This
 * was three literals, and two of them disagreed with the rest of the tree about the same purchase:
 *
 * | | was | is | why |
 * |---|---|---|---|
 * | `shaftUnits` | 34 | 34 | one of **four** places that already said 34, so this one is only moved |
 * | `speedUnitsPerHalfMps` | **6** | **10** | the fix cases charge 8, 9 or 10 for the same 0.5 m/s bump. A player paid 6 in the editor and 10 as a repair for one metre per second |
 * | `capacityUnitsPerTwoPlaces` | 8 | 8 | kept, as its own schedule row: widening one car is a different act from re-specifying the fleet |
 *
 * The middle row is the conflict #366's second criterion is aimed at, and it is the reason this is
 * a function of the schedule rather than a constant that a test cross-checks: a cross-check leaves
 * two numbers in two places and hopes a guard notices, and this repository has a name for that.
 *
 * ## Zones and parking are priced here too, and not by this function — issue **#422**
 *
 * § 9 called them free. They are not, and the reason is #366's own rule rather than a decision this
 * lane took: a rezone in the fix-it editor and a rezone bought as a repair are the same act, so they
 * pay the same price, and that price is the schedule's `rezone-bank` (6 u). Parking keeps the word —
 * `idle-parking` is 0 u in every shipped list — but it keeps it *by being priced at zero* rather than
 * by being outside the ladder, which is the difference between a free change and an unpriced one.
 *
 * They are absent from this function because they are not **per-step** prices. A speed step is 10 u
 * *each*; a rezone is 6 u however many floors it moves, which is the schedule's own finding about
 * the twelve shipped repairs that buy one. {@link spendOf} charges them through
 * `pricing/repairPrice.ts#changesAtPaths`, the same dedupe a repair's patch goes through.
 *
 * ## Three prices, and the two per-step ones are read off the row's face — issue **#528**
 *
 * The two steppers read `pricing/parse.ts#smallestPurchaseUnitsOf` and the shaft reads
 * `#purchaseUnits`, and the difference is the whole of what this function knows about rates. A
 * stepper's figure is *the price of one step*, which is a flat row's price and a rated row's
 * `unitsPer` — the price on the row's face, which is what the panel prints beside the control
 * (*"10 u per half a metre per second"*). A shaft is one purchase of a whole change, so a rated
 * `new-car` would have to be bought with a quantity this function does not hold, and `purchaseUnits`
 * correctly refuses rather than guessing one.
 *
 * **This function multiplies nothing, and never did** — which is the half of GitHub issue #528's
 * premise that did not survive being checked. {@link spendOf} is where a step count meets a price,
 * and since § D560 it meets it inside `pricing/`.
 */
export function editorPricingFrom(schedule: PriceSchedule): {
  readonly shaftUnits: number;
  readonly speedUnitsPerHalfMps: number;
  readonly capacityUnitsPerTwoPlaces: number;
} {
  return Object.freeze({
    shaftUnits: purchaseUnits(priceOf(schedule, 'new-car')),
    speedUnitsPerHalfMps: smallestPurchaseUnitsOf(priceOf(schedule, 'faster-machines')),
    capacityUnitsPerTwoPlaces: smallestPurchaseUnitsOf(priceOf(schedule, 'larger-car-step')),
  });
}

/**
 * The five standing extras — offered in every case, none of them a fix, so the budget can be
 * spent badly (§ 10.2). They carry **no patch**, and `cases.test.ts` holds the refusal the other
 * way round: selecting every extra leaves the as-repaired run byte-identical to the as-built one.
 */
const EXTRA_COPY: readonly { readonly id: string; readonly name: string; readonly line: string }[] =
  Object.freeze([
    {
      id: 'traffic-survey',
      name: 'A traffic survey',
      line: 'A week of counts, confirming what the figures on this page already show.',
    },
    {
      id: 'landing-indicators',
      name: 'Landing indicators',
      line: 'Tenants see the car coming. The car does not come sooner.',
    },
    {
      id: 'car-interiors',
      name: 'New car interiors',
      line: 'The wait feels shorter. It is not.',
    },
    {
      id: 'call-out-cover',
      name: 'Call-out cover',
      line: 'Somebody arrives faster when it breaks. Nothing here is broken.',
    },
    {
      id: 'tenant-notices',
      name: 'Tenant notices',
      line: 'A letter about the works. The letter is not the works.',
    },
  ]);

/**
 * The five standing extras — offered in every case, none of them a fix, so the budget can be spent
 * badly (§ 10.2). They carry **no patch**, and `cases.test.ts` holds the refusal the other way
 * round: selecting every extra leaves the as-repaired run byte-identical to the as-built one.
 *
 * **The words are here and the prices are not** — GitHub issue **#366**. The lines are
 * player-facing copy that `honesty/surfaces.ts` sweeps and that belongs beside the surface that
 * draws them; the five numbers were a price list and now live in `data/price-schedule.json` with
 * every other price. An extra the schedule does not price is refused rather than shipped free.
 */
export function standingExtrasFrom(schedule: PriceSchedule): readonly FixitExtra[] {
  return EXTRA_COPY.map((copy) => {
    const priced = schedule.extras.find((extra) => extra.id === copy.id);
    if (priced === undefined) {
      throw new Error(
        `data/price-schedule.json prices no extra "${copy.id}". An extra with no price would be ` +
          'offered free, which is the one thing a standing extra must never be (§ 10.2).',
      );
    }
    return { id: copy.id, name: copy.name, costUnits: priced.priceUnits, line: copy.line };
  });
}

/** Nothing selected, nothing bought, and the building's own zoning and parking left alone. */
export function emptyFixitState(): FixitState {
  return {
    selectedRepairIds: [],
    selectedExtraIds: [],
    speedSteps: 0,
    capacitySteps: 0,
    zoneOverlapFloors: 0,
    parkingStrategy: null,
    topFloorRaiseM: 0,
    dispatcherDials: {},
    doorDwell: {},
    carBanks: {},
    bankFloors: {},
    platedBankIds: [],
    tenancyPositions: {},
  };
}

/**
 * **The `covers` paths the editor's own three settings buy** — issue **#422**.
 *
 * Three strings rather than a patch, because that is genuinely most of what two of the three
 * settings carry: the banks array a zoning step becomes is not built until `fixit/run.ts` plans the
 * run, and manufacturing a patch-shaped object here purely so `pathsIn` could walk it back into
 * these strings would be a second statement of the same fact. (The third, `topFloorRaiseM`, *is*
 * carried as a real `FixitPatch.building.floors` entry once `fixit/run.ts#editorPatchOf` has a floor
 * id to name — this function still names its path directly, alongside the other two, so pricing
 * asks nothing about how a setting becomes a patch.)
 *
 * None of the three paths is invented for this screen. `building.banks[]` is the path twelve
 * shipped repairs already buy `rezone-bank` with, `dispatcher.idle.parkingStrategy` is the first of
 * `idle-parking`'s four, and `building.floors[]` is the path `raise-a-floor` prices for the same
 * reason — `pricing/schedule.test.ts` refuses a second row covering a field already claimed, so
 * reusing a schedule row is not merely allowed, it is the only thing the schedule permits.
 */
export function editorPathsOf(state: FixitState): readonly string[] {
  const paths: string[] = [];
  if (state.zoneOverlapFloors > 0) paths.push('building.banks[]');
  if (state.parkingStrategy !== null) paths.push('dispatcher.idle.parkingStrategy');
  if (state.topFloorRaiseM > 0) paths.push('building.floors[].heightM');
  /*
   * § D1000's five families, each by the path a repair buying the same act names, so the schedule's
   * dedupe charges an editor rezone and a zoning step once between them — the same rule #366 set.
   */
  paths.push(...dialPathsOf(state.dispatcherDials));
  paths.push(...doorDwellPathsOf(state.doorDwell));
  paths.push(...rezonePathsOf(state));
  return paths;
}

export interface FixitSpend {
  readonly repairUnits: number;
  readonly extraUnits: number;
  /** The editor's machinery: speed and capacity steps at § 9's prices. */
  readonly editorUnits: number;
  readonly totalUnits: number;
  /**
   * The machinery share of the total — **whichever control bought it**. § 10.4's spent row says
   * *"how much of it was machinery"*, and {@link MACHINERY_EDITOR_PATHS} is the one statement of
   * what the word covers.
   */
  readonly machineryUnits: number;
}

/**
 * **What *machinery* means, stated once and derived from the schedule** — GitHub issue **#568**.
 *
 * These are the three `covers` paths the fix-it editor's own machinery controls buy: the speed
 * stepper, the capacity stepper and a new shaft. The schedule resolves them to `faster-machines`,
 * `larger-car-step` and `new-car`, and **those rows are machinery wherever they are bought** —
 * which is the whole of the correction below.
 *
 * ## The defect this closes, and it was reachable on ten repairs
 *
 * {@link spendOf} used to compute `editorUnits - settingUnits + shaftUnits`, in which
 * `repairUnits` **is not a term at all**. So a repair whose patch buys nothing but machinery
 * reported none of it: `sleeping-sky-lobby`'s 10 u *Re-gear the shuttles* — eight re-geared
 * machines, the **same** `faster-machines` row the editor's own stepper buys at the **same** 10 u —
 * drew *"10 u, of which 0 u is machinery"*, while the stepper beside it drew *"10 u, of which 10 u
 * is machinery"*. **Ten** of the seventy-two shipped repairs buy `faster-machines`, so ten drew a
 * figure that was false about the purchase the player had just made, and {@link budgetNoteOf}'s
 * machinery branch could not fire for any of them.
 *
 * ## Why a derived set rather than a `machinery: true` on every schedule row
 *
 * A flag would be a **new classification**, authored across thirty-seven rows by nobody with the
 * authority to classify them — is a regenerative drive machinery? a re-roped shaft? a destination
 * panel? — and `CLAUDE.md` invariant 7 would then make each answer a tunable this lane invented.
 * Derived, the set restates the definition the engine has always used and changes no price and no
 * answer for the editor: the three rows are exactly `editorPricingFrom`'s three, read through the
 * same `covers` paths.
 *
 * **What it deliberately does not claim.** A repair buying `cabin-pressurisation`,
 * `regenerative-drive` or `rope-upgrade` would be steel under most readings and is not counted
 * here, because no control on this screen buys one and the word would then mean two things at
 * once. **No shipped repair buys any of the three** — the ten that carry machinery all carry
 * `faster-machines` and the eighteen new shafts carry `new-car` — so the limit is stated rather
 * than measured away, and it moves on the commit that gives the screen such a control.
 */
const MACHINERY_EDITOR_PATHS: readonly string[] = Object.freeze([
  'editor.speed',
  'editor.capacityStep',
  'editor.shaft',
]);

/** The schedule rows {@link MACHINERY_EDITOR_PATHS} resolves to, by id. */
function machineryChangeIdsOf(schedule: PriceSchedule): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const path of MACHINERY_EDITOR_PATHS) {
    const change = changeCovering(schedule, path);
    if (change !== undefined) ids.add(change.id);
  }
  return ids;
}

/**
 * The machinery inside one repair's price, **subtracted rather than re-summed**.
 *
 * A repair's `costUnits` is `pricing/repairPrice.ts#repairPriceUnits` — the sum of the distinct
 * changes its patch buys, plus the shaft-area surcharge where it adds a car. Re-summing the
 * machinery rows here would drop that surcharge, and it is not small: the eighteen shipped shafts
 * cost 34, 42 or 50 units against one 34 u `new-car` base, so the band is **up to 16 of the 50** a
 * ninth shuttle costs. So the non-machinery changes are summed and taken off the price the case
 * was actually charged, which keeps the band with the shaft it belongs to and needs no second
 * lookup of the building.
 *
 * **The patch is asked first, and that guard is not tidiness.** A subtraction alone attributes
 * every unexplained unit of the price to machinery, and a repair whose `costUnits` does not come
 * from the schedule — a fixture, or a file written before GitHub issue #366 moved the prices into
 * `data/price-schedule.json` — would then report steel it never bought. So a repair whose patch
 * buys **no** machinery row is 0 by construction, whatever it costs.
 */
function repairMachineryUnits(schedule: PriceSchedule, repair: FixitRepair): number {
  const machinery = machineryChangeIdsOf(schedule);
  const bought = changesBought(schedule, repair.patch);
  if (!bought.some((change) => machinery.has(change.id))) return 0;
  const otherUnits = bought
    .filter((change) => !machinery.has(change.id))
    .reduce((sum, change) => sum + purchaseUnits(change), 0);
  return Math.max(0, repair.costUnits - otherUnits);
}

/**
 * What a selection costs — GitHub issue **#366** put the schedule in the signature.
 *
 * The third parameter is the one place this function is allowed to learn a price from. Before, two
 * of the three sums here read module constants and the third read a number authored beside the
 * repair, which is three price lists inside one function.
 *
 * ## The two steppers are multiplied in `pricing/` — GitHub issue **#528**, § D560
 *
 * This function used to read `editorPricingFrom` and write
 * `state.speedSteps * pricing.speedUnitsPerHalfMps`, which is a magnitude term for a price, in code,
 * where `data/price-schedule.json` could not see it or change it. It asks
 * `pricing/parse.ts#steppedPurchaseUnits` now. **No price moves** — the arithmetic is the same
 * arithmetic, in the module that owns it — and the two figures are pinned step by step in
 * `editorPricesThroughTheSchedule.test.ts` on both sides of the move.
 */
export function spendOf(
  entry: FixitCase,
  state: FixitState,
  schedule: PriceSchedule,
): FixitSpend {
  const repairs = entry.repairs.filter((repair) => state.selectedRepairIds.includes(repair.id));
  const extras = standingExtrasFrom(schedule).filter((extra) =>
    state.selectedExtraIds.includes(extra.id),
  );
  const repairUnits = repairs.reduce((sum, repair) => sum + repair.costUnits, 0);
  const extraUnits = extras.reduce((sum, extra) => sum + extra.costUnits, 0);
  /*
   * **The tenancy is charged per cohort moved, at the `tenant-floors` row's own flat figure** —
   * § D1001. Not through `editorPathsOf`'s dedupe, which would charge two cohorts once: the row's
   * name is *move or stagger a tenancy*, singular, and a case that authored two would otherwise sell
   * the second for nothing. It is a setting rather than steel, so it is in the settings total.
   */
  const tenancyUnits = steppedPurchaseUnits(
    priceOf(schedule, 'tenant-floors'),
    tenancyCohortsMovedOf(entry.asBuilt.tenancy, state.tenancyPositions),
  );
  const settingUnits =
    changesAtPaths(schedule, editorPathsOf(state)).reduce(
      (sum, change) => sum + purchaseUnits(change),
      0,
    ) + tenancyUnits;
  const editorUnits =
    steppedPurchaseUnits(priceOf(schedule, 'faster-machines'), state.speedSteps) +
    steppedPurchaseUnits(priceOf(schedule, 'larger-car-step'), state.capacitySteps) +
    settingUnits;
  /*
   * **The repairs' own machinery, which used to be missing** — GitHub issue #568. This was
   * `repairs.filter(role === 'new-shaft')`, so a repair that bought eight re-geared machines
   * reported none; see {@link MACHINERY_EDITOR_PATHS}. It is read off the **patch** rather than
   * off the role, because the role is a menu position and the patch is what was bought — and
   * because `docs/38` § 2.1 retires the roles while the machinery figure survives them.
   */
  const repairMachinery = repairs.reduce(
    (sum, repair) => sum + repairMachineryUnits(schedule, repair),
    0,
  );
  return {
    repairUnits,
    extraUnits,
    editorUnits,
    totalUnits: repairUnits + extraUnits + editorUnits,
    /*
     * **The two settings are in `editorUnits` and deliberately not here** — issue #422. § 10.4's
     * spent row asks *how much of it was machinery*, and neither a redrawn boundary nor a parking
     * rule cuts steel: `rezone-bank` books a night of works, and it books it against a controller
     * and a landing sign rather than a shaft. Folding them in would make `budgetNoteOf` answer *you
     * are buying machinery* to a player who bought a setting, which is `docs/20` defect 8 read the
     * other way round. A **repair** that rezones is excluded by the same rule and by the same
     * statement of it, which is what `repairMachineryUnits` subtracts.
     */
    machineryUnits: editorUnits - settingUnits + repairMachinery,
  };
}

/**
 * § 10.3's running total note — one of **four**, decided by what the spend actually is.
 *
 * ## The free arm is keyed on spend, not on machinery spend — `docs/20` defect 8
 *
 * It used to be three, and the last was reached whenever `machineryUnits === 0`. So the panel drew
 * *"11 of 12 u committed, 0 u of it machinery — **Everything you changed is a setting, and settings
 * are free**"*: eleven of twelve units committed, on the same line, under a sentence saying nothing
 * had been spent. The two repairs that produced it are priced 5 u and 6 u and are neither machinery
 * nor free.
 *
 * The confusion is between two different questions the panel asks at once — *what did this cost?*
 * and *did you buy steel or move a setting?* — and the old third branch answered the second while
 * being read as the first. A player deciding whether they can still afford the shaft they want is
 * reading it as the first.
 *
 * So *free* now means **nothing was committed**, which is the only reading of the word that a
 * running total can support, and a spend with no machinery in it gets its own line rather than
 * borrowing the free one. The machinery branch is unchanged, and the over-budget branch still
 * outranks everything: an over-budget total is the only state the owner acts on.
 */
export function budgetNoteOf(entry: FixitCase, spend: FixitSpend): string {
  if (spend.totalUnits > entry.budgetUnits) {
    return 'Over the budget, and this is where the owner stops reading and asks what you can do without buying anything.';
  }
  if (spend.machineryUnits > 0) {
    return 'You are buying machinery — compare it against the free change first.';
  }
  if (spend.totalUnits > 0) {
    return 'No machinery in that, and none of it free either — committed budget is committed, whatever it buys.';
  }
  return 'Everything you changed is a setting, and settings are free.';
}

/**
 * Whether one more purchase fits, and by how much it misses — § 10.2's *"says what it is short
 * by"*. `costUnits` is the candidate's price; selected things are always deselectable.
 */
export function affordabilityOf(
  entry: FixitCase,
  state: FixitState,
  costUnits: number,
  schedule: PriceSchedule,
): { readonly selectable: boolean; readonly shortByUnits: number } {
  const total = spendOf(entry, state, schedule).totalUnits + costUnits;
  const shortBy = total - entry.budgetUnits;
  return { selectable: shortBy <= 0, shortByUnits: Math.max(0, shortBy) };
}

/**
 * Toggle a repair. Selecting one the budget cannot take returns the state unchanged — the panel
 * never offers the press ({@link affordabilityOf} disables it), and a reducer that trusted the
 * panel would be one mis-wired button away from an over-budget run.
 */
export function toggleRepair(
  entry: FixitCase,
  state: FixitState,
  repairId: string,
  schedule: PriceSchedule,
): FixitState {
  const repair = entry.repairs.find((candidate) => candidate.id === repairId);
  if (repair === undefined) return state;
  if (state.selectedRepairIds.includes(repairId)) {
    return { ...state, selectedRepairIds: state.selectedRepairIds.filter((id) => id !== repairId) };
  }
  if (!affordabilityOf(entry, state, repair.costUnits, schedule).selectable) return state;
  return { ...state, selectedRepairIds: [...state.selectedRepairIds, repairId] };
}

/** Buy or return one +0.5 m/s step. Capped live at what the remaining budget allows (§ 10.3). */
export function stepSpeed(
  entry: FixitCase,
  state: FixitState,
  delta: 1 | -1,
  schedule: PriceSchedule,
): FixitState {
  const next = state.speedSteps + delta;
  if (next < 0) return state;
  const speedPrice = editorPricingFrom(schedule).speedUnitsPerHalfMps;
  if (delta > 0 && !affordabilityOf(entry, state, speedPrice, schedule).selectable) {
    return state;
  }
  return { ...state, speedSteps: next };
}

/** Buy or return one +2-place step. Same cap, § 9's other price. */
export function stepCapacity(
  entry: FixitCase,
  state: FixitState,
  delta: 1 | -1,
  schedule: PriceSchedule,
): FixitState {
  const next = state.capacitySteps + delta;
  if (next < 0) return state;
  const placePrice = editorPricingFrom(schedule).capacityUnitsPerTwoPlaces;
  if (delta > 0 && !affordabilityOf(entry, state, placePrice, schedule).selectable) {
    return state;
  }
  return { ...state, capacitySteps: next };
}

/** What the schedule charges for the editor's zoning step, and for its parking rule. */
export function zonePriceUnits(schedule: PriceSchedule): number {
  return purchaseUnits(priceOf(schedule, 'rezone-bank'));
}
export function parkingPriceUnits(schedule: PriceSchedule): number {
  return purchaseUnits(priceOf(schedule, 'idle-parking'));
}
/** What the schedule charges for the editor's elevation step — issue **#422**. */
export function topFloorRaisePriceUnits(schedule: PriceSchedule): number {
  return purchaseUnits(priceOf(schedule, 'raise-a-floor'));
}

/**
 * Widen or narrow the overlap between the banks by one floor — issue **#422**.
 *
 * **Two ceilings, and they are refused for two different reasons.** The budget is one: the first
 * floor of overlap is a rezone and costs `rezone-bank`, so a state that cannot afford 6 u cannot
 * take the first step. `ceiling` is the other, and it belongs to the *building* —
 * `run.ts#zoneOverlapCeilingOf` is the largest step that still moves a boundary, so a press past it
 * would write a field and change nothing. The screen has to say which of the two refused it; a
 * control that answered *at the budget* to a player who had 12 units left would be R3's cue rule on
 * a stepper.
 *
 * **Only the first floor is charged.** The schedule prices a rezone flat, on its own measured
 * ground: *"twelve fix repairs buy it between 0 and 12 units with no rule relating the price to how
 * much is rezoned"*. So stepping 1 → 2 is free and stepping 2 → 0 refunds the 6.
 */
export function stepZoneOverlap(
  entry: FixitCase,
  state: FixitState,
  delta: 1 | -1,
  ceiling: number,
  schedule: PriceSchedule,
): FixitState {
  const next = state.zoneOverlapFloors + delta;
  if (next < 0 || next > ceiling) return state;
  if (state.zoneOverlapFloors === 0 && next > 0) {
    /* A rezone the banks' selects already bought is the same charge, so the step adds nothing (seat D H5). */
    const cost = rezonePathsOf(state).length > 0 ? 0 : zonePriceUnits(schedule);
    if (!affordabilityOf(entry, state, cost, schedule).selectable) return state;
  }
  return { ...state, zoneOverlapFloors: next };
}

/**
 * Raise or lower the building's topmost floor by one metre — issue **#422**.
 *
 * The same shape as {@link stepZoneOverlap}, for the same two reasons. **Two ceilings, refused for
 * two different reasons**: the budget, because the first metre is a purchase and costs
 * `raise-a-floor`; and `ceiling`, which belongs to the *building* —
 * `fixit/run.ts#topFloorRaiseCeilingOf` is `0` where the topmost floor is served by no bank or is
 * one half of a double-deck pair, and a press past it would write a field and change nothing.
 *
 * **Only the first metre is charged.** The schedule prices the move flat, on `rezone-bank`'s own
 * ground: a magnitude rule for "how far" is not something any shipped repair or list has ever
 * stated for a floor moving, so none is invented here either. Stepping 1 → 2 is free and stepping
 * 2 → 0 refunds the price.
 */
export function stepTopFloorRaise(
  entry: FixitCase,
  state: FixitState,
  delta: 1 | -1,
  ceiling: number,
  schedule: PriceSchedule,
): FixitState {
  const next = state.topFloorRaiseM + delta;
  if (next < 0 || next > ceiling) return state;
  if (state.topFloorRaiseM === 0 && next > 0) {
    if (!affordabilityOf(entry, state, topFloorRaisePriceUnits(schedule), schedule).selectable) {
      return state;
    }
  }
  return { ...state, topFloorRaiseM: next };
}

/**
 * Say where the idle cars wait, or hand the choice back to the standing order — issue **#422**.
 *
 * `null` is not a fourth strategy; it is *this editor has not touched it*, which is the state a case
 * opens on. `emptyFixitState` takes no case and so cannot know what the case's profile carries, and
 * a default that guessed one would edit the building by being drawn.
 *
 * Priced at `idle-parking`, which every shipped list puts at 0 u — so the affordability arm below
 * never bites today and is written anyway, because the price is data and the reducer may not assume
 * what the file says this week.
 */
export function setParkingStrategy(
  entry: FixitCase,
  state: FixitState,
  strategy: EditorParkingStrategy | null,
  schedule: PriceSchedule,
): FixitState {
  if (strategy === state.parkingStrategy) return state;
  if (strategy !== null && state.parkingStrategy === null) {
    if (!affordabilityOf(entry, state, parkingPriceUnits(schedule), schedule).selectable) {
      return state;
    }
  }
  return { ...state, parkingStrategy: strategy };
}

/* -------------------------------------------------------------------------- *
 * § D1000's five families — the reducers
 * -------------------------------------------------------------------------- */

/**
 * **One affordability rule for every family § D1000 adds**: a change is taken when the order it
 * leaves is inside the budget, or when it costs no more than the order it replaces — so a press that
 * gives something back is never refused, and a press that buys something is refused exactly when
 * the schedule price it adds does not fit. Priced by {@link spendOf}, which prices through the
 * schedule's `covers` paths, so a second press inside a row already bought costs nothing more.
 */
function withinBudget(
  entry: FixitCase,
  state: FixitState,
  next: FixitState,
  schedule: PriceSchedule,
): FixitState {
  const after = spendOf(entry, next, schedule).totalUnits;
  if (after <= entry.budgetUnits) return next;
  return after <= spendOf(entry, state, schedule).totalUnits ? next : state;
}

/**
 * Set a dispatcher dial, or hand it back with `null`. **The value is not checked here** — the dial's
 * select offers only values inside the declared range, and `fixit/run.ts` admits the whole edit
 * through `controls/editedProfile.ts` when the run is planned, which is the check that knows the
 * building. Gate-pruning is `fixit/families.ts#pruneDials`, called by the surfaces after this.
 */
export function setDial(
  entry: FixitCase,
  state: FixitState,
  dimensionId: string,
  value: DialValue | null,
  schedule: PriceSchedule,
): FixitState {
  const { [dimensionId]: _previous, ...rest } = state.dispatcherDials;
  const dispatcherDials = value === null ? rest : { ...rest, [dimensionId]: value };
  return withinBudget(entry, state, { ...state, dispatcherDials }, schedule);
}

/** Set one side of one target's door hold, or hand it back with `null`. */
export function setDoorDwell(
  entry: FixitCase,
  state: FixitState,
  target: string,
  side: 'hall' | 'car',
  seconds: number | null,
  schedule: PriceSchedule,
): FixitState {
  const current = state.doorDwell[target] ?? {};
  const key = side === 'hall' ? 'hallCallS' : 'carCallS';
  const { [key]: _previous, ...others } = current;
  const setting = seconds === null ? others : { ...others, [key]: seconds };
  const { [target]: _old, ...rest } = state.doorDwell;
  const doorDwell = Object.keys(setting).length === 0 ? rest : { ...rest, [target]: setting };
  return withinBudget(entry, state, { ...state, doorDwell }, schedule);
}

/**
 * Put a car in a bank — an existing bank's id, `KEYED_BANK` or `OUT_OF_SERVICE` — or hand it back
 * with `null`. Writing the car's `standing` bank is the same as handing it back, because a
 * rezone that moves nothing is a price for nothing. Handing back a keyed car also drops the floors
 * its own bank was drawn with, since that bank no longer exists.
 */
export function setCarBank(
  entry: FixitCase,
  state: FixitState,
  carId: string,
  target: string | null,
  standing: string,
  schedule: PriceSchedule,
): FixitState {
  const { [carId]: _previous, ...rest } = state.carBanks;
  const carBanks = target === null || target === standing ? rest : { ...rest, [carId]: target };
  const keyed = keyedBankIdOf(carId);
  const { [keyed]: _keyedFloors, ...otherFloors } = state.bankFloors;
  const bankFloors = carBanks[carId] === KEYED_BANK ? state.bankFloors : otherFloors;
  return withinBudget(entry, state, { ...state, carBanks, bankFloors }, schedule);
}

/**
 * Toggle whether a bank serves a floor. `standing` is what the bank serves with nothing set — the
 * as-built floors, or for a keyed bank the floors of the bank its car came from — and a set equal
 * to it is dropped rather than kept, for {@link setCarBank}'s reason.
 */
export function toggleBankFloor(
  entry: FixitCase,
  state: FixitState,
  bankId: string,
  floorId: string,
  standing: readonly string[],
  schedule: PriceSchedule,
): FixitState {
  const current = new Set(state.bankFloors[bankId] ?? standing);
  if (current.has(floorId)) current.delete(floorId);
  else current.add(floorId);
  const same = current.size === standing.length && standing.every((id) => current.has(id));
  const { [bankId]: _previous, ...rest } = state.bankFloors;
  const bankFloors = same ? rest : { ...rest, [bankId]: [...current] };
  return withinBudget(entry, state, { ...state, bankFloors }, schedule);
}

/**
 * Move a tenancy cohort to one of its authored positions, or hand it back with `null` —
 * [§ D1001](../../../../DECISIONS.md).
 *
 * **A cohort or position the case does not author returns the state unchanged.** That is the whole
 * of what makes the row inert on the fifteen cases that author no tenancy: the surface draws the row
 * and its sentence there, and nothing a press can send reaches the run.
 */
export function setTenancyPosition(
  entry: FixitCase,
  state: FixitState,
  cohortId: string,
  positionId: string | null,
  schedule: PriceSchedule,
): FixitState {
  const cohort = entry.asBuilt.tenancy?.cohorts.find((candidate) => candidate.id === cohortId);
  if (cohort === undefined) return state;
  const { [cohortId]: _previous, ...rest } = state.tenancyPositions;
  if (positionId === null) return { ...state, tenancyPositions: rest };
  if (!cohort.positions.some((position) => position.id === positionId)) return state;
  return withinBudget(entry, state, { ...state, tenancyPositions: { ...rest, [cohortId]: positionId } }, schedule);
}

/** Toggle whether a bank's cars weigh against their own plate. */
export function togglePlate(
  entry: FixitCase,
  state: FixitState,
  bankId: string,
  schedule: PriceSchedule,
): FixitState {
  const platedBankIds = state.platedBankIds.includes(bankId)
    ? state.platedBankIds.filter((id) => id !== bankId)
    : [...state.platedBankIds, bankId];
  return withinBudget(entry, state, { ...state, platedBankIds }, schedule);
}

/* -------------------------------------------------------------------------- *
 * The four outcomes — § 10.4, copy verbatim
 * -------------------------------------------------------------------------- */

/** § 9's two measured thresholds. The third bar is the case's own budget. */
export const COMPLAINT_GONE_PCT = 80;
export const REST_DROP_LIMIT_POINTS = 2;

/** The basis line, printed under the before/after exactly as § 10.4 words it. */
export const BASIS_LINE =
  'one run before, one run after — enough to see a repair this size; not enough to split hairs.';

/**
 * The basis line for a pair whose repair **changed the crowd** — GitHub issue #349.
 *
 * Three shipped cases diagnose the crowd rather than the kit: staggered tenancy starts, appointment
 * letters reprinted for half past nine, a staggered-starts lease clause invoked. Each of those
 * repairs patches `floorPopulations`, so its after-run meets fewer people than its before-run by
 * design, and {@link BASIS_LINE}'s implied *same crowd, twice* would be false under it. Since GitHub
 * issue #601 the after-run's people are the before-run's less the ones moved, thinned rather than
 * re-drawn (`run.ts#crowdThinningOf`), and the line says so where it used to say *a different
 * crowd*, which was true only of the re-draw. This line
 * says what the pair actually is. Chosen from the **measurement** ({@link FixitMeasurement.sameCrowd},
 * read off the legs) rather than from the patch, so the sentence cannot claim a crowd the runs did
 * not have; `run.ts#assertPairMatchesRepairs` then holds the patch and the legs to each other.
 */
export const DEMAND_BASIS_LINE =
  'one run before, one run after — and the repair changed who arrives, so the second run meets the same crowd less the people it moved. Enough to see a repair this size; not enough to split hairs.';

/**
 * The basis line for a pair whose order **changed which trips the lifts can carry** — [§ D1160](../../../../DECISIONS.md),
 * the post-AJ panel's seat C D1.
 *
 * The traffic generator draws a crowd only over trips some chain of banks can carry, so an order
 * that opens or closes one (one floor of zone overlap on a building whose banks meet only at the
 * lobby) meets a crowd drawn for the building as changed. That used to reach the player as a raw
 * assertion naming passengers and floating-point arrival times; it is the model working, and this
 * says so in the words the other two basis lines use. Chosen from the legs, like the others.
 */
export const ROUTES_BASIS_LINE =
  'one run before, one run after — and your order changes which trips the lifts can carry, so the second run meets a crowd drawn for the building as you changed it rather than the same crowd twice. Enough to see a repair this size; not enough to split hairs.';

/**
 * Whether a repair changes **who arrives** rather than what carries them — the one patch field that
 * reaches the passenger trace. `fixit/parse.ts` permits it on the diagnosed repair alone (a
 * purchase cannot move people), so on a shipped case this is true of at most the diagnosed one.
 */
export function repairChangesTheCrowd(repair: FixitRepair): boolean {
  return (repair.patch.building?.floorPopulations ?? []).length > 0;
}

/** Whether the repairs a state has selected leave the crowd alone — what the pair *claims*. */
export function selectionKeepsTheCrowd(entry: FixitCase, state: FixitState): boolean {
  /* A moved tenancy cohort changes who arrives exactly as a crowd-changing repair does — § D1001. */
  if (tenancyCohortsMovedOf(entry.asBuilt.tenancy, state.tenancyPositions) > 0) return false;
  return !entry.repairs.some(
    (repair) => state.selectedRepairIds.includes(repair.id) && repairChangesTheCrowd(repair),
  );
}

/** What the pair of runs measured, as the outcome needs it. Produced by `run.ts#measuredOf`. */
export interface FixitMeasurement {
  /** The complaint figure on each run, in the measure's own unit. */
  readonly complaintBefore: number;
  readonly complaintAfter: number;
  /** Boarded scope legs per side — the count a scoped mean is over, carried beside it. */
  readonly scopeBoardedBefore: number;
  readonly scopeBoardedAfter: number;
  /** How much of the complaint went away, 0–100, or `null` when the run showed no complaint. */
  readonly complaintGonePct: number | null;
  /** Away inside a minute over the rest of the building, per side, with denominators. */
  readonly restAwayBeforePct: number | null;
  readonly restAwayAfterPct: number | null;
  readonly restBoardedBefore: number;
  readonly restBoardedAfter: number;
  /** After minus before, in points. Negative is worse. `null` when either side is unmeasured. */
  readonly restDeltaPoints: number | null;
  /**
   * Whether the two runs met the same crowd, **measured on the legs** by `record/crowd.ts` — GitHub
   * issue #350. Decides which basis line the outcome prints; see {@link DEMAND_BASIS_LINE}.
   */
  readonly sameCrowd: boolean;
  /**
   * The second run met people the first did not — a crowd **re-drawn** for a building whose trips
   * the order changed, rather than thinned by a repair that moves people (§ D1160). Read off
   * the legs by `run.ts#measuredOf`; absent means `false`. Picks {@link ROUTES_BASIS_LINE}.
   */
  readonly crowdRedrawn?: boolean | undefined;
}

/**
 * § 10.4's four outcomes, and the two [§ D1020](../../../../DECISIONS.md) adds.
 *
 * `classifyOutcome` returns only the first four: it judges one pair, the letter's morning. The
 * other two are `fixit/judge.ts`'s, and they exist because one morning can be luck:
 *
 * - `checking` — the letter's morning cleared both bars and the same order is running on the
 *   forty-nine derived mornings. It wears no badge and banks nothing, because nothing is decided.
 * - `cleared-once` — the letter's morning cleared and the fifty did not hold. No badge, no chimes,
 *   nothing banked, and its screen says it cleared on this morning only.
 *
 * So `fixed` now means *cleared the gate and held over fifty mornings*, which is the only reading
 * {@link fixedBadgeAfter} and both press sites give it.
 */
export type FixitOutcomeKind =
  | 'fixed'
  | 'building-worse'
  | 'over-budget'
  | 'not-enough'
  | 'checking'
  | 'cleared-once';

export interface FixitRow {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly verdict: string;
  readonly passed: boolean;
}

export interface FixitOutcome {
  readonly kind: FixitOutcomeKind;
  readonly head: string;
  readonly body: string;
  /**
   * The three § 10.4 rows, and a fourth once the order has been run on the other mornings —
   * `fixit/judge.ts#judgedOutcomeOf`. A tuple of three or four rather than an array, so a reader
   * destructuring the first three keeps their types.
   */
  readonly rows: readonly [FixitRow, FixitRow, FixitRow] | readonly [FixitRow, FixitRow, FixitRow, FixitRow];
  readonly basis: string;
  /**
   * **Whose act the head and body describe** — [§ D1011](../../../../DECISIONS.md).
   *
   * `'diagnosis'` exactly when the case's authored `result` was printed, which {@link classifyOutcome}
   * does only on a run that is leg for leg the diagnosed repair's; `'order'` on every other outcome,
   * whose words describe the order the player ran and nothing else. Declared by the one function that
   * chose the words, so `honesty/properties.ts#unbacked-attribution` reads the choice rather than
   * guessing it from the prose. Optional only so an outcome built elsewhere still type-checks; the
   * honesty adapter reads a missing value as `'order'`.
   */
  readonly attribution?: 'diagnosis' | 'order' | undefined;
}

/**
 * **What the verdict may say about whose change fixed the case** — [§ D1011](../../../../DECISIONS.md),
 * the ruling on `rescore-ai` N1 and assessor C's D1.
 *
 * The fixed arm used to return `entry.result.head/body` for every fixed outcome, whatever the
 * player had changed. Five false sentences were reproduced on the shipped bundle — a hospital roof
 * raised three metres read *"Four hundred letters now say half past"*, a parking change on the
 * lettings case read *"The staggered starts … take six hundred arrivals out"* — because every
 * authored result body is a mechanism claim about **the diagnosed repair's run**, and the product
 * printed it over runs that were not that run.
 *
 * - **`witnessRun`** — whether the player's after-run is **leg for leg** the diagnosed repair's
 *   after-run on the case seed. Leg identity rather than schedule-row identity or config identity:
 *   measured by the ruling's engineering member over the eighteen exact answers, rows matched 18 of
 *   18 and falsely accepted *two cars out*'s car A → High (the same `rezone-bank` row as the
 *   answer); configs matched only 9 of 18; legs matched 18 of 18 with no false accept. If every leg
 *   is identical, the authored narrative is exactly as true of the player's run as of the witness's.
 * - **`changes`** — the order's changes, worded by the surface in `core`'s player words. The engine
 *   does not word them because the words belong beside the controls that set them
 *   (`everyday/fixitScreenModel.ts#fixitOrderLinesOf`).
 *
 * **`bought` left on [§ D1158](../../../../DECISIONS.md)'s commit.** It printed the schedule rows
 * the order bought, and a row's player name is the price group's (*Where idle cars wait*, *Trim the
 * door dwell*), so *"What it bought: Where idle cars wait"* repeated the change it followed. The
 * Spent row already says what was committed; the body now says what the change did.
 *
 * The object is S3's shape — one fourth argument rather than three — so a later field (a
 * replication, a panel of mornings) is added to it rather than to the signature.
 */
export interface FixitVerdictContext {
  readonly witnessRun: boolean;
  readonly changes: readonly string[];
}

/*
 * The composed fixed verdict's words — § D1011, reworded by [§ D1158](../../../../DECISIONS.md). The
 * care in them is about **what they do not say**: no mechanism, because a plausible sentence in
 * place of a measurement is what [§ D256](../../../../DECISIONS.md) refuses. § D1158 took out the
 * sentence that disclaimed the verdict in the player's face (*"The diagnosis describes a different
 * run, so its explanation is not printed here"*, printed even where the player had set exactly the
 * group the diagnosis names) and the *What it bought* line that repeated the change; in their place
 * is what the change did, read off the rows the card already draws.
 */
/** The head of a fixed verdict on a run that is not the diagnosed repair's. */
export const FIXED_BY_ORDER_HEAD = 'Fixed, by your own order.';
/** Leads the list of the player's changes. */
export const FIXED_BY_ORDER_CHANGES_LEAD = 'What you changed:';
/** Leads what the change did, from the complaint row and the rest-of-building row. */
export const FIXED_BY_ORDER_DID_LEAD = 'What it did:';
/**
 * The closing sentence, the ruling's player member's line kept verbatim (S1): the runs show the
 * change clears the bars; they do not show why.
 */
export const FIXED_BY_ORDER_CLOSE = 'These runs say your change works; they do not say why.';

/**
 * The state that **is** the diagnosed repair — the pinned witness § D706 clause 1 makes of it.
 *
 * Built directly rather than through {@link toggleRepair}: the witness is a run the case authors,
 * and a budget gate on it would be a gate on the author rather than on the player. Throws on a case
 * with no diagnosed repair, which `fixit/parse.ts` already refuses at the door.
 */
export function witnessStateOf(entry: FixitCase): FixitState {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed === undefined) throw new Error(`fixit: case "${entry.id}" has no diagnosed repair.`);
  return { ...emptyFixitState(), selectedRepairIds: [diagnosed.id] };
}

/**
 * The schedule rows an order bought, **by their player names**, each once — § D1011.
 *
 * The same derivation `spendOf` charges through, read for names rather than units: the repairs'
 * patches, the editor's settings by their `covers` paths, the two steppers' rows, a moved tenancy's
 * row, and the standing extras by their own names. In schedule order within each source, so the
 * sentence is stable press to press.
 */
export function rowsBoughtOf(
  entry: FixitCase,
  state: FixitState,
  schedule: PriceSchedule,
): readonly string[] {
  const names = new Map<string, string>();
  for (const repair of entry.repairs) {
    if (!state.selectedRepairIds.includes(repair.id)) continue;
    for (const change of changesBought(schedule, repair.patch)) names.set(change.id, change.name);
  }
  for (const change of changesAtPaths(schedule, editorPathsOf(state))) names.set(change.id, change.name);
  if (state.speedSteps > 0) {
    const change = priceOf(schedule, 'faster-machines');
    names.set(change.id, change.name);
  }
  if (state.capacitySteps > 0) {
    const change = priceOf(schedule, 'larger-car-step');
    names.set(change.id, change.name);
  }
  if (tenancyCohortsMovedOf(entry.asBuilt.tenancy, state.tenancyPositions) > 0) {
    const change = priceOf(schedule, 'tenant-floors');
    names.set(change.id, change.name);
  }
  for (const extra of standingExtrasFrom(schedule)) {
    if (state.selectedExtraIds.includes(extra.id)) names.set(`extra:${extra.id}`, extra.name);
  }
  return [...names.values()];
}

/**
 * Whether two orders are the same order — the test a verdict's staleness is decided by (§ D1011).
 *
 * Compared as **sets** where the state holds a set (selected ids, a bank's floors, plated banks) and
 * key by key where it holds a record, because the reducers build those in press order and a floor
 * toggled off and on again is the same order in a different array. Anything else would call a
 * verdict stale over nothing the run could see.
 */
export function sameOrder(a: FixitState, b: FixitState): boolean {
  return canonicalOrder(a) === canonicalOrder(b);
}

function canonicalOrder(state: FixitState): string {
  const sortedRecord = <T>(record: Readonly<Record<string, T>>, map: (value: T) => unknown = (v) => v) =>
    Object.keys(record)
      .sort()
      .map((key) => [key, map(record[key] as T)]);
  return JSON.stringify([
    [...state.selectedRepairIds].sort(),
    [...state.selectedExtraIds].sort(),
    state.speedSteps,
    state.capacitySteps,
    state.zoneOverlapFloors,
    state.parkingStrategy,
    state.topFloorRaiseM,
    sortedRecord(state.dispatcherDials),
    sortedRecord(state.doorDwell, (setting) => [setting.hallCallS ?? null, setting.carCallS ?? null]),
    sortedRecord(state.carBanks),
    sortedRecord(state.bankFloors, (floors) => [...floors].sort()),
    [...state.platedBankIds].sort(),
    sortedRecord(state.tenancyPositions),
  ]);
}

/**
 * Whether a verdict still describes the order on screen — § D1011, assessor C's D6.
 *
 * `verdictState` is the order the verdict was measured on. A verdict is a function of that order,
 * so once the player edits away from it the verdict describes an order they no longer have — the
 * same defect as a verdict describing an order they never made, one edit later. `undefined` means
 * no verdict was drawn, which is never stale.
 */
export function verdictIsStale(verdictState: FixitState | undefined, current: FixitState): boolean {
  return verdictState !== undefined && !sameOrder(verdictState, current);
}

/**
 * Whether the case wears the FIXED badge after this run — [§ D1157](../../../../DECISIONS.md).
 *
 * **A case once fixed stays fixed.** The badge is the player's clear, and a clear is banked: the
 * rail's count, the profile's solved set and the chime the fix paid all hang on it. Until § D1157
 * this was *"a statement about the latest run, never a high-water mark"* (`docs/20` defect 16), so a
 * player who fixed a case and then probed a cheaper order watched FIXED turn back to OPEN, the rail
 * drop from 6/15 to 5/15 and the case leave the solved set — the post-AJ panel's seat C met it on
 * three cases, and during a forty-nine-morning check on an already-fixed case the count dipped by
 * one until the verdict landed. Probing is the search this mode is built to reward, and it was
 * being punished.
 *
 * Defect 16's own concern survives, and it is answered on the card rather than by the badge: a
 * FIXED badge beside an outcome card reading *"9 waits → 9 waits"* was two verdicts about one case
 * on one screen. So a run that does not fix a fixed case draws {@link FIX_KEPT_LINE} over its card,
 * which says the card is that run's result and the fix stands. `fixedBefore` is the badge the case
 * wore before this run; omitted, the badge is this run's alone.
 */
export function fixedBadgeAfter(outcome: FixitOutcome, fixedBefore = false): boolean {
  return fixedBefore || outcome.kind === 'fixed';
}

/**
 * The line over a run's card when the case was already fixed and this run did not fix it —
 * [§ D1157](../../../../DECISIONS.md). The card is the run's result; the fix is the player's.
 */
export const FIX_KEPT_LINE =
  'This case stays fixed: an order of yours fixed it, and a run that does not clear takes nothing away. The result below is about the order you just ran.';

/** {@link FIX_KEPT_LINE} where it applies — a fixed case, and a run that did not fix it — or `undefined`. */
export function fixKeptLineOf(fixedBefore: boolean, outcome: FixitOutcome): string | undefined {
  return fixedBefore && outcome.kind !== 'fixed' ? FIX_KEPT_LINE : undefined;
}

/**
 * Classify the pair into § 10.4's four outcomes and word the three rows.
 *
 * Budget first: an over-budget spec was refused by the owner before anything ran, and the copy
 * says so. Then the complaint, then the rest.
 *
 * ## *Better* requires a measurement — `docs/20` defect 8
 *
 * The paragraph above used to end *"a run that fixed nothing and hurt the rest is 'Better, and the
 * complaint still stands' only when it is actually better, so the not-enough arm is the fall-through
 * rather than a claim"*, and the code did the opposite of what its own docstring claimed: the head
 * was the **unconditional** fall-through. The audit bought two repairs the product itself describes
 * as doing nothing (*"Nothing here is broken"*, *"The letter is not the works"*), ran, and read
 * **"Better, and the complaint still stands."** above a row reading *9 waits → 9 waits · **0 %** of
 * it went away*.
 *
 * That is the shape this repository names most often — a sentence that stopped describing the thing
 * under it — and it is the worst version of it, because the word being asserted is the one the whole
 * screen exists to earn. A player who is told *better* by a screen showing 0 % learns that the
 * verdict line is decoration.
 *
 * So the fall-through splits on {@link FixitMeasurement.complaintGonePct}, which is the measurement
 * the row beside the head already publishes:
 *
 * | the run | head |
 * |---|---|
 * | some of the complaint went away, short of the bar | *Better, and the complaint still stands.* |
 * | it grew — more of it after than before | *Worse, and the complaint still stands.* |
 * | none of it did, or the run showed none to remove | *No change, and the complaint still stands.* |
 *
 * The threshold is **greater than zero**, not a second bar: § 9's `COMPLAINT_GONE_PCT` is what
 * decides *fixed*, and inventing a *slightly better* bar here would be a third threshold nobody
 * argued. `null` — the run showed none of the complaint — takes the no-change arm, because a
 * complaint that was never there cannot have been improved; the row already says *"this run shows
 * none of it, so there is nothing to remove"* and the head now agrees with it.
 *
 * `kind` stays `not-enough` for both. It is the outcome's *class* — the repair did not clear the
 * bar — and both arms are that; splitting the kind would make every consumer branch on a
 * distinction only the copy draws. The head is what a reader reads, and it is the head that was
 * lying.
 */
/** Which basis the pair earned — read off the measurement, never off the patch. */
function basisOf(measurement: FixitMeasurement): string {
  if (measurement.sameCrowd) return BASIS_LINE;
  return measurement.crowdRedrawn === true ? ROUTES_BASIS_LINE : DEMAND_BASIS_LINE;
}

/**
 * ## The fixed arm prints the authored result only on the witness's own run — § D1011
 *
 * `verdict` is {@link FixitVerdictContext}. The authored `result` — a mechanism claim about the
 * diagnosed repair's run — is printed **only** when `verdict.witnessRun` says the player's after-run
 * is leg for leg that run. Every other fixed outcome is composed from the order: the changes, the
 * rows bought, and {@link FIXED_BY_ORDER_CLOSE}. **An absent `verdict` is not evidence** and takes
 * the composed arm: a caller that did not ask whether the run is the witness cannot be told that it
 * is. The three other arms do not read `verdict` at all.
 */
export function classifyOutcome(
  entry: FixitCase,
  measurement: FixitMeasurement,
  spend: FixitSpend,
  verdict?: FixitVerdictContext,
): FixitOutcome {
  const rows = rowsOf(entry, measurement, spend);
  const [complaintRow, restRow, spentRow] = rows;
  if (!spentRow.passed) {
    return {
      kind: 'over-budget',
      head: 'Over the budget, and the owner has said no.',
      body:
        'This is a repair budget. What you have specified is a capital project, and the owner ' +
        'will want a business case rather than a work order.',
      rows,
      basis: basisOf(measurement),
      attribution: 'order',
    };
  }
  if (complaintRow.passed && restRow.passed) {
    if (verdict?.witnessRun === true) {
      return {
        kind: 'fixed',
        head: entry.result.head,
        body: `${entry.result.body}${witnessOrderClause(entry, spend)}`,
        rows,
        basis: basisOf(measurement),
        attribution: 'diagnosis',
      };
    }
    return {
      kind: 'fixed',
      head: FIXED_BY_ORDER_HEAD,
      body: composedFixedBody(verdict, complaintRow, restRow, measurement),
      rows,
      basis: basisOf(measurement),
      attribution: 'order',
    };
  }
  if (complaintRow.passed) {
    return {
      kind: 'building-worse',
      head: 'The complaint is gone, and somebody else is paying for it.',
      body:
        'Everyone else waits longer than they did this morning, which is a second letter you ' +
        'have not received yet.',
      rows,
      basis: basisOf(measurement),
      attribution: 'order',
    };
  }
  // *Better* and *Worse* are claims about the measurement in the row above them. See the docstring.
  const improved = measurement.complaintGonePct !== null && measurement.complaintGonePct > 0;
  if (complaintGrew(measurement)) {
    return {
      kind: 'not-enough',
      head: 'Worse, and the complaint still stands.',
      body: 'The complaint grew on this run. Change something else and run it again.',
      rows,
      basis: basisOf(measurement),
      attribution: 'order',
    };
  }
  return {
    kind: 'not-enough',
    head: improved
      ? 'Better, and the complaint still stands.'
      : 'No change, and the complaint still stands.',
    body: improved
      ? 'Change something else and run it again.'
      : 'Nothing you changed reached the thing the letter is about. Change something else and run ' +
        'it again.',
    rows,
    basis: basisOf(measurement),
    attribution: 'order',
  };
}

/**
 * Whether the complaint measurably **grew** — the post-AI panel's seat C, D1.
 *
 * `complaintGonePct` is clamped at zero by `run.ts#measuredOf`, so a rise and no change both read
 * `0 %` there, and the fall-through above printed *"No change … Nothing you changed reached the
 * thing the letter is about"* over a row reading *32 waits → 37 waits*. The two raw figures the row
 * already prints decide it instead. Only where the complaint was measured on both sides: a `null`
 * gone share is *this run shows none of it*, and a complaint that was never there cannot have grown.
 */
function complaintGrew(measurement: FixitMeasurement): boolean {
  return measurement.complaintGonePct !== null && measurement.complaintAfter > measurement.complaintBefore;
}

/**
 * The composed fixed body — § D1011, § D1158. The changes, then what the change did, each omitted
 * when there is nothing to say rather than drawn as *"What you changed: ."*; then the close, always.
 *
 * *What it did* is the complaint row's own before and after, and the rest-of-building row's where
 * anybody else rode: figures the card prints under it, so the sentence makes no claim the rows do
 * not.
 */
function composedFixedBody(
  verdict: FixitVerdictContext | undefined,
  complaint: FixitRow,
  rest: FixitRow,
  measurement: FixitMeasurement,
): string {
  const parts: string[] = [];
  if (verdict !== undefined && verdict.changes.length > 0) {
    parts.push(`${FIXED_BY_ORDER_CHANGES_LEAD} ${verdict.changes.join('; ')}.`);
  }
  const others =
    measurement.restDeltaPoints === null
      ? ''
      : `, and everyone else away inside a minute went from ${rest.before} to ${rest.after}`;
  parts.push(`${FIXED_BY_ORDER_DID_LEAD} the complaint went from ${complaint.before} to ${complaint.after}${others}.`);
  parts.push(FIXED_BY_ORDER_CLOSE);
  return parts.join(' ');
}

/**
 * What the authored *fixed* copy cannot know about the order that reproduced it — `docs/20` defect
 * 8, reworded by [§ D1158](../../../../DECISIONS.md).
 *
 * This arm prints only where the player's after-run is **leg for leg** the diagnosed repair's
 * (§ D1011), so the authored words are exactly as true of the player's change as of the repair they
 * were written for. The clause used to open *"That is about the repair, not about your order"*,
 * which disclaimed the player's own repair in their face (the post-AJ panel's seat C, D4, on six
 * cases). It now says the opposite, which is the fact the leg comparison established.
 *
 * Two of the shipped cases end their body with a punchline about the fix having been free (*"Nothing
 * was bought: the cars were always enough"*), true of the repair and not of an order that also
 * ticked things that changed nothing. So where the order committed more than the diagnosed repair
 * costs, the clause says how much more, and that the run was the same: a cost comparison and a leg
 * comparison, both measured, with no claim about which of the player's settings did the work.
 *
 * Empty at zero spend, so a case whose player bought nothing reads its authored copy byte for byte.
 */
function witnessOrderClause(entry: FixitCase, spend: FixitSpend): string {
  if (spend.totalUnits <= 0) return '';
  const yours = ' Your run is that run, leg for leg, so the words above are about your change.';
  const repairUnits = entry.repairs.find((repair) => repair.role === 'diagnosed')?.costUnits ?? 0;
  const more = spend.totalUnits - repairUnits;
  if (more <= 0) return yours;
  const machinery =
    spend.machineryUnits > 0
      ? `, ${String(spend.machineryUnits)} u of it machinery`
      : ', none of it machinery';
  return (
    `${yours} Your order committed ${String(spend.totalUnits)} of ${String(entry.budgetUnits)} u` +
    `${machinery}: ${String(more)} u more than that repair costs, for the same run.`
  );
}

function rowsOf(
  entry: FixitCase,
  measurement: FixitMeasurement,
  spend: FixitSpend,
): readonly [FixitRow, FixitRow, FixitRow] {
  const measure = entry.complaint.measure;
  const complaintPassed =
    measurement.complaintGonePct !== null && measurement.complaintGonePct >= COMPLAINT_GONE_PCT;
  const complaint: FixitRow = {
    label: `The complaint — ${measure.label}`,
    before: complaintText(measure.kind, measurement.complaintBefore, measurement.scopeBoardedBefore),
    after: complaintText(measure.kind, measurement.complaintAfter, measurement.scopeBoardedAfter),
    verdict:
      measurement.complaintGonePct === null
        ? 'this run shows none of it, so there is nothing to remove'
        : complaintGrew(measurement)
          ? `none of it went away: it grew by ${complaintDeltaText(measure.kind, measurement.complaintAfter - measurement.complaintBefore)}, against the 80 % bar`
          : `${measurement.complaintGonePct.toFixed(0)} % of it went away, against the 80 % bar`,
    passed: complaintPassed,
  };
  const restPassed =
    measurement.restDeltaPoints !== null && measurement.restDeltaPoints >= -REST_DROP_LIMIT_POINTS;
  const rest: FixitRow = {
    label: 'The rest of the building — away inside a minute',
    before: awayText(measurement.restAwayBeforePct, measurement.restBoardedBefore),
    after: awayText(measurement.restAwayAfterPct, measurement.restBoardedAfter),
    verdict:
      measurement.restDeltaPoints === null
        ? 'nobody else rode, so there is no share to protect'
        : `moved ${measurement.restDeltaPoints >= 0 ? '+' : ''}${measurement.restDeltaPoints.toFixed(1)} points, against a 2-point floor`,
    passed: restPassed,
  };
  const spentPassed = spend.totalUnits <= entry.budgetUnits;
  const spent: FixitRow = {
    label: 'Spent',
    before: `budget ${String(entry.budgetUnits)} u`,
    after: `${String(spend.totalUnits)} u, of which ${String(spend.machineryUnits)} u is machinery`,
    verdict: spentPassed
      ? 'within the budget'
      : `over by ${String(spend.totalUnits - entry.budgetUnits)} u`,
    passed: spentPassed,
  };
  return [complaint, rest, spent];
}

/** How much a complaint grew, in the measure's own unit — `5 waits`, `1 wait`, `12.3 s`. */
function complaintDeltaText(kind: 'long-waits' | 'mean-wait', delta: number): string {
  return kind === 'long-waits'
    ? `${String(delta)} wait${delta === 1 ? '' : 's'}`
    : `${delta.toFixed(1)} s`;
}

function complaintText(kind: 'long-waits' | 'mean-wait', value: number, boarded: number): string {
  return kind === 'long-waits'
    ? `${String(value)} ${value === 1 ? 'wait' : 'waits'}`
    : `${value.toFixed(1)} s over ${String(boarded)} boarded journeys`;
}

function awayText(pct: number | null, boarded: number): string {
  return pct === null ? 'nobody rode' : `${pct.toFixed(1)} % of ${String(boarded)} journeys`;
}

/*
 * **Three functions left here on [§ D1020](../../../../DECISIONS.md)'s commit, with the menu they
 * served**: `repairsInDrawOrder` (§ D869's hashed order, which kept the answer out of the first row
 * of a menu nothing now draws), `repairRowOf` (a menu row's price and refusal) and `toggleExtra`
 * (a standing extra's toggle). Each had no caller left outside its own tests, which is the defect
 * `docs/05-roadmap.md`'s standing requirement names, so they were deleted rather than kept for a
 * suite's convenience. `toggleRepair` stays: the tutorial selects its worked answer through it.
 */
