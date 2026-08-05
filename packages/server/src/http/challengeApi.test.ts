/**
 * The challenge board over the API, with no socket bound: ask the server which challenge it is,
 * play the seed set it names, post the whole thing, and read the order it produces.
 *
 * Against the **real `data/`** and the **real kernel**, for `api.test.ts`'s reason — the anti-cheat
 * design is that the shipped engine is deterministic enough to catch a lie, and the only way to
 * test that is to tell one. A five-seed submission tells it four ways.
 *
 * Two of § D218's five criteria can only be checked here, because both are statements about a
 * **route** rather than about a function:
 *
 * - **The client never decides which challenge is current** (clause 3). Checked by putting a clock
 *   in the request and requiring the answer not to move, and then by moving the *server's* clock
 *   and requiring it to.
 * - **A submission outside the window is refused with a reason a player can act on** (§ D218 § 3's
 *   consequence). Checked by running a challenge, letting it close, and posting anyway.
 *
 * There is also a sweep here that no unit test can do: every challenge route's **serialised response
 * body** is scanned for the comparative vocabulary, so a sentence added straight into `api.ts` —
 * bypassing `challenge/board.ts`, where the lexical rule is enforced — is caught anyway.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runSimulation } from '@elevator-sim/core';

import { bootstrap, type Server } from '../bootstrap.js';
import {
  CHALLENGE_EPOCH_MS,
  CHALLENGE_PERIOD_MS,
  issuedChallengeFor,
  type IssuedChallenge,
} from '../challenge/schedule.js';
import type { ChallengeSubmission, ClaimedSeedMetrics } from '../challenge/submission.js';
import { configFor, metricsOf } from '../leaderboard/verify.js';
import { OutboxMailer } from '../mail/mailer.js';
import type { ApiRequest, ApiResponse } from './api.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const SECRET = 'a'.repeat(48);
const PASSWORD = 'a passphrase of adequate length';

let server: Server;
let outbox: OutboxMailer;
let scratch: string;

/**
 * Mid-way through cycle 0, so a known challenge is open and the boundaries are far away.
 *
 * Injected, like every clock in this package (§ D215 § 6). A test that read the real clock would
 * pass this week and fail next week, which for a *weekly rotation* is not a hypothetical.
 */
const CYCLE_0_MIDPOINT = CHALLENGE_EPOCH_MS + CHALLENGE_PERIOD_MS / 2;
let clock = CYCLE_0_MIDPOINT;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-challenge-'));
  outbox = new OutboxMailer(join(scratch, 'outbox.jsonl'));
  server = await bootstrap({
    dataDir: DATA_DIR,
    databasePath: ':memory:',
    env: { ELEVATOR_SIM_SECRET: SECRET },
    publicOrigin: 'https://elevator.example',
    now: () => clock,
    mailer: outbox,
  });
}, 120_000);

afterAll(async () => {
  server.close();
  await rm(scratch, { recursive: true, force: true });
});

async function call(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; query?: Record<string, string> } = {},
): Promise<ApiResponse> {
  const request: ApiRequest = {
    method,
    path,
    query: new Map(Object.entries(options.query ?? {})),
    body: options.body,
    token: options.token,
  };
  const response = await server.api(request);
  clock += 10_000;
  return response;
}

function bodyOf(response: ApiResponse): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}

let accounts = 0;
/** A confirmed account, through the mailbox rather than around it. */
async function registerConfirmed(): Promise<{ token: string }> {
  accounts += 1;
  const email = `challenger${String(accounts)}@example.test`;
  const registered = await call('POST', '/api/register', {
    body: { email, displayName: `Challenger ${String(accounts)}`, password: PASSWORD },
  });
  expect(registered.status, JSON.stringify(registered.body)).toBe(201);
  const link = /https:\/\/\S+/u.exec((await outbox.delivered()).at(-1)?.body ?? '')?.[0] ?? '';
  const confirmed = await call('GET', '/api/confirm', {
    query: { token: new URL(link).searchParams.get('token') ?? '' },
  });
  expect(confirmed.status).toBe(200);
  return { token: String(bodyOf(registered)['token']) };
}

/**
 * A whole honest entry, measured the server's own way.
 *
 * Through `configFor` + `runSimulation` — the verifier's own path — rather than a second hand-built
 * configuration, for `verify.test.ts`'s reason: two places that both decide what a submission means
 * is the drift this design cannot survive.
 */
function honest(challenge: IssuedChallenge, dispatcherProfileId = 'collective'): ChallengeSubmission {
  const claimed: ClaimedSeedMetrics[] = challenge.seeds.map((seed) => {
    const config = configFor(
      {
        buildingId: challenge.config.buildingId,
        dispatcherProfileId,
        demandTemplateId: challenge.config.demandTemplateId,
        arrivalRatePctPop5min: challenge.config.arrivalRatePctPop5min,
        durationS: challenge.config.durationS,
        seed,
      },
      {
        buildingsById: server.config.buildingsById,
        dispatcherProfilesById: server.config.dispatcherProfilesById,
        trafficProfiles: server.config.trafficProfiles,
        elevatorSpecs: server.config.elevatorSpecs,
        dispatcherProfiles: server.config.dispatcherProfiles,
      },
    );
    if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
    const summary = runSimulation(config).summary;
    return { seed, legs: summary.waiting.count, ...metricsOf(summary) };
  });
  return { challengeId: challenge.id, dispatcherProfileId, claimed };
}

/* -------------------------------------------------------------------------- *
 * The server owns the clock
 * -------------------------------------------------------------------------- */

describe('which challenge is current', () => {
  it('is answered by the server, and no parameter a client sends can move it', async () => {
    const plain = await call('GET', '/api/challenges');
    // Every clock a client could plausibly try to assert, all at once. The handler reads nothing
    // from the request, which is the mechanical form of the guarantee § D218 § 3 asks for: there
    // is no parameter that *could* move the answer, so there is none to forget to ignore.
    const withClientClock = await call('GET', '/api/challenges', {
      query: {
        at: String(CHALLENGE_EPOCH_MS + 40 * CHALLENGE_PERIOD_MS),
        now: String(Date.now()),
        cycle: '99',
      },
    });
    expect(plain.status).toBe(200);
    expect(bodyOf(plain)['currentId']).toBe(bodyOf(withClientClock)['currentId']);
    expect(bodyOf(plain)['currentId']).toBe(issuedChallengeFor(0).id);
  });

  it('moves when the server’s own clock moves, and only then', async () => {
    const before = bodyOf(await call('GET', '/api/challenges'))['currentId'];
    const wasAt = clock;
    clock += CHALLENGE_PERIOD_MS;
    const after = bodyOf(await call('GET', '/api/challenges'))['currentId'];
    clock = wasAt;
    expect(after).not.toBe(before);
    expect(after).toBe(issuedChallengeFor(1).id);
  });

  it('answers “the current one” without being asked for an id at all', async () => {
    const response = await call('GET', '/api/challenge');
    expect(response.status).toBe(200);
    const challenge = bodyOf(response)['challenge'] as IssuedChallenge;
    expect(challenge.id).toBe(issuedChallengeFor(0).id);
    expect(bodyOf(response)['state']).toBe('open');
    // A remaining **duration**, computed by the server. Not a timestamp for the client to subtract
    // its own clock from — that is the client computing currency one subtraction later.
    expect(bodyOf(response)['closesInMs']).toBe(challenge.closesAtMs - (clock - 10_000));
    expect(bodyOf(response)['opensInMs']).toBeNull();
  });

  it('404s an id it has never issued, and points at the one that is open', async () => {
    const response = await call('GET', '/api/challenge', { query: { id: 'a-challenge-i-invented-0' } });
    expect(response.status).toBe(404);
    expect(bodyOf(response)['error']).toBe('no-such-challenge');
    expect(String(bodyOf(response)['detail'])).toMatch(/api\/challenges/u);
  });
});

/* -------------------------------------------------------------------------- *
 * Posting an entry
 * -------------------------------------------------------------------------- */

describe('posting a challenge entry', () => {
  it('replays the whole seed set and ranks the server’s aggregate', async () => {
    const account = await registerConfirmed();
    const challenge = issuedChallengeFor(0);
    const submission = honest(challenge);

    const posted = await call('POST', '/api/challenge-scores', { token: account.token, body: submission });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
    const entry = bodyOf(posted)['entry'] as Record<string, unknown>;
    const score = entry['score'] as Record<string, unknown>;
    // R13 on the wire: the count travels in the same object as the figure, at both levels.
    expect(score['runs']).toBe(challenge.seeds.length);
    expect(Number(score['legs'])).toBeGreaterThan(0);
    expect((score['perSeed'] as unknown[]).length).toBe(challenge.seeds.length);
    expect(entry['dispatcherProfileId']).toBe('collective');
  }, 120_000);

  it('rejects a set that reproduces on four of five', async () => {
    const account = await registerConfirmed();
    const challenge = issuedChallengeFor(0);
    const truth = honest(challenge);
    const forged: ChallengeSubmission = {
      ...truth,
      claimed: truth.claimed.map((entry, index) =>
        index === 2 ? { ...entry, wt95S: entry.wt95S - 0.25 } : entry,
      ),
    };
    const refused = await call('POST', '/api/challenge-scores', { token: account.token, body: forged });
    expect(refused.status).toBe(422);
    expect(bodyOf(refused)['error']).toBe('metrics-do-not-reproduce');
    // Not an accusation: an honest player on an older build lands here too.
    expect(String(bodyOf(refused)['detail'])).toMatch(/different build|reference data/u);
  }, 120_000);

  it('refuses a short set before simulating anything', async () => {
    const account = await registerConfirmed();
    const challenge = issuedChallengeFor(0);
    const response = await call('POST', '/api/challenge-scores', {
      token: account.token,
      body: {
        challengeId: challenge.id,
        dispatcherProfileId: 'collective',
        claimed: challenge.seeds
          .slice(0, 3)
          .map((seed) => ({ seed, awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, legs: 1, awtIsValid: true })),
      },
    });
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('invalid-submission');
    expect((bodyOf(response)['issues'] as string[]).join(' ')).toMatch(/not a partial result/u);
  });

  it('refuses an entry to a challenge that has closed, and says what to do instead', async () => {
    const account = await registerConfirmed();
    const challenge = issuedChallengeFor(0);
    const submission = honest(challenge);

    const wasAt = clock;
    // Two weeks on. The player ran the set honestly and posted it late — which is not a forgery,
    // and must not read as one.
    clock += 2 * CHALLENGE_PERIOD_MS;
    const refused = await call('POST', '/api/challenge-scores', { token: account.token, body: submission });
    clock = wasAt;

    expect(refused.status).toBe(409);
    expect(bodyOf(refused)['error']).toBe('challenge-not-open');
    expect(bodyOf(refused)['state']).toBe('closed');
    // § D218 § 5's fifth criterion is two things: a reason, and somewhere to go. A refusal with
    // only the first is a dead end.
    expect(bodyOf(refused)['currentChallengeId']).toBe(issuedChallengeFor(2).id);
    expect(String(bodyOf(refused)['detail'])).toMatch(/closed on \d{4}-\d{2}-\d{2}/u);
    expect(String(bodyOf(refused)['detail'])).toContain(issuedChallengeFor(2).id);
  }, 120_000);

  it('needs a confirmed account, and a session at all', async () => {
    const challenge = issuedChallengeFor(0);
    const anonymous = await call('POST', '/api/challenge-scores', {
      body: { challengeId: challenge.id, dispatcherProfileId: 'collective', claimed: [] },
    });
    expect(anonymous.status).toBe(401);

    accounts += 1;
    const registered = await call('POST', '/api/register', {
      body: {
        email: `unconfirmed${String(accounts)}@example.test`,
        displayName: `Unconfirmed ${String(accounts)}`,
        password: PASSWORD,
      },
    });
    const unconfirmed = await call('POST', '/api/challenge-scores', {
      token: String(bodyOf(registered)['token']),
      body: { challengeId: challenge.id, dispatcherProfileId: 'collective', claimed: [] },
    });
    expect(unconfirmed.status).toBe(403);
    expect(bodyOf(unconfirmed)['error']).toBe('not-confirmed');
  });

  it('charges a cooldown scaled by the number of replays it just commanded', async () => {
    const account = await registerConfirmed();
    const challenge = issuedChallengeFor(0);
    const submission = honest(challenge);

    const at = clock;
    const first = await call('POST', '/api/challenge-scores', { token: account.token, body: submission });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // Ten seconds later — inside the single-run interval's five seconds *and* inside the five-seed
    // cooldown, which is what is being checked: a challenge verification is five simulations, so a
    // flat interval sized for one would let it command five times the CPU at the same rate.
    clock = at + 10_000;
    const tooSoon = await call('POST', '/api/challenge-scores', { token: account.token, body: submission });
    expect(tooSoon.status).toBe(429);
    expect(bodyOf(tooSoon)['error']).toBe('too-many-submissions');

    clock = at + 26_000;
    const later = await call('POST', '/api/challenge-scores', { token: account.token, body: submission });
    expect(later.status, JSON.stringify(later.body)).toBe(201);
  }, 180_000);
});

/* -------------------------------------------------------------------------- *
 * Reading the board
 * -------------------------------------------------------------------------- */

describe('a challenge board', () => {
  it('puts two dispatchers on the SAME board — which is the whole point', async () => {
    const challenge = issuedChallengeFor(0);
    const ada = await registerConfirmed();
    const bo = await registerConfirmed();

    const first = await call('POST', '/api/challenge-scores', {
      token: ada.token,
      body: honest(challenge, 'collective'),
    });
    const second = await call('POST', '/api/challenge-scores', {
      token: bo.token,
      body: honest(challenge, 'destination-eta'),
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    // The defect § D218 exists to fix, in one assertion. On a config board the dispatcher is in the
    // key, so choosing a different one moves a player to a *different board* rather than up this
    // one; here the two land on the same `dataHash` and are ordered against each other.
    expect(bodyOf(second)['dataHash']).toBe(bodyOf(first)['dataHash']);

    const board = await call('GET', '/api/challenge-board', { query: { challengeId: challenge.id } });
    expect(board.status).toBe(200);
    const dispatchers = (board.body as { entries: { dispatcherProfileId: string }[] }).entries.map(
      (entry) => entry.dispatcherProfileId,
    );
    expect(new Set(dispatchers).size).toBeGreaterThan(1);
  }, 180_000);

  it('carries the count, the four metrics unblended, and the pointer at Compare', async () => {
    const challenge = issuedChallengeFor(0);
    const response = await call('GET', '/api/challenge-board', { query: { challengeId: challenge.id } });
    const body = bodyOf(response);
    expect(body['seedCount']).toBe(challenge.seeds.length);
    expect(String(body['note'])).toMatch(/never combined/u);
    expect(String(body['note'])).toMatch(/carries no interval/u);
    // Clause 5: Compare is reachable *from here*, with the configuration to open it on — because
    // the honest answer to "is my dispatcher better" lives there and nowhere else.
    const compare = body['compare'] as Record<string, unknown>;
    expect(compare['buildingId']).toBe(challenge.config.buildingId);
    expect(String(compare['note'])).toMatch(/interval that can contain zero/u);

    const entries = body['entries'] as { score: Record<string, number> }[];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      // Four figures, side by side, no composite anywhere on the row.
      expect(entry.score['runs']).toBe(challenge.seeds.length);
      for (const key of ['meanAwtS', 'meanWt95S', 'meanTtdMeanS', 'meanPctOverLongWait']) {
        expect(Number.isFinite(entry.score[key]), key).toBe(true);
      }
      expect(Object.keys(entry.score)).not.toContain('score');
    }
  }, 60_000);

  it('orders on the metric it was asked for, and refuses one that is not a metric', async () => {
    const challenge = issuedChallengeFor(0);
    const ranked = await call('GET', '/api/challenge-board', {
      query: { challengeId: challenge.id, metric: 'wt95S' },
    });
    expect(bodyOf(ranked)['metric']).toBe('wt95S');
    const means = (ranked.body as { entries: { score: { meanWt95S: number } }[] }).entries.map(
      (entry) => entry.score.meanWt95S,
    );
    expect([...means].sort((left, right) => left - right)).toEqual(means);

    const refused = await call('GET', '/api/challenge-board', {
      query: { challengeId: challenge.id, metric: 'energyKJ' },
    });
    // § D106 at the one surface where breaking it would be worth the most: energy is an axis and
    // never a score, so it is not something a board can be ordered on.
    expect(refused.status).toBe(400);
    expect(bodyOf(refused)['error']).toBe('no-such-metric');
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * The prohibition, swept over what actually goes on the wire
 * -------------------------------------------------------------------------- */

const COMPARATIVE =
  /\b(better|best|beats?|beating|worse|worst|outperform\w*|superior|inferior|optimal|winner|winning|wins|stronger|weaker|fastest|slowest|leading)\b/iu;

describe('no string this surface sends orders two dispatchers', () => {
  it('sweeps the serialised body of every challenge route', async () => {
    const challenge = issuedChallengeFor(0);
    const account = await registerConfirmed();
    const wasAt = clock;
    clock += 3 * CHALLENGE_PERIOD_MS;
    const closed = await call('POST', '/api/challenge-scores', {
      token: account.token,
      body: { challengeId: challenge.id, dispatcherProfileId: 'collective', claimed: [] },
    });
    clock = wasAt;

    const responses = [
      await call('GET', '/api/challenges'),
      await call('GET', '/api/challenge'),
      await call('GET', '/api/challenge', { query: { id: challenge.id } }),
      await call('GET', '/api/challenge', { query: { id: 'nothing-0' } }),
      await call('GET', '/api/challenge-board', { query: { challengeId: challenge.id } }),
      await call('GET', '/api/challenge-board', { query: { challengeId: challenge.id, metric: 'nope' } }),
      closed,
    ];

    for (const response of responses) {
      const text = JSON.stringify(response.body);
      // `challenge/board.ts` keeps this rule over the copy it owns; this sweep keeps it over
      // whatever actually reaches a player, including a sentence written straight into `api.ts`.
      expect(COMPARATIVE.exec(text)?.[0], text.slice(0, 400)).toBeUndefined();
    }
  }, 120_000);
});
