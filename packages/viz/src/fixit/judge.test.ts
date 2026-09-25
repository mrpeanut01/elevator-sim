/**
 * The fix-it judge, driven — [§ D1020](../../../../DECISIONS.md), GitHub issue #602.
 *
 * Three guards the ruling names, each with its own reason to exist:
 *
 * 1. **The mornings are derived and not authored.** A case file that could name its replication
 *    seeds could name the ones its answer clears on. So the seeds are a function of the case seed
 *    alone, and no field of the shipped `data/fixit-cases.json` carries one — checked against the
 *    file's own text rather than its parsed shape, so a field the parser silently drops is caught
 *    too.
 * 2. **A failing press asks for one pair; a clearing press asks for one pair plus forty-nine.**
 *    That is the structural half of the cost the judge's docstring states, counted with fake
 *    runners rather than timed, so it holds on any machine.
 * 3. **The verdict is the interval, and the interval is the repository's** — the same
 *    `pairedDifferenceEstimate` `experiments` publishes with, asserted here against hand-computed
 *    arithmetic so a change to either side is seen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SimulationConfig } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';

import { BASIS_LINE, DEMAND_BASIS_LINE, fixedBadgeAfter, type FixitOutcome, type FixitRow } from './engine.js';
import {
  checkingOutcomeOf,
  createFixitJudge,
  FIXIT_MORNINGS,
  judgedOutcomeOf,
  judgeReplication,
  JUDGE_COPY,
  MORNING_SEED_STEP,
  morningConfigsOf,
  pressThroughTheJudge,
  REPLICATED_BASIS_LINE,
  REPLICATED_DEMAND_BASIS_LINE,
  replicationSeedsOf,
  type MorningAsk,
  type MorningRunner,
  type PairRunner,
} from './judge.js';
import type { FixitRunPlan, MorningReading } from './run.js';
import type { FixitCase } from './types.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

const CASE: FixitCase = {
  id: 'judge-case',
  name: 'The judge case',
  buildingId: 'tower',
  dispatcherProfileId: 'order',
  run: { seed: '20260815', durationS: 900, arrivalRatePctPop5min: null },
  asBuilt: { note: 'As it stands.', patch: {} },
  complaint: {
    text: 'The wait is long.',
    complainer: 'tenant',
    measure: { kind: 'long-waits', label: 'waits over a minute', thresholdS: 60, scope: { mode: 'origin', floorIds: ['3'] } },
  },
  symptom: 'waits',
  figures: [],
  diagnosis: { text: 'Parked wrong.', reasoning: 'Measured.' },
  budgetUnits: 12,
  repairs: [],
  result: { head: 'Fixed head.', body: 'Fixed body.' },
};

const ROW: FixitRow = { label: 'row', before: 'b', after: 'a', verdict: 'v', passed: true };
const GATE_FIXED: FixitOutcome = { kind: 'fixed', head: 'Fixed head.', body: 'Fixed body.', rows: [ROW, ROW, ROW], basis: BASIS_LINE };
const GATE_MISSED: FixitOutcome = { ...GATE_FIXED, kind: 'not-enough', head: 'No change.' };

const reading = (complaint: number | null, rest: number | null = 90): MorningReading => ({
  complaint,
  restAwayPct: rest,
  restBoarded: rest === null ? 0 : 100,
});

describe('the mornings are derived from the case seed, and no author can name one', () => {
  it('derives forty-nine distinct mornings at seed + i × 7919, i = 1 … 49', () => {
    const seeds = replicationSeedsOf(CASE);
    expect(FIXIT_MORNINGS).toBe(50);
    expect(seeds).toHaveLength(FIXIT_MORNINGS - 1);
    expect(MORNING_SEED_STEP).toBe(7919n);
    expect(seeds[0]).toBe(20260815n + 7919n);
    expect(seeds.at(-1)).toBe(20260815n + 49n * 7919n);
    expect(new Set(seeds.map(String)).size).toBe(seeds.length);
    expect(seeds).not.toContain(BigInt(CASE.run.seed));
    /* A function of the seed and nothing else: two cases on one seed share their mornings. */
    expect(replicationSeedsOf({ run: { ...CASE.run, durationS: 60 } })).toEqual(seeds);
  });

  it('changes only the seed of each morning’s config', () => {
    const config = { seed: 1n, durationS: 900, onTimeout: 'report' } as unknown as SimulationConfig;
    const configs = morningConfigsOf(config, [5n, 6n]);
    expect(configs.map((c) => c.seed)).toEqual([5n, 6n]);
    expect(configs.map((c) => ({ ...c, seed: 1n }))).toEqual([config, config]);
  });

  it('is not authored anywhere in the shipped case file', () => {
    const text = readFileSync(join(REPO_ROOT, 'data', 'fixit-cases.json'), 'utf8');
    const file = JSON.parse(text) as { cases: { id: string; run: Record<string, unknown> }[] };
    /* Every case's run carries the three fields it always has, and nothing that could be a morning. */
    for (const entry of file.cases) {
      expect(Object.keys(entry.run).sort(), entry.id).toEqual(['arrivalRatePctPop5min', 'durationS', 'seed']);
    }
    expect(text).not.toMatch(/"(?:mornings|replicationSeeds|replications|seeds|morningSeeds)"\s*:/);
    /* And no derived morning's seed is written into the file as a literal. */
    for (const entry of file.cases) {
      for (const seed of replicationSeedsOf(entry as unknown as FixitCase)) {
        expect(text.includes(`"${String(seed)}"`), `${entry.id}: morning ${String(seed)} is authored`).toBe(false);
      }
    }
  });
});

describe('the verdict over fifty mornings is a two-sided 95 % paired-t interval', () => {
  it('matches the interval arithmetic by hand', () => {
    /* Reductions 1, 2, 3 → mean 2, sd 1, se 1/√3, t(2, .975) = 4.302653. */
    const replication = judgeReplication([reading(4), reading(5), reading(6)], [reading(3), reading(3), reading(3)]);
    expect(replication.reduction.n).toBe(3);
    expect(replication.reduction.mean).toBeCloseTo(2, 12);
    expect(replication.reduction.lower).toBeCloseTo(2 - 4.302653 / Math.sqrt(3), 5);
    expect(replication.reduction.upper).toBeCloseTo(2 + 4.302653 / Math.sqrt(3), 5);
    expect(replication.complaintBeforeTotal).toBe(15);
    expect(replication.complaintAfterTotal).toBe(9);
    /* Lower bound 2 − 2.484 < 0: the interval includes no change, so it does not hold. */
    expect(replication.complaintHolds).toBe(false);
  });

  it('holds only when the lower bound is above zero and the rest is not shown worse than the floor', () => {
    const before = Array.from({ length: 50 }, (_, i) => reading(5 + (i % 3), 90));
    const after = Array.from({ length: 50 }, (_, i) => reading(i % 2, 90));
    expect(judgeReplication(before, after).holds).toBe(true);

    /* A rest that is worse by about five points every morning is shown worse than the floor. */
    const worse = after.map((m, i) => ({ ...m, restAwayPct: 85 - (i % 2) }));
    const judged = judgeReplication(before, worse);
    expect(judged.complaintHolds).toBe(true);
    expect(judged.restHolds).toBe(false);
    expect(judged.holds).toBe(false);

    /* A rest one point down on average cannot be shown worse than two: it holds. */
    const slight = after.map((m, i) => ({ ...m, restAwayPct: 89 + (i % 2) - 0.5 }));
    expect(judgeReplication(before, slight).restHolds).toBe(true);

    /* No change at all is never fixed, whatever the gate said. */
    expect(judgeReplication(before, before).holds).toBe(false);
  });

  it('leaves out a morning whose complaint cannot be read, and says how many it kept', () => {
    const before = [reading(10), reading(null), reading(10), reading(10)];
    const after = [reading(1), reading(2), reading(null), reading(2)];
    const replication = judgeReplication(before, after);
    expect(replication.reduction.n).toBe(2);
    expect(replication.complaintBeforeTotal).toBe(20);
  });

  it('refuses mornings that are not pairs', () => {
    expect(() => judgeReplication([reading(1)], [reading(1), reading(2)])).toThrow(/one pair a morning/);
  });
});

describe('the outcomes the judge adds', () => {
  const holds = judgeReplication(
    Array.from({ length: 50 }, () => reading(6)),
    Array.from({ length: 50 }, (_, i) => reading(i % 2)),
  );
  const fails = judgeReplication(
    Array.from({ length: 50 }, (_, i) => reading(i % 3)),
    Array.from({ length: 50 }, (_, i) => reading((i + 1) % 3)),
  );

  it('draws a checking state that wears no badge, and leaves a missed gate alone', () => {
    const checking = checkingOutcomeOf(GATE_FIXED);
    expect(checking.kind).toBe('checking');
    expect(checking.head).toBe(JUDGE_COPY.checkingHead);
    expect(fixedBadgeAfter(checking)).toBe(false);
    expect(checking.rows).toBe(GATE_FIXED.rows);
    expect(checkingOutcomeOf(GATE_MISSED)).toBe(GATE_MISSED);
  });

  it('keeps the gate’s own narration on a verdict that held, with a fourth row and the replicated basis', () => {
    const judged = judgedOutcomeOf(CASE, GATE_FIXED, holds);
    expect(judged.kind).toBe('fixed');
    expect(fixedBadgeAfter(judged)).toBe(true);
    expect(judged.head).toBe(GATE_FIXED.head);
    expect(judged.rows).toHaveLength(4);
    expect(judged.rows[3]?.passed).toBe(true);
    expect(judged.rows[3]?.before).toBe('300 waits over 50 mornings');
    expect(judged.basis).toBe(REPLICATED_BASIS_LINE);
    expect(judged.basis).not.toBe(BASIS_LINE);
  });

  /**
   * The post-AI panel's seat C, D2 and seat D, D8: *"downstairs never noticed"* printed above the
   * card's own fifty-morning row reading *−2.1 points a morning (−3.2 to −1.0)*. The authored line
   * about the rest of the building now prints only where the fifty mornings agree with it.
   */
  it('prints an authored rest line only where the rest’s fifty-morning interval contains zero', () => {
    const REST = 'Downstairs never noticed.';
    const authored: FixitCase = { ...CASE, result: { ...CASE.result, rest: REST } };
    const diagnosed: FixitOutcome = { ...GATE_FIXED, attribution: 'diagnosis' };
    const before = Array.from({ length: 50 }, () => reading(6, 90));
    /* The rest down a point or so every morning: an interval that excludes zero, inside the floor. */
    const declined = judgeReplication(before, Array.from({ length: 50 }, (_, i) => reading(i % 2, 89 - (i % 2) * 0.5)));
    expect(declined.holds).toBe(true);
    expect(declined.rest?.upper).toBeLessThan(0);
    const noticed = judgedOutcomeOf(authored, diagnosed, declined);
    expect(noticed.body).not.toContain(REST);
    expect(noticed.body).toContain('The rest of the building did notice');
    expect(noticed.body).toContain('over 50 mornings');
    expect(noticed.body.startsWith(CASE.result.body)).toBe(true);
    /* The rest moving both ways around zero: the authored line is licensed, and prints. */
    const mixed = judgeReplication(before, Array.from({ length: 50 }, (_, i) => reading(i % 2, 89 + (i % 2) * 2)));
    expect(mixed.rest?.lower).toBeLessThanOrEqual(0);
    expect(mixed.rest?.upper).toBeGreaterThanOrEqual(0);
    expect(judgedOutcomeOf(authored, diagnosed, mixed).body).toBe(`${CASE.result.body} ${REST}`);
    /* The composed arm never reads the authored line at all. */
    expect(judgedOutcomeOf(authored, { ...GATE_FIXED, attribution: 'order' }, declined).body).toBe(GATE_FIXED.body);
  });

  it('refuses a result body that says the rest did not notice — that claim belongs in `rest`', () => {
    const text = readFileSync(join(REPO_ROOT, 'data', 'fixit-cases.json'), 'utf8');
    const file = JSON.parse(text) as { cases: { id: string; result: { head: string; body: string } }[] };
    for (const entry of file.cases) {
      expect(entry.result.body, entry.id).not.toMatch(/\bnotic(?:e|ed|es|ing)\b/iu);
      expect(entry.result.head, entry.id).not.toMatch(/\bnotic(?:e|ed|es|ing)\b/iu);
    }
  });

  it('gives an order that changed the crowd the demand form of the replicated basis', () => {
    expect(judgedOutcomeOf(CASE, { ...GATE_FIXED, basis: DEMAND_BASIS_LINE }, holds).basis).toBe(
      REPLICATED_DEMAND_BASIS_LINE,
    );
  });

  it('makes a clear that did not hold cleared-once: no badge, and it says it cleared on this morning only', () => {
    const judged = judgedOutcomeOf(CASE, GATE_FIXED, fails);
    expect(judged.kind).toBe('cleared-once');
    expect(fixedBadgeAfter(judged)).toBe(false);
    expect(judged.head).toBe(JUDGE_COPY.clearedOnceHead);
    expect(judged.body).toContain('cleared on this morning only');
    expect(judged.body).toContain('cannot be told from no change');
    expect(judged.body).not.toContain(CASE.result.body);
    expect(judged.rows[3]?.passed).toBe(false);
  });

  it('never grants a clear the gate refused', () => {
    expect(judgedOutcomeOf(CASE, GATE_MISSED, holds)).toBe(GATE_MISSED);
  });
});

/* -------------------------------------------------------------------------- *
 * The press, counted with fake runners
 * -------------------------------------------------------------------------- */

const PLAN: FixitRunPlan = {
  asBuilt: { seed: 20260815n, durationS: 900, label: 'as-built' } as unknown as SimulationConfig,
  asRepaired: { seed: 20260815n, durationS: 900, label: 'repaired' } as unknown as SimulationConfig,
};
const SWITCHES = { outOfServiceCarIds: [] as readonly string[], recordDecisions: false };

interface Counted {
  pairAsks: number;
  pairRuns: number;
  morningAsks: MorningAsk[];
}

function fakes(): { counted: Counted; pair: PairRunner; mornings: MorningRunner; answerMornings: () => void } {
  const counted: Counted = { pairAsks: 0, pairRuns: 0, morningAsks: [] };
  const pair: PairRunner = {
    start(ask) {
      counted.pairAsks += 1;
      counted.pairRuns += ask.runs.length;
      ask.onDone(ask.runs.map(() => ({ legs: [] }) as unknown as VizRecording));
    },
  };
  let pending: MorningAsk | undefined;
  const mornings: MorningRunner = {
    start(ask) {
      counted.morningAsks.push(ask);
      pending = ask;
    },
    cancel() {
      pending = undefined;
    },
    isRunning: () => pending !== undefined,
  };
  const answerMornings = (): void => {
    const ask = pending;
    pending = undefined;
    ask?.onDone(ask.configs.map((config) => reading((config as unknown as { label: string }).label === 'as-built' ? 6 : 0)));
  };
  return { counted, pair, mornings, answerMornings };
}

function press(gate: FixitOutcome, harness: ReturnType<typeof fakes>, judge = createFixitJudge(harness.mornings)) {
  const drawn: FixitOutcome[] = [];
  pressThroughTheJudge({
    entry: CASE,
    plan: PLAN,
    switches: SWITCHES,
    pairRunner: harness.pair,
    judge,
    readingOf: () => reading(6),
    classify: (_before, _after, done) => done(gate),
    onGate: (outcome) => drawn.push(outcome),
    onVerdict: (outcome) => drawn.push(outcome),
    onFailed: (message) => {
      throw new Error(message);
    },
  });
  return { drawn, judge };
}

describe('a press asks for what its gate earned, and no more', () => {
  it('asks for one pair and nothing else when the letter’s morning does not clear', () => {
    const harness = fakes();
    const { drawn } = press(GATE_MISSED, harness);
    expect(harness.counted.pairAsks).toBe(1);
    expect(harness.counted.pairRuns).toBe(2);
    expect(harness.counted.morningAsks).toHaveLength(0);
    expect(drawn.map((o) => o.kind)).toEqual(['not-enough']);
  });

  it('asks for one pair plus forty-nine after-runs when the case’s own mornings are held', () => {
    const harness = fakes();
    const judge = createFixitJudge(harness.mornings);
    judge.prepare(CASE, PLAN.asBuilt);
    expect(harness.counted.morningAsks).toHaveLength(1);
    expect(harness.counted.morningAsks[0]?.configs).toHaveLength(49);
    harness.answerMornings();
    expect(judge.prepared(CASE)).toBe(true);

    const { drawn } = press(GATE_FIXED, harness, judge);
    expect(harness.counted.pairAsks).toBe(1);
    expect(harness.counted.pairRuns).toBe(2);
    expect(harness.counted.morningAsks).toHaveLength(2);
    const afterAsk = harness.counted.morningAsks[1]!;
    expect(afterAsk.configs).toHaveLength(49);
    expect(afterAsk.configs.every((c) => (c as unknown as { label: string }).label === 'repaired')).toBe(true);
    expect(afterAsk.configs.map((c) => c.seed)).toEqual(replicationSeedsOf(CASE));
    expect(drawn.map((o) => o.kind)).toEqual(['checking']);
    harness.answerMornings();
    expect(drawn.map((o) => o.kind)).toEqual(['checking', 'fixed']);
  });

  it('asks for both sides’ forty-nine in one ask when the case’s mornings were never prepared', () => {
    const harness = fakes();
    const { drawn } = press(GATE_FIXED, harness);
    expect(harness.counted.pairRuns).toBe(2);
    expect(harness.counted.morningAsks).toHaveLength(1);
    expect(harness.counted.morningAsks[0]?.configs).toHaveLength(98);
    harness.answerMornings();
    expect(drawn.map((o) => o.kind)).toEqual(['checking', 'fixed']);
  });

  it('waits on a prepare already in flight rather than asking for the as-built mornings twice', () => {
    const harness = fakes();
    const judge = createFixitJudge(harness.mornings);
    judge.prepare(CASE, PLAN.asBuilt);
    const { drawn } = press(GATE_FIXED, harness, judge);
    expect(harness.counted.morningAsks).toHaveLength(1);
    expect(judge.replicating()).toBe(true);
    harness.answerMornings();
    expect(harness.counted.morningAsks).toHaveLength(2);
    expect(harness.counted.morningAsks[1]?.configs).toHaveLength(49);
    harness.answerMornings();
    expect(drawn.map((o) => o.kind)).toEqual(['checking', 'fixed']);
  });

  it('turns a classification that throws into a failed press rather than a press left running', () => {
    const harness = fakes();
    const failures: string[] = [];
    const drawn: FixitOutcome[] = [];
    pressThroughTheJudge({
      entry: CASE,
      plan: PLAN,
      switches: SWITCHES,
      pairRunner: harness.pair,
      judge: createFixitJudge(harness.mornings),
      readingOf: () => reading(6),
      classify: () => {
        throw new Error('the pair moved the crowd');
      },
      onGate: (outcome) => drawn.push(outcome),
      onVerdict: (outcome) => drawn.push(outcome),
      onFailed: (message) => failures.push(message),
    });
    expect(failures).toEqual(['the pair moved the crowd']);
    expect(drawn).toEqual([]);
    expect(harness.counted.morningAsks).toHaveLength(0);
  });

  it('never lets a prepare supersede a press’s replication', () => {
    const harness = fakes();
    const judge = createFixitJudge(harness.mornings);
    press(GATE_FIXED, harness, judge);
    judge.prepare(CASE, PLAN.asBuilt);
    judge.prepare({ ...CASE, id: 'another' }, PLAN.asBuilt);
    expect(harness.counted.morningAsks).toHaveLength(1);
  });
});
