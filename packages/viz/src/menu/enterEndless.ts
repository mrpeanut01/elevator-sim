/**
 * What pressing **Keep going** means — the endless week, as a pure function.
 *
 * ## The string that had no code behind it
 *
 * `c5` and `c8` both name *endless mode* in their rewards, and until this module nothing anywhere
 * implemented one: a player who cleared the fifth scenario was told they had unlocked a thing the
 * product did not have. `docs/16` § 5 names that class of defect — a promise a surface makes and no
 * shipped path keeps — and it is the same shape as the Account row's *"Sign in to post a score"*
 * beside a `submit` with no caller.
 *
 * ## Why it is one field and not a mode branch
 *
 * The endless week **is** the day loop: the same 11 %/day growth, the same event schedule, the same
 * goals that harden as the week runs. What it drops is the contract, so nothing is banked and nothing
 * clears — and `shift/week.ts`'s {@link openEndless} expresses that with a sentinel id rather than a
 * type change, because every consumer already handles an id that resolves to no contract.
 *
 * So this function is deliberately small. If it were large, that would be the signal that endless had
 * become a second game loop maintained beside the first one.
 *
 * ## What it does *not* reset, and why that is a decision
 *
 * `docs/16` S6 — *entering a play mode resets every scope that mode does not permit* — asks nothing
 * of this function, because `permits('endless', …)` is `true` for all four scopes. That is not an
 * oversight in the matrix: endless restricting a scope the week it copies allows would be a different
 * game wearing the same loop.
 *
 * It is also why a held car and a moved lever survive the transition, which `enterFreePlay` clears.
 * The argument there was never S6 either — it was that the Free Play *screen* had just described the
 * run in six axes, and neither field was one of them. This screen describes nothing of the sort: it
 * says *keep the building you are on and stop counting*, and the shell's own controls are still on
 * screen showing exactly what is held.
 */

import { openEndless } from '../shift/week.js';
import type { ViewerState } from '../dev/state.js';

/**
 * The state the endless week starts from.
 *
 * Total and unconditional — unlike `enterFreePlay`, there is no selection to validate, so there is no
 * `undefined` arm. The building, the dispatcher, the seed and the shift length are all whatever the
 * player already had, which is the whole of what *keep going* means.
 */
export function enterEndless(state: ViewerState): ViewerState {
  return {
    ...state,
    playMode: 'endless',
    week: openEndless(),
  };
}
