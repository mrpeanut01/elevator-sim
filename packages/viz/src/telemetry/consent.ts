/**
 * **Consent, and the identifier that may not exist without it** — GitHub issue #340,
 * `docs/26-telemetry-and-privacy.md` §§ 3 and 4.
 *
 * P-1 is the rule this module exists to make true: *"Nothing is collected without an explicit
 * grant. No event is queued, no identifier is minted and no request is made before a player has
 * said yes. The default is off, and a refusal is silent."* So the `playerId` is minted **here**,
 * inside the same function that records the grant, and there is no other way to obtain one. A
 * module that could mint an id and a module that recorded consent would be two modules that can
 * disagree, and the disagreement would be an identifier for somebody who said no.
 *
 * ## One slot, one version number
 *
 * § 4.1: *"in its own versioned slot — not spliced into `persist/`'s session envelope and not into
 * the profile envelope."* `everyday/profile.ts` states the reason in its own docstring: a lane that
 * puts a key inside another module's envelope creates two writers for one version number.
 *
 * **The state and the id share that one slot**, which § 5.1's two rows permit and one detail
 * requires. Those rows have different horizons on paper — the id *lives with the events*, the
 * consent state lasts *until cleared* — and identical behaviour on the device: withdrawal removes
 * the id and keeps the state, which is exactly what one envelope with an optional field expresses.
 * Two slots would be two version numbers for one decision, which is the thing above.
 *
 * ## Four states, and the third is the one a design forgets
 *
 * § 15.2's table. `unasked` is not a fourth kind of no — it is *the question has not been put*, and
 * it is the state a first load is in. `refused` and `withdrawn` are both off and are different
 * facts: one player never said yes, the other did and changed their mind, and only the second has
 * a deletion request behind it. Collapsing them would make § 15.2's withdrawn row unwritable.
 *
 * ## Everything returns a value and nothing throws
 *
 * `everyday/profile.ts`'s rule, for its reason: `localStorage` **throws** rather than failing — a
 * browser with site data blocked throws on the read, a full origin throws on the write — and the
 * natural caller of {@link grantConsent} is a button. A grant that threw would turn a full disk
 * into a dead consent screen, which is a worse outcome than a grant that does not survive the tab.
 * The setters therefore answer *did this survive*, and the shell says so on the surface.
 */

import type { SessionStore } from '../persist/types.js';

/** The one slot this module owns. Dotted and prefixed like every other key on this origin. */
export const CONSENT_KEY = 'elevator-sim.telemetry';

/** The envelope's version. An unknown one is refused rather than guessed at — see {@link readConsent}. */
export const CONSENT_SCHEMA_VERSION = 1;

/**
 * § 15.2's four states.
 *
 * `unasked` is the default and is a **no**: § 4.4, *"No screen waits on an answer. If the question
 * is unanswered, the answer is no."*
 */
export type TelemetryConsent = 'unasked' | 'granted' | 'refused' | 'withdrawn';

/** What the slot holds. The id is present exactly while the state is `granted`. */
export interface ConsentRecord {
  readonly state: TelemetryConsent;
  /** § 3.1's browser-profile id, or `undefined` on every state but `granted`. */
  readonly playerId: string | undefined;
}

/** The state a device that has never been asked is in. */
export const UNASKED: ConsentRecord = Object.freeze({ state: 'unasked', playerId: undefined });

interface Envelope {
  readonly version: number;
  readonly state: string;
  readonly playerId?: unknown;
}

/**
 * Whether a string is § 3.1's identifier: 128 bits, lower-case hex.
 *
 * Checked on the way **in** from storage as well as on the way out to the wire, because the slot is
 * a file on somebody's disk that another program can edit. A malformed id would be refused by the
 * server on every batch, so a session's whole telemetry would be silently lost; refusing it here
 * turns that into a state the player can see and fix.
 */
export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/u.test(value);
}

/**
 * Read the slot, or {@link UNASKED}.
 *
 * **Both directions of refusal**, which is `persist/types.ts`'s and `everyday/profile.ts`'s shape:
 * a version this build does not know is refused, and a shape the checks cannot vouch for is refused
 * whole rather than patched. Refusing to `unasked` rather than to `refused` is deliberate and is
 * the safe direction: an unreadable slot means nothing is collected *and* the question can be put
 * again, where an unreadable slot read as a refusal would silence a player who had said yes and
 * never let them be asked.
 *
 * A refused read does not clear the slot. A refusal is evidence, and the next successful write
 * overwrites the key anyway.
 */
export function readConsent(store: SessionStore | undefined): ConsentRecord {
  if (store === undefined) return UNASKED;
  let raw: string | null;
  try {
    raw = store.read(CONSENT_KEY);
  } catch {
    return UNASKED;
  }
  if (raw === null) return UNASKED;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return UNASKED;
  }
  if (typeof parsed !== 'object' || parsed === null) return UNASKED;
  const envelope = parsed as Envelope;
  if (envelope.version !== CONSENT_SCHEMA_VERSION) return UNASKED;
  const state = envelope.state;
  if (state !== 'granted' && state !== 'refused' && state !== 'withdrawn') return UNASKED;
  if (state !== 'granted') return Object.freeze({ state, playerId: undefined });
  /*
   * A grant with no usable id is refused whole rather than repaired by minting a new one. Minting
   * here would be an identifier appearing without a press, which is P-1 read the wrong way round —
   * and the player would silently become a second player to `docs/26 K4`.
   */
  if (!isPlayerId(envelope.playerId)) return UNASKED;
  return Object.freeze({ state: 'granted', playerId: envelope.playerId });
}

/** Write the slot. Answers whether it survived — see the module note on why nothing throws. */
function write(store: SessionStore | undefined, record: ConsentRecord): boolean {
  if (store === undefined) return false;
  try {
    store.write(
      CONSENT_KEY,
      JSON.stringify({
        version: CONSENT_SCHEMA_VERSION,
        state: record.state,
        ...(record.playerId === undefined ? {} : { playerId: record.playerId }),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a grant, **minting the identifier in the same call**.
 *
 * The id is the caller's to generate because 128 random bits need a source this module may not
 * reach — `crypto.getRandomValues` is the DOM half's, and `everyday/telemetryPort.ts` provides it.
 * What this module owns is that the id and the grant are written **together or not at all**: there
 * is no `mintPlayerId()` here to be called from anywhere else, so an id cannot come into existence
 * on a device whose owner has not said yes.
 *
 * A refused id is refused rather than corrected. A caller that hands over something that is not 128
 * bits of hex has a broken random source, and writing a grant with an id the server will reject on
 * every batch would be a consent screen that says yes and an instrument that collects nothing.
 */
export function grantConsent(
  store: SessionStore | undefined,
  playerId: string,
): { readonly record: ConsentRecord; readonly durable: boolean } {
  if (!isPlayerId(playerId)) return { record: UNASKED, durable: false };
  const record: ConsentRecord = Object.freeze({ state: 'granted', playerId });
  return { record, durable: write(store, record) };
}

/**
 * Record a refusal — **on the device, and nowhere else**.
 *
 * § 4.2: *"Nothing is transmitted, including the refusal. No identifier is minted, no request is
 * made, and the fact that somebody said no does not itself become a datum."* So this function
 * writes one slot and makes no network call, which is why it takes no transport and could not make
 * one if it wanted to.
 *
 * The cost is stated in § 4.2 rather than hidden: the consent rate is unmeasurable, and every KPI
 * is therefore measured on the consenting subset only — a self-selection bias of unknown size and
 * unknown direction, published beside every figure. *"A biased number with its bias stated is worth
 * more than an unbiased one obtained by ignoring the answer."*
 */
export function refuseConsent(store: SessionStore | undefined): {
  readonly record: ConsentRecord;
  readonly durable: boolean;
} {
  const record: ConsentRecord = Object.freeze({ state: 'refused', playerId: undefined });
  return { record, durable: write(store, record) };
}

/**
 * Record a withdrawal, **dropping the identifier**.
 *
 * § 4.3's third step. The first two — stop emitting, and send one deletion request naming the
 * `playerId` — belong to the recorder, because they are about a queue and a transport this module
 * does not have. This is the part that is about the device, and the order matters: the recorder
 * reads the id, sends the request, and only then calls this, or the request would have no id to
 * name.
 *
 * The state stays. A withdrawal is not an unasking: § 10 non-goal 3 forbids repeated asking after a
 * refusal, and a player who has withdrawn has answered.
 */
export function withdrawConsent(store: SessionStore | undefined): {
  readonly record: ConsentRecord;
  readonly durable: boolean;
} {
  const record: ConsentRecord = Object.freeze({ state: 'withdrawn', playerId: undefined });
  return { record, durable: write(store, record) };
}

/**
 * Remove the slot entirely — what *Clear saved progress* does to this key.
 *
 * Distinct from {@link withdrawConsent}, and the difference is what the player asked for. Withdrawal
 * is an answer to the consent question and is remembered. Clearing saved progress is a player
 * wiping this device, and a wiped device is one that has never been asked — so the question comes
 * back, which is right: the alternative is a slot that survives *clear everything* and quietly goes
 * on deciding.
 *
 * It sends nothing. A player clearing local progress has not asked for anything on a server to be
 * deleted, and § 4.3's deletion request is a separate press with its own sentence.
 */
export function clearConsent(store: SessionStore | undefined): void {
  if (store === undefined) return;
  try {
    store.remove(CONSENT_KEY);
  } catch {
    /* The same swallow as every other path here, for the module note's reason. */
  }
}
