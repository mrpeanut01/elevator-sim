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
 * per 2 places, dwell/zones/service ranges/parking free — and § 10.4's three pass rows. The
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

import type { FixitCase, FixitExtra, FixitRepair, FixitState } from './types.js';

/** § 9's editor pricing. Dwell, zones, service ranges and parking are free — configuration. */
export const EDITOR_PRICING = Object.freeze({
  shaftUnits: 34,
  speedUnitsPerHalfMps: 6,
  capacityUnitsPerTwoPlaces: 8,
});

/**
 * The five standing extras — offered in every case, none of them a fix, so the budget can be
 * spent badly (§ 10.2). They carry **no patch**, and `cases.test.ts` holds the refusal the other
 * way round: selecting every extra leaves the as-repaired run byte-identical to the as-built one.
 */
export const STANDING_EXTRAS: readonly FixitExtra[] = Object.freeze([
  {
    id: 'traffic-survey',
    name: 'A traffic survey',
    costUnits: 3,
    line: 'A week of counts, confirming what the figures on this page already show.',
  },
  {
    id: 'landing-indicators',
    name: 'Landing indicators',
    costUnits: 4,
    line: 'Tenants see the car coming. The car does not come sooner.',
  },
  {
    id: 'car-interiors',
    name: 'New car interiors',
    costUnits: 5,
    line: 'The wait feels shorter. It is not.',
  },
  {
    id: 'call-out-cover',
    name: 'Call-out cover',
    costUnits: 6,
    line: 'Somebody arrives faster when it breaks. Nothing here is broken.',
  },
  {
    id: 'tenant-notices',
    name: 'Tenant notices',
    costUnits: 1,
    line: 'A letter about the works. The letter is not the works.',
  },
]);

/** Nothing selected, nothing bought. */
export function emptyFixitState(): FixitState {
  return { selectedRepairIds: [], selectedExtraIds: [], speedSteps: 0, capacitySteps: 0 };
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

export function spendOf(entry: FixitCase, state: FixitState): FixitSpend {
  const repairs = entry.repairs.filter((repair) => state.selectedRepairIds.includes(repair.id));
  const extras = STANDING_EXTRAS.filter((extra) => state.selectedExtraIds.includes(extra.id));
  const repairUnits = repairs.reduce((sum, repair) => sum + repair.costUnits, 0);
  const extraUnits = extras.reduce((sum, extra) => sum + extra.costUnits, 0);
  const editorUnits =
    state.speedSteps * EDITOR_PRICING.speedUnitsPerHalfMps +
    state.capacitySteps * EDITOR_PRICING.capacityUnitsPerTwoPlaces;
  const shaftUnits = repairs
    .filter((repair) => repair.role === 'new-shaft')
    .reduce((sum, repair) => sum + repair.costUnits, 0);
  return {
    repairUnits,
    extraUnits,
    editorUnits,
    totalUnits: repairUnits + extraUnits + editorUnits,
    machineryUnits: editorUnits + shaftUnits,
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
): { readonly selectable: boolean; readonly shortByUnits: number } {
  const total = spendOf(entry, state).totalUnits + costUnits;
  const shortBy = total - entry.budgetUnits;
  return { selectable: shortBy <= 0, shortByUnits: Math.max(0, shortBy) };
}

/**
 * Toggle a repair. Selecting one the budget cannot take returns the state unchanged — the panel
 * never offers the press ({@link affordabilityOf} disables it), and a reducer that trusted the
 * panel would be one mis-wired button away from an over-budget run.
 */
export function toggleRepair(entry: FixitCase, state: FixitState, repairId: string): FixitState {
  const repair = entry.repairs.find((candidate) => candidate.id === repairId);
  if (repair === undefined) return state;
  if (state.selectedRepairIds.includes(repairId)) {
    return { ...state, selectedRepairIds: state.selectedRepairIds.filter((id) => id !== repairId) };
  }
  if (!affordabilityOf(entry, state, repair.costUnits).selectable) return state;
  return { ...state, selectedRepairIds: [...state.selectedRepairIds, repairId] };
}

export function toggleExtra(entry: FixitCase, state: FixitState, extraId: string): FixitState {
  const extra = STANDING_EXTRAS.find((candidate) => candidate.id === extraId);
  if (extra === undefined) return state;
  if (state.selectedExtraIds.includes(extraId)) {
    return { ...state, selectedExtraIds: state.selectedExtraIds.filter((id) => id !== extraId) };
  }
  if (!affordabilityOf(entry, state, extra.costUnits).selectable) return state;
  return { ...state, selectedExtraIds: [...state.selectedExtraIds, extraId] };
}

/** Buy or return one +0.5 m/s step. Capped live at what the remaining budget allows (§ 10.3). */
export function stepSpeed(entry: FixitCase, state: FixitState, delta: 1 | -1): FixitState {
  const next = state.speedSteps + delta;
  if (next < 0) return state;
  if (delta > 0 && !affordabilityOf(entry, state, EDITOR_PRICING.speedUnitsPerHalfMps).selectable) {
    return state;
  }
  return { ...state, speedSteps: next };
}

/** Buy or return one +2-place step. Same cap, § 9's other price. */
export function stepCapacity(entry: FixitCase, state: FixitState, delta: 1 | -1): FixitState {
  const next = state.capacitySteps + delta;
  if (next < 0) return state;
  if (delta > 0 && !affordabilityOf(entry, state, EDITOR_PRICING.capacityUnitsPerTwoPlaces).selectable) {
    return state;
  }
  return { ...state, capacitySteps: next };
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
      basis: BASIS_LINE,
    };
  }
  if (complaintRow.passed && restRow.passed) {
    return {
      kind: 'fixed',
      head: entry.result.head,
      body: `${entry.result.body}${spentAnywayClause(entry, spend)}`,
      rows,
      basis: BASIS_LINE,
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
      basis: BASIS_LINE,
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
    basis: BASIS_LINE,
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
): {
  readonly selected: boolean;
  readonly selectable: boolean;
  readonly priceLine: string;
  readonly refusal: string | undefined;
} {
  const selected = state.selectedRepairIds.includes(repair.id);
  const affordability = affordabilityOf(entry, state, repair.costUnits);
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
