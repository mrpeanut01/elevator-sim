/**
 * Basic and Advanced, as types — `docs/10-experience-layer-contract.md` § 4, and the half of
 * [`DECISIONS.md` § D163](../../../../DECISIONS.md) clause 2 that decides Phase 9.
 *
 * ## The rule, and the one thing that must not be a list
 *
 * § 4: *"Basic mode may hide complexity. It may never hide a failure."* § D163 says the parity
 * that enforces it must be **derived, not listed**:
 *
 * > the set of failure states, suppression reasons and fail-state diagnoses visible in Advanced
 * > must be computed from the code and asserted visible in Basic. A hand-written parity list is
 * > the hand-written-list defect § D152 closed one layer down, and it would fail the same way —
 * > silently, when a ninth failure state is added.
 *
 * The distinction this file draws, and the reason it is the honest reading of that sentence:
 *
 * - The **members** of those three sets are derived, always. The fail states come from
 *   `campaign/failStates.ts`'s reports, which come from `FAIL_STATES`; the suppression reasons
 *   come from whichever figures `render/runSummary.ts` returns with `kind: 'suppressed'`, which
 *   comes from `awtIsValid` and its four grounds; the warnings come from `recording.warnings`.
 *   Nothing anywhere writes down *which* fail state, *which* ground or *which* warning. A ninth
 *   of any of them enters the required set with no edit here.
 * - The **categories** are named by the criterion itself — § D163 enumerates them — so
 *   {@link DisclosureOrigin} is a discriminated union and {@link disclosureClassOf} is an
 *   exhaustive `switch` over it. A ninth *category* is therefore a **compile error**, which is
 *   `batch/types.ts`'s `BATCH_METRIC_CLASS` shape applied one surface over: the only way this
 *   stays a decision somebody made rather than a decision somebody forgot.
 *
 * ## Why an item carries what it must carry
 *
 * {@link DisclosureItem.mustCarry} is the string — the reason, the diagnosis, the seed, the
 * warning — taken from the **source datum at construction**, not paraphrased. Parity is then one
 * generic rule over every item: a must-show item is present in Basic, and every string it must
 * carry is somewhere in what Basic draws. `mode/parity.ts` contains no fail state, no ground and
 * no figure id, which is what makes it a check rather than a second list.
 */

import type { PassengerModel } from '@elevator-sim/core/browser';

import type { SummaryBar, SummaryFigureKind } from '../render/runSummary.js';

/* -------------------------------------------------------------------------- *
 * The modes
 * -------------------------------------------------------------------------- */

/**
 * § 4: *"Basic is the default. Advanced is one control away and is remembered."*
 *
 * The order is the order the toggle offers them in, and Basic is first because it is the default.
 */
export const VIEW_MODES = ['basic', 'advanced'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

export const isViewMode = (value: string | null): value is ViewMode =>
  value !== null && (VIEW_MODES as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- *
 * Where an item came from
 * -------------------------------------------------------------------------- */

/**
 * What a player-facing item **is**, as the discriminant the parity rule is derived over.
 *
 * Every variant names the clause of § 4 or § 1 it answers. Nothing here names a fail state, a
 * suppression ground, a warning code or a figure id — those are the members, and members are
 * derived.
 */
export type DisclosureOrigin =
  /** § 4 item 5 / R7 — the building, the dispatcher and **the seed**, copyable. */
  | { readonly kind: 'run-identity' }
  /** § 4 item 2 — the undelivered count, and that they never arrived. */
  | { readonly kind: 'undelivered' }
  /** § 4 item 3 / R3 — a statistic the run's own summary refuses, and the reason. */
  | { readonly kind: 'suppression'; readonly figureId: string }
  /** § 4 item 7 — a non-fatal diagnostic from the run, `double-deck-not-simulated` among them. */
  | { readonly kind: 'warning'; readonly index: number }
  /** § 4 item 6 — the passenger model, because it changes what a landing queue *is*. */
  | { readonly kind: 'passenger-model'; readonly model: PassengerModel }
  /** § 4 item 4 / § 10.4 — a call no car may legally answer. */
  | { readonly kind: 'locked-out' }
  /** § 5.3 / R4 — one of the fail states, with its frequency over the batch. */
  | { readonly kind: 'fail-state'; readonly state: string }
  /** § 5.3 — that state's one-line diagnosis, naming the floor or the credential. */
  | { readonly kind: 'fail-state-diagnosis'; readonly state: string }
  /** Everything else the run summary draws. The negotiable half of § 4. */
  | { readonly kind: 'figure'; readonly figureId: string; readonly figureKind: SummaryFigureKind };

/**
 * Whether Basic may hide this.
 *
 * `must-show` is § 4's *"What Basic may never hide"* list, reached through the origin rather than
 * through the item's text — so it is decided by **what a thing is**, never by what it says.
 */
export type DisclosureClass = 'must-show' | 'may-hide';

/**
 * The classification, total by construction.
 *
 * An exhaustive `switch` and no `default`: a tenth {@link DisclosureOrigin} variant fails to
 * compile here until somebody decides which side of § 4's line it falls on. That is the whole
 * defence against § D152's silent-ninth-member failure at the *category* level; the member level
 * is defended by never enumerating members anywhere.
 */
export function disclosureClassOf(origin: DisclosureOrigin): DisclosureClass {
  switch (origin.kind) {
    case 'run-identity':
      return 'must-show';
    case 'undelivered':
      return 'must-show';
    case 'suppression':
      return 'must-show';
    case 'warning':
      return 'must-show';
    case 'locked-out':
      return 'must-show';
    case 'fail-state':
      return 'must-show';
    case 'fail-state-diagnosis':
      return 'must-show';
    case 'passenger-model':
      /*
       * § 4 item 6 names exactly one model: *"when it is `destination-dispatch`, because it
       * changes what a landing queue **is**"*. On a conventional run the row is a fact about the
       * building and Basic may leave it out — which is the difference between hiding complexity
       * and hiding a failure, drawn where the contract draws it rather than one step wider.
       */
      return origin.model === 'destination-dispatch' ? 'must-show' : 'may-hide';
    case 'figure':
      return 'may-hide';
  }
}

/* -------------------------------------------------------------------------- *
 * An item
 * -------------------------------------------------------------------------- */

export type Severity = 'normal' | 'warning';

/** How one item reads in one mode. `null` for an item that mode does not draw. */
export interface Rendering {
  /** The figure, or the word that replaces it. Never a blank, a dash or a zero (R3). */
  readonly value: string;
  /** The count the estimate was computed from, in the same visual unit (R13). */
  readonly count?: string | undefined;
  /** The caveat, the reason, or the definition — one interaction away at most (R3). */
  readonly note?: string | undefined;
  readonly bars: readonly SummaryBar[];
  /**
   * Whether this rendering reports a failure — the class the mount puts on the row.
   *
   * **On the rendering, not on the item**, and that is the difference between a rule and a
   * comment. It was on the item first, which made `parity.ts`'s de-escalation rule read one value
   * twice and compare it with itself: a guard that could not fire, found by writing the test that
   * was supposed to watch it fire. A mode that keeps every word and drops the warning styling has
   * hidden the failure in the stylesheet, and that is now expressible and therefore checkable.
   */
  readonly severity: Severity;
}

/**
 * One player-facing item, in both modes at once.
 *
 * Both renderings are produced together and from the same source datum, which is what makes the
 * parity check a comparison rather than a re-derivation. A mode is a presentation: `advanced` and
 * `basic` may word a thing differently and may not disagree about it.
 */
export interface DisclosureItem {
  readonly id: string;
  readonly label: string;
  readonly origin: DisclosureOrigin;
  readonly advanced: Rendering;
  /** `null` when Basic hides it. Legal only where {@link disclosureClassOf} says `may-hide`. */
  readonly basic: Rendering | null;
  /**
   * The strings this item carries **because of what happened in the run**, verbatim from the
   * source datum.
   *
   * The reason from `summary.awtInvalidReason`; the diagnosis from `failStateReports`; the seed
   * from `recording.seed`; the warning from `recording.warnings`. Never a paraphrase — a
   * paraphrase is a second copy, and two copies of a reason are two reasons.
   *
   * Empty on a `may-hide` item, which nothing has to carry.
   */
  readonly mustCarry: readonly string[];
}

/** What one mode draws. `null` means the mode hides it. */
export function renderingIn(item: DisclosureItem, mode: ViewMode): Rendering | null {
  return mode === 'advanced' ? item.advanced : item.basic;
}

/** The items one mode draws, in order. */
export function itemsIn(
  items: readonly DisclosureItem[],
  mode: ViewMode,
): readonly (DisclosureItem & { readonly rendering: Rendering })[] {
  const drawn: (DisclosureItem & { rendering: Rendering })[] = [];
  for (const item of items) {
    const rendering = renderingIn(item, mode);
    if (rendering === null) continue;
    drawn.push({ ...item, rendering });
  }
  return drawn;
}
