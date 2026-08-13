/**
 * **The test bench's pure model** — GAMEPLAY_AND_NAVIGATION.md §12, the half that has no document.
 * `everyday/benchScreen.ts` is the DOM half and draws exactly what is decided here.
 *
 * ## What the bench is, and the one sentence that governs every export below
 *
 * §12: *"Nothing here is posted and nothing here is scored. It is the instrument that makes the
 * boards honest, and it is allowed to shrug."* Every refusal in this module is that sentence made
 * mechanical, and the load-bearing one is §12's closing line — **never present a two-run
 * subtraction as a comparison** — which this module obeys by having no arithmetic of its own at
 * all. Every figure, every verdict word and every interval comes from `batch/suite.ts`, which in
 * turn consumes `batch/report.ts`. Nothing here computes a difference, re-derives a winner, or
 * reworders a verdict: `report.ts`'s six (`resolved`, `under-budget`, `unresolved`, `shown`,
 * `suppressed`, `unmeasured`) encode distinctions a friendlier word would collapse, and
 * *"Too close to call"* — which §12.2 asks for by name — is drawn **beside** the verdict as the
 * plain reading of `unresolved`, never in place of it.
 *
 * ## Three things this module deliberately does not do
 *
 * - **It does not retype §12.1's eight test shapes.** The guide names eight buildings and crowds
 *   (*Chancery House · 14 fl · 3 lifts*, *A coach at eleven*), and this project already has eight
 *   authored operating points — `MATRIX_CELLS`, the cells every published interval in the
 *   repository was measured at. A hand-written second list would be the defect `batch/suite.ts`'s
 *   docstring names outright: a fixture list that disagrees with the one the project measures. So
 *   the tests **are** the matrix, drawn under the cells' own labels. Two of the guide's shapes
 *   (*A lift out of service*, *Sky lobby transfer*) have no matrix cell and are therefore not
 *   offered; that absence is real and is reported rather than papered over with an invented cell.
 * - **It does not run anything.** `suitePlanOf` plans, a worker runs, and `suiteCellViewOf` folds.
 * - **It does not decide the pairwise verdict.** `SuiteCellView.verdictShown` is
 *   `report.comparisons.length === 1`, and `batchReport` compares every arm after the first *with*
 *   the first — so a field of three produces two comparisons and no verdict block, with the
 *   cell's own refusal drawn in its place. {@link benchVerdictNoteOf} says the same thing once at
 *   the top of the screen so a reader meets it before the cells rather than after.
 */

import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';

import { MIN_REPLICATION_BUDGET, MAX_REPLICATION_BUDGET } from '../batch/report.js';
import {
  suiteSummaryOf,
  type SuiteCellView,
  type SuiteField,
  type SuiteSummary,
} from '../batch/suite.js';
import type { BatchArmRequest } from '../batch/types.js';

/* -------------------------------------------------------------------------- *
 * The screen's own chrome
 * -------------------------------------------------------------------------- */

/**
 * Every sentence the bench authors about itself.
 *
 * `fieldHeading`, `testsHeading`, `repsHeading`, `noTests`, the three standing notes and
 * `matrixCaption` are §12's own cells, transcribed. `fieldNote`, `testsAbsent` and
 * `verdictBelowTwo` are this build's, and each one exists because a rule the guide states in prose
 * needs a sentence on the screen: the field's bounds, the two guide shapes with no matrix cell,
 * and why a field of three draws no verdict.
 */
export const BENCH_COPY = Object.freeze({
  eyebrow: 'TEST BENCH',
  title: 'Find out whether it actually helps',
  lede:
    'Two to four dispatchers, the same crowds for every one of them, and a plain answer — ' +
    'including the answer that there is no difference worth the name. Nothing here is posted and ' +
    'nothing here is scored.',
  fieldHeading: 'THE FIELD',
  fieldNote: 'Two at least, four at most.',
  testsHeading: 'THE TESTS',
  testsHint:
    'Ticked independently, because a dispatcher that wins one can lose another. These are the ' +
    'operating points every published figure in this project was measured at.',
  /** The two §12.1 shapes with no operating point behind them — named rather than invented. */
  testsAbsent:
    'Two of the shapes the design asks for — a building short a lift, and a sky-lobby transfer — ' +
    'have no measured operating point in this build, so they are not offered. An invented one ' +
    'would be a test whose answer nobody has checked.',
  noTests: 'No tests ticked. Pick at least one.',
  repsHeading: 'DAYS PER DISPATCHER, PER TEST',
  /** §12.1's honest note about the low end. Drawn whenever the chosen budget is under thirty. */
  repsBelowThirty:
    'Below thirty days the bench can rarely tell anything apart. It will still run, and it will ' +
    'mostly answer “no difference I can see” — which is an honest answer about the instrument, ' +
    'not about the dispatchers.',
  /** Drawn from thirty up to the published floor. Distinct from the sentence above on purpose. */
  repsBelowBudget:
    'Under fifty days no row here will name a winner, however far apart the two look. That is the ' +
    'same floor every published figure in this project was measured against.',
  matrixCaption:
    'away in a minute, and the longest anybody stood · green is the best in that test',
  standingNoteCrowds:
    'The same crowds for everyone — every dispatcher in the field meets the identical arrivals in ' +
    'each test, so the crowd cancels out and only the decisions differ.',
  standingNoteShrug:
    'Sometimes the answer is a shrug — a field can be genuinely hard to separate. When the tests ' +
    'disagree the bench shows you that rather than crowning a winner, and you have saved yourself ' +
    'a week of chasing a difference that was never there.',
  standingNoteBoard:
    'Only benched dispatchers reach the board — a dispatcher you have never run here can still ' +
    'play any day you like; it just cannot be posted until the bench has seen it work.',
  /** §12's closing rule, said on the screen and not only in a docstring. */
  neverASubtraction:
    'A single day against a single day is not a comparison, whatever the two numbers do. What the ' +
    'bench reports is the difference across matched crowds, with the range that difference was ' +
    'measured to lie in.',
  tooCloseHeading: 'Too close to call',
} as const);

/** The three notes §12 requires to be present always, in its order. */
export const BENCH_STANDING_NOTES: readonly string[] = Object.freeze([
  BENCH_COPY.standingNoteCrowds,
  BENCH_COPY.standingNoteShrug,
  BENCH_COPY.standingNoteBoard,
]);

/* -------------------------------------------------------------------------- *
 * The field — two at least, four at most
 * -------------------------------------------------------------------------- */

/** §12.1's bounds. `MIN` is arithmetic; `MAX` is how many columns a matrix can be read across. */
export const BENCH_FIELD_MIN = 2;
export const BENCH_FIELD_MAX = 4;

/** One entrant, as the toggles offer it. */
export interface BenchEntrant {
  readonly profileId: string;
  /** The library's own authored name — never an id on screen. */
  readonly name: string;
  readonly picked: boolean;
  /**
   * Why this toggle cannot be pressed right now, or `undefined`.
   *
   * Present on an **unpicked** entrant once the field is full, and on nothing else: an entrant
   * already in a full field must stay pressable, or a reader who filled it has no way back out.
   */
  readonly refusal: string | undefined;
}

/**
 * The toggles, with the ceiling enforced on them — §12.1's own placement (*"the toggles enforce
 * it"*).
 *
 * Enforced here rather than in `batch/suite.ts` because it is a fact about a screen: the type
 * holds the floor (a comparison needs two arms and no report can be drawn from one), and the
 * ceiling is a limit on how many columns of a matrix a person reads. `SuiteField`'s docstring
 * carries the split.
 */
export function benchEntrantsOf(
  dispatchers: readonly { readonly id: string; readonly name: string }[],
  pickedIds: readonly string[],
): readonly BenchEntrant[] {
  const full = pickedIds.length >= BENCH_FIELD_MAX;
  return Object.freeze(
    dispatchers.map((entry) => {
      const picked = pickedIds.includes(entry.id);
      return Object.freeze({
        profileId: entry.id,
        name: entry.name,
        picked,
        refusal:
          picked || !full
            ? undefined
            : `The field is full at ${String(BENCH_FIELD_MAX)}. Take one out to put this one in.`,
      });
    }),
  );
}

/**
 * Why the field cannot be run yet, or `undefined` when it can.
 *
 * Two states rather than one, because they are different mistakes: an empty or single field has
 * nothing to compare, and an over-full one has more columns than the matrix can be read across.
 */
export function benchFieldRefusal(pickedIds: readonly string[]): string | undefined {
  if (pickedIds.length < BENCH_FIELD_MIN) {
    return (
      `Pick at least ${String(BENCH_FIELD_MIN)} dispatchers. One on its own has nothing to be ` +
      'compared with, and a run against itself is not a comparison.'
    );
  }
  if (pickedIds.length > BENCH_FIELD_MAX) {
    return `At most ${String(BENCH_FIELD_MAX)} — beyond that the matrix stops being readable.`;
  }
  return undefined;
}

/**
 * The picked ids as a {@link SuiteField}, or `undefined` when the field is refused.
 *
 * The narrowing to the tuple is the one unchecked step, and {@link benchFieldRefusal} is what
 * closes it: the two are called together at every site and `benchModel.test.ts` asserts the pair.
 * Arm ids are positional (`arm-0`, `arm-1`, …) and the profile id rides on
 * `BatchArmRequest.dispatcherProfileId`, which is what `batchReport` reads to put the library's own
 * **name** on every row — so no arm id reaches a player's eye.
 */
export function benchFieldOf(pickedIds: readonly string[]): SuiteField | undefined {
  if (benchFieldRefusal(pickedIds) !== undefined) return undefined;
  const arms: BatchArmRequest[] = pickedIds.map((profileId, index) => ({
    armId: `arm-${String(index)}`,
    dispatcherProfileId: profileId,
  }));
  const [first, second, ...rest] = arms;
  if (first === undefined || second === undefined) return undefined;
  return [first, second, ...rest] as SuiteField;
}

/* -------------------------------------------------------------------------- *
 * The tests
 * -------------------------------------------------------------------------- */

/** One ticked-or-not test. The label is the cell's own — it names the pattern the id does. */
export interface BenchTest {
  readonly cellId: string;
  readonly label: string;
  readonly ticked: boolean;
}

/**
 * The tests, from `MATRIX_CELLS` — **imported, never retyped**.
 *
 * See the module docstring: the eight shapes §12.1 authors and the eight cells this project
 * measures are not the same list, and only one of them has numbers behind it.
 */
export function benchTestsOf(tickedIds: readonly string[]): readonly BenchTest[] {
  return Object.freeze(
    MATRIX_CELLS.map((cell) =>
      Object.freeze({ cellId: cell.id, label: cell.label, ticked: tickedIds.includes(cell.id) }),
    ),
  );
}

/** Why the suite cannot run for want of a test, or `undefined`. §12.1's own sentence. */
export function benchTestsRefusal(tickedIds: readonly string[]): string | undefined {
  return tickedIds.length === 0 ? BENCH_COPY.noTests : undefined;
}

/* -------------------------------------------------------------------------- *
 * The budget
 * -------------------------------------------------------------------------- */

/**
 * §12.1's four choices. `50` and `200` are `report.ts`'s own published floor and ceiling, read
 * from it rather than written again — CLAUDE.md's *budget 50–200 replications*, in one place.
 */
export const BENCH_REPLICATION_CHOICES: readonly number[] = Object.freeze([
  10,
  30,
  MIN_REPLICATION_BUDGET,
  MAX_REPLICATION_BUDGET,
]);

/** The budget the bench opens on — the published floor, so the default names a winner when it can. */
export const BENCH_DEFAULT_REPLICATIONS = MIN_REPLICATION_BUDGET;

/**
 * §12.1's live count of the work — *"3 tests · 450 days of simulation"*.
 *
 * The multiplication is `tests × days × entrants`, and the entrant factor is why the sentence is
 * composed here rather than at a control: the guide's own example is three tests at fifty days
 * with **three** dispatchers, and a count that dropped the field would tell a reader a four-arm
 * suite costs what a two-arm one does.
 */
export function benchWorkLineOf(
  tickedCount: number,
  replications: number,
  fieldSize: number,
): string {
  const days = tickedCount * replications * fieldSize;
  const tests = `${String(tickedCount)} ${tickedCount === 1 ? 'test' : 'tests'}`;
  return `${tests} · ${String(days)} days of simulation`;
}

/**
 * What the chosen budget costs a reader, or `undefined` at fifty and above.
 *
 * **Two sentences, not one, and the split is the point.** Below thirty is a statement about the
 * *instrument* — §12.1's own *"the bench can rarely tell anything apart"* — and below fifty is a
 * statement about what the **report** will do, which is refuse to name a winner on any row
 * (`under-budget`, one of `report.ts`'s six). Collapsing them would tell a reader at n = 40 that
 * the bench cannot see anything, which is not true, or tell a reader at n = 10 only that no winner
 * will be named, which understates it.
 */
export function benchBudgetNoteOf(replications: number): string | undefined {
  if (replications < 30) return BENCH_COPY.repsBelowThirty;
  if (replications < MIN_REPLICATION_BUDGET) return BENCH_COPY.repsBelowBudget;
  return undefined;
}

/* -------------------------------------------------------------------------- *
 * Reading the result
 * -------------------------------------------------------------------------- */

/**
 * The one sentence about verdicts that has to be read **before** the cells, not after.
 *
 * §12.2 puts the pairwise verdict under a field of exactly two and says that with three or four
 * *"the bench reports the disagreement between tests rather than crowning a winner"*. Each cell
 * already carries `SuiteCellView.verdictRefusal` saying so; this is the same fact at the top, so a
 * reader who ticked four dispatchers is not told eight times that the thing they are looking for
 * is not there.
 */
export function benchVerdictNoteOf(fieldSize: number): string {
  return fieldSize === 2
    ? 'A field of two gets the pairwise answer below each test: the difference across matched ' +
        'crowds, the range that difference was measured to lie in, and whether that range ' +
        'contains zero.'
    : `A field of ${String(fieldSize)} gets no single pairwise answer — there is no “the” ` +
        'difference between more than two things. Each test still reports every dispatcher’s own ' +
        'figures, and where the tests disagree is the finding.';
}

/** The whole result, as the screen draws it. */
export interface BenchResultView {
  /** The index — `batch/suite.ts#suiteSummaryOf`, whose columns and words are all its own. */
  readonly summary: SuiteSummary;
  /** The per-cell views, in the order they were run. */
  readonly cells: readonly SuiteCellView[];
  readonly caption: string;
  /** §12.2's verdict heading where a drawn interval contains zero, per cell. */
  readonly tooCloseCellIds: readonly string[];
  readonly standingNotes: readonly string[];
  readonly neverASubtraction: string;
}

/**
 * Fold the finished cells into what the screen draws.
 *
 * Strictly weaker than the views it reads. The one thing computed here is
 * {@link BenchResultView.tooCloseCellIds}, and it is a **selection rather than a claim**: a cell is
 * listed when its drawn verdict block has at least one row whose verdict is `unresolved`, which is
 * `report.ts`'s own word for *the interval contains zero, and the two arms are not ordered*. The
 * screen draws §12.2's *"Too close to call"* beside that word, never instead of it — the six
 * verdicts stay on the rows, because `unresolved` and `under-budget` are different claims and one
 * friendly phrase over both would erase the difference between *"they are the same"* and *"you did
 * not run enough days to find out"*.
 */
export function benchResultViewOf(cells: readonly SuiteCellView[]): BenchResultView {
  return Object.freeze({
    summary: suiteSummaryOf(cells),
    cells,
    caption: BENCH_COPY.matrixCaption,
    tooCloseCellIds: Object.freeze(
      cells
        .filter(
          (cell) => cell.verdictShown && cell.rows.some((row) => row.verdict === 'unresolved'),
        )
        .map((cell) => cell.cellId),
    ),
    standingNotes: BENCH_STANDING_NOTES,
    neverASubtraction: BENCH_COPY.neverASubtraction,
  });
}
