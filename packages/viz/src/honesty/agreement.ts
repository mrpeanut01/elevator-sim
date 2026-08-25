/**
 * **Two surfaces, one state, one figure** — the question the other nine properties cannot ask.
 *
 * ## Why this exists, and why an axis would not have done
 *
 * [`DECISIONS.md` § D359](../../../../DECISIONS.md) closed a defect this corpus could not have
 * caught. `shift/goals.ts#goalsForDay` grew a horizon parameter and **one of its four callers
 * passed it**, so after a whole authored day the Everyday rail graded the run against a **460 s**
 * worst-wait ceiling and the Engineer rail, one door away and about the same run, graded it against
 * **230 s**. Neither figure was wrong on its own. Publishing both about one run is what
 * `TEST_MATRIX.md` T1's *figures consistent* clause forbids, and § D359 wrote the diagnosis down:
 *
 * > all nine `PROPERTY_CHECKS` are predicates over **one case's rendered strings**, and each
 * > surface was internally honest either way. **The corpus has no property that gives two surfaces
 * > one state and asks whether they agree.**
 *
 * A `horizon` axis on the sweep would not have helped: it would drive each adapter over both kinds
 * of run and produce two internally-honest corpora, comparing neither. What is missing is a
 * property of a different **shape** — one that renders a single state through a declared *pair* of
 * shipped expressions and asserts that a named figure means the same thing in both.
 *
 * ## The pairs are declared, never inferred
 *
 * Two surfaces naming the same figure by coincidence is not a contract, and a property that
 * inferred pairs from name collisions would flag the batch's tuning figures against its hold-out
 * figures ([§ D355](../../../../DECISIONS.md), § D360) and a live figure against a whole-run fold
 * (`docs/10` R6) — all of which are *supposed* to differ. So {@link AGREED_FIGURES} is a register in
 * the idiom `derive.test.ts#NOT_PLAYER_FACING` already uses: every pair names both sides, names the
 * one figure claimed identical, and carries the reason it is a contract. {@link NOT_AGREED} is the
 * other half — figures that look pairable and are not, with the reason they differ. A property that
 * had to be *weakened* to stop firing on those would be worse than no property.
 *
 * ## What a side is
 *
 * A side is a **shipped expression**, named `<module>#<export>` exactly as a violation names a
 * surface, plus a function that reads the figure out of it. The expression is imported by this
 * module, so a side whose function is deleted or renamed does not compile; the *string* is checked
 * against the source tree by `agreement.test.ts`, which is the half a rename can rot silently.
 *
 * ## What this module does **not** derive
 *
 * The horizon. `runHorizonOf` is § D359's one expression and each side reaches it through its own
 * shell; a copy here would be the defect arriving inside the instrument built to find it — § D159's
 * second false-negative variant, which `run.ts#recordingConfigFor` refuses for the same reason.
 * What this module *does* build is the **state**: `wholeDayFor` plus `wholeDayRun` is the same pair
 * `everyday/host.ts#dayPatchFor` composes when a player presses Run, and constructing the state a
 * player reaches is not the same act as deciding what kind of run it is.
 *
 * ## Cost
 *
 * No simulation. Every figure in the register is a function of the **state** rather than of a
 * recording — the ask a screen publishes, not the reading it takes — so the pairs are driven over
 * states built from the case's own building and cost arithmetic. That is deliberate rather than
 * incidental: `shift/dayLength.ts` measures a whole authored day at 3.5 s / 32 MB a replication on
 * Midtown Office and 9.2 s / 145 MB on Vertical City, against an always-on tier bounded at roughly
 * 200 s, so a property that needed a whole-day *run* would have belonged in the deep tier or
 * nowhere.
 *
 * ## What this still cannot see, said plainly
 *
 * **Any disagreement between two surfaces that are not a declared pair.** This is a register, and a
 * register covers what it names. The property is not a general equality check and must not become
 * one — {@link NOT_AGREED}'s first three entries are figures that would fire on every case if it
 * did.
 *
 * **A disagreement that both sides reach through one object.** Two formatters over one
 * `Observations` cannot differ, so a defect *upstream* of that object — a wrong fold, a wrong
 * window — is invisible here and stays R3's and R6's to catch. {@link NOT_AGREED}'s two `tautology`
 * entries are the measured instances.
 *
 * **A disagreement in a figure no side can reach without a run or a closed day.** Two of those are
 * named in {@link NOT_AGREED} under `not-built-here`, with what each would take. Both are real
 * contracts; neither is checked by anything today.
 *
 * **A disagreement between a shipped surface and a shipped *mount*.** Every side here is a pure
 * expression, because `boundaries.test.ts` confines the DOM to `dev/` and this directory runs under
 * Node. A mount that drew a figure its own model did not produce would pass this property, and the
 * browser tier is where that lives.
 */

import type { BrowserResources } from '../dev/data.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import { buildingConfigOf, initialState, type ViewerState } from '../dev/state.js';
import { createEverydayHost, type EverydayHostBindings } from '../everyday/host.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';

import type { HonestyContext } from './surfaces.js';
import type { HonestyViolation, RenderedText } from './types.js';

/* -------------------------------------------------------------------------- *
 * The state a pair is driven over
 * -------------------------------------------------------------------------- */

/**
 * One state both sides of every pair are rendered from.
 *
 * A `ViewerState` rather than a recording, because the figures in the register are **asks** — what
 * a screen says today wants — and an ask is a function of the state. See the module docstring's
 * *Cost* section for why that is the design and not a shortcut.
 */
export interface AgreementView {
  /** `day1/period`, `day4/whole-day`. Stable, so a violation names a state a reader can rebuild. */
  readonly id: string;
  /** What makes this state worth driving, in a sentence a violation can print. */
  readonly what: string;
  readonly state: ViewerState;
  readonly resources: BrowserResources;
}

/* -------------------------------------------------------------------------- *
 * The register
 * -------------------------------------------------------------------------- */

/** One side of a declared pair: a shipped expression, and how to read the figure out of it. */
export interface AgreementSide {
  /** `<module>#<export>` — the expression this side reads, named as a violation names a surface. */
  readonly surfaceId: string;
  /**
   * The figure as this side publishes it, or `undefined` where this side does not publish it here.
   *
   * `undefined` is a fact about the state, not a pass: a pair on which **one** side publishes and
   * the other does not is reported, because one screen carrying a figure the other drops is the
   * disagreement in its starkest form.
   */
  read(view: AgreementView): string | undefined;
}

/** One declared contract: two surfaces, one figure, and the reason the two must match. */
export interface AgreedFigure {
  /** Stable id, printed in every violation this pair produces. */
  readonly id: string;
  /** The figure claimed identical, named the way a player would name it. */
  readonly figure: string;
  /**
   * Why these two must agree — the half that stops the register becoming a list of coincidences.
   *
   * Long enough to be an argument. `agreement.test.ts` holds it to the same floor
   * `derive.test.ts` holds a `NOT_PLAYER_FACING` reason to.
   */
  readonly why: string;
  readonly left: AgreementSide;
  readonly right: AgreementSide;
}

/**
 * **The declared pairs.** Two surfaces, one state, one figure, and a reason.
 *
 * Three pairs were put to this lane as *known to matter*; **one is here and two were measured as
 * tautologies**, with the measurement written into {@link NOT_AGREED} rather than left for the next
 * lane to redo. A rejected pair with a reason is worth more than a property with a fake one in it.
 */
export const AGREED_FIGURES: readonly AgreedFigure[] = Object.freeze([
  {
    id: 'today-asks',
    figure: "what today asks — the four goal bars, as each shell's rail publishes them",
    why:
      "Both products put today's goals in front of the same player, one door apart, about one " +
      'run. `shift/goals.ts#goalsForDay` takes the day **and what kind of run today is**, and the ' +
      'second argument is the one a caller can forget: forgetting it compiles, draws, and grades ' +
      'a ten-hour run against a thirty-minute ceiling. That is not hypothetical — it shipped, and ' +
      '§ D359 is the repair. The two sides here are the two shells’ own derivations, reached ' +
      'through their own code rather than through a shared array, so the pair fails exactly when ' +
      'one shell stops asking `shift/dayLength.ts#runHorizonOf` and the other keeps asking it. ' +
      'The whole ask is compared rather than the ceiling alone, because the ladder that hardens ' +
      'the other three bars is horizon-blind today and a future bar that is not would otherwise ' +
      'diverge unwatched.',
    left: {
      surfaceId: 'dev/leftRail.ts#shiftGoalsOf',
      read: (view) => asksOf(shiftGoalsOf(view.state, view.resources).map((goal) => goal.label)),
    },
    right: {
      surfaceId: 'everyday/host.ts#createEverydayHost',
      read: (view) =>
        asksOf(
          createEverydayHost(hostBindingsFor(view))
            .goalsToday()
            .map((reading) => reading.goal.label),
        ),
    },
  },
]);

/** Why a pair that looks like a contract is not one, or is one and is not built here. */
export type NotAgreedKind =
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
 * Same idiom as `derive.test.ts#NOT_PLAYER_FACING`: grouped by why, every pair still named
 * individually, and `agreement.test.ts` holds each reason to a length that makes it an argument.
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

/* -------------------------------------------------------------------------- *
 * Reading a side
 * -------------------------------------------------------------------------- */

/** The four asks as one string, in the order the shell publishes them. `undefined` when empty. */
function asksOf(labels: readonly string[]): string | undefined {
  return labels.length === 0 ? undefined : labels.join(' · ');
}

/**
 * The Everyday host over a state and nothing else.
 *
 * Every binding a *read* needs is here and every binding that would **write** throws, which is the
 * point rather than laziness: this harness renders, and a side that quietly ran the day would be
 * comparing two different runs. `createEverydayHost` is pure over its bindings — it reads
 * `state()` fresh on every call — so a stub is the whole of what the shell needs to answer
 * `goalsToday()`.
 */
function hostBindingsFor(view: AgreementView): EverydayHostBindings {
  const refuse = (what: string) => (): never => {
    throw new Error(`the agreement harness renders and does not ${what}`);
  };
  return {
    resources: view.resources,
    state: () => view.state,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: refuse('start a run'),
    intervene: refuse('intervene'),
    closeDay: refuse('close the day'),
    openRunTab: refuse('open a tab'),
    applyPatch: refuse('patch the state'),
    onChange: () => () => undefined,
  };
}

/* -------------------------------------------------------------------------- *
 * The states
 * -------------------------------------------------------------------------- */

/** The days a pair is driven on — the two `surfaces.ts#shiftBundleOf` closes, for the same reason. */
const AGREEMENT_DAYS: readonly number[] = Object.freeze([1, 4]);

/**
 * Every state the pairs are driven over: each day as a **slice**, and — where the building has an
 * authored day — the same day run **whole**.
 *
 * The second is the one § D359's defect needs, and it is the one that can quietly vanish: three of
 * the eight shipped buildings have no authored day, so a corpus whose cases all landed on those
 * would drive only slices and the property would be green over a state in which the two shells
 * cannot differ. `agreement.test.ts` asserts the whole-day arm is reached rather than assuming it.
 */
export function agreementViews(
  context: HonestyContext,
  resources: BrowserResources,
): readonly AgreementView[] {
  const base = initialState(resources, BigInt(context.case.simSeed));
  const buildingId = context.case.buildingId;
  const day = wholeDayFor(resources.trafficProfiles, buildingConfigOf(resources, [], buildingId));
  const views: AgreementView[] = [];
  for (const dayNumber of AGREEMENT_DAYS) {
    const state: ViewerState = {
      ...base,
      buildingId,
      week: { ...base.week, day: dayNumber },
    };
    views.push({
      id: `day${String(dayNumber)}/period`,
      what: `day ${String(dayNumber)} run as a slice of ${buildingId}'s demand`,
      state,
      resources,
    });
    if (day === undefined) continue;
    views.push({
      id: `day${String(dayNumber)}/whole-day`,
      what: `day ${String(dayNumber)} run as the whole authored day (${day.templateId})`,
      state: { ...state, ...wholeDayRun(day) },
      resources,
    });
  }
  return views;
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

/**
 * Every declared pair, over every state, as strings the corpus carries.
 *
 * Seeded into the corpus rather than compared here, for the reason every other structural fact in
 * this directory is declared by the surface and judged by a property: it is what lets
 * `faults.ts` fire this property the same way it fires the other nine — *a property that has never
 * failed is a property that cannot fail* — and it puts the compared strings in a counterexample.
 *
 * `figures` is a parameter with the register as its default so the emptied-register control in
 * `agreement.test.ts` can show that the guard would then be watching nothing.
 */
export function renderAgreements(
  context: HonestyContext,
  resources: BrowserResources,
  figures: readonly AgreedFigure[] = AGREED_FIGURES,
): readonly RenderedText[] {
  const texts: RenderedText[] = [];
  for (const view of agreementViews(context, resources)) {
    for (const pair of figures) {
      for (const side of ['left', 'right'] as const) {
        const text = pair[side].read(view);
        if (text === undefined || text.trim() === '') continue;
        texts.push({
          surfaceId: pair[side].surfaceId,
          field: `agree(${pair.id})@${view.id}.${side}`,
          text,
          // A label, not an observation: an ask is what today wants, never a fact about a run.
          role: 'label',
          provenance: 'single-run',
          agreement: { pair: pair.id, view: view.id, side },
        });
      }
    }
  }
  return texts;
}

/* -------------------------------------------------------------------------- *
 * The property
 * -------------------------------------------------------------------------- */

/** The two sides of one pair on one state, as the corpus rendered them. */
interface Pairing {
  readonly pair: string;
  readonly view: string;
  left?: RenderedText | undefined;
  right?: RenderedText | undefined;
}

function pairingsIn(texts: readonly RenderedText[]): readonly Pairing[] {
  const found = new Map<string, Pairing>();
  for (const text of texts) {
    const mark = text.agreement;
    if (mark === undefined) continue;
    const key = `${mark.pair}@${mark.view}`;
    const pairing = found.get(key) ?? { pair: mark.pair, view: mark.view };
    pairing[mark.side] = text;
    found.set(key, pairing);
  }
  return [...found.values()];
}

function figureOf(id: string): AgreedFigure | undefined {
  return AGREED_FIGURES.find((figure) => figure.id === id);
}

/**
 * **T1's *figures consistent* clause, under search** — two surfaces, one state, one figure.
 *
 * Two clauses, and the second is not a lesser form of the first:
 *
 * 1. **Both sides say the same thing.** The figure is compared as rendered, so the violation quotes
 *    what a player would read on each screen rather than a normalised number nobody sees.
 * 2. **Both sides say something.** One screen publishing the ask while the other drops it is the
 *    disagreement in its starkest form, and a check that only compared present pairs would call it
 *    a pass. `AgreementSide.read` returning `undefined` on **both** sides is a different fact — the
 *    pair does not apply to that state — and is silently skipped here and measured in
 *    `agreement.test.ts`.
 *
 * A pairing whose id is in no register entry is reported rather than ignored: it means a reading
 * was seeded by something the register no longer declares, which is the corpus and the register
 * having drifted apart.
 */
export function checkSurfacesAgree(
  _context: HonestyContext,
  texts: readonly RenderedText[],
): readonly HonestyViolation[] {
  const found: HonestyViolation[] = [];
  for (const pairing of pairingsIn(texts)) {
    const declared = figureOf(pairing.pair);
    const { left, right } = pairing;
    if (declared === undefined) {
      const seen = left ?? right;
      /* c8 ignore next -- a pairing exists only because a side was seeded. */
      if (seen === undefined) continue;
      found.push({
        property: 'surfaces-disagree',
        message:
          `a reading was seeded for the pair "${pairing.pair}", which AGREED_FIGURES does not ` +
          'declare. The corpus and the register have drifted: either restore the entry, or stop ' +
          'seeding the reading — an undeclared pair is a comparison nobody has argued for.',
        surfaceId: seen.surfaceId,
        field: seen.field,
        text: seen.text.slice(0, 200),
      });
      continue;
    }
    if (left === undefined || right === undefined) {
      const seen = left ?? right;
      /* c8 ignore next -- one side is present, or there would be no pairing. */
      if (seen === undefined) continue;
      const silent = left === undefined ? declared.left : declared.right;
      found.push({
        property: 'surfaces-disagree',
        message:
          `${declared.figure} is published by \`${seen.surfaceId}\` and by nothing on ` +
          `\`${silent.surfaceId}\`, on ${pairing.view}. One screen carrying a figure the other ` +
          'drops is a disagreement about what the run is, not a narrower screen: a player who ' +
          'reads both is owed one answer. AGREED_FIGURES declares these two a contract — ' +
          `${declared.why}`,
        surfaceId: silent.surfaceId,
        field: `agree(${declared.id})@${pairing.view}.${left === undefined ? 'left' : 'right'}`,
        text: seen.text.slice(0, 200),
      });
      continue;
    }
    if (left.text === right.text) continue;
    found.push({
      property: 'surfaces-disagree',
      message:
        `${declared.figure} differs between \`${left.surfaceId}\` and \`${right.surfaceId}\` on ` +
        `${pairing.view}. One says “${left.text}”; the other says “${right.text}”. Each surface ` +
        'may be internally honest and the product is still incoherent — a player reads both, one ' +
        `door apart, about one run. AGREED_FIGURES declares these two a contract — ${declared.why}`,
      surfaceId: right.surfaceId,
      field: right.field,
      text: right.text.slice(0, 200),
    });
  }
  return found;
}
