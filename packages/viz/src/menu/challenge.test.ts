/**
 * The viewer's half of a challenge: the configuration it will run, and the claim it will post.
 *
 * Three blocks carry the criterion in `DECISIONS.md` § D218 § 5, and the rest of the file is
 * ordinary coverage.
 *
 * **The parity block is the one that matters.** The server rebuilds a submission's configuration
 * from ids and accepts the claim only if replaying it reproduces the figures to `1e-9`. So a
 * viewer whose configuration differs from `leaderboard/verify.ts#configFor` in **any** term
 * produces a submission the server calls a forgery, and the player is told their run did not
 * replay — true, useless, and the one failure that costs an honest player their score. The block
 * pins the two constructions field for field, and derives the server's own **key set out of its
 * source text** so a term added there is red here rather than red in production.
 *
 * Reading the source rather than importing it is `client.test.ts`'s method and its reason: `viz`
 * is a browser bundle and may not depend on `server`, so the honest way to check a mirror is to
 * read the file the rule lives in. The alternative is a comment claiming the two agree, which is
 * exactly what a comment cannot promise.
 *
 * **The clock block is § D218 § 3 asserted structurally.** The criterion says *"the client never
 * decides which challenge is current, and a test proves it by advancing the client's clock and
 * requiring the answer not to move"*. A test that only advanced a clock would pass on a client
 * that read one and happened to agree, so this asserts the stronger thing: the client has no clock
 * to advance — no `Date`, no `performance.now`, no timer, anywhere in either file — and then drives
 * it with a server that calls a window from 1990 `open` and requires the answer to come back
 * `open`.
 *
 * **The refusal block** walks one branch per way a client can be wrong before the network. Each
 * one, unrefused, would spend the server's single accusation on a client bug.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { RESOURCES } from '../scope/probes.test-helper.js';

import {
  challengeNotOpenOf,
  challengeRunConfigs,
  challengeSubmissionOf,
  claimedSeedMetricsOf,
  MAX_CHALLENGE_SEEDS,
  type ChallengeRunRecording,
  type ChallengeView,
} from './challenge.js';
import { createClient, type Transport, type TransportRequest, type TransportResponse } from './client.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

const SEEDS = ['1001', '1002', '1003', '1004', '1005'] as const;

/**
 * `midtown-morning`, as the server issues it.
 *
 * The rotation's own first entry, transcribed rather than imported — same reason as everything
 * else here — and on the one building `probes.test-helper.ts` loads that a shipped challenge uses.
 */
function viewOf(overrides: Partial<ChallengeView['challenge']> = {}): ChallengeView {
  return {
    challenge: {
      id: 'midtown-morning-0',
      name: 'Midtown, morning rush',
      brief: 'Fifteen minutes of Midtown Office under a rise-and-fall morning peak.',
      config: {
        buildingId: 'midtown-office',
        demandTemplateId: 'rise-and-fall',
        arrivalRatePctPop5min: 3,
        durationS: 900,
      },
      seeds: [...SEEDS],
      opensAtMs: 1_754_179_200_000,
      closesAtMs: 1_754_784_000_000,
      ...overrides,
    },
    state: 'open',
    seedCount: 5,
    opensInMs: null,
    closesInMs: 86_400_000,
    clockNote: 'Which challenge is open is decided by the server.',
    dataHash: 'abcdef0123456789abcdef0123456789',
    compare: {
      note: 'Compare answers the question a board cannot.',
      buildingId: 'midtown-office',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: 3,
      durationS: 900,
    },
  };
}

/** A recording of one seed, with figures nobody would round to by accident. */
function recordingOf(seed: string, overrides: Partial<ChallengeRunRecording> = {}): ChallengeRunRecording {
  return {
    seed,
    buildingId: 'midtown-office',
    dispatcherProfileId: 'collective',
    summary: {
      meanWaitS: 27.499_999_999_1,
      wait95S: 61.250_000_000_7,
      meanTimeToDestinationS: 74.000_000_000_3,
      pctOverLongWait: 12.5,
      awtIsValid: true,
      waitCount: 43,
    },
    ...overrides,
  };
}

function allFive(): ChallengeRunRecording[] {
  return SEEDS.map((seed) => recordingOf(seed));
}

const serverSource = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../server/src/${relative}`, import.meta.url)), 'utf8');

const ownSource = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/* -------------------------------------------------------------------------- *
 * The configuration is the server's configuration
 * -------------------------------------------------------------------------- */

describe('the run configuration is the one the server will replay', () => {
  it('matches `configFor` term for term, values included', () => {
    const built = challengeRunConfigs(viewOf(), RESOURCES, 'collective');
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    /*
     * `leaderboard/verify.ts#configFor`, transcribed by hand for `arrivalRatePctPop5min: 3`.
     *
     * The two conditional spreads the server writes for `elevatorSpecs` and `dispatcherProfiles`
     * are unconditional here because `BrowserResources` types both required where
     * `VerificationResources` types them optional — and a shipped server always supplies both from
     * `loadConfig`, so the two objects carry the same keys. The key-set assertion below is what
     * holds that claim up.
     */
    expect(built.runs).toHaveLength(SEEDS.length);
    expect(built.runs[0]?.config).toEqual({
      building: RESOURCES.buildings.find((entry) => entry.id === 'midtown-office'),
      dispatcherProfile: RESOURCES.dispatcherProfiles.profiles.find((entry) => entry.id === 'collective'),
      trafficProfiles: RESOURCES.trafficProfiles,
      elevatorSpecs: RESOURCES.elevatorSpecs,
      dispatcherProfiles: RESOURCES.dispatcherProfiles,
      seed: 1001n,
      demandTemplate: 'rise-and-fall',
      durationS: 900,
      onTimeout: 'report',
      demand: { arrivalRatePctPop5min: 3 },
    });
  });

  it('carries the same keys the server assigns — derived from the server’s source, not listed here', () => {
    /*
     * The mechanism, rather than the transcription. A term added to `configFor` — a
     * `reportWindow`, a `trafficModel`, a second seed — would change every replayed figure and
     * would be invisible to a hand-written expectation that nobody thought to update.
     */
    const body = serverSource('leaderboard/verify.ts')
      .split('export function configFor(')[1]
      ?.split('} as SimulationConfig;')[0];
    expect(body, 'configFor is no longer where this test looks for it').toBeDefined();
    const text = (body ?? '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    const keys = new Set<string>();
    // Terms written straight into the returned object, shorthand or keyed.
    for (const match of text.matchAll(/^ {4}([A-Za-z]\w*)[,:]/gmu)) keys.add(match[1] ?? '');
    // Terms the server spreads conditionally: `...(x === undefined ? {} : { key: … })`.
    for (const match of text.matchAll(/\?\s*\{\}\s*:\s*\{\s*(\w+):/gu)) keys.add(match[1] ?? '');

    // A regex that stopped matching would otherwise produce an empty set and a silent pass.
    expect(keys.size).toBeGreaterThanOrEqual(8);

    const built = challengeRunConfigs(viewOf(), RESOURCES, 'collective');
    if (!built.ok) throw new Error(built.detail);
    expect(Object.keys(built.runs[0]?.config ?? {}).sort()).toEqual([...keys].sort());
  });

  it('treats a null rate as the building’s own profile, by omitting the key rather than zeroing it', () => {
    const view = viewOf();
    const built = challengeRunConfigs(
      { ...view, challenge: { ...view.challenge, config: { ...view.challenge.config, arrivalRatePctPop5min: null } } },
      RESOURCES,
      'collective',
    );
    if (!built.ok) throw new Error(built.detail);
    // Present-and-zero and absent are different runs. The server omits it; so does this.
    expect(Object.keys(built.runs[0]?.config ?? {})).not.toContain('demand');
    expect(serverSource('leaderboard/verify.ts')).toContain('run.arrivalRatePctPop5min === null');
  });

  it('turns each seed into a bigint, and keeps the challenge’s own spelling beside it', () => {
    const view = viewOf({ seeds: ['007', '1002', '1003'] });
    const built = challengeRunConfigs(view, RESOURCES, 'collective');
    if (!built.ok) throw new Error(built.detail);
    expect(built.runs.map((run) => run.config.seed)).toEqual([7n, 1002n, 1003n]);
    // `String(7n)` is not `'007'`, and the claim is filed under the challenge's spelling. A client
    // that re-derived the seed from the config would post a set of seeds the challenge never named.
    expect(built.runs.map((run) => run.seed)).toEqual(['007', '1002', '1003']);
    expect(serverSource('leaderboard/verify.ts')).toContain('BigInt(run.seed)');
  });

  it('runs the seeds in the challenge’s order, which is the order the server aggregates in', () => {
    const built = challengeRunConfigs(viewOf(), RESOURCES, 'collective');
    if (!built.ok) throw new Error(built.detail);
    expect(built.runs.map((run) => run.seed)).toEqual([...SEEDS]);
  });

  it('mirrors the server’s seed ceiling exactly, rather than approximately', () => {
    expect(serverSource('challenge/schedule.ts')).toContain(
      `MAX_CHALLENGE_SEEDS = ${String(MAX_CHALLENGE_SEEDS)}`,
    );
    const view = viewOf({ seeds: Array.from({ length: MAX_CHALLENGE_SEEDS + 1 }, (_, i) => String(2000 + i)) });
    const built = challengeRunConfigs(view, RESOURCES, 'collective');
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('too-many-seeds');
  });
});

/* -------------------------------------------------------------------------- *
 * § D218 § 3 — the client never decides which challenge is current
 * -------------------------------------------------------------------------- */

describe('the clock is the server’s', () => {
  it('has no clock to advance — asserted over the source, not over one call', () => {
    /*
     * The structural half. A behavioural test alone would pass on a client that read a clock and
     * happened to agree with the server on the day the test ran; this fails the moment one is
     * introduced, which is the guarantee § D218 § 3 actually wants.
     */
    for (const file of ['./challenge.ts', './client.ts']) {
      const source = ownSource(file);
      for (const forbidden of [
        /\bDate\.now\b/u,
        /\bnew Date\b/u,
        /\bDate\.UTC\b/u,
        /\bperformance\.now\b/u,
        /\bsetTimeout\b/u,
        /\bsetInterval\b/u,
      ]) {
        expect(source, `${file} must not read a clock: ${String(forbidden)}`).not.toMatch(forbidden);
      }
    }
  });

  it('reports the state the server reported, for a window the local clock is nowhere near', async () => {
    const seen: TransportRequest[] = [];
    const transport: Transport = async (request) => {
      seen.push(request);
      /*
       * A window in 1990 that the server calls `open`. Whatever a browser's clock says, this is
       * the answer — the server is the one that decides, and a client that "corrected" this to
       * `closed` would be the second answer § D218 § 3 forbids.
       */
      const response: TransportResponse = {
        status: 200,
        body: {
          currentId: 'ancient-0',
          current: {
            challenge: {
              id: 'ancient-0',
              name: 'A challenge from 1990',
              brief: 'Long ago, and open.',
              config: {
                buildingId: 'midtown-office',
                demandTemplateId: 'rise-and-fall',
                arrivalRatePctPop5min: 3,
                durationS: 900,
              },
              seeds: [...SEEDS],
              opensAtMs: 631_152_000_000,
              closesAtMs: 631_756_800_000,
            },
            state: 'open',
            seedCount: 5,
            opensInMs: null,
            closesInMs: 604_800_000,
            clockNote: 'Which challenge is open is decided by the server.',
            dataHash: 'abcdef0123456789abcdef0123456789',
            compare: { note: 'Compare answers the question a board cannot.' },
          },
          clockNote: 'Which challenge is open is decided by the server.',
          recent: [
            {
              id: 'ancient-0',
              name: 'A challenge from 1990',
              opensAtMs: 631_152_000_000,
              closesAtMs: 631_756_800_000,
              state: 'open',
            },
          ],
        },
      };
      return response;
    };

    const result = await createClient('https://x', transport).challenges();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.current.state).toBe('open');
    expect(result.value.recent[0]?.state).toBe('open');
    expect(result.value.currentId).toBe('ancient-0');
    // And it did not ask for one: there is no parameter that could have moved the answer.
    expect(seen[0]?.url).toBe('https://x/api/challenges');
  });
});

/* -------------------------------------------------------------------------- *
 * The claim
 * -------------------------------------------------------------------------- */

describe('the claimed figures', () => {
  it('is a narrowing of a real recording, not a shape of its own', () => {
    // A compile-time assertion: `VizRecording` must remain assignable, so the narrow input above
    // cannot drift from the thing the viewer actually produces.
    const narrows: (recording: VizRecording) => ChallengeRunRecording = (recording) => recording;
    expect(typeof narrows).toBe('function');
  });

  it('reads the summary straight off, with nothing rounded on the way out', () => {
    const row = claimedSeedMetricsOf('1001', recordingOf('1001'));
    expect(row).toEqual({
      seed: '1001',
      awtS: 27.499_999_999_1,
      wt95S: 61.250_000_000_7,
      ttdMeanS: 74.000_000_000_3,
      pctOverLongWait: 12.5,
      awtIsValid: true,
      legs: 43,
    });
  });

  it('claims the real leg count, because the server compares it like a metric', () => {
    const row = claimedSeedMetricsOf('1001', recordingOf('1001', {
      summary: { ...recordingOf('1001').summary, waitCount: 2 },
    }));
    expect(row.legs).toBe(2);
    // Not a caveat on the mean — part of what the mean means, and the server refuses a set whose
    // count does not reproduce.
    expect(serverSource('challenge/verify.ts')).toContain('claim.legs !== summary.waiting.count');
  });

  it('carries `awtIsValid: false` as measured rather than correcting it', () => {
    const summary = { ...recordingOf('1001').summary, awtIsValid: false };
    expect(claimedSeedMetricsOf('1001', recordingOf('1001', { summary })).awtIsValid).toBe(false);
  });

  it('builds the whole set, in the challenge’s order', () => {
    const built = challengeSubmissionOf(viewOf(), 'collective', [...allFive()].reverse());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.submission.challengeId).toBe('midtown-morning-0');
    expect(built.submission.dispatcherProfileId).toBe('collective');
    // Reversed on the way in, in the challenge's order on the way out: the server iterates its own
    // order, and a set that agrees with it is one fewer thing to be wrong about.
    expect(built.submission.claimed.map((row) => row.seed)).toEqual([...SEEDS]);
  });
});

/* -------------------------------------------------------------------------- *
 * One refusal per branch — every one of them before the network
 * -------------------------------------------------------------------------- */

describe('what it refuses before spending the server’s accusation', () => {
  it('refuses a set that is short by one, and names the seed still to run', () => {
    const built = challengeSubmissionOf(viewOf(), 'collective', allFive().slice(0, 4));
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('missing-seed');
    expect(built.detail).toContain('1005');
    // The server's own sentence for the same fact, so the client is not inventing the rule.
    expect(serverSource('challenge/submission.ts')).toContain('is not a partial result, it is not a result');
  });

  it('refuses the same seed twice', () => {
    const built = challengeSubmissionOf(viewOf(), 'collective', [...allFive(), recordingOf('1003')]);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('duplicate-seed');
    expect(built.detail).toContain('1003');
  });

  it('refuses a seed the challenge does not name', () => {
    const built = challengeSubmissionOf(viewOf(), 'collective', [...allFive(), recordingOf('9999')]);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('unknown-seed');
  });

  it('refuses a run of a different building, or by a different dispatcher', () => {
    const wrongBuilding = challengeSubmissionOf(viewOf(), 'collective', [
      recordingOf('1001', { buildingId: 'garden-apartments' }),
      ...allFive().slice(1),
    ]);
    expect(wrongBuilding.ok).toBe(false);
    if (!wrongBuilding.ok) expect(wrongBuilding.code).toBe('wrong-run');

    const wrongDispatcher = challengeSubmissionOf(viewOf(), 'collective', [
      recordingOf('1001', { dispatcherProfileId: 'nearest-car' }),
      ...allFive().slice(1),
    ]);
    expect(wrongDispatcher.ok).toBe(false);
    if (!wrongDispatcher.ok) expect(wrongDispatcher.code).toBe('wrong-run');
  });

  it('refuses a figure that was never measured rather than sending a number for it', () => {
    const summary = { ...recordingOf('1001').summary, pctOverLongWait: null };
    const built = challengeSubmissionOf(viewOf(), 'collective', [
      recordingOf('1001', { summary }),
      ...allFive().slice(1),
    ]);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('figure-not-measured');
    // `?? 0` would have been the tempting fix and is the wrong one: the server measures `NaN`, a
    // claimed `0` does not agree with it, and the player is told their figures did not reproduce.
    expect(claimedSeedMetricsOf('1001', recordingOf('1001', { summary })).pctOverLongWait).toBeNaN();
  });

  it('refuses an unknown dispatcher and an unknown building by name, before any run', () => {
    const unknownDispatcher = challengeRunConfigs(viewOf(), RESOURCES, 'no-such-dispatcher');
    expect(unknownDispatcher.ok).toBe(false);
    if (!unknownDispatcher.ok) {
      expect(unknownDispatcher.code).toBe('unknown-dispatcher');
      expect(unknownDispatcher.detail).toContain('no-such-dispatcher');
    }

    const view = viewOf();
    const unknownBuilding = challengeRunConfigs(
      { ...view, challenge: { ...view.challenge, config: { ...view.challenge.config, buildingId: 'demolished' } } },
      RESOURCES,
      'collective',
    );
    expect(unknownBuilding.ok).toBe(false);
    if (!unknownBuilding.ok) {
      expect(unknownBuilding.code).toBe('unknown-building');
      expect(unknownBuilding.detail).toContain('demolished');
    }
  });

  it('refuses an unknown demand template, which the server also has a code for', () => {
    const view = viewOf();
    const built = challengeRunConfigs(
      { ...view, challenge: { ...view.challenge, config: { ...view.challenge.config, demandTemplateId: 'siesta' } } },
      RESOURCES,
      'collective',
    );
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.code).toBe('unknown-template');
    expect(serverSource('leaderboard/verify.ts')).toContain("'unknown-template'");
  });

  it('says nothing that orders two dispatchers — § D218 § 5 clause 2, over its own sentences', () => {
    /*
     * The lexical rule `challenge/board.ts` keeps, applied to the strings this module authors. The
     * server's copy is swept by its own test; these sentences never pass through it.
     */
    const view = viewOf();
    const refusals = [
      challengeRunConfigs(view, RESOURCES, 'no-such-dispatcher'),
      challengeRunConfigs({ ...view, challenge: { ...view.challenge, seeds: Array.from({ length: 99 }, (_, i) => String(i)) } }, RESOURCES, 'collective'),
      challengeSubmissionOf(view, 'collective', allFive().slice(0, 3)),
      challengeSubmissionOf(view, 'collective', [...allFive(), recordingOf('1003')]),
      challengeSubmissionOf(view, 'collective', [...allFive(), recordingOf('9999')]),
      challengeSubmissionOf(view, 'collective', [recordingOf('1001', { dispatcherProfileId: 'eta' }), ...allFive().slice(1)]),
    ];
    for (const refusal of refusals) {
      expect(refusal.ok).toBe(false);
      if (refusal.ok) continue;
      expect(refusal.detail).not.toMatch(/\b(better|best|beats|worse|outperforms|superior|optimal|winner)\b/iu);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals that do come from the server
 * -------------------------------------------------------------------------- */

describe('posting a challenge entry', () => {
  const scripted = (response: TransportResponse): { transport: Transport; seen: TransportRequest[] } => {
    const seen: TransportRequest[] = [];
    return {
      seen,
      transport: async (request) => {
        seen.push(request);
        return response;
      },
    };
  };

  it('posts the body to the challenge route with the bearer token', async () => {
    const { transport, seen } = scripted({
      status: 201,
      body: { challengeId: 'midtown-morning-0', dataHash: 'abc', entry: { id: 'e1' } },
    });
    const built = challengeSubmissionOf(viewOf(), 'collective', allFive());
    if (!built.ok) throw new Error(built.detail);
    const result = await createClient('https://x', transport).submitChallenge('tok', built.submission);
    expect(result.ok).toBe(true);
    expect(seen[0]?.url).toBe('https://x/api/challenge-scores');
    expect(seen[0]?.token).toBe('tok');
    expect(seen[0]?.body).toBe(built.submission);
  });

  it('carries a 422 in the server’s own words, and does not dress it as an accusation', async () => {
    const detail =
      'Replaying seed 1003 on this server did not reproduce the submitted figures (2 of 5 seeds ' +
      'matched before it). Every seed has to reproduce.';
    const { transport } = scripted({ status: 422, body: { error: 'metrics-do-not-reproduce', detail } });
    const result = await createClient('https://x', transport).submitChallenge('tok', {
      challengeId: 'midtown-morning-0',
      dispatcherProfileId: 'collective',
      claimed: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toBe(detail);
    expect(result.detail).not.toMatch(/cheat|fake|forged/u);
  });

  it('lets a caller reach the whole of a `challenge-not-open` 409, not just its sentence', async () => {
    const detail =
      '“Midtown, morning rush” closed on 2026-08-10 00:00 UTC and no longer takes entries. The ' +
      'challenge open now is “Chancery House at lunch” (chancery-lunch-1).';
    const { transport } = scripted({
      status: 409,
      body: {
        error: 'challenge-not-open',
        state: 'closed',
        challengeId: 'midtown-morning-0',
        opensAtMs: 1_754_179_200_000,
        closesAtMs: 1_754_784_000_000,
        currentChallengeId: 'chancery-lunch-1',
        detail,
      },
    });
    const result = await createClient('https://x', transport).submitChallenge('tok', {
      challengeId: 'midtown-morning-0',
      dispatcherProfileId: 'collective',
      claimed: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const refusal = challengeNotOpenOf(result);
    expect(refusal).toBeDefined();
    // All three the shell needs: what happened, what is open now, and a sentence to show.
    expect(refusal?.state).toBe('closed');
    expect(refusal?.currentChallengeId).toBe('chancery-lunch-1');
    expect(refusal?.detail).toBe(detail);
    expect(refusal?.closesAtMs).toBe(1_754_784_000_000);
  });

  it('reads no `challenge-not-open` out of another refusal, or out of a half-shaped one', async () => {
    const { transport } = scripted({ status: 429, body: { error: 'too-many-submissions', detail: 'wait' } });
    const other = await createClient('https://x', transport).submitChallenge('tok', {
      challengeId: 'c',
      dispatcherProfileId: 'collective',
      claimed: [],
    });
    expect(other.ok).toBe(false);
    if (!other.ok) expect(challengeNotOpenOf(other)).toBeUndefined();

    const partial = scripted({
      status: 409,
      body: { error: 'challenge-not-open', state: 'closed', detail: 'closed' },
    });
    const half = await createClient('https://x', partial.transport).submitChallenge('tok', {
      challengeId: 'c',
      dispatcherProfileId: 'collective',
      claimed: [],
    });
    expect(half.ok).toBe(false);
    // A partially-shaped body would otherwise put `undefined` where a date belongs.
    if (!half.ok) expect(challengeNotOpenOf(half)).toBeUndefined();
  });

  it('returns a board page with the server’s note and Compare pointer intact', async () => {
    const { transport, seen } = scripted({
      status: 200,
      body: {
        challengeId: 'midtown-morning-0',
        metric: 'awtS',
        seedCount: 5,
        note: 'These players, on these 5 seeds, in this order. … never combined into a single figure.',
        compare: { note: 'Compare answers the question a board cannot.' },
        entries: [],
        entriesOnOtherData: 0,
      },
    });
    const result = await createClient('https://x', transport).challengeBoard('midtown-morning-0', 'awtS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // § D106 and § D218 § 5 clause 5 travel with the data. A client that dropped either would be
    // free to draw a composite, or to raise "is mine better" with nowhere to send the reader.
    expect(result.value.note).toMatch(/never combined/u);
    expect(result.value.compare.note).toMatch(/Compare/u);
    expect(seen[0]?.url).toBe('https://x/api/challenge-board?challengeId=midtown-morning-0&metric=awtS');
  });

  it('refuses a 2xx whose shape this build does not understand', async () => {
    const { transport } = scripted({ status: 200, body: { something: 'else' } });
    const result = await createClient('https://x', transport).challengeBoard('c', 'awtS');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unexpected-response');
  });
});
