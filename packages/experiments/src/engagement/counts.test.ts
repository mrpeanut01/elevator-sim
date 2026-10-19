/**
 * The shared pieces: `k of n` is printed with its interval and never as a bare rate, a paired
 * comparison reads its verdict off the interval alone, and one refused replication suppresses an
 * arm's AWT and WT95.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig, type SimulationResult } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { PlaySessions } from '../fuzz/play.js';
import { playContextFor } from '../fuzz/verbs.js';
import { DATA_DIR } from '../validation/harness.js';
import { formatKOfN, pairedComparison, waitFiguresOf } from './counts.js';

describe('k of n', () => {
  it('prints the count, the denominator and the Wilson interval, and says when there was nothing to judge', () => {
    expect(formatKOfN({ k: 1, n: 50 })).toBe('1 of 50 [0.004, 0.105]');
    expect(formatKOfN({ k: 0, n: 0 })).toBe('0 of 0 (nothing to judge)');
  });
});

describe('a paired comparison', () => {
  const ones = Array.from({ length: 50 }, () => 1);
  const zeros = Array.from({ length: 50 }, () => 0);
  const mixed = Array.from({ length: 50 }, (_, index) => (index % 2 === 0 ? 1 : 0));

  it('reads HIGHER, LOWER and INDISTINGUISHABLE off the interval on the differences', () => {
    expect(pairedComparison(ones, mixed).verdict).toBe('HIGHER');
    expect(pairedComparison(zeros, mixed).verdict).toBe('LOWER');
    expect(pairedComparison(mixed, [...mixed.slice(1), mixed[0] as number]).verdict).toBe('INDISTINGUISHABLE');
  });

  it('calls exact ties identical, and refuses a verdict below the floor it is given', () => {
    expect(pairedComparison(mixed, mixed)).toMatchObject({ verdict: 'INDISTINGUISHABLE', identical: true });
    expect(pairedComparison(ones.slice(0, 49), mixed.slice(0, 49))).toMatchObject({ verdict: 'SUPPRESSED', pairs: 49 });
    expect(pairedComparison(ones.slice(0, 49), mixed.slice(0, 49), 2).verdict).toBe('HIGHER');
  });
});

describe('AWT and WT95 beside an arm', () => {
  let runs: readonly SimulationResult[] = [];
  beforeAll(async () => {
    const read = (file: string): unknown => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as unknown;
    const config = await loadConfig(DATA_DIR);
    const context = playContextFor({ config, campaign: read('campaign.json'), priceSchedule: read('price-schedule.json'), stageId: 'stage-1-first-call' });
    const sessions = new PlaySessions(context);
    runs = Array.from({ length: 50 }, (_, replication) => sessions.baseline(replication));
  });

  it('gives both means with intervals when every replication reports one', () => {
    const figures = waitFiguresOf(runs);
    expect(figures).toMatchObject({ replications: 50, refused: 0 });
    expect(figures.awt?.n).toBe(50);
    expect(figures.wt95?.mean).toBeGreaterThan(figures.awt?.mean ?? Number.POSITIVE_INFINITY);
  });

  it('withholds both when one replication refuses, and names the ground', () => {
    const refusing = runs.map((run, index) =>
      index === 0 ? { ...run, summary: { ...run.summary, awtIsValid: false, awtInvalidGround: 'empty-window' as const } } : run,
    );
    const figures = waitFiguresOf(refusing);
    expect(figures).toMatchObject({ refused: 1, refusedGrounds: ['empty-window'] });
    expect(figures.awt).toBeUndefined();
    expect(figures.wt95).toBeUndefined();
  });
});
