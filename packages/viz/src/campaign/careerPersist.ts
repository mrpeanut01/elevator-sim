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
 * and then reloads on the newer build gets their career back. Clearing on refusal would make the
 * first read destructive, which is the one thing a load path must never be.
 *
 * ## The week is not reconciled with, because it is a different record
 *
 * `everyday/host.ts` says so where the career is declared — *"The week and the campaign career are
 * different records with different lifetimes, and conflating them here is what made the old wording
 * plausible."* So the rule is **non-interference**, stated rather than emergent: restoring a career
 * writes nothing to the week's slot, and restoring a week writes nothing to this one. They have
 * separate keys, separate versions and separate refusals, and `careerPersist.test.ts` asserts both
 * directions rather than leaving it to the fact that nobody has written the coupling yet.
 *
 * That is the honest answer to *"what happens when they disagree?"*: **they cannot**, because
 * neither is evidence about the other. A career's `today` counts career days; a week counts a
 * week's days; a player can hold both, or either, and no arithmetic relates them.
 */

import type { CampaignCareer } from './career.js';

/** The slot. One key, one record — three keys would be three states that can disagree. */
export const CAREER_STORAGE_KEY = 'elevator-sim:career';

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
      'The saved career could not be read, so this one starts fresh. Nothing was deleted — the save is still there for a build that can read it.',
    version:
      'The saved career was written by a different version of the game, so this one starts fresh. Nothing was deleted.',
    shape:
      'The saved career was not the shape this build expects, so this one starts fresh. Nothing was deleted.',
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
 * Deliberately structural and deliberately shallow on the towers: it checks that each tower is a
 * record carrying the identifying fields the career is indexed by, and does not re-validate every
 * economic field. A deeper check would be a second copy of `CampaignTower` to go stale, and the
 * fields below are the ones whose absence makes the record unusable rather than merely incomplete.
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
