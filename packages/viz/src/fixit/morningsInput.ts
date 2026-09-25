/**
 * **What a case's forty-nine as-built mornings are a function of, and a digest of it** —
 * [§ D1120](../../../../DECISIONS.md) clause 4.
 *
 * The as-built readings ship as a derived artifact, `data/fixit-as-built-mornings.json`, so a press
 * is never cold. A shipped figure has to say what it was derived from, or it goes stale silently —
 * `CLAUDE.md`'s *"pin it to the run that produced it"*. So each case's row carries the digest of
 * **every input its readings depend on**: the as-built `SimulationConfig` the forty-nine mornings are
 * run from (the building, the dispatcher, the demand, the duration, every patch the case applies),
 * the derived seeds, the complaint's measure and the run switches. The always-on suite recomputes
 * the digest from the shipped data and fails when it moves; the deep tier re-runs the mornings and
 * fails when a reading moves. The first catches a data edit in a second; the second catches a change
 * to `core` itself, which no input digest can see.
 *
 * ## Why this is its own module
 *
 * `fixit/asBuiltMornings.ts` imports the JSON at load, and a regeneration has to be able to start
 * from a tree where that file is missing or malformed — `everyday/rushHouse.ts`'s reason for the same
 * split. This module reads no data file.
 *
 * ## The canonical form
 *
 * Keys sorted, `undefined` dropped, a `bigint` written as its decimal text, a non-finite number as its
 * name. **A `Map` is written as its size and no more**: the only maps a resolved config carries are
 * `floorsById` and `floorsByIndex`, indexes derived from the `floors` array beside them, and writing
 * their entries would hash the same floors three times. A function is dropped. The digest is a
 * 128-bit FNV-1a over the canonical text's UTF-16 code units — not cryptographic, and not used as
 * one: nothing here defends against a forged file, only against a stale one.
 */

import type { SimulationConfig } from '@elevator-sim/core/browser';

import { FIXIT_MORNINGS, MORNING_SEED_STEP, replicationSeedsOf } from './judge.js';
import { FIXIT_RUN_SWITCHES } from './run.js';
import type { FixitCase } from './types.js';

/** Bumped when the canonical form itself changes, so an old digest cannot match by accident. */
export const MORNINGS_INPUT_VERSION = 1;

function canonical(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return 'null';
  if (value instanceof Map) return `{"$map":${String(value.size)}}`;
  if (value instanceof Set) return `{"$set":${String(value.size)}}`;
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined && typeof entry !== 'function')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

function avalanche(lane: number): number {
  let h = lane >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function digest128(text: string): string {
  const primes = [0x01000193, 0x85ebca77, 0xc2b2ae3d, 0x27d4eb2f] as const;
  let h0 = 0x811c9dc5;
  let h1 = 0x9dc5811c;
  let h2 = 0xcbf29ce4;
  let h3 = 0x84222325;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h0 = Math.imul(h0 ^ code, primes[0]);
    h1 = Math.imul(h1 ^ code, primes[1]);
    h2 = Math.imul(h2 ^ code, primes[2]);
    h3 = Math.imul(h3 ^ code, primes[3]);
  }
  h0 ^= text.length;
  h1 ^= text.length;
  h2 ^= text.length;
  h3 ^= text.length;
  return [h0, h1, h2, h3].map((lane) => avalanche(lane).toString(16).padStart(8, '0')).join('');
}

/**
 * The canonical text of everything a case's as-built mornings depend on. `asBuilt` is
 * `fixit/run.ts#fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt` — the config both
 * surfaces hand the judge. Its own seed is the letter's, which the mornings replace, so it is left
 * out and the derived seeds stand in for it.
 */
export function morningsInputOf(entry: FixitCase, asBuilt: SimulationConfig): string {
  const { seed: _letter, ...config } = asBuilt;
  return canonical({
    version: MORNINGS_INPUT_VERSION,
    mornings: FIXIT_MORNINGS,
    step: MORNING_SEED_STEP,
    seeds: replicationSeedsOf(entry),
    measure: entry.complaint.measure,
    switches: FIXIT_RUN_SWITCHES,
    config,
  });
}

/** The digest a shipped row carries — 32 hex characters. */
export function morningsInputHashOf(entry: FixitCase, asBuilt: SimulationConfig): string {
  return digest128(morningsInputOf(entry, asBuilt));
}
