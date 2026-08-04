/**
 * Reading and writing the one slot — the three functions `dev/main.ts` calls.
 *
 * ## Why every path here returns a value and none of them throws
 *
 * The natural caller of {@link saveSession} is *every state change in the shell*: the product has
 * no mid-day intervention, so moving any control re-runs the day ([`docs/16`](../../../../docs/16-change-scope-contract.md)
 * § 1) and that is exactly the moment the week has changed and wants writing. A save that threw
 * would therefore turn a full storage quota into a dead slider. And the natural caller of
 * {@link loadSession} is boot, where a throw is a blank page.
 *
 * So both are total, `record/document.ts`'s argument applied to a second load path: *"a viewer's
 * failure rows all end in a message on screen and a previous run still playing. Throwing would make
 * the caller responsible for turning several kinds of failure into several different sentences,
 * which is how three of them end up sharing one."* Here there are six kinds and the cheapest one —
 * *nothing stored yet* — is not a failure at all.
 *
 * ## The order the refusals are asked in, and why it is that order
 *
 * Version before shape. A payload from a future build will usually be *both* a version this build
 * does not know **and** a shape it cannot read, and reporting the shape first would send a reader
 * hunting a corruption bug in a payload that is merely newer than they are. The same instinct as
 * `docs/03`'s abandonment-above-censoring ordering: when two grounds both fire, the one that names
 * the **cause** goes first, because the other one sends the reader after a backlog that went home.
 *
 * ## What this module does not do
 *
 * It does not clear the slot when it refuses to read it. A refusal is evidence — the bytes are the
 * only record of what the last build wrote, and a future build with a migration would want them.
 * They cost nothing to keep, because the next successful {@link saveSession} overwrites the key
 * anyway; there is one slot, and `write` replaces it whole. Forgetting is a decision a player makes
 * and {@link clearSession} is where they make it.
 *
 * It also does not read a clock. An envelope would ordinarily carry a written-at stamp, and this
 * one cannot: CLAUDE.md invariant 3 and `boundaries.test.ts` rule 2 give the wall clock exactly one
 * home in this package, `playback/clock.ts`. Nothing here needs one — there is a single slot, so
 * there is never a question of which save is newer.
 *
 * ## Its non-test caller
 *
 * `dev/main.ts`, and **the lead wires it.** The shell owns three decisions this module deliberately
 * does not make: what a real {@link SessionStore} is (the adapter over `localStorage`), *when* to
 * save, and what to say on screen when a restore is refused.
 */

import type { ViewerState } from '../dev/state.js';
import type { MenuState } from '../menu/types.js';

import { jsonRoundTripIssue } from './jsonSafety.js';
import { snapshotIssue, unknownContractsIn } from './validate.js';
import {
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  type SessionRestore,
  type SessionSave,
  type SessionSnapshot,
  type SessionStore,
} from './types.js';

/**
 * What is actually written: a version, and the session under it.
 *
 * Two keys, and the version is a **sibling** of the payload rather than a field inside it. A
 * version nested in the thing it describes has to be reached through the shape it is supposed to be
 * vouching for, which is the ordering bug `record/document.ts` avoids by reading `schemaVersion`
 * off the top level before it looks at anything else.
 */
interface SessionEnvelope {
  readonly schemaVersion: number;
  readonly session: SessionSnapshot;
}

/**
 * The envelope's own key set, kept total by the compiler.
 *
 * `Readonly<Record<keyof SessionEnvelope, true>>` is the same device the union tables in
 * `validate.ts` use: a third field on the envelope that is not named here will not compile, and a
 * name here that the envelope no longer has will not either. Two keys is exactly the size at which
 * a hand-written list looks harmless and stops being read.
 */
const ENVELOPE_KEYS: Readonly<Record<keyof SessionEnvelope, true>> = Object.freeze({
  schemaVersion: true,
  session: true,
});

/** `JSON.parse`'s position, when the engine gave one. `record/document.ts`'s helper, same reason. */
function parsePosition(message: string): number | undefined {
  const match = /position (\d+)/u.exec(message);
  if (match?.[1] === undefined) return undefined;
  return Number(match[1]);
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Frozen all the way down, because a restored session is a value and the layers above it assume so.
 *
 * `week.ts` returns a new `WeekState` from every transition and `week.test.ts` deep-freezes its
 * input to prove nothing is mutated. A session that arrived from `JSON.parse` is mutable, so
 * handing one back unfrozen would put the only mutable week in the product on the path that gets
 * the least attention. Safe without a cycle check: this value came out of `JSON.parse`, which
 * cannot produce one.
 */
function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

/**
 * What of the shell's state is worth keeping. See {@link SessionSnapshot} for what is left out and
 * why.
 *
 * Private, and taking the two states rather than a hand-built object, so that **there is one answer
 * to what a session is**. A public `snapshotOf` would let a caller assemble a fourth section, or
 * three sections from three different instants, and this module's whole premise is that a session
 * is written whole.
 */
function snapshotOf(viewer: ViewerState, menu: MenuState): SessionSnapshot {
  return { week: viewer.week, settings: menu.settings, freePlay: menu.freePlay };
}

/* -------------------------------------------------------------------------- *
 * Writing
 * -------------------------------------------------------------------------- */

/**
 * Write the session, or say why it was not written. Never throws.
 *
 * The round-trip guard runs **before** the store is touched, so a snapshot that could not be
 * reconstructed never displaces one that could. That ordering is the whole value of the guard: a
 * `JSON.stringify` that throws mid-write in a browser leaves the previous value intact anyway, but
 * the three quiet failures — a dropped key, a `NaN` written as `null`, a `Date` that comes back a
 * string — all *succeed* at writing and destroy the good save underneath. See `jsonSafety.ts`.
 */
export function saveSession(
  store: SessionStore,
  viewer: ViewerState,
  menu: MenuState,
): SessionSave {
  const envelope: SessionEnvelope = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    session: snapshotOf(viewer, menu),
  };

  const unsafe = jsonRoundTripIssue(envelope, 'the session');
  if (unsafe !== undefined) {
    return {
      ok: false,
      failure: {
        kind: 'unserialisable',
        path: unsafe.path,
        message: `This session was not saved: ${unsafe.path} ${unsafe.reason}.`,
      },
    };
  }

  let text: string;
  try {
    text = JSON.stringify(envelope);
  } catch (error) {
    /*
     * Unreachable if the walker above is complete, and kept precisely because that is a claim about
     * a function rather than a guarantee from the engine. `persist.test.ts` drives the walker
     * against the case that would otherwise land here; this arm is what stops a gap in it becoming
     * an exception in a click handler.
     */
    return {
      ok: false,
      failure: {
        kind: 'unserialisable',
        path: 'the session',
        message: `This session was not saved: JSON.stringify refused it — ${messageOf(error)}.`,
      },
    };
  }

  try {
    store.write(SESSION_KEY, text);
  } catch (error) {
    // A full origin (`QuotaExceededError`) or one that refuses writes (`SecurityError`). Both are
    // the player's browser telling us no, and neither is a reason to take the run off the screen.
    return {
      ok: false,
      failure: {
        kind: 'store',
        message:
          `This session was not saved: the browser refused to store ${String(text.length)} characters ` +
          `(${messageOf(error)}). Everything on screen still works; progress will not survive a reload.`,
      },
    };
  }

  return { ok: true, bytes: text.length };
}

/* -------------------------------------------------------------------------- *
 * Reading
 * -------------------------------------------------------------------------- */

/**
 * Restore a whole session, or none of one, with the reason. Never throws.
 *
 * Every arm below is a `SessionRestoreFailure` a caller can word differently, and `absent` is
 * deliberately among them rather than being a `null` return: *nothing has been saved yet* is the
 * commonest outcome in the product's life and the only one that is not a problem, and a caller
 * that could not tell it from a corrupt payload would either apologise to every first-time player
 * or say nothing to a player who just lost a week.
 */
export function loadSession(store: SessionStore): SessionRestore {
  let text: string | null;
  try {
    text = store.read(SESSION_KEY);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: 'unavailable',
        message:
          `This browser will not let the game read its saved sessions (${messageOf(error)}). ` +
          'Progress will not survive a reload; everything else works.',
      },
    };
  }

  if (text === null) {
    return {
      ok: false,
      failure: { kind: 'absent', message: 'No session has been saved in this browser yet.' },
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const message = messageOf(error);
    return {
      ok: false,
      failure: {
        kind: 'parse',
        position: parsePosition(message),
        message: `The saved session is not readable text (${message}). Starting a fresh week.`,
      },
    };
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: 'the session',
        message: 'The saved session is not an object, so it was not written by this game.',
      },
    };
  }

  const record = data as Record<string, unknown>;
  const version = record['schemaVersion'];
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: 'the session.schemaVersion',
        message:
          'The saved session carries no schema version, so there is no way to know what shape it is in.',
      },
    };
  }

  /*
   * Version before shape, and both directions refused. The two sentences differ because the two
   * situations do: a newer payload means the player has been in a newer build and going back will
   * not recover it, and an older one means this build's fields were not in that shape and inventing
   * them would produce a week nobody played.
   */
  if (version !== SESSION_SCHEMA_VERSION) {
    const direction =
      version > SESSION_SCHEMA_VERSION
        ? 'was saved by a newer version of the game, which this build cannot read'
        : 'was saved by an older version of the game, whose shape this build cannot read';
    return {
      ok: false,
      failure: {
        kind: 'version',
        found: version,
        supported: SESSION_SCHEMA_VERSION,
        message: `The saved session ${direction} (saved as ${String(version)}, this build reads ${String(SESSION_SCHEMA_VERSION)}). Starting a fresh week.`,
      },
    };
  }

  const extra = Object.keys(record).filter((key) => !(key in ENVELOPE_KEYS));
  if (extra.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: `the session.${extra[0] ?? ''}`,
        message: `The saved session carries ${extra.join(', ')} beside its version, which this build does not know.`,
      },
    };
  }

  const shape = snapshotIssue(record['session']);
  if (shape !== undefined) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: shape.field,
        message: `The saved session is not the shape this build reads: ${shape.field} ${shape.message}. Starting a fresh week.`,
      },
    };
  }

  // Safe by construction: `snapshotIssue` has just walked every field of this value against the
  // tables that are generated from `SessionSnapshot`'s own keys.
  const snapshot = deepFreeze(record['session'] as SessionSnapshot);

  const missing = unknownContractsIn(snapshot.week);
  if (missing.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'stale',
        missing,
        message:
          `The saved week is banked toward ${missing.length === 1 ? 'an assignment' : 'assignments'} ` +
          `this build no longer has (${missing.join(', ')}). Starting a fresh week rather than ` +
          'showing progress toward something that cannot be named.',
      },
    };
  }

  return { ok: true, snapshot };
}

/* -------------------------------------------------------------------------- *
 * Forgetting
 * -------------------------------------------------------------------------- */

/**
 * Drop the saved session. Never throws; `false` means the browser refused.
 *
 * The one operation that needs {@link SessionStore.remove}, and the reason the port has three
 * methods rather than two. It is separate from the load path on purpose — see this module's
 * docstring on why a refused payload is kept — so its caller is a player asking to start over, not
 * an error handler tidying up.
 *
 * **As this module lands, nothing calls it.** That is stated rather than papered over: `viz`'s
 * fifth dead-code audit (§ D192) will name it until `dev/main.ts` wires a *forget this session*
 * control, and naming a caller that does not call is precisely the defect that audit found twice on
 * its first run. A caller is the fix; an allowlist entry is not.
 */
export function clearSession(store: SessionStore): boolean {
  try {
    store.remove(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
