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
 * - **`ranked` permits `presentation` and `between-games` only.** Nothing else survives the server's
 *   replay (§ D214 § 3), and this row is not new — see `runIdentity.ts`, which found it already
 *   written out by hand in `dev/main.ts`.
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

/*
 * ## What is deliberately not here yet
 *
 * S7 also asks for the **sentence** a surface shows in place of a control its mode forbids, and for
 * the list of scopes a mode permits so a surface can draw them. Both were written here, and both
 * were deleted before this file landed, because `viz/deadCode.test.ts` reported them as exports with
 * no non-test caller — in the directory whose whole subject is that defect, on its first run.
 *
 * The roadmap's standing requirement is *"name the non-test caller"*, and the fix it prescribes is a
 * caller rather than an allowlist entry. The caller is the menu's affordance model, which does not
 * exist yet. So they arrive with it, and until then this module exports exactly the one function
 * something calls.
 */
