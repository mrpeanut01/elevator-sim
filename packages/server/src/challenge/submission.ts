/**
 * What a player submits to a challenge, and what a row on a challenge board actually is.
 *
 * `DECISIONS.md` § D218 § 2. The shape follows `leaderboard/submission.ts` exactly where it can —
 * ids rather than inline objects, nothing trusted, a cheap shape gate that runs before anything
 * simulates — and diverges in the two places a challenge differs from a single run.
 *
 * ## Divergence 1: a submission is a set, and it is verified as a set
 *
 * The claim is an array with **one entry per seed the challenge names**, and the seed set has to
 * match exactly — no missing seed, no extra seed, no repeat. {@link challengeSubmissionIssues}
 * refuses a partial set here, before a single simulation runs, because *partial reproduction is not
 * reproduction* (§ D218 § 5 clause 4) and the cheapest place to say so is the place that costs no
 * CPU. `verify.ts` then says it again the expensive way, per seed.
 *
 * ## Divergence 2: every claimed number carries the count it was computed over
 *
 * `ClaimedMetrics` is four numbers and a validity flag. {@link ClaimedSeedMetrics} adds `legs` —
 * the served legs in that run's measurement window — and the verifier compares it like any other
 * claimed figure. This is R13 given teeth at the wire: *"`n = 5` is not a caveat on `11.3 s`; it is
 * part of what `11.3 s` means"*, and a client that could send the mean without the count could
 * send a mean of five legs and have it drawn beside a mean of sixty with nothing distinguishing
 * them. It is also, incidentally, a second independent thing a forgery has to get right.
 *
 * ## What a row is, and what it is not
 *
 * {@link ChallengeScore} is an arithmetic **mean over the seed set** of each of the four metrics,
 * carried beside one another and never combined — § D106's rule, which the config board already
 * states on the wire and which matters more here because a board of aggregates is where a composite
 * would be most tempting.
 *
 * It carries **no interval, and no dispersion at all**, and that omission is deliberate rather than
 * unfinished. `CLAUDE.md` § Statistical discipline budgets 50–200 replications and says ten is not
 * enough; five cannot support an inference, and a `[min, max]` printed beside a mean is read as a
 * confidence interval by every reader who has seen one. § D218 § 2 says a challenge board *"has no
 * interval, and may not be worded as though it had one"* — printing a bracketed pair would be
 * wording it as though it had one without using a word at all. What it does carry is
 * {@link ChallengeScore.perSeed}: every underlying run, in full, so the mean is auditable rather
 * than merely small.
 */

import { createHash } from 'node:crypto';

import { canonicalJson, type ClaimedMetrics } from '../leaderboard/submission.js';
import type { IssuedChallenge } from './schedule.js';

/* -------------------------------------------------------------------------- *
 * The submission
 * -------------------------------------------------------------------------- */

/**
 * One run's claimed figures, tagged with the seed they belong to and the count they came from.
 *
 * `awtIsValid` travels for the reason `ClaimedMetrics` documents and one further reason here: a
 * challenge is refused outright if **any** of its seeds is unquotable, so a client that could omit
 * the flag could get four honest runs and one saturated one averaged into a board row.
 */
export interface ClaimedSeedMetrics extends ClaimedMetrics {
  /** Decimal digits. Must be one of the challenge's own seeds. */
  readonly seed: string;
  /** Served legs in that run's measurement window — the `n` behind that run's own AWT. */
  readonly legs: number;
}

/**
 * A challenge entry: which challenge, which dispatcher, and one claim per seed.
 *
 * The dispatcher is here and **not** in the challenge, because it is the axis the player chooses.
 * Everything else about the run comes from the issued challenge, which is why a submission cannot
 * name a building, a rate or a duration at all — there is nowhere to put one.
 */
export interface ChallengeSubmission {
  readonly challengeId: string;
  readonly dispatcherProfileId: string;
  readonly claimed: readonly ClaimedSeedMetrics[];
}

/* -------------------------------------------------------------------------- *
 * The row
 * -------------------------------------------------------------------------- */

/** One run of the set, as the **server** measured it. A claim is compared and then discarded. */
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
 * `runs` is R13's count for the means themselves — five runs, stated in the same visual unit as the
 * figure and not in a tooltip. `legs` is the count one level down: the total served legs the five
 * underlying AWTs were computed over, which is what stops a row of five two-leg runs reading like a
 * row of five sixty-leg runs.
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

/**
 * The mean of each metric over the seed set, with both counts and the runs themselves.
 *
 * A plain arithmetic mean, and the seeds are already in the challenge's own order, so two players
 * on the same seed set aggregate identically down to the summation order. That is not pedantry:
 * floating-point addition is not associative, and a board that ranked two players whose runs
 * summed in different orders would have a tie-break nobody could see.
 */
export function challengeScoreOf(perSeed: readonly SeedResult[]): ChallengeScore {
  const runs = perSeed.length;
  const mean = (pick: (result: SeedResult) => number): number =>
    runs === 0 ? Number.NaN : perSeed.reduce((total, result) => total + pick(result), 0) / runs;
  return Object.freeze({
    runs,
    legs: perSeed.reduce((total, result) => total + result.legs, 0),
    meanAwtS: mean((result) => result.awtS),
    meanWt95S: mean((result) => result.wt95S),
    meanTtdMeanS: mean((result) => result.ttdMeanS),
    meanPctOverLongWait: mean((result) => result.pctOverLongWait),
    perSeed: Object.freeze([...perSeed]),
  });
}

/* -------------------------------------------------------------------------- *
 * The board identity
 * -------------------------------------------------------------------------- */

/**
 * The facts about the server's own `data/` that a challenge's results depend on.
 *
 * The same § D214 § 4 lesson as `ResolvedDataFacts`, with **one field shaped differently and one
 * field added**, both because a challenge lets the dispatcher vary.
 *
 * `dispatcherLibraryDigest` is a digest of the **whole profile library**, not of the one profile a
 * submitter used. It has to be: a board where each row hashed only its own dispatcher would not
 * fork when a profile changed, so an edit to `collective` would leave one row describing a run that
 * no longer exists while every other row still described its own correctly. Digesting the library
 * forks the entire board at once, which is the honest outcome — after such an edit, *every* row
 * means something different from what it meant.
 *
 * `elevatorSpecsDigest` is here because `SimulationConfig` takes `elevatorSpecs` alongside the
 * building, so a spec change moves a result without moving the building document.
 * **`ResolvedDataFacts` does not carry it**, which is a real gap in the config board's identity —
 * left alone here rather than fixed, because changing `configHashOf` would fork every board that
 * already exists, and `leaderboard/verify.test.ts` pins its behaviour deliberately.
 */
export interface ChallengeDataFacts {
  readonly buildingDigest: string;
  readonly templateDigest: string;
  readonly dispatcherLibraryDigest: string;
  readonly elevatorSpecsDigest: string;
  /** `TRAFFIC_DEFAULTS.trafficModel` — which simulator produced the numbers, not which schema. */
  readonly trafficModel: string;
}

/**
 * The board a challenge entry belongs to: the challenge, plus the `data/` it was set against.
 *
 * Not the challenge id alone. A challenge runs for a week and reference data can change inside
 * one, and the § D205 / § D213 defect with a competition on it is a board whose old rows quietly
 * stop describing their own runs — and stop re-verifying, so honest entries start failing the check
 * that exists to catch forgeries. A `data/` change starts a second board under the same challenge;
 * the first stays readable and stays verifiable against the data it was set on, and `http/api.ts`
 * says on the wire how many entries are on the other one rather than dropping them silently.
 */
export function challengeDataHashOf(challenge: IssuedChallenge, facts: ChallengeDataFacts): string {
  const canonical = canonicalJson({
    challengeId: challenge.id,
    seeds: challenge.seeds,
    buildingId: challenge.config.buildingId,
    demandTemplateId: challenge.config.demandTemplateId,
    arrivalRatePctPop5min: challenge.config.arrivalRatePctPop5min,
    durationS: challenge.config.durationS,
    buildingDigest: facts.buildingDigest,
    templateDigest: facts.templateDigest,
    dispatcherLibraryDigest: facts.dispatcherLibraryDigest,
    elevatorSpecsDigest: facts.elevatorSpecsDigest,
    trafficModel: facts.trafficModel,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/* -------------------------------------------------------------------------- *
 * The cheap gate
 * -------------------------------------------------------------------------- */

/**
 * Everything structurally wrong with a challenge submission, or an empty array.
 *
 * Runs **before** anything simulates, and it is worth more here than it is on the single-run route:
 * a challenge verification is one simulation **per seed**, so a shape error that reached the
 * verifier would command five runs rather than one. Everything checkable without the kernel is
 * checked here, including the whole of the seed-set rule — which is the cheap half of § D218's
 * clause 4, and the half that catches an honest client with a bug rather than a forger.
 *
 * Takes the issued challenge rather than trusting the submission to describe itself. The seeds a
 * submission must cover are a fact about the challenge, and asking the submission would let it
 * define the set it is checked against.
 */
export function challengeSubmissionIssues(
  submission: ChallengeSubmission,
  challenge: IssuedChallenge,
): readonly string[] {
  const issues: string[] = [];

  const dispatcher = submission.dispatcherProfileId;
  if (typeof dispatcher !== 'string' || dispatcher.length === 0 || dispatcher.length > 64) {
    issues.push('dispatcherProfileId must be a non-empty id under 64 characters');
  }
  if (!Array.isArray(submission.claimed)) {
    issues.push('claimed must be one set of figures per seed this challenge names');
    return Object.freeze(issues);
  }

  const wanted = new Set(challenge.seeds);
  const seen = new Set<string>();
  for (const entry of submission.claimed) {
    if (typeof entry?.seed !== 'string' || !wanted.has(entry.seed)) {
      issues.push(
        `seed "${String(entry?.seed)}" is not one this challenge names — its seeds are ` +
          `${challenge.seeds.join(', ')}`,
      );
      continue;
    }
    if (seen.has(entry.seed)) issues.push(`seed ${entry.seed} appears twice; one run per seed`);
    seen.add(entry.seed);

    for (const [name, value] of [
      ['awtS', entry.awtS],
      ['wt95S', entry.wt95S],
      ['ttdMeanS', entry.ttdMeanS],
      ['pctOverLongWait', entry.pctOverLongWait],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push(`seed ${entry.seed}: ${name} must be a non-negative number`);
      }
    }
    if (!Number.isInteger(entry.legs) || entry.legs < 0) {
      issues.push(`seed ${entry.seed}: legs must be a non-negative whole number of served legs`);
    }
    if (typeof entry.awtIsValid !== 'boolean') {
      issues.push(`seed ${entry.seed}: awtIsValid must be a boolean`);
    }
  }

  const missing = challenge.seeds.filter((seed) => !seen.has(seed));
  if (missing.length > 0) {
    // The sentence § D218 § 5 clause 4 asks for, said in the place that costs nothing to say it.
    issues.push(
      `this challenge is ${String(challenge.seeds.length)} seeds and ${String(seen.size)} were submitted — ` +
        `missing ${missing.join(', ')}. Every seed is replayed and every seed has to reproduce; ` +
        'a set that is short by one is not a partial result, it is not a result',
    );
  }

  return Object.freeze(issues);
}
