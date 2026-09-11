/// <reference types="node" />

/**
 * **Every body the rush-sitting gate accepts fits the transport, and an oversized body is told so** —
 * PR #513's review, finding 3.
 *
 * `serve.ts` capped every request body at 64 KiB and answered anything larger `400 bad-request`, while
 * `leaderboard/rushSitting.ts#rushSittingIssues` accepted sittings of well over a megabyte — and, worse,
 * had no maximum at all: a `$comment` on a rule row, a `toProfileId` of any length, or a key nobody
 * reads on an intervention passed it untouched, so no transport cap could have been sized from it. A
 * legal twelve-round sitting of twenty dispatcher switches with four rule rows each is about 110 KiB,
 * and the transport refused it before the gate ever saw it.
 *
 * So these cases hold three things together. The gate has a maximum, and **the largest sitting it
 * accepts is built here from the gate's own bounds**, each one probed from both sides rather than
 * copied from a constant; that sitting, posted whole, reaches the API; and the cap on its route is
 * sized from it rather than padded, with both edges driven and a `413` carrying a name on the far one.
 * Every other route keeps its 64 KiB, and its far edge answers `413` too.
 */

import { readFileSync } from 'node:fs';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RULE_ACTION_WORDS, RULE_CONDITION_WORDS, parseRushPurse } from '@elevator-sim/core';

import * as sitting from '../leaderboard/rushSitting.js';
import type { Api } from './api.js';
import * as transport from './serve.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
const purse = parseRushPurse(JSON.parse(readFileSync(join(DATA_DIR, 'rush-purse.json'), 'utf8')) as unknown);

/* -------------------------------------------------------------------------- *
 * The largest sitting the gate accepts
 * -------------------------------------------------------------------------- */

type Words = Readonly<Record<string, { readonly values?: readonly { readonly value: number | string }[] | undefined }>>;

/** The longest `{ id, value }` a vocabulary table admits, as JSON — ids with no values carry none. */
function longestWord(words: Words): { readonly id: string; readonly value: number | string | undefined } {
  let best: { id: string; value: number | string | undefined; size: number } = { id: '', value: undefined, size: -1 };
  for (const [id, word] of Object.entries(words)) {
    for (const value of word.values === undefined ? [undefined] : word.values.map((option) => option.value)) {
      const size = JSON.stringify({ id, value }).length;
      if (size > best.size) best = { id, value, size };
    }
  }
  return best;
}

const WHEN = longestWord(RULE_CONDITION_WORDS as unknown as Words);
const THEN = longestWord(RULE_ACTION_WORDS as unknown as Words);
const ROW = Object.freeze({
  when: WHEN.id,
  ...(WHEN.value === undefined ? {} : { whenValue: WHEN.value }),
  then: THEN.id,
  ...(THEN.value === undefined ? {} : { thenValue: THEN.value }),
});
/** The longest a finite, non-negative number serialises: `1.7976931348623157e+308`. */
const NUMBER = Number.MAX_VALUE;
const ID = 'x'.repeat(64);
const SINK = [...purse.topUpSinkIds].sort((a, b) => b.length - a.length)[0] ?? '';

interface Bounds {
  readonly rounds: number;
  readonly rows: number;
  readonly interventions: number;
  readonly switchRows: number;
  readonly modifiers: number;
  readonly idLength: number;
}

const MAX: Bounds = Object.freeze({ rounds: 12, rows: 16, interventions: 64, switchRows: 16, modifiers: 16, idLength: 64 });

function sittingOf(bounds: Bounds): Record<string, unknown> {
  const id = 'x'.repeat(bounds.idLength);
  const rows = (count: number): readonly object[] => Array.from({ length: count }, () => ROW);
  const round = {
    dispatcherProfileId: id,
    ruleRows: rows(bounds.rows),
    interventions: Array.from({ length: bounds.interventions }, () => ({
      atS: NUMBER,
      change: { kind: 'switch-dispatcher', toProfileId: id, ruleRows: rows(bounds.switchRows) },
    })),
    claimedHeldS: NUMBER,
  };
  return {
    buildingId: id,
    rounds: Array.from({ length: bounds.rounds }, () => round),
    modifiers: Array.from({ length: bounds.modifiers }, () => ({ sinkId: SINK, steps: NUMBER })),
  };
}

const WORST = sittingOf(MAX);
const WORST_BYTES = Buffer.byteLength(JSON.stringify(WORST));

/* -------------------------------------------------------------------------- *
 * A transport with an API that answers anything it is handed
 * -------------------------------------------------------------------------- */

const ECHO: Api = (incoming) => Promise.resolve({ status: 200, body: { reached: incoming.path } });

let running: Server | undefined;

afterEach(async () => {
  const server = running;
  running = undefined;
  if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function listening(): Promise<number> {
  const server = transport.serve({ api: ECHO, port: 0, allowOrigin: 'null' });
  running = server;
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  return (server.address() as AddressInfo).port;
}

async function post(port: number, path: string, body: Buffer): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    let answered = false;
    const call = httpRequest(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': body.length } },
      (response) => {
        answered = true;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: response.statusCode ?? 0, body: (text.length === 0 ? {} : JSON.parse(text)) as Record<string, unknown> });
        });
      },
    );
    // A server that refuses mid-body may close before the last byte is written; the answer is what counts.
    call.on('error', (error) => {
      if (!answered) reject(error);
    });
    call.end(body);
  });
}

/** `json` padded with trailing spaces — still one JSON value — to exactly `bytes`. */
function paddedTo(json: string, bytes: number): Buffer {
  const size = Buffer.byteLength(json);
  if (size > bytes) throw new Error(`the body is already ${String(size)} bytes, over ${String(bytes)}`);
  return Buffer.from(json + ' '.repeat(bytes - size));
}

/* -------------------------------------------------------------------------- *
 * The cases
 * -------------------------------------------------------------------------- */

describe('the rush-sitting gate has a maximum — PR #513, finding 3', () => {
  it('accepts the sitting built from its own bounds, and refuses one more on every bound', () => {
    expect(sitting.rushSittingIssues(WORST, purse)).toEqual([]);
    const over: readonly (readonly [string, Partial<Bounds>])[] = [
      ['a thirteenth round', { rounds: MAX.rounds + 1 }],
      ['a seventeenth rule row', { rows: MAX.rows + 1 }],
      ['a sixty-fifth intervention', { interventions: MAX.interventions + 1 }],
      ['a seventeenth rule row on a switch', { switchRows: MAX.switchRows + 1 }],
      ['a seventeenth modifier', { modifiers: MAX.modifiers + 1 }],
      ['an id of sixty-five characters, on the building, the dispatcher and the switch', { idLength: MAX.idLength + 1 }],
    ];
    for (const [label, bound] of over) {
      const issues = sitting.rushSittingIssues(sittingOf({ ...MAX, ...bound, rounds: bound.rounds ?? 1 }), purse);
      expect(issues.length, `${label} passed the gate`).toBeGreaterThan(0);
    }
    // The switch's own id, alone — the building and dispatcher ids above would refuse the sitting without it.
    const longSwitch = { buildingId: 'garden-apartments', rounds: [{ dispatcherProfileId: 'collective', claimedHeldS: 1, interventions: [{ atS: 1, change: { kind: 'switch-dispatcher', toProfileId: 'y'.repeat(65) } }] }] };
    expect(sitting.rushSittingIssues(longSwitch, purse).join(' ')).toMatch(/toProfileId/u);
  });

  it('refuses every string and key a sitting could carry that nothing reads, so the maximum is a maximum', () => {
    const base = { buildingId: 'garden-apartments', rounds: [{ dispatcherProfileId: 'collective', claimedHeldS: 1 }] };
    const cases: readonly (readonly [string, unknown])[] = [
      ['a comment on a rule row', { ...base, rounds: [{ ...base.rounds[0], ruleRows: [{ ...ROW, $comment: 'z'.repeat(100_000) }] }] }],
      ['a comment on a switch’s rule row', { ...base, rounds: [{ ...base.rounds[0], interventions: [{ atS: 1, change: { kind: 'switch-dispatcher', toProfileId: 'nearest-car', ruleRows: [{ ...ROW, $comment: 'z' }] } }] }] }],
      ['a key nobody reads on an intervention', { ...base, rounds: [{ ...base.rounds[0], interventions: [{ atS: 1, note: 'z', change: { kind: 'park-cars-lobby' } }] }] }],
      ['a key nobody reads on a change', { ...base, rounds: [{ ...base.rounds[0], interventions: [{ atS: 1, change: { kind: 'park-cars-lobby', note: 'z' } }] }] }],
      ['a key nobody reads on a modifier', { ...base, modifiers: [{ sinkId: SINK, steps: 1, note: 'z' }] }],
    ];
    for (const [label, body] of cases) {
      expect(sitting.rushSittingIssues(body, purse).length, `${label} passed the gate`).toBeGreaterThan(0);
    }
  });
});

describe('the transport carries every sitting the gate accepts — PR #513, finding 3', () => {
  it('sizes the sitting route’s cap from the gate’s largest body, rather than padding it', () => {
    const cap = (sitting as Record<string, unknown>)['MAX_RUSH_SITTING_BODY_BYTES'];
    expect(cap, 'rushSitting.ts exports the sitting route’s cap').toBeTypeOf('number');
    expect(WORST_BYTES).toBeLessThanOrEqual(cap as number);
    expect(WORST_BYTES, 'the cap is more than a quarter above the largest legal sitting').toBeGreaterThan((cap as number) * 0.8);
  });

  it('carries the largest legal sitting, posted whole, to the API', async () => {
    const port = await listening();
    const answer = await post(port, '/api/rush-sittings', Buffer.from(JSON.stringify(WORST)));
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body['reached']).toBe('/api/rush-sittings');
  });

  it('reads a sitting body of exactly the cap, and answers one byte more with 413 and a name', async () => {
    const cap = (sitting as Record<string, unknown>)['MAX_RUSH_SITTING_BODY_BYTES'] as number;
    expect(cap).toBeTypeOf('number');
    const port = await listening();
    const at = await post(port, '/api/rush-sittings', paddedTo(JSON.stringify(WORST), cap));
    expect(at.status, JSON.stringify(at.body)).toBe(200);
    const over = await post(port, '/api/rush-sittings', paddedTo(JSON.stringify(WORST), cap + 1));
    expect(over.status).toBe(413);
    expect(over.body['error']).toBe('body-too-large');
  });

  it('keeps every other route at 64 KiB, and answers its far edge with 413 as well', async () => {
    const cap = transport.MAX_BODY_BYTES;
    expect(cap).toBe(64 * 1024);
    const port = await listening();
    const at = await post(port, '/api/scores', paddedTo('{}', cap));
    expect(at.status, JSON.stringify(at.body)).toBe(200);
    const over = await post(port, '/api/scores', paddedTo('{}', cap + 1));
    expect(over.status).toBe(413);
    expect(over.body['error']).toBe('body-too-large');
    // The sitting route's allowance is the sitting route's: a sitting-sized body elsewhere is still refused.
    const elsewhere = await post(port, '/api/scores', Buffer.from(JSON.stringify(WORST)));
    expect(elsewhere.status).toBe(413);
  });
});
