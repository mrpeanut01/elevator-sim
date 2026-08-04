/**
 * The claim the leaderboard rests on: **a forged score does not survive replay, and an honest one
 * does.**
 *
 * Run against the real `data/` and the real kernel, not a fixture. A verifier tested against a stub
 * simulation would prove that the stub agrees with itself — the whole point is that the *shipped*
 * engine is deterministic enough to catch a lie, and that is only testable by catching one.
 */

import { describe, expect, it, beforeAll } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';

import { configHashOf, digestOf, submissionIssues, type Submission } from './submission.js';
import {
  METRIC_EPSILON,
  configFor,
  metricsOf,
  verifySubmission,
  type VerificationResources,
} from './verify.js';

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

/** A run small enough to replay quickly and busy enough to have a wait worth claiming. */
const RUN = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  seed: '20260804',
});

/**
 * The truth, measured the way the server measures it.
 *
 * Replayed through `configFor` + `runSimulation` — the verifier's own path — rather than through a
 * second hand-built config. Two places that both decide what a submission means is exactly the
 * drift the design cannot survive: the client and the server have to agree, and a test that built
 * its own config would be testing agreement with the test.
 */
function honest(): Submission {
  const config = configFor(RUN, resources);
  if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
  return { run: RUN, claimed: metricsOf(runSimulation(config).summary) };
}

describe('a submission is accepted only if it replays', () => {
  it('accepts the truth, and stores the server’s figures rather than the claim', () => {
    const submission = honest();
    const verification = verifySubmission(submission, resources);
    expect(verification.ok, JSON.stringify(verification)).toBe(true);
    if (!verification.ok) return;
    // What gets persisted is what the server measured. The claim is a challenge, not a record.
    expect(verification.measured.awtS).toBeCloseTo(submission.claimed.awtS, 9);
    expect(verification.measured.awtIsValid).toBe(true);
  });

  it('rejects a better wait than the run produced — the whole point', () => {
    const submission = honest();
    const forged: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS - 5 },
    };
    const verification = verifySubmission(forged, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
    // The wording matters: a rejection is not an accusation, because an honest player on an older
    // build lands here too.
    expect(verification.detail).toMatch(/different build|reference data/u);
  });

  it('rejects a forgery far below the epsilon that would let a real one through', () => {
    // The epsilon exists for a JSON round trip, not as a budget for a cheat. A difference ten times
    // it is still nine orders of magnitude below anything that could move a ranking, and is still
    // caught.
    const submission = honest();
    const nudged: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS - METRIC_EPSILON * 10 },
    };
    expect(verifySubmission(nudged, resources).ok).toBe(false);
  });

  it('accepts a claim that differs by less than the epsilon, which a round trip can produce', () => {
    const submission = honest();
    const jittered: Submission = {
      run: submission.run,
      claimed: { ...submission.claimed, awtS: submission.claimed.awtS + METRIC_EPSILON / 4 },
    };
    expect(verifySubmission(jittered, resources).ok).toBe(true);
  });

  it('refuses a run whose mean the project would not report, whatever was claimed', () => {
    // `garden-apartments` at 40 % of population per five minutes is far past anything two hydraulic
    // cars can clear. Claiming `awtIsValid: true` cannot buy a ranking, because the flag is checked
    // against the SERVER's run.
    const saturating: Submission = {
      run: { ...RUN, arrivalRatePctPop5min: 40 },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    };
    const verification = verifySubmission(saturating, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    // Refused for the right reason: told their queue diverged, not told their arithmetic is wrong.
    expect(verification.code).toBe('awt-not-quotable');
  });

  it('cannot be run against a building the server does not ship', () => {
    const invented: Submission = {
      run: { ...RUN, buildingId: 'two-floors-sixteen-cars' },
      claimed: { awtS: 0.1, wt95S: 0.1, ttdMeanS: 0.1, pctOverLongWait: 0, awtIsValid: true },
    };
    const verification = verifySubmission(invented, resources);
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    // A submission carries IDS, never a building. This is what stops a player authoring the tower
    // their score would look best on.
    expect(verification.code).toBe('unknown-building');
  });
});

describe('the cheap gate runs before the expensive one', () => {
  it('rejects a malformed submission on shape, without simulating', () => {
    const bad: Submission = {
      run: { ...RUN, seed: 'not-a-seed', durationS: 7 },
      claimed: { awtS: -1, wt95S: 0, ttdMeanS: 0, pctOverLongWait: 0, awtIsValid: true },
    };
    const issues = submissionIssues(bad);
    // All of them, not the first: an unauthenticated shape error must not be able to command server
    // CPU, and a caller fixing one at a time learns nothing about how many there are.
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.join(' ')).toMatch(/seed/u);
    expect(issues.join(' ')).toMatch(/durationS/u);
  });

  it('passes a well-formed one', () => {
    expect(
      submissionIssues({
        run: RUN,
        claimed: { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true },
      }),
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The board's identity
 * -------------------------------------------------------------------------- */

describe('a board is keyed by what it measures', () => {
  const facts = {
    buildingDigest: 'aaa',
    dispatcherDigest: 'bbb',
    templateDigest: 'ccc',
    trafficModel: 'v1',
  };

  it('puts two runs of the same configuration on the same board, whatever the seed', () => {
    // A board is a leaderboard ACROSS seeds. Hashing the seed would give every player a private
    // board of one.
    expect(configHashOf({ ...RUN, seed: '1' }, facts)).toBe(configHashOf({ ...RUN, seed: '999' }, facts));
  });

  it('starts a new board when the data it measured changes', () => {
    // The § D205 / § D213 lesson with money on it: a building edited under a live board would leave
    // every stored score describing a run that no longer exists — and failing to re-verify, so
    // honest old entries would start looking like forgeries.
    const moved = configHashOf(RUN, { ...facts, buildingDigest: 'aaa2' });
    expect(moved).not.toBe(configHashOf(RUN, facts));
  });

  it('separates runs that differ in any input that could move the result', () => {
    const base = configHashOf(RUN, facts);
    expect(configHashOf({ ...RUN, durationS: 1800 }, facts)).not.toBe(base);
    expect(configHashOf({ ...RUN, arrivalRatePctPop5min: 8 }, facts)).not.toBe(base);
    expect(configHashOf({ ...RUN, dispatcherProfileId: 'eta' }, facts)).not.toBe(base);
    // `null` — the building's own profile — is a distinct selection, not the absence of one.
    expect(configHashOf({ ...RUN, arrivalRatePctPop5min: null }, facts)).not.toBe(base);
    // ...and the engine's own model version, because a v1 score and a v2 score are not comparable
    // however identical the rest is.
    expect(configHashOf(RUN, { ...facts, trafficModel: 'v2' })).not.toBe(base);
  });

  it('does not fork a board over key order in a record', () => {
    // Digests are over canonical JSON with sorted keys, so a field reordered in `data/` does not
    // silently split a board in two.
    expect(digestOf({ a: 1, b: [2, 3] })).toBe(digestOf({ b: [2, 3], a: 1 }));
    // ...but an array's order IS data, and must still separate.
    expect(digestOf({ b: [3, 2] })).not.toBe(digestOf({ b: [2, 3] }));
  });
});
