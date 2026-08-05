/**
 * **What a challenge is, and who decides which one is current.** `DECISIONS.md` § D218 § 2–3.
 *
 * ## The defect this exists to fix
 *
 * `leaderboard/submission.ts#configHashOf` digests the building, the dispatcher, the template, the
 * rate, the duration and the loaded `data/`, and **deliberately excludes the seed** — so a config
 * board is *one configuration across seeds*, and the only thing that varies between two rows on it
 * is which passenger trace the player happened to draw. The competitive axis is luck. Worse, the
 * dispatcher **is** in the digest, so choosing a different one does not move a player up a board;
 * it moves them to a different board. The skill axis forks the leaderboard and the luck axis is
 * what remains on it.
 *
 * A challenge inverts exactly those two facts and changes nothing else:
 *
 * - **The seed set is fixed and named.** Every player runs the same five traces, so the trace is no
 *   longer the variable. Five is a *sample*, not a replication budget — see {@link IssuedChallenge}.
 * - **The dispatcher is the player's choice.** It is the one axis left free, which is what makes a
 *   challenge board a board people can climb.
 *
 * ## What it is still not allowed to be
 *
 * [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 5.5 forbids *"a leaderboard
 * ranking dispatchers from single runs"* (R2), and taking the dispatcher out of a board key walks
 * straight at that prohibition. What keeps this on the legal side of it is stated in `board.ts` and
 * enforced by a test there: a challenge board says *"these players, on these seeds, in this
 * order"* — a fact about **submissions** — and no string on the surface orders two dispatchers.
 * Compare stays the only surface in this product allowed to say that, because it is the only one
 * that runs common random numbers at a real replication budget and reports an interval that can
 * contain zero.
 *
 * ## The clock is the server's, and a challenge is issued as data
 *
 * `core/` may not read a wall clock (invariant 3) and a client's is not trustworthy in a
 * competition — a player whose clock is fast is a player posting to a challenge that has not opened
 * yet. So a challenge is **data**: an id, a resolved configuration, a seed set, an opens-at and a
 * closes-at, all issued by the server; the client renders what it is given and never computes which
 * challenge today is.
 *
 * The rotation below is deliberately a *derivation from a fixed epoch* rather than a list of dated
 * rows. A dated list goes stale — every window in it is in the past a year from now and the product
 * silently has no open challenge — and this repository has spent whole commits on hand-maintained
 * lists that stopped tracking what they described (§ D213). The epoch, the period and the rotation
 * are constants; the window is arithmetic; {@link issuedChallengeAt} is the only thing that reads a
 * clock, and it is handed one.
 *
 * **The seed sets are public and predictable, on purpose.** A player can practise next week's
 * challenge this week. That is not an integrity hole — everybody can, the seeds have to be
 * disclosed at open anyway for a player to run them at all, and the server replays every
 * submission regardless of when the run happened. The window governs when a *submission* is
 * accepted, not when a player may practise.
 */

import { ACCEPTED_DURATIONS_S } from '../leaderboard/submission.js';

/* -------------------------------------------------------------------------- *
 * The shape of a challenge
 * -------------------------------------------------------------------------- */

/**
 * Everything a challenge fixes about the run — that is, everything except the dispatcher.
 *
 * The omission is the whole design. A challenge that also fixed the dispatcher would be a board on
 * which every player ran the identical simulation and the only remaining difference was who posted
 * first.
 */
export interface ChallengeConfig {
  readonly buildingId: string;
  readonly demandTemplateId: string;
  /** `null` means the building's own traffic profile — a distinct selection, and issued as one. */
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
}

/**
 * A challenge, as issued: everything a client needs and nothing it has to work out.
 *
 * `seeds` is the sample. It is small — five — and it is the reason this board may not carry an
 * interval: `CLAUDE.md` § Statistical discipline budgets **50–200 replications** per configuration
 * and says ten is not enough, so five runs cannot support *"dispatcher A is better than
 * dispatcher B"* and nothing here says it. What five runs *can* support is a disclosed sample: a
 * mean, the count it was computed over (R13), and an order that is a fact about who submitted what.
 *
 * `opensAtMs` and `closesAtMs` are absolute epoch milliseconds **decided by the server**. They are
 * on the record so a client can render a window, never so it can decide membership of one.
 */
export interface IssuedChallenge {
  /** `${slug}-${cycle}`. Stable, human-readable, and unique across cycles of the same rotation. */
  readonly id: string;
  readonly name: string;
  /** Two or three sentences of plain language, in the register `docs/10` § 5.2 asks a brief for. */
  readonly brief: string;
  readonly config: ChallengeConfig;
  /** Decimal-digit strings, exactly as `SubmittedRun.seed` carries them. */
  readonly seeds: readonly string[];
  readonly opensAtMs: number;
  readonly closesAtMs: number;
}

/** Where a challenge sits relative to the **server's** clock. Never computed by a client. */
export type ChallengeState = 'upcoming' | 'open' | 'closed';

/** One entry in the rotation: a challenge with no window, because the window is arithmetic. */
export interface ChallengeDefinition {
  readonly slug: string;
  readonly name: string;
  readonly brief: string;
  readonly config: ChallengeConfig;
  readonly seeds: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * The rotation
 * -------------------------------------------------------------------------- */

/**
 * The most seeds a challenge may name.
 *
 * A submission is verified by replaying **every** seed (§ D218 § 5 clause 4), so the seed count is
 * a direct multiplier on the CPU an authenticated player can command. Eight is the ceiling and five
 * is what ships; `http/api.ts` scales its per-account cooldown by the count rather than assuming
 * one, so raising this raises the cooldown with it instead of quietly raising the load.
 */
export const MAX_CHALLENGE_SEEDS = 8;

/** Fewer than this is not a seed *set* — one or two runs is the defect § D218 exists to fix. */
export const MIN_CHALLENGE_SEEDS = 3;

/**
 * Monday 3 August 2026, 00:00 UTC — cycle 0 opens here.
 *
 * `Date.UTC` is arithmetic over a literal date, not a clock read: nothing in this module asks what
 * time it is. The one function that needs to know is handed the answer.
 */
export const CHALLENGE_EPOCH_MS = Date.UTC(2026, 7, 3);

/** One week. Long enough to tune a dispatcher against, short enough that a board turns over. */
export const CHALLENGE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The challenges, in the order they recur.
 *
 * **Every configuration here was measured before it was authored**, and the measurement is what
 * chose it: all thirteen shipped dispatcher profiles produce a **quotable** AWT on every seed
 * below. That is not a formality — a challenge whose configuration saturates for some dispatchers
 * and not others is a challenge that refuses a player's submission for choosing the wrong arm
 * (§ D214 § 6 rejects a run whose mean the project would not report), which reads as a bug and is
 * indistinguishable from one. Four candidate configurations were **rejected** for exactly that:
 * `mixed-use-high-rise` at 3 % was quotable in 5 of 65 runs, and `crown-hotel`/`rise-and-fall`,
 * `st-jude-hospital` and `garden-apartments` each failed on some seed under some arm.
 * `challenge.test.ts` re-measures this claim rather than trusting this paragraph.
 *
 * `garden-apartments` is absent for a second reason worth recording: at 6 %/900 s its quotable AWT
 * is computed over **two** legs. That is a legitimate mean by this project's rule and a terrible
 * one to put on a competitive board — R13's whole point is that `n` is part of what a number means,
 * and a board whose rows are means of two is a board about rounding.
 */
export const CHALLENGE_ROTATION: readonly ChallengeDefinition[] = Object.freeze([
  Object.freeze({
    slug: 'midtown-morning',
    name: 'Midtown, morning rush',
    brief:
      'Fifteen minutes of Midtown Office under a rise-and-fall morning peak, with three per cent ' +
      'of the population calling every five minutes. The demand builds before it clears, so the ' +
      'queue you inherit at minute ten is the one your choice at minute zero produced.',
    config: Object.freeze({
      buildingId: 'midtown-office',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: 3,
      durationS: 900,
    }),
    seeds: Object.freeze(['1001', '1002', '1003', '1004', '1005']),
  }),
  Object.freeze({
    slug: 'chancery-lunch',
    name: 'Chancery House at lunch',
    brief:
      'Chancery House under the two-way lunch template: riders leaving and riders returning, at ' +
      'the same time, in both directions. Up-peak habits do not transfer — a car parked low is ' +
      'wrong for half the traffic.',
    config: Object.freeze({
      buildingId: 'chancery-house',
      demandTemplateId: 'lunch-two-way',
      arrivalRatePctPop5min: 5,
      durationS: 900,
    }),
    seeds: Object.freeze(['1001', '1002', '1003', '1004', '1005']),
  }),
  Object.freeze({
    slug: 'crown-evening',
    name: 'Crown Hotel, evening egress',
    brief:
      'The Crown Hotel emptying in the evening: almost every call is a down call, and the lobby ' +
      'is the only destination that matters. Fifteen minutes, five traces, and a tail that ' +
      'spoils before the mean does.',
    config: Object.freeze({
      buildingId: 'crown-hotel',
      demandTemplateId: 'evening-egress',
      arrivalRatePctPop5min: 5,
      durationS: 900,
    }),
    seeds: Object.freeze(['2001', '2002', '2004', '2005', '2006']),
  }),
]);

/* -------------------------------------------------------------------------- *
 * Issuing one
 * -------------------------------------------------------------------------- */

/**
 * Which cycle a moment falls in, counting from {@link CHALLENGE_EPOCH_MS}.
 *
 * Clamped at zero rather than allowed to go negative. A server whose clock reads before the epoch
 * — a container with an unset RTC, a test with a small counter — should be offered cycle 0 as
 * *upcoming*, which is true, rather than issued a challenge with a negative index in its id.
 */
export function challengeCycleIndex(nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - CHALLENGE_EPOCH_MS) / CHALLENGE_PERIOD_MS));
}

/**
 * The challenge for a given cycle: a rotation entry, plus the window the arithmetic gives it.
 *
 * The rotation repeats, so the same seed set recurs every {@link CHALLENGE_ROTATION}`.length`
 * cycles — under a **different id**, and therefore on a different board. Two cycles of the same
 * configuration are not merged, because the field of players is not the same and merging them would
 * silently make an old entry compete with a new one.
 */
export function issuedChallengeFor(cycle: number): IssuedChallenge {
  const index = ((cycle % CHALLENGE_ROTATION.length) + CHALLENGE_ROTATION.length) % CHALLENGE_ROTATION.length;
  const definition = CHALLENGE_ROTATION[index];
  if (definition === undefined) throw new Error('issuedChallengeFor: the rotation is empty');
  const opensAtMs = CHALLENGE_EPOCH_MS + cycle * CHALLENGE_PERIOD_MS;
  return Object.freeze({
    id: `${definition.slug}-${String(cycle)}`,
    name: definition.name,
    brief: definition.brief,
    config: definition.config,
    seeds: definition.seeds,
    opensAtMs,
    closesAtMs: opensAtMs + CHALLENGE_PERIOD_MS,
  });
}

/**
 * The challenge that is current **at the time the server says it is**.
 *
 * The one clock-shaped function in the module, and it takes the clock as an argument for the reason
 * `Store` does (§ D215 § 6): a test that reads the real clock is a test that fails on a Monday.
 * `http/api.ts` passes `deps.now()`; nothing else may.
 */
export function issuedChallengeAt(nowMs: number): IssuedChallenge {
  return issuedChallengeFor(challengeCycleIndex(nowMs));
}

/**
 * Where a challenge sits relative to a moment.
 *
 * Half-open: `[opensAtMs, closesAtMs)`. One cycle's close is the next cycle's open to the
 * millisecond, and a half-open interval is what keeps exactly one of them current at that instant
 * instead of two or none.
 */
export function challengeStateAt(challenge: IssuedChallenge, nowMs: number): ChallengeState {
  if (nowMs < challenge.opensAtMs) return 'upcoming';
  if (nowMs >= challenge.closesAtMs) return 'closed';
  return 'open';
}

/* -------------------------------------------------------------------------- *
 * Validating the rotation
 * -------------------------------------------------------------------------- */

/**
 * Everything structurally wrong with a rotation entry, or an empty array.
 *
 * Called from `bootstrap.ts`, which refuses to start a server whose rotation it cannot run. That is
 * the third boot refusal alongside the missing secret and the production outbox, and it is there
 * for the same reason both of those are: a challenge naming a building this server does not ship
 * would fail at the moment a player submitted to it, which is the one moment with no words for it.
 */
export function challengeDefinitionIssues(definition: ChallengeDefinition): readonly string[] {
  const issues: string[] = [];
  if (!/^[a-z0-9-]{2,48}$/u.test(definition.slug)) {
    issues.push(`slug "${definition.slug}" must be 2–48 lower-case letters, digits and hyphens`);
  }
  if (definition.name.trim().length === 0) issues.push(`${definition.slug}: a challenge needs a name`);
  if (definition.brief.trim().length < 40) {
    issues.push(`${definition.slug}: a brief is two or three sentences, not a label`);
  }
  if (!ACCEPTED_DURATIONS_S.includes(definition.config.durationS)) {
    issues.push(
      `${definition.slug}: durationS must be one of ${ACCEPTED_DURATIONS_S.join(', ')} — a challenge ` +
        'a submission cannot legally carry is a challenge nobody can post to',
    );
  }
  const rate = definition.config.arrivalRatePctPop5min;
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
    issues.push(`${definition.slug}: arrivalRatePctPop5min must be null or a percentage in (0, 100]`);
  }
  if (definition.seeds.length < MIN_CHALLENGE_SEEDS || definition.seeds.length > MAX_CHALLENGE_SEEDS) {
    issues.push(
      `${definition.slug}: a challenge names ${String(MIN_CHALLENGE_SEEDS)}–${String(MAX_CHALLENGE_SEEDS)} ` +
        `seeds, not ${String(definition.seeds.length)}`,
    );
  }
  if (new Set(definition.seeds).size !== definition.seeds.length) {
    issues.push(`${definition.slug}: a repeated seed is the same run twice, not a larger sample`);
  }
  for (const seed of definition.seeds) {
    if (!/^\d{1,20}$/u.test(seed)) issues.push(`${definition.slug}: seed "${seed}" is not 1–20 decimal digits`);
  }
  return Object.freeze(issues);
}
