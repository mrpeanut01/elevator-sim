/**
 * *Nobody came* against *nobody may come* — `docs/10-experience-layer-contract.md` § 10.4.
 *
 * ## What the recording could not say, and what one field changes
 *
 * § 10.4 is careful, and twice-corrected, about the size of this gap. The viewer already draws
 * `⊘` for a floor no shaft reaches and `✗` for a landing whose call no car answered, so an
 * unanswerable call is **not** presented as an ordinary long wait today. What it cannot say is
 * **why** a call went unanswered — and the missing ingredient is on `PassengerRecord` and was
 * deliberately not copied: the credential.
 *
 * With `VizLeg.credentialGroup` present, three genuinely different situations separate, and they
 * have three different fixes:
 *
 * | the rider | the dispatcher | what the run did | the fix |
 * |---|---|---|---|
 * | holds `tenant-alpha-staff` | reads no credential | permanently unassignable | a dispatcher that reads credentials |
 * | holds **nothing** | anything | permanently unassignable | a credential for the rider — no dispatcher helps |
 * | holds `tenant-alpha-staff` | reads credentials | ordinary congestion | more cars, or a better policy |
 *
 * The second row is the one that is invisible without the field and is not a shade of the first:
 * a trace generated with `credentialAssignment: 'none'` puts unbadged riders on restricted
 * floors, and **no** shipped dispatcher can serve them. Telling that reader to switch to
 * `destination-eta` would be advice that does not work.
 *
 * ## Why the restricted-floor list is an input rather than a field
 *
 * Which floors are access-controlled is a fact about the **building**, exactly as
 * `unservedFloorIds` is a fact about its geometry, and `dev/main.ts` already derives both for
 * `drawScene` rather than the renderer reaching for them. § 10.4 names
 * `VizLeg.credentialGroup` as *"the one genuine contract widening U8 needs"*, and one is what it
 * got. The consequence is stated rather than hidden: a recording **loaded from a file** for a
 * building this build does not ship carries no access zoning, so the caller passes an empty list
 * and this function claims nothing. Silence is the right answer there; an inference would not
 * be.
 *
 * ## Why the origin floor and not the credential alone
 *
 * A leg carries a credential when **any** floor on its route is restricted, so a lobby-to-office
 * trip on Secure Tower carries one too — and that call is answerable, because a conventional
 * `estimateCost` checks access at the pickup floor and (with no destination disclosed) nowhere
 * else. Measured: conventional dispatch leaves 33.5 % of Secure Tower unserved, not 100 %. So
 * *"holds a credential and was never served"* over-claims, and the predicate here is
 * *"registered a call **at** a restricted floor"*.
 */

import type { VizFloor, VizLeg, VizRecording } from '../contract/types.js';
import { STATE_GLYPHS } from './zoning.js';

/** Why a call at this landing could never be answered. Two causes, two different fixes. */
export const LOCKOUT_CAUSES = ['credential-not-read', 'rider-has-no-credential'] as const;

export type LockoutCause = (typeof LOCKOUT_CAUSES)[number];

export interface LockedOutLanding {
  readonly floorId: string;
  readonly cause: LockoutCause;
  /** Legs standing at this landing that no car ever served. */
  readonly legCount: number;
  /**
   * The credentials those riders hold, de-duplicated, in first-arrival order.
   *
   * Empty exactly when {@link cause} is `rider-has-no-credential` — which is what makes the two
   * causes readable from the data rather than only from the label.
   */
  readonly credentialGroups: readonly string[];
}

export interface LockedOutInput {
  readonly recording: VizRecording;
  /** The instant asked about, simulated seconds. */
  readonly at: number;
  /** Floors inside at least one access zone. Empty means "this caller does not know". */
  readonly restrictedFloorIds: readonly string[];
  /** Whether the profile that produced this run forwards the credential to the cars. */
  readonly carriesCredential: boolean;
}

/**
 * Landings whose calls no car **may** answer, at `at`.
 *
 * A leg counts when it registered its call at or before `at`, sits on a restricted floor, and
 * **no car ever served it in this run** — `boardedAt` and `carId` both absent, which is the same
 * *"nobody ever comes"* rather than *"nobody has come yet"* standard `unansweredCallFloors`
 * already holds itself to.
 *
 * Ordered by the recording's own floor order, never by id: sorting ids as strings reads
 * `11, 12, 16, 2, 20` and every digit is correct and the sentence is useless.
 */
export function lockedOutLandingsAt(input: LockedOutInput): readonly LockedOutLanding[] {
  const restricted = new Set(input.restrictedFloorIds);
  if (restricted.size === 0) return [];

  const byFloor = new Map<string, { legs: VizLeg[]; groups: string[] }>();
  for (const leg of input.recording.legs) {
    if (leg.arrivedAt > input.at) continue;
    if (leg.boardedAt !== undefined || leg.carId !== undefined) continue;
    if (!restricted.has(leg.originFloorId)) continue;
    // A rider whose credential the cars *do* receive is not locked out; they are waiting.
    if (input.carriesCredential && leg.credentialGroup !== undefined) continue;
    const bucket = byFloor.get(leg.originFloorId) ?? { legs: [], groups: [] };
    bucket.legs.push(leg);
    if (leg.credentialGroup !== undefined && !bucket.groups.includes(leg.credentialGroup)) {
      bucket.groups.push(leg.credentialGroup);
    }
    byFloor.set(leg.originFloorId, bucket);
  }

  const order = input.recording.floors.map((floor: VizFloor) => floor.id);
  const landings: LockedOutLanding[] = [];
  for (const floorId of order) {
    const bucket = byFloor.get(floorId);
    if (bucket === undefined) continue;
    landings.push({
      floorId,
      // The rider's own missing credential is the stronger claim and the one no dispatcher fixes,
      // so a landing where anybody is unbadged is reported that way.
      cause: bucket.groups.length === 0 ? 'rider-has-no-credential' : 'credential-not-read',
      legCount: bucket.legs.length,
      credentialGroups: bucket.groups,
    });
  }
  return landings;
}

/**
 * The banner and screen-reader sentence for a set of locked-out landings.
 *
 * One string, produced here rather than in the canvas and in `describeFrame` separately, because
 * the picture and its text alternative saying different things about the same fact is the defect
 * `meanClause`'s docstring records at length.
 *
 * Names the credential. That is the field's most visible reader: with `credentialGroup` frozen
 * the sentence still counts landings correctly and stops being able to say *which* credential is
 * going unread, which is the whole content of § 10.4's *"why"*.
 */
export function describeLockedOut(
  landings: readonly LockedOutLanding[],
  options: { readonly short?: boolean } = {},
): string {
  if (landings.length === 0) return '';
  const legs = landings.reduce((total, landing) => total + landing.legCount, 0);
  const unbadged = landings.filter((landing) => landing.cause === 'rider-has-no-credential');
  const unread = landings.filter((landing) => landing.cause === 'credential-not-read');
  const short = options.short === true;
  /*
   * The **short** form drops the floor lists and the leg preamble, and keeps the credentials.
   *
   * Not a different fact — a different length, for a surface that has one line. The floors are
   * already on the picture, each marked `▩` on its own row, so repeating them in the banner is
   * the one part of this sentence a sighted reader does not need. Which credential is going
   * unread has no glyph and is kept in both forms.
   */
  const parts: string[] = [
    short
      ? `${String(landings.length)} landing${landings.length === 1 ? '' : 's'} locked out ${STATE_GLYPHS['not-permitted']}`
      : `${String(landings.length)} landing${landings.length === 1 ? '' : 's'} locked out — ` +
        `${String(legs)} leg${legs === 1 ? '' : 's'} at access-controlled floors that no car may legally answer`,
  ];
  if (unread.length > 0) {
    const groups: string[] = [];
    for (const landing of unread) {
      for (const group of landing.credentialGroups) if (!groups.includes(group)) groups.push(group);
    }
    parts.push(
      short
        ? `${groups.join(', ')} not read`
        : `${unread.map((landing) => landing.floorId).join(', ')}: this dispatcher does not read ` +
          `${groups.join(', ')}`,
    );
  }
  if (unbadged.length > 0) {
    parts.push(
      short
        ? 'and riders with no credential at all'
        : `${unbadged.map((landing) => landing.floorId).join(', ')}: these riders carry no credential, ` +
          'so no dispatcher can serve them',
    );
  }
  return parts.join(' · ');
}
