/// <reference types="node" />

/**
 * **A posted rush sitting replays off the request thread, under one global limit** — PR #513's review,
 * finding 2.
 *
 * `api.ts#submitRushSitting` ran `replayRushSitting` inline, and the server has one thread: the review
 * measured an honest twelve-round sitting on the Burj-class reference under nearest-car holding it for
 * **21 537 ms**, during which every other request — a sign-in, a board read, `/api/wake` — waited. The
 * per-account cooldown bounds how often *one* account can do that, not how many accounts do it at once.
 *
 * Both cases here go through the path a client takes — `bootstrap` over a real socket — and neither
 * names the mechanism, so they read the same against the inline replay and against the fix. The first
 * **measures** rather than assumes: a timer set before a long sitting is posted is due at a known
 * moment, and a cheap request sent then has to be answered within a bound, while the sitting is still
 * being replayed. The second holds the limit to one replay at a time
 * (`ELEVATOR_SIM_RUSH_REPLAYS=1`) and requires the next sitting to be refused rather than queued behind
 * it — with the answer a client can act on, and without the refusal costing the player their cooldown.
 */

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootstrap, type Server } from '../bootstrap.js';
import { OutboxMailer } from '../mail/mailer.js';
import { PgliteSql } from '../store/pglite.test-helper.js';
import { serve } from './serve.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const SECRET = 'a'.repeat(48);

/** Midtown Office under collective, as the server replays it — the agreement table's own cell. */
const MIDTOWN_HELD_S = (
  JSON.parse(readFileSync(new URL('../leaderboard/rushHoldAgreement.json', import.meta.url), 'utf8')) as {
    readonly cells: readonly { readonly buildingId: string; readonly dispatcherProfileId: string; readonly interventions?: unknown; readonly heldS: number | null }[];
  }
).cells.find((cell) => cell.buildingId === 'midtown-office' && cell.dispatcherProfileId === 'collective' && cell.interventions === undefined)?.heldS;

/** How late a cheap request may be answered while a replay runs. A replay of the sittings below is seconds. */
const PROMPT_MS = 750;

let server: Server;
let http: HttpServer;
let port: number;
let outbox: OutboxMailer;
let scratch: string;
let accounts = 0;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'elevator-replay-'));
  outbox = new OutboxMailer(join(scratch, 'outbox.jsonl'));
  server = await bootstrap({
    dataDir: DATA_DIR,
    sql: new PgliteSql(),
    env: { ELEVATOR_SIM_SECRET: SECRET, ELEVATOR_SIM_RUSH_REPLAYS: '1' },
    publicOrigin: 'https://elevator.example',
    now: () => 1_770_000_000_000,
    mailer: outbox,
  });
  http = serve({ api: server.api, port: 0, allowOrigin: 'null' });
  if (!http.listening) await new Promise<void>((resolve) => http.once('listening', resolve));
  port = (http.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()));
  await server.close();
  await rm(scratch, { recursive: true, force: true });
});

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Record<string, unknown>;
}

function ask(method: string, path: string, options: { readonly body?: unknown; readonly token?: string } = {}): Promise<Answer> {
  const payload = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body));
  return new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': payload.length }),
          ...(options.token === undefined ? {} : { authorization: `Bearer ${options.token}` }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode ?? 0, headers: response.headers, body: (text.length === 0 ? {} : JSON.parse(text)) as Record<string, unknown> });
        });
      },
    );
    call.on('error', reject);
    call.end(payload);
  });
}

async function signIn(): Promise<string> {
  accounts += 1;
  const email = `replay${String(accounts)}@example.test`;
  const asked = await ask('POST', '/api/auth/request-link', { body: { email } });
  expect(asked.status, JSON.stringify(asked.body)).toBe(202);
  const message = (await outbox.delivered()).at(-1);
  const url = /https:\/\/\S+/u.exec(message?.body ?? '')?.[0] ?? '';
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get('sign-in') ?? '';
  const redeemed = await ask('POST', '/api/auth/redeem', { body: { token } });
  expect(redeemed.status, JSON.stringify(redeemed.body)).toBe(200);
  return String(redeemed.body['token']);
}

function sittingOf(rounds: number): Record<string, unknown> {
  if (MIDTOWN_HELD_S === undefined || MIDTOWN_HELD_S === null) throw new Error('the agreement table has no Midtown Office collective cell');
  return {
    buildingId: 'midtown-office',
    rounds: Array.from({ length: rounds }, () => ({ dispatcherProfileId: 'collective', claimedHeldS: MIDTOWN_HELD_S })),
  };
}

describe('a posted rush sitting replays off the request thread — PR #513, finding 2', () => {
  it('answers a cheap request promptly while a long sitting is being replayed — measured', async () => {
    const token = await signIn();
    let settledAt = Number.POSITIVE_INFINITY;
    const posting = ask('POST', '/api/rush-sittings', { token, body: sittingOf(4) }).then((answer) => {
      settledAt = performance.now();
      return answer;
    });
    const dueAt = performance.now() + 400;
    await sleep(400);
    const woke = await ask('GET', '/api/wake');
    const wokeAt = performance.now();
    const posted = await posting;
    process.stderr.write(
      `replay off thread: /api/wake answered ${(wokeAt - dueAt).toFixed(0)} ms after it was due; ` +
        `the four-round sitting settled ${(settledAt - wokeAt).toFixed(0)} ms after that\n`,
    );
    expect(woke.status).toBe(200);
    expect(settledAt, 'the sitting settled before the wake was answered — the cheap request waited for the replay').toBeGreaterThan(wokeAt);
    expect(wokeAt - dueAt, `the cheap request was answered more than ${String(PROMPT_MS)} ms late`).toBeLessThan(PROMPT_MS);
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
  });

  it('refuses the next sitting while the limit is reached — 503 with Retry-After, and no cooldown charged', async () => {
    const first = await signIn();
    const second = await signIn();
    const running = ask('POST', '/api/rush-sittings', { token: first, body: sittingOf(4) });
    await sleep(400);
    const refused = await ask('POST', '/api/rush-sittings', { token: second, body: sittingOf(1) });
    expect(refused.status, JSON.stringify(refused.body)).toBe(503);
    expect(refused.body['error']).toBe('replay-busy');
    const retryAfter = Number(refused.headers['retry-after']);
    expect(Number.isInteger(retryAfter) && retryAfter >= 1, `Retry-After was ${String(refused.headers['retry-after'])}`).toBe(true);
    expect((await running).status).toBe(201);
    // Refused for the server's capacity rather than the player's pace, so it cost them nothing.
    const again = await ask('POST', '/api/rush-sittings', { token: second, body: sittingOf(1) });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
  });
});
