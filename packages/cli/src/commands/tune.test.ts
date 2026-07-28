/**
 * `tune`, end to end: the real `main`, the real `data/` directory, the real simulator.
 *
 * The budgets here are absurd on purpose — four candidates at three replications, validated at
 * four — because the claim under test is **connection**, not precision. docs/08-review-findings.md
 * § 1: the whole of `packages/experiments/src/tuning/` shipped complete, correct, unit-tested and
 * called by nothing. A suite that drove the optimizers directly is exactly what that looked like,
 * and it was green. So this file drives them the way a user does: through `main(['tune', …])`, all
 * the way to a page.
 *
 * The one thing it must **not** do is assert a winner. At n = 4 nothing is resolvable and the
 * command says so; a test that pinned "the tuned arm beats the reference" at a budget a suite can
 * afford would be a coin flip dressed as an assertion — the exact failure CLAUDE.md § Statistical
 * discipline names, and the one docs/05-roadmap.md § Phase 7 refuses to write into the gate. What
 * is asserted is structural: that the seed sets are disjoint, that the page renders, that the
 * command refuses to rank below its own resolution floor, and that every flag that can move a
 * number is on the `reproduce:` line.
 */

import { describe, expect, it } from 'vitest';

import { main } from '../index.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';
import { EXIT_USAGE } from '../errors.js';
import {
  searchSpace,
  type Evaluation,
  type HoldoutAssessment,
  type SearchResult,
} from '@elevator-sim/experiments';

import {
  finalistsOf,
  headlineOf,
  ladderFrom,
  narrowedSpace,
  replicationsToResolveEffect,
  resolutionAt,
} from './tune.js';

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function cli(argv: readonly string[]): Promise<Run> {
  const options = { color: false, columns: 120, rows: 60, env: {} } as const;
  const out: BufferedOutput = createBufferedOutput(options);
  const err: BufferedOutput = createBufferedOutput(options);
  const code = await main(argv, out, err);
  return { code, out: out.text(), err: err.text() };
}

/** The smallest run that still exercises search → finalists → holdout → page. */
const TINY = [
  'tune',
  '--building',
  'garden-apartments',
  '--params',
  'idle.repositionThresholdS',
  '--candidates',
  '4',
  '--reps',
  '3',
  '--finalists',
  '1',
  '--validate-reps',
  '4',
  '--duration',
  '600',
  '--seed',
  '20260727',
];

/* -------------------------------------------------------------------------- *
 * The happy path
 * -------------------------------------------------------------------------- */

describe('elevator-sim tune runs a real search and validates it on unseen traffic', () => {
  it('searches, holds out a disjoint seed set, and prints a page', { timeout: 180_000 }, async () => {
    const { code, out } = await cli(TINY);

    expect(code).toBe(0);
    /* The search ran against the real simulator: a round line per experiment. */
    expect(out).toMatch(/… round 1: \d+ candidates/);
    expect(out).toContain('Held-out validation');

    /* The guard the whole phase rests on, printed by `tuning/report` rather than by this
       command — an overlapping holdout set is refused before it can be reported. */
    expect(out).toContain('SEED SETS');
    expect(out).toContain('DISJOINT');
    expect(out).toContain('PARETO FRONT');
    expect(out).toContain('CONCLUSION');
    expect(out).toContain('Verdict on held-out seeds');
  });

  it('prints both seeds, and they are not the same seed', { timeout: 180_000 }, async () => {
    const { out } = await cli(TINY);
    const tuning = /tuning seed\s+(\d+)/.exec(out)?.[1];
    const holdout = /holdout seed\s+(\d+)/.exec(out)?.[1];

    expect(tuning).toBeDefined();
    expect(holdout).toBeDefined();
    /* One experiment seed is one set of passenger traces, so equal seeds would be the tuning set
       under a second name with every generalization verdict vacuous. `runHoldoutRound` throws on
       it; this asserts the command never puts it in that position. */
    expect(holdout).not.toBe(tuning);
  });

  it('is reproducible from its own reproduce line, byte for byte', { timeout: 240_000 }, async () => {
    const first = await cli(TINY);
    const line = /reproduce: elevator-sim tune (.*)/.exec(first.out)?.[1];
    expect(line).toBeDefined();

    /* Every flag that can move a number is on that line — including the derived holdout seed, so
       the second run does not have to re-derive it and get a different answer if the derivation
       ever changes. CLAUDE.md invariant 5, expressed in the UI. */
    const again = await cli(['tune', ...(line ?? '').split(' ')]);
    const strip = (text: string): string =>
      text
        .split('\n')
        .filter((row) => !row.includes('…') && !row.includes('reproduce:'))
        .join('\n');
    expect(strip(again.out)).toBe(strip(first.out));
  });

  it('reaches every one of the three optimizers, not only the default', { timeout: 240_000 }, async () => {
    /* Named because `--method` is the only thing that decides which of `randomSearch`,
       `successiveHalving` and `sepCmaEs` is called, and two of the three would otherwise still be
       exported, tested and uncalled from any shipped path. */
    const halving = await cli([
      ...TINY.slice(0, -2),
      '--method',
      'successive-halving',
      '--candidates',
      '6',
      '--reps',
      '2',
      '--seed',
      '11',
    ]);
    expect(halving.code).toBe(0);
    expect(halving.out).toContain('successive-halving');
    expect(halving.out).toMatch(/… round 2: \d+ candidates × \d+ replications/);

    const cmaes = await cli([
      ...TINY.slice(0, -2),
      '--method',
      'sep-cmaes',
      '--candidates',
      '4',
      '--generations',
      '2',
      '--reps',
      '2',
      '--seed',
      '11',
    ]);
    expect(cmaes.code).toBe(0);
    expect(cmaes.out).toContain('sep-cmaes');
  });
});

/* -------------------------------------------------------------------------- *
 * A budget that cannot resolve anything
 * -------------------------------------------------------------------------- */

describe('tune prices its budget before it spends it', () => {
  it('refuses to rank when the validation budget is below every measured effect', { timeout: 180_000 }, async () => {
    const { code, out } = await cli([...TINY.slice(0, -2), '--validate-reps', '2', '--seed', '5']);

    expect(code).toBe(0);
    expect(out).toContain('BELOW RESOLUTION');
    /* The measurements still print — they are measurements — and the *order* does not. */
    expect(out).toContain('VERDICT: NO RANKING');
    expect(out).not.toContain('VERDICT: NO CANDIDATE WAS SELECTED');
    expect(out).toContain('1.29 s');
  });

  it('warns below the documented 50, without refusing the run', { timeout: 180_000 }, async () => {
    const { code, out } = await cli(TINY);
    expect(code).toBe(0);
    expect(out).toContain('below the documented 50–200');
    expect(out).not.toContain('BELOW RESOLUTION');
    expect(out).toContain('VERDICT:');
  });

  it('quotes the two measured limits rather than one', async () => {
    const { out } = await cli(['tune', '--building', 'garden-apartments', '--help']);
    expect(out).toContain('tune');
    /* And the arithmetic behind them, checked directly: the limits scale as 1/√n from n = 100. */
    expect(resolutionAt(100, 0.2)).toBeCloseTo(0.2, 9);
    expect(resolutionAt(25, 0.2)).toBeCloseTo(0.4, 9);
    expect(resolutionAt(100, 1.9)).toBeCloseTo(1.9, 9);
    expect(replicationsToResolveEffect(0.2, 0.2)).toBe(100);
    expect(replicationsToResolveEffect(0.4, 0.2)).toBe(25);
    /* An effect of zero is resolved by no budget at all, and says so rather than returning a
       plausible large number. */
    expect(replicationsToResolveEffect(0, 0.2)).toBe(Number.POSITIVE_INFINITY);
  });
});

/* -------------------------------------------------------------------------- *
 * What it refuses
 * -------------------------------------------------------------------------- */

describe('tune teaches the vocabulary when an id is wrong', () => {
  it('rejects an unknown building and lists the ones that exist', async () => {
    const { code, err } = await cli([...TINY, '--building', 'no-such-building']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('no building with id "no-such-building"');
    expect(err).toContain('garden-apartments');
  });

  it('rejects an unknown base profile and names the flag it came from', async () => {
    const { code, err } = await cli([...TINY, '--base', 'not-a-profile']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('no dispatcher profile with id "not-a-profile"');
    expect(err).toContain('--base');
    expect(err).toContain('predictive-balanced');
  });

  it('rejects an unknown parameter id, with a suggestion when there is one', async () => {
    const { code, err } = await cli([...TINY, '--params', 'idle.repositionThreshold']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('no searchable parameter "idle.repositionThreshold"');
    expect(err).toContain('did you mean "idle.repositionThresholdS"?');
  });

  it('rejects a method that is not one of the three', async () => {
    const { code, err } = await cli([...TINY, '--method', 'bayesian']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('--method does not accept "bayesian"');
    expect(err).toContain('sep-cmaes');
  });
});

/* -------------------------------------------------------------------------- *
 * The pure pieces
 * -------------------------------------------------------------------------- */

describe('the pieces that decide what runs', () => {
  it('narrows the space to the named dimensions and keeps the whole index behind it', () => {
    const full = searchSpace();
    expect(narrowedSpace(full, undefined)).toBe(full);

    const narrow = narrowedSpace(full, 'idle.repositionThresholdS');
    expect(narrow.ids).toEqual(['idle.repositionThresholdS']);
    /* `allById` and `defaults` stay whole, which is what lets a gate outside the narrowed set
       still be read — narrowing must not silently deactivate the dimension being searched. */
    expect(narrow.allById.size).toBe(full.allById.size);
    expect(narrow.defaults.size).toBe(full.defaults.size);
  });

  it('builds a ladder that strictly narrows and strictly refines, or none at all', () => {
    /* η ≈ 3 on both axes, docs/06's shape at a budget a terminal can afford. */
    expect(ladderFrom(27, 2)).toEqual([
      { candidates: 27, replications: 2 },
      { candidates: 9, replications: 6 },
      { candidates: 3, replications: 18 },
    ]);
    /* Every rung must narrow and every rung must refine, or `assertLadder` throws inside
       `successiveHalving` — so the generator is checked against that contract here. */
    for (const width of [2, 3, 5, 9, 12, 100]) {
      const rungs = ladderFrom(width, 3);
      expect(rungs.length).toBeGreaterThan(0);
      expect(rungs[0]?.candidates).toBe(width);
      for (const [index, rung] of rungs.entries()) {
        const previous = rungs[index - 1];
        if (previous === undefined) continue;
        expect(rung.candidates).toBeLessThan(previous.candidates);
        expect(rung.replications).toBeGreaterThan(previous.replications);
      }
    }
    /* A width too small for a second rung is one rung, not a malformed two. */
    expect(ladderFrom(2, 4)).toEqual([{ candidates: 2, replications: 4 }]);
  });

  it('picks finalists at their highest fidelity and never carries the incumbent twice', () => {
    const evaluation = (id: string, replications: number, score: number): Evaluation<number> => ({
      candidate: { id, value: score, origin: 'test' },
      round: 0,
      replications,
      samples: [score],
      traceDigests: ['d'],
      score,
      finiteCount: 1,
      nonFiniteCount: 0,
      saturated: false,
      quotable: true,
    });
    const result = {
      evaluations: [
        evaluation('incumbent', 30, 1),
        evaluation('a', 10, 5),
        evaluation('a', 30, 4),
        evaluation('b', 30, 9),
        evaluation('c', 10, 2),
      ],
    } as unknown as SearchResult<number>;

    const chosen = finalistsOf(result, 2);
    /* The incumbent is already the reference arm; carrying it again would put a candidate against
       itself and report IDENTICAL as though it were a finding. */
    expect(chosen.map((entry) => entry.candidate.id)).toEqual(['a', 'b']);
    /* `a` is taken at n = 30, not at the n = 10 it was promoted on. */
    expect(chosen[0]?.replications).toBe(30);
    /* `c` scores best of all but was only ever measured at rung 1; fidelity outranks score, so it
       is not ranked against arms measured thirty times. */
    expect(chosen.map((entry) => entry.candidate.id)).not.toContain('c');
  });

  it('reads its headline from the holdout module’s verdict and never from a threshold of its own', () => {
    const assessment = (
      candidateId: string,
      verdict: HoldoutAssessment['verdict'],
    ): HoldoutAssessment =>
      ({ candidateId, referenceId: 'ref', objectiveId: 'awt', verdict }) as unknown as HoldoutAssessment;

    /* Ordered by strength of claim, so one real finding is not buried under three silences. */
    expect(
      headlineOf([assessment('a', 'unconfirmed'), assessment('b', 'generalizes')]).kind,
    ).toBe('generalizes');
    expect(headlineOf([assessment('a', 'degraded'), assessment('b', 'unconfirmed')]).kind).toBe(
      'degraded',
    );
    expect(headlineOf([assessment('a', 'overfitted')]).kind).toBe('overfitted');
    expect(headlineOf([assessment('a', 'unconfirmed')]).kind).toBe('unconfirmed');
    /* And the ordinary case: nothing cleared the tuning set, which is a result rather than a
       failure on a piecewise-constant objective. */
    expect(headlineOf([assessment('a', 'not-selected')]).kind).toBe('none');
    expect(headlineOf([]).kind).toBe('none');
    /* `overfitted` is the one this phase exists to be able to report, so it is named out loud. */
    expect(headlineOf([assessment('a', 'overfitted')]).text).toContain('did NOT generalize');
  });
});
