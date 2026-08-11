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

/** § 10.3's running total note — one of three, decided by what the spend actually is. */
export function budgetNoteOf(entry: FixitCase, spend: FixitSpend): string {
  if (spend.totalUnits > entry.budgetUnits) {
    return 'Over the budget, and this is where the owner stops reading and asks what you can do without buying anything.';
  }
  if (spend.machineryUnits > 0) {
    return 'You are buying machinery — compare it against the free change first.';
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
 * says so. Then the complaint, then the rest — a run that fixed nothing *and* hurt the rest is
 * *"Better, and the complaint still stands"* only when it is actually better, so the not-enough
 * arm is the fall-through rather than a claim.
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
    return { kind: 'fixed', head: entry.result.head, body: entry.result.body, rows, basis: BASIS_LINE };
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
  return {
    kind: 'not-enough',
    head: 'Better, and the complaint still stands.',
    body: 'Change something else and run it again.',
    rows,
    basis: BASIS_LINE,
  };
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
