/**
 * **Every player-facing sentence the challenge surface says, in one place, so that one test can
 * read all of them.**
 *
 * `DECISIONS.md` § D218 § 5 clause 2: *no string on that surface orders two dispatchers.* That is
 * the clause the whole feature has to survive, because [`docs/10`](../../../../docs/10-experience-layer-contract.md)
 * § 5.5 forbids *"a leaderboard ranking dispatchers from single runs"* (R2) and a board on which the
 * dispatcher is the free axis is one sentence away from being exactly that.
 *
 * ## The rule, and why it is lexical rather than semantic
 *
 * The rule this module keeps is blunt on purpose: **the comparative vocabulary does not appear
 * here at all.** No *better*, *best*, *beats*, *worse*, *outperforms*, *superior*, *optimal*,
 * *winner*. Not "avoided where it would be misleading" — absent, so that
 * `challenge.test.ts` can check it by reading the strings rather than by understanding them.
 *
 * A semantic test would be better and this repository cannot write one. A lexical test has a known
 * failure mode in the other direction — it would flag an honest negation, *"this is not a claim
 * that one dispatcher is better"* — and the cost of that is one rewrite of one sentence, which is
 * what the copy below is. The cost of the failure mode it prevents is the product's central
 * honesty claim.
 *
 * The complementary check lives where it can see more: `http/challengeApi.test.ts` sweeps the
 * **serialised response body** of every challenge route, so a string added straight into `api.ts`
 * without passing through this module is caught too.
 *
 * ## What the board is allowed to say, positively
 *
 * *"These players, on these seeds, in this order."* That is a fact about **submissions** — who
 * posted what, on a set of traces everybody ran. It carries no interval and is not a paired
 * comparison. {@link comparePointerFor} is the other half of the clause, and § D218 § 5 clause 5
 * makes it a requirement rather than a courtesy: the honest answer to *"is my dispatcher better"*
 * exists in this product, it lives in Compare, and a surface that raised the question without
 * pointing at the answer would be inviting the reader to answer it from the board.
 */

import type { ChallengeState, IssuedChallenge } from './schedule.js';

/**
 * Where the question this board does not answer is answered, and the configuration to answer it on.
 *
 * Deliberately **not** carrying the challenge's seeds. Five seeds is a sample; Compare needs a
 * replication budget, and `CLAUDE.md` § Statistical discipline puts that at 50–200. Handing Compare
 * this challenge's five traces as its budget would produce an under-powered paired interval
 * wearing all of Compare's authority — the § D171 defect (*a row below `MIN_REPLICATION_BUDGET`
 * names no arm*) arriving through the front door.
 */
export interface ComparePointer {
  readonly note: string;
  readonly buildingId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
}

/** The one sentence that may be said about ordering two dispatchers, and where it may be said. */
export const COMPARE_NOTE =
  'Compare answers the question a board cannot. It replays two dispatchers on the same passenger ' +
  'traces at a replication budget large enough to resolve a difference, and reports an interval ' +
  'that can contain zero. This challenge’s seeds are a sample and not a budget, so Compare is ' +
  'handed the configuration and chooses its own.';

/**
 * The configuration a player should open Compare on, having just read a challenge board.
 *
 * The same building, demand template, rate and run length — so the question is asked about the
 * thing that was just played rather than about a default.
 */
export function comparePointerFor(challenge: IssuedChallenge): ComparePointer {
  return Object.freeze({
    note: COMPARE_NOTE,
    buildingId: challenge.config.buildingId,
    demandTemplateId: challenge.config.demandTemplateId,
    arrivalRatePctPop5min: challenge.config.arrivalRatePctPop5min,
    durationS: challenge.config.durationS,
  });
}

/**
 * What a challenge board is, said on the wire rather than only in a docstring.
 *
 * Three claims, each of which a client would otherwise have to be trusted to know: the count every
 * row was computed over (R13), that the four metrics are never combined (§ D106), and that an order
 * here is a fact about submissions and not a measurement of one dispatcher against another. The
 * config board already ships the middle one for the same reason — *"a client cannot draw a
 * composite with nothing on screen saying it should not"* (§ D215 § 6).
 */
export function challengeBoardNote(seedCount: number, metric: string): string {
  const n = String(seedCount);
  return (
    `These players, on these ${n} seeds, in this order. Each row is one player’s mean over all ${n} ` +
    `runs of the set, shown with the count it was computed over; the four metrics sit beside one ` +
    `another and are never combined into a single figure. The order is on ${metric} alone. An order ` +
    `here is a fact about submissions — ${n} runs is a sample, this board carries no interval, and ` +
    'nothing on it is a paired comparison of two dispatchers. See the compare field for where that ' +
    'question is settled.'
  );
}

/**
 * The one sentence on the surface that names the clock, for a client that has to draw a window.
 *
 * A client renders `closesInMs` as a countdown. It is a **duration computed by the server**, not a
 * timestamp for the client to subtract its own clock from: § D218 § 3 says a client that worked out
 * which challenge is current would be a second answer to a question the server has already
 * answered, and a countdown built by differencing two clocks is that answer arriving one subtraction
 * later.
 */
export const CHALLENGE_CLOCK_NOTE =
  'Which challenge is open is decided by the server. The window below is issued with the challenge, ' +
  'and the remaining time is measured on the server’s clock, not on yours.';

/**
 * Why a submission outside the window was refused, in terms a player can act on.
 *
 * § D218 § 5's fifth criterion is *"a reason a player can act on"*, so every branch below names a
 * date **and** names what to do instead: the challenge that is open now, or when the next one
 * opens. A refusal that said only *"this challenge is closed"* would be accurate and would leave
 * the player with nowhere to go.
 */
export function windowRefusalDetail(
  requested: IssuedChallenge,
  requestedState: ChallengeState,
  current: IssuedChallenge,
  currentState: ChallengeState,
): string {
  const head =
    requestedState === 'closed'
      ? `“${requested.name}” closed on ${utcMinute(requested.closesAtMs)} and no longer takes entries.`
      : `“${requested.name}” opens on ${utcMinute(requested.opensAtMs)}, so nothing can be posted to it yet.`;

  if (currentState === 'open' && current.id !== requested.id) {
    return (
      `${head} The challenge open now is “${current.name}” (${current.id}), until ` +
      `${utcMinute(current.closesAtMs)}. Its seeds are on /api/challenge.`
    );
  }
  if (currentState === 'open') {
    // The requested challenge *is* the current one and is still outside its window — reachable only
    // when a client asked about a cycle the arithmetic has already moved past.
    return `${head} Ask /api/challenges for the challenge that is open now.`;
  }
  return `${head} The next challenge opens on ${utcMinute(current.opensAtMs)}.`;
}

/**
 * An epoch millisecond as `2026-08-10 00:00 UTC`.
 *
 * Minutes, and the zone spelled out. A bare ISO string is unambiguous to a program and reads as a
 * machine artefact to a player; a local rendering would be wrong for everyone but the server.
 */
function utcMinute(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
