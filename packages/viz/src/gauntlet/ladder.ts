/**
 * **The ladder, and the gate in front of it** — GAMEPLAY § 14, § 11.7 and § 20.10, as pure
 * decisions over `rating.ts`'s numbers and `proofCases.ts`'s list.
 *
 * ## What this module decides
 *
 * The words: the send gate's refusal, a ladder row's cells, and the *What are the forty?*
 * disclosure. It decides **no figure** — every number it prints arrives already folded from
 * `rating.ts`, and the two it formats (`ratingFigureOf`, `proofCaseCountOf`) are that module's own
 * formatters, called rather than reimplemented.
 *
 * ## The disclosure is generated, and that is the point of it
 *
 * § 14.2: the panel *"names all eight buildings with their spec and why each is in the set, all
 * five crowd shapes with what each tests, and closes with the arithmetic"*, and BUILD_PLAN slice 9
 * requires it be generated **from the same fixture list**, *"not a second copy of the names"*. So
 * {@link whatAreTheFortyOf} takes the parsed set and a resolver, and this file contains no tower
 * name, no tower spec and no crowd label — the names come from `data/buildings/` through the
 * resolver and the labels from `data/proof-cases.json`. `proofCases.test.ts` asserts the negative
 * across the whole of `packages/viz/src`, in both directions.
 *
 * The closing arithmetic is written from the two lengths rather than from the words *eight*,
 * *five* and *forty*, so a set that grew a tower prints the arithmetic it actually has.
 *
 * ## Reference runs are labelled, and are not players — § 20.11, § 14
 *
 * *"World figures must never be presented as players when they are reference runs."* A row is a
 * reference run when the dispatcher behind it is one `data/dispatcher-profiles.json` ships; the
 * caller decides that (it is the only party holding the file) and this module carries the label
 * through to the row. There is no ranking arithmetic that treats the two kinds differently — the
 * label is the whole of the distinction, which is what § 14 asks for.
 *
 * ## What is absent here, and it is a server
 *
 * Every rating on this ladder was computed **on this device**, from runs this build performed. The
 * world ladder — other people's dispatchers, replay-verified — needs the server § 12 describes, and
 * {@link LADDER_WORLD_ABSENCE} is the labelled unavailable state § 12.2 requires in its place. It
 * is not a fixture and there are no authored rows: § 20.11 lists `ladderRows` among the fixtures
 * that need a real source or an explicit marker, and the real source is the gauntlet.
 */

import {
  proofCaseCountOf,
  ratedCaseIssue,
  ratingOf,
  ratingFigureOf,
  RATING_BASIS,
  RATING_CAVEAT,
  type RatedCase,
  type RatingSummary,
} from './rating.js';
import { proofCasesOf, type ProofCase, type ProofCaseSet } from './proofCases.js';

/* -------------------------------------------------------------------------- *
 * The gate — § 20.10
 * -------------------------------------------------------------------------- */

/** What the send control knows about the dispatcher in front of it. */
export interface SendCandidate {
  readonly dispatcherId: string;
  readonly dispatcherName: string;
  /**
   * The working copy differs from the profile it was opened from, **or** that profile is gone.
   *
   * One flag for both, on `dev/dispatcherEditor.ts#runThisStateOf`'s own precedent — it collapses
   * `source === undefined || specIsDirty(spec, source)` into a single `saveFirst` for the reason
   * that neither can be pointed a run at. The gauntlet has the same problem and answers it in the
   * same place, so the two controls cannot disagree about what *saved* means.
   */
  readonly dirty: boolean;
}

/** Whether the forty may be run, and the sentence the button says when they may not. */
export interface SendGate {
  readonly sendable: boolean;
  /** `null` when sendable. Never a disabled control with no explanation. */
  readonly refusal: string | null;
  /** The control's own label, so the refusal and the word on the button are one decision. */
  readonly label: string;
}

/**
 * § 20.10's check, in one place: *"a dirty dispatcher cannot be sent, and the button says why."*
 *
 * The refusal names the consequence rather than the rule. § 11.7: *"the old rating belongs to the
 * old dispatcher"* — a rating is a claim about a specific weight vector, so a gauntlet run over an
 * unsaved edit would post a standing figure for something no library holds and nothing can replay.
 * That is invariant 5's problem before it is a tidiness one.
 */
export function sendGateOf(candidate: SendCandidate | undefined): SendGate {
  if (candidate === undefined) {
    return {
      sendable: false,
      refusal:
        'no dispatcher is open, so there is nothing to send. Pick one in the workshop and it can ' +
        'go through the forty.',
      label: 'Send it through the gauntlet',
    };
  }
  if (candidate.dirty) {
    return {
      sendable: false,
      refusal:
        `“${candidate.dispatcherName}” has changes that are not saved, so it cannot be sent. A ` +
        'rating is a standing claim about one exact dispatcher — the old rating belongs to the ' +
        'old dispatcher — and an unsaved edit is one nothing can replay. Save it, then send it.',
      label: 'Send it through the gauntlet',
    };
  }
  return { sendable: true, refusal: null, label: 'Send it through the gauntlet' };
}

/* -------------------------------------------------------------------------- *
 * The rows — § 14
 * -------------------------------------------------------------------------- */

/** A rating this device computed, held against the exact dispatcher it was computed for. */
export interface LadderEntry {
  readonly dispatcherId: string;
  readonly dispatcherName: string;
  /** `data/dispatcher-profiles.json` ships it — § 20.11's `reference run`, decided by the caller. */
  readonly isReference: boolean;
  /**
   * A stable digest of the weight vector that was rated.
   *
   * § 11.7: editing a dispatcher makes its entry read *edited since* until the gauntlet runs
   * again. Comparing the digest to the library's current one is how that is known, and it is a
   * digest rather than a flag because the fact outlives the edit — a player who edits and undoes is
   * back on the rating they had, which a sticky flag would not give them.
   */
  readonly fingerprint: string;
  readonly summary: RatingSummary;
}

/* -------------------------------------------------------------------------- *
 * A rating that survives the tab — GitHub issue #224, [§ D434](../../../../DECISIONS.md)
 * -------------------------------------------------------------------------- */

/**
 * A {@link LadderEntry} as it is kept between sittings: **its forty cases and nothing folded**.
 *
 * ## What is deliberately not stored, and why that is the whole of this type
 *
 * `RatingSummary` carries five values — `rating`, `casesRated`, `casesRun`, `complete` and
 * `weakest` — that {@link ratingOf} *computes* from the cases and the total. Writing them down
 * would create five figures a store could hold in disagreement with the cases beside them: a
 * rating of `91.2%` over a `cases` array whose scores mean `88.4`, a `weakest` naming a case that
 * is not the worst one, a `complete: true` over thirty-nine. Nothing would notice, because the
 * ladder draws the *stored* aggregate and never re-derives it.
 *
 * So the stored form is the evidence and the aggregate is rebuilt by {@link ladderEntryOf} through
 * the same `ratingOf` a live gauntlet uses. There is one arithmetic, and a restored row and a
 * freshly-run row cannot disagree about a mean.
 *
 * `casesTotal` **is** stored, and it is not an exception to that: `ratingOf`'s own docstring says
 * why it is a parameter rather than `cases.length` — the interesting incomplete rating is the one
 * where a case never ran and therefore has no row. It cannot be derived from what is here.
 *
 * `fingerprint` is stored for § 11.7's *edited since*, which is the reason a rating survives a
 * reload usefully at all: a restored rating that could not be compared against the dispatcher as it
 * stands now would be a figure with no way of telling the player it is stale.
 */
export interface SavedRating {
  readonly dispatcherId: string;
  readonly dispatcherName: string;
  readonly isReference: boolean;
  readonly fingerprint: string;
  /** {@link RatingSummary.casesTotal} — the denominator, which the rows cannot supply. */
  readonly casesTotal: number;
  /** The forty, each with its seed. Invariant 5: a stored rating replays exactly. */
  readonly cases: readonly RatedCase[];
}

/** A live entry reduced to what is kept. The only route into a {@link SavedRating}. */
export function savedRatingOf(entry: LadderEntry): SavedRating {
  return {
    dispatcherId: entry.dispatcherId,
    dispatcherName: entry.dispatcherName,
    isReference: entry.isReference,
    fingerprint: entry.fingerprint,
    casesTotal: entry.summary.casesTotal,
    cases: entry.summary.cases,
  };
}

/**
 * Why a value read back out of storage is not a {@link SavedRating}, or `undefined` when it is one.
 *
 * Total, and it refuses whole rather than repairing: a rating with one unreadable case is not a
 * rating over thirty-nine, because `rating.ts` says in terms that a mean over a different set is a
 * different quantity. The reason names the case's own complaint so a reader is not told only that
 * *something* was wrong with forty rows.
 */
export function savedRatingIssue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'a saved rating is not an object';
  }
  const record = value as Record<string, unknown>;
  for (const key of ['dispatcherId', 'dispatcherName', 'fingerprint'] as const) {
    const text = record[key];
    if (typeof text !== 'string' || text === '') return `a saved rating has no ${key}`;
  }
  if (typeof record['isReference'] !== 'boolean') {
    return 'a saved rating does not say whether it is a reference run';
  }
  const casesTotal = record['casesTotal'];
  if (typeof casesTotal !== 'number' || !Number.isInteger(casesTotal) || casesTotal < 0) {
    return 'a saved rating’s case total is not a count';
  }
  const cases = record['cases'];
  if (!Array.isArray(cases)) return 'a saved rating carries no list of cases';
  if (cases.length > casesTotal) {
    // A gauntlet reports at most one row per case, so more rows than cases is not a shape this
    // product can write — and `ratingOf` would fold it into `casesRated` above `casesTotal`, which
    // is `41 of 40` on a player's screen.
    return 'a saved rating has more cases than the set it claims to be over';
  }
  for (const entry of cases as readonly unknown[]) {
    const issue = ratedCaseIssue(entry);
    if (issue !== undefined) return issue;
  }
  return undefined;
}

/**
 * A kept rating, folded back into the row the ladder draws.
 *
 * The one caller is `everyday/boardScreen.ts`, restoring what the last sitting earned. Every figure
 * on the row comes out of `ratingOf`, so a restored rating and a rating computed a second ago are
 * the same object built the same way — see {@link SavedRating} for why that matters.
 */
export function ladderEntryOf(saved: SavedRating): LadderEntry {
  return {
    dispatcherId: saved.dispatcherId,
    dispatcherName: saved.dispatcherName,
    isReference: saved.isReference,
    fingerprint: saved.fingerprint,
    summary: ratingOf(saved.cases, saved.casesTotal),
  };
}

/** One row of the ladder, every cell already worded. */
export interface LadderRowView {
  readonly dispatcherId: string;
  readonly name: string;
  /** `reference run` or `null`. Never rendered as a player — § 20.11. */
  readonly referenceLabel: string | null;
  /** § 13's figure, or `—`. */
  readonly rating: string;
  /** `40 of 40`. */
  readonly proofCases: string;
  /** § 14's *weakest at*, already named, or `—` where nothing scored. */
  readonly weakestAt: string;
  /**
   * `edited since` when the library's dispatcher has moved past the rated one, `unrated` where
   * there is no rating at all, `null` when the row stands. § 14's own two words.
   */
  readonly staleness: string | null;
  /** Set when the rating covers fewer than every case — see `RatingSummary.complete`. */
  readonly incompleteNote: string | null;
  /**
   * The cases behind the smaller denominator, each named and each carrying its own reason. Empty
   * on a complete rating.
   *
   * **This exists because the reason was already being computed and thrown away** — GitHub issue
   * #295's F26. `rating.ts#proofCaseScoreOf` writes a sentence for every case it cannot score, and
   * until this field every reference to `RatedCase.noScoreReason` outside that file was a test. So
   * the ladder said `39 of 40` and stopped, while the code that knew which case dropped and why
   * had already run. That is this repository's own standing requirement — *name the non-test
   * caller* — with no caller to name; the fix is to give it one rather than to delete it.
   */
  readonly dropped: readonly DroppedCaseView[];
}

/** One case a rating could not score, worded for the row that reports the smaller denominator. */
export interface DroppedCaseView {
  /** The case, through {@link LadderContext.caseNameOf}. Never an engine identifier. */
  readonly caseName: string;
  /** `rating.ts`'s own sentence for why it scored nothing. */
  readonly reason: string;
}

/** What the ladder needs from the library to draw a row, supplied by the caller. */
export interface LadderContext {
  /** The library's current digest for a dispatcher, or `undefined` when it is gone. */
  fingerprintOf(dispatcherId: string): string | undefined;
  /** How a case is named for a reader — tower name and crowd label, no engine identifier. */
  caseNameOf(caseId: string): string;
}

/** § 14's *weakest at* is drawn from the summary, so no renderer picks the worst case itself. */
function weakestCellOf(summary: RatingSummary, context: LadderContext): string {
  return summary.weakest === null ? '—' : context.caseNameOf(summary.weakest.caseId);
}

/*
 * **Declared here rather than beside {@link DroppedCaseView}, and the reason is an instrument
 * rather than a preference.** `honesty/derive.test-helper.ts` splits a module into spans at each
 * `function`/`const`/`class` declaration and never at an `interface`, so `ladderEntryOf`'s span
 * currently runs forward over `LadderRowView` and `LadderContext` and picks up the latter's
 * `caseNameOf` member name. That is why `derive.test.ts` classifies `ladderEntryOf` as a text
 * producer at all, and why it carries an exclusion whose own reason says it *"authors nothing"*.
 * A `const` placed between those two interfaces cuts the span, drops `ladderEntryOf` out of the
 * producer set, and turns that exclusion into a ghost — a register in another lane's file going
 * red for a reason that has nothing to do with this change. The artifact is worth reporting and is
 * not worth reshaping somebody else's register mid-wave, so the constant sits below the split
 * instead.
 */

/**
 * A case that scored nothing and said nothing about why.
 *
 * `ratedCaseIssue` refuses that pair on the way out of storage and `ratedCaseOf` cannot build one,
 * so nothing in the product should reach this. It is a sentence rather than a `continue` because
 * the defect this field closes is a case leaving a denominator without a word, and closing it with
 * a branch that drops one silently would be the same defect one level down.
 */
export const DROPPED_WITHOUT_REASON = 'this case scored nothing and the run did not say why';

/**
 * The unscored cases, in the order the gauntlet ran them, named and worded.
 *
 * Read off `summary.cases` rather than recomputed, for {@link weakestCellOf}'s reason: the rating
 * decided which cases scored, and a renderer that decided it a second time could disagree with the
 * denominator printed beside it.
 *
 * A case that **never ran** has no row here and is not in this list. That is deliberate and is why
 * the note beside it still cites `casesTotal`: the two counts differ exactly when a case is
 * missing altogether, and this list can only speak for the cases the gauntlet reached.
 */
function droppedCasesOf(
  summary: RatingSummary,
  context: LadderContext,
): readonly DroppedCaseView[] {
  return summary.cases
    .filter((entry) => entry.score === null)
    .map((entry) => ({
      caseName: context.caseNameOf(entry.caseId),
      reason: entry.noScoreReason ?? DROPPED_WITHOUT_REASON,
    }));
}

/**
 * The rows, highest rating first, with unrated and stale rows sorted after every standing one.
 *
 * The sort is by the **rating** and nothing else, which is § 12.3's *"a dispatcher that wins one
 * shape and loses four sits mid-table"* made literal. It is an ordering of means and not a ranking
 * of measured differences; {@link LADDER_CAVEAT} is drawn beside the table for that reason and is
 * not optional.
 */
export function ladderRowsOf(
  entries: readonly LadderEntry[],
  context: LadderContext,
): readonly LadderRowView[] {
  const rows = entries.map((entry) => {
    const current = context.fingerprintOf(entry.dispatcherId);
    const edited = current !== undefined && current !== entry.fingerprint;
    return {
      dispatcherId: entry.dispatcherId,
      name: entry.dispatcherName,
      referenceLabel: entry.isReference ? REFERENCE_RUN_LABEL : null,
      rating: ratingFigureOf(entry.summary),
      proofCases: proofCaseCountOf(entry.summary),
      weakestAt: weakestCellOf(entry.summary, context),
      staleness: entry.summary.rating === null ? 'unrated' : edited ? 'edited since' : null,
      incompleteNote:
        entry.summary.rating !== null && !entry.summary.complete
          ? `this rating is a mean over ${proofCaseCountOf(entry.summary)} cases, so it is not ` +
            'comparable with a rating taken over all of them'
          : null,
      dropped: droppedCasesOf(entry.summary, context),
      sortKey: entry.summary.rating,
    };
  });
  return rows
    .slice()
    .sort((left, right) => (right.sortKey ?? -1) - (left.sortKey ?? -1))
    .map(({ sortKey: _sortKey, ...row }) => row);
}

/** § 14 and § 20.11's label, in one place so every surface uses the same two words. */
export const REFERENCE_RUN_LABEL = 'reference run';

/** The caveat drawn beside the table. `rating.ts` owns the sentence; this is the one reader. */
export const LADDER_CAVEAT = RATING_CAVEAT;

/** § 12.2's labelled unavailable state for the half of this screen that needs a server. */
export const LADDER_WORLD_ABSENCE =
  'Every rating here was measured on this device. The world ladder — other people’s dispatchers, ' +
  'each replayed and verified before it appears — needs a server to post and rank runs, and this ' +
  'build has none.';

/** What the table says before anything has been through the forty. Not a zero, not a spinner. */
export const LADDER_EMPTY =
  'Nothing has been through the gauntlet on this device yet. Send a dispatcher through the forty ' +
  'and its rating stands here.';

/* -------------------------------------------------------------------------- *
 * What are the forty? — § 14.2
 * -------------------------------------------------------------------------- */

/** How a tower is named and specified for a reader. Resolved from `data/buildings/`, never here. */
export interface TowerFacts {
  readonly name: string;
  /** `19 floors · 6 lifts` — composed by the caller from the building document. */
  readonly spec: string;
}

/** One line of the disclosure's building half. */
export interface FortyTowerLine {
  readonly name: string;
  readonly spec: string;
  readonly why: string;
}

/** One line of the disclosure's crowd half. */
export interface FortyCrowdLine {
  readonly label: string;
  readonly tests: string;
}

/** The whole disclosure, worded — § 14.2's three parts in the order it names them. */
export interface WhatAreTheForty {
  readonly heading: string;
  readonly towers: readonly FortyTowerLine[];
  readonly crowds: readonly FortyCrowdLine[];
  /** The closing arithmetic, written from the two lengths rather than from three number words. */
  readonly arithmetic: string;
  /** What a rating is a mean of — `rating.ts`'s own sentence, one source. */
  readonly basis: string;
  readonly caveat: string;
}

/**
 * The disclosure, generated from the parsed set.
 *
 * `facts` resolves a tower id to its name and spec from `data/buildings/`, so this module holds no
 * building name — the property `proofCases.test.ts` asserts across the tree. A tower whose facts
 * cannot be resolved is a build whose `data/buildings/` lost a building the parse required, which
 * `parseProofCases` already refuses; the resolver is therefore total and says so by its type.
 */
export function whatAreTheFortyOf(
  set: ProofCaseSet,
  facts: (towerId: string) => TowerFacts,
): WhatAreTheForty {
  const towers = set.towers.map((tower) => {
    const resolved = facts(tower.id);
    return { name: resolved.name, spec: resolved.spec, why: tower.why };
  });
  const crowds = set.crowds.map((crowd) => ({ label: crowd.label, tests: crowd.tests }));
  const total = set.towers.length * set.crowds.length;
  return {
    heading: 'What are the forty?',
    towers,
    crowds,
    arithmetic:
      `${String(set.towers.length)} buildings × ${String(set.crowds.length)} crowd shapes = ` +
      `${String(total)} runs. A rating is the mean of all ${String(total)}. The cases never move, ` +
      'so two ratings a month apart are still comparable — and a dispatcher that wins one shape ' +
      'and loses four sits mid-table.',
    basis: RATING_BASIS,
    caveat: RATING_CAVEAT,
  };
}

/**
 * A case's reader-facing name — the tower's name and the crowd's label, never an id.
 *
 * Here rather than in a renderer because *weakest at* and the progress line both need it and the
 * two saying it differently is the one-source rule broken in the smallest possible way.
 */
export function caseNameOf(proofCase: ProofCase, towerName: string): string {
  return `${towerName} · ${proofCase.crowd.label}`;
}

/** Every case's reader-facing name, keyed by case id — what {@link LadderContext} is built from. */
export function caseNamesOf(
  set: ProofCaseSet,
  towerNameOf: (towerId: string) => string,
): ReadonlyMap<string, string> {
  return new Map(
    proofCasesOf(set).map((proofCase) => [
      proofCase.id,
      caseNameOf(proofCase, towerNameOf(proofCase.tower.id)),
    ]),
  );
}
