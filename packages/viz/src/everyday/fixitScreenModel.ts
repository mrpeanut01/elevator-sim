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
 * ## The menu has retired, and three of these words went with it — [§ D1020](../../../../DECISIONS.md)
 *
 * `docs/38` § 2.1 retires *"the four-repair menu and the five decoys … and with them the printed
 * line that says what kind of fix it is"*, and [§ D706](../../../../DECISIONS.md) conditioned that on
 * an editor that could write every answer and on a judge that could say whether one had. § D1000
 * built the first and § D1020 the second, so the retirement landed on § D1020's commit:
 * `repairsEyebrow`, `repairsHint`, `stateSelected` and `stateAffordable` are gone with the toggle
 * grid they labelled, and the kind-of-fix sentence left the eighteen `asBuilt.note`s on the same
 * commit. `diagnosisEyebrow` stays, because § D706 clause 5 keeps the diagnosis — what went is the
 * menu of answers under it. The repairs stay in `data/fixit-cases.json`: the diagnosed one is each
 * case's pinned witness and the others are priced negative controls, and nothing draws either.
 *
 * **The answer key had already gone** — GitHub issue **#566**, [§ D869](../../../../DECISIONS.md) —
 * which is why the grid, while it lasted, drew four unmarked rows in a hashed order.
 *
 * ## The copy is the prototype's
 *
 * Every sentence in {@link FIXIT_SCREEN_COPY} is transcribed from
 * `docs/design/elevator-sim-casual.dc.html`'s fixit screen (the `isFixit` block and the § 3.3 bar
 * state around it) — the handoff wins every disagreement about what the screen says. The two § 3.3
 * notes are the prototype's `fixFootNote` pair; the running relabel is `dev/fixitPanel.ts`'s,
 * because the prototype's toy model ran instantly and never needed one.
 */

import {
  rowsBoughtOf,
  standingExtrasFrom,
  witnessStateOf,
  type FixitSpend,
  type FixitVerdictContext,
} from '../fixit/engine.js';
import type { PriceSchedule } from '../pricing/types.js';
import type {
  DialGroupInput,
  DoorInput,
  EditorInputs,
  RezoneInput,
  RowPurchase,
  TenancyInput,
} from '../fixit/editorInputs.js';
import { EDITOR_PARKING_STRATEGIES, EVERY_CAR, KEYED_BANK, OUT_OF_SERVICE } from '../fixit/types.js';
import type { DialValue, EditorParkingStrategy, FixitCase, FixitExtra, FixitState } from '../fixit/types.js';
import { DIAGNOSIS_OPEN_BELOW, type RouteCensusRow } from '../fixit/routeCensus.js';
import type { ActionBarModel } from './actionBar.js';
/* The currency's own words, from `data/chime-ledger.json` — § D530 authors them and no screen may. */
import { CHIME_PRICES } from './chimesPanel.js';

/**
 * The screen's authored chrome, one frozen object so the honesty sweep renders every sentence.
 *
 * Sources, line by line: `railHeading`, `railHint`, `complaintEyebrow`, `diagnosisEyebrow`,
 * `machinesEyebrow`, the two tags and `noCapital` are the prototype markup's own cells;
 * `noteReady`/`noteSolved` are its `fixFootNote` pair; the menu's cells — its eyebrow, its hint and
 * its two row-state words — retired with the menu ([§ D1020](../../../../DECISIONS.md)); `asBuiltEyebrow` is § 10.1 item 2's own name for the card, uppercased to the
 * eyebrow register, because the prototype's heading for that region names its elevation editor —
 * the per-shaft, per-floor-band click-to-set grid § 10.1 item 6 asks for, which this build still
 * deliberately does not draw (see `fixitScreen.ts`). What *is* drawn now is narrower: one control
 * that raises the building's topmost floor, issue #422.
 */
export const FIXIT_SCREEN_COPY = Object.freeze({
  railHeading: 'BUILDINGS THAT NEED HELP',
  /*
   * *"already diagnosed"* left this line on [§ D1120](../../../../DECISIONS.md)'s commit: the diagnosis
   * is held back until a player asks for it, so the list no longer promises one on every case.
   */
  railHint:
    'Each one is a real building with one thing wrong. Decide what to spend, put it right, and the ' +
    'tenants stop writing letters. The diagnosis is there if you ask for it.',
  complaintEyebrow: 'THE COMPLAINT',
  asBuiltEyebrow: 'THE BUILDING AS IT STANDS',
  /*
   * The as-built run, played before the four figures — GitHub issue #348, `docs/35` PM-FB1. Three
   * strings: the block's eyebrow, the sentence that says the figures below are read off this very
   * run, and the one press. Here rather than in `caseStage.ts` so the corpus sweeps them with the
   * rest of this screen's words.
   */
  asBuiltStageEyebrow: 'WATCH IT AS IT STANDS',
  asBuiltStageNote:
    'The morning the letter is about, as the building runs today. The four figures below are read from this run and no other.',
  asBuiltStageSkip: 'Skip to the figures',
  /*
   * The bank view's label, on both played blocks — `caseStage.ts#CaseStageInput.banks`. Drawn only
   * where the whole tower's car readouts do not fit a pane, so the first clause is true wherever it
   * is read; the select beside it opens on `STAGE_CAMERAS`' own *Whole tower*, the stage's word for
   * the same picture.
   */
  stageBankView: 'Too many cars to read at this size. Show one bank:',
  /*
   * The pair, played after a press — [§ D644](../../../../DECISIONS.md). Five strings: the block's
   * eyebrow, the sentence saying what the two panes are and where the verdict under them comes
   * from, the one press, and a caption over each canvas. Here rather than in `caseStage.ts` for the
   * reason the three above are: the corpus sweeps this screen's words and not that mount's.
   *
   * **The note carries no figure, and that is deliberate rather than incidental.** This block sits
   * directly above the outcome card, which is the surface allowed to state what the pair measured
   * (`fixit/engine.ts#classifyOutcome`, with each row's before and after and the basis line under
   * them). A number here would be a second place for one measurement to be published, and the
   * second place is the one that goes stale — § D227's class, and the reason `docs/22` § 5 forbids
   * a figure without its count rather than only a wrong figure.
   */
  pairStageEyebrow: 'WATCH WHAT YOU CHANGED',
  pairStageNote:
    'The same morning and the same crowd, played once on each building — as it stands on the left, ' +
    'with your change on the right. The verdict below starts from these two runs, and a change that clears this morning is then run on forty-nine more before it is called fixed.',
  pairStageSkip: 'Skip to the verdict',
  pairStageBeforeCaption: 'As it stands',
  pairStageAfterCaption: 'With your change',
  diagnosisEyebrow: 'THE DIAGNOSIS',
  /*
   * **The diagnosis, withheld until asked** — [§ D1120](../../../../DECISIONS.md) clause 1. A free
   * press, never sold: `docs/38` § 2.4 spends chimes on modifiers and never on access, and a hint is
   * access. Its use is marked on the case row, which is the only thing it costs.
   */
  diagnosisShow: 'Show the diagnosis',
  diagnosisWithheld:
    'Held back, so the search is yours. Asking costs nothing, and the case is then marked as fixed with the diagnosis rather than on your own.',
  /*
   * The hint is **the measured witness**, never the mechanism story: which priced change the case's
   * diagnosed repair buys, and that it was run and held. `fixitDiagnosisView` composes the rows in.
   * The authored explanation — `diagnosis.text` and `.reasoning`, which say why — is printed only
   * once a fixed verdict stands on the diagnosed repair's own run (§ D1011's rule, one card along).
   */
  diagnosisHintLead: 'What has been measured to fix it is a change bought as',
  diagnosisHintNote:
    'Measured, not explained: that change clears the letter’s morning and holds across the forty-nine other mornings. Which setting to move, and how far, is still yours to find.',
  /* The case row's standing mark — § D1120 clause 1. Not currency: it pays and costs nothing. */
  markOnOwn: 'on your own',
  markWithDiagnosis: 'with the diagnosis',
  markDiagnosisShown: 'diagnosis shown',
  machinesEyebrow: 'THE MACHINES',
  /** The rail tag on a case whose pass conditions have held — § 10.1's `FIXED`. */
  solvedTag: 'FIXED',
  openTag: 'OPEN',
  /** § 3.3's note for the fixit row — the guide's cell reads `⟨what the run will measure⟩`. */
  noteReady:
    'Runs the same crowd again with everything you have changed, and scores the whole building.',
  noteSolved: 'This one is settled. There are more buildings than you have afternoons.',
  /*
   * **A verdict that no longer describes the order on screen** — [§ D1011](../../../../DECISIONS.md),
   * assessor C's D6. Drawn over the outcome card the moment the order moves away from the one the
   * verdict was measured on, and the Run press comes back beside it. The verdict is kept rather than
   * cleared, because it is still a true statement about the order that was run; what it is not is a
   * statement about this one, and the sentence says exactly that.
   */
  verdictStale:
    'You have changed the order since this verdict. It describes the order you ran, not the one on screen now — run the day again to see this one.',
  /** `dev/fixitPanel.ts`'s relabel while the synchronous pair computes. */
  runningLabel: 'Running the day…',
  /**
   * Why the primary cannot be pressed while that pair computes — `BarPrimary.inert`'s sentence.
   * The relabel says *what is happening*; a player looking at a dead button is asking *why can I
   * not press this*, and those are different questions (GitHub issue #262).
   */
  runningWhy: 'The pair of days is being simulated. This finishes on its own.',
  /*
   * [§ D1020](../../../../DECISIONS.md): the letter's morning cleared and the same order is running
   * on the forty-nine derived mornings. The relabel says what is happening and the inert sentence
   * why the press waits — GitHub issue #262's two questions, asked of a longer wait.
   */
  checkingLabel: 'Checking it on 49 more mornings…',
  checkingWhy:
    'It cleared on the letter’s morning, and one morning can be luck. The same order is running on forty-nine more; this finishes on its own.',
  /*
   * [§ D1120](../../../../DECISIONS.md) clause 4: the controls stay editable while the mornings run.
   * An edit makes the pending verdict stale (`verdictStale` above), and the press comes back with this
   * note, because pressing it stops the check on the last order — the latest ask wins, and a check
   * that is stopped has no verdict.
   */
  noteSupersedes: 'Runs the order on screen now. The check still running on the last one stops there, with no verdict.',
  /* What the controls say while the mornings run, beside the live count. */
  checkingEditable: 'You can keep changing the order while it checks. The verdict below is about the order you ran.',
  /*
   * A case held from the list — § D1020. Its own reason is drawn beside the tag, and the reason is
   * `fixit/held.ts`'s, where the measurement that holds it is recorded.
   */
  heldTag: 'HELD',
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
  /* § D1000: the two strategies the select withheld on reasons that stopped being true. */
  parkingForecast: 'where the next calls are forecast to come from',
  parkingFixedFloor: 'at one floor you name',
  /*
   * § D1000's five families. The dials' own names and ends are `core`'s, beside the rows that
   * declare them (GitHub issue #147); what is here is the frame around them.
   */
  dialsEyebrow: 'THE STANDING ORDER',
  dialsHint:
    'Every setting the controller holds, grouped by what the owner charges for it. One charge covers a whole group, however many of its settings you move.',
  dialStanding: 'as it stands',
  /*
   * § D1020's UX items. The cost-term weights fold under one heading, identically on every case —
   * no shipped answer lives in them, and a fold that never varies with the case carries no
   * information about which dial is the answer (`docs/38` § 2.1's line is not rebuilt out of layout).
   */
  weightsFold: 'The rest of the standing order — how the controller weighs one car against another',
  dialOn: 'yes',
  dialOff: 'no',
  groupPricedOnce: 'once for the group',
  groupAtBudget: 'the repair budget will not stretch to this group',
  doorLabel: 'Door hold',
  doorTargetLabel: 'on',
  doorEveryCar: 'every car',
  doorHallLabel: 'answering a landing call',
  doorCarLabel: 'for riders already aboard',
  doorStanding: 'as the car has it',
  rezoneEyebrow: 'THE BANKS',
  rezoneHint:
    'Which bank each car runs in, and which floors each bank stops at. One rezone is one charge, however much of it you redraw.',
  rezoneCarLabel: 'runs in',
  rezoneKeyed: 'a bank of its own',
  rezoneOut: 'out of service',
  rezoneOutForWorks: 'out for works',
  rezoneFloorsLabel: 'stops at',
  rezoneFloorServed: 'stops here',
  rezoneFloorPassed: 'passes by',
  rezonePairedNote: 'A double-deck bank stops at floors in pairs, and its pairs are not redrawn here.',
  plateLabel: 'Weighs its load against',
  plateAsSet: 'the setting it has now',
  platePlate: 'the car’s own plate',
  /*
   * § D1001's tenancy row, drawn on every case. The sentence for a case with no movable crowd says
   * what is true of it — its cases author no cohort — and nothing about where else to look.
   */
  tenancyEyebrow: 'THE TENANCIES',
  tenancyNone:
    'Nobody here has a start time the owner can ask them to move, so this row has nothing to stagger.',
  tenancyAsItStands: 'as it stands — everyone on the same clock',
  tenancyPricedEach: 'a tenancy',
  /**
   * What the player reads when a run throws — [§ D1160](../../../../DECISIONS.md), the post-AJ panel's seat C D1. A
   * throw here is a fault in the game rather than in the order (the one seat C met was a crowd
   * check refusing a zoning step it should have allowed), so the raw message, which named
   * passengers and floating-point arrival times, never reaches the page: it rides on the
   * paragraph's `data-fault` for a bug report, and the words say what the player can do.
   */
  runFailed:
    'the run stopped on a fault in the game rather than in your order, so there is no verdict and nothing is banked. Try the order again, or a different one.',
  planRefused:
    'The building would not run as drawn — a bank may have been left with no car, or with one floor to stop at. Put the last change back and run again.',
  /** Why *buy one more step* refuses — § 10.3's budget cap, said on the control. */
  noBudgetLeft: 'The repair budget will not stretch to another step on this row.',
  /* Section 10.3's elevation — issue #422. */
  elevationLabel: 'The top floor',
  elevationNone: 'as the building draws it',
  elevationAtCeiling: 'This is as far as a repair budget moves a floor; a bigger rise is a capital project.',
  elevationPriced: 'once, however far it moves',
  /*
   * **The one thing on this screen bought with chimes rather than units** — GitHub issue **#579**,
   * [§ D911](../../../../DECISIONS.md), `docs/38` § 2.1's *"A wider budget can be bought … in steps
   * the scenario authors"*.
   *
   * Four sentences and a label, and the care in them is about **which currency is which**. Units
   * are the owner's money inside this case and chimes are what finishing turns pays; a row that
   * blurred them would be the one thing [§ D530](../../../../DECISIONS.md) picked the name against.
   * So the label says *the owner will stretch to*, the price says *chimes*, and no sentence here
   * puts the two on one side of an equals sign.
   *
   * **No figure is written into any of these strings.** The units and the price are composed beside
   * them from `data/fixit-cases.json`'s own rung, for `chimesPanel.ts#purseOffer`'s reason: one
   * authority for what a step buys, and a copy of it in prose would be a second.
   */
  budgetRungLabel: 'What the owner will stretch to',
  /** What buying it does, said before the press. */
  budgetRungOffer:
    'Ask the owner for more, out of what finishing things has paid you. The building does not ' +
    'change and neither does what counts as fixed \u2014 you can just afford more of it.',
  /** And once it is bought, which is the same sentence in the past tense. */
  budgetRungOwned: 'The owner stretched. This is as far as this case goes.',
  /** The tally will not cover it. The shortfall is composed beside this, never inside it. */
  budgetRungShortLead: 'Short by',
  /** Nothing has paid a chime yet, so there is nothing to ask with. */
  budgetRungNone:
    'Finish something \u2014 a case like this one, a contract day, a rush \u2014 and this is what ' +
    'the chimes it pays are for.',
} as const);

/** One case rail row, worded. `towerLine` comes through {@link buildingLineOf}. */
export interface FixitCaseRailRow {
  readonly id: string;
  readonly name: string;
  readonly towerLine: string;
  readonly solved: boolean;
  /** {@link FIXIT_SCREEN_COPY.solvedTag}, {@link FIXIT_SCREEN_COPY.openTag} or {@link FIXIT_SCREEN_COPY.heldTag}. */
  readonly tag: string;
  readonly active: boolean;
  /**
   * Why the case is held from the list, or `undefined` for a case that is offered — § D1020. A held
   * row is drawn with its reason and cannot be opened; it is never silently dropped.
   */
  readonly heldReason?: string | undefined;
  /**
   * **Whether the diagnosis played a part**, said on the row — [§ D1120](../../../../DECISIONS.md)
   * clause 1: *on your own* or *with the diagnosis* on a fixed case, *diagnosis shown* on an open one
   * the player asked about, and nothing otherwise. A standing mark, never a price.
   */
  readonly mark?: string | undefined;
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
  heldReasonOf: (caseId: string) => string | undefined = () => undefined,
  diagnosisShownOf: (caseId: string) => boolean = () => false,
): FixitCaseRailModel {
  const rows: readonly FixitCaseRailRow[] = cases.map((entry) => {
    const heldReason = heldReasonOf(entry.id);
    const solved = heldReason === undefined && solvedIds.has(entry.id);
    const shown = heldReason === undefined && diagnosisShownOf(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      towerLine: towerLineOf(entry),
      solved,
      tag:
        heldReason !== undefined
          ? FIXIT_SCREEN_COPY.heldTag
          : solved
            ? FIXIT_SCREEN_COPY.solvedTag
            : FIXIT_SCREEN_COPY.openTag,
      active: entry.id === selectedId,
      heldReason,
      mark:
        heldReason !== undefined
          ? undefined
          : solved
            ? shown
              ? FIXIT_SCREEN_COPY.markWithDiagnosis
              : FIXIT_SCREEN_COPY.markOnOwn
            : shown
              ? FIXIT_SCREEN_COPY.markDiagnosisShown
              : undefined,
    };
  });
  const fixed = rows.filter((row) => row.solved).length;
  /* Out of the cases offered: a held case is not one the player can fix, so it is not in the total. */
  const offered = rows.filter((row) => row.heldReason === undefined).length;
  return {
    heading: FIXIT_SCREEN_COPY.railHeading,
    count: `${String(fixed)}/${String(offered)} fixed`,
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
  /**
   * The letter's morning cleared and the other forty-nine are running — [§ D1020](../../../../DECISIONS.md).
   * Only meaningful while {@link running}; optional so a caller that predates the judge reads as
   * not checking.
   */
  readonly checking?: boolean;
  /**
   * A check is running on an order the player has since edited — [§ D1120](../../../../DECISIONS.md)
   * clause 4. The press comes back, and its note says pressing it stops that check. Meaningful only
   * while {@link running} is false.
   */
  readonly supersedes?: boolean;
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
        label: view.checking === true ? FIXIT_SCREEN_COPY.checkingLabel : FIXIT_SCREEN_COPY.runningLabel,
        inert: view.checking === true ? FIXIT_SCREEN_COPY.checkingWhy : FIXIT_SCREEN_COPY.runningWhy,
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
    note: view.supersedes === true ? FIXIT_SCREEN_COPY.noteSupersedes : FIXIT_SCREEN_COPY.noteReady,
  };
}

/* -------------------------------------------------------------------------- *
 * The diagnosis card — withheld, shown as the measured witness, or explained
 * -------------------------------------------------------------------------- */

/**
 * The diagnosis card, worded — [§ D1120](../../../../DECISIONS.md) clause 1.
 *
 * - **`withheld`**: the default. A press, free, and the sentence saying what asking costs (a mark).
 * - **`shown`**: the player asked, or the case's census shows fewer than
 *   `fixit/routeCensus.ts#DIAGNOSIS_OPEN_BELOW` routes clearing the letter's morning, in which case
 *   {@link FixitDiagnosisView.because} says so with the census's own two counts. The text is the
 *   **measured witness**: the priced rows the diagnosed repair buys, and that it clears and holds —
 *   never the authored mechanism story.
 * - **`explained`**: a fixed verdict stands on the diagnosed repair's own run, leg for leg, so the
 *   authored result has already been printed (§ D1011) and the authored diagnosis beside it is true
 *   of the run on screen. Only then.
 */
export interface FixitDiagnosisView {
  readonly state: 'withheld' | 'shown' | 'explained';
  readonly eyebrow: string;
  /** The press on a withheld card. */
  readonly press?: string | undefined;
  readonly text?: string | undefined;
  readonly note: string;
  /** Why a case opened with its diagnosis shown, with the census's counts. */
  readonly because?: string | undefined;
}

/** *"… of the 34 single changes tried on this case, one cleared the letter's morning."* */
export function diagnosisOpenedBecauseOf(census: RouteCensusRow): string {
  const cleared = census.clearing === 0 ? 'none' : census.clearing === 1 ? 'only one' : String(census.clearing);
  return (
    `Shown from the start: of the ${String(census.routes)} single changes tried on this case, ${cleared} ` +
    'cleared the letter’s morning, so this case opens with its diagnosis.'
  );
}

/** The hint's sentence: the diagnosed repair's schedule rows, in the schedule's own names. */
export function diagnosisHintTextOf(entry: FixitCase, schedule: PriceSchedule): string {
  const rows = rowsBoughtOf(entry, witnessStateOf(entry), schedule);
  const named = rows.map((name) => `“${name}”`);
  const joined = named.length <= 1 ? (named[0] ?? '') : `${named.slice(0, -1).join(', ')} and ${named.at(-1) ?? ''}`;
  return `${FIXIT_SCREEN_COPY.diagnosisHintLead} ${joined}.`;
}

export function fixitDiagnosisView(input: {
  readonly entry: FixitCase;
  readonly schedule: PriceSchedule;
  /** The player pressed *Show the diagnosis* on this case, in this sitting or a kept one. */
  readonly asked: boolean;
  /** The case's route census row, or `undefined` for a case the census does not cover. */
  readonly census: RouteCensusRow | undefined;
  /** A fixed verdict stands on the diagnosed repair's own run, for the order on screen. */
  readonly explained: boolean;
}): FixitDiagnosisView {
  const eyebrow = FIXIT_SCREEN_COPY.diagnosisEyebrow;
  if (input.explained) {
    return { state: 'explained', eyebrow, text: input.entry.diagnosis.text, note: input.entry.diagnosis.reasoning };
  }
  const opens = input.census !== undefined && input.census.clearing < DIAGNOSIS_OPEN_BELOW;
  if (input.asked || opens) {
    return {
      state: 'shown',
      eyebrow,
      text: diagnosisHintTextOf(input.entry, input.schedule),
      note: FIXIT_SCREEN_COPY.diagnosisHintNote,
      because: opens && input.census !== undefined ? diagnosisOpenedBecauseOf(input.census) : undefined,
    };
  }
  return { state: 'withheld', eyebrow, press: FIXIT_SCREEN_COPY.diagnosisShow, note: FIXIT_SCREEN_COPY.diagnosisWithheld };
}

/**
 * The line a stopped check leaves — [§ D1120](../../../../DECISIONS.md) clause 4, S1's sentence:
 * a press made while the last order was still being checked stops that check, which then has no
 * verdict, and says so with the count it reached.
 */
export function checkStoppedLineOf(landed: number, planned: number): string {
  return `The check on your last order stopped at ${String(landed)} of ${String(planned)} mornings when you ran this one, and it has no verdict.`;
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
 * The two machinery rows § 10.3 prices — rated speed and car capacity. Door dwell and § 10.1 item
 * 6's elevation *grid* (the per-shaft, per-floor-band click-to-set control) are § 10.3 controls this
 * build deliberately does not draw; `fixitScreen.ts`'s docstring carries that scoping and the
 * reason. **Zoning is no longer among them** — it is {@link fixitZoneRow}, issue #422 — and **nor
 * is the narrower elevation control** that raises the topmost floor — it is
 * {@link fixitElevationRow}, the same issue.
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
  const words = PARKING_WORDS;
  const options: FixitParkingOption[] = [
    {
      value: null,
      /*
       * § D1020: the standing strategy, named, where this screen has a word for it — *as it stands —
       * back down at the lobby* rather than *as the standing order has it*, which hid the one thing
       * a diagnosis about parking quotes.
       */
      label: (EDITOR_PARKING_STRATEGIES as readonly string[]).includes(standing)
        ? `${FIXIT_SCREEN_COPY.dialStanding} — ${words[standing as EditorParkingStrategy]}`
        : FIXIT_SCREEN_COPY.parkingStanding,
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

/** Each parking strategy in the select's own words — one table for the select and the verdict. */
const PARKING_WORDS: Readonly<Record<EditorParkingStrategy, string>> = Object.freeze({
  stay: FIXIT_SCREEN_COPY.parkingStay,
  lobby: FIXIT_SCREEN_COPY.parkingLobby,
  'zone-center': FIXIT_SCREEN_COPY.parkingZone,
  'predicted-demand': FIXIT_SCREEN_COPY.parkingForecast,
  'fixed-floor': FIXIT_SCREEN_COPY.parkingFixedFloor,
});

/**
 * **The order the player ran, in the words of the controls that set it** — [§ D1011](../../../../DECISIONS.md).
 *
 * The composed fixed verdict (`fixit/engine.ts#classifyOutcome`) names what the player changed
 * rather than what the diagnosis names, and it names it the way the screen already does: a dial by
 * `core`'s own player name and value words (`fixit/editorInputs.ts` carries them from the schema's
 * `player` block), a car by the bank the rezone select calls it, a door hold by the sides the door
 * row labels, a tenancy by its authored cohort and position. **No mechanism and no judgement** —
 * only what was set, because the verdict's close says the runs show *that* it worked and not *why*.
 *
 * One line per change the order carries, in the order the screen draws its families. A value the
 * inputs cannot word (a dial the gate has since closed) is dropped rather than printed as an id:
 * `withPrunedDials` already takes such a dial out of the order both surfaces run, so a line for it
 * would describe a change the run did not carry.
 */
export function fixitOrderLinesOf(input: {
  readonly entry: FixitCase;
  readonly state: FixitState;
  readonly inputs: EditorInputs;
  readonly extras: readonly FixitExtra[];
}): readonly string[] {
  const { entry, state, inputs } = input;
  const lines: string[] = [];
  for (const repair of entry.repairs) {
    if (state.selectedRepairIds.includes(repair.id)) lines.push(repair.name);
  }
  if (state.speedSteps > 0) {
    lines.push(`${FIXIT_SCREEN_COPY.speedLabel} — +${(state.speedSteps * 0.5).toFixed(1)} m/s`);
  }
  if (state.capacitySteps > 0) {
    lines.push(`${FIXIT_SCREEN_COPY.capacityLabel} — +${String(state.capacitySteps * 2)} places`);
  }
  if (state.zoneOverlapFloors > 0) {
    const floors = state.zoneOverlapFloors === 1 ? 'floor' : 'floors';
    lines.push(`${FIXIT_SCREEN_COPY.zonesLabel} — +${String(state.zoneOverlapFloors)} ${floors} each side`);
  }
  if (state.parkingStrategy !== null) {
    lines.push(`${FIXIT_SCREEN_COPY.parkingLabel} — ${PARKING_WORDS[state.parkingStrategy]}`);
  }
  if (state.topFloorRaiseM > 0) {
    const metres = state.topFloorRaiseM === 1 ? 'metre' : 'metres';
    lines.push(`${FIXIT_SCREEN_COPY.elevationLabel} — +${String(state.topFloorRaiseM)} ${metres}`);
  }
  for (const group of inputs.dialGroups) {
    for (const dial of group.dials) {
      if (dial.selected === undefined) continue;
      const value =
        typeof dial.selected === 'boolean'
          ? dial.selected
            ? FIXIT_SCREEN_COPY.dialOn
            : FIXIT_SCREEN_COPY.dialOff
          : dial.options.find((option) => encodeFamilyValue(option.value) === encodeFamilyValue(dial.selected))
              ?.text;
      if (value === undefined) continue;
      lines.push(`${dial.name} — ${value}`);
    }
  }
  for (const [target, setting] of Object.entries(state.doorDwell)) {
    const who = target === EVERY_CAR ? FIXIT_SCREEN_COPY.doorEveryCar : `Car ${target}`;
    const sides = [
      ...(setting.hallCallS === undefined ? [] : [`${setting.hallCallS.toFixed(1)} s ${FIXIT_SCREEN_COPY.doorHallLabel}`]),
      ...(setting.carCallS === undefined ? [] : [`${setting.carCallS.toFixed(1)} s ${FIXIT_SCREEN_COPY.doorCarLabel}`]),
    ];
    if (sides.length === 0) continue;
    lines.push(`${FIXIT_SCREEN_COPY.doorLabel} ${FIXIT_SCREEN_COPY.doorTargetLabel} ${who} — ${sides.join(', ')}`);
  }
  const bankName = new Map(inputs.rezone.banks.map((bank) => [bank.id, bank.name]));
  for (const car of inputs.rezone.cars) {
    if (car.target === car.standingBankId) continue;
    const where =
      car.target === KEYED_BANK
        ? FIXIT_SCREEN_COPY.rezoneKeyed
        : car.target === OUT_OF_SERVICE
          ? FIXIT_SCREEN_COPY.rezoneOut
          : (bankName.get(car.target) ?? car.target);
    lines.push(`Car ${car.id} ${FIXIT_SCREEN_COPY.rezoneCarLabel} ${where}`);
  }
  for (const bank of inputs.rezone.banks) {
    if (state.bankFloors[bank.id] !== undefined) {
      const served = inputs.rezone.floorOrder.filter((id) => bank.floors.includes(id));
      lines.push(`${bank.name} ${FIXIT_SCREEN_COPY.rezoneFloorsLabel} ${served.join(', ')}`);
    }
    if (bank.plated) {
      const label = FIXIT_SCREEN_COPY.plateLabel;
      lines.push(`${bank.name} ${label.charAt(0).toLowerCase()}${label.slice(1)} ${FIXIT_SCREEN_COPY.platePlate}`);
    }
  }
  for (const cohort of inputs.tenancy.cohorts) {
    const positionId = state.tenancyPositions[cohort.id];
    const position = cohort.positions.find((candidate) => candidate.id === positionId);
    if (position !== undefined) lines.push(`${cohort.name} — ${position.name}`);
  }
  for (const extra of input.extras) {
    if (state.selectedExtraIds.includes(extra.id)) lines.push(extra.name);
  }
  return lines;
}

/**
 * The fourth argument both surfaces hand `classifyOutcome` — § D1011. `witnessRun` is the press
 * site's to decide, by comparing the after-run's legs with the diagnosed repair's
 * (`record/crowd.ts#sameLegs`); everything else is derived here from the order that was run, so the
 * two surfaces cannot word one order two ways.
 */
export function fixitVerdictContextOf(input: {
  readonly entry: FixitCase;
  readonly state: FixitState;
  readonly inputs: EditorInputs;
  readonly schedule: PriceSchedule;
  readonly witnessRun: boolean;
}): FixitVerdictContext {
  return {
    witnessRun: input.witnessRun,
    changes: fixitOrderLinesOf({
      entry: input.entry,
      state: input.state,
      inputs: input.inputs,
      extras: standingExtrasFrom(input.schedule),
    }),
  };
}

/** The elevation stepper, worded. Absent entirely on a building whose top floor cannot take it. */
export interface FixitElevationRow {
  readonly key: 'elevation';
  readonly label: string;
  /** What the raise buys so far, in metres — or the as-drawn phrase at zero. */
  readonly readout: string;
  readonly priced: string;
  /** Two refusals, never one — `FixitZoneRow.stepUpRefusal`'s own reason applied here. */
  readonly stepUpRefusal: string | undefined;
  readonly canStepDown: boolean;
}

/**
 * The elevation row, or `null` where the building cannot take one — issue **#422**.
 *
 * `null` where `fixit/run.ts#topFloorRaiseCeilingOf` reports `0`: the topmost floor is served by no
 * bank, or is one half of a double-deck pair. Drawing a stepper there would be a control that writes
 * a field and moves no leg, exactly {@link fixitZoneRow}'s reason for the same `null`.
 */
export function fixitElevationRow(
  state: FixitState,
  ceiling: number,
  canBuy: boolean,
  priceUnits: number,
): FixitElevationRow | null {
  if (ceiling <= 0) return null;
  const atCeiling = state.topFloorRaiseM >= ceiling;
  const atBudget = state.topFloorRaiseM === 0 && !canBuy;
  const price = `${String(priceUnits)} u ${FIXIT_SCREEN_COPY.elevationPriced}`;
  return {
    key: 'elevation',
    label: FIXIT_SCREEN_COPY.elevationLabel,
    readout:
      state.topFloorRaiseM === 0
        ? FIXIT_SCREEN_COPY.elevationNone
        : `+${String(state.topFloorRaiseM)} ${state.topFloorRaiseM === 1 ? 'metre' : 'metres'}`,
    priced: atBudget ? `${price} · ${FIXIT_SCREEN_COPY.atBudget}` : price,
    stepUpRefusal: atCeiling
      ? FIXIT_SCREEN_COPY.elevationAtCeiling
      : atBudget
        ? FIXIT_SCREEN_COPY.noBudgetLeft
        : undefined,
    canStepDown: state.topFloorRaiseM > 0,
  };
}

/* -------------------------------------------------------------------------- *
 * § D1000's five families — the dials, the door hold and the banks
 * -------------------------------------------------------------------------- */

/** One entry in a family select. `value` is `''` for *leave it as it stands*, else an encoded value. */
export interface FixitSelectOption {
  readonly value: string;
  readonly label: string;
  readonly selected: boolean;
}

/** A family group's heading, with the schedule row's price said once for the whole group. */
export interface FixitGroupHeader {
  readonly heading: string;
  readonly priced: string;
  /** The row is not yet bought and the budget cannot take it — every select in it is held. */
  readonly atBudget: boolean;
}

/**
 * How a dial value travels through a `<select>`'s string `value` and back — JSON, because a dial
 * holds a number, a name or a switch and all three must come back as what they were. `''` is the
 * *as it stands* entry and decodes to `null`, which every family reducer reads as *hand it back*.
 */
export function encodeFamilyValue(value: DialValue | undefined): string {
  return value === undefined ? '' : JSON.stringify(value);
}
export function decodeFamilyValue(value: string): DialValue | null {
  return value === '' ? null : (JSON.parse(value) as DialValue);
}

/** The heading over a family group: its schedule row's name and what the row costs, once. */
export function fixitGroupHeader(row: RowPurchase): FixitGroupHeader {
  const priced =
    row.units === 0 ? FIXIT_SCREEN_COPY.parkingFree : `${String(row.units)} u ${FIXIT_SCREEN_COPY.groupPricedOnce}`;
  const atBudget = !row.affordable;
  return {
    heading: row.name,
    priced: atBudget ? `${priced} · ${FIXIT_SCREEN_COPY.groupAtBudget}` : priced,
    atBudget,
  };
}

/** One dial, worded. `label` and `effect` are `core`'s words beside the row. */
export interface FixitDialView {
  readonly key: string;
  readonly label: string;
  readonly effect: string;
  readonly options: readonly FixitSelectOption[];
}

export interface FixitDialGroupView {
  readonly key: string;
  readonly header: FixitGroupHeader;
  readonly dials: readonly FixitDialView[];
}

/**
 * The dial groups, worded — `fixit/editorInputs.ts#editorInputsOf` decides which dials are live and
 * which values each offers; this says them. The *as it stands* entry quotes the standing value, so a
 * player can see what they would be moving away from without moving it.
 */
export function fixitDialGroupsView(groups: readonly DialGroupInput[]): readonly FixitDialGroupView[] {
  return groups.map((group) => ({
    key: group.row.changeId,
    header: fixitGroupHeader(group.row),
    dials: group.dials.map((dial) => ({
      key: dial.id,
      label: dial.name,
      effect: dial.effect,
      options: [
        {
          value: '',
          label:
            dial.standingText === ''
              ? FIXIT_SCREEN_COPY.dialStanding
              : `${FIXIT_SCREEN_COPY.dialStanding} — ${boolWords(dial.standingText)}`,
          selected: dial.selected === undefined,
        },
        ...dial.options.map((option) => ({
          value: encodeFamilyValue(option.value),
          label: typeof option.value === 'boolean' ? (option.value ? FIXIT_SCREEN_COPY.dialOn : FIXIT_SCREEN_COPY.dialOff) : option.text,
          selected: dial.selected !== undefined && encodeFamilyValue(dial.selected) === encodeFamilyValue(option.value),
        })),
      ],
    })),
  }));
}

/** `fixit/families.ts#dialValueText` says a switch as *on* or *off*; this screen says *yes* or *no*. */
function boolWords(text: string): string {
  return text === 'on' ? FIXIT_SCREEN_COPY.dialOn : text === 'off' ? FIXIT_SCREEN_COPY.dialOff : text;
}

/** The door-hold row, worded, for the target the player has picked. */
export interface FixitDoorView {
  readonly header: FixitGroupHeader;
  readonly label: string;
  readonly targetLabel: string;
  readonly targets: readonly FixitSelectOption[];
  readonly sides: readonly {
    readonly key: 'hall' | 'car';
    readonly label: string;
    readonly options: readonly FixitSelectOption[];
  }[];
}

export function fixitDoorView(
  input: DoorInput,
  doorDwell: FixitState['doorDwell'],
  target: string,
): FixitDoorView {
  const setting = doorDwell[target] ?? {};
  const side = (key: 'hall' | 'car', values: readonly number[]) => {
    const current = key === 'hall' ? setting.hallCallS : setting.carCallS;
    return {
      key,
      label: key === 'hall' ? FIXIT_SCREEN_COPY.doorHallLabel : FIXIT_SCREEN_COPY.doorCarLabel,
      options: [
        {
          value: '',
          /* § D1020: the as-built hold, printed, wherever one figure is true of the target. */
          label: (() => {
            const seconds = input.standing?.[target]?.[key];
            return seconds === undefined
              ? FIXIT_SCREEN_COPY.doorStanding
              : `${FIXIT_SCREEN_COPY.dialStanding} — ${seconds.toFixed(1)} s`;
          })(),
          selected: current === undefined,
        },
        ...values.map((seconds) => ({
          value: encodeFamilyValue(seconds),
          label: `${seconds.toFixed(1)} s`,
          selected: current !== undefined && Math.abs(current - seconds) < 1e-9,
        })),
      ],
    };
  };
  return {
    header: fixitGroupHeader(input.row),
    label: FIXIT_SCREEN_COPY.doorLabel,
    targetLabel: FIXIT_SCREEN_COPY.doorTargetLabel,
    targets: input.targets.map((candidate) => ({
      value: candidate.key,
      label:
        candidate.carId === undefined
          ? FIXIT_SCREEN_COPY.doorEveryCar
          : `Car ${candidate.carId}${candidate.bankName === undefined ? '' : ` · ${candidate.bankName}`}`,
      selected: candidate.key === target,
    })),
    sides: [side('hall', input.hallOptions), side('car', input.carOptions)],
  };
}

/** The banks, worded. */
export interface FixitRezoneView {
  readonly header: FixitGroupHeader;
  readonly cars: readonly { readonly key: string; readonly label: string; readonly options: readonly FixitSelectOption[] }[];
  readonly banks: readonly {
    readonly key: string;
    readonly name: string;
    /** Absent on a double-deck bank, whose floors come in pairs this control does not redraw. */
    readonly floors:
      | readonly { readonly id: string; readonly served: boolean; readonly label: string }[]
      | undefined;
    readonly pairedNote: string | undefined;
    /** Present only where the bank weighs against something other than its plate. */
    readonly plate: { readonly label: string; readonly options: readonly FixitSelectOption[] } | undefined;
  }[];
}

export function fixitRezoneView(input: RezoneInput): FixitRezoneView {
  const plainBanks = input.banks.filter((bank) => !bank.keyed);
  const nameOf = new Map(input.banks.map((bank) => [bank.id, bank.name]));
  return {
    header: fixitGroupHeader(input.row),
    cars: input.cars.map((car) => {
      const standingLabel =
        car.standingBankId === OUT_OF_SERVICE
          ? FIXIT_SCREEN_COPY.rezoneOutForWorks
          : (nameOf.get(car.standingBankId) ?? car.standingBankId);
      const choices: { value: string; label: string }[] = [
        { value: '', label: `${FIXIT_SCREEN_COPY.dialStanding} — ${standingLabel}` },
        ...plainBanks
          .filter((bank) => bank.id !== car.standingBankId)
          .map((bank) => ({ value: bank.id, label: bank.name })),
        { value: KEYED_BANK, label: FIXIT_SCREEN_COPY.rezoneKeyed },
        ...(car.standingBankId === OUT_OF_SERVICE ? [] : [{ value: OUT_OF_SERVICE, label: FIXIT_SCREEN_COPY.rezoneOut }]),
      ];
      const picked = car.target === car.standingBankId ? '' : car.target;
      return {
        key: car.id,
        label: `Car ${car.id} ${FIXIT_SCREEN_COPY.rezoneCarLabel}`,
        options: choices.map((choice) => ({ ...choice, selected: choice.value === picked })),
      };
    }),
    banks: input.banks.map((bank) => ({
      key: bank.id,
      name: bank.name,
      floors: bank.paired
        ? undefined
        : input.floorOrder.map((id) => {
            const served = bank.floors.includes(id);
            return {
              id,
              served,
              label: `${id} — ${served ? FIXIT_SCREEN_COPY.rezoneFloorServed : FIXIT_SCREEN_COPY.rezoneFloorPassed}`,
            };
          }),
      pairedNote: bank.paired ? FIXIT_SCREEN_COPY.rezonePairedNote : undefined,
      plate: bank.offPlate
        ? {
            label: FIXIT_SCREEN_COPY.plateLabel,
            options: [
              { value: '', label: FIXIT_SCREEN_COPY.plateAsSet, selected: !bank.plated },
              { value: 'plate', label: FIXIT_SCREEN_COPY.platePlate, selected: bank.plated },
            ],
          }
        : undefined,
    })),
  };
}

/** The tenancy row, worded — § D1001. */
export interface FixitTenancyView {
  readonly heading: string;
  readonly priced: string;
  readonly atBudget: boolean;
  /** One select per cohort the case authors. Empty on a case that authors none. */
  readonly cohorts: readonly {
    readonly key: string;
    readonly name: string;
    readonly reason: string;
    readonly options: readonly FixitSelectOption[];
  }[];
  /** The sentence drawn where there is nothing to move — present exactly when `cohorts` is empty. */
  readonly none: string | undefined;
}

/**
 * The tenancy row. **Drawn on every case** — § D1001 and § D528 clause 3's *never a removed
 * control*, read as allowing a row that is inert because the scenario authors no crowd to move —
 * so a case with no cohort gets the row and {@link FIXIT_SCREEN_COPY}'s `tenancyNone` sentence rather
 * than nothing. The price is said per tenancy, because that is how it is charged.
 */
export function fixitTenancyView(input: TenancyInput): FixitTenancyView {
  const unitWord = `${String(input.row.units)} u ${FIXIT_SCREEN_COPY.tenancyPricedEach}`;
  const atBudget = !input.row.affordable;
  return {
    heading: input.row.name,
    priced: atBudget ? `${unitWord} · ${FIXIT_SCREEN_COPY.groupAtBudget}` : unitWord,
    atBudget,
    cohorts: input.cohorts.map((cohort) => ({
      key: cohort.id,
      name: cohort.name,
      reason: cohort.reason,
      options: [
        {
          value: '',
          label: FIXIT_SCREEN_COPY.tenancyAsItStands,
          selected: input.chosen[cohort.id] === undefined,
        },
        ...cohort.positions.map((position) => ({
          value: position.id,
          label: position.name,
          selected: input.chosen[cohort.id] === position.id,
        })),
      ],
    })),
    none: input.cohorts.length === 0 ? FIXIT_SCREEN_COPY.tenancyNone : undefined,
  };
}

/* -------------------------------------------------------------------------- *
 * The bought budget rung — GitHub issue #579
 * -------------------------------------------------------------------------- */

/**
 * The one row on this screen priced in **chimes**, or `null` where the case file authors no rung.
 *
 * `null` rather than a disabled row, on `fixitZoneRow`'s precedent and for its reason: a control
 * over a ladder that does not exist is a press that writes nothing, and `data/fixit-cases.json`
 * authoring an empty `budgetSteps` is a statement the screen should honour by drawing nothing.
 */
export interface FixitBudgetRungRow {
  readonly key: 'budget';
  readonly label: string;
  /** What the case's budget is **now**, in units — the base, or the base plus what was bought. */
  readonly readout: string;
  /** What the next rung costs, in the currency's own words. Absent once there is no next rung. */
  readonly priced: string | undefined;
  /** Whether the press is live. It is live exactly when this is `buy`. */
  readonly offer: 'buy' | 'short' | 'none' | 'owned';
  /** The one sentence this row owes on every arm, including `buy`. Never empty. */
  readonly note: string;
}

/**
 * The rung row for this case and this device's tally.
 *
 * **Every figure is the caller's**, and that is the same division `fixitMachineryRows` keeps
 * against the budget: this module holds no second opinion about what a rung costs, what a case's
 * budget is now, or what has been banked. What it decides is which of the four sentences a player
 * is owed, and the order of the tests is the order they are worth saying in — **owned first**,
 * because *there is no rung above this* is true whatever the tally holds; then *nothing banked*,
 * because a player with nothing is not *short by six*, they have not started; then the shortfall.
 */
export function fixitBudgetRungRow(input: {
  /** The case's budget now, in units — base plus anything already bought. */
  readonly unitsNow: number;
  /** What the next rung costs in chimes, or `undefined` where there is none. */
  readonly nextChimes: number | undefined;
  /** What this device has banked. */
  readonly balanceChimes: number;
  /** Whether this file authors any rung at all. */
  readonly laddered: boolean;
  /**
   * The currency's own singular and plural — `data/chime-ledger.json`, never spelled here.
   *
   * **Defaulted rather than required**, and the default is the shipped table's: § D530 authors
   * `one` and `many` in `data/`, so a caller that had to pass them would be a second place the
   * currency's name could be got wrong. It stays injectable because a test that drove the shipped
   * words could pass by accident — `fixitScreenModel.test.ts` invents a currency for exactly that.
   */
  readonly currency?: { readonly one: string; readonly many: string } | undefined;
}): FixitBudgetRungRow | null {
  if (!input.laddered) return null;
  const currency = input.currency ?? CHIME_PRICES.currency;
  const readout = `${String(input.unitsNow)} u`;
  const base = { key: 'budget' as const, label: FIXIT_SCREEN_COPY.budgetRungLabel, readout };
  if (input.nextChimes === undefined) {
    return { ...base, priced: undefined, offer: 'owned', note: FIXIT_SCREEN_COPY.budgetRungOwned };
  }
  const priced = `${String(input.nextChimes)} ${input.nextChimes === 1 ? currency.one : currency.many}`;
  if (input.balanceChimes <= 0) {
    return { ...base, priced, offer: 'none', note: FIXIT_SCREEN_COPY.budgetRungNone };
  }
  if (input.balanceChimes < input.nextChimes) {
    const short = input.nextChimes - input.balanceChimes;
    const unit = short === 1 ? currency.one : currency.many;
    return {
      ...base,
      priced,
      offer: 'short',
      note: `${FIXIT_SCREEN_COPY.budgetRungShortLead} ${String(short)} ${unit}.`,
    };
  }
  return { ...base, priced, offer: 'buy', note: FIXIT_SCREEN_COPY.budgetRungOffer };
}

/**
 * The running total, on the machinery card: what the whole order has **committed** and how much of
 * that is steel. (The repairs strip's *spent* line retired with the strip, § D1020.) Both sums are the engine's ({@link FixitSpend}); the note beside
 * them is `fixit/engine.ts#budgetNoteOf`'s and is not restated here.
 */
export interface FixitSpendSummary {
  /** The machinery card's total — everything, the prototype's `fixEditTotal`. */
  readonly committedLine: string;
  /** The machinery card's capital split — the prototype's `fixEditCapital`. */
  readonly capitalLine: string;
  readonly overBudget: boolean;
}

export function fixitSpendSummary(entry: FixitCase, spend: FixitSpend): FixitSpendSummary {
  return {
    committedLine: `${String(spend.totalUnits)} of ${String(entry.budgetUnits)} u committed`,
    capitalLine:
      spend.machineryUnits === 0
        ? FIXIT_SCREEN_COPY.noCapital
        : `${String(spend.machineryUnits)} u of steel`,
    overBudget: spend.totalUnits > entry.budgetUnits,
  };
}


