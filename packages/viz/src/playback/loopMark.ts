/**
 * The A–B repeat's state machine — `UX.md` `PB-09`, *window selection then loop*.
 *
 * ## Why this is a module and not four lines inside the click handler
 *
 * `dev/main.ts` is a DOM mount and there is no jsdom in this repository (`vitest.config.ts` is
 * `environment: 'node'` for every project), so anything decided inside a listener is decided
 * somewhere no test can reach. The split `dom.ts` uses everywhere else applies here: **the
 * decision is a pure export and the DOM writing is decision-free.** What is left in the mount is
 * reading the playhead, writing three attributes and calling `Playback#setLoop` — none of which
 * can be wrong in an interesting way.
 *
 * ## Why one control with three states rather than two controls with one each
 *
 * *Mark start* and *mark end* as separate buttons is two pieces of state that can disagree — a
 * start marked after the end it belongs to, an end with no start, a control drawn on for a span
 * that is half-declared. A three-press cycle over one control cannot reach any of those, and ARIA
 * already has the vocabulary for it: `aria-pressed` takes `false`, `mixed` and `true`, which are
 * exactly *nothing marked*, *one end marked* and *a span the transport is repeating*.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { LoopWindow } from './playback.js';

/**
 * What the A–B control is holding.
 *
 * Exactly one of the two fields is ever set. A `span` is a window both of whose ends are marked
 * and which {@link Playback.setLoop} will accept; a `pendingFromS` is a start waiting for its end,
 * and it repeats nothing until it has one.
 */
export interface LoopMark {
  readonly span: LoopWindow | null;
  readonly pendingFromS: SimTime | null;
}

/** Nothing marked — the state the page boots in and the state a third press returns to. */
export const NO_LOOP_MARK: LoopMark = Object.freeze({ span: null, pendingFromS: null });

/**
 * One press of the A–B control, at `playheadS`.
 *
 * The cycle is *mark the start → mark the end → clear*, and three of its four edges are
 * unsurprising. The fourth is worth stating because it is a choice rather than a consequence:
 *
 * **A second press at or before the first re-marks the start.** It is not an error and it is not
 * silently swapped into a backwards span. A reader who pressed at 09:00 and then at 07:00 is
 * choosing 07:00 as a beginning far more often than they are asking for a span that runs
 * backwards, and `Playback#setLoop` would refuse the reversed pair anyway — so the alternative is
 * a refused press the reader can only recover from by pressing twice more. Equality is folded in
 * with it: a zero-length window is the same refusal, and re-marking is the same answer.
 *
 * `playheadS` is `undefined` when there is no transport to read one from. A press then can still
 * **clear** a mark — that needs no instant — and can mark nothing, because there is no instant to
 * mark.
 */
export function nextLoopMark(mark: LoopMark, playheadS: SimTime | undefined): LoopMark {
  if (mark.span !== null) return NO_LOOP_MARK;
  if (playheadS === undefined) return mark;
  if (mark.pendingFromS === null || playheadS <= mark.pendingFromS) {
    return { span: null, pendingFromS: playheadS };
  }
  return { span: { fromS: mark.pendingFromS, toS: playheadS }, pendingFromS: null };
}
