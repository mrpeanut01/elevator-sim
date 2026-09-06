/**
 * Which scopes a play mode permits — `docs/16` § 3, as an exhaustive function.
 *
 * A table would have been shorter. A `switch` with no `default` is what makes an eighth play mode or
 * a fifth scope a **compile error** rather than a row that silently permits everything, and § D163's
 * test for a bad criterion is exactly that: *a criterion whose every clause is already met is a
 * description, not a gate.* A permissions matrix that permits everything is the same shape.
 *
 * ## The three rows that carry an argument
 *
 * - **`free-play` forbids `between-days`.** A free-play run is *one run*: no week, no growth, no
 *   event. Permitting a between-days field is the defect `docs/16` § 5 clause 3 names — a Start that
 *   left `week.day` at 7 ran a building 66 % fuller than the one the menu described, and said
 *   nothing. This row is that bug restated as a rule, which is the only form of it that stays fixed.
 * - **`ranked` permits `presentation` and `between-games` only.** This row is not new — see
 *   `runIdentity.ts`, which found it already written out by hand in `dev/main.ts`.
 *
 *   Its stated reason used to be *"nothing else survives the server's replay (§ D214 § 3)"*, and
 *   **that stopped being true when the wire grew two fields** (GitHub issue #179): a `within-day`
 *   rule list and a `within-day` intervention log now travel on a `SubmittedRun` and re-simulate to
 *   the client's own metrics. The row is unchanged and correct, because what it decides is not
 *   *which runs may post*. Its one non-test caller is `runIdentity.ts#fieldsAnsweredFor`, where a
 *   scope this mode forbids means the field is **asked about**, and `CARRY_CHECKS` gives the answer.
 *   *May this move mid-day?* and *can the wire say it?* are two questions, and this file answers only
 *   the first — which is the same distinction issue #129 wrote into `runIdentity.ts` for
 *   `between-games`, arriving from the other side.
 * - **`commissioning` forbids `within-day`.** It is a design phase, not a shift: the whole point is
 *   that you choose the fabric and then live with it. A commissioning screen that let a player move
 *   a dispatcher weight would be the shift week with a different title.
 *
 * `stage-campaign`'s `within-day` permission is `true` here and **narrowed further downstream**: the
 * stage's own `editable` block decides *which* dimensions may move, through `campaign/dimensions.ts`,
 * which already refuses a dimension the discovered search space does not declare. Restating those
 * ids here would make this file the second place that has to change when `core` declares a knob.
 */

import { CHANGE_SCOPES, type ChangeScope, type PlayMode } from './types.js';

/**
 * Whether `mode` lets a `scope` field move.
 *
 * Total, exhaustive, and deliberately written as nested switches rather than a lookup: a lookup
 * whose key is missing returns `undefined`, and `undefined` in a permission check reads as `false`
 * at every call site — a mode that silently forbade everything would look like a working gate.
 */
export function permits(mode: PlayMode, scope: ChangeScope): boolean {
  switch (mode) {
    case 'shift-week':
    case 'endless':
    case 'incidents':
    case 'calendar':
      /*
       * The day loop and its variants. Every scope, because the week *is* the between-days axis.
       *
       * `endless` is here rather than in a row of its own because it *is* the day loop — the same
       * days, the same growth, the same events, the same goals that harden. What it does not have
       * is a contract, so nothing is banked and nothing clears. A mode that restricted a scope the
       * week it copies permits would be a different game wearing the same loop.
       */
      return true;
    case 'free-play':
      return scope !== 'between-days';
    case 'stage-campaign':
      // A stage fixes its building, its traffic and its seeds; what a player may move is the
      // dispatcher, and only the dimensions the stage declares.
      return scope === 'presentation' || scope === 'within-day';
    case 'ranked':
      return scope === 'presentation' || scope === 'between-games';
    case 'commissioning':
      return scope === 'presentation' || scope === 'between-games';
  }
}

/* -------------------------------------------------------------------------- *
 * The two exports that were deleted for want of a caller, and now have one
 * -------------------------------------------------------------------------- */

/*
 * Both of these were written here and deleted before this file first landed, because
 * `viz/deadCode.test.ts` reported them as exports with no non-test caller — in the directory whose
 * whole subject is that defect, on its first run. The roadmap's standing requirement is *name the
 * non-test caller*, and the fix it prescribes is a caller rather than an allowlist entry. The caller
 * is `menu/affordances.ts`, the menu's affordance model (GitHub issue #178 item 1, § D516): it asks
 * {@link permits} row by row through `offeredIn`, and draws {@link permittedLineFor} as the one
 * sentence a screen shows in place of the controls its mode never offers.
 */

/** The scopes `mode` lets move, in {@link CHANGE_SCOPES}' order. Derived from {@link permits}. */
export function permittedScopes(mode: PlayMode): readonly ChangeScope[] {
  return CHANGE_SCOPES.filter((scope) => permits(mode, scope));
}

/**
 * Each scope in the words a player reads. The ids are `docs/16`'s and are not player-facing; the
 * phrase is what a scope *means* on a screen, and it is kept beside the matrix so the sentence
 * below is pinned to the table it describes rather than authored screen by screen (§ D227's rule
 * that a refusal is pinned by the thing it is about, never by another sentence).
 */
export const SCOPE_WORDS: Readonly<Record<ChangeScope, string>> = Object.freeze({
  presentation: 'how the run is drawn',
  'within-day': 'the run while it plays',
  'between-days': 'the building between days',
  'between-games': 'the run’s own setup',
});

function listOf(words: readonly string[], joiner: 'and' | 'or'): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} ${joiner} ${words[words.length - 1] ?? ''}`;
}

/**
 * S7's sentence: what a mode lets a control move, and what it never offers a control for.
 *
 * Composed from {@link permittedScopes} rather than written per mode, so re-scoping a row in
 * {@link permits} changes this sentence on the same commit. A mode that permits everything gets the
 * first clause alone — there is nothing it withholds, and a second clause naming nothing would be
 * a refusal with no subject.
 */
export function permittedLineFor(mode: PlayMode): string {
  const permitted = permittedScopes(mode);
  const forbidden = CHANGE_SCOPES.filter((scope) => !permitted.includes(scope));
  const may = `In this mode a control may move ${listOf(permitted.map((scope) => SCOPE_WORDS[scope]), 'and')}.`;
  if (forbidden.length === 0) return may;
  return `${may} Nothing moves ${listOf(forbidden.map((scope) => SCOPE_WORDS[scope]), 'or')}, so no such control is offered.`;
}
