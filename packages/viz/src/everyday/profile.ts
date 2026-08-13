/**
 * **The player's name and picture, held once** — GAMEPLAY § 15.1's *You* section, and § 20.15's
 * check pointed at it: *the display name and avatar colour are read by board rows, the spectator
 * header and the rail card from one place*. In this build the boards and the spectator header are
 * unbuilt, so the readers are the rail's `PLAYING AS` card and the settings screen itself — but
 * the rule is why this module exists now rather than when a second reader arrives: two of the
 * three surfaces § 20.15 names would otherwise each grow their own copy of the name.
 *
 * Pure, like `rail.ts`: everything here is decidable without a document, so the words and the
 * validation are drivable by node tests and by the honesty sweep. The one DOM fact — where a
 * browser durably keeps a string — lives in `profileStore.ts`, which hands this module a
 * {@link SessionStore} and nothing else. That is `persist/`'s own split (`session.ts` decides,
 * `dev/main.ts` provides the adapter), reused rather than reinvented.
 *
 * ## The storage shape, and why it is `persist/`'s pattern in miniature
 *
 * One slot, one versioned envelope, and both directions of refusal: a version this build does not
 * know is refused (the bytes were written by whatever build last loaded, which after a deploy is
 * not this one), and a shape the checks cannot vouch for is refused whole rather than patched.
 * The slot is deliberately **not** a fourth key inside `persist/`'s session envelope: that
 * envelope is the Engineer session — the week, the menu settings, the free-play selection — and
 * is versioned, validated and owned there. The Everyday profile is a different product surface
 * with a different owner, and a lane splicing a key into another module's envelope is how two
 * writers end up disagreeing about one version number.
 *
 * Every path returns a value and none throws, for `session.ts`'s reason: the natural caller of
 * {@link saveProfile} is a keystroke in the name field, and a save that threw would turn a full
 * storage quota into a dead input. A refused read does not clear the slot — a refusal is
 * evidence, and the next successful save overwrites the key anyway.
 */

import { displayNameIssueOf } from '../menu/account.js';
import type { SessionStore } from '../persist/types.js';

/**
 * § 15.1's six curated colours — *sun, terracotta, moss, sky, ochre, slate* — in the prototype's
 * own order and hex (`elevator-sim-casual.dc.html`, `avatarSwatches`). The first four are § 19
 * palette tokens; **ochre and slate are prototype-sourced literals**, the same citation
 * `tokens.ts` gives its two rail surfaces: § 19 lists `#8D6A2F` and `#5F7268` only among the
 * shaft tints, and the prototype is canonical for what the screen offers, so the two values are
 * carried here with this note rather than re-derived from a canvas palette this frame does not
 * draw.
 *
 * A fixed list rather than a colour field a player types, because § 15.1 says why the avatar is
 * *an initial on a curated colour* at all: an uploaded picture is a moderation surface, and six
 * known colours read at 22 px.
 */
export const AVATAR_SWATCHES = [
  { id: 'sun', color: '#F2A63B' },
  { id: 'terracotta', color: '#B8462B' },
  { id: 'moss', color: '#4F8A5B' },
  { id: 'sky', color: '#4E9DD8' },
  { id: 'ochre', color: '#8D6A2F' },
  { id: 'slate', color: '#5F7268' },
] as const;

/** What travels with a posted run, once posting exists: the name, and the disc behind its initial. */
export interface EverydayProfile {
  readonly name: string;
  /** One of {@link AVATAR_SWATCHES}' colours — the load path refuses anything else. */
  readonly avatarColor: string;
}

/**
 * What a player is before they have told us anything: the prototype's own `you`, on sun — the
 * same fallback `rail.ts` already draws, held here so the two surfaces derive it from one value
 * rather than agreeing by coincidence.
 */
export const DEFAULT_EVERYDAY_PROFILE: EverydayProfile = Object.freeze({
  name: 'you',
  avatarColor: AVATAR_SWATCHES[0].color,
});

/**
 * The letter on the disc — the prototype's own derivation: the first *alphanumeric* character,
 * uppercased, `Y` when the name has none. One definition with two readers (the rail card and the
 * settings screen's 56 px disc), because an initial derived twice is a card and a screen showing
 * two different letters for one name the day the rule gains a nuance.
 */
export function avatarInitialOf(name: string): string {
  return (name.replace(/[^a-z0-9]/gi, '')[0] ?? 'Y').toUpperCase();
}

/** The slot. Dotted and prefixed like `persist/types.ts`'s `SESSION_KEY` and `dev/main.ts`'s mode key. */
const PROFILE_KEY = 'elevator-sim.everyday-profile';

/** The envelope's shape number — refused in both directions, `persist/`'s rule. */
const PROFILE_SCHEMA_VERSION = 1;

/** Version 1: the version beside the profile, `session.ts`'s sibling-not-field argument. */
interface ProfileEnvelope {
  readonly schemaVersion: number;
  readonly profile: EverydayProfile;
}

/**
 * The stored profile, or `undefined` — nothing stored yet, a store that throws, bytes that do not
 * parse, a version this build does not know, or a shape (name outside the server's own display
 * name rules, a colour outside the curated six) this build will not vouch for. All five land on
 * the same honest answer because the caller's next move is the same for all five: fall back to
 * {@link DEFAULT_EVERYDAY_PROFILE} and let the player set it again.
 */
export function loadProfile(store: SessionStore): EverydayProfile | undefined {
  let raw: string | null;
  try {
    raw = store.read(PROFILE_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const envelope = parsed as Partial<ProfileEnvelope>;
  if (envelope.schemaVersion !== PROFILE_SCHEMA_VERSION) return undefined;
  const profile = envelope.profile;
  if (typeof profile !== 'object' || profile === null) return undefined;
  const name = (profile as { name?: unknown }).name;
  const avatarColor = (profile as { avatarColor?: unknown }).avatarColor;
  if (typeof name !== 'string' || typeof avatarColor !== 'string') return undefined;
  /*
   * The same gate the save path holds, applied on the way back in: a stored name this build's own
   * rules refuse was written by something other than this build's save path, and restoring it
   * would put a string on the rail that the settings screen immediately marks refused.
   */
  if (displayNameIssueOf(name) !== undefined) return undefined;
  if (!AVATAR_SWATCHES.some((swatch) => swatch.color === avatarColor)) return undefined;
  return Object.freeze({ name, avatarColor });
}

/** Write the envelope. `false` is a full store or a refusing one — the caller says so on screen. */
export function saveProfile(store: SessionStore, profile: EverydayProfile): boolean {
  try {
    store.write(
      PROFILE_KEY,
      JSON.stringify({ schemaVersion: PROFILE_SCHEMA_VERSION, profile }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The live half: one in-memory value, its listeners, and the backing slot behind it.
 *
 * § 20.15's check is *changing the name updates the rail without a reload*, and a bare
 * load/save pair cannot satisfy it — somebody has to hear the write. The shell subscribes and
 * redraws the rail card; the settings screen writes. `set` updates memory and notifies **whether
 * or not the backing write succeeded**, because the two claims are different: the profile *is*
 * changed (every surface in this document must show it), and it may not survive the tab (which
 * {@link EverydayProfileStore.set}'s return value lets the screen say in words).
 */
export interface EverydayProfileStore {
  /** The profile, or `undefined` before anything was ever set or restored. */
  current(): EverydayProfile | undefined;
  /** Returns whether the profile now survives this tab — `false` on a memory-only store or a refused write. */
  set(profile: EverydayProfile): boolean;
  /** Hear every `set`. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/**
 * Build a store over a backing slot — or over nothing, which is a browser whose storage refuses
 * to exist (private windows, storage-disabled contexts) and the node test environment. A
 * memory-only store works completely within the tab; its `set` answers `false`, which is the one
 * fact the settings screen owes the player about it.
 */
export function createProfileStore(backing: SessionStore | undefined): EverydayProfileStore {
  let current = backing === undefined ? undefined : loadProfile(backing);
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    set: (profile) => {
      current = profile;
      const durable = backing !== undefined && saveProfile(backing, profile);
      for (const listener of [...listeners]) listener();
      return durable;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
