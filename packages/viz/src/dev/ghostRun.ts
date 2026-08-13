/**
 * What the ghost's second run **is** — Everyday Mode slice 4d, the config half.
 *
 * ## The seam, and why it is this one
 *
 * `docs/18` § Slice 4's verified work-order names it: the ghost's viable seam is
 * `campaign/stageRun.ts:49`'s two-arm same-seed request, with the second recording **kept**
 * rather than discarded — and *nobody* is free, because it is simply not issuing the second
 * request. This module is that statement for the shift: given the primary run's own
 * `SimulationConfig` — the one `shiftRunConfigOf` built and the worker ran — the ghost's config
 * is **that object with exactly one field swapped**, the dispatcher. Same building, same demand,
 * same seed, same window: the same crowd by construction, which is the whole of CRN and the only
 * thing that entitles the race strip to draw the two lines on one scale.
 *
 * Deriving a second config from `ViewerState` instead would be a second answer to *what is this
 * run* — `dev/shiftRunner.ts`'s header names that exact divergence — so the primary's config is
 * taken whole and never rebuilt.
 *
 * ## What is dropped, and why it is only one thing
 *
 * The player's mid-run `interventions` do not ride on the ghost: they are the player's own
 * driving (contract § 1.4's record), and a rival that inherited them would be partly the player.
 * Dropped as *no key at all*, `shiftRunConfigOf`'s own spelling — `core` promises a run with no
 * `interventions` key is byte-identical to one built before the field existed. Everything else
 * carries: the levers, selector and rules ride on `dispatcherProfile` itself and are therefore
 * swapped out **with** it, which is correct — they are facts about who is driving, not about the
 * crowd.
 *
 * ## The ghost run is a comparison, never a day
 *
 * The recording this config produces is adopted read-only beside the primary
 * (`dev/main.ts#adoptGhost`): it is never assigned to `state.recording` or
 * `simulatedRecording`, so `shift/banking.ts#bankingRefusalFor`'s object-identity gate refuses
 * it by construction, and it can touch neither `dayClosed`, the week, nor the board —
 * `ghostRun.test.ts` asserts the refusal on a real pair of recordings rather than trusting this
 * sentence.
 */

import type { DispatcherProfile, SimulationConfig } from '@elevator-sim/core/browser';

import { GHOST_OPTIONS, type GhostPick } from '../live/raceStrip.js';

import { PREFERRED_VIEWER_DISPATCHERS, preferredId } from './defaults.js';
import type { BrowserResources } from './data.js';
import type { SavedDispatcher } from './state.js';

/** Why *your latest saved* has nothing to run. Shown in the strip's verdict slot, never thrown. */
export const NO_SAVED_DISPATCHER =
  'nothing saved yet — save a dispatcher in the workshop and it will race here';

/**
 * The second request, or the reason there is none.
 *
 * `none` is the *nobody* pick: no request, no lines, no verdict — free by construction.
 * `refused` is a pick whose ghost this state cannot honestly produce, with the sentence the
 * strip shows; refusing in words rather than falling back to a different rival, because a rival
 * the player did not pick would be the strip inventing one.
 */
export type GhostPlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly reason: string }
  | {
      readonly kind: 'run';
      readonly config: SimulationConfig;
      /** The picked option's own label — what the strip's key calls the grey line. */
      readonly label: string;
      readonly dispatcherProfileId: string;
    };

/**
 * The plain baseline's profile: the one a fresh shift opens on.
 *
 * § D134's preference list (`dev/defaults.ts`), not a private literal — the same resolution
 * `initialState` uses, so *the plain baseline* and *what the viewer opens on* cannot drift into
 * being two different dispatchers. Falls back to file order exactly as the opening control does.
 *
 * Exported for the stage's `switch-dispatcher` intervention control (`dev/main.ts`), which hands
 * the rest of the day to exactly this profile: the ghost's *plain baseline* and the button's are
 * one resolution, so the rival the strip races and the driver the handover names cannot drift
 * into being two different dispatchers either.
 */
export function plainBaselineOf(resources: BrowserResources): DispatcherProfile | undefined {
  const profiles = resources.dispatcherProfiles.profiles;
  const id = preferredId(PREFERRED_VIEWER_DISPATCHERS, profiles) ?? profiles[0]?.id;
  return profiles.find((profile) => profile.id === id);
}

/**
 * Build the ghost's request from the primary run's own config.
 *
 * The moved-control rule (§ D177, applied before the panel per § D219) is what
 * `ghostRun.test.ts` holds this to: picking a different ghost must change the second
 * recording's legs, and picking *nobody* must issue no second request at all.
 */
export function ghostPlanOf(
  resources: BrowserResources,
  savedDispatchers: readonly SavedDispatcher[],
  primary: SimulationConfig,
  pick: GhostPick,
): GhostPlan {
  if (pick === 'none') return { kind: 'none' };

  const label = GHOST_OPTIONS.find((option) => option.id === pick)?.label ?? pick;
  const profile =
    pick === 'plain-baseline'
      ? plainBaselineOf(resources)
      : // *Latest* saved — the most recent save, because every writer of `savedDispatchers`
        // appends (`dev/dispatcherEditor.ts`). The option's own copy says latest, not best:
        // there is no rating to rank by, and the picker does not pretend otherwise.
        savedDispatchers[savedDispatchers.length - 1]?.profile;
  if (profile === undefined) {
    return {
      kind: 'refused',
      reason: pick === 'latest-saved' ? NO_SAVED_DISPATCHER : 'data/ declares no dispatcher profiles',
    };
  }

  // The primary's config, whole, with the dispatcher swapped and the player's own mid-run
  // interventions left behind — dropped as no key at all, per the header.
  const { interventions: _dropped, ...shared } = primary;
  return {
    kind: 'run',
    config: { ...shared, dispatcherProfile: profile },
    label,
    dispatcherProfileId: profile.id,
  };
}
