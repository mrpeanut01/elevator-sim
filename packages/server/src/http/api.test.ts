/**
 * The whole flow, driven end to end with no socket: ask for a sign-in link, read the mail, redeem
 * it, forge a score and watch it refused, submit an honest one and watch it ranked.
 *
 * Against the **real `data/`** and the **real kernel**. A leaderboard test that stubbed the
 * simulation would prove the stub agrees with itself; the entire anti-cheat design is that the
 * shipped engine is deterministic enough to catch a lie, and the only way to test that is to tell
 * one.
 *
 * Every security claim in `DECISIONS.md` § D214 § 5 as amended by § D241 has a test here that
 * **breaks** it on purpose: a tampered link, an expired one, a link redeemed twice, a link for one
 * address presented for another, a session logged out and reused, and an address asked about often
 * enough to be mail-bombed.
 *
 * **The two that only exist here** are the two a unit test structurally cannot make. Single use is a
 * fact about the store, not about a signature — `credentials.test.ts` says out loud that verifying
 * twice succeeds twice — and account non-enumeration is a fact about two whole responses being the
 * same bytes, which needs both branches driven through the same route.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';

import { runSimulation } from '@elevator-sim/core';

import { LOGIN_TTL_MS, signLoginToken } from '../accounts/credentials.js';
import { bootstrap, UnsafeConfigurationError, type Server } from '../bootstrap.js';
import { configFor, metricsOf } from '../leaderboard/verify.js';
import { OutboxMailer } from '../mail/mailer.js';
import { PgliteSql } from '../store/pglite.test-helper.js';
import { RacingSql } from '../store/racingSql.test-helper.js';
import type { ApiRequest, ApiResponse } from './api.js';
import type { Submission, SubmittedRun } from '../leaderboard/submission.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const SECRET = 'a'.repeat(48);

let server: Server;
let outbox: OutboxMailer;
let scratch: string;
/**
 * The database under {@link server}, kept so one test can forge a state the API cannot reach.
 *
 * Used in exactly one place — the cooldown-clearing test below says why it needs raw SQL and why
 * the state it builds cannot occur in production. Everything else drives the API.
 */
let storeSql: PgliteSql;
/** Injected, so nothing here depends on what time the suite runs at. */
let clock = 1_770_000_000_000;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-server-'));
  outbox = new OutboxMailer(join(scratch, 'outbox.jsonl'));
  storeSql = new PgliteSql();
  server = await bootstrap({
    dataDir: DATA_DIR,
    sql: storeSql,
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
  options: { body?: unknown; token?: string; query?: Record<string, string>; ip?: string } = {},
): Promise<ApiResponse> {
  const request: ApiRequest = {
    method,
    path,
    query: new Map(Object.entries(options.query ?? {})),
    body: options.body,
    token: options.token,
    // A fresh caller unless a test says otherwise. § D242's two budgets are driven deliberately
    // below, each with its own fixed address; sharing one address across the whole file would put
    // every other test into the same bucket, and the first symptom would be an unrelated 429
    // halfway down the file rather than the thing that test was about.
    clientIp: options.ip ?? `198.51.100.${String((callsMade += 1) % 250)}`,
  };
  const response = await server.api(request);
  // Ten seconds per call, which is what a real client's clock does between two actions and what
  // `MIN_SUBMIT_INTERVAL_MS` is measured against. Without it every test after the first submission
  // would be rate-limited — the limiter would be untestable *and* would make everything else red,
  // which is the worst of both.
  clock += 10_000;
  return response;
}

function bodyOf(response: ApiResponse): Record<string, unknown> {
  return response.body as Record<string, unknown>;
}

let callsMade = 0;
let accounts = 0;

/** The most recently delivered message's link, and the token in its fragment. */
async function lastLink(): Promise<{ to: string; url: string; token: string }> {
  const message = (await outbox.delivered()).at(-1);
  const url = /https:\/\/\S+/u.exec(message?.body ?? '')?.[0] ?? '';
  // Out of the **fragment**, which is where `bootstrap.ts` puts it and is the whole point: a
  // fragment is never sent to a server, so the token cannot reach an access log or a `Referer`.
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get('sign-in') ?? '';
  return { to: message?.to ?? '', url, token };
}

/**
 * A signed-in account, through the mailbox rather than around it.
 *
 * There is no shortcut past the mail any more and that is the point: a session can only be obtained
 * by reading a message sent to the address, which is what makes a separate confirmation step — and
 * the `postingGate` that enforced it — unnecessary rather than merely removed.
 */
async function signIn(): Promise<{ token: string; id: string; email: string }> {
  accounts += 1;
  const email = `player${String(accounts)}@example.test`;
  const asked = await call('POST', '/api/auth/request-link', { body: { email } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(202);

  const mail = await lastLink();
  expect(mail.to).toBe(email);
  const redeemed = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
  expect(redeemed.status, JSON.stringify(redeemed.body)).toBe(200);
  const body = bodyOf(redeemed);
  return {
    token: String(body['token']),
    id: String((body['user'] as Record<string, unknown>)['id']),
    email,
  };
}

/* -------------------------------------------------------------------------- *
 * Asking for a sign-in link
 * -------------------------------------------------------------------------- */

describe('asking for a sign-in link', () => {
  it('mails one, and the token appears nowhere but the mail', async () => {
    const before = (await outbox.delivered()).length;
    const asked = await call('POST', '/api/auth/request-link', { body: { email: 'mailed@example.test' } });
    expect(asked.status).toBe(202);
    expect((await outbox.delivered()).length).toBe(before + 1);

    const mail = await lastLink();
    expect(mail.token.length).toBeGreaterThan(20);
    // Not in the accepting response. A body that echoed the token would hand an account to anybody
    // who could name an address, and would make the mailbox round trip decorative.
    expect(JSON.stringify(asked.body)).not.toContain(mail.token);
  });

  it('puts the token in the fragment, so it is never sent to a server', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'fragment@example.test' } });
    const mail = await lastLink();
    const url = new URL(mail.url);
    // Nothing in the path and nothing in the query — those travel in the request line and reach
    // access logs, proxies and `Referer`. The fragment does not travel at all.
    expect(url.search).toBe('');
    expect(url.pathname).toBe('/');
    expect(url.hash).toContain('sign-in=');
    expect(`${url.origin}${url.pathname}${url.search}`).not.toContain(mail.token);
  });

  it('answers a new address and a known one with the same bytes', async () => {
    const account = await signIn();
    const known = await call('POST', '/api/auth/request-link', { body: { email: account.email } });
    const unknown = await call('POST', '/api/auth/request-link', { body: { email: 'never-seen@example.test' } });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    // Byte for byte, status included. A difference of a word, a code or a status is a difference an
    // attacker can read, and the address is the thing they do not have.
    expect(JSON.stringify(known.body)).toBe(JSON.stringify(unknown.body));
    expect(String(bodyOf(known)['detail'])).not.toMatch(/exists|already|new account|welcome/iu);
  });

  it('refuses an address that is not one, without mailing anything', async () => {
    const before = (await outbox.delivered()).length;
    for (const email of ['', 'not-an-address', 'a b@example.test', 'x'.repeat(300)]) {
      const response = await call('POST', '/api/auth/request-link', { body: { email } });
      expect(response.status, email).toBe(400);
      expect(bodyOf(response)['error']).toBe('invalid-address');
    }
    // The shape gate is first and has no side effect, so a typo costs nobody a mail and nobody a
    // budget.
    expect((await outbox.delivered()).length).toBe(before);
  });

  it('folds case and whitespace, so one person has one account', async () => {
    const account = await signIn();
    await call('POST', '/api/auth/request-link', { body: { email: `  ${account.email.toUpperCase()} ` } });
    const mail = await lastLink();
    const redeemed = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    expect(redeemed.status).toBe(200);
    // The same account, not a second one wearing different capitals.
    expect((bodyOf(redeemed)['user'] as Record<string, unknown>)['id']).toBe(account.id);
  });

  it('rate-limits one address, so the endpoint is not an email bomb', async () => {
    const victim = 'victim@example.test';
    const statuses: number[] = [];
    /*
     * From a different caller each time — `call` mints a fresh `clientIp` unless a test says
     * otherwise — so the per-caller budget cannot be what stops this. What stops it is the
     * per-address budget, which is the one that decides whether this endpoint can be pointed at a
     * stranger.
     *
     * The loop runs **until it is refused**, with a ceiling far above the shipped budget rather than
     * exactly at it. This test used to spend six requests and require at most three to succeed,
     * which pinned § D242's *number* — and issue #112 § 3 then had to move that number, because
     * three was justified by a premise about *outstanding links* that is false against a client
     * holding its session in memory (see `LINKS_PER_EMAIL`). The property worth pinning is **that
     * there is a ceiling and it is low**, not what it is this month; a test that fails when a
     * bounded policy is retuned trains its reader to edit the assertion.
     */
    const CEILING = 40;
    for (let index = 0; index < CEILING && !statuses.includes(429); index += 1) {
      statuses.push((await call('POST', '/api/auth/request-link', { body: { email: victim } })).status);
    }
    expect(statuses, 'one address can be mailed without limit').toContain(429);
    // And the ceiling is a real bound rather than a formality — nowhere near what a bomber wants
    // out of a quarter of an hour.
    expect(statuses.filter((status) => status === 202).length).toBeLessThan(CEILING / 2);
  });

  it('rate-limits one caller across many addresses, which the per-address budget cannot', async () => {
    const attacker = '203.0.113.7';
    let refusals = 0;
    // A hundred addresses asked for once each: no address exceeds its own budget, and the run is
    // still a run through a list.
    for (let index = 0; index < 40; index += 1) {
      const response = await call('POST', '/api/auth/request-link', {
        body: { email: `sweep${String(index)}@example.test` },
        ip: attacker,
      });
      if (response.status === 429) refusals += 1;
    }
    expect(refusals).toBeGreaterThan(0);
  });

  it('says how long to wait, and does not say which budget was spent', async () => {
    const shared = '203.0.113.8';
    let limited: ApiResponse | undefined;
    // Bounded above both budgets rather than at one of them — see the per-address test above for
    // why a loop pinned to the shipped number is the wrong instrument.
    for (let index = 0; index < 40 && limited === undefined; index += 1) {
      const response = await call('POST', '/api/auth/request-link', {
        body: { email: 'repeat@example.test' },
        ip: shared,
      });
      if (response.status === 429) limited = response;
    }
    expect(limited).toBeDefined();
    if (limited === undefined) return;
    expect(bodyOf(limited)['error']).toBe('too-many-link-requests');
    expect(Number(bodyOf(limited)['retryInMs'])).toBeGreaterThan(0);
    // Naming which budget was exhausted would say whether anybody else has been asking about this
    // address, which is the enumeration oracle by a longer route.
    expect(JSON.stringify(limited.body)).not.toMatch(/address budget|per-email|per-ip|this address has/iu);
  });

  /**
   * **The refusal a client can act on** — [`DECISIONS.md` § D491](../../../../DECISIONS.md), GitHub
   * issue #332.
   *
   * This case used to assert `rejects.toThrow()`, and that was the whole defect: the rejection
   * propagated to `http/serve.ts`, which answers `internal-error` / *"The server failed to handle
   * that request"* for **every** unhandled fault. So *the mail did not go* was byte-identical on
   * the wire to a database outage, and a viewer could only ever say *something went wrong*. Since
   * § D241 the mail is the only door, so that is the one fault a player most needs told apart.
   *
   * Two assertions, and the second is the bound the ruling put on this change: the refusal must not
   * become an account-enumeration oracle. It cannot be one, structurally — by the time the send is
   * attempted the account exists either way, because asking for a link on an unknown address is
   * what creates one — and this drives both halves anyway, because *cannot be* is what a test is
   * for.
   */
  it('answers a distinct refusal when the mail cannot be sent, identically for a known and an unknown address', async () => {
    const broken = await bootstrap({
      dataDir: DATA_DIR,
      sql: new PgliteSql(),
      env: { ELEVATOR_SIM_SECRET: SECRET },
      publicOrigin: 'https://elevator.example',
      now: () => clock,
      mailer: {
        send: () => Promise.reject(new Error('the mail service refused it')),
      },
    });
    const ask = (email: string, ip: string): Promise<{ status: number; body: unknown }> =>
      broken.api({
        method: 'POST',
        path: '/api/auth/request-link',
        query: new Map(),
        body: { email },
        token: undefined,
        clientIp: ip,
      });

    const first = await ask('undeliverable@example.test', '203.0.113.10');
    expect(first.status).toBe(502);
    expect(first.body).toMatchObject({ error: 'sign-in-mail-not-sent' });
    // The sentence is the server's own and a client shows it unrewritten, so it has to be one.
    expect(String((first.body as { detail?: unknown }).detail)).toContain('could not be sent');
    // Not the generic fault it used to be indistinguishable from.
    expect(first.body).not.toMatchObject({ error: 'internal-error' });

    /*
     * The same address again — its account now exists, created by the attempt above — against one
     * nothing has ever asked about. Different caller IPs, because § D242's per-caller budget is
     * three and this is the fourth and fifth request from `203.0.113.10` otherwise.
     */
    const known = await ask('undeliverable@example.test', '203.0.113.11');
    const unknown = await ask('never-mailed@example.test', '203.0.113.12');
    expect(known.status).toBe(unknown.status);
    expect(JSON.stringify(known.body)).toBe(JSON.stringify(unknown.body));
    await broken.close();
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * Redeeming one
 * -------------------------------------------------------------------------- */

describe('redeeming a sign-in link', () => {
  it('works once, and the second attempt is refused', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'once@example.test' } });
    const mail = await lastLink();

    const first = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    expect(first.status).toBe(200);
    // The claim `credentials.test.ts` says a signature cannot make. The token still verifies — it is
    // the same bytes, signed by the same secret, inside its expiry — and the row behind it is gone.
    const second = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    expect(second.status).toBe(400);
    expect(bodyOf(second)['error']).toBe('link-spent');
  });

  it('refuses a tampered, truncated or invented link, and does not spend the real one', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'tampered@example.test' } });
    const mail = await lastLink();

    for (const bad of ['', 'nonsense', `${mail.token}x`, mail.token.slice(0, -4), mail.token.replace('.', '..')]) {
      const response = await call('POST', '/api/auth/redeem', { body: { token: bad } });
      expect(response.status, bad).toBe(400);
      expect(String(bodyOf(response)['error'])).toMatch(/^link-/u);
    }
    // The real one still works afterwards. A refusal that consumed the token would let anyone who
    // could guess *at* a link lock its owner out of the account.
    expect((await call('POST', '/api/auth/redeem', { body: { token: mail.token } })).status).toBe(200);
  });

  it('refuses an expired link', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'stale@example.test' } });
    const mail = await lastLink();
    const wasAt = clock;
    clock += LOGIN_TTL_MS + 1;
    const response = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    clock = wasAt;
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('link-expired');
    // The wording says what to do about it, because "invalid" and "expired" are the same screen to
    // a reader and only one of them is fixed by asking again.
    expect(String(bodyOf(response)['detail'])).toMatch(/new one/u);
  });

  it('refuses a link whose signed address is not the account’s', async () => {
    const account = await signIn();
    // Signed by this server, inside its expiry, naming a real account id — and a different address.
    // The email is inside the signature so that this cannot be a login; without the check the token
    // would authenticate whatever address the account happened to hold.
    const forged = signLoginToken({
      userId: account.id,
      email: 'attacker@example.test',
      secret: SECRET,
      nowMs: clock,
    });
    await server.store.createLoginToken({
      jti: forged.jti,
      userId: account.id,
      expiresAtMs: forged.expiresAtMs,
    });
    const response = await call('POST', '/api/auth/redeem', { body: { token: forged.token } });
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('link-invalid');
  });

  it('never echoes the token back, on any refusal', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'noecho@example.test' } });
    const mail = await lastLink();
    await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    for (const body of [{ token: mail.token }, { token: `${mail.token}x` }, {}]) {
      const response = await call('POST', '/api/auth/redeem', { body });
      expect(JSON.stringify(response.body)).not.toContain(mail.token.slice(0, 24));
    }
  });

  it('is not a GET, and a GET consumes nothing', async () => {
    await call('POST', '/api/auth/request-link', { body: { email: 'prefetched@example.test' } });
    const mail = await lastLink();

    // What a mail scanner, a link-rewriting appliance or an over-eager client does. The link in the
    // message does not point here at all — it points at the viewer, with the token in a fragment
    // that is never transmitted — and even a caller that reconstructed this URL gets a 405.
    const prefetched = await call('GET', '/api/auth/redeem', { query: { token: mail.token } });
    expect(prefetched.status).toBe(405);
    expect(String(bodyOf(prefetched)['detail'])).toMatch(/consumes nothing|POST/u);

    // ...and the human who clicks afterwards still signs in.
    expect((await call('POST', '/api/auth/redeem', { body: { token: mail.token } })).status).toBe(200);
  });

  it('gives a new player a placeholder name and says it is one', async () => {
    const account = await signIn();
    const me = await call('GET', '/api/me', { token: account.token });
    const user = bodyOf(me)['user'] as Record<string, unknown>;
    expect(user['displayNameChosen']).toBe(false);
    // A generated name, not the address. An address is not a display name and a board is public.
    expect(String(user['displayName'])).not.toContain('@');
  });
});

/* -------------------------------------------------------------------------- *
 * Choosing a name
 * -------------------------------------------------------------------------- */

describe('choosing a display name', () => {
  it('renames the player and marks the name chosen', async () => {
    const account = await signIn();
    const response = await call('POST', '/api/me/display-name', {
      token: account.token,
      body: { displayName: 'Grace' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const user = bodyOf(response)['user'] as Record<string, unknown>;
    expect(user['displayName']).toBe('Grace');
    expect(user['displayNameChosen']).toBe(true);
  });

  it('needs a session', async () => {
    expect((await call('POST', '/api/me/display-name', { body: { displayName: 'Nobody' } })).status).toBe(401);
  });

  it('refuses a blank, an over-long or a control-carrying name', async () => {
    const account = await signIn();
    for (const displayName of ['', 'x', 'x'.repeat(33), 'two\nlines']) {
      const response = await call('POST', '/api/me/display-name', {
        token: account.token,
        body: { displayName },
      });
      expect(response.status, displayName).toBe(400);
    }
  });

  it('does say when a name is taken, because a display name is public', async () => {
    const first = await signIn();
    const second = await signIn();
    await call('POST', '/api/me/display-name', { token: first.token, body: { displayName: 'Contested' } });
    const clash = await call('POST', '/api/me/display-name', {
      token: second.token,
      body: { displayName: 'contested' },
    });
    // Case-insensitively, so two names that render identically on a board cannot both exist. Saying
    // so leaks nothing: the name is printed on every board already, unlike an address.
    expect(clash.status).toBe(409);
    expect(bodyOf(clash)['error']).toBe('name-taken');
  });
});

/* -------------------------------------------------------------------------- *
 * Holding a session
 * -------------------------------------------------------------------------- */

describe('a session', () => {
  it('can only be got by reading the mail', async () => {
    // The property that makes a separate confirmation step unnecessary rather than merely absent:
    // there is no route that issues a session without a token that was mailed to the address.
    const routes: readonly (readonly [string, string])[] = [
      ['POST', '/api/register'],
      ['POST', '/api/login'],
      ['GET', '/api/confirm'],
    ];
    for (const [method, path] of routes) {
      const response = await call(method, path, {
        body: { email: 'nobody@example.test', password: 'a passphrase of adequate length' },
        query: { token: 'anything' },
      });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
  });

  it('stops working the moment it is logged out', async () => {
    const account = await signIn();
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(200);
    expect((await call('POST', '/api/logout', { token: account.token })).status).toBe(200);
    // This is why sessions are a table and not a JWT (§ D214 § 5): revocation is a DELETE, and a
    // stateless token could not be withdrawn before its own expiry.
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(401);
  });

  it('expires', async () => {
    const account = await signIn();
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
  windowStartS: null,
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

/**
 * A whole authored day, as `viz` derives it — GitHub issue #267.
 *
 * `chancery-house` rather than `midtown-office`, and the choice is measured rather than arbitrary:
 * of the four office towers whose profile admits `office-day`, Midtown's whole day is **not
 * quotable** (`awtIsValid: false`, AWT 291.28 at this seed), so it is refused 422 `awt-not-quotable`
 * on its own merits and could never demonstrate the duration gate. Chancery replays in 407 ms with a
 * quotable 10.48 s mean, which is the fastest honest fixture available.
 *
 * `windowStartS: 0` is not decoration. `core` refuses a `templateOverrides.durationS` refit on a
 * phase-list record by name (§ D285/§ D356), so a whole day travels as a window over the record's own
 * period or it throws.
 */
const WHOLE_DAY: SubmittedRun = Object.freeze({
  buildingId: 'chancery-house',
  dispatcherProfileId: 'eta',
  demandTemplateId: 'office-day',
  arrivalRatePctPop5min: null,
  durationS: 36_000,
  windowStartS: 0,
  seed: '20260804',
});

/**
 * An Everyday run: § 11.5's rules on a cell where they bite, and § 7.6's parking press.
 *
 * `midtown-office` at 3 % rather than {@link RUN}'s `garden-apartments`, and the reason is measured:
 * on Garden at 6 % over 900 s neither field moves the run by a single leg, so a route test built on
 * it would have gone green over a server that dropped both. `verify.test.ts#EVERYDAY_RUN` carries
 * the numbers.
 */
const EVERYDAY: SubmittedRun = Object.freeze({
  ...RUN,
  buildingId: 'midtown-office',
  arrivalRatePctPop5min: 3,
  ruleRows: Object.freeze([
    Object.freeze({ when: 'lobby-queue-passes' as const, whenValue: 12, then: 'hold-at-lobby' as const }),
    Object.freeze({ when: 'call-waited' as const, whenValue: 60, then: 'jump-queue' as const }),
  ]),
  interventions: Object.freeze([
    Object.freeze({ atS: 225, change: Object.freeze({ kind: 'park-cars-lobby' as const }) }),
  ]),
});

describe('posting a run that carries a written dispatcher and a played day', () => {
  it('boards it, on the route rather than in the verifier', async () => {
    /*
     * The end of the wire this issue is about. Before it, `scope/runIdentity.ts` refused every state
     * carrying a rule row or an intervention, so § 11's whole workshop produced dispatchers that were
     * unpostable by construction — and a client that had posted one anyway would have been told its
     * figures did not replay, which is this product's one accusation aimed at somebody who did
     * nothing wrong.
     */
    const account = await signIn();
    const posted = await call('POST', '/api/scores', { token: account.token, body: honest(EVERYDAY) });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  }, 120_000);

  it('refuses a run whose stored inputs cannot reproduce its metrics, rather than boarding it', async () => {
    /*
     * **The mutation the widening has to survive**, driven through the route: the metrics of the run
     * above, submitted against a rule list that is not the one that produced them. A server that
     * accepted the fields and then replayed without them would answer 201 here and rank a figure no
     * stored input can reach — which is the leaderboard's founding property broken by the very
     * change that made the leaderboard usable.
     */
    const account = await signIn();
    const truth = honest(EVERYDAY);
    const swapped = {
      run: { ...EVERYDAY, ruleRows: [{ when: 'car-fuller-than', whenValue: 0.5, then: 'no-new-pickups' }] },
      claimed: truth.claimed,
    };
    const posted = await call('POST', '/api/scores', { token: account.token, body: swapped });
    expect(posted.status, JSON.stringify(posted.body)).toBe(422);
    expect(bodyOf(posted)['error']).toBe('metrics-do-not-reproduce');
  }, 120_000);

  it('refuses a mid-run dispatcher switch before it costs a replay', async () => {
    // The cheap gate, on the route: a submission that could smuggle a weight vector must be a 400
    // out of `submissionIssues` rather than a 422 out of a simulation it was allowed to command.
    const account = await signIn();
    const truth = honest(EVERYDAY);
    const smuggled = {
      run: {
        ...EVERYDAY,
        interventions: [
          { atS: 300, change: { kind: 'switch-dispatcher', profile: server.config.dispatcherProfilesById.get('eta') } },
        ],
      },
      claimed: truth.claimed,
    };
    const posted = await call('POST', '/api/scores', { token: account.token, body: smuggled });
    expect(posted.status, JSON.stringify(posted.body)).toBe(400);
    expect(bodyOf(posted)['error']).toBe('invalid-submission');
  }, 120_000);
});

describe('posting a whole authored day', () => {
  /*
   * **The end-to-end case for GitHub issue #267, and it is deliberately not a test of a constant.**
   *
   * § D286 closed this same mismatch on the client and it reappeared, because the fix lived on one
   * side only: § D356 gave the Everyday day a length **derived from the record** rather than picked
   * from a list, and `LONGEST_OFFERED_RUN_S` correctly kept bounding what is *offered* while saying
   * nothing about what is *reachable*. A test asserting `ACCEPTED_DURATIONS_S` contains 36 000 would
   * repeat that mistake in the other direction — it would pass on a server that accepts a length no
   * client can produce, and fail to notice a client that starts producing one the server refuses.
   *
   * So this drives the real route: a run built the way `configFor` builds one, simulated by the
   * shipped kernel, posted over the real API, and required to be **created**. Its partner is
   * `menu/client.test.ts`'s *"accepts every whole-day length the client can actually derive"*, which
   * runs the client's own `wholeDayFor` over the real `data/` and checks its answers against this
   * server's source text. Between them the two packages cannot drift apart silently again.
   */
  it('accepts it, replays it, and ranks it', async () => {
    const account = await signIn();
    const truth = honest(WHOLE_DAY);
    const posted = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  }, 120_000);

  it('records it as its own measurement, never confused with a slice of the same day', async () => {
    /*
     * The property that makes widening safe rather than a ranking bug, driven through the API so it
     * is the *server's* digest being compared rather than a recomputation.
     *
     * **What changed is which half of the claim the API answers.** A ten-hour run and a two-hour
     * window over the same day, same building, same dispatcher and same seed are different
     * measurements, and this proves the route files them as such — the entries carry different
     * `dataHash`es. What it no longer proves, because it is no longer true and § 12.1 says it may
     * not be, is that they are on different *boards*: neither is the day's fixture, so both land in
     * the same personal-record log and the log holds them apart by their data hashes rather than by
     * minting a leaderboard for each.
     */
    const account = await signIn();
    const day = await call('POST', '/api/scores', { token: account.token, body: honest(WHOLE_DAY) });
    expect(day.status, JSON.stringify(day.body)).toBe(201);

    // Past the whole day's own cooldown, which is five reference replays rather than one.
    clock += 60_000;
    const slice = { ...WHOLE_DAY, durationS: 7_200 };
    const posted = await call('POST', '/api/scores', { token: account.token, body: honest(slice) });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);

    const dataHashOf = (response: ApiResponse): unknown =>
      (bodyOf(response)['entry'] as Record<string, unknown>)['dataHash'];
    expect(dataHashOf(day)).not.toBe(dataHashOf(posted));
    // Same log, and that is the fix rather than a regression: a length nobody else picked used to
    // mint a board of one with its player permanently first.
    expect(bodyOf(day)['boardKey']).toBe(bodyOf(posted)['boardKey']);
    expect(bodyOf(day)['placement']).toBe('personal');
  }, 180_000);

  it('charges what it costs — five reference replays, not one', async () => {
    /*
     * Widening what is postable without widening what it costs would have been the widening paying
     * for itself out of the server's CPU budget. `MIN_SUBMIT_INTERVAL_MS`'s five seconds was sized
     * against a 7 200-second replay — the docstring said so in as many words, and that sentence was
     * made false by the line above that admits 36 000. A whole day is five such replays, so it
     * charges five times the interval.
     *
     * Driven against the clock rather than by calling `cooldownForReplay`, because the constant is
     * not the claim: the claim is that a second submission inside the charged window is refused.
     */
    const account = await signIn();
    const at = clock;
    const first = await call('POST', '/api/scores', { token: account.token, body: honest(WHOLE_DAY) });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // Ten seconds clears a slice's five-second charge and must not clear a whole day's twenty-five.
    clock = at + 10_000;
    const tooSoon = await call('POST', '/api/scores', { token: account.token, body: honest(WHOLE_DAY) });
    expect(tooSoon.status).toBe(429);
    expect(bodyOf(tooSoon)['error']).toBe('too-many-submissions');

    clock = at + 26_000;
    const allowed = await call('POST', '/api/scores', { token: account.token, body: honest(WHOLE_DAY) });
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201);
  }, 180_000);

  it('leaves a slice charging exactly what it charged before', async () => {
    // The other half, and the reason the factor is floored at one: every length at or under the
    // reference replay is unchanged, so nothing already shipping moved. `RUN` is 900 s.
    const account = await signIn();
    const truth = honest();
    const at = clock;
    expect((await call('POST', '/api/scores', { token: account.token, body: truth })).status).toBe(201);
    clock = at + 6_000;
    const second = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
  }, 120_000);
});

describe('posting a score', () => {
  it('is allowed by the session alone, because the session is proof of the address', async () => {
    // § D241 deleted `postingGate` with the password, and this is why that is not a weakening. The
    // gate existed because a password let somebody sign in *without* proving they could read the
    // address, so posting needed a second check. A magic link cannot: the session in hand was
    // issued by redeeming a token that was mailed to the address. Every signed-in account has
    // proved it, and a check that is true for everybody who can reach it is not a check.
    const account = await signIn();
    const posted = await call('POST', '/api/scores', { token: account.token, body: honest() });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  }, 60_000);

  it('rejects a forged score, and the honest one it was forged from is accepted', async () => {
    const account = await signIn();
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
    const account = await signIn();
    const truth = honest();
    const response = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(response.status).toBe(201);
    const entry = bodyOf(response)['entry'] as Record<string, unknown>;
    const measured = entry['measured'] as Record<string, number>;
    // Equal here because the claim was honest. What matters is the path: `verification.measured`
    // is what `recordEntry` is handed, so a claim can never be what ranks.
    expect(measured['awtS']).toBeCloseTo(truth.claimed.awtS, 9);
  }, 60_000);

  it('refuses a second submission inside the interval, and allows one after it', async () => {
    const account = await signIn();
    const truth = honest();
    // The clock is frozen across these two, so the second lands inside the interval. A verification
    // is a whole simulation, so a confirmed account submitting in a loop is a CPU denial of service
    // wearing a valid session.
    const at = clock;
    const first = await call('POST', '/api/scores', { token: account.token, body: truth });
    clock = at;
    const second = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(bodyOf(second)['error']).toBe('too-many-submissions');

    clock = at + 10_000;
    const third = await call('POST', '/api/scores', { token: account.token, body: truth });
    expect(third.status, JSON.stringify(third.body)).toBe(201);
  }, 60_000);

  it('needs a session at all', async () => {
    const response = await call('POST', '/api/scores', { body: honest() });
    expect(response.status).toBe(401);
  }, 60_000);

  it('refuses a malformed submission without simulating anything', async () => {
    const account = await signIn();
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
    const account = await signIn();
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
    const account = await signIn();
    const posted = await call('POST', '/api/scores', { token: account.token, body: honest() });
    const board_ = String(bodyOf(posted)['boardKey']);

    const board = await call('GET', '/api/board', { query: { board: board_, metric: 'wt95S' } });
    expect(board.status).toBe(200);
    expect(bodyOf(board)['metric']).toBe('wt95S');
    // § D106's rule, said where a client can read it rather than only in a docstring: the ranking
    // is one metric and the others sit beside it, never combined.
    expect(String(bodyOf(board)['note'])).toMatch(/never combined/u);
    expect((bodyOf(board)['entries'] as unknown[]).length).toBeGreaterThan(0);
  }, 60_000);

  it('refuses a metric that is not one of the four', async () => {
    const response = await call('GET', '/api/board', { query: { board: 'x', metric: 'energyKJ' } });
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('no-such-metric');
  });

  it('keeps a different arrival rate in the same log, told apart by what it measured', async () => {
    /*
     * **This case used to assert the defect.** It read *"puts a different arrival rate on a
     * different board"*, and that is § 12.1's forbidden key by name: the rate is a parameter a
     * player sets, so every rate minted its own leaderboard and everybody was first on theirs.
     *
     * The true half of § D214 § 4 survives and is what is asserted now — a run under heavier traffic
     * is not a better run at the same thing, so the two must not be *confused*. They are told apart
     * by `dataHash`, which is what that digest was always for. Where they are is the player's own
     * log, because neither is the day's fixture.
     */
    const account = await signIn();
    const first = await call('POST', '/api/scores', { token: account.token, body: honest() });
    const second = await call('POST', '/api/scores', {
      token: account.token,
      body: honest({ ...RUN, arrivalRatePctPop5min: 8 }),
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const dataHashOf = (response: ApiResponse): unknown =>
      (bodyOf(response)['entry'] as Record<string, unknown>)['dataHash'];
    expect(dataHashOf(first)).not.toBe(dataHashOf(second));
    expect(bodyOf(first)['boardKey']).toBe(bodyOf(second)['boardKey']);
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
 * Erasing an account
 * -------------------------------------------------------------------------- */

describe('deleting an account', () => {
  it('refuses a caller who is not signed in, and touches nothing while refusing', async () => {
    const bystander = await signIn();
    // No token at all, a token that was never issued, and a real token with one character added —
    // the third because a prefix comparison would accept it and a lookup will not.
    const refusals = [
      await call('DELETE', '/api/me'),
      await call('DELETE', '/api/me', { token: 'not-a-session-token' }),
      await call('DELETE', '/api/me', { token: `${bystander.token}x` }),
    ];
    for (const response of refusals) {
      expect(response.status, JSON.stringify(response.body)).toBe(401);
      expect(bodyOf(response)['error']).toBe('not-signed-in');
    }
    expect((await call('GET', '/api/me', { token: bystander.token })).status).toBe(200);
  });

  it('cannot be pointed at somebody else, however the request tries to name them', async () => {
    const victim = await signIn();
    /*
     * Every way a caller could name an account other than the one their session names. The route
     * reads none of them — the id comes off the session and from nowhere else — so this is not
     * three checks being exercised, it is three arguments that do not exist. A route that compared
     * a supplied id against the session's would pass this too, and would be one forgotten branch
     * away from not passing it; a route with nothing to compare cannot acquire that branch.
     *
     * A fresh attacker each time, because a successful deletion spends the caller's own account.
     */
    const attempts: readonly { body?: unknown; query?: Record<string, string> }[] = [
      { body: { userId: victim.id } },
      { body: { id: victim.id, email: victim.email } },
      { query: { userId: victim.id } },
    ];
    for (const attempt of attempts) {
      const attacker = await signIn();
      const response = await call('DELETE', '/api/me', { token: attacker.token, ...attempt });
      // 200 rather than 400: the request is well-formed and the field is simply never read.
      expect(response.status, JSON.stringify(attempt)).toBe(200);
      // The victim is untouched...
      expect((await call('GET', '/api/me', { token: victim.token })).status, JSON.stringify(attempt)).toBe(200);
      // ...and the caller's *own* account is gone, which is what stops a route that quietly did
      // nothing at all from passing the line above.
      expect((await call('GET', '/api/me', { token: attacker.token })).status, JSON.stringify(attempt)).toBe(401);
    }

    // And an id in the path is not a route. `DELETE /api/me/<id>` is spelled out because it is the
    // shape somebody would reach for when adding an admin deletion later, and it must not already
    // half-exist.
    const byPath = await call('DELETE', `/api/me/${victim.id}`, { token: (await signIn()).token });
    expect(byPath.status).toBe(404);
    expect((await call('GET', '/api/me', { token: victim.token })).status).toBe(200);
  });

  it('erases the account, its board entry and its session, observed through the API alone', async () => {
    const account = await signIn();
    const named = bodyOf(await call('GET', '/api/me', { token: account.token }))['user'] as Record<string, unknown>;
    const displayName = String(named['displayName']);

    // Its own board — a rate no other test posts at — so the assertions below are about this
    // account's row rather than about where it happened to rank among everybody else's.
    const posted = await call('POST', '/api/scores', {
      token: account.token,
      body: honest({ ...RUN, arrivalRatePctPop5min: 7 }),
    });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
    const boardKey = String(bodyOf(posted)['boardKey']);
    const before = await call('GET', '/api/board', { query: { board: boardKey, metric: 'awtS' } });
    expect(JSON.stringify(bodyOf(before)['entries'])).toContain(displayName);

    const deleted = await call('DELETE', '/api/me', { token: account.token });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);

    // The session is a row in one of the tables the cascade takes, so the token that authorised the
    // deletion is refused by the very next request.
    expect((await call('GET', '/api/me', { token: account.token })).status).toBe(401);
    // The board entry went with it. `store.test.ts` proves this against every child table the
    // schema declares; this is the same fact observed where a player would notice it.
    const after = await call('GET', '/api/board', { query: { board: boardKey, metric: 'awtS' } });
    expect(JSON.stringify(bodyOf(after)['entries'])).not.toContain(displayName);

    // And the row is gone rather than flagged: asking for a link at the same address again creates
    // a **new** account, which `createUser` could not do while the old one still held the address.
    await call('POST', '/api/auth/request-link', { body: { email: account.email } });
    const mail = await lastLink();
    expect(mail.to).toBe(account.email);
    const again = await call('POST', '/api/auth/redeem', { body: { token: mail.token } });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((bodyOf(again)['user'] as Record<string, unknown>)['id']).not.toBe(account.id);
  }, 60_000);

  it('answers 401 rather than 500 when it happens under a submission in flight', async () => {
    /*
     * The race `DELETE /api/me` made reachable, driven end to end. `store.test.ts` proves the store
     * raises `NoSuchUserError`; this proves the route turns it into an answer rather than into an
     * unhandled rejection through the `Api` interface `bootstrap` exports.
     *
     * Its own server, because `RacingSql` has to be underneath the store from the moment it opens
     * and the shared one is already running. Its own outbox for the same reason.
     */
    let raced: Server | undefined;
    let accountId = '';
    const sql = new RacingSql(
      new PgliteSql(),
      (text) => text.startsWith('INSERT INTO entries'),
      // Exactly the gap: the submission has authenticated, verified a whole simulation, and is
      // about to write. A player pressing delete during a verification lands precisely here.
      async () => {
        await raced?.store.deleteUser(accountId);
      },
    );
    const outbox = new OutboxMailer(join(scratch, 'raced-outbox.jsonl'));
    const app = await bootstrap({
      dataDir: DATA_DIR,
      sql,
      env: { ELEVATOR_SIM_SECRET: SECRET },
      publicOrigin: 'https://elevator.example',
      now: () => clock,
      mailer: outbox,
    });
    raced = app;

    const ask = async (method: string, path: string, options: { body?: unknown; token?: string } = {}) =>
      app.api({
        method,
        path,
        query: new Map(),
        body: options.body,
        token: options.token,
        clientIp: '198.51.100.251',
      });

    await ask('POST', '/api/auth/request-link', { body: { email: 'raced@example.test' } });
    const message = (await outbox.delivered()).at(-1);
    const link = /https:\/\/\S+/u.exec(message?.body ?? '')?.[0] ?? '';
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('sign-in') ?? '';
    const session = bodyOf(await ask('POST', '/api/auth/redeem', { body: { token } }));
    accountId = String((session['user'] as Record<string, unknown>)['id']);

    const response = await ask('POST', '/api/scores', {
      token: String(session['token']),
      body: honest(),
    });
    // Not a 500, and not a rejection. The caller stopped existing; nothing failed on the server.
    expect(response.status, JSON.stringify(response.body)).toBe(401);
    expect(bodyOf(response)['error']).toBe('not-signed-in');
    // And the detail says the run was not posted, because the other reading — posted, then erased —
    // is the one a player would assume and it is wrong.
    expect(String(bodyOf(response)['detail'])).toMatch(/nothing was posted/u);
    // PostgreSQL's own sentence must not reach a caller: it names the constraint and the table.
    expect(JSON.stringify(response.body)).not.toMatch(/foreign key|constraint|fkey/u);
    await app.close();
  }, 60_000);

  it('does not leave the deleted account holding a submission cooldown', async () => {
    /*
     * `deleteAccount` clears the account's entry in `nextSubmitMs`, which is an identifier of a
     * deleted account sitting in this process's memory until a restart. Replacing that line with a
     * no-op left all 265 tests green, so it was argued for at length in a docstring and pinned by
     * nothing.
     *
     * **The state this builds cannot occur in production, and that is stated rather than hidden.**
     * Account ids are `randomUUID()` and are never reused, so nothing a player can do reaches a
     * second account with a first account's id — which is exactly why the leak is invisible from
     * outside and why observing it needs raw SQL. What the test pins is the property the line
     * exists for: *a deleted id carries no cooldown forward*. Forging id reuse is the only seam
     * through which that is observable at all, and the alternative — exposing the closure's map so
     * a test could read it — would be production surface added for a test's benefit.
     *
     * The clock is frozen throughout, in the shape the cooldown test above uses: `call` advances it
     * ten seconds and `MIN_SUBMIT_INTERVAL_MS` is five, so without freezing the interval would have
     * lapsed on its own and the test would pass whatever the line did.
     */
    const account = await signIn();
    const at = clock;

    const posted = await call('POST', '/api/scores', { token: account.token, body: honest() });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
    clock = at;

    expect((await call('DELETE', '/api/me', { token: account.token })).status).toBe(200);
    clock = at;

    // The forged half: the same id, a fresh row. Straight to the database, because `createUser`
    // mints its own id and no route can be asked for a particular one.
    await storeSql.query(
      'INSERT INTO users (id, email, display_name, display_name_chosen, created_at_ms) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      [account.id, 'reborn@example.test', 'Reborn', true, at],
    );
    await server.store.createSession('reborn-session-token', account.id);
    clock = at;

    const again = await call('POST', '/api/scores', {
      token: 'reborn-session-token',
      body: honest(),
    });
    // 429 here would mean the deleted account's cooldown outlived it. Inside the interval, on a
    // frozen clock, so nothing but the clearing line can produce a 201.
    expect(again.status, JSON.stringify(again.body)).toBe(201);
  }, 120_000);

  it('says what it removed, and does not claim anything about the other store', async () => {
    const account = await signIn();
    const detail = String(bodyOf(await call('DELETE', '/api/me', { token: account.token }))['detail']);
    // The player is told what goes, because a board entry disappearing is not obviously part of
    // "delete my account" until somebody says so.
    for (const named of [/address/iu, /board/iu, /session/iu, /sign-in link/iu]) {
      expect(detail, String(named)).toMatch(named);
    }
    // `docs/26` § 3.3: telemetry is a second store reached by a second request holding a different
    // key, and the server never holds the join. A response that spoke for it would be claiming a
    // relationship this design exists not to have — and there is no telemetry in this tree to
    // speak for anyway.
    expect(detail).not.toMatch(/telemetry|analytics|everything we hold|all your data/iu);
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
        sql: new PgliteSql(),
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
        sql: new PgliteSql(),
        env: { ELEVATOR_SIM_SECRET: SECRET, NODE_ENV: 'production' },
        publicOrigin: 'https://elevator.example',
        mailer: new OutboxMailer(join(scratch, 'production.jsonl')),
      }),
    ).rejects.toThrow(UnsafeConfigurationError);
  }, 120_000);

  it('starts in production when the environment configures a real mailer', async () => {
    // The other half of the refusal above, and the half that was missing. Until `AcsMailer`
    // existed, the outbox driver was the only `Mailer` in the tree, so the refusal was not a gate
    // a correct configuration could pass — it was unsatisfiable, and this server could not boot in
    // production at all. A test that only asserted the refusal fires stayed green throughout.
    //
    // Nothing here reaches Azure: the endpoint is never dialled, because `bootstrap` only has to
    // choose a mailer, not use one.
    const server = await bootstrap({
      dataDir: DATA_DIR,
      sql: new PgliteSql(),
      env: {
        ELEVATOR_SIM_SECRET: SECRET,
        NODE_ENV: 'production',
        ELEVATOR_SIM_ACS_ENDPOINT: 'https://example.communication.azure.com',
        ELEVATOR_SIM_MAIL_FROM: 'DoNotReply@example.azurecomm.net',
      },
      publicOrigin: 'https://elevator.example',
    });
    expect(server.mailer).not.toBeInstanceOf(OutboxMailer);
    await server.close();
  }, 120_000);
});

/* -------------------------------------------------------------------------- *
 * The wake call
 * -------------------------------------------------------------------------- */

describe('GET /api/wake', () => {
  /*
   * The whole point of this route is that it costs nothing, so the tests are about what it does
   * *not* do. It exists because the app runs at `minReplicas: 0` and a sleeping container answered
   * in 32.2 s against 0.13 s warm — a wake fired on intent turns that into a background wait.
   */
  it('answers without touching the store', async () => {
    const response = await call('GET', '/api/wake');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ awake: true });
  });

  it('needs no session, and is not a health check', async () => {
    // No token, and no arm that can fail: a caller that could branch on this would have made the
    // wake a dependency, and a database outage would then read as a server that is merely asleep.
    const anonymous = await call('GET', '/api/wake');
    const withToken = await call('GET', '/api/wake', { token: 'not-a-real-session' });
    expect(anonymous.status).toBe(200);
    expect(withToken.status).toBe(200);
  });

  it('is not rate limited, because a wake that refuses has defeated itself', async () => {
    const caller = '203.0.113.77';
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect((await call('GET', '/api/wake', { ip: caller })).status).toBe(200);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The other races a delete route made reachable (#266)
 * -------------------------------------------------------------------------- */

/**
 * A whole server with one statement chosen to have something else happen inside it.
 *
 * The submission race above builds this inline; four more routes need it, and a concurrency harness
 * written five times is a harness that drifts. Its own server and its own outbox, because
 * `RacingSql` has to be underneath the store from the moment it opens and the shared one is already
 * running. **Armed by hand**, because the setup's own writes would otherwise spend the one shot on
 * building the fixture.
 */
async function racedServer(options: {
  readonly fires: (text: string) => boolean;
  readonly race: (app: Server) => Promise<void>;
}): Promise<{
  readonly app: Server;
  readonly ask: (method: string, path: string, options?: { body?: unknown; token?: string }) => Promise<ApiResponse>;
  readonly linkFor: (email: string) => Promise<string>;
  readonly signInAs: (email: string) => Promise<{ token: string; id: string }>;
  /** The token in the last message this server's own outbox holds, whoever asked for it. */
  readonly lastToken: () => Promise<string>;
  readonly arm: () => void;
}> {
  let armed = false;
  let app: Server | undefined;
  const sql = new RacingSql(
    new PgliteSql(),
    (text) => armed && options.fires(text),
    async () => {
      if (app !== undefined) await options.race(app);
    },
  );
  const box = new OutboxMailer(join(scratch, `raced-${String((racedServers += 1))}.jsonl`));
  app = await bootstrap({
    dataDir: DATA_DIR,
    sql,
    env: { ELEVATOR_SIM_SECRET: SECRET },
    publicOrigin: 'https://elevator.example',
    now: () => clock,
    mailer: box,
  });
  // Each of these is a whole in-process PostgreSQL. Registered here rather than left to a trailing
  // `close()` in the test body, because a failing assertion skips the trailing call and the
  // instance outlives the run — which is the shape of the flake the #254 lane saw once and could
  // not reproduce.
  onTestFinished(async () => (app as Server).close());
  const ask = async (
    method: string,
    path: string,
    request: { body?: unknown; token?: string } = {},
  ): Promise<ApiResponse> =>
    (app as Server).api({
      method,
      path,
      query: new Map(),
      body: request.body,
      token: request.token,
      clientIp: '198.51.100.252',
    });
  const lastToken = async (): Promise<string> => {
    const message = (await box.delivered()).at(-1);
    const href = /https:\/\/\S+/u.exec(message?.body ?? '')?.[0] ?? '';
    return new URLSearchParams(new URL(href).hash.slice(1)).get('sign-in') ?? '';
  };
  const linkFor = async (email: string): Promise<string> => {
    const asked = await ask('POST', '/api/auth/request-link', { body: { email } });
    expect(asked.status, JSON.stringify(asked.body)).toBe(202);
    return lastToken();
  };
  return {
    app,
    ask,
    linkFor,
    lastToken,
    signInAs: async (email) => {
      const redeemed = await ask('POST', '/api/auth/redeem', { body: { token: await linkFor(email) } });
      expect(redeemed.status, JSON.stringify(redeemed.body)).toBe(200);
      const body = bodyOf(redeemed);
      return { token: String(body['token']), id: String((body['user'] as Record<string, unknown>)['id']) };
    },
    arm: () => {
      armed = true;
    },
  };
}

let racedServers = 0;

describe('an account deleted underneath a request that is not a submission', () => {
  it('still mails a working link when the account goes away mid-request', async () => {
    /*
     * `requestLink` reads or creates the account and then writes the login token, and § D241 makes
     * that the *only* door into the product. A deletion in that gap answered `500` — on the one
     * route in this API whose whole design is a response that says nothing about the address.
     *
     * The honest answer is the uniform 202 and a link that works, because per § D241 asking for a
     * link on an address with no account is what *creates* one. So the route starts the account
     * again rather than apologising, and the assertion is that the mailed link redeems — a 202 on
     * its own would be the same lie in a nicer status code.
     */
    let id = '';
    const raced = await racedServer({
      fires: (text) => text.startsWith('INSERT INTO login_tokens'),
      race: async (app) => app.store.deleteUser(id),
    });
    id = (await raced.signInAs('vanishing@example.test')).id;
    raced.arm();

    const response = await raced.ask('POST', '/api/auth/request-link', {
      body: { email: 'vanishing@example.test' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(202);
    expect(JSON.stringify(response.body)).not.toMatch(/foreign key|constraint|fkey/u);

    const redeemed = await raced.ask('POST', '/api/auth/redeem', {
      body: { token: await raced.lastToken() },
    });
    expect(redeemed.status, JSON.stringify(redeemed.body)).toBe(200);
    // A new account, because the old one is gone: the link the player was promised is a link to
    // something that exists.
    expect(String((bodyOf(redeemed)['user'] as Record<string, unknown>)['id'])).not.toBe(id);
  }, 60_000);

  it('calls a link whose account is gone invalid, rather than already used', async () => {
    /*
     * `consumeLoginToken`'s `rowCount` is its answer, and the cascade changes what `false` *means*:
     * the row can be gone because the link was spent or because `login_tokens` went with the
     * account. Calling the second "already used" is a true-sounding sentence about something that
     * did not happen — and it sends the player to ask for another link, which will work, which is
     * how they learn nothing about what occurred.
     */
    let id = '';
    const raced = await racedServer({
      fires: (text) => text.startsWith('DELETE FROM login_tokens WHERE jti'),
      race: async (app) => app.store.deleteUser(id),
    });
    id = (await raced.signInAs('cascaded@example.test')).id;
    const second = await raced.linkFor('cascaded@example.test');
    raced.arm();

    const response = await raced.ask('POST', '/api/auth/redeem', { body: { token: second } });
    expect(response.status).toBe(400);
    expect(bodyOf(response)['error']).toBe('link-invalid');
  }, 60_000);

  it('answers a link whose account vanishes at the session write as an invalid link', async () => {
    /*
     * The worst moment in the flow: the link is already spent by the time `createSession` runs, so
     * an unexplained `500` costs the player the link as well as the session.
     */
    let id = '';
    const raced = await racedServer({
      fires: (text) => text.startsWith('INSERT INTO sessions'),
      race: async (app) => app.store.deleteUser(id),
    });
    id = (await raced.signInAs('vanish-at-session@example.test')).id;
    const second = await raced.linkFor('vanish-at-session@example.test');
    raced.arm();

    const response = await raced.ask('POST', '/api/auth/redeem', { body: { token: second } });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(bodyOf(response)['error']).toBe('link-invalid');
    expect(JSON.stringify(response.body)).not.toMatch(/foreign key|constraint|fkey/u);
  }, 60_000);
});

describe('two players reaching for the same name at the same moment', () => {
  it('answers the loser 409 name-taken rather than 500', async () => {
    /*
     * Both pre-checks pass and the unique index refuses the second write. `name-taken` is already
     * in `setDisplayName`'s return type and already has a 409 on this route; what was missing was
     * the constraint path reaching it.
     *
     * Driven through `RacingSql` rather than through two overlapping requests, for the reason
     * `racingSql.test-helper.ts` gives: putting the competing rename exactly in the gap is
     * deterministic, and a sleep-and-hope version of this would be the flakiest test in the suite.
     */
    let other = '';
    const wanted = 'Contested';
    const raced = await racedServer({
      fires: (text) => text.startsWith('UPDATE users'),
      race: async (app) => {
        await app.store.setDisplayName(other, wanted);
      },
    });
    const ada = await raced.signInAs('ada-renames@example.test');
    other = (await raced.signInAs('bo-renames@example.test')).id;
    raced.arm();

    const response = await raced.ask('POST', '/api/me/display-name', {
      token: ada.token,
      body: { displayName: wanted },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(bodyOf(response)['error']).toBe('name-taken');
    expect(JSON.stringify(response.body)).not.toMatch(/duplicate key|constraint|users_display_name/u);
  }, 60_000);
});
