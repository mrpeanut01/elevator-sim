/**
 * The tenth property, and the register it stands on.
 *
 * `honesty.test.ts` asserts that the search runs and that the properties hold. This file asserts the
 * three things that are true of **this** property and of no other, because it is the only one whose
 * subject is two surfaces at once:
 *
 * 1. **It goes red on the defect it was built for.** [§ D359](../../../../DECISIONS.md)'s call site
 *    is reverted here at the level the property sees — one shell asking `runHorizonOf` and the other
 *    not — and the property is required to name the disagreement, in numbers. *A property that has
 *    never been red is not evidence.*
 * 2. **The register is not watching nothing.** Every clause below this one is a claim about declared
 *    pairs, and a register that emptied — or a corpus that stopped reaching the state on which the
 *    two sides *can* differ — would leave every one of them vacuous while looking identical to a
 *    pass. Both are asserted, in the shape `dev/browserTier.test.ts`'s *"or this guard is watching
 *    nothing"* case uses.
 * 3. **The register rots in both directions.** A pair naming an expression this tree no longer
 *    exports is deleted, not kept — `derive.test.ts`'s rule for `NOT_PLAYER_FACING`, applied to the
 *    other register in this directory, and for the same stated reason: *a list of ghosts is how a
 *    list stops being read.*
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { goalsForDay } from '../shift/goals.js';
import type { BrowserResources } from '../dev/data.js';

import {
  AGREED_FIGURES,
  agreementViews,
  checkSurfacesAgree,
  renderAgreements,
  type AgreedFigure,
} from './agreement.js';
import { deriveExportedDeclarations } from './derive.test-helper.js';
import { caseFromSeed, contextFor, STANDARD_CORPUS, STANDARD_SPACE, type HonestyResources } from './index.js';
import { loadHonestyResources } from './resources.test-helper.js';
import { browserResourcesOf, type HonestyContext } from './surfaces.js';

/** Why a pair that looks like a contract is not one, or is one and is not built here. */
type NotAgreedKind =
  /** The two figures are **supposed** to differ. Pairing them would make the instrument noise. */
  | 'legitimately-differs'
  /** They agree by construction — one object, two formatters. Pairing them checks nothing. */
  | 'tautology'
  /** A real contract this lane did **not** build, with what it would take written down. */
  | 'not-built-here';

/**
 * Pairs that were considered and are not in {@link AGREED_FIGURES}, each with the reason.
 *
 * The half of the register that keeps the property from being weakened. Three of these were put to
 * this lane by name as *known to matter*; two of the three turned out to be tautologies on this
 * tree, which is worth more written down than quietly dropped — a rejected pair with a reason is a
 * pair nobody has to re-investigate, and every one of them will be proposed again.
 *
 * Same idiom as `derive.test.ts#NOT_PLAYER_FACING`, and **in a test file for the same reason**:
 * nothing outside a test can call a list of refusals, and `deadCode.test.ts` went red on this
 * constant while it lived in `agreement.ts` — the standing requirement doing its job on the
 * instrument built to serve it. Grouped by why, every pair still named individually, and the
 * clauses below hold each reason to a length that makes it an argument.
 */
export const NOT_AGREED: readonly {
  readonly kind: NotAgreedKind;
  readonly reason: string;
  readonly ids: readonly string[];
}[] = Object.freeze([
  {
    kind: 'legitimately-differs',
    reason:
      'Different windows over one run, and the difference is the product working. `docs/10` R6 ' +
      'and § D223 require a figure folded to the playhead to differ from the same figure folded ' +
      'over the whole shift — that is what `whole-run-figure-early` exists to enforce — so a pair ' +
      'that required the live readout and the filed sheet to carry one number would contradict ' +
      'the property one slot above it. The honest instrument for this is R6, and it already runs.',
    ids: ['frame/frameAt.ts#frameAt(t < endedAt) × shift/report.ts#dayReportOf'],
  },
  {
    kind: 'legitimately-differs',
    reason:
      'Two batches of one stage, deliberately measured on disjoint seeds. § D355 makes the ' +
      'campaign judge a stage on seeds the player could not tune against and § D360 runs both ' +
      'batches, so the tuning arm and the hold-out arm publish different numbers **about the same ' +
      'configuration on purpose**. A pair here would fire on every stage in the deep tier and ' +
      'would be deleted within a wave, which is the failure mode § D91 names: a guard that cries ' +
      'about legitimate cases trains people to ignore it.',
    ids: ['campaign/judge.ts#judgeStage(tuning) × campaign/judge.ts#judgeStage(hold-out)'],
  },
  {
    kind: 'legitimately-differs',
    reason:
      "Two figures that share a word and not a referent. The worst-wait **goal** is the day's ask " +
      'across the whole shift (`goalsForDay`, `reads: worstWaitS`); the report sheet’s WORST ' +
      'WAIT cell is `summary.serviceLevel.longestWaitS`, the **reporting window’s** longest ' +
      'wait. `live/types.ts#LiveObservations.worstWaitSoFarS` states the relation and it is an ' +
      'inequality, not an equality — every shipped template narrows its window, so the goal’s ' +
      'figure is an upper bound on the cell’s and equals it only on an unshipped spanning ' +
      'window. Asserting equality here would go red on all eight buildings. Each names its window ' +
      'where it stands; pairing them would be inferring a contract from a name collision, which is ' +
      'the one thing this register exists to refuse.',
    ids: ['shift/goals.ts#goalsForDay(worst-wait) × shift/report.ts#dayReportOf(WORST WAIT)'],
  },
  {
    kind: 'tautology',
    reason:
      "The Day report's delta block against the week card — put to this lane as a known pair, and " +
      '**measured as a tautology on this tree**. `dev/main.ts#closeShift` builds one `Observations` ' +
      'at `endedAt`, hands it to `shift/week.ts#outcomeOf` (which copies `minutePct` verbatim into ' +
      'the `DayOutcome` `closeDay` appends to `week.history`) and to `dayReportOf`. The card reads ' +
      "`closed.minutePct` off that record and the sheet formats the same number, so they cannot " +
      'disagree without one of them being handed a different record. The delta block adds no third ' +
      'route either: `reportDeltaOf` sets `after: cell.value` straight off `current.figures`, and ' +
      'the row exists only when the value moved. § D334’s `suppressed-mean` finding there was ' +
      '**not** two derivations disagreeing — it was one sheet pairing a withheld figure against ' +
      'another arm at another seed, a claim about what may be paired at all, and R3 already fires ' +
      'on it.',
    ids: ['dev/reportPanel.ts#reportViewOf(delta) × everyday/weekView.ts#weekScreenViewOf(card)'],
  },
  {
    kind: 'tautology',
    reason:
      'The stage’s live rail against the sheet it produces, at `endedAt` — the third pair put ' +
      'to this lane, and a tautology for a reason `shift/observations.ts` states about itself: ' +
      '"`live/` folds and this projects". `shiftObservationsOf` is assignment — `carried: ' +
      'live.carried`, `servedLegs: live.servedCount` — and `statRowsOf` formats the same ' +
      '`LiveObservations` the projection was taken from. Two formatters over one object. The same ' +
      'goes for the goal rows on either side: `dev/leftRail.ts#shiftGoalsOf` is one function with ' +
      'two callers by design (`drawShift` and `closeShift`), and its docstring says so, which is ' +
      'the fix § D359 landed rather than a gap.',
    ids: [
      'dev/leftRail.ts#statRowsOf × shift/report.ts#dayReportOf',
      'dev/leftRail.ts#goalRowsOf × shift/report.ts#dayReportOf(goals)',
    ],
  },
  {
    kind: 'not-built-here',
    reason:
      '**A real contract, found while rejecting the pair above, and not built in this lane.** ' +
      '`frame/frameAt.ts#frameAt(t).boardedLegs` is a step series `record/recordRun.ts#foldPassengers` ' +
      'builds by sorting a merged `(at, delta, passengerId)` event stream and incrementing on each ' +
      '`-1`; `live/observations.ts#observationsAt(t).servedCount` is a linear scan over ' +
      '`recording.legs` counting `boardedAt !== undefined && boardedAt <= t`. Different structures, ' +
      'different code paths, one number — and `observations.ts` licenses exactly this shape in its ' +
      'own docstring ("Deriving it *from* the fold would make that test a tautology"). It reaches ' +
      'players through `render/describeFrame.ts#describeFrame`’s *"N boarded so far"* and the ' +
      'report’s *"over N served legs"*. What stopped it here is the **locating**: the report ' +
      'adapter renders six sheets per day over different runs and windows, so picking *the* sheet ' +
      'out of the rendered corpus by a regex would pair a figure against another run — § D334’s ' +
      'defect, manufactured by the instrument. Building it needs a side that drives `dayReportOf` ' +
      'rather than one that reads its strings.',
    ids: ['render/describeFrame.ts#describeFrame × shift/report.ts#dayReportOf(served legs)'],
  },
  {
    kind: 'not-built-here',
    reason:
      "**The second real contract found in the same pass, and the sharper of the two.** The day's " +
      '**verdict** has two readers over one rule: `shift/report.ts`’s `judgementOf` computes ' +
      'it from the `readings` themselves, and `everyday/weekView.ts#weekScreenViewOf` computes it ' +
      'from `DayOutcome.allMet` — a **persisted denormalisation** written once by ' +
      '`shift/week.ts#outcomeOf`. A restored session can therefore carry an `allMet` that ' +
      'disagrees with the readings stored beside it, and nothing today would notice. Not built ' +
      'here because a driven side needs a **closed day**, which needs `outcomeOf` and `closeDay` ' +
      'over a recording — the composition `surfaces.ts#shiftBundleOf` already owns — and reaching ' +
      'it from this module would either duplicate that composition or invert the dependency ' +
      'between the two files.',
    ids: ['shift/report.ts#dayReportOf(verdict) × everyday/weekView.ts#weekScreenViewOf(verdict)'],
  },
]);

let resources: HonestyResources;

/**
 * Six cases, and the count is the smallest one that is not a coincidence.
 *
 * Three of the eight shipped buildings have no authored day, so a one-case fixture could land on
 * `garden-apartments` and drive **only** slices — on which the two shells cannot differ, whatever
 * either of them asks. Six cases reach both kinds of building on this corpus, and the *whole-day
 * reach* clause below asserts that rather than trusting it.
 */
const FIXTURE_SEEDS = STANDARD_CORPUS.slice(0, 6);

let contexts: readonly { readonly context: HonestyContext; readonly resources: BrowserResources }[];

beforeAll(async () => {
  ({ resources } = await loadHonestyResources());
  contexts = FIXTURE_SEEDS.map((seed) => {
    const context = contextFor(caseFromSeed(seed, { space: STANDARD_SPACE }), resources);
    return { context, resources: browserResourcesOf(context) };
  });
}, 600_000);

/** Every reading the fixture cases render, across the whole register. */
function readings(figures: readonly AgreedFigure[] = AGREED_FIGURES) {
  return contexts.flatMap((each) => renderAgreements(each.context, each.resources, figures));
}

describe('the tenth property goes red on § D359, which is the whole of its evidence', () => {
  it('names the disagreement, in the numbers the defect actually published', () => {
    /*
     * **§ D359's call site, reverted at the level this property sees.** The Everyday side is left
     * exactly as it ships — it asks `shift/dayLength.ts#runHorizonOf` through its own shell — and
     * the Engineer side is replaced by what `dev/leftRail.ts#shiftGoalsOf` did *before* the repair:
     * `goalsForDay(day)` with the horizon argument forgotten. That is the defect verbatim rather
     * than a synthetic edit, which is why it is here as well as in `faults.ts`: the fault table
     * proves the check can fire, and this proves it fires on **the thing it was built for**.
     */
    const reverted: AgreedFigure = {
      ...(AGREED_FIGURES[0] as AgreedFigure),
      left: {
        surfaceId: 'dev/leftRail.ts#shiftGoalsOf',
        read: (view) =>
          goalsForDay(view.state.week.day)
            .map((goal) => goal.label)
            .join(' · '),
      },
    };
    const found = checkSurfacesAgree(
      contexts[0]?.context as HonestyContext,
      readings([reverted]),
    );

    // Every whole-day state disagrees, and no slice does — a slice is `'period'` either way, so a
    // check that fired on those would be firing for a reason that is not the defect.
    expect(found.length).toBeGreaterThan(0);
    for (const violation of found) expect(violation.field).toContain('whole-day');

    const message = found.map((violation) => violation.message).join('\n');
    // The two ceilings § D359 records, quoted from the run rather than restated: the Engineer rail
    // grading a whole authored day against 230 s while the Everyday rail grades it against 460 s.
    expect(message).toContain('inside 230 s');
    expect(message).toContain('inside 460 s');
    expect(message).toContain('dev/leftRail.ts#shiftGoalsOf');
    expect(message).toContain('everyday/host.ts#createEverydayHost');
  }, 600_000);

  it('holds on this tree — both shells publish one ask', () => {
    for (const each of contexts) {
      const found = checkSurfacesAgree(each.context, renderAgreements(each.context, each.resources));
      expect(found.map((violation) => violation.message), each.context.case.caseId).toEqual([]);
    }
  }, 600_000);

  it('reports a pair one side drops, which an equality over present pairs would score green', () => {
    /*
     * The property's second clause, asserted here as well as in `faults.ts` because it is the one a
     * reader will assume away: *of course* a comparison compares two things. A screen that stopped
     * publishing the ask entirely would leave one reading standing, and a check that silently
     * skipped unpaired readings would call that a pass while a player reads a ceiling on one rail
     * and nothing on the other.
     */
    const all = readings();
    const half = all.filter((text) => text.agreement?.side !== 'left');
    const found = checkSurfacesAgree(contexts[0]?.context as HonestyContext, half);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.message).toContain('published by');
    expect(found[0]?.message).toContain('and by nothing on');
  }, 600_000);
});

describe('the register is watching something', () => {
  it('declares a pair at all, and renders it, or every clause here is vacuous', () => {
    expect(
      AGREED_FIGURES.map((figure) => figure.id),
      'AGREED_FIGURES is empty, so `surfaces-disagree` is a property over no pairs — it would ' +
        'report zero violations on every corpus, which is byte-identical to it holding. Either a ' +
        'pair was deleted without its reason being moved to NOT_AGREED, or this property should ' +
        'not be in HONESTY_PROPERTIES.',
    ).not.toEqual([]);
    expect(readings().length).toBeGreaterThan(0);
  }, 600_000);

  it('negative control: an emptied register renders nothing and checks nothing', () => {
    /*
     * What makes the clause above load-bearing rather than decorative. If the property could report
     * a violation with no register behind it, the register would not be what the property stands
     * on; if it reports nothing when the register is emptied, then every green run is a claim about
     * exactly the pairs that are declared, and no more.
     */
    const none = readings([]);
    expect(none).toEqual([]);
    expect(checkSurfacesAgree(contexts[0]?.context as HonestyContext, none)).toEqual([]);
  }, 600_000);

  it('reaches the whole-day state, which is the only one the two shells can differ on', () => {
    /*
     * **The false-negative shape this property has and the other nine do not.** Its one declared
     * pair is a function of the *horizon*, and a slice resolves to `'period'` on both sides
     * whatever either shell asks — so a corpus that only ever drove slices would render the pair,
     * compare it, agree, and certify nothing. Three of the eight shipped buildings have no authored
     * day (`shift/dayLength.ts#wholeDayFor` returns `undefined` for them), so this is a state the
     * corpus can quietly stop reaching by a change to `STANDARD_SPACE.buildingIds`.
     *
     * Both arms are asserted rather than only the interesting one: a corpus reaching *only* whole
     * days would mean `wholeDayFor` had started answering for buildings that have no day, which is
     * a different defect with the same symptom here.
     */
    const views = contexts.flatMap((each) => agreementViews(each.context, each.resources));
    const kinds = new Set(views.map((view) => view.id.split('/')[1]));
    expect(
      [...kinds].sort(),
      'the fixture cases no longer reach both kinds of run. A corpus of slices alone cannot ' +
        'distinguish a shell that asks `runHorizonOf` from one that does not, so § D359 would be ' +
        'invisible to this property again.',
    ).toEqual(['period', 'whole-day']);
    for (const side of ['left', 'right'] as const) {
      const wholeDay = readings().filter(
        (text) => text.agreement?.side === side && text.agreement.view.includes('whole-day'),
      );
      expect(wholeDay.length, `${side} publishes nothing on a whole day`).toBeGreaterThan(0);
    }
  }, 600_000);
});

describe('the register rots in both directions', () => {
  it('names an expression this tree still exports — a ghost pair is deleted, not kept', async () => {
    const exported = await deriveExportedDeclarations();
    /*
     * The composite ids in NOT_AGREED read `a#x × b#y`, sometimes with a parenthetical saying
     * *which* figure on that side is meant. Both halves are checked: an entry explaining why two
     * expressions must not be paired is worth exactly nothing once one of them has been renamed,
     * and it silently pre-approves whatever takes the name next — `derive.test.ts`'s stated reason
     * for the same rule over `NOT_PLAYER_FACING`.
     */
    const declared = [
      ...AGREED_FIGURES.flatMap((figure) => [figure.left.surfaceId, figure.right.surfaceId]),
      ...NOT_AGREED.flatMap((entry) => entry.ids).flatMap((id) => id.split(' × ')),
    ].map((id) => id.replace(/\(.*\)$/, '').trim());

    const ghosts = [...new Set(declared)].filter((id) => !exported.has(id)).sort();
    expect(
      ghosts,
      'a declared pair names a `<module>#<export>` this tree does not export. Delete the entry, ' +
        'or point it at the expression that replaced it — a pair whose sides no longer exist is a ' +
        'contract about nothing, and it reads as coverage.',
    ).toEqual([]);
  }, 120_000);

  it('negative control: an invented expression would be caught', async () => {
    const exported = await deriveExportedDeclarations();
    expect(exported.has('dev/leftRail.ts#shiftGoalsOf')).toBe(true);
    expect(exported.has('everyday/host.ts#createEverydayHost')).toBe(true);
    expect(exported.has('dev/leftRail.ts#theGoalsOfTomorrow')).toBe(false);
  }, 120_000);

  it('gives every declaration a reason long enough to be one', () => {
    for (const figure of AGREED_FIGURES) {
      expect(figure.why.length, figure.id).toBeGreaterThan(200);
      expect(figure.figure.length, figure.id).toBeGreaterThan(10);
      // Two sides, never one expression compared with itself — `M2_MEASUREMENT.md` § 7.2 records a
      // case that names a free-axis clause and compares a value with itself, and cannot fail.
      expect(figure.left.surfaceId, figure.id).not.toEqual(figure.right.surfaceId);
    }
    for (const entry of NOT_AGREED) {
      expect(entry.ids.length, entry.reason.slice(0, 60)).toBeGreaterThan(0);
      expect(entry.reason.length, entry.ids[0]).toBeGreaterThan(200);
      for (const id of entry.ids) expect(id, entry.reason.slice(0, 60)).toContain(' × ');
    }
  });

  it('never declares a pair and rejects it', () => {
    // The overlap clause `derive.test.ts` runs over its own two lists. A figure that is both a
    // contract and an exemption is a register that has stopped meaning anything.
    const agreed = new Set(
      AGREED_FIGURES.map((figure) => `${figure.left.surfaceId} × ${figure.right.surfaceId}`),
    );
    const rejected = new Set(
      NOT_AGREED.flatMap((entry) => entry.ids).map((id) =>
        id
          .split(' × ')
          .map((half) => half.replace(/\(.*\)$/, '').trim())
          .join(' × '),
      ),
    );
    expect([...agreed].filter((pair) => rejected.has(pair))).toEqual([]);
  });

  it('keeps every rejection classified, so a tautology is not read as a refusal', () => {
    // The three kinds mean different things to a reader deciding whether to build a pair, and a
    // register that collapsed them would tell somebody a real contract was a false one.
    for (const entry of NOT_AGREED) {
      expect(['legitimately-differs', 'tautology', 'not-built-here']).toContain(entry.kind);
    }
    const kinds = new Set(NOT_AGREED.map((entry) => entry.kind));
    expect([...kinds].sort()).toEqual(['legitimately-differs', 'not-built-here', 'tautology']);
  });
});
