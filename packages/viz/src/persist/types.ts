/**
 * What a session *is*, the slot it is written to, and the port it is written through.
 *
 * ## Why the storage is injected rather than reached for
 *
 * `boundaries.test.ts` rules 3 and 4 confine the DOM to `dev/` and `node:` to `dev/` and the test
 * helpers, and `localStorage` is a DOM global. A persistence module that named it would either have
 * to live in `dev/` — where a decision needs a document, a canvas and a click to reach, which is
 * § D214 § 2's whole argument for why `menu/` exists — or it would have to be exempted from a rule
 * this package has kept since wave 1. Neither is worth it for three method calls, so the module
 * takes a {@link SessionStore} and `dev/main.ts` hands it the real one.
 *
 * That is not only a boundary trick. `localStorage` **throws** rather than returning an error: a
 * browser with site data blocked throws `SecurityError` on the *read*, and a full origin throws
 * `QuotaExceededError` on the *write*. Both are reachable in the shipped product and neither is
 * reachable in a test that cannot construct them — the injected port is what makes
 * `persist.test.ts` able to drive a store that throws, which is the case the module has to survive
 * and the one nobody would otherwise have exercised.
 *
 * ## Why the port is three narrow methods and not `Storage`
 *
 * `Storage` also carries `length`, `key(n)` and `clear()`. `clear()` is the dangerous one: this
 * origin already holds `elevator-sim.viewMode`, written by `dev/main.ts`, and a module handed the
 * whole interface is a module that can wipe a key it does not own. The port is the three
 * operations this module actually performs, so it cannot express the fourth.
 *
 * The names are `read`/`write`/`remove` rather than `getItem`/`setItem`/`removeItem`, which means
 * `localStorage` is **not** structurally assignable and `dev/main.ts` writes a three-line adapter.
 * That cost is deliberate and it is the same cost `menu/client.ts` pays for taking a `fetch`-shaped
 * function: a port named after the DOM's own methods invites the next reader to pass the global
 * straight through, and then the seam exists on paper and not in the code.
 *
 * ## Its non-test caller
 *
 * `dev/main.ts`, and **the lead wires it** — this module ships with the port, the envelope and the
 * refusals, and the shell supplies `localStorage` and decides when to save. Nothing here calls the
 * simulator, reads a clock or touches a document.
 */

import type { FreePlaySelection, Settings } from '../menu/types.js';
import type { WeekState } from '../shift/types.js';

/* -------------------------------------------------------------------------- *
 * The port
 * -------------------------------------------------------------------------- */

/**
 * Somewhere durable to put one string under one name.
 *
 * Every method may throw — that is what the browser's own implementation does — and every caller in
 * this module treats a throw as a value. See `session.ts`.
 */
export interface SessionStore {
  /** The stored string, or `null` when nothing has been written under `key`. */
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * The one slot this module owns.
 *
 * Dotted and prefixed to match `dev/main.ts`'s `elevator-sim.viewMode`, which has held the
 * disclosure mode since before this module existed. **The two are deliberately separate keys**, and
 * absorbing the mode into this envelope is not a tidy-up: `dev/main.ts` gives a `?mode=` deep link
 * precedence over the remembered value, on the ground that *"a deep link is somebody sending a
 * finding to somebody else"*, and that precedence rule is not this module's to re-litigate from a
 * directory that cannot read a query string.
 *
 * One slot rather than one per section, because a session is written at one instant and must be
 * read back as one. Three keys is three states that can disagree — a week from this build beside
 * settings from the last one — and the whole point of {@link SESSION_SCHEMA_VERSION} is that such a
 * combination is refused rather than guessed at.
 */
export const SESSION_KEY = 'elevator-sim.session';

/**
 * The shape number of the stored envelope, and a **refusal** rather than a guess when it differs.
 *
 * The idiom is `contract/types.ts`'s `VIZ_SCHEMA_VERSION` and so is the reasoning: the number is
 * only worth having if something reads it on a path where the two values can genuinely differ.
 * Here they can — the bytes were written by whatever build the player last loaded, which after a
 * deploy is not this one — so `loadSession` reads it and refuses in both directions.
 *
 * | version | what it holds |
 * |---|---|
 * | 1 | The first shape: the week, the menu `Settings` and the `FreePlaySelection`. |
 *
 * **Both directions are a refusal, and that is not symmetry for its own sake.** An older payload is
 * refused because the fields this build reads were not in that shape and inventing them is how a
 * player's Tuesday becomes a Monday nobody played. A newer payload is refused because this build
 * cannot know what a field it has never seen means — and silently dropping it would hand back a
 * *partially* applied week, which is the one outcome `SessionRestore` is written to make
 * impossible.
 *
 * **A field that cannot survive `JSON.parse(JSON.stringify(x))` is a test failure, not a surprise
 * later.** `jsonSafety.ts` is that test made into a run, and it exists because the trap is already
 * in the tree: `ViewerState.seed` is a `bigint` and `JSON.stringify` throws on one. Nothing in a
 * {@link SessionSnapshot} is a `bigint` today; the guard is what makes that a checked property of
 * the value rather than a claim about the types, which are erased by the time this code runs.
 */
export const SESSION_SCHEMA_VERSION = 1;

/* -------------------------------------------------------------------------- *
 * What is persisted
 * -------------------------------------------------------------------------- */

/**
 * The whole of what survives a reload — and the exclusions are the load-bearing half.
 *
 * ## What is here
 *
 * The week (`shift/types.ts`), the menu {@link Settings} and the {@link FreePlaySelection}. The
 * week is the reason the module exists at all: the product's progression *is* a seven-day week, and
 * until this landed a reload dropped the streak, the banked shifts and the seven-day history on the
 * floor.
 *
 * ## What is deliberately not here, each with its reason
 *
 * 1. **The recording** (`ViewerState.recording`). It is megabytes of step series, and it is a pure
 *    function of the seed and the configuration — `replay.test.ts` asserts that re-running a
 *    recording's seed reproduces it bit for bit, and `record/document.ts` refuses a document from
 *    another build outright. Storing it would put a second copy of a derivable fact in a slot with
 *    a five-megabyte quota, and the copy is the one that can drift.
 * 2. **The report** (`ViewerState.report`). A `DayReport` is `dayReportOf(week, observations, …)`
 *    — a function of the week that is restored and the recording that is not. Persisting it would
 *    put a sheet on screen describing a run that is no longer loaded, which is exactly the
 *    *"a caption is a claim about the run underneath it"* failure `shift/types.ts` names.
 * 3. **The account session token** (`menu/account.ts`'s `AccountState.token`). `account.ts` says in
 *    its own docstring that the token *"is held in memory only. It is deliberately **not** written
 *    to `localStorage`"* — this is a static app served from disk in development, a stored bearer
 *    token survives every tab on the origin, and the entire benefit of persisting it is not
 *    retyping a password. That decision is respected here rather than quietly reversed by a module
 *    whose job is to persist things, and `persist.test.ts` asserts the serialised envelope contains
 *    no `token` field at all, so the promise is kept by a run and not by this sentence.
 * 4. **The four editors' working copies** (`dispatcherSpec`, `patternSpec`, `machineSpec`,
 *    `buildingSpec`, with their `editing*Id` partners). A working copy is *dirty relative to the
 *    thing it was read from* — `withBuilding` re-seeds it only when `buildingSpecIsDirty` says it
 *    is pristine — so restoring one means restoring a diff against `data/`, and `data/` is free to
 *    change between the save and the load. A restored draft that silently became a draft of a
 *    different building is worse than no draft.
 *
 * The full ledger, derived from `initialState()` and `initialMenuState()` rather than written out,
 * is in `persist.test.ts`: **every** key of both states is either persisted or carries a stated
 * reason it is not, asserted in both directions. That is `scope/surface.test.ts`'s idiom, and it is
 * here for its reason — a list of what is excluded, maintained by hand, stops being read.
 */
export interface SessionSnapshot {
  readonly week: WeekState;
  readonly settings: Settings;
  readonly freePlay: FreePlaySelection;
}

/* -------------------------------------------------------------------------- *
 * Restoring — a value, never an exception
 * -------------------------------------------------------------------------- */

/**
 * Why nothing was restored.
 *
 * Six kinds rather than one, for `record/document.ts`'s reason: a caller handed a single failure
 * has to turn six situations into six sentences, which is how three of them end up sharing one.
 * *Nothing stored yet* is an ordinary first visit and *this browser refuses storage* is a thing the
 * player can fix; collapsing them would tell a first-time player their browser is broken.
 */
export type SessionRestoreFailure =
  /** The slot is empty. A first visit, or a session that was cleared. Not an error. */
  | { readonly kind: 'absent'; readonly message: string }
  /** The store itself threw — site data blocked, a disabled origin. */
  | { readonly kind: 'unavailable'; readonly message: string }
  /** The bytes are not JSON. Carries the offset when the engine reported one. */
  | { readonly kind: 'parse'; readonly message: string; readonly position: number | undefined }
  /** A session written by a build with a different envelope shape. */
  | {
      readonly kind: 'version';
      readonly message: string;
      readonly found: number;
      readonly supported: number;
    }
  /** Well-formed JSON of the wrong shape. {@link field} is the path, e.g. `week.history[0].day`. */
  | { readonly kind: 'shape'; readonly message: string; readonly field: string }
  /** Structurally fine, but it names something this build no longer ships. */
  | { readonly kind: 'stale'; readonly message: string; readonly missing: readonly string[] };

/**
 * Either a whole session or none of one.
 *
 * There is no third arm and there must not be. A `{ ok: true, warnings: [...] }` would be a
 * partially applied state wearing a success flag, and a partially applied state is a week whose
 * banked count came from the save and whose contract came from the default — a screen describing a
 * game nobody played.
 */
export type SessionRestore =
  | { readonly ok: true; readonly snapshot: SessionSnapshot }
  | { readonly ok: false; readonly failure: SessionRestoreFailure };

/* -------------------------------------------------------------------------- *
 * Saving — also a value
 * -------------------------------------------------------------------------- */

/** Why nothing was written. */
export type SessionSaveFailure =
  /**
   * The snapshot would not survive the round trip. {@link path} names the offending value.
   *
   * This is the `bigint` trap, caught before `JSON.stringify` can throw on it — see
   * {@link SESSION_SCHEMA_VERSION} and `jsonSafety.ts`.
   */
  | { readonly kind: 'unserialisable'; readonly message: string; readonly path: string }
  /** The store threw. A full origin, or one that refuses writes. */
  | { readonly kind: 'store'; readonly message: string };

/**
 * What a save did, as a value.
 *
 * A save that threw would take down whatever called it, and the natural caller is *every state
 * change in the shell* — so a full origin would turn moving a slider into a blank page. Losing a
 * save is a bad afternoon; losing the run on screen is a lost one.
 *
 * {@link bytes} is the serialised length, so a caller can say how close the slot is to a quota
 * without measuring it a second way.
 */
export type SessionSave =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly failure: SessionSaveFailure };
