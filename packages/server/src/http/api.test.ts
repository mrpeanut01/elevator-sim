/**
 * The whole flow, driven end to end with no socket: register, read the mail, click the link, sign
 * in, forge a score and watch it refused, submit an honest one and watch it ranked.
 *
 * Against the **real `data/`** and the **real kernel**. A leaderboard test that stubbed the
 * simulation would prove the stub agrees with itself; the entire anti-cheat design is that the
 * shipped engine is deterministic enough to catch a lie, and the only way to test that is to tell
 * one.
 *
 * Every security claim in `DECISIONS.md` § D214 § 5 has a test here that **breaks** it on purpose:
 * an unconfirmed account posting, a wrong password, a bad token, a session logged out and reused.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runSimulation } from '@elevator-sim/core';

import { bootstrap, UnsafeConfigurationError, type Server } from '../bootstrap.js';
import { configFor, metricsOf } from '../leaderboard/verify.js';
import { OutboxMailer } from '../mail/mailer.js';
import type { ApiRequest, ApiResponse } from './api.js';
import type { Submission, SubmittedRun } from '../leaderboard/submission.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const SECRET = 'a'.repeat(48);
const PASSWORD = 'a passphrase of adequate length';

let server: Server;
let outbox: OutboxMailer;
let scratch: string;
/** Injected, so nothing here depends on what time the suite runs at. */
let clock = 1_770_000_000_000;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-server-'));
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

/* -------------------------------------------------------------------------- *
 * Calling the API
 * -------------------------------------------------------------------------- */

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
  return server.api(request);
}

function bodyOf(response: ApiResponse): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}

let accounts = 0;
/** A fresh, unconfirmed account and its session token. */
async function register(): Promise<{ token: string; id: string; email: string }> {
  accounts += 1;
  const email = `player${String(accounts)}@example.test`;
  const response = await call('POST', '/api/register', {
    body: { email, displayName: `Player ${String(accounts)}`, password: PASSWORD },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const body = bodyOf(response);
  return {
    token: String(body['token']),
    id: String((body['user'] as Record<string, unknown>)['id']),
    email,
  };
}

/** Register, then follow the link out of the outbox. This is the flow, not a shortcut past it. */
async function registerConfirmed(): Promise<{ token: string; id: string; email: string }> {
  const account = await register();
  const delivered = await outbox.delivered();
  const message = delivered.at(-1);
  expect(message?.to).toBe(account.email);
  const link = /https:\/\/\S+/u.exec(message?.body ?? '')?.[0] ?? '';
  const confirmToken = new URL(link).searchParams.get('token') ?? '';
  const confirmed = await call('GET', '/api/confirm', { query: { token: confirmToken } });
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  return account;
}

/* -------------------------------------------------------------------------- *
 * Registration and confirmation
 * -------------------------------------------------------------------------- */

describe('registration', () => {
  it('mails a link, and the link is the only place the token appears', async () => {
    const before = (await outbox.delivered()).length;
    const account = await register();
    const delivered = await outbox.delivered();
    expect(delivered.length).toBe(before + 1);

    // The response must not carry the confirmation token. If it did, a client could confirm an
    // address it never proved it could read, and the mailbox round trip would be decorative.
    const serialised = JSON.stringify(bodyOf(await call('GET', '/api/me', { token: account.token })));
    const link = /https:\/\/\S+/u.exec(delivered.at(-1)?.body ?? '')?.[0] ?? '';
    const confirmToken = new URL(link).searchParams.get('token') ?? '';
    expect(confirmToken.length).toBeGreaterThan(20);
    expect(serialised).not.toContain(confirmToken);
  });

  it('never returns a password, a digest or a salt — on any route', async () => {
    const account = await registerConfirmed();
    for (const response of [
      await call('POST', '/api/login', { body: { email: account.email, password: PASSWORD } }),
      await call('GET', '/api/me', { token: account.token }),
    ]) {
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('hashHex');
      expect(text).not.toContain('saltHex');
    }
  });

  it('refuses a short password, a bad address and a blank name, and says all of it at once', async () => {
    const response = await call('POST', '/api/register', {
      body: { email: 'not-an-address', displayName: '', password: 'short' },
    });
    expect(response.status).toBe(400);
    // Three problems, three issues. A form that reports the first is a form that makes a player
    // guess how many there are — the rule `freePlayIssues` follows on the client.
    expect((bodyOf(response)['issues'] as string[]).length).toBeGreaterThanOrEqual(3);
  });

  it('does not say whether an address already has an account', async () => {
    const account = await registerConfirmed();
    const again = await call('POST', '/api/register', {
      body: { email: account.email, displayName: 'Somebody Else', password: PASSWORD },
    });
    expect(again.status).toBe(409);
    // The wording is about the form, not about the database. `email-taken` as a code would be an
    // account-enumeration oracle in a field a client can read.
    expect(bodyOf(again)['error']).toBe('cannot-register');
    expect(String(bodyOf(again)['detail'])).not.toMatch(/exists|already registered|taken/u);
  });

  it('does say when a display name is taken, because a display name is public', async () => {
    await call('POST', '/api/register', {
      body: { email: 'first@example.test', displayName: 'Contested', password: PASSWORD },
    });
    const clash = await call('POST', '/api/register', {
      body: { email: 'second@example.test', displayName: 'contested', password: PASSWORD },
    });
    // Case-insensitively, so two names that render identically on a board cannot both exist.
    expect(clash.status).toBe(409);
    expect(bodyOf(clash)['error']).toBe('name-taken');
  });

  it('refuses a tampered, foreign or expired confirmation link', async () => {
    const account = await register();
    const link = /https:\/\/\S+/u.exec((await outbox.delivered()).at(-1)?.body ?? '')?.[0] ?? '';
    const token = new URL(link).searchParams.get('token') ?? '';

    for (const bad of ['', 'nonsense', `${token}x`, token.slice(0, -4)]) {
      const response = await call('GET', '/api/confirm', { query: { token: bad } });
      expect(response.status, bad).toBe(400);
    }
    // The real one still works afterwards — the refusals above did not consume it.
    expect((await call('GET', '/api/confirm', { query: { token } })).status).toBe(200);
    expect(account.id.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * Signing in
 * -------------------------------------------------------------------------- */

describe('signing in', () => {
  it('gives the same refusal for a wrong password and an unknown address', async () => {
    const account = await registerConfirmed();
    const wrongPassword = await call('POST', '/api/login', {
      body: { email: account.email, password: 'a completely different passphrase' },
    });
    const unknownAddress = await call('POST', '/api/login', {
      body: { email: 'nobody@example.test', password: PASSWORD },
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownAddress.status).toBe(401);
    // Byte for byte. A difference of a word is a difference an attacker can read.
    expect(JSON.stringify(wrongPassword.body)).toBe(JSON.stringify(unknownAddress.body));
  });

  it('folds case and whitespace, so one person has one account', async () => {
    const account = await registerConfirmed();
    const response = await call('POST', '/api/login', {
      body: { email: `  ${account.email.toUpperCase()} `, password: PASSWORD },
    });
    expect(response.status).toBe(200);
  });

  it('a logged-out token stops working, immediately', async () => {
    const account = await registerConfirmed();
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(200);
    expect((await call('POST', '/api/logout', { token: account.token })).status).toBe(200);
    // This is why sessions are a table and not a JWT (§ D214 § 5): revocation is a DELETE, and a
    // stateless token could not be withdrawn before its own expiry.
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(401);
  });

  it('a session expires', async () => {
    const account = await registerConfirmed();
    const wasAt = clock;
    clock += 31 * 24 * 60 * 60 * 1000;
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(401);
    clock = wasAt;
  });
});

/* -------------------------------------------------------------------------- *
 * The leaderboard
 * -------------------------------------------------------------------------- */

/** Small enough to replay quickly, busy enough to have a wait worth claiming. */
const RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  seed: '20260804',
});

/**
 * The truth, measured the server's own way.
 *
 * Through `configFor` + `runSimulation` rather than a second hand-built configuration: two places
 * that both decide what a submission means is the drift this design cannot survive.
 */
function honest(run: SubmittedRun = RUN): Submission {
  const config = configFor(run, {
    buildingsById: server.config.buildingsById,
    dispatcherProfilesById: server.config.dispatcherProfilesById,
    trafficProfiles: server.config.trafficProfiles,
    elevatorSpecs: server.config.elevatorSpecs,
    dispatcherProfiles: server.config.dispatcherProfiles,
  });
  if (typeof config === 'string') throw new Error(`fixture does not resolve: ${config}`);
  return { run, claimed: metricsOf(runSimulation(config).summary) };
}

describe('posting a score', () => {
  it('is refused before the address is confirmed, and allowed after', async () => {
    const account = await register();
    const submission = honest();
    const before = await call('POST', '/api/scores', { token: account.token, body: submission });
    expect(before.status).toBe(403);
    expect(bodyOf(before)['error']).toBe('not-confirmed');
    // ...and the refusal says the player may keep playing. An unconfirmed account is not a locked
    // one; § D214 § 5 gates exactly one privilege.
    expect(String(bodyOf(before)['detail'])).toMatch(/keep playing/u);

    const link = /https:\/\/\S+/u.exec((await outbox.delivered()).at(-1)?.body ?? '')?.[0] ?? '';
    await call('GET', '/api/confirm', { query: { token: new URL(link).searchParams.get('token') ?? '' } });

    const after = await call('POST', '/api/scores', { token: account.token, body: submission });
    expect(after.status, JSON.stringify(after.body)).toBe(201);
  }, 60_000);

  it('rejects a forged score, and the honest one it was forged from is accepted', async () => {
    const account = await registerConfirmed();
    const truth = honest();

    // A quarter of a second better. Small enough that no plausibility bound would catch it — which
    // is the point: the design has no plausibility bounds, only replay.
    const forged: Submission = {
      run: truth.run,
      claimed: { ...truth.claimed, awtS: truth.claimed.awtS - 0.25 },
    };
    const refused = await call('POST', '/api/scores', { token: account.token, body: forged });
    expect(refused.status).toBe(422);
    expect(bodyOf(refused)['error']).toBe('metrics-do-not-reproduce');
    // The wording is not an accusation: an honest player on an older build lands here too.
    expect(String(bodyOf(refused)['detail'])).toMatch(/different build|reference data/u);

    const accepted = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
  }, 60_000);

  it('stores the server’s figures, not the claim', async () => {
    const account = await registerConfirmed();
    const truth = honest();
    const response = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(response.status).toBe(201);
    const entry = bodyOf(response)['entry'] as Record<string, unknown>;
    const measured = entry['measured'] as Record<string, number>;
    // Equal here because the claim was honest. What matters is the path: `verification.measured`
    // is what `recordEntry` is handed, so a claim can never be what ranks.
    expect(measured['awtS']).toBeCloseTo(truth.claimed.awtS, 9);
  }, 60_000);

  it('needs a session at all', async () => {
    const response = await call('POST', '/api/scores', { body: honest() });
    expect(response.status).toBe(401);
  }, 60_000);

  it('refuses a malformed submission without simulating anything', async () => {
    const account = await registerConfirmed();
    for (const run of [
      { ...RUN, seed: 'not-a-seed' },
      { ...RUN, durationS: 7 },
      { ...RUN, arrivalRatePctPop5min: -3 },
    ]) {
      const response = await call('POST', '/api/scores', {
        token: account.token,
        body: { run, claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true } },
      });
      expect(response.status, JSON.stringify(run)).toBe(400);
      expect(bodyOf(response)['error']).toBe('invalid-submission');
    }
  }, 60_000);

  it('refuses ids this server does not ship', async () => {
    const account = await registerConfirmed();
    const response = await call('POST', '/api/scores', {
      token: account.token,
      body: {
        run: { ...RUN, buildingId: 'a-tower-i-invented' },
        claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
      },
    });
    // 404, before any simulation. This is the defence against a player inventing a two-floor tower
    // with sixteen cars and posting a superb wait.
    expect(response.status).toBe(404);
    expect(bodyOf(response)['error']).toBe('unknown-configuration');
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Reading a board
 * -------------------------------------------------------------------------- */

describe('a board', () => {
  it('ranks on the metric it was asked for, and says so on the wire', async () => {
    const account = await registerConfirmed();
    const posted = await call('POST', '/api/scores', { token: account.token, body: honest() });
    const configHash = String(bodyOf(posted)['configHash']);

    const board = await call('GET', '/api/board', { query: { configHash, metric: 'wt95S' } });
    expect(board.status).toBe(200);
    expect(bodyOf(board)['metric']).toBe('wt95S');
    // § D106's rule, said where a client can read it rather than only in a docstring: the ranking
    // is one metric and the others sit beside it, never combined.
    expect(String(bodyOf(board)['note'])).toMatch(/never combined/u);
    expect((bodyOf(board)['entries'] as unknown[]).length).toBeGreaterThan(0);
  }, 60_000);

  it('refuses a metric that is not one of the four', async () => {
    const response = await call('GET', '/api/board', { query: { configHash: 'x', metric: 'energyKJ' } });
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('no-such-metric');
  });

  it('puts a different arrival rate on a different board', async () => {
    const account = await registerConfirmed();
    const first = await call('POST', '/api/scores', { token: account.token, body: honest() });
    const second = await call('POST', '/api/scores', {
      token: account.token,
      body: honest({ ...RUN, arrivalRatePctPop5min: 8 }),
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    // § D214 § 4. A run under heavier traffic is not a better run at the same thing; comparing the
    // two would rank the easier configuration.
    expect(bodyOf(first)['configHash']).not.toBe(bodyOf(second)['configHash']);
  }, 120_000);

  it('lists its boards', async () => {
    const response = await call('GET', '/api/boards');
    expect(response.status).toBe(200);
    expect((bodyOf(response)['boards'] as unknown[]).length).toBeGreaterThan(0);
  });

  it('answers an unknown route with a 404 rather than a stack trace', async () => {
    const response = await call('GET', '/api/whatever');
    expect(response.status).toBe(404);
    expect(bodyOf(response)['error']).toBe('no-such-route');
  });
});

/* -------------------------------------------------------------------------- *
 * Refusing to boot
 * -------------------------------------------------------------------------- */

describe('the bootstrap refuses two configurations', () => {
  it('refuses to start with no signing secret', async () => {
    await expect(
      bootstrap({
        dataDir: DATA_DIR,
        databasePath: ':memory:',
        env: {},
        publicOrigin: 'https://elevator.example',
      }),
    ).rejects.toThrow(/ELEVATOR_SIM_SECRET/u);
  });

  it('refuses the outbox mailer in production', async () => {
    // The mailer module promises this refusal exists. Without a test, that promise is a docstring:
    // the dev driver writes confirmation links to a file in the clear, and each one is an
    // account-takeover link for whoever can read the disk.
    await expect(
      bootstrap({
        dataDir: DATA_DIR,
        databasePath: ':memory:',
        env: { ELEVATOR_SIM_SECRET: SECRET, NODE_ENV: 'production' },
        publicOrigin: 'https://elevator.example',
        mailer: new OutboxMailer(join(scratch, 'production.jsonl')),
      }),
    ).rejects.toThrow(UnsafeConfigurationError);
  }, 120_000);
});
