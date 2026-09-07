/**
 * **The career, as bytes** — GitHub issue #375, § D525's *"the Campaign becomes a Career that
 * persists"*.
 *
 * Pure. No `window`, no storage, no clock: this file turns a {@link CampaignCareer} into a string
 * and back, and decides what to do with a string it does not recognise.
 * `everyday/careerStore.ts` is the half that touches `localStorage`, on the split
 * `everyday/profile.ts` and `everyday/profileStore.ts` already keep.
 *
 * ## The envelope refuses in both directions, and that is `persist/`'s rule rather than a choice
 *
 * A version this build does not know is **refused, not patched**. The bytes were written by
 * whatever build last loaded this page, which after a deploy is not this one, and a newer envelope
 * is one whose fields this build cannot vouch for. An older one is **migrated** where the migration
 * is a real one and refused where it is not.
 *
 * `record/document.ts` is the shape followed here — it refuses a newer and an older recording by
 * name — and `everyday/profile.ts` is the shape for the versions-read set: *what is written* and
 * *what is read* are two different questions, and collapsing them makes every added key a reason to
 * throw a player's career away.
 *
 * ## A refused read does not clear the slot
 *
 * Deliberate, and the same rule `profile.ts` states. A player who downgrades a tab, reads a refusal
 * and then reloads on the newer build gets their career back.
 *
 * **Keeping them in place is not enough, and the first draft of this file got that wrong.** The
 * fallback career is saved through the host's one writer on the player's next action, straight over
 * the refused bytes — so the notice promised a save that the very screen it was drawn on destroyed.
 * The bytes are moved to {@link CAREER_QUARANTINE_KEY} before play resumes, which is what makes the
 * sentence true.
 *
 * ## The week and the career are separate records, and they are joined in exactly one place
 *
 * `everyday/host.ts` says where the career is declared that the two have different lifetimes. That
 * is right about *ownership* and it was overstated into *"they cannot disagree"*, which an
 * independent review falsified: `everyday/campaignModel.ts#campaignTestRows` computes
 * `was: wasDisplayOf(history, tower.day, goal)` — the **career's** contract day joined against the
 * **week's** closed days by day number (`shift/goals.ts:621`, `entry.day === day - 1`). They are
 * coupled in the presentation, and `host.ts`'s `take-offer` writes both on one player action.
 *
 * Before persistence that coupling was harmless, because a reload reset both together. It is not
 * harmless now: the two slots carry independent versions and independent refusals, and
 * `dev/main.ts` **clears** the session slot on a refused restore while this one deliberately does
 * not. A future `SESSION_SCHEMA_VERSION` bump — there have been six — resets the week to day 1 with
 * no history while a career restores at contract day 6.
 *
 * **The rule, stated rather than emergent: the week is authoritative for what happened on a day,
 * and the career never fabricates one.** `wasDisplayOf` withholds — an em-dash, not a zero — when
 * the week has no entry for the day the career is on, which is exactly the disagreement above and
 * is already the shipped behaviour. So a restored career beside a reset week reads *day 6 of
 * twenty* with its `was` column withheld, which is true and legible, rather than a `was` invented
 * from a week that never happened. `careerPersist.test.ts` asserts that withholding directly.
 *
 */

import type { CampaignCareer } from './career.js';
import { DIFFICULTY_IDS } from './economy.js';

/** The slot. One key, one record — three keys would be three states that can disagree. */
export const CAREER_STORAGE_KEY = 'elevator-sim:career';

/**
 * Where a **refused** career's bytes are moved, so the refusal's promise is kept.
 *
 * The notices below say *"Nothing was deleted"*, and for one commit that was false: the fallback
 * career is saved through the host's one writer on the player's very next action, over the top of
 * the bytes the refusal had just promised to keep. One slot cannot hold both a career being played
 * and a career being preserved.
 *
 * So a refused read moves the bytes here first. This slot is written by the load path and read by
 * nobody — deliberately: it exists so a player who downgraded a tab can go back to the build that
 * wrote it and recover, and a build that could read it would not have refused it.
 */
export const CAREER_QUARANTINE_KEY = 'elevator-sim:career:refused';

/** The envelope's shape number, refused in both directions. */
export const CAREER_SCHEMA_VERSION = 1;

/**
 * The shapes this build reads, as against the one it writes.
 *
 * One entry today, and the constant exists anyway: the next lane to add a sibling key adds its
 * number here and a migration below, rather than discovering that the set was a literal.
 */
export const CAREER_SCHEMA_VERSIONS_READ: readonly number[] = Object.freeze([1]);

/** Why a read produced no career. Never `undefined` on a refusal — the player is owed the reason. */
export type CareerLoadRefusal =
  /** Nothing has been written under the key. Not an error, and carries no notice. */
  | 'empty'
  /** The bytes are not JSON, or not an object. */
  | 'unreadable'
  /** A version this build does not read — newer after a deploy, or older than any migration. */
  | 'version'
  /** The version is known and the payload is not the shape it claims. */
  | 'shape';

export interface CareerLoad {
  readonly career: CampaignCareer | undefined;
  readonly refusal: CareerLoadRefusal | undefined;
  /**
   * What the player is told, in their words. `undefined` for `empty`, which is not a failure — a
   * first-ever load has nothing to apologise for and a notice there would read as a fault.
   */
  readonly notice: string | undefined;
}

/**
 * The refusal sentences. Each says what happened and what the player still has, because a load
 * refusal on a career is the moment a player is most likely to read *your months are gone* into a
 * blank screen.
 */
export const CAREER_LOAD_NOTICES: Readonly<Record<Exclude<CareerLoadRefusal, 'empty'>, string>> =
  Object.freeze({
    unreadable:
      'The saved career could not be read, so this one starts fresh. The old save was set aside rather than overwritten, for a build that can read it.',
    version:
      'The saved career was written by a different version of the game, so this one starts fresh. The old save was set aside rather than overwritten.',
    shape:
      'The saved career was not the shape this build expects, so this one starts fresh. The old save was set aside rather than overwritten.',
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The payload's shape, checked field by field rather than cast.
 *
 * **The depth is set by what the first derivation touches, not by taste**, and the first draft got
 * that wrong. It checked the identifying fields only, on the argument that a deeper check would be
 * a second copy of `CampaignTower` to go stale — and a tower carrying those three fields and
 * nothing else decodes cleanly and then throws
 * `Cannot read properties of undefined (reading 'miss')` at `economy.ts:964`, because
 * `DIFFICULTIES[tower.difficultyId]` is `undefined`. `towersView` runs on `mountTowers`, so the
 * Campaign tile dies with an uncaught throw: the refusal machinery exists for exactly that payload
 * and the shallow check routed straight past it.
 *
 * So every field the economy indexes or does arithmetic on is checked, and `difficultyId` is
 * checked against `DIFFICULTY_IDS` rather than merely for being a string — an unrecognised id is
 * the same crash by another route. That is `profile.ts`'s convention: re-apply the build's own gate
 * on the way back in, and prefer a refusal a player can read to a screen that does not draw.
 */
function isCareerShape(value: unknown): value is CampaignCareer {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value['carry'])) return false;
  if (!isFiniteNumber(value['today'])) return false;
  if (!isFiniteNumber(value['monthsWorked'])) return false;
  if (!isFiniteNumber(value['lost'])) return false;
  if (!Array.isArray(value['towers'])) return false;
  for (const tower of value['towers']) {
    if (!isRecord(tower)) return false;
    if (typeof tower['id'] !== 'string') return false;
    if (typeof tower['buildingId'] !== 'string') return false;
    if (typeof tower['dispatcherId'] !== 'string') return false;
    /* Indexed into `DIFFICULTIES`. An unrecognised id crashes the first derivation. */
    if (!DIFFICULTY_IDS.includes(tower['difficultyId'] as never)) return false;
    /* Arithmetic in `atRiskTowers`, `carriedIn` and `purseOf`. */
    if (!isFiniteNumber(tower['day'])) return false;
    if (!isFiniteNumber(tower['missed'])) return false;
    if (!isFiniteNumber(tower['months'])) return false;
  }
  const open = value['openTowerId'];
  if (open !== undefined && typeof open !== 'string') return false;
  const booking = value['pendingBooking'];
  if (booking !== undefined && !isRecord(booking)) return false;
  return true;
}

/** The career as bytes. One shape, one version, written together. */
export function encodeCareer(career: CampaignCareer): string {
  return JSON.stringify({ version: CAREER_SCHEMA_VERSION, career });
}

/** The bytes as a career, or a refusal that says why and a sentence for the player. */
export function decodeCareer(raw: string | null): CareerLoad {
  if (raw === null || raw.trim() === '') {
    return { career: undefined, refusal: 'empty', notice: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { career: undefined, refusal: 'unreadable', notice: CAREER_LOAD_NOTICES.unreadable };
  }
  if (!isRecord(parsed)) {
    return { career: undefined, refusal: 'unreadable', notice: CAREER_LOAD_NOTICES.unreadable };
  }
  const version = parsed['version'];
  if (!isFiniteNumber(version) || !CAREER_SCHEMA_VERSIONS_READ.includes(version)) {
    return { career: undefined, refusal: 'version', notice: CAREER_LOAD_NOTICES.version };
  }
  const career = parsed['career'];
  if (!isCareerShape(career)) {
    return { career: undefined, refusal: 'shape', notice: CAREER_LOAD_NOTICES.shape };
  }
  return { career, refusal: undefined, notice: undefined };
}
