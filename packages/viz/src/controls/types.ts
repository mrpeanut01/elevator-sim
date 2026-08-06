/**
 * The vocabulary of a **generated** parameter form: what a control is, before anything draws it.
 *
 * `docs/10-experience-layer-contract.md` § 11 **W4**, and CLAUDE.md invariant 8 is the whole
 * reason it can exist:
 *
 * > *"Every tunable declares its schema — type, range, default, and `activeWhen` for conditional
 * > parameters — so a generic optimizer can search the space without elevator-specific
 * > knowledge."*
 *
 * A form is an optimizer with a human in the loop. If the schema is complete enough for
 * `randomSearch` to move 49 dimensions it has never heard of, it is complete enough to draw them,
 * and docs/10 § 8.1 takes that decision: *"the dispatcher editor is generated from the schema."*
 *
 * ## The rule this module is written to keep
 *
 * **No control may name a parameter, a term, a profile or a building.** Not in a branch, not in a
 * lookup table, not in a label. `docs/10` § 11 W4 states the test — *"if your renderer needs to
 * know a term id or a profile id to work, it has failed"* — and the evidence for it is in
 * `controls.test.ts`, which builds the whole form from a **fictional** schema the product does not
 * ship. A form that only renders correctly because `data/dispatcher-profiles.json` happens to fit
 * it has proved nothing; that is § 7 of the wave-6 plan, and it is the reason the liveness test
 * does not touch `collectSearchSpace()`'s real output for its genericity claims.
 *
 * Everything a control shows comes off the declaration:
 *
 * | control field | schema source |
 * |---|---|
 * | `kind` | `SearchParameter.type`, the four kinds docs/06 names |
 * | `label` | `key` — the dotted id after its section |
 * | `help` | `description`, verbatim, 54 to 1 167 characters of prose written for a reader |
 * | `unit` | `unit`, absent for a dimensionless quantity |
 * | `reset` | `default`, the value the resolver applies when a profile says nothing |
 * | `enabled` / `inactive` | `activeWhen`, evaluated through the shipped `isActive` |
 *
 * ## Why an inactive control is drawn, and drawn with its reason
 *
 * docs/10 § 8.1: the `activeWhen` rule *"disables-with-reason rather than hides"*. This is R3's
 * shape one level down — a suppressed thing is replaced by the reason it is suppressed, never by a
 * blank — and it is also the only way the form can teach anything. A weight on a term the
 * profile's own settings make inert is the defect `policies.test.ts` exists to catch and the one
 * § D112 found shipped in `data/`; a control that silently vanished would hide exactly the
 * relationship the reader needs to see.
 *
 * ## Why a `Control` is not a `SearchParameter`
 *
 * A `SearchParameter` is a *declaration*: what the knob is. A `Control` is a declaration **at a
 * point** — what the knob is, what it currently holds, and whether the rest of the configuration
 * lets it matter. The second cannot be computed without the first *and* a full set of values, and
 * a renderer that took only the declaration would have to re-derive the gate, which is the second
 * source of truth CLAUDE.md's tuning discipline forbids.
 */

import type { ParameterScale, ParameterValue } from '@elevator-sim/experiments/browser';

/**
 * Every id in a space to the value it currently holds, **including inactive ids**.
 *
 * Deliberately *not* a `Candidate`. A `Candidate` omits every dimension whose gate is unmet —
 * *"absence means inactive"* — which is right for a search, because a search must not spend
 * replications on a knob that cannot move the objective. It is wrong for a form: the reader is
 * looking at the control, and the form has to be able to say *what it would hold* and *why it does
 * not count* in the same breath. {@link candidateOf} is the projection back to search semantics
 * and it is the only thing that should ever leave this module.
 */
export type ControlValues = ReadonlyMap<string, ParameterValue>;

/** What every control carries, whatever its kind. */
export interface ControlCommon {
  /** The parameter's dotted id. Unique in a form; used as the DOM id suffix. */
  readonly id: string;
  /** `id` up to the first dot. A grouping key, never a branch. */
  readonly section: string;
  /** `id` after the first dot — the control's visible name. */
  readonly label: string;
  /** The declaring schema's prose, verbatim. */
  readonly help: string;
  /** SI unit suffix, or absent. */
  readonly unit?: string | undefined;
  /** Whether `activeWhen` is satisfied at the current point. */
  readonly enabled: boolean;
  /**
   * Why the control is disabled, in the form *"`gate` is `x`; this needs `y`"*.
   *
   * Present exactly when `enabled` is `false`. Never a blank and never a bare "unavailable":
   * a reason a reader cannot act on is the failure R3 names.
   */
  readonly inactiveReason?: string | undefined;
  /** The `activeWhen` gate ids that are unmet, in declaration order. Empty when `enabled`. */
  readonly unmetGates: readonly string[];
  /**
   * The other controls this one is **currently holding shut** — § D252.
   *
   * The mirror of {@link unmetGates}, and the direction the form could not previously state.
   * `unmetGates` looks *up* a dependency and names what this control is waiting on; these two look
   * *down* it and name what is waiting on this control. Ids of parameters whose own `activeWhen`
   * declares this one as a gate, and whose condition on it the current point does **not** satisfy.
   *
   * Derived from the same declarations `unmetGates` is derived from, so the two ends of every edge
   * are computed from one source and cannot come to disagree about which edges exist.
   */
  readonly unlocks: readonly string[];
  /**
   * The other controls this one is **currently keeping live** — the other half of the partition.
   *
   * Ids of parameters that declare this one as a gate and whose condition on it the current point
   * **does** satisfy. Together with {@link unlocks} this is every dependant, exactly once: a
   * declared condition is either satisfied at a point or it is not.
   *
   * Both are needed rather than one, because a badge derived from {@link unlocks} alone would
   * vanish the moment the reader threw the switch — at exactly the point they are watching to see
   * what they just did.
   */
  readonly holdsOpen: readonly string[];
}

/** A continuous dimension: a range input beside a number input, honouring `scale`. */
export interface SliderControl extends ControlCommon {
  readonly kind: 'slider';
  readonly value: number;
  readonly reset: number;
  readonly min: number;
  readonly max: number;
  readonly scale: ParameterScale;
}

/** An integer dimension: a number input stepping by one. */
export interface StepperControl extends ControlCommon {
  readonly kind: 'stepper';
  readonly value: number;
  readonly reset: number;
  readonly min: number;
  readonly max: number;
}

/** A finite named set. */
export interface SelectControl extends ControlCommon {
  readonly kind: 'select';
  readonly value: string;
  readonly reset: string;
  readonly values: readonly string[];
}

/** A two-valued dimension. */
export interface CheckboxControl extends ControlCommon {
  readonly kind: 'checkbox';
  readonly value: boolean;
  readonly reset: boolean;
}

/** One control. Discriminated on `kind`; four cases, and the renderer has four branches. */
export type Control = SliderControl | StepperControl | SelectControl | CheckboxControl;

/**
 * The outcome of moving one control.
 *
 * A refusal is a **value**, not an exception, because a refusal is a thing the form draws:
 * docs/10 § 11 W4's acceptance is that a weight on a term whose `activeWhen` is unsatisfied is
 * *"refused **at the control**, with the reason"*, and a thrown error has nowhere to be drawn.
 */
export type ControlEdit =
  | { readonly accepted: true; readonly values: ControlValues }
  | { readonly accepted: false; readonly reason: string };
