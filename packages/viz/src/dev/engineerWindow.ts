/**
 * **While a scored attempt stands, the Engineer surface only watches** — wave AN, lane AN-6,
 * [§ D1323](../../../../DECISIONS.md), the post-AM panel's seat D (D2 and D3).
 *
 * ## The back doors
 *
 * § D1239 held the Engineer transport at the attempt's reach and kept its close and its presses off
 * the attempt's run. Two of its controls still made runs. A dispatcher card re-ran the week's day on
 * the attempt's own crowd, and the Everyday stage adopted that practice and stopped at the identical
 * call, so every answer could be rehearsed there and then given for score after *Resume*. A building
 * card moved the week to another tower under a stage still drawing the attempt's run, which left the
 * stage unable to close. Seat D asked for the shape this module enforces: during a scored day the
 * Engineer surface is a window that follows the stage.
 *
 * ## The rule
 *
 * While an attempt stands on the week on screen (`shift/attempt.ts#attemptStandsOn`), or on the week
 * a write would put on screen, a write that would make or change a run of the day is refused, and so
 * is every ask for a run. The status line says why, in
 * `shift/banking.ts#ATTEMPT_ENGINEER_WATCHES_ONLY`, and the rail says it above its cards
 * (`ATTEMPT_RAIL_NOTE`). Writes that change only what the surface shows (a tab, the rail segment, an
 * editor's working copy of a building, a pattern or a machine) go through, because none of them
 * reaches a run.
 *
 * **Which writes reach a run is a table over every key of `ViewerState`**, {@link VIEWER_KEY_ROLES},
 * typed `Record<keyof ViewerState, …>`, so a key added to the state without being sorted here fails
 * the compile rather than slipping past the gate. A key is `'remakes-the-day'` when
 * `dev/state.ts#shiftRunConfigOf`, `#drivingProfileOf` or `watch/record.ts#watchRecordOf` reads it,
 * when it moves the week, when it is the library a run resolves against, or when it is the run or its
 * sheet; otherwise `'view'`.
 *
 * Pure and DOM-free. `dev/main.ts` owns the predicate (it holds the attempts) and mounts every
 * Engineer panel through {@link watchOnlyContext}; the Everyday host keeps the unguarded context,
 * because the attempt's own presses and answers are made there.
 */

import type { MountContext } from './mountTypes.js';
import type { ViewerState } from './state.js';

/** Whether writing a key of the state can make or change a run of the day. */
export type ViewerKeyRole = 'remakes-the-day' | 'view';

/** Every key of the state, sorted — see the module docstring for the rule. */
export const VIEWER_KEY_ROLES: Readonly<Record<keyof ViewerState, ViewerKeyRole>> = Object.freeze({
  playMode: 'remakes-the-day',
  calendar: 'remakes-the-day',
  commissioning: 'remakes-the-day',
  campaignFitOut: 'remakes-the-day',
  campaignEventId: 'remakes-the-day',
  commissioningConstraintId: 'view',
  mode: 'view',
  showMaths: 'view',
  tab: 'view',
  revealedTabs: 'view',
  railSegment: 'view',
  drawerOpen: 'view',
  buildingId: 'remakes-the-day',
  dispatcherId: 'remakes-the-day',
  pattern: 'remakes-the-day',
  shiftLengthS: 'remakes-the-day',
  windowStartS: 'remakes-the-day',
  freePlay: 'remakes-the-day',
  seed: 'remakes-the-day',
  outOfServiceCarIds: 'remakes-the-day',
  interventions: 'remakes-the-day',
  levers: 'remakes-the-day',
  selectorSpec: 'remakes-the-day',
  ruleRows: 'remakes-the-day',
  patience: 'remakes-the-day',
  paramDemand: 'remakes-the-day',
  lobbyCrowding: 'remakes-the-day',
  runnerTunables: 'remakes-the-day',
  week: 'remakes-the-day',
  parkedWeeks: 'remakes-the-day',
  savedDispatchers: 'remakes-the-day',
  savedPatterns: 'remakes-the-day',
  savedClasses: 'remakes-the-day',
  savedBuildings: 'remakes-the-day',
  /* § D886: the dispatcher editor's copy reaches the run while it is the running profile's. */
  dispatcherSpec: 'remakes-the-day',
  editingDispatcherId: 'remakes-the-day',
  patternSpec: 'view',
  editingPatternId: 'view',
  machineSpec: 'view',
  editingClassId: 'view',
  buildingSpec: 'view',
  editingBuildingId: 'view',
  recording: 'remakes-the-day',
  report: 'remakes-the-day',
  withheld: 'remakes-the-day',
  tomorrow: 'remakes-the-day',
});

/**
 * Whether `patch` writes a value other than `state`'s own under any key that reaches a run. A whole
 * state handed in as a patch (the rail's `withDispatcher` and `withBuilding`) counts only the keys
 * it changes, so a write of the state as it stands is not refused. A key the table does not know is
 * read as reaching a run.
 */
export function patchRemakesTheDay(state: ViewerState, patch: Partial<ViewerState>): boolean {
  const roles: Readonly<Record<string, ViewerKeyRole | undefined>> = VIEWER_KEY_ROLES;
  for (const [key, value] of Object.entries(patch)) {
    if (roles[key] === 'view') continue;
    if (value !== (state as unknown as Readonly<Record<string, unknown>>)[key]) return true;
  }
  return false;
}

/**
 * The refusal for an Engineer write, or `undefined` where it may go ahead. Without a patch, the ask is
 * for a run of the state as it stands. With one, it is refused when it reaches a run and the window
 * holds over the state now or over the state it would make: the second is a building card or a select
 * that would put a week with an attempt standing on it on screen.
 */
export function watchOnlyRefusal(
  state: ViewerState,
  patch: Partial<ViewerState> | undefined,
  refusalFor: (over: ViewerState) => string | undefined,
): string | undefined {
  if (patch === undefined) return refusalFor(state);
  if (!patchRemakesTheDay(state, patch)) return undefined;
  return refusalFor(state) ?? refusalFor({ ...state, ...patch });
}

/**
 * `context` with its two writes gated: `refuses` answers `true` when it refused (and has said why).
 * Everything else is the context as given, so a tab, a failure and a mode entry behave as before.
 */
export function watchOnlyContext(
  context: MountContext,
  refuses: (patch?: Partial<ViewerState>) => boolean,
): MountContext {
  return {
    ...context,
    update(patch) {
      if (refuses(patch)) return;
      context.update(patch);
    },
    runShift(onRan) {
      if (refuses()) return;
      context.runShift(onRan);
    },
  };
}
