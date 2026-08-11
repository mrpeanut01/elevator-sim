/**
 * Reading and writing the one slot — the four functions `dev/main.ts` calls.
 *
 * ## Why reading is two functions and writing is one
 *
 * {@link saveSession} writes the whole envelope, because a session is written at one instant.
 * Reading it back is {@link loadSession} *and* {@link loadLibrary}, because the two payload keys are
 * restored under two different rules: the week is all-or-nothing and the library is entry by entry.
 * `types.ts`'s `SavedLibrary` is where that distinction is argued and it is the reason the library
 * can be persisted at all. Folding the two readers into one would have meant a `SessionRestore`
 * that carried per-entry warnings — the third arm `types.ts` says must not exist.
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
import {
  libraryFrameIssue,
  librarySize,
  restoreLibrary,
  snapshotIssue,
  unknownContractsIn,
} from './validate.js';
import {
  EMPTY_LIBRARY,
  LIBRARY_BUDGET_CHARACTERS,
  SESSION_KEY,
  SESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSIONS_READ,
  type LibraryContext,
  type LibraryRestore,
  type SavedLibrary,
  type SessionRestore,
  type SessionRestoreFailure,
  type SessionSave,
  type SessionSnapshot,
  type SessionStore,
} from './types.js';

/**
 * What is actually written: a version, the session under it, and the library beside it.
 *
 * Three keys, and the version is a **sibling** of the payload rather than a field inside it. A
 * version nested in the thing it describes has to be reached through the shape it is supposed to be
 * vouching for, which is the ordering bug `record/document.ts` avoids by reading `schemaVersion`
 * off the top level before it looks at anything else.
 *
 * `library` is a sibling of `session` for a different reason and it is the design's whole hinge —
 * see `types.ts`'s {@link SavedLibrary}. Two consequences fall out of it here. First, `session` is
 * **unchanged from version 1, byte for byte**, so reading a version-1 envelope is reading the same
 * object through the same tables rather than migrating anything. Second, the two keys can be
 * refused by different rules without either rule being visible from the other: `session` is
 * all-or-nothing and `library` is entry-by-entry.
 */
interface SessionEnvelope {
  readonly schemaVersion: number;
  readonly session: SessionSnapshot;
  readonly library: SavedLibrary;
}

/**
 * The envelope's own key set, kept total by the compiler.
 *
 * `Readonly<Record<keyof SessionEnvelope, true>>` is the same device the union tables in
 * `validate.ts` use: a fourth field on the envelope that is not named here will not compile, and a
 * name here that the envelope no longer has will not either. Three keys is exactly the size at
 * which a hand-written list looks harmless and stops being read.
 */
const ENVELOPE_KEYS: Readonly<Record<keyof SessionEnvelope, true>> = Object.freeze({
  schemaVersion: true,
  session: true,
  library: true,
});

/**
 * What version 1 wrote, in full.
 *
 * Written out by hand, and **that is not the failure mode this repository keeps finding.** A
 * hand-maintained list goes stale because the thing it describes changes underneath it; this one
 * describes bytes written in the past by a build that has already shipped, and they cannot change.
 * What *can* change is the current version's shape, and that one is {@link ENVELOPE_KEYS} — derived
 * from the interface, so it cannot drift.
 */
const VERSION_1_KEYS: readonly string[] = Object.freeze(['schemaVersion', 'session']);

/**
 * The key set a given envelope version has, both directions.
 *
 * A version-1 envelope carrying `library` is refused — those bytes are not ours, because version 1
 * had no such key — and a version-2 envelope *without* one is refused for the same reason in the
 * other direction. Total by construction rather than by a lookup with a fallback: the only versions
 * that reach here are the ones in `SESSION_SCHEMA_VERSIONS_READ`, and there is no third shape for a
 * default arm to stand in for.
 */
function envelopeKeysFor(version: number): readonly string[] {
  return version >= 2 ? Object.keys(ENVELOPE_KEYS) : VERSION_1_KEYS;
}

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
  return {
    week: viewer.week,
    // Taken from the same state as `week` and never from anywhere else: the two are one campaign,
    // and a pair assembled from two instants can claim the same contract twice. `dev/main.ts`'s
    // `weeksForSession` is what makes sure the shell hands over a pair from one instant.
    parkedWeeks: viewer.parkedWeeks,
    settings: menu.settings,
    freePlay: menu.freePlay,
  };
}

/**
 * Which `ViewerState` field each shelf of the saved library is read from.
 *
 * One table rather than four literals in two places, and that is the whole point of it: {@link
 * libraryOf} reads through it and {@link patchTouchesLibrary} decides through it, so *what the
 * library is made of* and *what counts as changing the library* cannot disagree. A fifth shelf added
 * to `SavedLibrary` without a line here fails `persist.test.ts`'s derived cover, which reads the
 * shelf names back off a written envelope rather than being told them.
 */
export const LIBRARY_STATE_KEYS = Object.freeze({
  buildings: 'savedBuildings',
  dispatchers: 'savedDispatchers',
  patterns: 'savedPatterns',
  classes: 'savedClasses',
} as const);

/**
 * Whether a `ViewerState` patch moves anything the library is made of.
 *
 * ## Why this exists rather than *save on every change*
 *
 * `dev/main.ts`'s `MountContext.update` is the one choke point every panel writes state through, and
 * it is **hot**: every slider drag patches `dispatcherSpec` or `buildingSpec` sixty times a second.
 * Saving on each of those would put a `JSON.stringify` of the whole library inside a drag.
 *
 * The five patches that *do* move a shelf are all discrete button presses — the dispatcher editor's
 * save and delete, the building editor's save, the machines editor's save, the traffic editor's save
 * — which is why this predicate is a debounce all by itself, and why no timer is needed. That is
 * counted from the tree rather than assumed: `savedBuildings|savedDispatchers|savedPatterns|
 * savedClasses` are written from exactly those five sites plus `stateRunningSaved` and the JSON
 * editor's adopt, and none of them is on an `input` handler.
 *
 * `in` rather than a truthiness test, so a patch that empties a shelf — the delete button — is a
 * change like any other. An `undefined` value would be a caller writing *nothing* to a field the
 * state requires, which `ViewerState` does not permit; the check is about the key being present.
 */
export function patchTouchesLibrary(patch: Partial<ViewerState>): boolean {
  return Object.values(LIBRARY_STATE_KEYS).some((key) => key in patch);
}

/**
 * The four shelves, copied off the state as they are.
 *
 * Private for the same reason {@link snapshotOf} is: a public builder would let a caller assemble a
 * library out of three states, and there is one answer to what a saved library is. The four fields
 * travel **unnormalised** — no re-parse, no re-serialisation through a schema — so a saved building
 * comes back out of storage byte-identical to the one that went in, which `persist.test.ts` asserts
 * on a real one.
 */
function libraryOf(viewer: ViewerState): SavedLibrary {
  return {
    buildings: viewer[LIBRARY_STATE_KEYS.buildings],
    dispatchers: viewer[LIBRARY_STATE_KEYS.dispatchers],
    patterns: viewer[LIBRARY_STATE_KEYS.patterns],
    classes: viewer[LIBRARY_STATE_KEYS.classes],
  };
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
 *
 * The byte budget runs on the same ordering and for a sharper version of the same reason. There is
 * one slot and `write` replaces it whole, so a save that quietly dropped an oversized library would
 * be *deleting* the copy already in storage rather than declining to add to it — see
 * `types.ts`'s `library-too-large` arm, where that is argued at length. Refusing before the write
 * leaves the previous week **and** the previous library exactly where they were.
 */
export function saveSession(
  store: SessionStore,
  viewer: ViewerState,
  menu: MenuState,
): SessionSave {
  const envelope: SessionEnvelope = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    session: snapshotOf(viewer, menu),
    library: libraryOf(viewer),
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

  /*
   * Measured on the library alone rather than on the envelope, because the library is the only
   * unbounded part: the week's history is capped at `HISTORY_DAYS`, its `completed` arrays at 64
   * ids, and the whole of the rest is asserted under 64 000 characters by a test. Budgeting the
   * envelope would make the number that refuses a player's twentieth building depend on how many
   * days they have played, which is not a relationship anybody could explain.
   *
   * Safe to stringify: the walker above has just proved this value round-trips.
   */
  const libraryText = JSON.stringify(envelope.library);
  if (libraryText.length > LIBRARY_BUDGET_CHARACTERS) {
    const entries = librarySize(envelope.library);
    return {
      ok: false,
      failure: {
        kind: 'library-too-large',
        characters: libraryText.length,
        limit: LIBRARY_BUDGET_CHARACTERS,
        entries,
        message:
          `This session was not saved: the ${String(entries)} things you have saved come to ` +
          `${String(libraryText.length)} characters, and this build stores at most ` +
          `${String(LIBRARY_BUDGET_CHARACTERS)}. The previous save is untouched; deleting a saved ` +
          'building, dispatcher, pattern or machine class will let it save again.',
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

/** A readable envelope, opened as far as its two payload keys and no further. */
type EnvelopeRead =
  | { readonly ok: true; readonly version: number; readonly session: unknown; readonly library: unknown }
  | { readonly ok: false; readonly failure: SessionRestoreFailure };

/**
 * Everything up to and including *are these bytes ours* — read, parse, version, envelope keys.
 *
 * Factored out because {@link loadSession} and {@link loadLibrary} both need all of it and neither
 * needs the other's payload check. The alternative was one function returning both, and that would
 * have put the library's per-entry verdict inside {@link SessionRestore}'s two arms — the exact
 * third arm `types.ts` says must not exist. Two readers of one slot is the price of keeping the
 * week's rule and the library's rule from having to be expressed in one type.
 *
 * The slot really is read twice per boot. That is a `localStorage.getItem` and a `JSON.parse` of a
 * value already bounded by {@link LIBRARY_BUDGET_CHARACTERS}, once, at start-up.
 */
function readEnvelope(store: SessionStore): EnvelopeRead {
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
   * Version before shape, and a version outside the readable set is still refused in both
   * directions. The two sentences differ because the two situations do: a newer payload means the
   * player has been in a newer build and going back will not recover it, and an older one — older
   * than anything in `SESSION_SCHEMA_VERSIONS_READ`, so version 0 or below — means this build's
   * fields were not in that shape and inventing them would produce a week nobody played.
   *
   * Version 1 is *inside* the set and is therefore not here at all. `types.ts` argues why: version
   * 2 added a sibling key and changed nothing else, so reading a version-1 envelope invents no
   * field, and refusing it would take a player's week away over a feature they never used.
   */
  if (!SESSION_SCHEMA_VERSIONS_READ.includes(version)) {
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
        message:
          `The saved session ${direction} (saved as ${String(version)}, this build reads ` +
          `${SESSION_SCHEMA_VERSIONS_READ.join(' and ')}). Starting a fresh week.`,
      },
    };
  }

  const known = envelopeKeysFor(version);
  const extra = Object.keys(record).filter((key) => !known.includes(key));
  if (extra.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: `the session.${extra[0] ?? ''}`,
        message:
          `The saved session carries ${extra.join(', ')} beside its version, which a version ` +
          `${String(version)} session does not have.`,
      },
    };
  }

  const absent = known.filter((key) => !(key in record));
  if (absent.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: `the session.${absent[0] ?? ''}`,
        message:
          `The saved session is missing ${absent.join(', ')}, which every version ` +
          `${String(version)} session has.`,
      },
    };
  }

  /*
   * A version-1 envelope has no `library` key at all, and `EMPTY_LIBRARY` is not a default standing
   * in for one that is missing: it is what the player had. The build that wrote those bytes did not
   * persist a library, so every reload under it opened with an empty one.
   */
  return {
    ok: true,
    version,
    session: withRecordRefusals(
      withDayRecords(
        withParkedWeeks(withWindowStart(record['session'], version), version),
        version,
      ),
      version,
    ),
    library: version >= 2 ? record['library'] : EMPTY_LIBRARY,
  };
}

/**
 * A version 1 or 2 `session`, given the one key version 3 added.
 *
 * `EMPTY_LIBRARY`'s argument, one level further in, and it has to survive the same objection.
 * `null` is not a default standing in for a value nobody recorded: `null` means *"no window — run
 * the whole period"* (§ D286), and a build with no window concept ran the whole period on every
 * run it ever did. The absence **determines** the value rather than leaving it open, which is the
 * test `types.ts` states for whether an older envelope may be read at all.
 *
 * Returns the value untouched when it is not the shape this can complete — not an object, no
 * `freePlay`, a `freePlay` that is not an object, or one that already carries the key. Every one of
 * those is a session `snapshotIssue` is about to refuse **by name**, and completing a malformed
 * object first would replace a precise complaint with a vaguer one about whatever it found next.
 * The version-3 path returns immediately and is not merely a no-op through here, so a current
 * session cannot acquire a key it did not store.
 */
function withWindowStart(session: unknown, version: number): unknown {
  if (version >= 3) return session;
  if (!isPlainRecord(session)) return session;
  const freePlay = session['freePlay'];
  if (!isPlainRecord(freePlay) || 'windowStartS' in freePlay) return session;
  return { ...session, freePlay: { ...freePlay, windowStartS: null } };
}

/**
 * A version 1, 2 or 3 `session`, given the one key version 4 added — GitHub issue #107.
 *
 * {@link withWindowStart}'s argument, and it has to survive the same objection: is `[]` a value the
 * absence *determines*, or a guess about a list nobody wrote down? It is determined, and by a
 * defect rather than by a convention. Those builds had **one week slot**, and changing building
 * overwrote it — that is the whole of issue #107 — so at the instant those bytes were written there
 * were no other weeks to record. An empty list is what the player had.
 *
 * Returns the value untouched when it is not the shape this can complete, for the reason
 * {@link withWindowStart} gives: every one of those is a session `snapshotIssue` is about to refuse
 * by name, and completing a malformed object first replaces a precise complaint with a vaguer one.
 * The version-4 path returns immediately, so a current session cannot acquire a key it did not
 * store.
 */
function withParkedWeeks(session: unknown, version: number): unknown {
  if (version >= 4) return session;
  if (!isPlainRecord(session) || 'parkedWeeks' in session) return session;
  return { ...session, parkedWeeks: [] };
}

/**
 * A version 1–5 `session`, given the one key version 6 added — Everyday Mode slice 8.
 *
 * {@link withParkedWeeks}' argument, and the strongest form of it this module has needed.
 * `DayOutcome.record` is *the run a filed day was*, and `null` is *this day cannot be re-asked*. A
 * build with no record concept stored no seed, no building and no dispatcher against any day it
 * filed, so there is nothing to re-ask **with** — every day in those bytes really is unwatchable,
 * and `null` is what the player had rather than a stand-in for something nobody wrote down.
 *
 * ## Why this one reaches two levels down, where the others reach one
 *
 * The key is inside `week.history[]` and inside every `parkedWeeks[].history[]`, so the completion
 * has to walk them. It walks **only** those two paths and completes **only** the missing key: a
 * history entry that already carries `record` is returned untouched, so a version-6 session cannot
 * acquire anything here and the version guard above is not the only thing keeping it out.
 *
 * Returns whatever it cannot complete, untouched, for {@link withWindowStart}'s stated reason —
 * every such shape is one `snapshotIssue` is about to refuse **by name**, and completing a
 * malformed object first replaces a precise complaint with a vaguer one. A `history` that is not an
 * array and an entry that is not an object are both left exactly as found.
 */
function withDayRecords(session: unknown, version: number): unknown {
  if (version >= 6) return session;
  if (!isPlainRecord(session)) return session;
  const week = withHistoryRecords(session['week']);
  const parked = session['parkedWeeks'];
  return {
    ...session,
    week,
    ...(Array.isArray(parked) ? { parkedWeeks: parked.map(withHistoryRecords) } : {}),
  };
}

/**
 * A version 1–6 `session`, given the two keys version 7 added — `docs/20` defect 1.
 *
 * {@link withDayRecords}' argument, at the same two depths and one level deeper again, and both
 * completions rest on an absence that **determines** its value rather than leaving it open:
 *
 * - `DayOutcome.recordRefusal: null`. Those builds composed no sentence when they refused a
 *   record, so there is none to recover. `watch/library.ts` prints the *no reason was kept* arm for
 *   it, which is true of exactly these days.
 * - `WatchRecord.ruleRows: []`, **and the record's own `version` moved to 2**. That second half is
 *   the one to read twice, because it looks like a build rewriting stored data to suit itself. It
 *   is justified by the shape it is rewriting: shape 1's write gate — `watchRecordOf`, through
 *   `runIdentityIssues` — **refused to write a record at all for any state carrying a rule**, so
 *   every shape-1 record in existence describes a rules-free run. `[]` is not a default standing in
 *   for something nobody wrote down; it is the only value the record could have held, and after it
 *   is set the value genuinely is a shape-2 record. Leaving the version at 1 would make
 *   `recordUnreadableReason` refuse every day a player has ever filed, with a sentence about shapes
 *   that would be true and useless.
 *
 * It runs **after** {@link withDayRecords} rather than beside it, and the order is load bearing: a
 * version 1–5 envelope has no `record` key at all, and this pass writes into the record that pass
 * has just created. Composed rather than merged so each completion states one version's evidence.
 *
 * Returns whatever it cannot complete, untouched, for {@link withWindowStart}'s stated reason.
 */
function withRecordRefusals(session: unknown, version: number): unknown {
  if (version >= 7) return session;
  if (!isPlainRecord(session)) return session;
  const parked = session['parkedWeeks'];
  return {
    ...session,
    week: withHistoryRefusals(session['week']),
    ...(Array.isArray(parked) ? { parkedWeeks: parked.map(withHistoryRefusals) } : {}),
  };
}

/** One week's history, given version 7's key and its record's. */
function withHistoryRefusals(week: unknown): unknown {
  if (!isPlainRecord(week)) return week;
  const history = week['history'];
  if (!Array.isArray(history)) return week;
  return {
    ...week,
    history: history.map((outcome) => {
      if (!isPlainRecord(outcome)) return outcome;
      const withReason =
        'recordRefusal' in outcome ? outcome : { ...outcome, recordRefusal: null };
      const stored = withReason['record'];
      if (!isPlainRecord(stored) || 'ruleRows' in stored) return withReason;
      // See the docstring above for why the version moves with the key rather than being left to
      // refuse every day the player has filed. The `2` is a **literal on purpose**: this pass
      // completes a shape-1 record into a shape-2 one, and a future shape needs its own pass and
      // its own evidence rather than this one silently claiming whatever the constant says today.
      return { ...withReason, record: { ...stored, ruleRows: [], version: 2 } };
    }),
  };
}

/** One week, with `record: null` on every history entry that has no such key. */
function withHistoryRecords(week: unknown): unknown {
  if (!isPlainRecord(week)) return week;
  const history = week['history'];
  if (!Array.isArray(history)) return week;
  return {
    ...week,
    history: history.map((outcome) =>
      isPlainRecord(outcome) && !('record' in outcome) ? { ...outcome, record: null } : outcome,
    ),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Restore a whole session, or none of one, with the reason. Never throws.
 *
 * Every arm below is a `SessionRestoreFailure` a caller can word differently, and `absent` is
 * deliberately among them rather than being a `null` return: *nothing has been saved yet* is the
 * commonest outcome in the product's life and the only one that is not a problem, and a caller
 * that could not tell it from a corrupt payload would either apologise to every first-time player
 * or say nothing to a player who just lost a week.
 *
 * **The library is not restored here and it is checked here.** Its *frame* — four keys, four
 * arrays — is envelope structure, so a frame this build cannot read refuses the whole envelope on
 * the same footing as a missing `week`; `validate.ts#libraryFrameIssue` argues that line and the
 * counter-argument against it. Its *contents* are documents and belong to {@link loadLibrary}.
 */
export function loadSession(store: SessionStore): SessionRestore {
  const envelope = readEnvelope(store);
  if (!envelope.ok) return { ok: false, failure: envelope.failure };

  const shape = snapshotIssue(envelope.session);
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

  /*
   * The week's own shape first, and the library's frame second, for the ordering reason this module
   * states at the top: when two grounds both fire, the one that names the *cause a reader is looking
   * for* goes first. A player whose week is damaged is told about the week; the frame speaks only
   * when the week is fine, and it is then the only thing left that could say these bytes are not
   * ours.
   */
  const frame = libraryFrameIssue(envelope.library);
  if (frame !== undefined) {
    return {
      ok: false,
      failure: {
        kind: 'shape',
        field: frame.field,
        message: `The saved session is not the shape this build reads: ${frame.field} ${frame.message}. Starting a fresh week.`,
      },
    };
  }

  // Safe by construction: `snapshotIssue` has just walked every field of this value against the
  // tables that are generated from `SessionSnapshot`'s own keys.
  const snapshot = deepFreeze(envelope.session as SessionSnapshot);

  /*
   * Every week in the envelope, not only the live one — issue #107.
   *
   * A parked week names a contract for exactly the same reason the live one does, and a build that
   * has lost that contract would put the player back on it the moment they picked the building.
   * Checking only `snapshot.week` would have deferred the refusal to a control press, which is the
   * one place this module's own argument says it must not happen: *"the instant before anything is
   * in progress"* is the cheapest moment to be strict, and a week the player has just resumed is
   * the most expensive.
   */
  const missing = [
    ...new Set([snapshot.week, ...snapshot.parkedWeeks].flatMap(unknownContractsIn)),
  ].sort((a, b) => a.localeCompare(b));
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

/**
 * Restore the player's saved buildings, dispatchers, patterns and machine classes — entry by entry.
 *
 * Never throws, and **never fails**: it returns what survived and the list of what did not. That is
 * the asymmetry with {@link loadSession} and it is the whole point of the lane, argued at
 * `types.ts`'s `SavedLibrary`. The short form: a week's parts constrain each other and a library's
 * do not, so the week is restored whole or refused whole, and a library entry this build can no
 * longer parse is dropped and named while the rest come back untouched.
 *
 * ## What it does when the envelope itself is unreadable
 *
 * Returns an empty library and **no drops**. That looks like swallowing a failure and is not: the
 * same envelope has just been read by {@link loadSession}, which reports it as a
 * `SessionRestoreFailure` with the reason. Reporting it a second time here would put *"some of the
 * things you saved were dropped"* on screen beside *"your saved week could not be read"* — two
 * sentences about one set of bytes, and the first one implies a library survived when nothing did.
 * A version-1 envelope returns the same thing for a different and happier reason: there was no
 * library to lose.
 *
 * ## Its non-test caller
 *
 * `dev/main.ts`, **and the lead wires it.** The shell holds `BrowserResources`, which is
 * structurally a {@link LibraryContext}, and decides what to do with {@link LibraryRestore.dropped}
 * — `notice.ts#libraryNoticeFor` is the sentence.
 */
export function loadLibrary(store: SessionStore, context: LibraryContext): LibraryRestore {
  const envelope = readEnvelope(store);
  if (!envelope.ok) return { library: EMPTY_LIBRARY, dropped: [] };
  const restored = restoreLibrary(envelope.library, context);
  return { library: deepFreeze(restored.library), dropped: restored.dropped };
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
 * ## Its non-test caller
 *
 * `dev/main.ts#restoreSession`, and it arrived after this docstring said *"as this module lands,
 * nothing calls it"* — which was true then and had stopped being true without the sentence
 * changing. It is not a *forget this session* control yet: the shell clears the slot when a restore
 * is **refused**, so the same unreadable bytes cannot re-fail forever while every later save is
 * written over a slot the player can never get value from again.
 */
export function clearSession(store: SessionStore): boolean {
  try {
    store.remove(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
