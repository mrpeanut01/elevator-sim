/**
 * The A–B repeat's cycle — `UX.md` `PB-09`.
 *
 * These are the assertions that make the mount's click handler decision-free. Every one of them
 * fails against the transport as it shipped before `PB-09`, because there was no window to mark:
 * `loop` was a `readonly boolean` read once in `Playback`'s constructor.
 */

import { describe, expect, it } from 'vitest';

import { NO_LOOP_MARK, nextLoopMark } from './loopMark.js';

describe('the A–B control cycles in three presses', () => {
  it('marks a start, then an end, then clears', () => {
    const first = nextLoopMark(NO_LOOP_MARK, 120);
    expect(first).toEqual({ span: null, pendingFromS: 120 });

    const second = nextLoopMark(first, 300);
    expect(second).toEqual({ span: { fromS: 120, toS: 300 }, pendingFromS: null });

    expect(nextLoopMark(second, 400)).toEqual(NO_LOOP_MARK);
  });

  it('re-marks the start rather than refusing a second press behind the first', () => {
    /*
     * The choice, not a consequence. `Playback#setLoop` refuses a reversed or zero-length window,
     * so the alternative to this is a press the reader can only recover from by pressing twice
     * more — and 07:00 after 09:00 reads as *actually, start here* far more often than it reads as
     * a request to run the shift backwards.
     */
    const marked = nextLoopMark(NO_LOOP_MARK, 540);
    expect(nextLoopMark(marked, 60)).toEqual({ span: null, pendingFromS: 60 });
    expect(nextLoopMark(marked, 540)).toEqual({ span: null, pendingFromS: 540 });
  });

  it('never produces a window Playback would refuse', () => {
    /*
     * The property the two clauses above exist for: whatever pair of instants a reader presses at,
     * the only window this machine ever hands over has positive length. A machine that could emit
     * `from === to` would throw out of a click handler.
     */
    const instants = [0, 0, 1, 60, 60, 599, 600, 600];
    let mark = NO_LOOP_MARK;
    for (const first of instants) {
      for (const second of instants) {
        mark = nextLoopMark(nextLoopMark(mark, first), second);
        if (mark.span !== null) expect(mark.span.toS).toBeGreaterThan(mark.span.fromS);
        expect(mark.span === null || mark.pendingFromS === null).toBe(true);
      }
    }
  });

  it('clears without a transport, and marks nothing without one', () => {
    expect(nextLoopMark({ span: { fromS: 1, toS: 2 }, pendingFromS: null }, undefined)).toEqual(
      NO_LOOP_MARK,
    );
    expect(nextLoopMark(NO_LOOP_MARK, undefined)).toEqual(NO_LOOP_MARK);
    const pending = { span: null, pendingFromS: 30 };
    expect(nextLoopMark(pending, undefined)).toEqual(pending);
  });
});
