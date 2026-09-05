/**
 * **The challenge, as the browser has to hold it**: the wire shapes, and the pure function that
 * turns one issued challenge into the runs a player must actually perform.
 *
 * `DECISIONS.md` § D218; [`docs/17`](../../../../docs/17-play-experience-audit.md) § 4.3. The
 * server side of this — `packages/server/src/challenge/` — issues a challenge as data, fixes the
 * seed set, leaves the dispatcher free, and re-runs every seed before it will believe a number.
 * This file is the half that lives in a static bundle.
 *
 * ## Nothing here is imported from `@elevator-sim/server`, and the duplication is the point
 *
 * `viz` is a browser bundle; `server` opens a socket and a database. Invariant 6 says `core` must
 * build and test with `viz` absent, and the same rule runs in this direction: **`viz` must build
 * and test with `packages/server` absent.** So every type below is a structural restatement of a
 * server type rather than an import of one, and that is correct rather than lazy — the wire is the
 * contract, and two ends of a wire are allowed to declare the same shape twice.
 *
 * What is *not* allowed is for the two to drift silently, so the restatement is checked rather than
 * promised: `challenge.test.ts` reads the server's **source text** — `client.test.ts`'s own method,
 * for `client.test.ts`'s own reason — and fails if the terms move.
 *
 * ## The one duplication that is load-bearing rather than incidental
 *
 * {@link challengeRunConfigs} mirrors `leaderboard/verify.ts#configFor` **term for term**: the same
 * `BigInt(seed)`, the same `onTimeout: 'report'`, the same treatment of a `null`
 * `arrivalRatePctPop5min` as *the building's own traffic profile* rather than as a rate, the same
 * keys present and the same keys absent.
 *
 * That is not tidiness. The server verifies a submission by rebuilding the configuration from ids
 * and replaying it, and accepts the claim only if it reproduces to
 * `leaderboard/verify.ts#METRIC_EPSILON`. **A config that differs from the server's in any term
 * produces a submission the server rejects as a forgery** — and a rejection is the one accusation
 * this product makes, so spending it on a client that assembled the run slightly differently is the
 * worst failure available here: it costs an honest player their score and tells them their figures
 * did not replay, which is true and useless.
 *
 * So `challenge.test.ts` pins the two constructions field for field, and derives the server's own
 * key set out of its source so a term added there goes red here.
 *
 * ## The clock is the server's — § D218 § 3, mechanically
 *
 * Nothing in this file reads a clock. `state`, `opensInMs` and `closesInMs` all arrive **computed
 * by the server**, and a client that recomputed any of them would be a second answer to a question
 * already answered — the two disagreeing at exactly the moment it matters, either side of a window
 * boundary. `challenge.test.ts` asserts the absence lexically, over this file's own source, because
 * *"we did not read a clock"* is a claim about every future edit and not only about this one.
 */

// The browser subpath, not the bare specifier: `boundaries.test.ts` requires it, and the reason is
// that the bare entry point pulls in `node:` types that the bundle does not have — so a type checked
// against one and shipped against the other agrees on nothing that matters.
import type { SimulationConfig } from '@elevator-sim/core/browser';
// The same rule the leaderboard's two sides read, reached through the same browser-safe module —
// GitHub issue #315, and `challengeRunConfigs` says below why this is an import and not a copy.
import { reportWindowForBuilding } from '@elevator-sim/experiments/browser';

import type { BrowserResources } from '../dev/data.js';

import type { Failure } from './client.js';

/* -------------------------------------------------------------------------- *
 * The wire shapes
 * -------------------------------------------------------------------------- */

/** Where a challenge sits relative to the **server's** clock. Never computed here. */
export type ChallengeState = 'upcoming' | 'open' | 'closed';

/**
 * Everything a challenge fixes about the run — that is, everything except the dispatcher.
 *
 * `arrivalRatePctPop5min: null` is a *selection*, not a missing value: it means the building's own
 * traffic profile. {@link challengeRunConfigs} treats it as one, because the server does.
 */
export interface ChallengeConfig {
  readonly buildingId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
}

/** A challenge as issued: everything the client needs and nothing it has to work out. */
export interface IssuedChallengeView {
  readonly id: string;
  readonly name: string;
  readonly brief: string;
  readonly config: ChallengeConfig;
  /** Decimal-digit strings, in the order the challenge names them. That order is authoritative. */
  readonly seeds: readonly string[];
  readonly opensAtMs: number;
  readonly closesAtMs: number;
}

/** Where Compare answers the question a board may not — § D218 § 5 clause 5. */
export interface ComparePointer {
  /** The server's sentence. Shown, never paraphrased. */
  readonly note: string;
  readonly buildingId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
}

/**
 * One challenge, plus the three things only the server can say about it.
 *
 * `opensInMs` and `closesInMs` are **durations the server computed**, not timestamps to subtract a
 * local clock from. `dataHash` is `null` when this server can no longer resolve the challenge
 * against its own reference data, in which case its board cannot be read and nothing can be posted.
 */
export interface ChallengeView {
  readonly challenge: IssuedChallengeView;
  readonly state: ChallengeState;
  readonly seedCount: number;
  readonly opensInMs: number | null;
  readonly closesInMs: number | null;
  readonly clockNote: string;
  readonly dataHash: string | null;
  readonly compare: ComparePointer;
}

/** A challenge in the index list: enough to name it and draw its window, and no configuration. */
export interface ChallengeSummary {
  readonly id: string;
  readonly name: string;
  readonly opensAtMs: number;
  readonly closesAtMs: number;
  readonly state: ChallengeState;
}

/** `GET /api/challenges` — the only answer to *"which challenge is it today"*. */
export interface ChallengeIndex {
  readonly currentId: string;
  readonly current: ChallengeView;
  readonly clockNote: string;
  readonly recent: readonly ChallengeSummary[];
}

/**
 * One run's claimed figures, tagged with the seed they belong to and the count they came from.
 *
 * `legs` is the served legs in that run's measurement window, and the server compares it **like a
 * metric** rather than treating it as metadata — R13 at the wire: `n` is part of what a mean means,
 * so a claim that reproduces four numbers and misses the count is a claim about a different
 * measurement window.
 */
export interface ClaimedSeedMetrics {
  readonly seed: string;
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  readonly awtIsValid: boolean;
  readonly legs: number;
}

/** The POST body: which challenge, which dispatcher, and one claim per seed. */
export interface ChallengeSubmission {
  readonly challengeId: string;
  readonly dispatcherProfileId: string;
  readonly claimed: readonly ClaimedSeedMetrics[];
}

/** One run of the set, as the **server** measured it. The claim is compared and then discarded. */
export interface SeedResult {
  readonly seed: string;
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  readonly legs: number;
}

/**
 * A board row's numbers: four means, the two counts behind them, and every run they came from.
 *
 * No interval and no dispersion, deliberately — five runs cannot support an inference, and a
 * `[min, max]` beside a mean is read as a confidence interval by everyone who has seen one. A
 * renderer must not synthesise one from `perSeed` either.
 */
export interface ChallengeScore {
  readonly runs: number;
  readonly legs: number;
  readonly meanAwtS: number;
  readonly meanWt95S: number;
  readonly meanTtdMeanS: number;
  readonly meanPctOverLongWait: number;
  readonly perSeed: readonly SeedResult[];
}

export interface ChallengeBoardRow {
  readonly id: string;
  readonly displayName: string;
  readonly dispatcherProfileId: string;
  readonly score: ChallengeScore;
  readonly submittedAtMs: number;
}

/**
 * `GET /api/challenge-board` — these players, on these seeds, in this order.
 *
 * Every honesty obligation this surface carries arrives **in the body** rather than being something
 * the client is trusted to remember: `seedCount` and each row's own `runs`/`legs` (R13), `note`
 * (§ D106 and § D218 § 5 clause 2), and `compare` (clause 5). A renderer that drops `note` or
 * `compare` is free to draw a composite with nothing on screen saying it should not.
 *
 * `entriesOnOtherData` is counted rather than merged and rather than dropped: entries set before a
 * mid-challenge `data/` change describe runs this server can no longer reproduce, so they are on
 * their own board. `otherDataNote` is present exactly when that count is non-zero.
 */
export interface ChallengeBoardPage {
  readonly challengeId: string;
  readonly challenge: IssuedChallengeView;
  readonly state: ChallengeState;
  readonly dataHash: string;
  readonly metric: string;
  readonly seedCount: number;
  readonly note: string;
  readonly compare: ComparePointer;
  readonly entries: readonly ChallengeBoardRow[];
  readonly entriesOnOtherData: number;
  readonly otherDataNote?: string | undefined;
}

/** `201` from `POST /api/challenge-scores`. */
export interface ChallengeEntryAccepted {
  readonly challengeId: string;
  readonly dataHash: string;
  readonly entry: ChallengeBoardRow;
}

/* -------------------------------------------------------------------------- *
 * The 409 a caller has to be able to read
 * -------------------------------------------------------------------------- */

/**
 * The body of the `challenge-not-open` refusal, typed.
 *
 * `Failure` carries a code and a sentence, which is all most refusals are. This one carries five
 * further facts the server worked out — which state the requested challenge is in, its own window,
 * and **which challenge is open now** — and a screen that could not reach them could only say
 * *"closed"* and leave the player nowhere to go. § D218 § 5 asks for *"a reason a player can act
 * on"*, and the actionable half is `currentChallengeId`.
 */
export interface ChallengeNotOpen {
  readonly state: ChallengeState;
  readonly challengeId: string;
  readonly opensAtMs: number;
  readonly closesAtMs: number;
  readonly currentChallengeId: string;
  /** The server's own wording. Carried unrewritten — it names a date and names what to do next. */
  readonly detail: string;
}

/**
 * Read a `challenge-not-open` refusal, or `undefined` for any other failure.
 *
 * Every field is checked before the object is handed back, because this is the one refusal a screen
 * *branches* on: a partially-shaped body reaching a countdown would put `undefined` where a date
 * belongs, which is the failure mode `client.ts`'s `unexpected-response` exists to prevent on the
 * success path.
 */
export function challengeNotOpenOf(failure: Failure): ChallengeNotOpen | undefined {
  if (failure.code !== 'challenge-not-open') return undefined;
  const body = failure.body as Record<string, unknown> | null | undefined;
  const state = body?.['state'];
  const challengeId = body?.['challengeId'];
  const opensAtMs = body?.['opensAtMs'];
  const closesAtMs = body?.['closesAtMs'];
  const currentChallengeId = body?.['currentChallengeId'];
  if (
    (state !== 'upcoming' && state !== 'closed' && state !== 'open') ||
    typeof challengeId !== 'string' ||
    typeof opensAtMs !== 'number' ||
    typeof closesAtMs !== 'number' ||
    typeof currentChallengeId !== 'string'
  ) {
    return undefined;
  }
  return { state, challengeId, opensAtMs, closesAtMs, currentChallengeId, detail: failure.detail };
}

/* -------------------------------------------------------------------------- *
 * Refusals
 * -------------------------------------------------------------------------- */

/**
 * Why this module refused to build something, as a thing a caller can branch on.
 *
 * The first three deliberately reuse `leaderboard/verify.ts#RejectionCode`'s spellings, because
 * they are the same three questions asked one round trip earlier and a screen that already words
 * `unknown-dispatcher` should not need a second vocabulary for it.
 */
export type ChallengeRefusalCode =
  | 'unknown-building'
  | 'unknown-dispatcher'
  | 'unknown-template'
  | 'too-many-seeds'
  | 'missing-seed'
  | 'duplicate-seed'
  | 'unknown-seed'
  | 'wrong-run'
  | 'figure-not-measured';

/**
 * A refusal, with a sentence that can go on screen as-is.
 *
 * **These sentences are the client's own**, which is the exception to `client.ts`'s rule that the
 * server's wording is carried unrewritten. There is no server wording to carry: the whole point of
 * refusing here is that the request is never made.
 */
export interface ChallengeRefusal {
  readonly ok: false;
  readonly code: ChallengeRefusalCode;
  readonly detail: string;
}

export interface ChallengeRuns {
  readonly ok: true;
  readonly runs: readonly ChallengeRun[];
}

/**
 * One seed's run: the configuration, and the seed **as the challenge spelled it**.
 *
 * The string is carried rather than re-derived from `config.seed`, and that is not redundancy.
 * `BigInt('007')` is `7n`, so `String(config.seed)` is not necessarily the literal the challenge
 * named — and the claim a player posts is filed under the challenge's spelling. A client that
 * round-tripped the seed through a `BigInt` could file a whole honest set under seeds the challenge
 * does not name and be told its figures did not reproduce.
 */
export interface ChallengeRun {
  readonly seed: string;
  readonly config: SimulationConfig;
}

/* -------------------------------------------------------------------------- *
 * The runs a challenge asks for
 * -------------------------------------------------------------------------- */

/**
 * The most seeds this build will run for one challenge — the server's own ceiling, mirrored.
 *
 * Not a client rule stricter than the server's, which is the drift `client.test.ts` warns about:
 * `challenge/schedule.ts#MAX_CHALLENGE_SEEDS` is the same number, `challengeDefinitionIssues`
 * refuses a rotation entry above it and `bootstrap.ts` refuses to start a server carrying one, so
 * nothing a correct server issues can exceed this. It is here because the cost of the alternative
 * lands on the player: a seed list is a direct multiplier on simulations the *browser* runs, and
 * a thousand-seed challenge would lock a tab up rather than fail.
 *
 * `challenge.test.ts` reads the constant out of the server's source, so raising it there without
 * raising it here is red.
 */
export const MAX_CHALLENGE_SEEDS = 8;

/**
 * One `SimulationConfig` per seed the challenge names, or a refusal naming what is missing.
 *
 * **This is `leaderboard/verify.ts#configFor`, restated.** Read that function beside this one; if
 * they disagree in any term, this one is wrong, because the server's is what a submission is
 * checked against. The parity is pinned by a test rather than by this paragraph.
 *
 * Two differences, both of which are the same shape in both files:
 *
 * - the server spreads `elevatorSpecs` and `dispatcherProfiles` conditionally because
 *   `VerificationResources` types them optional, and a shipped server always supplies both from
 *   `loadConfig`. {@link BrowserResources} types them **required**, so they are unconditional here
 *   and the two configurations carry the same keys;
 * - the seed loop is this function's, because a challenge is a set. `configFor` builds one.
 *
 * Iterates `view.challenge.seeds` in the challenge's own order — the order the server verifies in
 * and the order it aggregates in.
 */
export function challengeRunConfigs(
  view: ChallengeView,
  resources: BrowserResources,
  dispatcherProfileId: string,
): ChallengeRuns | ChallengeRefusal {
  const { config, seeds } = view.challenge;

  const building = resources.buildings.find((entry) => entry.id === config.buildingId);
  if (building === undefined) {
    return {
      ok: false,
      code: 'unknown-building',
      detail: `This build does not ship a building “${config.buildingId}”, so this challenge cannot be run here.`,
    };
  }
  const dispatcherProfile = resources.dispatcherProfiles.profiles.find(
    (entry) => entry.id === dispatcherProfileId,
  );
  if (dispatcherProfile === undefined) {
    return {
      ok: false,
      code: 'unknown-dispatcher',
      detail: `This build does not ship a dispatcher “${dispatcherProfileId}”.`,
    };
  }
  const template = resources.trafficProfiles.demandTemplates.find(
    (entry) => entry.id === config.demandTemplateId,
  );
  if (template === undefined) {
    return {
      ok: false,
      code: 'unknown-template',
      detail:
        `This build does not ship a demand template “${config.demandTemplateId}”, so this ` +
        'challenge cannot be run here.',
    };
  }
  if (seeds.length > MAX_CHALLENGE_SEEDS) {
    return {
      ok: false,
      code: 'too-many-seeds',
      detail:
        `This challenge names ${String(seeds.length)} seeds and this build runs at most ` +
        `${String(MAX_CHALLENGE_SEEDS)} for one challenge.`,
    };
  }

  // Derived from the id, never read off the wire — the argument is at the spread below.
  const reportWindow = reportWindowForBuilding(config.buildingId);

  const runs = seeds.map((seed) => ({
    seed,
    config: {
      building,
      dispatcherProfile,
      trafficProfiles: resources.trafficProfiles,
      elevatorSpecs: resources.elevatorSpecs,
      dispatcherProfiles: resources.dispatcherProfiles,
      // `BigInt` rather than `Number`, exactly as the server does it: a 20-digit seed does not
      // survive a double, and the seed is an identity — rounding it replays a different run.
      seed: BigInt(seed),
      demandTemplate: config.demandTemplateId as SimulationConfig['demandTemplate'],
      durationS: config.durationS,
      // `report`, not `throw`. A run that times out with people still in the system is a legitimate
      // outcome to post; it simply will not be ranked, because `awtIsValid` is false and the
      // server refuses it in words rather than as a server error.
      onTimeout: 'report',
      // `null` means *the building's own traffic profile* — a selection, not an absent rate — so
      // the key is omitted rather than set to anything.
      ...(config.arrivalRatePctPop5min === null
        ? {}
        : { demand: { arrivalRatePctPop5min: config.arrivalRatePctPop5min } }),
      /*
       * **Which window the figures are read over** — GitHub issue #315, arriving here one surface
       * after it was closed on the leaderboard's.
       *
       * `configFor` derives this term from the building id. This function did not, and the term for
       * term promise above is what makes that a defect rather than a difference: a challenge on a
       * building the rule moves would have been measured by the browser over one window and
       * replayed by the server over another, so every honest entry on it would come back
       * `metrics-do-not-reproduce`. That is this product's one accusation, spent on a player who did
       * nothing wrong — and it is exactly what shipped on `garden-apartments`'s leaderboard until
       * #315, where the server read `awtS 18.233` against the browser's `13.462`.
       *
       * **No shipped rotation was affected**, which is why this arrived as a latent hazard rather
       * than as a bug report: `garden-apartments` is the only building whose matrix cells are
       * unanimously `full-run`, and the rotation is `midtown-office`, `chancery-house` and
       * `crown-hotel` — the first not unanimous, the other two not in the matrix at all. All three
       * derive `undefined`, both sides omit the key, and the two configurations were identical by
       * luck rather than by construction.
       *
       * **The same function as the server's, not the same rule written twice.**
       * `@elevator-sim/experiments`'s `reportWindowForBuilding` is what `leaderboard/verify.ts`
       * calls and what `shift/reportWindow.ts#shiftReportWindowFor` names on this side; a third copy
       * would be free to disagree, and the first symptom of the disagreement is the defect above.
       * Keyed on the building id, which a challenge already fixes — **never** on the wire, because a
       * submitted window is a player-settable parameter inside a board key and the window is the
       * divisor of every mean on the sheet.
       *
       * Spread-or-omit rather than `reportWindow: …`, because an absent key and a present
       * `undefined` are different claims to `core` and only the first means *the template's own*.
       * `challenge.test.ts`'s key-parity guard is what holds this in place, and it could not see
       * this shorthand until #315 taught it to.
       */
      ...(reportWindow === undefined ? {} : { reportWindow }),
    } as SimulationConfig,
  }));

  return { ok: true, runs };
}

/* -------------------------------------------------------------------------- *
 * What a browser claims about a run
 * -------------------------------------------------------------------------- */

/**
 * The parts of a recording's summary this module reads.
 *
 * Structural rather than `VizSummary`, in `catalogue.ts`'s idiom and for its reason: a submission
 * fixture should be six numbers, not a whole recording. `challenge.test.ts` asserts a real
 * `VizRecording` is assignable to {@link ChallengeRunRecording}, so the narrowing cannot drift from
 * the thing it narrows.
 */
export interface ChallengeRunSummary {
  readonly meanWaitS: number;
  readonly wait95S: number;
  readonly meanTimeToDestinationS: number;
  /** `null` when it was never measured — `recordRun.ts#finiteOrNull` writing `core`'s `NaN`. */
  readonly pctOverLongWait: number | null;
  readonly awtIsValid: boolean;
  /** Waits the window's mean was computed over — R13's `n`, and the server's `legs`. */
  readonly waitCount: number;
}

/** The parts of a recording this module reads. */
export interface ChallengeRunRecording {
  /**
   * **The seed this run was filed under — which is {@link ChallengeRun.seed}, not
   * `String(config.seed)`.**
   *
   * `VizRecording.seed` is `SimulationResult.seed`, and that is the master seed *canonicalised
   * through a `BigInt`*: a challenge naming `007` produces a recording saying `7`. Every shipped
   * challenge spells its seeds canonically, so the two agree today and would stop agreeing on the
   * day one did not — silently, by refusing an honest set as `unknown-seed`. A caller assembling
   * this from a recording should therefore write `{ ...recording, seed: run.seed }`, pairing each
   * recording with the {@link ChallengeRun} it came from rather than trusting the round trip.
   */
  readonly seed: string;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly summary: ChallengeRunSummary;
}

/**
 * One seed's claimed row, read **straight off** the recording this browser produced.
 *
 * No fallback arithmetic, no defaulting, and no rounding to a friendlier number. Every figure here
 * is compared against the server's own replay within `METRIC_EPSILON` — `1e-9` — so a value that
 * has been tidied on the way out is a value that does not reproduce, and the player is told their
 * run did not replay. Two consequences worth naming:
 *
 * - **`legs` is the real count.** `waitCount` is the `n` behind this run's own AWT, and the server
 *   compares it like any other figure. There is nothing to round it to.
 * - **`pctOverLongWait` maps `null` back to `NaN`.** That is not a fallback; it is the exact
 *   inverse of the `NaN → null` the recording contract applies so the value survives
 *   `JSON.stringify`. `NaN` is what `core` measured and what the server will measure, and
 *   `metricsAgree` treats two `NaN`s as the same number. {@link challengeSubmissionOf} refuses to
 *   put one on the wire anyway — see there for why.
 *
 * `awtIsValid` travels as measured, false included. A client that quietly corrected it would be
 * claiming a quotable mean for a diverging queue, which is the one thing the flag exists to stop.
 */
export function claimedSeedMetricsOf(
  seed: string,
  recording: ChallengeRunRecording,
): ClaimedSeedMetrics {
  const { summary } = recording;
  return {
    seed,
    awtS: summary.meanWaitS,
    wt95S: summary.wait95S,
    ttdMeanS: summary.meanTimeToDestinationS,
    pctOverLongWait: summary.pctOverLongWait ?? Number.NaN,
    awtIsValid: summary.awtIsValid,
    legs: summary.waitCount,
  };
}

export interface ChallengeSubmissionBuilt {
  readonly ok: true;
  readonly submission: ChallengeSubmission;
}

/**
 * The POST body for a whole challenge, or a refusal — **before** the network.
 *
 * ## Why refuse here at all, when the server checks everything again
 *
 * Because the server's refusal is an accusation and this one is not. `challenge/verify.ts` replays
 * every seed and says *"replaying seed N did not reproduce the submitted figures"*; that sentence
 * is correct for a player on an older build and correct for a player whose client filed the wrong
 * run under a seed, and only the first of those is the player's problem. `dev/main.ts#submitScore`
 * already makes this argument for the config board — *"without the check the server would reject
 * those as forgeries, spending the one accusation this product makes on a client bug"* — and a
 * challenge multiplies it, because one submission is one replay **per seed**.
 *
 * So this refuses exactly the things a client can be wrong about:
 *
 * | refusal | what it catches |
 * |---|---|
 * | `missing-seed` | a set short by one. Partial reproduction is not reproduction (§ D218 § 5 clause 4) |
 * | `duplicate-seed` | the same run twice, which is not a larger sample |
 * | `unknown-seed` | a recording from a seed this challenge does not name |
 * | `wrong-run` | a recording of a different building or a different dispatcher, filed into this set |
 * | `figure-not-measured` | a figure that has no number, so no honest claim can be made about it |
 *
 * ## What it deliberately does **not** refuse
 *
 * **A run whose `awtIsValid` is false.** That is not a client bug: the run is real, and its mean is
 * not reportable. The server has a sentence for it that says exactly that and names the seed, and
 * pre-empting it here would be this module deciding quotability — which is the judgement
 * `client.ts` says a client does not make. It is refused honestly, one round trip later, in better
 * words than these.
 *
 * `figure-not-measured` is not that judgement in disguise: it fires when a metric is `NaN` — never
 * measured — and the wire has no representation for one, so the alternative is a `null` arriving at
 * a server that will call it a malformed request.
 */
export function challengeSubmissionOf(
  view: ChallengeView,
  dispatcherProfileId: string,
  recordings: readonly ChallengeRunRecording[],
): ChallengeSubmissionBuilt | ChallengeRefusal {
  const { challenge } = view;
  const wanted = new Set(challenge.seeds);

  const bySeed = new Map<string, ChallengeRunRecording>();
  for (const recording of recordings) {
    if (!wanted.has(recording.seed)) {
      return {
        ok: false,
        code: 'unknown-seed',
        detail:
          `Seed ${recording.seed} is not one “${challenge.name}” names. Its seeds are ` +
          `${challenge.seeds.join(', ')}.`,
      };
    }
    if (bySeed.has(recording.seed)) {
      return {
        ok: false,
        code: 'duplicate-seed',
        detail: `Seed ${recording.seed} was run twice. One run per seed — the same run twice is not a larger sample.`,
      };
    }
    if (recording.buildingId !== challenge.config.buildingId) {
      return {
        ok: false,
        code: 'wrong-run',
        detail:
          `The run recorded for seed ${recording.seed} is of ${recording.buildingId}, and ` +
          `“${challenge.name}” is set on ${challenge.config.buildingId}. Re-run the set before posting it.`,
      };
    }
    if (recording.dispatcherProfileId !== dispatcherProfileId) {
      return {
        ok: false,
        code: 'wrong-run',
        detail:
          `The run recorded for seed ${recording.seed} used ${recording.dispatcherProfileId} and this ` +
          `entry is for ${dispatcherProfileId}. Every seed of a challenge is run with one dispatcher.`,
      };
    }
    bySeed.set(recording.seed, recording);
  }

  const missing = challenge.seeds.filter((seed) => !bySeed.has(seed));
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'missing-seed',
      detail:
        `“${challenge.name}” is ${String(challenge.seeds.length)} seeds and ` +
        `${String(bySeed.size)} have been run — ${missing.join(', ')} still to go. Every seed is ` +
        'replayed and every seed has to reproduce, so a set that is short by one is not a partial ' +
        'result.',
    };
  }

  const claimed: ClaimedSeedMetrics[] = [];
  for (const seed of challenge.seeds) {
    const recording = bySeed.get(seed);
    // Unreachable: `missing` above is empty, so every seed has a recording. Stated as a refusal
    // rather than asserted, because "unreachable" is a claim about a caller and a `!` here would
    // put `undefined` on the wire the day it stopped being true.
    if (recording === undefined) {
      return { ok: false, code: 'missing-seed', detail: `Seed ${seed} has not been run.` };
    }
    const row = claimedSeedMetricsOf(seed, recording);
    for (const [name, value] of [
      ['average wait', row.awtS],
      ['95th-percentile wait', row.wt95S],
      ['time to destination', row.ttdMeanS],
      ['percentage over the long-wait threshold', row.pctOverLongWait],
    ] as const) {
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          code: 'figure-not-measured',
          detail:
            `Seed ${seed} has no ${name}: nothing was measured in its report window, so there is ` +
            'no figure to claim. The run is real; there is nothing to post about it.',
        };
      }
    }
    claimed.push(row);
  }

  return {
    ok: true,
    submission: { challengeId: challenge.id, dispatcherProfileId, claimed },
  };
}
