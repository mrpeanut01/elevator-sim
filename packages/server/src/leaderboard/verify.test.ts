/**
 * The claim the leaderboard rests on: **a forged score does not survive replay, and an honest one
 * does.**
 *
 * Run against the real `data/` and the real kernel, not a fixture. A verifier tested against a stub
 * simulation would prove that the stub agrees with itself — the whole point is that the *shipped*
 * engine is deterministic enough to catch a lie, and that is only testable by catching one.
 */

import { describe, expect, it, beforeAll } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';

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
  windowStartS: null,
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

  it('refuses a window that could not be a time of day, or that runs off the end of one', () => {
    const claimed = { awtS: 12, wt95S: 30, ttdMeanS: 40, pctOverLongWait: 2, awtIsValid: true };
    const issuesFor = (windowStartS: number | null): string =>
      submissionIssues({ run: { ...RUN, windowStartS }, claimed }).join(' ');

    expect(issuesFor(-1)).toMatch(/windowStartS/u);
    expect(issuesFor(86_400)).toMatch(/windowStartS/u);
    expect(issuesFor(Number.NaN)).toMatch(/windowStartS/u);
    // `RUN` is 900 s, so a start 300 s before midnight runs past the end of the day.
    expect(issuesFor(86_400 - 300)).toMatch(/past the end of a day/u);

    // And the ones that must pass: a real window, the first instant of the day, and no window.
    expect(issuesFor(255 * 60)).toBe('');
    expect(issuesFor(0)).toBe('');
    expect(issuesFor(null)).toBe('');
  });
});

/* -------------------------------------------------------------------------- *
 * A run that is one part of a day — § D285, and the refusal it replaced
 * -------------------------------------------------------------------------- */

describe('a windowed run can be posted, and is replayed over the part it names', () => {
  /**
   * A lunch peak cut out of the shipped ten-hour day.
   *
   * `office-day` rather than an hour record, because the window only means something on a template
   * long enough to have parts — and because `office-day` is the case that used to fail *loudly*:
   * replayed without a window it reaches `core` as `templateOverrides.durationS` on an authored
   * phase list and is refused by name (§ D275).
   */
  const LATER_START_S = 150 * 60;
  const EARLIER_START_S = 30 * 60;

  const WINDOWED = Object.freeze({
    ...RUN,
    demandTemplateId: 'office-day',
    arrivalRatePctPop5min: null,
    durationS: 1800,
    windowStartS: LATER_START_S,
  });

  /**
   * Both parts are quotable, which is why these two and not a busier pair.
   *
   * A lunch peak on `midtown-office` was the obvious fixture and it is **not usable here**: it
   * saturates, so `verifySubmission` refuses it `awt-not-quotable` before the window has any
   * bearing on the outcome, and a test that accepted that refusal would be asserting nothing about
   * windows. These two measured `awtIsValid` at the shipped rate — AWT 9.20 s and 11.92 s — so the
   * accept below is a real accept and the refusal after it is caused by the window rather than by
   * a mean the board would decline either way.
   */
  const config = (windowStartS: number): SimulationConfig => {
    const built = configFor({ ...WINDOWED, windowStartS }, resources);
    if (typeof built === 'string') throw new Error(`fixture does not resolve: ${built}`);
    return built;
  };

  it('replays the window the player ran, not the whole day', () => {
    // The half that makes the field mean anything. A submission that carried the window and a
    // replay that ignored it would be *worse* than not carrying it: boards would separate by
    // window and then verify every entry against the whole period, so an honest lunch peak would
    // come back as `metrics-do-not-reproduce` — this product's one accusation, spent on a field
    // the server declined to read.
    const built = config(LATER_START_S) as unknown as Record<string, unknown>;
    expect(built['windowStartS']).toBe(LATER_START_S);
    // Derived, never submitted: the far end is `windowStartS + durationS`, so a second number on
    // the wire could disagree with the first.
    expect(built['windowEndS']).toBe(LATER_START_S + 1800);
    // And `durationS` is *not* also passed. Both would throw on this template (§ D275) — measured,
    // not reasoned: the first version of `configFor` passed both and `office-day` refused it.
    expect('durationS' in built).toBe(false);
  });

  it('accepts an honest windowed submission end to end', () => {
    // The whole point, driven through the verifier rather than asserted about the config: this is
    // the run § D288 refused outright in the client, and it now posts.
    const claimed = metricsOf(runSimulation(config(LATER_START_S)).summary);
    expect(claimed.awtIsValid, 'fixture must be quotable or the accept proves nothing').toBe(true);
    const verification = verifySubmission({ run: WINDOWED, claimed }, resources);
    expect(verification.ok, JSON.stringify(verification.ok ? {} : verification)).toBe(true);
  });

  it('refuses the same claim replayed against a different part of the day', () => {
    // Non-vacuity for the two above, and the sharpest form of it. If the window were ignored, a
    // claim from one part would verify against a replay of another and this would pass — the two
    // runs would *be* the same run. It fails because they are not.
    const laterClaim = metricsOf(runSimulation(config(LATER_START_S)).summary);
    const earlierClaim = metricsOf(runSimulation(config(EARLIER_START_S)).summary);
    // The premise, asserted rather than assumed: the two parts really do measure differently.
    expect(laterClaim.awtS).not.toBeCloseTo(earlierClaim.awtS, 3);

    const verification = verifySubmission(
      { run: { ...WINDOWED, windowStartS: EARLIER_START_S }, claimed: laterClaim },
      resources,
    );
    expect(verification.ok).toBe(false);
    if (verification.ok) return;
    expect(verification.code).toBe('metrics-do-not-reproduce');
  });

  it('leaves a run with no window reaching the kernel with no window key at all', () => {
    // `'windowStartS' in config` rather than `=== undefined`, because a key present and undefined
    // is a different object from a key absent, and `core`'s own identity guards read the first —
    // `windowIdentity.test.ts` asserts exactly that about the template it produces.
    const config = configFor(RUN, resources);
    if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
    expect('windowStartS' in (config as object)).toBe(false);
    expect('windowEndS' in (config as object)).toBe(false);
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

  it('ranks two parts of one day apart, because they are different runs', () => {
    // § D285. A morning window and a lunch window over the same seed measure different traffic;
    // ranking them together would be comparing a rush hour with a lull and calling one dispatcher
    // better. The whole-period run is a third thing again.
    const base = configHashOf(RUN, facts);
    const morning = configHashOf({ ...RUN, windowStartS: 30 * 60 }, facts);
    const lunch = configHashOf({ ...RUN, windowStartS: 255 * 60 }, facts);
    expect(new Set([base, morning, lunch]).size).toBe(3);
  });

  it('treats a window starting at zero as a selection, not as its absence', () => {
    // `0` is *the run starts at the top of the day*, `null` is *there is no window*. They are two
    // different statements and `?? undefined` is what keeps them apart — `|| undefined` would fold
    // the first into the second and silently rank a windowed run on the whole-period board.
    expect(configHashOf({ ...RUN, windowStartS: 0 }, facts)).not.toBe(configHashOf(RUN, facts));
  });

  it('leaves every board that already exists exactly where it was', () => {
    /*
     * The regression this field could most easily have caused, and the reason `configHashOf` writes
     * the window as `undefined` rather than `null` when there is none.
     *
     * Every score posted before the window existed was a whole-period run. Adding a key to the
     * canonical string would have moved all of them to a new board — honest entries relocated for a
     * selection their players never made, on a leaderboard whose entire premise is that a board
     * survives everything except a change to what it measured.
     *
     * Asserted against the literal digest rather than against a recomputation, because a
     * recomputation would change with the code and prove nothing. This hex is what a
     * whole-period `RUN` on these facts hashed to before `windowStartS` existed.
     */
    expect(configHashOf(RUN, facts)).toBe('d77c9681da72ea7aea293a204a1b55ff');
  });

  it('does not fork a board over key order in a record', () => {
    // Digests are over canonical JSON with sorted keys, so a field reordered in `data/` does not
    // silently split a board in two.
    expect(digestOf({ a: 1, b: [2, 3] })).toBe(digestOf({ b: [2, 3], a: 1 }));
    // ...but an array's order IS data, and must still separate.
    expect(digestOf({ b: [3, 2] })).not.toBe(digestOf({ b: [2, 3] }));
  });
});
