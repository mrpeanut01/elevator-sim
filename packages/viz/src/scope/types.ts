/**
 * Change scope — what a control is allowed to move, and when.
 *
 * [`docs/16-change-scope-contract.md`](../../../../docs/16-change-scope-contract.md) is the
 * contract and `DECISIONS.md` § D216 is why it exists. The one-line version:
 *
 * > The viewer runs the day first and plays the recording back, so a control does not steer a day —
 * > it discards one and simulates a different one.
 *
 * Which makes *"when may this move?"* a real question with four answers, and makes the product's
 * most-used verb — the retry — a thing that has to be named rather than a thing that happens.
 *
 * ## The split this file is built on, and why it is not stylistic
 *
 * **The categories are named; the members are derived.** `mode/types.ts` states the same rule for a
 * different quantity and gives the reason: a named category is a compile error when a fifth one
 * appears, and a derived member set is a red suite when a new one appears. Written the other way
 * round — categories derived, members listed — both failures are silent.
 *
 * So {@link CHANGE_SCOPES} and {@link PLAY_MODES} are tuples that every exhaustive `switch` in this
 * directory walks, and the *controls* under them come from `Object.keys` of the state's own opening
 * values in `surface.ts`. § D213 is why: five hand-written lists in one branch had to be widened by
 * hand when three buildings landed, and two of them were guards that could no longer see what they
 * were guarding.
 *
 * ## Three kinds of entry, because two would lie
 *
 * A first draft had `control` and `output`. It could not describe the four editor working copies:
 * `dispatcherSpec` is written by a slider a player drags, so it is not an output — and moving it
 * changes **no leg**, because `shiftRunConfigOf` never reads it. Under a two-kind table it would
 * have had to be declared `presentation`, which is false in the way that matters: it is not that
 * this control cannot change a run, it is that it changes one *later*, through a save and a select.
 *
 * {@link LatentEntry} is that third answer, and it carries {@link LatentEntry.realisedBy} — the
 * field that turns it into a run — so the claim is checkable rather than a shrug. An absence is
 * indistinguishable from an oversight; § D106's argument about `measured: false` against `0`, one
 * layer up.
 */

/* -------------------------------------------------------------------------- *
 * The scopes
 * -------------------------------------------------------------------------- */

/**
 * The four, in widening order of how much of a game they fix.
 *
 * Named rather than derived — a fifth is a compile error at every `switch` in this directory, which
 * is the only way the answer to *"when may this move?"* stays one somebody gave.
 */
export const CHANGE_SCOPES = [
  'presentation',
  'within-day',
  'between-days',
  'between-games',
] as const;

export type ChangeScope = (typeof CHANGE_SCOPES)[number];

/**
 * The play modes, and the reason this union is separate from `mode/types.ts`'s `ViewMode`.
 *
 * `ViewMode` is **disclosure** — Casual against Engineer, how much of a run's machinery a reader is
 * shown. It says nothing about what may be changed. Four different things in this package wear the
 * word *mode* today (disclosure, the contract week, Free Play, the batch campaign) and only one of
 * them is in a union; this is the union for the other three, so *"which mode is this?"* has one
 * answer and a surface can be asked which one it belongs to.
 */
export const PLAY_MODES = [
  'shift-week',
  'endless',
  'free-play',
  'stage-campaign',
  'ranked',
  'incidents',
  'calendar',
  'commissioning',
] as const;

export type PlayMode = (typeof PLAY_MODES)[number];

/* -------------------------------------------------------------------------- *
 * The surface a scope is declared over
 * -------------------------------------------------------------------------- */

/**
 * One writable field, named by where it lives.
 *
 * Prefixed rather than flat, because `seed` exists in two of the three sources and they are not the
 * same field: `viewer.seed` is a `bigint` the run is built from, `free-play.seed` is the decimal
 * string the menu validates and the server replays. Collapsing them would make the table's
 * both-directions assertion pass while covering one of the two.
 */
export type SurfaceKey =
  | `viewer.${string}`
  | `settings.${string}`
  | `free-play.${string}`
  | `menu.${string}`;

/**
 * A field a player writes, with the scope it may be written at.
 *
 * **The declaration is here and the instrument is not.** `scope/probes.test-helper.ts` holds a
 * two-arm probe per control, and `scope.test.ts` runs both arms and compares **the legs** — § D177's
 * rule, and its inverse:
 *
 * - a non-`presentation` control whose two arms produce identical legs is **inert**, which is
 *   `docs/12` § 5 clause 9's violation;
 * - a `presentation` control whose two arms produce *different* legs has silently changed a run,
 *   which would make two players' scores incomparable while both looked valid — the exact failure
 *   `menu/types.ts` promises in prose and has never had a test for.
 *
 * The probes live in a test helper rather than on this interface because they construct states from
 * loaded `data/`, and a production table carrying closures that read `data/` would be an instrument
 * shipped in the bundle with no caller — the defect this repository has a rule about, introduced by
 * the module written to enforce it. `surface.test.ts` asserts the probe map covers exactly these
 * rows, in both directions, so a control with no probe is still red.
 */
export interface ControlEntry {
  readonly kind: 'control';
  readonly scope: ChangeScope;
  readonly why: string;
}

/**
 * A field a player writes whose effect is realised by another field.
 *
 * The four editor working copies and the four `editing*Id` pointers. Moving `dispatcherSpec` changes
 * no leg — `shiftRunConfigOf` reads `dispatcherId` and `savedDispatchers`, never the spec — and that
 * is correct rather than broken: an editor holds a draft until it is saved.
 *
 * {@link realisedBy} names the field that turns the draft into a run, and `surface.test.ts` requires
 * it to be a key the table itself declares. Without it this row would be indistinguishable from an
 * inert control, which is the thing this whole directory exists to catch.
 */
export interface LatentEntry {
  readonly kind: 'latent';
  readonly why: string;
  readonly realisedBy: SurfaceKey;
}

/**
 * A field the shell writes and no player controls.
 *
 * Declared rather than omitted. A field missing from the table is caught by the both-directions
 * assertion and has to be dispositioned by somebody; a field silently absent would be a control
 * nobody scoped, which is precisely the state this contract was written to end.
 */
export interface OutputEntry {
  readonly kind: 'output';
  readonly why: string;
}

export type ScopeEntry = ControlEntry | LatentEntry | OutputEntry;

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

/** Why a field may not move here, in words a player can act on. */
export interface ScopeIssue {
  readonly key: SurfaceKey;
  readonly scope: ChangeScope;
  readonly message: string;
}
