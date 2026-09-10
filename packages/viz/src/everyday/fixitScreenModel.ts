/**
 * **The Fix-a-building screen's words and cell substitutions, as pure decisions** — GAMEPLAY § 10
 * over `fixit/`'s machinery, split from the DOM for the reason the whole of `everyday/` is split:
 * the words are drivable without a document, and the honesty sweep drives them.
 *
 * ## What this module decides, and what it refuses to
 *
 * It decides **wording**: the case rail's chrome and its `{fixed}/{total}` line, the § 3.3 cells
 * the fixit row leaves state-dependent (the primary's variant, the note, the solved inversion),
 * the machinery steppers' price lines, and the running-total split. It decides **no number and no
 * verdict**: every figure it prints arrives already-worded from `fixit/engine.ts` or
 * `fixit/run.ts` (§ 10.6 — *"Each repair's one-line effect cites a number that is on screen"*,
 * and the screen may cite nothing the engine did not measure), and every numeral this module does
 * interpolate is either the engine's own spend arithmetic or § 9's prices read from
 * the schedule's own figures, passed in — never a literal (GitHub issue #366).
 *
 * ## The copy is the prototype's
 *
 * Every sentence in {@link FIXIT_SCREEN_COPY} is transcribed from
 * `docs/design/elevator-sim-casual.dc.html`'s fixit screen (the `isFixit` block and the § 3.3 bar
 * state around it) — the handoff wins every disagreement about what the screen says. The two § 3.3
 * notes are the prototype's `fixFootNote` pair; the running relabel is `dev/fixitPanel.ts`'s,
 * because the prototype's toy model ran instantly and never needed one.
 */

import type { FixitSpend } from '../fixit/engine.js';
import { EDITOR_PARKING_STRATEGIES } from '../fixit/types.js';
import type { EditorParkingStrategy, FixitCase, FixitState } from '../fixit/types.js';
import type { ActionBarModel } from './actionBar.js';

/**
 * The screen's authored chrome, one frozen object so the honesty sweep renders every sentence.
 *
 * Sources, line by line: `railHeading`, `railHint`, `complaintEyebrow`, `diagnosisEyebrow`,
 * `repairsEyebrow`, `repairsHint`, `machinesEyebrow`, the two tags and `noCapital` are the
 * prototype markup's own cells; `noteReady`/`noteSolved` are its `fixFootNote` pair;
 * `stateSelected`/`stateAffordable` are its repair-row state words (the third state's words —
 * *beyond a repair budget* — arrive inside `fixit/engine.ts#repairRowOf`'s refusal and are not
 * restated here); `asBuiltEyebrow` is § 10.1 item 2's own name for the card, uppercased to the
 * eyebrow register, because the prototype's heading for that region names its elevation editor,
 * which this build deliberately does not draw (see `fixitScreen.ts`).
 */
export const FIXIT_SCREEN_COPY = Object.freeze({
  railHeading: 'BUILDINGS THAT NEED HELP',
  railHint:
    'Each one is a real building with one thing wrong, already diagnosed. Decide what to spend, ' +
    'put it right, and the tenants stop writing letters.',
  complaintEyebrow: 'THE COMPLAINT',
  asBuiltEyebrow: 'THE BUILDING AS IT STANDS',
  /*
   * The as-built run, played before the four figures — GitHub issue #348, `docs/35` PM-FB1. Three
   * strings: the block's eyebrow, the sentence that says the figures below are read off this very
   * run, and the one press. Here rather than in `asBuiltStage.ts` so the corpus sweeps them with the
   * rest of this screen's words.
   */
  asBuiltStageEyebrow: 'WATCH IT AS IT STANDS',
  asBuiltStageNote:
    'The morning the letter is about, as the building runs today. The four figures below are read from this run and no other.',
  asBuiltStageSkip: 'Skip to the figures',
  diagnosisEyebrow: 'THE DIAGNOSIS',
  repairsEyebrow: 'RECONFIGURE IT YOURSELF',
  repairsHint:
    'a repair budget, not a capital one — the big items are priced so you can see why they are ' +
    'not the answer',
  machinesEyebrow: 'THE MACHINES',
  /** The rail tag on a case whose pass conditions have held — § 10.1's `FIXED`. */
  solvedTag: 'FIXED',
  openTag: 'OPEN',
  /** The repair row's state word while selected. The `✓` is the toggle's visible mark. */
  stateSelected: '✓ in the repair',
  stateAffordable: 'within budget',
  /** § 3.3's note for the fixit row — the guide's cell reads `⟨what the run will measure⟩`. */
  noteReady:
    'Runs the same crowd again with everything you have changed, and scores the whole building.',
  noteSolved: 'This one is settled. There are more buildings than you have afternoons.',
  /** `dev/fixitPanel.ts`'s relabel while the synchronous pair computes. */
  runningLabel: 'Running the day…',
  /**
   * Why the primary cannot be pressed while that pair computes — `BarPrimary.inert`'s sentence.
   * The relabel says *what is happening*; a player looking at a dead button is asking *why can I
   * not press this*, and those are different questions (GitHub issue #262).
   */
  runningWhy: 'The pair of days is being simulated. This finishes on its own.',
  loading: 'Loading the case file…',
  emptyFile: 'The case file holds no cases.',
  /** The machinery card's capital split when nothing bought steel — the prototype's own word. */
  noCapital: 'no capital cost',
  speedLabel: 'Rated speed',
  capacityLabel: 'Car capacity',
  /** § 10.3's live cap label, drawn beside a stepper the remaining budget refuses. */
  atBudget: 'at the budget',
  stepUp: 'buy one more step',
  stepDown: 'return one step',
  /** Why *return one step* refuses — nothing has been bought on this row yet. */
  nothingToReturn: 'Nothing bought on this row yet, so there is nothing to give back.',
  /* Section 10.3's zones and service ranges — issue #422. */
  zonesLabel: 'Where the banks overlap',
  zonesNone: 'the boundaries as drawn',
  zonesAtCeiling:
    'The banks already reach as far into each other as this building lets them; the next floor up belongs to no shaft.',
  zonesPriced: 'once, whatever it moves',
  /* Section 10.3's parking. */
  parkingLabel: 'Where idle cars wait',
  parkingStanding: 'as the standing order has it',
  parkingFree: 'no charge — telling a controller where to send an empty car costs nothing',
  parkingStay: 'where each one last stopped',
  parkingLobby: 'back down at the lobby',
  parkingZone: 'in the middle of its own zone',
  /** Why *buy one more step* refuses — § 10.3's budget cap, said on the control. */
  noBudgetLeft: 'The repair budget will not stretch to another step on this row.',
} as const);

/** One case rail row, worded. `towerLine` comes through {@link buildingLineOf}. */
export interface FixitCaseRailRow {
  readonly id: string;
  readonly name: string;
  readonly towerLine: string;
  readonly solved: boolean;
  /** {@link FIXIT_SCREEN_COPY.solvedTag} or {@link FIXIT_SCREEN_COPY.openTag}. */
  readonly tag: string;
  readonly active: boolean;
}

export interface FixitCaseRailModel {
  readonly heading: string;
  /**
   * § 10.1's `4/18 fixed` — derived from {@link rows} by counting, never passed in, so the line
   * cannot disagree with the list under it. `fixitScreenModel.test.ts` holds that both ways.
   */
  readonly count: string;
  readonly rows: readonly FixitCaseRailRow[];
  readonly hint: string;
}

/** The rail row's second line — display name and floor count, the prototype's `tower` cell. */
export function buildingLineOf(name: string, floorCount: number): string {
  return `${name} · ${String(floorCount)} floors`;
}

/**
 * The case rail, worded from the loaded cases and the session's solved set.
 *
 * Nothing here is hardcoded about how many cases the file ships — three today, eighteen when the
 * catalogue lands — because the count is derived from the rows and the rows from the argument.
 */
export function fixitCaseRailModel(
  cases: readonly FixitCase[],
  solvedIds: ReadonlySet<string>,
  selectedId: string | undefined,
  towerLineOf: (entry: FixitCase) => string,
): FixitCaseRailModel {
  const rows: readonly FixitCaseRailRow[] = cases.map((entry) => ({
    id: entry.id,
    name: entry.name,
    towerLine: towerLineOf(entry),
    solved: solvedIds.has(entry.id),
    tag: solvedIds.has(entry.id) ? FIXIT_SCREEN_COPY.solvedTag : FIXIT_SCREEN_COPY.openTag,
    active: entry.id === selectedId,
  }));
  const fixed = rows.filter((row) => row.solved).length;
  return {
    heading: FIXIT_SCREEN_COPY.railHeading,
    count: `${String(fixed)}/${String(rows.length)} fixed`,
    rows,
    hint: FIXIT_SCREEN_COPY.railHint,
  };
}

/** What the screen knows that decides the § 3.3 cells. All four flags are the session's. */
export interface FixitBarView {
  /** A case is open in front of the player — the file loaded and holds one. */
  readonly ready: boolean;
  /** The synchronous pair is computing. */
  readonly running: boolean;
  /** The open case has run at least once this session (§ 10.4's `Run it again`). */
  readonly ran: boolean;
  /** The open case's three rows have held (§ 10.4's `Next building`, and the inversion). */
  readonly solved: boolean;
}

/**
 * § 3.3's fixit row, resolved for the screen's state — the `bar()` refinement `screens.ts`
 * contracts, as a pure function so the substitutions can be driven and tested without a mount.
 *
 * Starts from the row `actionBarFor` resolves and edits exactly the cells the guide leaves
 * state-dependent: the primary picks among the row's own three variants **by index** (never a
 * restated string, so a reworded § 3.3 cell moves here on the same commit), the note replaces the
 * `⟨what the run will measure⟩` placeholder with the prototype's sentence, and a solved case
 * applies the § 3.3 emphasis inversion the row ships uninverted (`actionBar.ts` carries the way
 * out for exactly this refinement).
 *
 * While the pair computes, the primary is relabelled and marked inert —
 * `dev/fixitPanel.ts`'s stated-cost approach, drawn by the shell as a disabled button. Before the
 * case file has loaded the primary is inert too: a filled `Run the day` over no case is a control
 * that silently does nothing.
 */
export function fixitBarModel(base: ActionBarModel, view: FixitBarView): ActionBarModel {
  const [readyLabel, ranLabel, solvedLabel] = base.primary.variants;
  if (view.running) {
    return {
      ...base,
      primary: {
        ...base.primary,
        label: FIXIT_SCREEN_COPY.runningLabel,
        inert: FIXIT_SCREEN_COPY.runningWhy,
      },
      note: FIXIT_SCREEN_COPY.noteReady,
    };
  }
  if (view.solved) {
    return {
      ...base,
      primary: { ...base.primary, label: solvedLabel ?? base.primary.label },
      note: FIXIT_SCREEN_COPY.noteSolved,
      inverted: true,
    };
  }
  return {
    ...base,
    primary: {
      ...base.primary,
      label: (view.ran ? ranLabel : readyLabel) ?? base.primary.label,
      ...(view.ready ? {} : { inert: FIXIT_SCREEN_COPY.loading }),
    },
    note: FIXIT_SCREEN_COPY.noteReady,
  };
}

/** One machinery stepper row, worded. The prices are § 9's, read from the engine. */
export interface FixitMachineryRow {
  readonly key: 'speed' | 'capacity';
  readonly label: string;
  /** What the steps bought so far, in the unit § 9 prices — `+0.5 m/s`, `+2 places`. */
  readonly readout: string;
  /** The price line, with § 10.3's `at the budget` appended while the budget refuses a step. */
  readonly priced: string;
  readonly atBudget: boolean;
  readonly canStepDown: boolean;
}

/**
 * The two machinery rows § 10.3 prices — rated speed and car capacity. Door dwell and the elevation
 * grid are § 10.3 controls this build deliberately does not draw; `fixitScreen.ts`'s docstring
 * carries that scoping and the reason. **Zoning is no longer among them** — it is
 * {@link fixitZoneRow}, issue #422.
 *
 * `canBuySpeed`/`canBuyCapacity` are the engine's affordability answers, passed in rather than
 * recomputed so this module holds no second opinion about what fits in a budget.
 */
export function fixitMachineryRows(
  state: FixitState,
  canBuySpeed: boolean,
  canBuyCapacity: boolean,
  /* The two prices, from `data/price-schedule.json` — GitHub issue #366. Never a literal. */
  pricing: { readonly speedUnitsPerHalfMps: number; readonly capacityUnitsPerTwoPlaces: number },
): readonly [FixitMachineryRow, FixitMachineryRow] {
  const priced = (line: string, atBudget: boolean): string =>
    atBudget ? `${line} · ${FIXIT_SCREEN_COPY.atBudget}` : line;
  return [
    {
      key: 'speed',
      label: FIXIT_SCREEN_COPY.speedLabel,
      readout: `+${(state.speedSteps * 0.5).toFixed(1)} m/s`,
      priced: priced(
        `${String(pricing.speedUnitsPerHalfMps)} u per half a metre per second`,
        !canBuySpeed,
      ),
      atBudget: !canBuySpeed,
      canStepDown: state.speedSteps > 0,
    },
    {
      key: 'capacity',
      label: FIXIT_SCREEN_COPY.capacityLabel,
      readout: `+${String(state.capacitySteps * 2)} places`,
      priced: priced(
        `${String(pricing.capacityUnitsPerTwoPlaces)} u per two places`,
        !canBuyCapacity,
      ),
      atBudget: !canBuyCapacity,
      canStepDown: state.capacitySteps > 0,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Section 10.3's zones and parking — issue #422
 * -------------------------------------------------------------------------- */

/** The zoning stepper, worded. Absent entirely on a building whose ranges cannot be widened. */
export interface FixitZoneRow {
  readonly key: 'zones';
  readonly label: string;
  /** What the overlap buys so far, in floors — or the as-drawn phrase at zero. */
  readonly readout: string;
  readonly priced: string;
  /**
   * Why `+` is refused, or `undefined` while it is live.
   *
   * **Two refusals, never one**, and that is the whole reason this is not `atBudget: boolean` like
   * the machinery rows. A stepper at its building's ceiling with nine units still in hand must not
   * answer *at the budget*: it is the tower that has run out, not the money, and a player reading
   * the wrong one goes looking for a repair to deselect. R3's cue rule on a stepper.
   */
  readonly stepUpRefusal: string | undefined;
  readonly canStepDown: boolean;
}

/**
 * The zoning row, or `null` where the building cannot take one — issue **#422**.
 *
 * `null` is the honest answer on eight of the eighteen shipped cases, every one of them a
 * single-bank building: there is no neighbouring zone to overlap with, so every floor the bank could
 * grow into it already serves. Drawing a stepper there would be a control that writes a field and
 * moves no leg, which is § D219's defect. The ceiling comes from `fixit/run.ts#zoneOverlapCeilingOf`
 * — derived from the run's own resolved building rather than counted here, so this module holds no
 * second opinion about what the fabric allows, exactly as `canBuy` holds none about the budget.
 */
export function fixitZoneRow(
  state: FixitState,
  ceiling: number,
  canBuy: boolean,
  priceUnits: number,
): FixitZoneRow | null {
  if (ceiling <= 0) return null;
  const atCeiling = state.zoneOverlapFloors >= ceiling;
  const atBudget = state.zoneOverlapFloors === 0 && !canBuy;
  const price = `${String(priceUnits)} u ${FIXIT_SCREEN_COPY.zonesPriced}`;
  return {
    key: 'zones',
    label: FIXIT_SCREEN_COPY.zonesLabel,
    readout:
      state.zoneOverlapFloors === 0
        ? FIXIT_SCREEN_COPY.zonesNone
        : `+${String(state.zoneOverlapFloors)} ${state.zoneOverlapFloors === 1 ? 'floor' : 'floors'} each side`,
    priced: atBudget ? `${price} · ${FIXIT_SCREEN_COPY.atBudget}` : price,
    stepUpRefusal: atCeiling
      ? FIXIT_SCREEN_COPY.zonesAtCeiling
      : atBudget
        ? FIXIT_SCREEN_COPY.noBudgetLeft
        : undefined,
    canStepDown: state.zoneOverlapFloors > 0,
  };
}

/** One choice on the parking select. `value` is `null` for *leave it as the building has it*. */
export interface FixitParkingOption {
  readonly value: EditorParkingStrategy | null;
  readonly label: string;
  readonly selected: boolean;
}

/** The parking select, worded. */
export interface FixitParkingRow {
  readonly key: 'parking';
  readonly label: string;
  readonly priced: string;
  readonly options: readonly FixitParkingOption[];
}

/**
 * The parking row — issue **#422**.
 *
 * **The strategy the case already runs is not offered**, which is what `standing` is for. Measured
 * on `zoning-starves-the-top`, whose standing order is `stay`: selecting `stay` moves not one leg,
 * because it writes the value the run already carries. An option that cannot change the run is the
 * inert control § D219 names, and a select is no safer a place to keep one than a slider is. The
 * `null` choice already says *leave it alone*, so nothing is lost by dropping the duplicate.
 *
 * **No engine identifier reaches the player** (GAMEPLAY § 16 rule 11): `zone-center` is drawn as
 * *in the middle of its own zone*. The words are `FIXIT_SCREEN_COPY`'s, where the honesty sweep
 * reads them.
 */
export function fixitParkingRow(
  state: FixitState,
  standing: string,
  priceUnits: number,
): FixitParkingRow {
  const words: Readonly<Record<EditorParkingStrategy, string>> = {
    stay: FIXIT_SCREEN_COPY.parkingStay,
    lobby: FIXIT_SCREEN_COPY.parkingLobby,
    'zone-center': FIXIT_SCREEN_COPY.parkingZone,
  };
  const options: FixitParkingOption[] = [
    {
      value: null,
      label: FIXIT_SCREEN_COPY.parkingStanding,
      selected: state.parkingStrategy === null,
    },
  ];
  for (const strategy of EDITOR_PARKING_STRATEGIES) {
    if (strategy === standing) continue;
    options.push({
      value: strategy,
      label: words[strategy],
      selected: state.parkingStrategy === strategy,
    });
  }
  return {
    key: 'parking',
    label: FIXIT_SCREEN_COPY.parkingLabel,
    /*
     * The price is drawn from the schedule and the sentence beside it is only reached at zero, which
     * is what every shipped list prices `idle-parking` at. A row that said *no charge* over a
     * non-zero figure would be the stale refusal § D227 is about, so the arm is keyed on the number.
     */
    priced:
      priceUnits === 0 ? FIXIT_SCREEN_COPY.parkingFree : `${String(priceUnits)} u`,
    options,
  };
}

/**
 * The running total, split the way the prototype splits it: the repairs strip quotes what the
 * toggles have **spent**, the machinery card quotes what the whole order has **committed** and
 * how much of that is steel. Both sums are the engine's ({@link FixitSpend}); the note beside
 * them is `fixit/engine.ts#budgetNoteOf`'s and is not restated here.
 */
export interface FixitSpendSummary {
  /** The repairs strip's right edge — toggles only, the prototype's `fixBudgetLine`. */
  readonly spentLine: string;
  /** The machinery card's total — everything, the prototype's `fixEditTotal`. */
  readonly committedLine: string;
  /** The machinery card's capital split — the prototype's `fixEditCapital`. */
  readonly capitalLine: string;
  readonly overBudget: boolean;
}

export function fixitSpendSummary(entry: FixitCase, spend: FixitSpend): FixitSpendSummary {
  return {
    spentLine: `${String(spend.repairUnits + spend.extraUnits)} of ${String(entry.budgetUnits)} units spent`,
    committedLine: `${String(spend.totalUnits)} of ${String(entry.budgetUnits)} u committed`,
    capitalLine:
      spend.machineryUnits === 0
        ? FIXIT_SCREEN_COPY.noCapital
        : `${String(spend.machineryUnits)} u of steel`,
    overBudget: spend.totalUnits > entry.budgetUnits,
  };
}

/**
 * The repair row's state line — § 10.2's third word arrives as the engine's refusal (*short by
 * 22 u — beyond a repair budget*), the other two are the prototype's, and the selected one
 * carries the toggle's visible mark.
 */
export function fixitRepairStateLine(row: {
  readonly selected: boolean;
  readonly refusal: string | undefined;
}): string {
  if (row.selected) return FIXIT_SCREEN_COPY.stateSelected;
  return row.refusal ?? FIXIT_SCREEN_COPY.stateAffordable;
}
