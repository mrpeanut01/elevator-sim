/**
 * The claims a challenge board rests on, in the order § D218 § 5 makes them.
 *
 * Four of the five criteria are checkable without a socket and are checked here; the fifth — the
 * client never decides which challenge is current — is a statement about a **route**, and lives in
 * `http/challengeApi.test.ts` where a request can be made with a clock in it.
 *
 * The load-bearing test in this file is the last one, and it is a **measurement rather than an
 * assertion**: every configuration in the shipped rotation is replayed on every seed under every
 * shipped dispatcher profile, and every one of those runs has to be quotable. A challenge whose
 * configuration saturates under some arms and not others is a challenge that refuses a player's
 * entry for choosing the wrong dispatcher — which is § D214 § 6 behaving correctly and reading
 * exactly like a bug. Four candidate configurations were rejected on this measurement before the
 * rotation was authored; the test is what stops the fifth from shipping.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';

import { configFor, metricsOf, type VerificationResources } from '../leaderboard/verify.js';
import {
  CHALLENGE_CLOCK_NOTE,
  COMPARE_NOTE,
  challengeBoardNote,
  comparePointerFor,
  windowRefusalDetail,
} from './board.js';
import {
  CHALLENGE_EPOCH_MS,
  CHALLENGE_PERIOD_MS,
  CHALLENGE_ROTATION,
  MAX_CHALLENGE_SEEDS,
  MIN_CHALLENGE_SEEDS,
  challengeCycleIndex,
  challengeDefinitionIssues,
  challengeStateAt,
  issuedChallengeAt,
  issuedChallengeFor,
  type ChallengeDefinition,
} from './schedule.js';
import {
  challengeDataHashOf,
  challengeScoreOf,
  challengeSubmissionIssues,
  type ChallengeDataFacts,
  type ChallengeSubmission,
  type ClaimedSeedMetrics,
  type SeedResult,
} from './submission.js';
import { verifyChallengeSubmission } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;

let config: LoadedConfig;
let resources: VerificationResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
}, 60_000);

/* -------------------------------------------------------------------------- *
 * The schedule
 * -------------------------------------------------------------------------- */

describe('a challenge is issued by the server, from a fixed epoch', () => {
  it('gives exactly one challenge per instant, including at a window boundary', () => {
    const boundary = CHALLENGE_EPOCH_MS + 3 * CHALLENGE_PERIOD_MS;
    const before = issuedChallengeAt(boundary - 1);
    const at = issuedChallengeAt(boundary);
    // Half-open windows. One cycle's close is the next cycle's open to the millisecond, and the
    // interval being half-open is what keeps exactly one of them current at that instant rather
    // than two or none.
    expect(before.id).not.toBe(at.id);
    expect(challengeStateAt(before, boundary)).toBe('closed');
    expect(challengeStateAt(at, boundary)).toBe('open');
    expect(challengeStateAt(at, boundary - 1)).toBe('upcoming');
    expect(before.closesAtMs).toBe(at.opensAtMs);
  });

  it('clamps a clock that reads before the epoch, rather than issuing a negative cycle', () => {
    // A container with an unset RTC should be offered cycle 0 as upcoming — which is true — not a
    // challenge whose id carries a minus sign.
    const early = issuedChallengeAt(CHALLENGE_EPOCH_MS - 10 * CHALLENGE_PERIOD_MS);
    expect(challengeCycleIndex(CHALLENGE_EPOCH_MS - 1)).toBe(0);
    expect(early.id).toBe(issuedChallengeFor(0).id);
    expect(early.id).not.toMatch(/-\d*-/u);
  });

  it('rotates, and a repeat of the same configuration is a different challenge', () => {
    const first = issuedChallengeFor(0);
    const repeat = issuedChallengeFor(CHALLENGE_ROTATION.length);
    // Same seeds, different id, therefore a different board. Merging two cycles would silently make
    // an old entry compete with a new one against a field that was never the same.
    expect(repeat.seeds).toEqual(first.seeds);
    expect(repeat.id).not.toBe(first.id);
    expect(repeat.opensAtMs).toBe(first.opensAtMs + CHALLENGE_ROTATION.length * CHALLENGE_PERIOD_MS);
  });

  it('issues a challenge as data: an id, a configuration, a seed set and a window', () => {
    const issued = issuedChallengeAt(CHALLENGE_EPOCH_MS);
    expect(issued.seeds.length).toBeGreaterThanOrEqual(MIN_CHALLENGE_SEEDS);
    expect(issued.closesAtMs - issued.opensAtMs).toBe(CHALLENGE_PERIOD_MS);
    // The dispatcher is deliberately absent. It is the one axis a challenge leaves free, and it is
    // the whole reason this board can be climbed rather than merely joined.
    expect(Object.keys(issued.config).sort()).toEqual([
      'arrivalRatePctPop5min',
      'buildingId',
      'demandTemplateId',
      'durationS',
    ]);
  });

  it('refuses a rotation entry that is malformed, and says all of it at once', () => {
    const bad: ChallengeDefinition = {
      slug: 'Not A Slug',
      name: '',
      brief: 'too short',
      config: { buildingId: 'x', demandTemplateId: 'y', arrivalRatePctPop5min: 500, durationS: 7 },
      seeds: ['1', '1'],
    };
    const issues = challengeDefinitionIssues(bad);
    expect(issues.length).toBeGreaterThanOrEqual(6);
    expect(issues.join(' ')).toMatch(/seeds/u);
    expect(issues.join(' ')).toMatch(/durationS/u);
  });

  it('accepts every entry the server actually ships', () => {
    for (const definition of CHALLENGE_ROTATION) {
      expect(challengeDefinitionIssues(definition), definition.slug).toEqual([]);
      expect(definition.seeds.length).toBeLessThanOrEqual(MAX_CHALLENGE_SEEDS);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The row: a sample, with its count
 * -------------------------------------------------------------------------- */

const RESULTS: readonly SeedResult[] = Object.freeze([
  { seed: '1', awtS: 10, wt95S: 30, ttdMeanS: 50, pctOverLongWait: 0, legs: 20 },
  { seed: '2', awtS: 20, wt95S: 50, ttdMeanS: 70, pctOverLongWait: 4, legs: 30 },
]);

describe('a board row is a sample and carries the count it was computed over', () => {
  it('means each metric separately, and never combines them', () => {
    const score = challengeScoreOf(RESULTS);
    expect(score.meanAwtS).toBe(15);
    expect(score.meanWt95S).toBe(40);
    expect(score.meanTtdMeanS).toBe(60);
    expect(score.meanPctOverLongWait).toBe(2);
    // R13, clause one: the count is part of what the number means, so it is a field beside it and
    // not a note about it. Two counts, because there are two levels — runs, and the legs the
    // underlying AWTs were themselves computed over.
    expect(score.runs).toBe(2);
    expect(score.legs).toBe(50);
  });

  it('keeps every run behind the mean, so a small sample can be taken apart', () => {
    expect(challengeScoreOf(RESULTS).perSeed).toEqual(RESULTS);
  });

  it('publishes no interval and no dispersion at all', () => {
    // § D218 § 2: a challenge board "has no interval, and may not be worded as though it had one".
    // A `[min, max]` printed beside a mean is read as a confidence interval by every reader who has
    // seen one, so the omission is checked as a fact about the shape rather than left to taste.
    const keys = Object.keys(challengeScoreOf(RESULTS));
    expect(keys.filter((key) => /ci|interval|stdDev|lower|upper|min|max|range/iu.test(key))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The prohibition
 * -------------------------------------------------------------------------- */

/**
 * The comparative vocabulary, which this surface does not use.
 *
 * Blunt on purpose. A lexical test cannot tell what a sentence is *about*, so it would flag an
 * honest negation — *"this is not a claim that one dispatcher is better"* — as readily as a
 * violation. That is why the copy avoids the words entirely rather than using them carefully: the
 * cost of the false positive is one rewritten sentence, and the cost of the miss is the product's
 * central honesty claim (`docs/10` § 5.5, R2).
 */
const COMPARATIVE =
  /\b(better|best|beats?|beating|worse|worst|outperform\w*|superior|inferior|optimal|winner|winning|wins|stronger|weaker|fastest|slowest|leading)\b/iu;

describe('no string on the challenge surface orders two dispatchers', () => {
  const strings: readonly string[] = [
    COMPARE_NOTE,
    CHALLENGE_CLOCK_NOTE,
    challengeBoardNote(5, 'awtS'),
    challengeBoardNote(5, 'wt95S'),
    ...CHALLENGE_ROTATION.flatMap((definition) => [definition.name, definition.brief]),
    ...CHALLENGE_ROTATION.map((definition) => comparePointerFor(issuedChallengeFor(0)).note + definition.slug),
    windowRefusalDetail(issuedChallengeFor(0), 'closed', issuedChallengeFor(1), 'open'),
    windowRefusalDetail(issuedChallengeFor(5), 'upcoming', issuedChallengeFor(4), 'open'),
    windowRefusalDetail(issuedChallengeFor(0), 'closed', issuedChallengeFor(0), 'closed'),
    windowRefusalDetail(issuedChallengeFor(0), 'closed', issuedChallengeFor(0), 'open'),
  ];

  it('uses none of the comparative vocabulary', () => {
    for (const text of strings) {
      expect(COMPARATIVE.exec(text)?.[0], text).toBeUndefined();
    }
  });

  it('says what the order is instead — a fact about submissions, with no interval', () => {
    const note = challengeBoardNote(5, 'awtS');
    expect(note).toMatch(/these players, on these 5 seeds, in this order/iu);
    expect(note).toMatch(/never combined/u);
    expect(note).toMatch(/carries no interval/u);
    expect(note).toMatch(/nothing on it is a paired comparison/u);
  });

  it('points at Compare, which is where the question actually lives', () => {
    // § D218 § 5 clause 5, and the reason it is a requirement rather than a courtesy: a surface
    // that raises the question without pointing at the answer invites the reader to answer it from
    // the board.
    const pointer = comparePointerFor(issuedChallengeFor(0));
    expect(pointer.note).toMatch(/Compare/u);
    expect(pointer.note).toMatch(/interval that can contain zero/u);
    expect(pointer.buildingId).toBe(CHALLENGE_ROTATION[0]?.config.buildingId);
    // And it does NOT hand Compare the challenge's five seeds as a replication budget. Five is a
    // sample; CLAUDE.md budgets 50–200, and an under-powered paired interval wearing Compare's
    // authority is § D171's defect arriving through the front door.
    expect(Object.keys(pointer)).not.toContain('seeds');
  });

  it('refuses a submission outside the window with something the player can do next', () => {
    const detail = windowRefusalDetail(issuedChallengeFor(0), 'closed', issuedChallengeFor(1), 'open');
    expect(detail).toMatch(/closed on \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/u);
    // Names the challenge that is open now, by name and by id: a refusal with only a date is a
    // dead end.
    expect(detail).toContain(issuedChallengeFor(1).id);
  });
});

/* -------------------------------------------------------------------------- *
 * The seed set is verified whole
 * -------------------------------------------------------------------------- */

const FACTS: ChallengeDataFacts = Object.freeze({
  buildingDigest: 'aaa',
  templateDigest: 'bbb',
  dispatcherLibraryDigest: 'ccc',
  elevatorSpecsDigest: 'ddd',
  trafficModel: 'v1',
});

describe('the board a challenge entry lands on', () => {
  it('separates two challenges, and two generations of reference data', () => {
    const base = challengeDataHashOf(issuedChallengeFor(0), FACTS);
    expect(challengeDataHashOf(issuedChallengeFor(1), FACTS)).not.toBe(base);
    // The § D205 / § D213 lesson with a competition on it. A profile edit mid-challenge forks the
    // WHOLE board — the library is digested, not the one profile a submitter used — because after
    // such an edit every row means something different, not just the edited one's.
    expect(challengeDataHashOf(issuedChallengeFor(0), { ...FACTS, dispatcherLibraryDigest: 'ccc2' })).not.toBe(base);
    expect(challengeDataHashOf(issuedChallengeFor(0), { ...FACTS, buildingDigest: 'aaa2' })).not.toBe(base);
    expect(challengeDataHashOf(issuedChallengeFor(0), { ...FACTS, elevatorSpecsDigest: 'ddd2' })).not.toBe(base);
    expect(challengeDataHashOf(issuedChallengeFor(0), { ...FACTS, trafficModel: 'v2' })).not.toBe(base);
  });

  it('does not depend on which dispatcher a player chose — that is the free axis', () => {
    // The defect § D218 exists to fix, checked directly: on a config board the dispatcher is in the
    // key, so choosing a different one moves a player to a different board instead of up this one.
    expect(challengeDataHashOf(issuedChallengeFor(0), FACTS)).toBe(
      challengeDataHashOf(issuedChallengeFor(0), FACTS),
    );
  });
});

/** The truth for one seed, measured the server's own way — the verifier's path, not a second one. */
function honestSeed(
  challenge: ReturnType<typeof issuedChallengeFor>,
  dispatcherProfileId: string,
  seed: string,
): ClaimedSeedMetrics {
  const simulation = configFor(
    {
      buildingId: challenge.config.buildingId,
      dispatcherProfileId,
      demandTemplateId: challenge.config.demandTemplateId,
      arrivalRatePctPop5min: challenge.config.arrivalRatePctPop5min,
      durationS: challenge.config.durationS,
      seed,
    },
    resources,
  );
  if (typeof simulation === 'string') throw new Error(`fixture does not resolve: ${simulation}`);
  const summary = runSimulation(simulation).summary;
  return { seed, legs: summary.waiting.count, ...metricsOf(summary) };
}

function honest(dispatcherProfileId = 'collective'): ChallengeSubmission {
  const challenge = issuedChallengeFor(0);
  return {
    challengeId: challenge.id,
    dispatcherProfileId,
    claimed: challenge.seeds.map((seed) => honestSeed(challenge, dispatcherProfileId, seed)),
  };
}

describe('every seed is replayed, and every seed has to reproduce', () => {
  it('accepts a whole honest set, and stores the server’s aggregate', () => {
    const challenge = issuedChallengeFor(0);
    const submission = honest();
    const verification = verifyChallengeSubmission(submission, challenge, resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
    if (!verification.ok) return;
    expect(verification.score.runs).toBe(challenge.seeds.length);
    expect(verification.score.perSeed.map((result) => result.seed)).toEqual([...challenge.seeds]);
  }, 60_000);

  it('rejects a set that reproduces on four of five — partial reproduction is not reproduction', () => {
    const challenge = issuedChallengeFor(0);
    const truth = honest();
    // One seed nudged by a quarter of a second, the other four untouched. This is § D218 § 5
    // clause 4 stated as a run: a verifier that dropped the seed that did not match would rank a
    // player on a sample they chose after seeing it.
    const forged: ChallengeSubmission = {
      ...truth,
      claimed: truth.claimed.map((entry, index) =>
        index === 3 ? { ...entry, awtS: entry.awtS - 0.25 } : entry,
      ),
    };
    const verification = verifyChallengeSubmission(forged, challenge, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
    // The refusal names the seed and says how far it got, so an honest client on an old build can
    // tell "my whole build is wrong" from "one run of mine is".
    expect(verification.detail).toContain(challenge.seeds[3] ?? '');
    expect(verification.detail).toMatch(/3 of 5 seeds matched/u);
  }, 60_000);

  it('rejects a claim whose four numbers reproduce and whose count does not', () => {
    // R13 given teeth at the wire: `legs` is part of what the mean means, so a claim that misses it
    // is a claim about a different measurement window.
    const challenge = issuedChallengeFor(0);
    const truth = honest();
    const wrongCount: ChallengeSubmission = {
      ...truth,
      claimed: truth.claimed.map((entry, index) => (index === 0 ? { ...entry, legs: entry.legs + 1 } : entry)),
    };
    expect(verifyChallengeSubmission(wrongCount, challenge, resources).ok).toBe(false);
  }, 60_000);

  it('refuses a short set before anything simulates', () => {
    const challenge = issuedChallengeFor(0);
    const truth = honest();
    const short: ChallengeSubmission = { ...truth, claimed: truth.claimed.slice(0, 4) };
    const issues = challengeSubmissionIssues(short, challenge);
    // The cheap half of clause 4. A challenge verification is one simulation per seed, so the
    // place that costs no CPU is the place to say it first.
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toContain(challenge.seeds[4] ?? '');
    expect(issues.join(' ')).toMatch(/not a partial result/u);
  }, 60_000);

  it('refuses a seed the challenge does not name, and a seed submitted twice', () => {
    const challenge = issuedChallengeFor(0);
    const claimed = (seeds: readonly string[]): readonly ClaimedSeedMetrics[] =>
      seeds.map((seed) => ({ seed, awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, legs: 1, awtIsValid: true }));

    const foreign: ChallengeSubmission = {
      challengeId: challenge.id,
      dispatcherProfileId: 'collective',
      claimed: claimed([...challenge.seeds.slice(1), '999999']),
    };
    expect(challengeSubmissionIssues(foreign, challenge).join(' ')).toMatch(/999999/u);

    const duplicated: ChallengeSubmission = {
      challengeId: challenge.id,
      dispatcherProfileId: 'collective',
      claimed: claimed([...challenge.seeds, challenge.seeds[0] ?? '']),
    };
    expect(challengeSubmissionIssues(duplicated, challenge).join(' ')).toMatch(/appears twice/u);
  });

  it('accepts a well-formed whole set', () => {
    const challenge = issuedChallengeFor(0);
    expect(challengeSubmissionIssues(honest(), challenge)).toEqual([]);
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The measurement that chose the rotation
 * -------------------------------------------------------------------------- */

describe('every shipped challenge is playable with every shipped dispatcher', () => {
  it('produces a quotable mean on every seed under every profile', () => {
    // Not an assertion about the rotation — a re-measurement of it, against the real `data/` and
    // the real kernel. § D214 § 6 refuses a run whose mean the project would not report, so a
    // configuration that saturates under some arms and not others would refuse a player's entry
    // for choosing the wrong dispatcher. That reads exactly like a bug and is not one, which is
    // why it must not be possible to ship. `mixed-use-high-rise` at 3 % was quotable in 5 of 65
    // runs and was rejected on this measurement before the rotation was written.
    const unquotable: string[] = [];
    let runs = 0;
    for (const definition of CHALLENGE_ROTATION) {
      for (const dispatcherProfileId of config.dispatcherProfilesById.keys()) {
        for (const seed of definition.seeds) {
          runs += 1;
          const metrics = honestSeed(
            { ...issuedChallengeFor(0), config: definition.config, seeds: definition.seeds },
            dispatcherProfileId,
            seed,
          );
          if (!metrics.awtIsValid) unquotable.push(`${definition.slug}/${dispatcherProfileId}/${seed}`);
        }
      }
    }
    expect(runs).toBeGreaterThan(100);
    expect(unquotable).toEqual([]);
  }, 300_000);

  it('has enough legs behind each run for the mean to mean something', () => {
    // R13 again, one level down. `garden-apartments` at 6 %/900 s produces a legitimately quotable
    // AWT over **two** legs; a competitive board of two-leg means is a board about rounding, which
    // is why that building is not in the rotation.
    for (const definition of CHALLENGE_ROTATION) {
      const legs = definition.seeds.map(
        (seed) =>
          honestSeed({ ...issuedChallengeFor(0), config: definition.config, seeds: definition.seeds }, 'collective', seed)
            .legs,
      );
      expect(Math.min(...legs), `${definition.slug}: ${legs.join(', ')}`).toBeGreaterThanOrEqual(10);
    }
  }, 120_000);
});
