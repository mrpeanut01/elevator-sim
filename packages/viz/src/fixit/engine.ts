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
  EditorParkingStrategy,
  FixitCase,
  FixitExtra,
  FixitRepair,
  FixitState,
} from './types.js';
import { priceOf } from '../pricing/parse.js';
import { changesAtPaths } from '../pricing/repairPrice.js';
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
 */
export function editorPricingFrom(schedule: PriceSchedule): {
  readonly shaftUnits: number;
  readonly speedUnitsPerHalfMps: number;
  readonly capacityUnitsPerTwoPlaces: number;
} {
  return Object.freeze({
    shaftUnits: priceOf(schedule, 'new-car').priceUnits,
    speedUnitsPerHalfMps: priceOf(schedule, 'faster-machines').priceUnits,
    capacityUnitsPerTwoPlaces: priceOf(schedule, 'larger-car-step').priceUnits,
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
  };
}

/**
 * **The `covers` paths the editor's own two settings buy** — issue **#422**.
 *
 * Two strings rather than a patch, because that is genuinely all the state carries: the banks array
 * a zoning step becomes is not built until `fixit/run.ts` plans the run, and manufacturing a
 * patch-shaped object here purely so `pathsIn` could walk it back into these strings would be a
 * second statement of the same fact.
 *
 * Neither path is invented for this screen. `building.banks[]` is the path twelve shipped repairs
 * already buy `rezone-bank` with, and `dispatcher.idle.parkingStrategy` is the first of
 * `idle-parking`'s four. That is what makes the editor pay a repair's price rather than a price of
 * its own — `pricing/schedule.test.ts` refuses a second row covering a field already claimed, so
 * reusing these is not merely allowed, it is the only thing the schedule permits.
 */
export function editorPathsOf(state: FixitState): readonly string[] {
  const paths: string[] = [];
  if (state.zoneOverlapFloors > 0) paths.push('building.banks[]');
  if (state.parkingStrategy !== null) paths.push('dispatcher.idle.parkingStrategy');
  return paths;
}

export interface FixitSpend {
  readonly repairUnits: number;
  readonly extraUnits: number;
  /** The editor's machinery: speed and capacity steps at § 9's prices. */
  readonly editorUnits: number;
  readonly totalUnits: number;
  /**
   * The machinery share of the total — the editor's steel plus a selected new shaft. § 10.4's
   * spent row says *"how much of it was machinery"*, and a shaft is machinery wherever it is
   * priced.
   */
  readonly machineryUnits: number;
}

/**
 * What a selection costs — GitHub issue **#366** put the schedule in the signature.
 *
 * The third parameter is the one place this function is allowed to learn a price from. Before, two
 * of the three sums here read module constants and the third read a number authored beside the
 * repair, which is three price lists inside one function.
 */
export function spendOf(
  entry: FixitCase,
  state: FixitState,
  schedule: PriceSchedule,
): FixitSpend {
  const pricing = editorPricingFrom(schedule);
  const repairs = entry.repairs.filter((repair) => state.selectedRepairIds.includes(repair.id));
  const extras = standingExtrasFrom(schedule).filter((extra) =>
    state.selectedExtraIds.includes(extra.id),
  );
  const repairUnits = repairs.reduce((sum, repair) => sum + repair.costUnits, 0);
  const extraUnits = extras.reduce((sum, extra) => sum + extra.costUnits, 0);
  const settingUnits = changesAtPaths(schedule, editorPathsOf(state)).reduce(
    (sum, change) => sum + change.priceUnits,
    0,
  );
  const editorUnits =
    state.speedSteps * pricing.speedUnitsPerHalfMps +
    state.capacitySteps * pricing.capacityUnitsPerTwoPlaces +
    settingUnits;
  const shaftUnits = repairs
    .filter((repair) => repair.role === 'new-shaft')
    .reduce((sum, repair) => sum + repair.costUnits, 0);
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
     * other way round.
     */
    machineryUnits: editorUnits - settingUnits + shaftUnits,
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

export function toggleExtra(
  entry: FixitCase,
  state: FixitState,
  extraId: string,
  schedule: PriceSchedule,
): FixitState {
  const extra = standingExtrasFrom(schedule).find((candidate) => candidate.id === extraId);
  if (extra === undefined) return state;
  if (state.selectedExtraIds.includes(extraId)) {
    return { ...state, selectedExtraIds: state.selectedExtraIds.filter((id) => id !== extraId) };
  }
  if (!affordabilityOf(entry, state, extra.costUnits, schedule).selectable) return state;
  return { ...state, selectedExtraIds: [...state.selectedExtraIds, extraId] };
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
  return priceOf(schedule, 'rezone-bank').priceUnits;
}
export function parkingPriceUnits(schedule: PriceSchedule): number {
  return priceOf(schedule, 'idle-parking').priceUnits;
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
    if (!affordabilityOf(entry, state, zonePriceUnits(schedule), schedule).selectable) return state;
  }
  return { ...state, zoneOverlapFloors: next };
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
 * design, and {@link BASIS_LINE}'s implied *same crowd, twice* would be false under it. This line
 * says what the pair actually is. Chosen from the **measurement** ({@link FixitMeasurement.sameCrowd},
 * read off the legs) rather than from the patch, so the sentence cannot claim a crowd the runs did
 * not have; `run.ts#assertPairMatchesRepairs` then holds the patch and the legs to each other.
 */
export const DEMAND_BASIS_LINE =
  'one run before, one run after — and the repair changed who arrives, so the second run meets a different crowd. Enough to see a repair this size; not enough to split hairs.';

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
}

export type FixitOutcomeKind = 'fixed' | 'building-worse' | 'over-budget' | 'not-enough';

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
  readonly rows: readonly [FixitRow, FixitRow, FixitRow];
  readonly basis: string;
}

/**
 * Whether the case wears the FIXED badge after this run — `docs/20` defect 16's second finding.
 *
 * **A statement about the latest run, never a high-water mark.** The panel latched
 * `session.fixed = true` on the first fixed outcome and nothing cleared it, so a case stayed
 * badged FIXED beside an outcome card reading *"9 waits → 9 waits · 0 % of it went away"* — two
 * verdicts about one case on one screen. The badge and the outcome card now come from the same
 * run.
 *
 * The contrast that makes this a rule rather than a taste: `WeekState.bestMinutePct` *is* a
 * high-water mark, deliberately — it is worded as *an observation about what the building has
 * been seen to do*. FIXED is not an observation about history; it is the rail's summary of
 * *where this case stands*, and a case whose current configuration fails its own complaint does
 * not stand fixed. A player who wants the badge back re-runs the configuration that earned it.
 */
export function fixedBadgeAfter(outcome: FixitOutcome): boolean {
  return outcome.kind === 'fixed';
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
  return measurement.sameCrowd ? BASIS_LINE : DEMAND_BASIS_LINE;
}

export function classifyOutcome(
  entry: FixitCase,
  measurement: FixitMeasurement,
  spend: FixitSpend,
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
    };
  }
  if (complaintRow.passed && restRow.passed) {
    return {
      kind: 'fixed',
      head: entry.result.head,
      body: `${entry.result.body}${spentAnywayClause(entry, spend)}`,
      rows,
      basis: basisOf(measurement),
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
    };
  }
  // *Better* is a claim about the measurement in the row above it. See the docstring.
  const improved = measurement.complaintGonePct !== null && measurement.complaintGonePct > 0;
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
  };
}

/**
 * What the authored *fixed* copy cannot know: that the player bought things anyway — `docs/20`
 * defect 8.
 *
 * ## The sentence this exists to stop being false
 *
 * Two of the shipped cases end their result body with a punchline about the fix having been free:
 * *"**Nothing was bought**: the cars were always enough — they were parked in the wrong place."*
 * That is the best moment in the product and it is true **of the repair**. It is not true of the
 * order: the audit reached it having also ticked 11 u of repairs that changed nothing, and read the
 * punchline directly above a Spent row saying `budget 12 u → 11 u`.
 *
 * ## Why a clause after it rather than an edit to it
 *
 * The body is authored in `data/fixit-cases.json`, per case, in the tenant's voice, and the claim
 * takes a different form in each (*"Nothing was bought — the third car was never the problem"*).
 * Rewriting arbitrary prose from here is not available, and CLAUDE.md invariant 7 puts the copy in
 * `data/` deliberately. What is available is to say the fact the authored sentence is silent about,
 * derived from the spend the same panel is drawing, and to say it **as a correction** so the two
 * sentences read as one statement rather than as a contradiction — *the fix was free; your order was
 * not* is coherent, *nothing was bought / 11 u committed* is not.
 *
 * Empty at zero spend, which is the case the authored punchline was written for and the case the
 * audit's own best moment was: nothing is appended, and the copy comes back byte-identical to what
 * it has always been. So a case whose player bought nothing cannot tell this function exists.
 */
function spentAnywayClause(entry: FixitCase, spend: FixitSpend): string {
  if (spend.totalUnits <= 0) return '';
  const machinery =
    spend.machineryUnits > 0
      ? `, ${String(spend.machineryUnits)} u of it machinery`
      : ', none of it machinery';
  return (
    ` That is about the repair, not about your order: you committed ${String(spend.totalUnits)} of ` +
    `${String(entry.budgetUnits)} u${machinery}, and this run does not say what any of it bought.`
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

function complaintText(kind: 'long-waits' | 'mean-wait', value: number, boarded: number): string {
  return kind === 'long-waits'
    ? `${String(value)} waits`
    : `${value.toFixed(1)} s over ${String(boarded)} boarded journeys`;
}

function awayText(pct: number | null, boarded: number): string {
  return pct === null ? 'nobody rode' : `${pct.toFixed(1)} % of ${String(boarded)} journeys`;
}

/** The repair list rows the panel draws — name, price, effect, and § 10.2's refusal wording. */
export function repairRowOf(
  entry: FixitCase,
  state: FixitState,
  repair: FixitRepair,
  schedule: PriceSchedule,
): {
  readonly selected: boolean;
  readonly selectable: boolean;
  readonly priceLine: string;
  readonly refusal: string | undefined;
} {
  const selected = state.selectedRepairIds.includes(repair.id);
  const affordability = affordabilityOf(entry, state, repair.costUnits, schedule);
  const selectable = selected || affordability.selectable;
  return {
    selected,
    selectable,
    priceLine: repair.costUnits === 0 ? 'free — configuration' : `${String(repair.costUnits)} u`,
    refusal:
      selected || affordability.selectable
        ? undefined
        : `short by ${String(affordability.shortByUnits)} u — beyond a repair budget`,
  };
}
