/**
 * **The one career store this page has** — the DOM half of `campaign/careerPersist.ts`, on the
 * split `profile.ts` / `profileStore.ts` already keeps. GitHub issue #375.
 *
 * The backing is `window.localStorage` when the browser grants it, and nothing when it does not —
 * a private window that throws on touch, or the node test environment. A memory-only store is the
 * honest answer there: the career is kept for the session and the player is not told it was saved.
 *
 * A singleton for `profileStore.ts`'s reason, one level along: the host holds the career and the
 * campaign screens read it, and two instances would mean a career saved by one and read by the
 * other — the exact shape of the defect this issue closes.
 */

import {
  CAREER_QUARANTINE_KEY,
  CAREER_STORAGE_KEY,
  decodeCareer,
  encodeCareer,
  type CareerLoad,
} from '../campaign/careerPersist.js';
import type { CampaignCareer } from '../campaign/career.js';
import type { SessionStore } from '../persist/types.js';

export interface CareerStore {
  /**
   * The stored career, or a refusal that says why and a sentence for the player.
   *
   * **Moves the bytes aside on a refusal**, to `CAREER_QUARANTINE_KEY`. The notices promise the old
   * save was set aside rather than overwritten, and the host's one writer would otherwise save the
   * fallback career straight over it on the player's next action.
   */
  load(): CareerLoad;
  /** Write. Silently a no-op where storage is denied — the caller cannot fix that. */
  save(career: CampaignCareer): void;
}

function browserBacking(): SessionStore | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const storage = window.localStorage;
    return {
      read: (key) => storage.getItem(key),
      write: (key, value) => {
        storage.setItem(key, value);
      },
      remove: (key) => {
        storage.removeItem(key);
      },
    };
  } catch {
    /* Touching `localStorage` itself throws where storage is denied. Memory-only, honestly. */
    return undefined;
  }
}

export function createCareerStore(backing: SessionStore | undefined): CareerStore {
  let memory: string | null = null;
  let quarantine: string | null = null;

  /*
   * Every `SessionStore` method may throw — `persist/types.ts` says so, and a browser with site
   * data blocked throws on the *read*, not only on the getter `browserBacking` already guards.
   * `persist/session.ts` and `profile.ts` both guard the read for that reason; the first draft of
   * this file guarded only the write, so a page that opens on Everyday Mode would have died at
   * boot inside `createEverydayHost` rather than drawing a sentence.
   */
  const read = (): string | null => {
    if (backing === undefined) return memory;
    try {
      return backing.read(CAREER_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setAside = (bytes: string): void => {
    if (backing === undefined) {
      quarantine = bytes;
      return;
    }
    try {
      backing.write(CAREER_QUARANTINE_KEY, bytes);
    } catch {
      /* Quota or a denied write. The bytes stay where they are, which is no worse than before. */
    }
  };

  return {
    load: () => {
      const raw = read();
      const loaded = decodeCareer(raw);
      /* `empty` is not a refusal — there is nothing to set aside and nothing to apologise for. */
      if (loaded.refusal !== undefined && loaded.refusal !== 'empty' && raw !== null) {
        setAside(raw);
      }
      return loaded;
    },
    save: (career) => {
      const bytes = encodeCareer(career);
      if (backing === undefined) {
        memory = bytes;
        return;
      }
      try {
        backing.write(CAREER_STORAGE_KEY, bytes);
      } catch {
        /*
         * A full quota throws on write. Swallowed rather than surfaced: the career in memory is
         * unaffected and still playable, and a notice on every action would be worse than the
         * silence. `profile.ts` takes the same position on the same failure.
         */
      }
    },
  };
}

let shared: CareerStore | undefined;

/**
 * The store — the same one on every ask **where there is real storage to share**, and a fresh one
 * where there is not.
 *
 * The condition is the point, and it is not a test convenience. A page has one career and the
 * singleton is what makes the host and the campaign screens agree about it. A *process* running
 * many hosts — every node test file — has no `localStorage`, so a singleton there would share a
 * **memory** store between hosts that are supposed to be independent, and the second host would
 * open on the first one's career. Two campaign tests went red on exactly that.
 *
 * So: real backing, one store; no backing, nothing to share, so nothing is shared. Under node a
 * career still persists for the life of the host that owns it, which is what a memory-only store
 * honestly is.
 */
export function everydayCareerStore(): CareerStore {
  const backing = browserBacking();
  if (backing === undefined) return createCareerStore(undefined);
  shared ??= createCareerStore(backing);
  return shared;
}
