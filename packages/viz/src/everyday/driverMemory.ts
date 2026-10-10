/**
 * **The driver a player picked for their week, kept for the next visit** — wave AN, lane AN-5,
 * [§ D1318](../../../../DECISIONS.md), the post-AM panel's seat A (defect 3).
 *
 * `viewer.dispatcherId` is not in the saved session (`persist/persist.test.ts` gives the reason: it
 * is part of the live run, and a Free Play selection carries its own). A reload of the same address
 * kept the pick only because the address carries `?dispatcher=` while it follows the run
 * (`dev/main.ts#deepLinkSearchOf`); the site opened again at its own address put the week's next day
 * back on the house dispatcher and said nothing. Seat A played four days on *Fairness first*, came
 * back, opened tomorrow, and the brief read *"Running the lifts: Conventional collective"*. A player
 * who did not re-check played the house, which had missed every day they had.
 *
 * So the pick is kept, under its own key beside `elevator-sim.viewMode` and
 * `elevator-sim.revealedTabs`, and for their reason rather than inside the session: a session is
 * refused whole when any part of it will not read, and an id this build no longer offers must cost
 * the player nothing but the pick. {@link rememberedDriverOf} answers only with an id the build or
 * the player's own library still offers, and `undefined` otherwise, which is the house, as before.
 *
 * Written by the brief's own pick alone (`everyday/host.ts#setDispatcher`, while no rush, replay
 * or career day stands), never by a handover on the stage, a rush's driver or a pinned day's house
 * order: what comes back is the driver the player chose for their week, not whoever drove last.
 *
 * Every read and write is total. `localStorage` throws where a browser blocks site data, the read is
 * at boot, and a throw there is a blank page.
 */

import type { SessionStore } from '../persist/types.js';

/** The slot. Dotted and prefixed like its two siblings. */
export const DRIVER_KEY = 'elevator-sim.driver';

/** Keep `dispatcherId` as the week's driver. A refusing store keeps nothing and says nothing. */
export function rememberDriver(store: SessionStore | undefined, dispatcherId: string): void {
  if (store === undefined) return;
  try {
    store.write(DRIVER_KEY, dispatcherId);
  } catch {
    /* Quota, a blocked origin, or a private window: the pick is live in memory either way. */
  }
}

/** Forget it — *Clear saved progress* asks the device to forget the week, and this is part of it. */
export function forgetDriver(store: SessionStore | undefined): void {
  if (store === undefined) return;
  try {
    store.remove(DRIVER_KEY);
  } catch {
    /* As above. */
  }
}

/**
 * The kept driver, when it names one of `offered`; `undefined` when nothing is kept, the store
 * refuses, or the id names a dispatcher this build and this library no longer offer.
 */
export function rememberedDriverOf(
  store: SessionStore | undefined,
  offered: readonly { readonly id: string }[],
): string | undefined {
  if (store === undefined) return undefined;
  let raw: string | null;
  try {
    raw = store.read(DRIVER_KEY);
  } catch {
    return undefined;
  }
  if (raw === null || raw === '') return undefined;
  return offered.some((profile) => profile.id === raw) ? raw : undefined;
}
