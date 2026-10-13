/**
 * **Whether a cold launch opens the lobby** — the handoff's proposed Settings → *Skip the lobby*,
 * [§ D1445](../../../../DECISIONS.md).
 *
 * One boolean on a key of its own rather than a field in the profile envelope, for the reason
 * `rushDeviceStore.ts` keeps its own: the envelope is versioned and refuses what it cannot read, and
 * a preference this small is not worth a version and a migration. A missing, corrupt or denied
 * value reads as *show the lobby*, which is the default a player who never touched the row has.
 *
 * `localStorage` where the browser grants it, memory for the tab where it does not, and the setter
 * returns whether the choice reached storage, on `profileStore.ts`'s rule that the player is never
 * told a save happened that did not.
 */

export const LOBBY_SKIP_KEY = 'elevator-sim.everyday.skip-lobby';

/** The stored face of *skip*. Anything else, including nothing, is *show*. */
const SKIP = '1';

export interface LobbyStore {
  skip(): boolean;
  /** Returns whether the choice reached durable storage. */
  setSkip(skip: boolean): boolean;
}

function storage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

let memory = false;

export function everydayLobbyStore(): LobbyStore {
  return {
    skip: () => {
      const backing = storage();
      if (backing === undefined) return memory;
      try {
        return backing.getItem(LOBBY_SKIP_KEY) === SKIP;
      } catch {
        return memory;
      }
    },
    setSkip: (skip) => {
      memory = skip;
      const backing = storage();
      if (backing === undefined) return false;
      try {
        if (skip) backing.setItem(LOBBY_SKIP_KEY, SKIP);
        else backing.removeItem(LOBBY_SKIP_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}
