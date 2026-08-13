/**
 * **The one Everyday profile store this page has** — the DOM half of `profile.ts`, and the third
 * file in `boundaries.test.ts`'s `EVERYDAY_SHELL_FILES` set.
 *
 * A singleton rather than a constructor argument, and the constraint that forces it is the screen
 * registry's own shape: `screens.ts`'s `EverydayScreenContext` is deliberately minimal and shared
 * by every concurrent screen lane, so the settings screen cannot be handed a store through it —
 * and the shell (which draws the `PLAYING AS` card the store feeds) and the settings screen
 * (which writes it) must hold **the same instance** or § 20.15's check fails in the exact way it
 * exists to catch: the name changes here and the rail card does not move. One accessor, both
 * callers, one instance.
 *
 * The backing is `window.localStorage` when the browser grants it, and nothing when it does not —
 * a private window that throws on touch, or the node test environment. `profile.ts` documents
 * what a memory-only store honestly is; this file's only decision is which of the two this
 * environment gets, which is exactly the decision `dev/main.ts` makes for `persist/session.ts`'s
 * adapter, made once here for the Everyday side.
 */

import { createProfileStore, type EverydayProfileStore } from './profile.js';
import type { SessionStore } from '../persist/types.js';

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

let shared: EverydayProfileStore | undefined;

/** The store — created on first ask, the same one on every ask after. */
export function everydayProfileStore(): EverydayProfileStore {
  shared ??= createProfileStore(browserBacking());
  return shared;
}
