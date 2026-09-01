/**
 * **The Everyday slot: who the player is, and what they have earned** — GAMEPLAY § 15.1's *You*
 * section and § 20.15's check pointed at it (*the display name and avatar colour are read by board
 * rows, the spectator header and the rail card from one place*), plus the two forms of progress
 * GitHub issue #224 found ending with the tab: the buildings a player has fixed and the ratings
 * their dispatchers have earned.
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
 * **Issue #224 tested that split rather than inheriting it** ([§ D433](../../../../DECISIONS.md)).
 * Solved fix cases and gauntlet ratings are Everyday progress, written by Everyday screens on
 * Everyday presses, and the case for putting them here rather than in `persist/`'s envelope is the
 * paragraph above with a second reader: a session written whole at one instant is the Engineer
 * shell's week, and a fix-it press is not part of it. So progress is a **second payload key beside
 * the profile**, exactly as `persist/`'s `library` sits beside its `session` — one slot, two
 * payloads, refused under two rules.
 *
 * Every path returns a value and none throws, for `session.ts`'s reason: the natural caller of
 * {@link saveEveryday} is a keystroke in the name field, and a save that threw would turn a full
 * storage quota into a dead input. A refused read does not clear the slot — a refusal is
 * evidence, and the next successful save overwrites the key anyway.
 *
 * **There is one writer, and it takes both payloads.** A `saveProfile(store, profile)` stood here
 * until issue #224 and is deleted rather than kept: one slot means one `write`, so a writer given
 * half the envelope has to invent the other half, and the only two ways to do that are re-reading
 * the slot (which writes back a value a keystroke may already have replaced) or writing an empty
 * one (which deletes a player's afternoon on a name change). The store above holds both halves and
 * hands both over on every write.
 *
 * ## What a refusal owes the player, and why it is a sentence rather than an empty screen
 *
 * A profile that will not restore falls back to a name the player can see is wrong and retype.
 * **Progress cannot do that**: an empty solved set and an empty ladder are indistinguishable from a
 * player who has done nothing, so a silent refusal here reads as *your afternoon did not happen*.
 * Every refusing path therefore produces {@link EverydayProgressStatus.notice} — a sentence the fix
 * screen and the ladder draw — and the empty value travels with it rather than instead of it.
 */

import { displayNameIssueOf } from '../menu/account.js';
import { savedRatingIssue, type SavedRating } from '../gauntlet/ladder.js';
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

/* -------------------------------------------------------------------------- *
 * What is earned — GitHub issue #224
 * -------------------------------------------------------------------------- */

/**
 * The two things this product lets a player earn and then took away when the tab closed.
 *
 * A **list** of solved ids rather than a set, because this is the stored shape and `JSON.stringify`
 * writes a `Set` as `{}`. The screens hold sets; the boundary holds an array, and
 * {@link solvedCaseSetOf} is the one crossing.
 *
 * Ratings are keyed by dispatcher **inside** the array rather than by an object map: a rating is a
 * standing claim about one exact dispatcher (`gauntlet/ladder.ts`), so the list carries at most one
 * per id, and {@link everydayProgressWith} is where that is enforced rather than left to a caller.
 */
export interface EverydayProgress {
  /** `fixit/types.ts` case ids whose pass conditions have held. Order is not meaningful. */
  readonly solvedCaseIds: readonly string[];
  /** One per dispatcher that has been through the forty. */
  readonly ratings: readonly SavedRating[];
}

/** A player who has earned nothing yet — and what every refusal falls back to. */
export const EMPTY_EVERYDAY_PROGRESS: EverydayProgress = Object.freeze({
  solvedCaseIds: Object.freeze([]) as readonly string[],
  ratings: Object.freeze([]) as readonly SavedRating[],
});

/** The stored list as the screens want it. One crossing, so no screen builds its own. */
export function solvedCaseSetOf(progress: EverydayProgress): ReadonlySet<string> {
  return new Set(progress.solvedCaseIds);
}

/**
 * Progress with one dispatcher's rating replacing whatever it held for that dispatcher.
 *
 * Here rather than in `boardScreen.ts` because it is the *one rating per dispatcher* rule, and
 * `gauntlet/ladder.ts` states it: two rows for one dispatcher would be two standing claims about
 * one thing. The screen's own `RATINGS` map enforces it in memory; this enforces it in the bytes,
 * so a store that somehow held two does not grow a third.
 */
export function everydayProgressWith(
  progress: EverydayProgress,
  rating: SavedRating,
): EverydayProgress {
  return {
    solvedCaseIds: progress.solvedCaseIds,
    ratings: [
      ...progress.ratings.filter((held) => held.dispatcherId !== rating.dispatcherId),
      rating,
    ],
  };
}

/* -------------------------------------------------------------------------- *
 * The slot
 * -------------------------------------------------------------------------- */

/** The slot. Dotted and prefixed like `persist/types.ts`'s `SESSION_KEY` and `dev/main.ts`'s mode key. */
const PROFILE_KEY = 'elevator-sim.everyday-profile';

/** The envelope's shape number — refused in both directions, `persist/`'s rule. */
const PROFILE_SCHEMA_VERSION = 2;

/**
 * The shapes this build will read, as against the one it writes.
 *
 * `persist/types.ts`'s `SESSION_SCHEMA_VERSIONS_READ` and its argument: *what is written* and *what
 * is read* are two different questions, and collapsing them makes every added key a reason to throw
 * away a player's name. Version 2 added a **sibling** key and changed nothing about `profile`, so a
 * version-1 envelope is read by {@link withProgress} rather than migrated field by field.
 */
const PROFILE_SCHEMA_VERSIONS_READ: readonly number[] = Object.freeze([1, 2]);

/** Version 2: the version, the profile, and the progress beside it — three siblings. */
interface ProfileEnvelope {
  readonly schemaVersion: number;
  readonly profile: EverydayProfile;
  readonly progress: EverydayProgress;
}

/**
 * How many characters of serialised progress this build will keep, and why it is this number.
 *
 * `persist/types.ts`'s `LIBRARY_BUDGET_CHARACTERS` reasoning, re-derived for this payload rather
 * than copied: `localStorage` is about 5 MB per origin, it does not report fullness but **throws**
 * from the write, and the one thing worse than progress that stopped being saved is progress that
 * stopped being saved without saying so. So the ceiling is written down here and checked before the
 * store is touched.
 *
 * ## The number is chosen from what the product can produce, not the other way round
 *
 * | quantity | value | how it is known |
 * |---|---|---|
 * | the quota, read conservatively | ~2 500 000 characters | ~5 MB, counted pessimistically as UTF-16 bytes |
 * | one stored rating | **7 801 characters** | **measured, not estimated**: `JSON.stringify` of a {@link SavedRating} over the shipped set's shape — forty cases, each carrying a `tower/crowd` case id, a building id, a crowd id, a dated seed and an unrounded score |
 * | dispatchers `data/dispatcher-profiles.json` ships | 13 | counted from the file |
 * | this budget | 384 000 characters | **49 ratings** — the thirteen shipped plus thirty-six a player authors |
 *
 * The solved ids are not in that arithmetic because they cannot move it: a case id is tens of
 * characters and the catalogue is the bound.
 *
 * A first draft took a twentieth of the quota, which is 16 ratings — and 16 is **below** what this
 * build can produce, because the thirteen shipped dispatchers are all rateable and a player's own
 * are extra. A ceiling a player reaches by doing the ordinary thing is not a safety margin, it is a
 * defect with a sentence attached, so the budget was moved to the requirement rather than the
 * requirement to the budget.
 *
 * It is still smaller than the library's 512 000 and deliberately so. This key shares an origin
 * with `elevator-sim.session`, and the two together are about **a third** of the conservative
 * quota; the four fifths the library leaves over is *for* the next key, and this is that key. The
 * library holds work a player authored and cannot recover, and this holds work a player can
 * re-earn by running the forty again — so where the two compete, this is the one that yields.
 */
export const PROGRESS_BUDGET_CHARACTERS = 384_000;

/**
 * A version 1 envelope, given the one key version 2 added — GitHub issue #224.
 *
 * `persist/session.ts`'s `withWindowStart` family, and it has to survive the same objection those
 * do: is {@link EMPTY_EVERYDAY_PROGRESS} a value the absence **determines**, or a guess about
 * something nobody wrote down? It is determined, and by the defect this key exists to close. Before
 * version 2 the solved set lived in `everyday/fixitScreen.ts`'s module scope and the ratings in
 * `everyday/boardScreen.ts`'s, and **both ended with the tab** — the two named absences those files
 * carried. So at the instant a version-1 envelope was written there was no stored progress to
 * record, and every reload under that build opened with none. An empty progress is what the player
 * had.
 *
 * Returns the record untouched at version 2 rather than merely being a no-op through here, so a
 * current envelope cannot acquire a key it did not store.
 */
function withProgress(record: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version >= 2) return record;
  return { ...record, progress: EMPTY_EVERYDAY_PROGRESS };
}

/** A read that got as far as the envelope's two payload keys, or the reason it did not. */
type EnvelopeRead =
  | { readonly ok: true; readonly profile: unknown; readonly progress: unknown }
  | { readonly ok: false; readonly reason: EnvelopeRefusal };

/**
 * Which of the five refusing reads happened.
 *
 * Named rather than collapsed to `undefined` because the two readers want different things from it:
 * {@link loadProfile} treats all five the same (fall back to the default name), and
 * {@link loadProgress} must tell `absent` — a player who has earned nothing — apart from the four
 * that mean *something was kept here and this build cannot read it*.
 */
type EnvelopeRefusal = 'unavailable' | 'absent' | 'parse' | 'version' | 'shape';

/**
 * Everything up to and including *are these bytes ours* — read, parse, version, migration.
 *
 * Factored out because {@link loadProfile} and {@link loadProgress} both need all of it and neither
 * needs the other's payload check, which is `persist/session.ts#readEnvelope`'s own argument: two
 * readers of one slot is the price of keeping two payload rules from having to be expressed in one
 * type.
 */
function readEnvelope(store: SessionStore): EnvelopeRead {
  let raw: string | null;
  try {
    raw = store.read(PROFILE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (raw === null) return { ok: false, reason: 'absent' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'shape' };
  }
  const record = parsed as Record<string, unknown>;
  const version = record['schemaVersion'];
  if (typeof version !== 'number' || !PROFILE_SCHEMA_VERSIONS_READ.includes(version)) {
    // Version before shape, `persist/session.ts`'s ordering: a payload from another build is
    // usually both, and naming the shape first sends a reader hunting corruption in bytes that are
    // merely newer than they are.
    return { ok: false, reason: 'version' };
  }
  const completed = withProgress(record, version);
  return { ok: true, profile: completed['profile'], progress: completed['progress'] };
}

/**
 * The stored profile, or `undefined` — nothing stored yet, a store that throws, bytes that do not
 * parse, a version this build does not know, or a shape (name outside the server's own display
 * name rules, a colour outside the curated six) this build will not vouch for. All five land on
 * the same honest answer because the caller's next move is the same for all five: fall back to
 * {@link DEFAULT_EVERYDAY_PROFILE} and let the player set it again.
 *
 * A version-1 envelope restores its profile unchanged. That is the whole of what the migration
 * costs a player who saved a name under the previous build: nothing.
 */
export function loadProfile(store: SessionStore): EverydayProfile | undefined {
  const envelope = readEnvelope(store);
  if (!envelope.ok) return undefined;
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

/* -------------------------------------------------------------------------- *
 * The progress half — reading, and what a refusal says
 * -------------------------------------------------------------------------- */

/** What was restored, and what the player is owed about it. */
export interface EverydayProgressStatus {
  /** Always a value. {@link EMPTY_EVERYDAY_PROGRESS} on every refusing path. */
  readonly progress: EverydayProgress;
  /**
   * The sentence a screen draws, or `null` when there is nothing to say.
   *
   * `null` covers exactly two states: progress restored, and nothing was ever stored. Every other
   * path carries words, because an empty ladder is what a player who has earned nothing sees and a
   * refusal that looks like that is a refusal a player cannot act on.
   */
  readonly notice: string | null;
}

/**
 * What a player is told when kept progress could not be read back.
 *
 * One sentence per cause, and each one says the same two things a `persist/` refusal says: what
 * happened, and that the bytes are still there. The last clause is not reassurance — it is the
 * behaviour: {@link loadProgress} does not clear a slot it refuses, so a build that can read those
 * bytes still can, and the next successful save is what replaces them.
 *
 * **`unavailable` promises less than it may turn out to deliver, and that is deliberate.** A store
 * whose `read` throws will usually refuse a `write` too, so the honest thing to say at boot is *what
 * you do now lasts until this tab closes*. If a write then succeeds anyway, the claim corrects
 * itself rather than standing: {@link EverydayProfileStore.progressNotice} is re-set from every
 * write, so the sentence is gone the moment the store proves it wrong. A refusal that could not be
 * withdrawn by evidence would be § D227's defect with a friendly face.
 */
export const PROGRESS_REFUSALS = Object.freeze({
  unavailable:
    'This browser will not let the game read what it saved, so nothing is marked solved and no ' +
    'rating is standing. Everything else works; what you do now lasts until this tab closes.',
  parse:
    'The progress saved in this browser is not readable text, so nothing is marked solved and no ' +
    'rating is standing. What was saved is left where it is until you fix a building or run the ' +
    'gauntlet again.',
  version:
    'The progress saved in this browser was written by a different version of the game, so this ' +
    'build will not read it. It is left where it is until you fix a building or run the gauntlet ' +
    'again.',
  shape:
    'The progress saved in this browser is not in a shape this build can vouch for, so nothing is ' +
    'marked solved and no rating is standing. It is left where it is until you fix a building or ' +
    'run the gauntlet again.',
} as const);

/**
 * Why a value read back out of storage is not an {@link EverydayProgress}, or `undefined`.
 *
 * The solved ids are checked as ids and nothing more. A stored id naming a case this build no
 * longer ships is **not** refused: `fixitCaseRailModel` derives every row and its `{fixed}/{total}`
 * count from the *loaded* case file, so an id with no case simply matches nothing, and refusing the
 * whole set over a case file that has moved on would lose a player's afternoon to a catalogue edit.
 */
function progressIssue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'the saved progress is not an object';
  }
  const record = value as Record<string, unknown>;
  const solved = record['solvedCaseIds'];
  if (!Array.isArray(solved)) return 'the saved progress carries no list of solved buildings';
  for (const id of solved as readonly unknown[]) {
    if (typeof id !== 'string' || id === '') return 'a solved building has no id';
  }
  const ratings = record['ratings'];
  if (!Array.isArray(ratings)) return 'the saved progress carries no list of ratings';
  for (const rating of ratings as readonly unknown[]) {
    const issue = savedRatingIssue(rating);
    if (issue !== undefined) return issue;
  }
  return undefined;
}

/**
 * The kept progress and the sentence that goes with it. Total; never throws.
 *
 * Refuses **whole** rather than salvaging the half it can read. A progress object whose ratings are
 * unreadable is bytes this build did not write, and restoring the solved set out of it would be
 * this repository's own *quietly repair the payload* defect: the player would be shown a partial
 * career with nothing saying a part is missing.
 *
 * Every shape failure collapses to one sentence, and {@link progressIssue}'s precise reason reaches
 * no screen. That is on purpose: *a rated case has no seed* is a fact about bytes, not about a
 * player's afternoon, and four different sentences for one situation would be four ways of saying
 * *this build cannot read what you earned*. The reasons exist so that a developer can tell the four
 * apart, and `gauntlet/ladder.test.ts` and `everyday/profile.test.ts` are what read them.
 */
export function loadProgress(store: SessionStore): EverydayProgressStatus {
  const envelope = readEnvelope(store);
  if (!envelope.ok) {
    return {
      progress: EMPTY_EVERYDAY_PROGRESS,
      notice: envelope.reason === 'absent' ? null : PROGRESS_REFUSALS[envelope.reason],
    };
  }
  if (progressIssue(envelope.progress) !== undefined) {
    return { progress: EMPTY_EVERYDAY_PROGRESS, notice: PROGRESS_REFUSALS.shape };
  }
  const progress = envelope.progress as EverydayProgress;
  return {
    progress: Object.freeze({
      solvedCaseIds: Object.freeze([...progress.solvedCaseIds]),
      ratings: Object.freeze([...progress.ratings]),
    }),
    notice: null,
  };
}

/* -------------------------------------------------------------------------- *
 * Writing
 * -------------------------------------------------------------------------- */

/** Whether the envelope was written, and the sentence a screen draws when it was not. */
export interface EverydaySave {
  readonly ok: boolean;
  /** `null` when written. Never a refusal a player cannot see. */
  readonly notice: string | null;
}

/** A store that would not take the bytes — a full origin, or one that refuses writes outright. */
const STORE_REFUSED =
  'This device is not keeping what you earn, so the buildings you fix and the ratings you run ' +
  'for last until this tab closes.';

/** The budget's own sentence, composed so the two counts and the ceiling are all in it. */
function oversizeNoticeOf(progress: EverydayProgress, characters: number): string {
  return (
    `What you have earned was not saved: ${String(progress.ratings.length)} ratings and ` +
    `${String(progress.solvedCaseIds.length)} solved buildings come to ${String(characters)} ` +
    `characters, and this build keeps at most ${String(PROGRESS_BUDGET_CHARACTERS)}. What was ` +
    'saved before is untouched, and everything on screen still stands until this tab closes.'
  );
}

/**
 * Write the whole envelope — both payloads, at one instant.
 *
 * The budget runs **before** the store is touched, and that ordering is the whole value of it:
 * there is one slot and `write` replaces it whole, so a save that quietly dropped oversized
 * progress would be *deleting* what is already stored rather than declining to add to it —
 * `persist/session.ts`'s `library-too-large` argument, one product over. Refusing first leaves the
 * previous profile **and** the previous progress exactly where they were.
 *
 * Measured on the progress alone rather than on the envelope, for `persist/`'s stated reason: the
 * profile is a name and a hex colour, and budgeting the pair would make the number that refuses a
 * player's twentieth rating depend on how long their name is.
 */
export function saveEveryday(
  store: SessionStore,
  profile: EverydayProfile,
  progress: EverydayProgress,
): EverydaySave {
  let progressText: string;
  try {
    progressText = JSON.stringify(progress);
  } catch {
    return { ok: false, notice: PROGRESS_REFUSALS.shape };
  }
  if (progressText.length > PROGRESS_BUDGET_CHARACTERS) {
    return { ok: false, notice: oversizeNoticeOf(progress, progressText.length) };
  }
  /*
   * Typed as the envelope rather than written as an object literal, so the compiler is what keeps
   * the written shape and the declared one together: a key added to {@link ProfileEnvelope} and not
   * written here does not compile, which is `persist/session.ts#ENVELOPE_KEYS`'s device in the form
   * a three-key envelope can afford.
   */
  const envelope: ProfileEnvelope = {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    profile,
    progress,
  };
  try {
    store.write(PROFILE_KEY, JSON.stringify(envelope));
    return { ok: true, notice: null };
  } catch {
    return { ok: false, notice: STORE_REFUSED };
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
  /** Hear every `set` and every `setProgress`. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * What the player has earned. Restored at creation; {@link EMPTY_EVERYDAY_PROGRESS} where there
   * is nothing kept, and also where what was kept could not be read — {@link progressNotice} is how
   * those two are told apart.
   */
  progress(): EverydayProgress;
  /**
   * The sentence the fix screen and the ladder draw about kept progress, or `null`.
   *
   * It is the *latest* thing the player is owed, not the oldest: the restore's refusal until a
   * write happens, and after that the write's. One string with one meaning — *what is true right
   * now about whether what you earn is being kept* — so two screens cannot show two answers.
   */
  progressNotice(): string | null;
  /**
   * Record progress, in memory and in the slot. `false` where it will not survive the tab, with
   * {@link progressNotice} carrying the reason.
   */
  setProgress(progress: EverydayProgress): boolean;
}

/**
 * The memory-only store's one honest fact, and the whole of what it can tell a player.
 *
 * Distinct from `PROGRESS_REFUSALS.unavailable`: that one is a store that **threw**, which is a
 * browser actively refusing; this one is a page with no storage to offer at all, and the two are
 * not the same news even though the player's afternoon ends the same way.
 */
const PROGRESS_MEMORY_ONLY =
  'This page has no storage to keep what you earn in, so the buildings you fix and the ratings ' +
  'you run for last until this tab closes.';

/**
 * Build a store over a backing slot — or over nothing, which is a browser whose storage refuses
 * to exist (private windows, storage-disabled contexts) and the node test environment. A
 * memory-only store works completely within the tab; its `set` answers `false`, which is the one
 * fact the settings screen owes the player about it.
 */
export function createProfileStore(backing: SessionStore | undefined): EverydayProfileStore {
  let current = backing === undefined ? undefined : loadProfile(backing);
  const restored =
    backing === undefined
      ? { progress: EMPTY_EVERYDAY_PROGRESS, notice: PROGRESS_MEMORY_ONLY }
      : loadProgress(backing);
  let progress = restored.progress;
  let notice = restored.notice;
  const listeners = new Set<() => void>();
  const announce = (): void => {
    for (const listener of [...listeners]) listener();
  };
  /*
   * Both writers go through here, and that is what keeps the two payloads from deleting each
   * other: there is one slot and `write` replaces it whole, so every write carries both halves as
   * they stand in memory right now.
   */
  const persist = (): boolean => {
    if (backing === undefined) return false;
    const written = saveEveryday(backing, current ?? DEFAULT_EVERYDAY_PROFILE, progress);
    notice = written.notice;
    return written.ok;
  };
  return {
    current: () => current,
    set: (profile) => {
      current = profile;
      const durable = persist();
      announce();
      return durable;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    progress: () => progress,
    progressNotice: () => notice,
    setProgress: (next) => {
      progress = next;
      const durable = persist();
      announce();
      return durable;
    },
  };
}
