/**
 * **The state while somebody else's run is on the stage.**
 *
 * GAMEPLAY § 14.1. A decision number is owed; the argument is here.
 *
 * ## Why one line is a module
 *
 * § 14.1 makes a promise about state rather than about pixels:
 *
 * > A watched run cannot be closed, scored or posted. There is no `Close the day`; the day belongs
 * > to somebody else and is already closed. `dayClosed` is untouched, and so is your own day's
 * > state — stopping the watch returns you exactly where you were.
 *
 * *Untouched* is a checkable claim and it was living inside a click handler, where `dev/state.ts`'s
 * standing rule says it cannot be checked: **a decision made inside a click handler cannot be
 * tested, because the handler needs a document, a canvas and a click.** So the transition is a pure
 * function, the shell calls it, and `session.test.ts` asserts the untouched half **by object
 * identity** — `toBe`, not a deep compare a future field could slip past. That is `closedWeekOf`'s
 * own reason for returning its week by identity, one module over.
 *
 * ## What is not here, and why its absence is the lock
 *
 * The **restore** side. `dev/main.ts` holds a `WatchedBefore` snapshot and puts it back, and it is
 * there rather than here because three of its seven fields are boot-scope closure state the shell
 * owns outright — the transport's playhead, the filing gate, the rival's line. A module that
 * pretended to own them would be a second answer to who does.
 *
 * `simulatedRecording` is in neither. Nothing writes it on either transition, so there is nothing
 * to restore, and *the field not moving* is what refuses the watched run: `state.recording` is
 * somebody else's while `simulatedRecording` is still the player's, so
 * `shift/banking.ts#bankingRefusalFor` fails its object-identity comparison and `closeShift`
 * returns before it writes a day. `dev/main.ts#WatchedBefore` carries the rest of that argument,
 * including the single-writer guard that caught the first draft trying to save and restore it.
 */

import type { VizRecording } from '../contract/types.js';
import type { ViewerState } from '../dev/state.js';

/**
 * The state a spectator watches under — the player's own, with the replay on it and nothing else
 * moved.
 *
 * The fields this deliberately carries by reference are the four § 14.1 names: `week` (so
 * `dayClosed` cannot move), `report` and `tomorrow` (the sheet the player left open is still
 * theirs), and `interventions` (the spectator's own log is not the watched run's, and the watched
 * run's log lives in its record rather than on the state — contract § 1.5's *"replayed, not
 * offered"*).
 */
export function watchingStateOf(state: ViewerState, recording: VizRecording): ViewerState {
  return { ...state, recording };
}
