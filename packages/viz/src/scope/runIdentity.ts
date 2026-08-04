/**
 * *Can this run be reproduced elsewhere from its own selection?* — S5, derived once.
 *
 * ## The two consumers, and why one derivation
 *
 * 1. **`dev/main.ts#provenanceLineOf`** — the *copy a CLI line* control, which refuses rather than
 *    emitting a line the CLI would honour and turn into a **different** run (`UX.md` TP-13).
 * 2. **The leaderboard submit path** — because `packages/server` re-runs a submission from its ids
 *    and accepts the score only if it reproduces (§ D214 § 3).
 *
 * Those are the same question. They were not the same code: `provenanceLineOf` already enumerates
 * the refusals by hand — an unshipped building, an unshipped dispatcher, a saved pattern, a `week.day`
 * that is not 1, an event that changes anything, a held car, a moved lever — and the submit path
 * was about to enumerate them again.
 *
 * **Two answers to this question is not a tidiness problem; it is the one disagreement a
 * replay-verified leaderboard cannot survive.** A client that is *stricter* than the server refuses
 * something the server would have taken and nobody ever finds out. A client that is *looser* posts a
 * run the server cannot reproduce, and the server rejects it as a forgery — so the punishment for
 * the client's bug lands on an honest player, in the one place the product accuses somebody of
 * cheating. `menu/client.test.ts` makes the same argument about password bounds and calls the risk
 * one-directional; here it points both ways and the second direction is worse.
 *
 * ## Why the predicate is the scope table rather than a list
 *
 * The set of state a run may not carry is exactly *"everything outside `between-games`"*, which
 * `surface.ts` already declares and `scope.test.ts` already decides by running both arms. So this
 * module walks `SCOPE_OF` instead of naming fields, and a field added tomorrow with a `within-day`
 * scope is refused here on the day it lands rather than on the day somebody remembers.
 *
 * The three *"yours alone"* refusals are the exception and are kept explicit, because they are not
 * about a scope at all: `buildingId` is `between-games` and perfectly legal to move, and it is still
 * unreproducible when it names a building `data/buildings/` does not ship. That is a question about
 * the **value**, not the field, and only `resources` can answer it.
 */

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import type { BrowserResources } from '../dev/data.js';
import type { ViewerState } from '../dev/state.js';
import { eventFor } from '../shift/events.js';

import { permits } from './permits.js';
import { SCOPE_OF } from './surface.js';
import type { PlayMode, ScopeIssue, SurfaceKey } from './types.js';

/**
 * The `ViewerState` fields this module knows how to inspect, and the scope each is declared at.
 *
 * Derived from {@link SCOPE_OF} rather than listed — the whole point of the module docstring — but
 * *narrowed* to `viewer.` keys, because a `settings.` or `free-play.` key is not a field of the
 * state this predicate is given.
 */
function viewerControls(): readonly { readonly key: SurfaceKey; readonly field: string }[] {
  return Object.entries(SCOPE_OF)
    .filter(([key, entry]) => key.startsWith('viewer.') && entry.kind === 'control')
    .map(([key]) => ({ key: key as SurfaceKey, field: key.slice('viewer.'.length) }))
    .sort((a, b) => a.field.localeCompare(b.field));
}

/**
 * Whether a field is at its reproducible-from-selection value.
 *
 * Only the fields a scope forbids need an answer, so this is a `switch` over those and not over the
 * whole state. A field the table declares a control and this function does not know is a **red
 * test**, not a silent pass — `runIdentity.test.ts` asserts the two agree, which is what stops this
 * switch quietly shrinking as `ViewerState` grows.
 */
function carriesState(state: ViewerState, field: string): string | undefined {
  switch (field) {
    case 'week': {
      const event = eventFor(state.week.day, state.week.dayIdx);
      if (state.week.day === 1 && event.effect.changesNothing) return undefined;
      return (
        `day ${String(state.week.day)} grows the building by ${String(Math.round((state.week.day - 1) * 11))} % ` +
        `and schedules “${event.name}”, and neither travels with a selection`
      );
    }
    case 'outOfServiceCarIds':
      return state.outOfServiceCarIds.length === 0
        ? undefined
        : `${String(state.outOfServiceCarIds.length)} car(s) are held out of service, and nothing in a selection holds one`;
    case 'levers':
      return state.levers.parking === DEFAULT_LEVERS.parking &&
        state.levers.express === DEFAULT_LEVERS.express &&
        state.levers.dwell === DEFAULT_LEVERS.dwell
        ? undefined
        : 'the group levers are moved off their defaults, and a selection carries no levers';
    case 'savedClasses':
      return state.savedClasses.length === 0
        ? undefined
        : 'a saved machine class widens the specs this building resolves against, and only this browser has it';
    default:
      return undefined;
  }
}

/**
 * Everything about this state that stops the run being reproducible in `mode`, or an empty array.
 *
 * **All** the reasons, never the first. A reader told about one and then about the next has been
 * made to guess how many there are — `freePlayIssues`' rule, and the same argument.
 */
export function runIdentityIssues(
  state: ViewerState,
  resources: BrowserResources,
  mode: PlayMode = 'ranked',
): readonly ScopeIssue[] {
  const issues: ScopeIssue[] = [];

  /*
   * The value questions. `between-games` and still unreproducible: these three fields are legal to
   * move in every mode and name something only this browser has.
   */
  if (!resources.entries.some((entry) => entry.config.id === state.buildingId)) {
    issues.push({
      key: 'viewer.buildingId',
      scope: 'between-games',
      message: `the building “${state.buildingId}” is yours alone and data/buildings/ does not ship it`,
    });
  }
  if (!resources.dispatcherProfiles.profiles.some((profile) => profile.id === state.dispatcherId)) {
    issues.push({
      key: 'viewer.dispatcherId',
      scope: 'between-games',
      message: `the dispatcher “${state.dispatcherId}” is yours alone and data/dispatcher-profiles.json does not ship it`,
    });
  }
  if (
    state.pattern !== 'building' &&
    !resources.trafficProfiles.profiles.some((profile) => profile.id === state.pattern)
  ) {
    issues.push({
      key: 'viewer.pattern',
      scope: 'between-games',
      message: `the arrival pattern “${state.pattern}” is yours alone and no selection names a saved pattern`,
    });
  }

  /* The scope questions, walked from the table rather than listed. */
  for (const { key, field } of viewerControls()) {
    const entry = SCOPE_OF[key];
    if (entry === undefined || entry.kind !== 'control') continue;
    if (permits(mode, entry.scope)) continue;
    const carried = carriesState(state, field);
    if (carried !== undefined) issues.push({ key, scope: entry.scope, message: carried });
  }

  return Object.freeze(issues);
}

/*
 * A `reproducesFromSelection` boolean wrapper was written here and deleted before this file landed:
 * `viz/deadCode.test.ts` reported it as an export with no non-test caller, which is the defect this
 * directory exists to catch, caught on its own first run. Its caller is the submit path, and the
 * submit path does not exist yet — `menu/client.ts#submit` has none either, which is `docs/16` § 5
 * clause 8. Both arrive together or neither does; a caller is the fix, not an allowlist entry.
 */
