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
 * - **It does not retype §12.1's eight test shapes, and it does not invent a ninth list.** The
 *   tests are `data/proof-cases.json`'s forty — eight towers × five crowd shapes — read through
 *   `gauntlet/proofCases.ts`, which is § 12.3's *one list, three readers* with this module as the
 *   third. It ran `MATRIX_CELLS` until [§ D445](../../../../DECISIONS.md); the argument for the
 *   move is there and in {@link benchTestsOf}. Two of the guide's shapes (*A lift out of service*,
 *   *Sky lobby transfer*) are not proof cases and are therefore not offered; that absence is real,
 *   is now **two** rather than the six it was under the matrix, and is reported rather than papered
 *   over with an invented case.
 * - **It does not run anything.** {@link benchPlanOf} plans, a worker runs, and `suiteCellViewOf`
 *   folds.
 * - **It does not decide the pairwise verdict.** `SuiteCellView.verdictShown` is
 *   `report.comparisons.length === 1`, and `batchReport` compares every arm after the first *with*
 *   the first — so a field of three produces two comparisons and no verdict block, with the
 *   cell's own refusal drawn in its place. {@link benchVerdictNoteOf} says the same thing once at
 *   the top of the screen so a reader meets it before the cells rather than after.
 */

import { MIN_REPLICATION_BUDGET, MAX_REPLICATION_BUDGET } from '../batch/report.js';
import {
  suiteSummaryOf,
  SuiteError,
  type SuiteCellView,
  type SuiteField,
  type SuiteSummary,
} from '../batch/suite.js';
import type { BatchArmRequest, BatchRequest } from '../batch/types.js';
import { caseNameOf } from '../gauntlet/ladder.js';
import {
  benchSeedOf,
  proofCaseRequestOf,
  proofCasesOf,
  type ProofCase,
  type ProofCaseSet,
} from '../gauntlet/proofCases.js';

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
    'forty proof cases the ladder rates on — every building, every crowd shape, fixed forever.',
  /**
   * Why the bench's crowds are not the ladder's crowds, said on the screen.
   *
   * The bench runs the ladder's **cases** and not the ladder's **runs**, which is § 1's own pair of
   * seed rules and CLAUDE.md's hold-out discipline — [§ D446](../../../../DECISIONS.md). A player who could tune against the exact forty
   * traces they are about to be rated on would be validating on the training set, and the gain
   * would vanish the moment anything moved. Drawn here rather than left in a docstring because a
   * reader comparing a bench figure with a ladder rating will otherwise assume they are the same
   * measurement.
   */
  testsSeedNote:
    'Same buildings and same crowd shapes as the ladder, different crowds. The bench is where you ' +
    'try things out and the ladder is what rates them, so they must not share their arrivals — a ' +
    'dispatcher tuned against the exact runs it is about to be rated on would look better here ' +
    'than it will anywhere else.',
  /** The two §12.1 shapes that are not proof cases — named rather than invented. */
  testsAbsent:
    'Two of the shapes the design asks for — a building short a lift, and a sky-lobby transfer — ' +
    'are not among the forty, because each changes the building rather than the crowd and a crowd ' +
    'shape is a property of the people. An invented case would be a test whose answer nobody has ' +
    'checked, and one the ladder could not rate.',
  noTests: 'No tests ticked. Pick at least one.',
  /**
   * The labelled state between the screen painting and the forty arriving.
   *
   * § 12.2's rule about the withheld matrix is the local one and it is general: *"every combination
   * renders `—` or a labelled unavailable state; none renders a zero, a spinner or a stale figure"*.
   * The tick list is fetched (§ D445), so there is a beat where it is empty — and an empty list
   * under *"No tests ticked. Pick at least one."* is a small lie, because it says there is something
   * to tick. This is drawn instead, and `benchTestsRefusal` is not: a reader is told what is
   * happening rather than blamed for it.
   */
  testsLoading: 'Fetching the forty proof cases…',
  /**
   * Why the § 3.3 primary cannot be pressed while the suite is in flight — `BarPrimary.inert`'s
   * sentence, not a status line. The matrix's own cells report progress; this answers the other
   * question a dead button raises (GitHub issue #262).
   */
  runningSuite: 'The suite is running. Every cell finishes before another can start.',
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

/** One ticked-or-not test. A test **is** one of the forty; the label is the ladder's own name. */
export interface BenchTest {
  /** `${towerId}/${crowdId}` — `ProofCase.id`, the key the ladder stores a per-case row under. */
  readonly caseId: string;
  /** The tower's name, and the crowd's label. Grouped so a screen can head each tower once. */
  readonly towerName: string;
  /** `caseNameOf` — *Tower · Crowd*. One source with the ladder's progress line and *weakest at*. */
  readonly label: string;
  readonly ticked: boolean;
}

/**
 * The tests: **the forty**, derived — never retyped, and never `MATRIX_CELLS`.
 *
 * ## Why this is the forty and not the matrix — § D445
 *
 * `ENGINE_CONTRACT.md` § 12.3 says *one list, three readers*, and § 14.2 says the same thing in the
 * form that decides a tie: *"The eight buildings and five shapes are the **same fixtures the bench
 * uses** (§12.1) — one set of proof cases, not two."* Three things made obeying it right rather
 * than merely obedient:
 *
 * 1. **The ladder's own caveat points here.** `gauntlet/rating.ts#RATING_CAVEAT` is drawn under
 *    every rating: *"A rating orders this table; a gap between two rows is not a measured
 *    difference … The bench is where two dispatchers are compared on matched crowds with an
 *    interval."* A bench measuring a *different set of buildings and crowds* cannot answer the
 *    question that sentence raises. It sent a reader to an instrument pointed somewhere else.
 * 2. **The matrix could not offer the screen's own tests.** §12.1 names eight shapes across
 *    Chancery House, Midtown Office, Ashgate, Crown Hotel, St Jude, Garden Apartments and Vertical
 *    City. `MATRIX_CELLS` covers **five** buildings and holds no cell on Chancery House, Crown
 *    Hotel or St Jude at all — so at most two of the eight were reachable, while
 *    {@link BENCH_COPY.testsAbsent} told the player **two** were missing. Under the forty, six of
 *    the eight are reachable and the absent two are exactly the two that sentence names. The copy
 *    was written for the fixtures the contract asks for and had been shipping against the ones the
 *    code had, which is [§ D227](../../../../DECISIONS.md)'s class exactly.
 * 3. **Nothing was given up.** The per-cell derived budget is the one real argument for the matrix,
 *    and the bench never read it: no module in `packages/viz` touches `MatrixCell.replications`,
 *    `budgetBasis`, `armCeilings` or `admissibleReplications`. The budget here is the player's
 *    control and always was, gated by `report.ts`'s `under-budget` refusal below fifty.
 *
 * The Engineer's `dev/suitePanel.ts` keeps `MATRIX_CELLS` and is **not** a fourth reader: § 12.3
 * names the *bench's* suite, § 12 is this screen, and the Engineer surface asks the matrix's
 * question at the matrix's points. Two products, two questions, one fixture list each.
 *
 * `towerNameOf` resolves a tower id to the building's authored name, so this module holds no
 * building name — the property `gauntlet/proofCases.test.ts` asserts across every reader.
 */
export function benchTestsOf(
  set: ProofCaseSet,
  tickedIds: readonly string[],
  towerNameOf: (towerId: string) => string,
): readonly BenchTest[] {
  return Object.freeze(
    proofCasesOf(set).map((proofCase) => {
      const towerName = towerNameOf(proofCase.tower.id);
      return Object.freeze({
        caseId: proofCase.id,
        towerName,
        label: caseNameOf(proofCase, towerName),
        ticked: tickedIds.includes(proofCase.id),
      });
    }),
  );
}

/**
 * Why the suite cannot run for want of a test, or `undefined`.
 *
 * §12.1's own sentence when there are tests and none is ticked, and
 * {@link BENCH_COPY.testsLoading} while the forty are still arriving — two different facts, and
 * telling a reader to pick from an empty list is the one this split exists to stop. `offered` is
 * the number of tests the screen is drawing, so the refusal is a function of what is in front of
 * the reader rather than of a flag a renderer sets.
 */
export function benchTestsRefusal(
  tickedIds: readonly string[],
  offered = 1,
): string | undefined {
  if (offered === 0) return BENCH_COPY.testsLoading;
  return tickedIds.length === 0 ? BENCH_COPY.noTests : undefined;
}

/* -------------------------------------------------------------------------- *
 * The plan
 * -------------------------------------------------------------------------- */

/** What to run: which of the forty, at what budget, with which dispatchers. */
export interface BenchSuiteRequest {
  /** `ProofCase.id`s, ticked. Resolved against the parsed set, which refuses an unknown one. */
  readonly caseIds: readonly string[];
  /** Per case, per entrant. The player's control — see {@link BENCH_REPLICATION_CHOICES}. */
  readonly replications: number;
  readonly field: SuiteField;
}

/**
 * One ticked case, with the request that runs it.
 *
 * `test` is `{ id, label }` because that is all `batch/suite.ts#suiteCellViewOf` reads — its
 * parameter is structurally typed rather than a `MatrixCell`, which is why the fold, the index and
 * every sentence below them work unchanged over a fixture list they were not written for.
 */
export interface BenchCasePlan {
  readonly test: { readonly id: string; readonly label: string };
  readonly request: BatchRequest;
}

/**
 * One `BatchRequest` per ticked case, in the forty's own tower-major order of the ids given.
 *
 * The guards are `batch/suite.ts#suitePlanOf`'s, for its reasons: nothing ticked is not a suite, a
 * case ticked twice would run once under two names, and a field under two arms is not a comparison
 * (the type forbids it at compile time; a deserialised state can still arrive here). An unknown id
 * is refused by name rather than dropped — a suite quietly missing a case is a suite over a
 * different set of crowds than the one the reader ticked.
 *
 * **The seed is {@link benchSeedOf}, never the case's own**, and that is the whole of the hold-out
 * discipline: same buildings, same crowd shapes, different arrivals from the ones the ladder rates
 * on. `proofCaseRequestOf` requires the seed for exactly this reason — see its docstring, § 1's
 * two-row table and [§ D446](../../../../DECISIONS.md).
 *
 * @throws SuiteError with the sentence the screen draws.
 */
export function benchPlanOf(
  set: ProofCaseSet,
  request: BenchSuiteRequest,
  towerNameOf: (towerId: string) => string,
): readonly BenchCasePlan[] {
  if (request.caseIds.length === 0) {
    throw new SuiteError(
      'no tests are ticked: a suite is one comparison over at least one of the forty, so there is nothing to run.',
    );
  }
  if (new Set(request.caseIds).size !== request.caseIds.length) {
    throw new SuiteError('a test is ticked twice; a suite runs each ticked case once.');
  }
  if (request.field.length < 2) {
    throw new SuiteError(
      `a suite compares a field of at least two dispatchers; this one carries ${String(request.field.length)}.`,
    );
  }
  const byId = new Map<string, ProofCase>(
    proofCasesOf(set).map((proofCase) => [proofCase.id, proofCase]),
  );
  return Object.freeze(
    request.caseIds.map((caseId) => {
      const proofCase = byId.get(caseId);
      if (proofCase === undefined) {
        throw new SuiteError(
          `no proof case "${caseId}" — this build's forty do not include it, and running the suite ` +
            'without it would report on a different set of crowds than the one ticked.',
        );
      }
      return Object.freeze({
        test: Object.freeze({
          id: proofCase.id,
          label: caseNameOf(proofCase, towerNameOf(proofCase.tower.id)),
        }),
        request: proofCaseRequestOf(
          proofCase,
          request.field,
          request.replications,
          benchSeedOf(proofCase),
        ),
      });
    }),
  );
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

/**
 * One cell whose verdict block has at least one `unresolved` row, and the heading it draws.
 *
 * A pair rather than a bare id, and [§ D389](../../../../DECISIONS.md) is why: the id alone left the
 * screen to supply the words, and the words it supplied said nothing about how many rows they were
 * about. See {@link benchTooCloseHeadingOf}.
 */
export interface BenchTooCloseMark {
  readonly cellId: string;
  /** §12.2's heading, carrying the basis it counts. */
  readonly heading: string;
}

/**
 * §12.2's *"Too close to call"*, with the rows it is about and the rows it is not — issue #301.
 *
 * ## The defect this closes
 *
 * A cell card drew two rollups with the rows sandwiched between them, and **neither named its own
 * denominator**. Above: *Too close to call*, on `≥ 1` row coming back `unresolved`. Below:
 * `batch/report.ts#answerFor`, whose first branch fires on `≥ 1` row coming back `resolved` —
 * *"Separated on 1 of the measures compared — average wait."* Measured on a fixture with one
 * `resolved` row, five `unresolved` and two `shown`, the card said **both, unqualified**: it opened
 * by saying the comparison was too close to call and closed by saying it had separated.
 *
 * Each rollup was true of the subset it counted. What neither said is *which subset* — so the two
 * read as answers to one question rather than as answers to two. This repository's own fix for that
 * shape is to **put the basis on the figure**, and this is that: the heading now says the rows it
 * speaks for and the rows it does not, and the answer below already names its own by label.
 *
 * ## Why the count is `rows.length` and not the report's `total`
 *
 * The denominator is the number of rows **the card draws between the two rollups**, so a reader can
 * check it by counting what is in front of them. `batch/report.ts`'s summary sentence has a `total`
 * of its own and is not drawn on this screen; a denominator a reader cannot see is the defect again
 * with a bigger number.
 *
 * ## What this deliberately does not do
 *
 * It does not reword the six verdicts, and it does not touch `answerFor`. The verdicts stay on the
 * rows — `unresolved` and `under-budget` are different claims, and one friendly phrase over both
 * would erase the difference between *"they are the same"* and *"you did not run enough days to
 * find out"*. `answerFor` is `batch/report.ts`'s, drawn by the Engineer suite panel and the CLI as
 * well as here, and it already names its subset by label; changing a shared sentence to fix a
 * one-screen contradiction would be a wider edit with a narrower reason.
 */
export function benchTooCloseHeadingOf(unresolvedRows: number, drawnRows: number): string {
  return (
    `${BENCH_COPY.tooCloseHeading} on ${String(unresolvedRows)} of the ` +
    `${String(drawnRows)} measures below`
  );
}

/** The whole result, as the screen draws it. */
export interface BenchResultView {
  /** The index — `batch/suite.ts#suiteSummaryOf`, whose columns and words are all its own. */
  readonly summary: SuiteSummary;
  /** The per-cell views, in the order they were run. */
  readonly cells: readonly SuiteCellView[];
  readonly caption: string;
  /** §12.2's verdict heading where a drawn interval contains zero, per cell. */
  readonly tooClose: readonly BenchTooCloseMark[];
  readonly standingNotes: readonly string[];
  readonly neverASubtraction: string;
}

/**
 * Fold the finished cells into what the screen draws.
 *
 * Strictly weaker than the views it reads. The one thing computed here is
 * {@link BenchResultView.tooClose}, and it is a **selection plus its basis**: a cell is listed when
 * its drawn verdict block has at least one row whose verdict is `unresolved`, which is
 * `report.ts`'s own word for *the interval contains zero, and the two arms are not ordered*. The
 * screen draws §12.2's *"Too close to call"* beside that word, never instead of it — the six
 * verdicts stay on the rows.
 *
 * It used to be a list of ids, and the heading was a constant the screen supplied. That is the
 * shape issue #301 found: a rollup that could not say how many rows it spoke for, over rows a
 * second rollup was simultaneously speaking for. The heading is composed here, with the counts,
 * so the screen has nothing left to author — see {@link benchTooCloseHeadingOf}.
 */
export function benchResultViewOf(cells: readonly SuiteCellView[]): BenchResultView {
  return Object.freeze({
    summary: suiteSummaryOf(cells),
    cells,
    caption: BENCH_COPY.matrixCaption,
    tooClose: Object.freeze(
      cells
        .filter(
          (cell) => cell.verdictShown && cell.rows.some((row) => row.verdict === 'unresolved'),
        )
        .map((cell) =>
          Object.freeze({
            cellId: cell.cellId,
            heading: benchTooCloseHeadingOf(
              cell.rows.filter((row) => row.verdict === 'unresolved').length,
              cell.rows.length,
            ),
          }),
        ),
    ),
    standingNotes: BENCH_STANDING_NOTES,
    neverASubtraction: BENCH_COPY.neverASubtraction,
  });
}
