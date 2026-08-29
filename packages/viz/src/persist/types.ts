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

import type {
  DispatcherProfiles,
  ElevatorSpecs,
} from '@elevator-sim/core/browser';

import type { MachineClass } from '../authoring/machineSpec.js';
import type { SavedBuilding, SavedDispatcher, SavedPattern } from '../dev/state.js';
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
 * | 2 | The same `session` object, **byte for byte**, plus a sibling {@link SavedLibrary}. |
 * | 3 | `session.freePlay` gains `windowStartS` — the first version to change the week's own shape. |
 * | 4 | `session` gains `parkedWeeks` — the weeks the player is not currently playing (issue #107). |
 * | 5 | No new key: three **value** domains widen inside the week's readings (the worst-wait goal). |
 * | 6 | `DayOutcome` gains `record` — the run a filed day was, so it can be watched (slice 8). |
 *
 * **A newer payload is still refused**, because this build cannot know what a field it has never
 * seen means — and silently dropping it would hand back a *partially* applied week, which is the
 * one outcome `SessionRestore` is written to make impossible.
 *
 * ## Version 1 is *read*, and that is a decision with a reason rather than a relaxation
 *
 * The first draft of this docstring refused an older payload too, *"because the fields this build
 * reads were not in that shape and inventing them is how a player's Tuesday becomes a Monday nobody
 * played"*. That argument is sound and it does not reach version 1 → 2, because **nothing is
 * invented**. Version 2 adds a whole new sibling key and changes not one byte of `session`, so
 * reading a version-1 envelope means:
 *
 * - the week, the settings and the selection are read from exactly the same object, checked by
 *   exactly the same tables — not a migrated one, not a defaulted one;
 * - the library restores **empty**, which is not a guess about what the player had. It is what the
 *   player had: the build that wrote those bytes did not persist a library, so every reload under
 *   it opened with an empty one. An empty library is the *measured* state of a version-1 session,
 *   not a stand-in for an unknown one.
 *
 * Refusing anyway would take a player's week away to punish them for a feature they never used,
 * which is the outcome this whole module exists to avoid. So {@link SESSION_SCHEMA_VERSIONS_READ}
 * is the set that is accepted and {@link SESSION_SCHEMA_VERSION} is the one that is written.
 *
 * ## Version 3 is the case the paragraph above predicted, and it is read anyway — on the evidence
 *
 * That paragraph ended by saying that *"the day the two sections stop being independent — a version
 * 3 that **changes** the week's shape — the older direction goes back to being a refusal, because
 * then it really would be inventing."* Version 3 is that day: `session.freePlay` gains
 * `windowStartS`, which is inside the week's own object rather than a sibling beside it. The
 * prediction was right about the shape and wrong about the conclusion, and the reason is worth
 * keeping rather than quietly deleting.
 *
 * **`windowStartS: null` for a version 1 or 2 session is not a default and not a guess.** `null`
 * means *"no window — run the whole period"* (§ D286), and a build with no window concept ran the
 * whole period every time. So it is the same argument the empty library already makes one section
 * up: it is not a stand-in for an unknown value, it is the **measured** state of a session written
 * before the field existed. Nothing is invented, so nothing is refused.
 *
 * The test of that claim is not this paragraph. `session.test.ts` restores a real version-2
 * envelope and asserts the week, the settings and every other selection field come back *identical*
 * — so the reading is byte-for-byte except for the one key whose value is derived from the absence
 * itself.
 *
 * The rule the older paragraph was reaching for still stands, restated: **a shape change refuses
 * the older direction when the new field's absence does not determine its value.** A version 4 that
 * added, say, a per-day dispatcher choice would have no honest reading of a session that never made
 * one, and would refuse. That is the question to ask, not whether the field sits in `session` or
 * beside it.
 *
 * ## Version 4 is read for the same reason, and the reason is a defect rather than an argument
 *
 * `parkedWeeks` is the weeks a player has stepped away from (issue #107). A version 1–3 envelope has
 * none, and `[]` is not a default standing in for a list nobody wrote down: **there was one slot and
 * changing building overwrote it**, so a build that wrote those bytes had already destroyed every
 * week except the one in `session.week`. An empty list is the *measured* state of such a session,
 * exactly as `windowStartS: null` is the measured state of a build with no window concept and an
 * empty library is the measured state of version 1. Nothing is invented, so nothing is refused.
 *
 * The reading is one-way, and the newer direction stays a refusal for the ordinary reason: a
 * version-5 payload may hold a field this build would drop, and a partially applied week is what
 * {@link SessionRestore} exists to make impossible.
 *
 * ## Bumping is not optional, and version 3 exists because it was skipped once
 *
 * `windowStartS` shipped **without** this constant moving. The envelope still said 2, so a
 * version-2 session missing the key was not read as *older*, it was read as **malformed** — the
 * player was told their saved week was *damaged*, which was false, and it was told to every player
 * who had one. `validate.ts`'s extra-key branch already says the rule outright — *"the envelope
 * version should have changed when that field landed"* — and it only ever said it in the direction
 * that adds keys. Both directions are the same rule. If a field enters or leaves
 * {@link SessionSnapshot}, this number moves in the same commit.
 *
 * **A field that cannot survive `JSON.parse(JSON.stringify(x))` is a test failure, not a surprise
 * later.** `jsonSafety.ts` is that test made into a run, and it exists because the trap is already
 * in the tree: `ViewerState.seed` is a `bigint` and `JSON.stringify` throws on one. Nothing in a
 * {@link SessionSnapshot} is a `bigint` today; the guard is what makes that a checked property of
 * the value rather than a claim about the types, which are erased by the time this code runs.
 *
 * ## Version 5 moves for new *values*, not a new key, and it is read backwards on the evidence
 *
 * The worst-wait goal (Everyday Mode slice 5) widened three value domains inside the week's
 * persisted readings without adding or removing a single key: `ShiftGoal.reads` gained
 * `worstWaitS`, `ShiftGoal.unit` gained ` s`, and the missed glyph became `×`. A version-4 build's
 * `validate.ts` checks `reads` and `unit` against **its** closed lists, so a session written here
 * and met by that build would be refused as *damaged* — the exact false accusation the version-3
 * paragraph records — where a version it does not read is refused as *newer*, which is true. Both
 * directions are the same rule the extra-key branch states: the envelope version changes when the
 * payload can say something an older reader has never seen, whether the novelty is a key or a
 * value.
 *
 * Reading versions 1–4 here invents nothing: a history whose days carry three readings is the
 * measured state of a week played before the fourth goal existed, and `wasDisplayOf` answers the
 * em dash for a quantity yesterday never measured — which is the honest answer, not a default.
 * The bump-on-new-values rule is § D408; this paragraph is the argument it was drawn from.
 *
 * ## Version 6 adds a key to a **nested** shape, and it is read backwards on the same evidence
 *
 * Everyday Mode slice 8 (GAMEPLAY § 14.1, ENGINE_CONTRACT § 1.5) needed a filed day to be
 * *watchable*, and the persisted day could not reconstruct its own run: `DayOutcome` carried the
 * outcome — arrived, carried, `minutePct`, the readings — and nothing about the **question**. Not
 * the seed, not the building, not the dispatcher, not the intervention log. `shift/banking.ts`
 * counts the same gap against a `VizRecording` and gets *one of eight*; this counts zero of eight,
 * because a day's history entry was never meant to describe a run.
 *
 * So `DayOutcome` gains `record` — `watch/types.ts#WatchRecord`, or `null`. The key is inside
 * `week.history[]` and `parkedWeeks[].history[]`, one level deeper than any previous bump has
 * reached, and the same two questions decide it:
 *
 * - **Does the absence determine the value?** Yes, and by the strongest form of the argument this
 *   docstring has used. `null` means *this day cannot be re-asked*, and a build with no record
 *   concept could not re-ask any day it filed — no seed was stored, so there is nothing to re-ask
 *   *with*. Every day in a version 1–5 envelope really is unwatchable, so `null` is the measured
 *   state and not a stand-in. `session.ts#withDayRecords` performs the completion.
 * - **Can an older build read what this one writes?** No, which is why the number moves. A
 *   version-5 reader meets `record` in a history entry and `isObjectOf`'s extra-key branch refuses
 *   the envelope as *damaged* — the false accusation the version-3 paragraph records. Refusing it
 *   as *newer* is true; refusing it as damaged is not.
 *
 * The newer direction stays a refusal for the ordinary reason — § D408, which states both
 * questions once for every future bump.
 *
 * ## Version 7 adds a key at **two** depths at once, and both absences determine their value
 *
 * `docs/20` defect 1. Two things were wrong with a filed day that could not be watched, and fixing
 * either without the other leaves a half-answer:
 *
 * - **The refusal had no cause.** Every unwatchable day said one sentence — *"filed without the
 *   record of what it ran … days closed from here on carry one"* — which blamed the file format and
 *   was false in its second clause: whatever refused this day refuses the next one identically.
 *   `DayOutcome` gains `recordRefusal`, the sentence `watch/record.ts#recordRefusalFor` composes at
 *   the moment the day closes, because nothing can recover it afterwards.
 * - **The commonest cause did not have to be a cause at all.** Writing one Everyday rule made every
 *   later day unwatchable, and rules are four scalars per row that this envelope already carries
 *   elsewhere. `WatchRecord` gains `ruleRows` and moves to shape 2, so a rules run is watchable
 *   instead of refused.
 *
 * The two questions, as every paragraph above asks them:
 *
 * - **Does the absence determine the value?** For both, and by the strongest form of the argument.
 *   `recordRefusal: null` on a version 1–6 day is a *measurement*: those builds composed no
 *   sentence, so there is none to recover, and `watch/library.ts` says exactly that rather than
 *   inventing a cause. `ruleRows: []` on a stored record is stronger still — shape 1's **own write
 *   gate refused every state with a rule in it**, so an empty list is the only list such a record
 *   could ever have described. That is why `session.ts#withRecordRefusals` may also set the stored
 *   record's `version` to 2: after the completion the value *is* a shape-2 record, and the claim is
 *   justified by the gate that wrote it rather than by a hope about what it contained.
 * - **Can an older build read what this one writes?** No, twice. A version-6 reader meets
 *   `recordRefusal` in a history entry and `ruleRows` inside its record, and `isObjectOf`'s
 *   extra-key branch refuses the envelope as *damaged* — the false accusation the version-3
 *   paragraph records. Refusing it as *newer* is true; refusing it as damaged is not.
 *
 * The newer direction stays a refusal for the ordinary reason — § D408 again, and this is its
 * third application rather than a third rule.
 */
export const SESSION_SCHEMA_VERSION = 7;

/**
 * Every envelope shape this build can read, newest last.
 *
 * Separate from {@link SESSION_SCHEMA_VERSION} because *what is written* and *what is read* are two
 * questions and this module had been answering them with one number. There is exactly one writer
 * and it always writes the newest; the reader is the half that meets a player who has not reloaded
 * since the last deploy.
 */
export const SESSION_SCHEMA_VERSIONS_READ: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

/* -------------------------------------------------------------------------- *
 * What is persisted
 * -------------------------------------------------------------------------- */

/**
 * The **week** — one thing whose parts constrain each other, restored whole or not at all.
 *
 * ## What is here
 *
 * The week (`shift/types.ts`), the menu {@link Settings} and the {@link FreePlaySelection}. The
 * week is the reason the module exists at all: the product's progression *is* a seven-day week, and
 * until this landed a reload dropped the streak, the banked shifts and the seven-day history on the
 * floor.
 *
 * ## What is beside it rather than in it
 *
 * The player's {@link SavedLibrary} is persisted too, and it is deliberately **not a field of this
 * interface** — it is a sibling of it inside the envelope. That placement is the whole design and
 * it is argued at {@link SavedLibrary}; the short version is that this type is all-or-nothing and a
 * library is not.
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
  /**
   * The weeks the player is not currently playing — one per assignment, GitHub issue #107.
   *
   * ## Why this is inside the all-or-nothing half rather than beside it like the library
   *
   * A parked week looks like a library entry — several independent documents, restorable one at a
   * time — and it is not one, because {@link week} and this list are **two views of one campaign**.
   * They share `completed`, they must never both claim the same `contractId`, and the number a
   * player reads off the scenarios panel is derived from whichever of them is on screen. Restoring
   * the live week and dropping a parked one would hand back a campaign in which Garden Apartments
   * was cleared according to one field and untouched according to the other — the *"a week whose
   * banked count came from the save and whose contract came from the default"* failure this type's
   * own docstring names, with a second week to disagree with instead of a default.
   *
   * A saved building is genuinely independent of the other nineteen. A parked week is not
   * independent of the week beside it, so it goes in the half that is refused whole.
   */
  readonly parkedWeeks: readonly WeekState[];
  readonly settings: Settings;
  readonly freePlay: FreePlaySelection;
}

/* -------------------------------------------------------------------------- *
 * The library — the same slot, a different rule
 * -------------------------------------------------------------------------- */

/**
 * Everything the player has drawn, tuned or authored: their buildings, dispatchers, arrival
 * patterns and machine classes.
 *
 * ## Why this is not a field of {@link SessionSnapshot}, and why it restores per entry
 *
 * **This is the distinction the whole design turns on, and it will otherwise read as a violation of
 * the rule next door.** {@link SessionRestore} has two arms and must never grow a third, because a
 * `{ ok: true, warnings: […] }` week would be *"a week whose banked count came from the save and
 * whose contract came from the default — a screen describing a game nobody played"*.
 *
 * That rule is about a state **whose parts constrain each other**. The week's `streak`,
 * `cleanRun`, `banked` and `history` are four views of one sequence of days: drop `banked` and keep
 * `history` and the two disagree about a week that was actually played, and nothing on screen says
 * which half is true. There is no honest partial week.
 *
 * A library is not one of those. The saved buildings are **independent documents**. Dropping one
 * that this build can no longer parse leaves the other nineteen exactly as true as they were —
 * *Tower B* being unreadable says nothing whatever about *Tower A*, because no field of one is a
 * view of the other. So the library restores **per entry**, an entry that fails validation is
 * dropped **and named** ({@link DroppedEntry}), and the week keeps its all-or-nothing rule
 * untouched.
 *
 * The placement follows from that rather than decorating it. Sitting the library **beside**
 * `session` in the envelope rather than inside it means the two rules cannot be confused by
 * anything reading the bytes: one key is restored whole or refused whole, the next key is restored
 * entry by entry, and no type in this module can express *half a week*. It is also what makes
 * version 1 readable at all — see {@link SESSION_SCHEMA_VERSION}.
 *
 * ## The three objections, and where each is answered
 *
 * `GAPS.md` § 3 recorded three reasons this was excluded from version 1. None of them is answered
 * by a sentence:
 *
 * 1. **Unbounded size.** {@link LIBRARY_BUDGET_CHARACTERS} is a declared ceiling, checked before
 *    the store is touched; over it, the save is refused with the size in the sentence rather than
 *    thrown or truncated. See {@link SessionSaveFailure}.
 * 2. **These are `core`'s shapes, not this envelope's.** Every entry is re-validated on the way
 *    back in **through the validator the rest of the product already uses** —
 *    `editor/editorValidate.ts` for a building, `parseDispatcherProfiles` for a dispatcher,
 *    `parseElevatorSpecs` for a machine class — so *readable* means exactly *this build's own
 *    loader would take it*, and never a second opinion about legality. See `validate.ts`.
 * 3. **Not tracked by the envelope's version.** It is now: version 2 is this key.
 */
export interface SavedLibrary {
  readonly buildings: readonly SavedBuilding[];
  readonly dispatchers: readonly SavedDispatcher[];
  readonly patterns: readonly SavedPattern[];
  readonly classes: readonly MachineClass[];
}

/** No library at all — a first visit, a version-1 session, or an envelope that could not be read. */
export const EMPTY_LIBRARY: SavedLibrary = Object.freeze({
  buildings: Object.freeze([]),
  dispatchers: Object.freeze([]),
  patterns: Object.freeze([]),
  classes: Object.freeze([]),
});

/** Which shelf an entry sits on. The four are `ViewerState`'s four `saved*` fields. */
export type LibraryShelf = 'building' | 'dispatcher' | 'pattern' | 'class';

/**
 * One saved thing this build could not take back, and enough to tell a player which.
 *
 * {@link label} is what the *player* called it — the building's `name`, the dispatcher's `name` —
 * falling back to its id and then to its position, because an entry corrupt enough to fail the
 * shape check may have no readable name and *"one of the things you saved"* is a worse sentence
 * than *"the 3rd building you saved"*. {@link reason} is the validator's own words and is for
 * whoever has to work out why; `notice.ts` does not put it on a ribbon.
 */
export interface DroppedEntry {
  readonly shelf: LibraryShelf;
  /** Position on its shelf, so a nameless entry is still locatable. Zero-based. */
  readonly index: number;
  readonly label: string;
  readonly reason: string;
}

/**
 * What came back, and what did not.
 *
 * **There is no `ok` flag and that is the asymmetry with {@link SessionRestore}, not an oversight.**
 * Restoring a library cannot fail: an unreadable envelope yields no entries, a version-1 envelope
 * yields no entries, and a library of twenty entries with three bad ones yields seventeen. Every
 * one of those is a success that hands back what survived. What a caller has to act on is
 * {@link dropped}, and it is a list rather than a flag because *which* entries went is the only
 * thing a player can be told.
 */
export interface LibraryRestore {
  readonly library: SavedLibrary;
  readonly dropped: readonly DroppedEntry[];
}

/**
 * What the library is validated *against* — the shipped data an entry has to agree with.
 *
 * A narrow port for the same reason {@link SessionStore} is one. `dev/data.ts`'s `BrowserResources`
 * is structurally assignable to this, so the shell passes it straight through, but this module
 * cannot reach the parsed buildings, the loader warnings or anything else on it — and a persistence
 * layer that could read the whole resource bundle is one that can start deciding what a run is.
 *
 * All three fields are needed and none of them is spare: a machine class is checked by putting it
 * back into {@link elevatorSpecs} and re-parsing the file; a dispatcher by putting it back into
 * {@link dispatcherProfiles} and re-parsing *that* file, which is what cross-checks its weights
 * against the shipped cost-term library; and a building by resolving it against the specs **as
 * widened by the player's own accepted classes**, with {@link trafficProfileIds} for the same
 * cross-reference the loader makes.
 */
export interface LibraryContext {
  readonly elevatorSpecs: ElevatorSpecs;
  readonly dispatcherProfiles: DispatcherProfiles;
  readonly trafficProfileIds: ReadonlySet<string>;
}

/**
 * How many characters of serialised library this build will keep, and why it is this number.
 *
 * ## The failure this exists to prevent
 *
 * `localStorage` is about **5 MB per origin** and it does not return an error when it is full — it
 * **throws** `QuotaExceededError` from the write. `saveSession` already turns that throw into a
 * value, so the shell survives it; what the shell cannot survive is not being told, because the one
 * thing worse than a library that stopped being saved is a library that stopped being saved
 * without saying so. So the size is checked here, against a number that is written down, rather
 * than discovered by a browser at an unpredictable moment.
 *
 * ## Where 512 000 comes from
 *
 * | quantity | value | how it is known |
 * |---|---|---|
 * | the quota, read conservatively | ~2 500 000 characters | ~5 MB, and the pessimistic reading is that a browser counts *bytes* of UTF-16 — so half as many characters as the headline suggests |
 * | everything in the envelope that is **not** the library | < 64 000 characters | **measured**, and asserted: `persist.test.ts` fails if a full played week with settings ever exceeds it |
 * | the largest building this project ships | 23 899 characters | `data/buildings/vertical-city.json`, minified — eight double-deck cars and four floor pairs |
 * | this budget | 512 000 characters | about **a fifth** of the conservative quota, and about **twenty** of the largest building anyone has drawn here |
 *
 * The four fifths that are left over are not timidity about the arithmetic. The quota is **per
 * origin and not per key**: this origin also holds `elevator-sim.viewMode`, a future feature will
 * hold more, and a slot sized to exactly fill the quota is a slot that makes the *next* key fail
 * instead of this one. Whether a browser needs room for the old value while replacing it is
 * **unmeasured here** and is not claimed as a reason.
 *
 * It is a character count rather than a byte count because `String.length` is what this module can
 * actually measure, and it is compared against a quota deliberately read in the direction that
 * makes the budget smaller.
 */
export const LIBRARY_BUDGET_CHARACTERS = 512_000;

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
  /**
   * The player's library is past {@link LIBRARY_BUDGET_CHARACTERS}. Nothing was written.
   *
   * ## Why the *whole* save is refused, and not just the library
   *
   * The obvious alternative — write the week and leave the library out — is worse, and the reason
   * is mechanical rather than a matter of taste. **There is one slot and `write` replaces it
   * whole.** A save that omitted the oversized library would therefore not be *declining to store*
   * it; it would be **deleting the copy already in storage**, on the next autosave, in exchange for
   * a week. The player would lose the library they were told was too big to add to.
   *
   * Refusing the whole write leaves the previous save — its week *and* its library — exactly where
   * it was, which is the same ordering argument the round-trip guard makes. The cost is real and is
   * named rather than hidden: while the library is over budget, **the week stops being saved too**,
   * and that is a state the player has to be told about in order to get out of. It is what
   * {@link SessionSave} is a value for, and `notice.ts#saveNoticeFor` is the sentence.
   */
  | {
      readonly kind: 'library-too-large';
      readonly message: string;
      /** What the serialised library actually measures. */
      readonly characters: number;
      /** {@link LIBRARY_BUDGET_CHARACTERS}, carried so a caller need not import it to say it. */
      readonly limit: number;
      /** How many things are in it, so the sentence can suggest deleting one. */
      readonly entries: number;
    }
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
 * without measuring it a second way. It is `String.length` — **UTF-16 code units, not bytes** —
 * and the name predates anybody noticing. Left alone rather than renamed in a lane that does not
 * own its callers; {@link SessionSaveFailure}'s newer arm says `characters`, which is what both of
 * them are.
 */
export type SessionSave =
  | { readonly ok: true; readonly bytes: number }
  | { readonly ok: false; readonly failure: SessionSaveFailure };
